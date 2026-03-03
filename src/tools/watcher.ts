/**
 * ToolWatcher — watches a directory for .py tool files and hot-reloads them.
 *
 * Mirrors the strands SDK's load_tools_from_directory behavior.
 * Watches for file creates, changes, and deletes in a tools directory.
 *
 * Each .py file is loaded via a subprocess that extracts tool metadata,
 * then registered as a FunctionTool backed by subprocess execution.
 */

import { existsSync, readdirSync, statSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { ToolRegistry } from './registry';
import { ToolHandler, FunctionTool } from './function-tool';

/**
 * Handler that executes a Python tool file in a subprocess.
 */
class PythonFileToolHandler extends ToolHandler {
  private readonly _filePath: string;
  private readonly _funcName: string;

  public constructor(filePath: string, funcName: string) {
    super();
    this._filePath = filePath;
    this._funcName = funcName;
  }

  public handle(inputJson: string): string {
    const scriptPath = join(tmpdir(), '_strands_tool_exec_' + process.pid + '.py');
    const script = `
import sys, json
sys.path.insert(0, "${join(this._filePath, '..').replace(/\\/g, '/')}")
import importlib.util
spec = importlib.util.spec_from_file_location("tool_mod", "${this._filePath.replace(/\\/g, '/')}")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
func = getattr(mod, "${this._funcName}")
params = json.loads(sys.argv[1])
result = func(**params)
if isinstance(result, str):
    try:
        json.loads(result)
        print(result)
    except:
        print(json.dumps({"result": result}))
else:
    print(json.dumps({"result": result}, default=str))
`;
    try {
      writeFileSync(scriptPath, script);
      const result = execSync(`python3 "${scriptPath}" '${inputJson.replace(/'/g, "'\\''")}'`, {
        encoding: 'utf-8',
        timeout: 300000,
        maxBuffer: 50 * 1024 * 1024,
      });
      return result.trim() || '{"result": null}';
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      return JSON.stringify({ error: err.message });
    } finally {
      try { unlinkSync(scriptPath); } catch { /* ignore */ }
    }
  }
}

/**
 * Metadata extracted from a Python tool file.
 */
interface ExtractedToolMeta {
  name: string;
  description: string;
  funcName: string;
  schema: object;
}

/**
 * Extract tool metadata from a .py file using subprocess introspection.
 */
function extractToolMeta(filePath: string): ExtractedToolMeta[] {
  const extractScript = `
import sys, json, inspect, typing
sys.path.insert(0, "${join(filePath, '..').replace(/\\/g, '/')}")
import importlib.util
spec = importlib.util.spec_from_file_location("tool_mod", "${filePath.replace(/\\/g, '/')}")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

TYPE_MAP = {str:"string",int:"number",float:"number",bool:"boolean",list:"array",dict:"object"}
tools = []
for name in dir(mod):
    obj = getattr(mod, name)
    if callable(obj) and hasattr(obj, 'tool_name'):
        tn = obj.tool_name
        ts = getattr(obj, 'tool_spec', {})
        desc = ts.get('description', '') or (obj.__doc__ or '').split('\\n')[0]
        schema = ts.get('inputSchema', {})
        if 'json' in schema: schema = schema['json']
        tools.append({"name": tn, "description": desc, "funcName": name, "schema": schema})
    elif callable(obj) and not name.startswith('_') and hasattr(obj, '__annotations__'):
        sig = inspect.signature(obj)
        hints = typing.get_type_hints(obj) if hasattr(obj, '__annotations__') else {}
        props, req = {}, []
        for pn, p in sig.parameters.items():
            if pn in ('self','cls','agent','kwargs','tool_use_id'): continue
            pt = hints.get(pn, str)
            jt = TYPE_MAP.get(pt, "string")
            props[pn] = {"type": jt, "description": pn}
            if p.default is inspect.Parameter.empty: req.append(pn)
        schema = {"type":"object","properties":props}
        if req: schema["required"] = req
        desc = (obj.__doc__ or '').strip().split('\\n')[0] or ("Tool: " + name)
        tools.append({"name": name, "description": desc, "funcName": name, "schema": schema})

print(json.dumps(tools))
`;
  try {
    const result = execSync(`python3 -c '${extractScript.replace(/'/g, "'\\''")}'`, {
      encoding: 'utf-8',
      timeout: 30000,
    });
    return JSON.parse(result.trim());
  } catch {
    return [];
  }
}

/**
 * Configuration for the tool watcher.
 */
export interface ToolWatcherOptions {
  /** Directory to watch. Default: "./tools" */
  readonly directory?: string;
  /** Poll interval in milliseconds. Default: 2000 */
  readonly pollIntervalMs?: number;
}

/**
 * Watches a directory for Python tool files and auto-loads them into the registry.
 *
 * @example
 *
 * const watcher = new ToolWatcher(registry, { directory: "./tools" });
 * watcher.start();
 * // Drop calc.py into ./tools/ → auto-loaded
 * watcher.stop();
 */
export class ToolWatcher {
  private readonly _registry: ToolRegistry;
  private readonly _directory: string;
  private readonly _pollIntervalMs: number;
  private _timer: ReturnType<typeof setInterval> | undefined;
  private _fileStamps: Map<string, number>;
  private _fileToolNames: Map<string, string[]>;
  private _running: boolean;

  public constructor(registry: ToolRegistry, options?: ToolWatcherOptions) {
    this._registry = registry;
    this._directory = options?.directory ?? './tools';
    this._pollIntervalMs = options?.pollIntervalMs ?? 2000;
    this._fileStamps = new Map();
    this._fileToolNames = new Map();
    this._running = false;
  }

  /** Start watching. Does an initial scan immediately. */
  public start(): void {
    if (this._running) return;
    this._running = true;
    this._scan(); // initial load
    this._timer = setInterval(() => this._scan(), this._pollIntervalMs);
  }

  /** Stop watching. */
  public stop(): void {
    this._running = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
  }

  /** Whether the watcher is running. */
  public get running(): boolean { return this._running; }

  /** The directory being watched. */
  public get directory(): string { return this._directory; }

  /** Manually trigger a scan. */
  public scan(): void { this._scan(); }

  private _scan(): void {
    if (!existsSync(this._directory)) return;

    const currentFiles = new Set<string>();

    // Scan .py files
    for (const file of readdirSync(this._directory)) {
      if (!file.endsWith('.py') || file.startsWith('_')) continue;

      const filePath = join(this._directory, file);
      const stat = statSync(filePath);
      const mtime = stat.mtimeMs;
      currentFiles.add(file);

      const prevMtime = this._fileStamps.get(file);

      if (prevMtime === undefined || mtime > prevMtime) {
        // New or modified file — load/reload
        this._loadToolFile(filePath);
        this._fileStamps.set(file, mtime);
      }
    }

    // Check for deleted files
    for (const [file] of this._fileStamps) {
      if (!currentFiles.has(file)) {
        // File was deleted — remove all tools that came from it
        const toolNames = this._fileToolNames.get(file) ?? [];
        for (const toolName of toolNames) {
          this._registry.remove(toolName);
        }
        this._fileToolNames.delete(file);
        this._fileStamps.delete(file);
      }
    }
  }

  private _loadToolFile(filePath: string): void {
    const fileName = filePath.split('/').pop() ?? filePath;
    // Remove old tools from this file before reloading
    const oldNames = this._fileToolNames.get(fileName) ?? [];
    for (const name of oldNames) this._registry.remove(name);

    const metas = extractToolMeta(filePath);
    const newNames: string[] = [];
    for (const meta of metas) {
      const handler = new PythonFileToolHandler(filePath, meta.funcName);
      const tool = new FunctionTool(meta.name, meta.description, JSON.stringify(meta.schema), handler);
      this._registry.add(tool);
      newNames.push(meta.name);
    }
    this._fileToolNames.set(fileName, newNames);
  }
}
