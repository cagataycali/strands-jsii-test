/**
 * Runtime tool registry — add, remove, reload tools without restart.
 */
import { ToolDefinition } from './definition';

export class ToolRegistry {
  private readonly _tools: Map<string, ToolDefinition>;
  public constructor() { this._tools = new Map(); }

  public static fromTools(tools: ToolDefinition[]): ToolRegistry {
    const r = new ToolRegistry();
    for (const t of tools) r.add(t);
    return r;
  }
  public add(tool: ToolDefinition): void { this._tools.set(tool.spec.name, tool); }
  public remove(name: string): boolean { return this._tools.delete(name); }
  public get(name: string): ToolDefinition | undefined { return this._tools.get(name); }
  public has(name: string): boolean { return this._tools.has(name); }
  public allTools(): ToolDefinition[] { return Array.from(this._tools.values()); }
  public listNames(): string { return JSON.stringify(Array.from(this._tools.keys())); }
  public get size(): number { return this._tools.size; }
  public clear(): void { this._tools.clear(); }
  public addAll(tools: ToolDefinition[]): void { for (const t of tools) this.add(t); }
}
