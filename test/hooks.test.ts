/**
 * Integration tests for hooks: CallbackHandler, HookProvider, HookRegistry,
 * PrintingCallbackHandler.
 */
import {
  CallbackHandler, HookProvider, HookRegistry,
  BeforeInvocationEvent, AfterInvocationEvent,
  MessageAddedEvent, ToolStartEvent, ToolEndEvent,
  PrintingCallbackHandler,
} from '../src/index';

// ── CallbackHandler ──────────────────────────────────────

class RecordingHandler extends CallbackHandler {
  public events: Array<{ type: string; args: unknown[] }> = [];
  public onAgentStart(prompt: string): void { this.events.push({ type: 'agentStart', args: [prompt] }); }
  public onAgentEnd(text: string, inTok: number, outTok: number): void { this.events.push({ type: 'agentEnd', args: [text, inTok, outTok] }); }
  public onModelStart(json: string): void { this.events.push({ type: 'modelStart', args: [json] }); }
  public onModelEnd(json: string): void { this.events.push({ type: 'modelEnd', args: [json] }); }
  public onToolStart(name: string, json: string): void { this.events.push({ type: 'toolStart', args: [name, json] }); }
  public onToolEnd(name: string, json: string, ms: number): void { this.events.push({ type: 'toolEnd', args: [name, json, ms] }); }
  public onTextChunk(text: string): void { this.events.push({ type: 'textChunk', args: [text] }); }
  public onError(msg: string, phase: string): void { this.events.push({ type: 'error', args: [msg, phase] }); }
}

describe('CallbackHandler', () => {
  it('default methods are no-ops (do not throw)', () => {
    // The base class has default no-op implementations — calling them should not throw
    const h = new RecordingHandler();
    // Call the base class methods through an unoverridden handler
    const base = new (class extends CallbackHandler {})();
    base.onAgentStart('test');
    base.onAgentEnd('done', 0, 0);
    base.onModelStart('{}');
    base.onModelEnd('{}');
    base.onToolStart('t', '{}');
    base.onToolEnd('t', '{}', 0);
    base.onTextChunk('hello');
    base.onError('err', 'test');
    expect(h.events).toHaveLength(0);
  });

  it('records events when called', () => {
    const h = new RecordingHandler();
    h.onAgentStart('test');
    h.onModelStart('{}');
    h.onTextChunk('hello');
    h.onModelEnd('{}');
    h.onToolStart('calc', '{"x":1}');
    h.onToolEnd('calc', '{"r":2}', 10);
    h.onError('oops', 'tool');
    h.onAgentEnd('done', 10, 5);
    expect(h.events.map(e => e.type)).toEqual([
      'agentStart', 'modelStart', 'textChunk', 'modelEnd',
      'toolStart', 'toolEnd', 'error', 'agentEnd',
    ]);
  });
});

// ── PrintingCallbackHandler ──────────────────────────────

describe('PrintingCallbackHandler', () => {
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('is a CallbackHandler', () => {
    expect(new PrintingCallbackHandler()).toBeInstanceOf(CallbackHandler);
  });

  it('onModelStart prints message count', () => {
    const h = new PrintingCallbackHandler();
    h.onModelStart('[{},{}]');
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('2 messages'));
  });

  it('onModelEnd prints stop reason', () => {
    const h = new PrintingCallbackHandler();
    h.onModelEnd('{"stopReason":"end_turn"}');
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('end_turn'));
  });

  it('onModelEnd prints unknown when no stopReason', () => {
    const h = new PrintingCallbackHandler();
    h.onModelEnd('{}');
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('unknown'));
  });

  it('onToolStart prints tool name', () => {
    const h = new PrintingCallbackHandler();
    h.onToolStart('calculator', '{}');
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('calculator'));
  });

  it('onToolEnd prints tool name and duration', () => {
    const h = new PrintingCallbackHandler();
    h.onToolEnd('calculator', '{}', 15);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('calculator'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('15'));
  });

  it('onTextChunk writes text', () => {
    const h = new PrintingCallbackHandler();
    h.onTextChunk('hello world');
    expect(stdoutSpy).toHaveBeenCalledWith('hello world');
  });

  it('onAgentEnd prints token counts', () => {
    const h = new PrintingCallbackHandler();
    h.onAgentEnd('response', 100, 50);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('100'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('50'));
  });

  it('onError prints to stderr', () => {
    const h = new PrintingCallbackHandler();
    h.onError('something broke', 'model');
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('something broke'));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('model'));
  });
});

// ── Hook Events ──────────────────────────────────────────

describe('BeforeInvocationEvent', () => {
  it('stores prompt and messages', () => {
    const e = new BeforeInvocationEvent('hello', '[]');
    expect(e.prompt).toBe('hello');
    expect(e.messagesJson).toBe('[]');
    expect(e.cancelled).toBe(false);
  });

  it('cancelled is mutable', () => {
    const e = new BeforeInvocationEvent('x', '[]');
    e.cancelled = true;
    expect(e.cancelled).toBe(true);
  });
});

describe('AfterInvocationEvent', () => {
  it('stores all fields', () => {
    const e = new AfterInvocationEvent('response', 'end_turn', 10, 5);
    expect(e.responseText).toBe('response');
    expect(e.stopReason).toBe('end_turn');
    expect(e.inputTokens).toBe(10);
    expect(e.outputTokens).toBe(5);
  });
});

describe('MessageAddedEvent', () => {
  it('stores role and content', () => {
    const e = new MessageAddedEvent('user', '[{"text":"hi"}]');
    expect(e.role).toBe('user');
    expect(e.contentJson).toBe('[{"text":"hi"}]');
  });
});

describe('ToolStartEvent', () => {
  it('stores tool name and input', () => {
    const e = new ToolStartEvent('calc', '{"x":1}');
    expect(e.toolName).toBe('calc');
    expect(e.inputJson).toBe('{"x":1}');
  });
});

describe('ToolEndEvent', () => {
  it('stores tool name, result, duration', () => {
    const e = new ToolEndEvent('calc', '{"r":2}', 15);
    expect(e.toolName).toBe('calc');
    expect(e.resultJson).toBe('{"r":2}');
    expect(e.durationMs).toBe(15);
  });
});

// ── HookProvider & HookRegistry ──────────────────────────

class TrackingHook extends HookProvider {
  public events: string[] = [];
  public beforeInvocation(event: BeforeInvocationEvent): void { this.events.push(`before:${event.prompt}`); }
  public afterInvocation(event: AfterInvocationEvent): void { this.events.push(`after:${event.stopReason}`); }
  public onMessageAdded(event: MessageAddedEvent): void { this.events.push(`msg:${event.role}`); }
  public onToolStart(event: ToolStartEvent): void { this.events.push(`toolStart:${event.toolName}`); }
  public onToolEnd(event: ToolEndEvent): void { this.events.push(`toolEnd:${event.toolName}`); }
}

class CancellingHook extends HookProvider {
  public beforeInvocation(event: BeforeInvocationEvent): void {
    if (event.prompt.includes('CANCEL')) event.cancelled = true;
  }
}

describe('HookProvider base class', () => {
  it('default methods are no-ops', () => {
    const base = new (class extends HookProvider {})();
    // These should not throw
    base.beforeInvocation(new BeforeInvocationEvent('x', '[]'));
    base.afterInvocation(new AfterInvocationEvent('x', 'end_turn', 0, 0));
    base.onMessageAdded(new MessageAddedEvent('user', '[]'));
    base.onToolStart(new ToolStartEvent('t', '{}'));
    base.onToolEnd(new ToolEndEvent('t', '{}', 0));
  });
});

describe('HookRegistry', () => {
  it('registers and emits to hooks', () => {
    const reg = new HookRegistry();
    const hook = new TrackingHook();
    reg.register(hook);
    expect(reg.hookCount).toBe(1);

    reg.emitBeforeInvocation(new BeforeInvocationEvent('test', '[]'));
    reg.emitAfterInvocation(new AfterInvocationEvent('done', 'end_turn', 10, 5));
    reg.emitMessageAdded(new MessageAddedEvent('user', '[]'));
    reg.emitToolStart(new ToolStartEvent('calc', '{}'));
    reg.emitToolEnd(new ToolEndEvent('calc', '{}', 5));

    expect(hook.events).toEqual([
      'before:test', 'after:end_turn', 'msg:user', 'toolStart:calc', 'toolEnd:calc',
    ]);
  });

  it('multiple hooks fire in order', () => {
    const reg = new HookRegistry();
    const h1 = new TrackingHook();
    const h2 = new TrackingHook();
    reg.register(h1);
    reg.register(h2);
    expect(reg.hookCount).toBe(2);

    reg.emitBeforeInvocation(new BeforeInvocationEvent('go', '[]'));
    expect(h1.events).toEqual(['before:go']);
    expect(h2.events).toEqual(['before:go']);
  });

  it('hook can cancel invocation', () => {
    const reg = new HookRegistry();
    reg.register(new CancellingHook());

    const event = new BeforeInvocationEvent('CANCEL this', '[]');
    reg.emitBeforeInvocation(event);
    expect(event.cancelled).toBe(true);

    const safe = new BeforeInvocationEvent('safe query', '[]');
    reg.emitBeforeInvocation(safe);
    expect(safe.cancelled).toBe(false);
  });

  it('starts with zero hooks', () => {
    expect(new HookRegistry().hookCount).toBe(0);
  });
});
