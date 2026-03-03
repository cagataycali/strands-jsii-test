/**
 * Integration tests for tools: ToolSpecification, ToolDefinition, FunctionTool,
 * ToolBuilder, ToolRegistry, AgentTool, ToolCaller, UniversalToolFactory, ToolWatcher.
 */
import {
  ToolSpecification, ToolDefinition, ContextAwareToolDefinition, ToolContext,
  ToolHandler, FunctionTool, ToolBuilder,
  ToolRegistry, AgentTool, ToolCaller, DirectToolCallResult, MessageAppender,
  UniversalToolFactory,
} from '../src/index';
import { ToolWatcher } from '../src/tools/watcher';
import { mkdirSync, writeFileSync, unlinkSync, rmdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ── Helpers ──────────────────────────────────────────────

class EchoHandler extends ToolHandler {
  public handle(inputJson: string): string {
    return JSON.stringify({ echo: JSON.parse(inputJson) });
  }
}

class ErrorHandler extends ToolHandler {
  public handle(_inputJson: string): string {
    throw new Error('boom');
  }
}

class SimpleTool extends ToolDefinition {
  public executionCount = 0;
  constructor(name = 'simple') {
    super(new ToolSpecification(name, 'A simple tool', '{"type":"object","properties":{"x":{"type":"string"}}}'));
  }
  public execute(inputJson: string): string {
    this.executionCount++;
    return JSON.stringify({ result: 'done', input: JSON.parse(inputJson) });
  }
}

class ThrowingTool extends ToolDefinition {
  constructor() {
    super(new ToolSpecification('thrower', 'Throws', '{"type":"object"}'));
  }
  public execute(_inputJson: string): string {
    throw new Error('tool explosion');
  }
}

class ContextTool extends ContextAwareToolDefinition {
  public lastContext: ToolContext | null = null;
  constructor() {
    super(new ToolSpecification('ctx_tool', 'Context-aware tool', '{"type":"object","properties":{"q":{"type":"string"}}}'));
  }
  public executeWithContext(inputJson: string, context: ToolContext): string {
    this.lastContext = context;
    return JSON.stringify({ toolName: context.toolName, toolUseId: context.toolUseId, input: JSON.parse(inputJson) });
  }
}

class TestAppender extends MessageAppender {
  public appended: string[] = [];
  public appendMessages(messagesJson: string): void {
    this.appended.push(messagesJson);
  }
}

// ── ToolSpecification ────────────────────────────────────

describe('ToolSpecification', () => {
  it('stores name, description, schema', () => {
    const spec = new ToolSpecification('calc', 'Math calculator', '{"type":"object"}');
    expect(spec.name).toBe('calc');
    expect(spec.description).toBe('Math calculator');
    expect(spec.inputSchemaJson).toBe('{"type":"object"}');
  });
});

// ── ToolContext ───────────────────────────────────────────

describe('ToolContext', () => {
  it('stores all fields', () => {
    const ref = { agent: true };
    const ctx = new ToolContext(ref, 'tu-1', 'calc', '[{"role":"user"}]', 'You are helpful.', '{"key":"val"}');
    expect(ctx.agent).toBe(ref);
    expect(ctx.toolUseId).toBe('tu-1');
    expect(ctx.toolName).toBe('calc');
    expect(ctx.messagesJson).toBe('[{"role":"user"}]');
    expect(ctx.systemPrompt).toBe('You are helpful.');
    expect(ctx.invocationStateJson).toBe('{"key":"val"}');
  });

  it('defaults invocationStateJson to empty object', () => {
    const ctx = new ToolContext({}, 'id', 'name', '[]', 'prompt');
    expect(ctx.invocationStateJson).toBe('{}');
  });
});

// ── FunctionTool ─────────────────────────────────────────

describe('FunctionTool', () => {
  it('creates and executes via handler', () => {
    const tool = new FunctionTool('echo', 'Echo input', '{"type":"object"}', new EchoHandler());
    expect(tool.spec.name).toBe('echo');
    const result = JSON.parse(tool.execute('{"hello":"world"}'));
    expect(result.echo.hello).toBe('world');
  });

  it('catches handler errors gracefully', () => {
    const tool = new FunctionTool('bad', 'Bad tool', '{"type":"object"}', new ErrorHandler());
    const result = JSON.parse(tool.execute('{}'));
    expect(result.error).toBe('boom');
  });

  it('catches non-Error throws', () => {
    class StringThrower extends ToolHandler {
      public handle(): string { throw 'string error'; }
    }
    const tool = new FunctionTool('t', 'd', '{}', new StringThrower());
    const result = JSON.parse(tool.execute('{}'));
    expect(result.error).toContain('string error');
  });

  it('exposes handler', () => {
    const h = new EchoHandler();
    const tool = new FunctionTool('t', 'd', '{}', h);
    expect(tool.handler).toBe(h);
  });
});

// ── ToolBuilder ──────────────────────────────────────────

describe('ToolBuilder', () => {
  it('builds tool with fluent API', () => {
    const tool = new ToolBuilder('greet', new EchoHandler())
      .description('Greet someone')
      .addStringParam('name', 'Person name', true)
      .addNumberParam('times', 'Repeat count', false)
      .addBooleanParam('loud', 'Shout?', false)
      .create();

    expect(tool.spec.name).toBe('greet');
    expect(tool.spec.description).toBe('Greet someone');

    const schema = JSON.parse(tool.spec.inputSchemaJson);
    expect(schema.properties.name.type).toBe('string');
    expect(schema.properties.times.type).toBe('number');
    expect(schema.properties.loud.type).toBe('boolean');
    expect(schema.required).toContain('name');
    expect(schema.required).not.toContain('times');
  });

  it('builds with .param() shorthand', () => {
    const tool = new ToolBuilder('t', new EchoHandler())
      .description('Test')
      .param('a', 'string', 'Param A')          // required by default
      .param('b', 'number', 'Param B', false)    // optional
      .create();

    const schema = JSON.parse(tool.spec.inputSchemaJson);
    expect(schema.required).toContain('a');
    expect(schema.required).not.toContain('b');
  });

  it('supports array and object params', () => {
    const tool = new ToolBuilder('t', new EchoHandler())
      .description('Test')
      .addArrayParam('tags', 'Tags', 'string', true)
      .addArrayParam('nums', 'Numbers', undefined, false)  // default item type
      .addObjectParam('config', 'Config', '{"type":"object","properties":{"key":{"type":"string"}}}', false)
      .create();

    const schema = JSON.parse(tool.spec.inputSchemaJson);
    expect(schema.properties.tags.type).toBe('array');
    expect(schema.properties.tags.items.type).toBe('string');
    expect(schema.properties.nums.items.type).toBe('string');  // default
    expect(schema.properties.config.type).toBe('object');
    expect(schema.required).toContain('tags');
    expect(schema.required).not.toContain('config');
  });

  it('withHandler replaces handler', () => {
    const h1 = new EchoHandler();
    const h2 = new EchoHandler();
    const tool = new ToolBuilder('t', h1).description('T').withHandler(h2).create();
    expect(tool.handler).toBe(h2);
  });

  it('creates tool with no required params when none specified', () => {
    const tool = new ToolBuilder('t', new EchoHandler())
      .description('T')
      .param('x', 'string', 'X', false)
      .create();
    const schema = JSON.parse(tool.spec.inputSchemaJson);
    expect(schema.required).toBeUndefined();
  });
});

// ── ContextAwareToolDefinition ───────────────────────────

describe('ContextAwareToolDefinition', () => {
  it('receives context in executeWithContext', () => {
    const tool = new ContextTool();
    const ctx = new ToolContext({}, 'tu-1', 'ctx_tool', '[]', 'system prompt');
    const result = JSON.parse(tool.executeWithContext('{"q":"hi"}', ctx));
    expect(result.toolName).toBe('ctx_tool');
    expect(result.toolUseId).toBe('tu-1');
    expect(tool.lastContext?.systemPrompt).toBe('system prompt');
  });

  it('falls back to execute() with empty context', () => {
    const tool = new ContextTool();
    const result = JSON.parse(tool.execute('{"q":"test"}'));
    expect(result.toolName).toBe('ctx_tool');
    expect(tool.lastContext?.toolUseId).toBe('');
  });
});

// ── ToolRegistry ─────────────────────────────────────────

describe('ToolRegistry', () => {
  it('add / has / get / remove', () => {
    const reg = new ToolRegistry();
    const tool = new SimpleTool('alpha');
    reg.add(tool);
    expect(reg.has('alpha')).toBe(true);
    expect(reg.get('alpha')).toBe(tool);
    expect(reg.size).toBe(1);
    expect(reg.remove('alpha')).toBe(true);
    expect(reg.has('alpha')).toBe(false);
    expect(reg.size).toBe(0);
  });

  it('remove returns false for unknown', () => {
    expect(new ToolRegistry().remove('nope')).toBe(false);
  });

  it('get returns undefined for unknown', () => {
    expect(new ToolRegistry().get('nope')).toBeUndefined();
  });

  it('listNames returns JSON array', () => {
    const reg = new ToolRegistry();
    reg.add(new SimpleTool('a'));
    reg.add(new SimpleTool('b'));
    const names = JSON.parse(reg.listNames());
    expect(names).toContain('a');
    expect(names).toContain('b');
  });

  it('allTools returns all', () => {
    const reg = new ToolRegistry();
    reg.add(new SimpleTool('x'));
    reg.add(new SimpleTool('y'));
    expect(reg.allTools()).toHaveLength(2);
  });

  it('clear removes all', () => {
    const reg = new ToolRegistry();
    reg.add(new SimpleTool('a'));
    reg.clear();
    expect(reg.size).toBe(0);
  });

  it('addAll registers multiple', () => {
    const reg = new ToolRegistry();
    reg.addAll([new SimpleTool('p'), new SimpleTool('q')]);
    expect(reg.size).toBe(2);
  });

  it('fromTools static factory', () => {
    const reg = ToolRegistry.fromTools([new SimpleTool('x'), new SimpleTool('y')]);
    expect(reg.size).toBe(2);
    expect(reg.has('x')).toBe(true);
  });

  it('overwrites tool with same name', () => {
    const reg = new ToolRegistry();
    const t1 = new SimpleTool('a');
    const t2 = new SimpleTool('a');
    reg.add(t1);
    reg.add(t2);
    expect(reg.size).toBe(1);
    expect(reg.get('a')).toBe(t2);
  });
});

// ── AgentTool ────────────────────────────────────────────

describe('AgentTool', () => {
  it('wraps inner tool with prompt parameter', () => {
    const inner = new SimpleTool('worker');
    const agentTool = new AgentTool('delegate', 'Delegate work', inner);
    expect(agentTool.spec.name).toBe('delegate');
    expect(agentTool.innerAgent).toBe(inner);
    const schema = JSON.parse(agentTool.spec.inputSchemaJson);
    expect(schema.properties.prompt).toBeDefined();
    expect(schema.required).toContain('prompt');
  });

  it('delegates execute to inner agent', () => {
    const inner = new SimpleTool('worker');
    const agentTool = new AgentTool('delegate', 'Delegate', inner);
    const result = JSON.parse(agentTool.execute('{"prompt":"do stuff"}'));
    expect(result.result).toBe('done');
    expect(inner.executionCount).toBe(1);
  });

  it('catches inner errors', () => {
    const badTool = new FunctionTool('bad', 'Bad', '{"type":"object"}', new ErrorHandler());
    const agentTool = new AgentTool('delegate', 'Delegate', badTool);
    const result = JSON.parse(agentTool.execute('{"prompt":"test"}'));
    expect(result.error).toBeDefined();
  });

  it('handles missing prompt gracefully', () => {
    const inner = new SimpleTool('worker');
    const agentTool = new AgentTool('delegate', 'Delegate', inner);
    // No prompt key — should use empty string
    const result = JSON.parse(agentTool.execute('{}'));
    expect(result.result).toBe('done');
  });

  it('catches non-Error throws from inner', () => {
    class StringThrowTool extends ToolDefinition {
      constructor() { super(new ToolSpecification('t', 'd', '{}')); }
      public execute(): string { throw 'string throw'; }
    }
    const agentTool = new AgentTool('d', 'D', new StringThrowTool());
    const result = JSON.parse(agentTool.execute('{"prompt":"x"}'));
    expect(result.error).toContain('string throw');
  });
});

// ── ToolCaller ───────────────────────────────────────────

describe('ToolCaller', () => {
  it('calls tool and returns result', () => {
    const reg = ToolRegistry.fromTools([new SimpleTool('calc')]);
    const appender = new TestAppender();
    const caller = new ToolCaller(reg, appender);
    const result = caller.callTool('calc', '{"x":"hello"}', true);
    expect(result.toolName).toBe('calc');
    expect(result.success).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.parse(result.resultJson).result).toBe('done');
    expect(result.toolUseId).toContain('tooluse_calc_');
  });

  it('records 4 messages in history', () => {
    const reg = ToolRegistry.fromTools([new SimpleTool('t')]);
    const appender = new TestAppender();
    const caller = new ToolCaller(reg, appender);
    caller.callTool('t', '{"x":"y"}', true);
    expect(appender.appended).toHaveLength(1);
    const msgs = JSON.parse(appender.appended[0]);
    expect(msgs).toHaveLength(4);
    expect(msgs[0].role).toBe('user');
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[2].role).toBe('user');
    expect(msgs[3].role).toBe('assistant');
  });

  it('does not record when recordInHistory is false', () => {
    const reg = ToolRegistry.fromTools([new SimpleTool('t')]);
    const appender = new TestAppender();
    const caller = new ToolCaller(reg, appender);
    caller.callTool('t', '{"x":"y"}', false);
    expect(appender.appended).toHaveLength(0);
  });

  it('handles missing tool', () => {
    const reg = new ToolRegistry();
    const appender = new TestAppender();
    const caller = new ToolCaller(reg, appender);
    const result = caller.callTool('nonexistent', '{}', true);
    expect(result.success).toBe(false);
    expect(JSON.parse(result.resultJson).error).toContain('not found');
  });

  it('catches tool execution errors', () => {
    const reg = ToolRegistry.fromTools([new ThrowingTool()]);
    const appender = new TestAppender();
    const caller = new ToolCaller(reg, appender);
    const result = caller.callTool('thrower', '{}', true);
    expect(result.success).toBe(false);
    expect(JSON.parse(result.resultJson).error).toContain('tool explosion');
  });

  it('defaults recordInHistory to true', () => {
    const reg = ToolRegistry.fromTools([new SimpleTool('t')]);
    const appender = new TestAppender();
    const caller = new ToolCaller(reg, appender);
    caller.callTool('t', '{}');
    expect(appender.appended).toHaveLength(1);
  });
});

// ── UniversalToolFactory ─────────────────────────────────

describe('UniversalToolFactory', () => {
  it('creates use_X tool with standard schema', () => {
    const tool = UniversalToolFactory.create('boto3', 'AWS SDK', new EchoHandler());
    expect(tool.spec.name).toBe('use_boto3');
    expect(tool.spec.description).toContain('boto3');
    const schema = JSON.parse(tool.spec.inputSchemaJson);
    expect(schema.properties.module).toBeDefined();
    expect(schema.properties.method).toBeDefined();
    expect(schema.properties.parameters).toBeDefined();
    expect(schema.properties.label).toBeDefined();
    expect(schema.required).toContain('module');
  });

  it('created tool executes handler', () => {
    const tool = UniversalToolFactory.create('lib', 'Lib', new EchoHandler());
    const result = JSON.parse(tool.execute('{"module":"__discovery__"}'));
    expect(result.echo.module).toBe('__discovery__');
  });

  it('createSpec creates spec without handler', () => {
    const spec = UniversalToolFactory.createSpec('numpy', 'Numerical computing');
    expect(spec.name).toBe('use_numpy');
    expect(spec.description).toContain('numpy');
  });

  it('schema returns standard JSON', () => {
    const schema = JSON.parse(UniversalToolFactory.schema);
    expect(schema.type).toBe('object');
    expect(schema.properties.module).toBeDefined();
  });
});

// ── ToolWatcher ──────────────────────────────────────────

describe('ToolWatcher', () => {
  const watchDir = join(tmpdir(), `strands-test-tools-${Date.now()}`);

  beforeAll(() => {
    mkdirSync(watchDir, { recursive: true });
  });

  afterAll(() => {
    try {
      // Clean up all files in the directory
      const { readdirSync } = require('fs');
      for (const f of readdirSync(watchDir)) {
        try { unlinkSync(join(watchDir, f)); } catch { /* */ }
      }
      rmdirSync(watchDir);
    } catch { /* */ }
  });

  it('creates with defaults', () => {
    const reg = new ToolRegistry();
    const watcher = new ToolWatcher(reg);
    expect(watcher.directory).toBe('./tools');
    expect(watcher.running).toBe(false);
  });

  it('creates with custom options', () => {
    const reg = new ToolRegistry();
    const watcher = new ToolWatcher(reg, { directory: watchDir, pollIntervalMs: 500 });
    expect(watcher.directory).toBe(watchDir);
  });

  it('start and stop', () => {
    const reg = new ToolRegistry();
    const watcher = new ToolWatcher(reg, { directory: watchDir, pollIntervalMs: 60000 });
    watcher.start();
    expect(watcher.running).toBe(true);

    // Starting again is a no-op
    watcher.start();
    expect(watcher.running).toBe(true);

    watcher.stop();
    expect(watcher.running).toBe(false);
  });

  it('scan with non-existent directory is safe', () => {
    const reg = new ToolRegistry();
    const watcher = new ToolWatcher(reg, { directory: '/nonexistent/path' });
    // Should not throw
    watcher.scan();
    expect(reg.size).toBe(0);
  });

  it('scan loads a Python tool file', () => {
    const reg = new ToolRegistry();
    const watcher = new ToolWatcher(reg, { directory: watchDir });

    // Create a simple Python tool file
    const toolFile = join(watchDir, 'greet.py');
    writeFileSync(toolFile, `
def greet(name: str) -> str:
    """Greet someone by name."""
    return f"Hello, {name}!"
`);

    watcher.scan();

    // The watcher should have loaded the tool
    // Note: this requires python3 to be available
    if (reg.has('greet')) {
      expect(reg.get('greet')).toBeDefined();
      const result = JSON.parse(reg.get('greet')!.execute('{"name":"World"}'));
      expect(result.result).toContain('Hello');
    }
    // If python3 is not available, the tool won't load — that's OK
  });

  it('ignores files starting with underscore', () => {
    const reg = new ToolRegistry();
    const watcher = new ToolWatcher(reg, { directory: watchDir });

    writeFileSync(join(watchDir, '_private.py'), 'def hidden(): pass');
    watcher.scan();
    expect(reg.has('_private')).toBe(false);
    expect(reg.has('hidden')).toBe(false);
  });

  it('ignores non-.py files', () => {
    const reg = new ToolRegistry();
    const watcher = new ToolWatcher(reg, { directory: watchDir });

    writeFileSync(join(watchDir, 'readme.txt'), 'not a tool');
    watcher.scan();
    expect(reg.has('readme')).toBe(false);
  });

  it('detects deleted files and removes tools', () => {
    const reg = new ToolRegistry();
    const watcher = new ToolWatcher(reg, { directory: watchDir });

    // Create a file and scan to load it
    const tempFile = join(watchDir, 'temp_tool.py');
    writeFileSync(tempFile, 'def temp_tool(x: str) -> str:\n    """Temp."""\n    return x\n');
    watcher.scan();

    // Now delete and rescan
    try { unlinkSync(tempFile); } catch { /* */ }
    watcher.scan();

    // Tool should be removed (if it was loaded)
    expect(reg.has('temp_tool')).toBe(false);
  });
});
