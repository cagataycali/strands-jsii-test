/**
 * Integration tests for StrandsAgent — the core agent loop.
 */
import {
  StrandsAgent, AgentConfig, ModelProvider, ToolDefinition, ToolSpecification,
  CallbackHandler, HookProvider, BeforeInvocationEvent, AfterInvocationEvent,
  SlidingWindowConversationManager, NullConversationManager,
  ToolHandler, FunctionTool, AgentTool,
} from '../src/index';

// ── Mock Providers ───────────────────────────────────────

class MockModel extends ModelProvider {
  private readonly _response: string;
  public callCount = 0;
  public lastMessagesJson = '';

  constructor(response?: object) {
    super();
    this._response = JSON.stringify(response ?? {
      output: { message: { content: [{ text: 'Hello from mock!' }] } },
      stopReason: 'end_turn',
      usage: { inputTokens: 10, outputTokens: 5 },
    });
  }
  public converse(messagesJson: string, _sp?: string, _ts?: string): string {
    this.callCount++;
    this.lastMessagesJson = messagesJson;
    return this._response;
  }
  public get modelId(): string { return 'mock'; }
  public get providerName(): string { return 'mock'; }
}

class MockTool extends ToolDefinition {
  public executionCount = 0;
  public lastInput = '';
  constructor(name = 'mock_tool') {
    super(new ToolSpecification(name, `Mock ${name}`, JSON.stringify({
      type: 'object',
      properties: { x: { type: 'string' } },
    })));
  }
  public execute(inputJson: string): string {
    this.executionCount++;
    this.lastInput = inputJson;
    return JSON.stringify({ result: 'mocked' });
  }
}

class MockCallbackHandler extends CallbackHandler {
  public events: Array<{ type: string; args: unknown[] }> = [];
  public onAgentStart(prompt: string): void { this.events.push({ type: 'agentStart', args: [prompt] }); }
  public onModelStart(json: string): void { this.events.push({ type: 'modelStart', args: [json] }); }
  public onModelEnd(json: string): void { this.events.push({ type: 'modelEnd', args: [json] }); }
  public onToolStart(name: string, json: string): void { this.events.push({ type: 'toolStart', args: [name, json] }); }
  public onToolEnd(name: string, json: string, ms: number): void { this.events.push({ type: 'toolEnd', args: [name, json, ms] }); }
  public onTextChunk(text: string): void { this.events.push({ type: 'textChunk', args: [text] }); }
  public onAgentEnd(text: string, inTok: number, outTok: number): void { this.events.push({ type: 'agentEnd', args: [text, inTok, outTok] }); }
  public onError(msg: string, phase: string): void { this.events.push({ type: 'error', args: [msg, phase] }); }
}

// ── AgentConfig ──────────────────────────────────────────

describe('AgentConfig', () => {
  it('uses defaults', () => {
    const config = new AgentConfig();
    expect(config.systemPrompt).toContain('helpful');
    expect(config.tools).toHaveLength(0);
    expect(config.maxCycles).toBe(50);
    expect(config.recordDirectToolCall).toBe(true);
  });

  it('accepts custom values', () => {
    const model = new MockModel();
    const tool = new MockTool();
    const config = new AgentConfig({
      model, systemPrompt: 'Custom', tools: [tool], maxCycles: 10,
    });
    expect(config.model).toBe(model);
    expect(config.systemPrompt).toBe('Custom');
    expect(config.tools).toHaveLength(1);
    expect(config.maxCycles).toBe(10);
  });
});

// ── StrandsAgent ─────────────────────────────────────────

describe('StrandsAgent', () => {
  it('creates with default config', () => {
    const agent = new StrandsAgent();
    expect(agent.toolCount).toBe(0);
    expect(agent.messages).toHaveLength(0);
    expect(agent.systemPrompt).toContain('helpful');
    expect(agent.maxCycles).toBe(50);
  });

  it('invokes model and returns response', () => {
    const model = new MockModel();
    const agent = new StrandsAgent(new AgentConfig({ model }));

    const response = agent.invoke('Hello');
    expect(response.text).toBe('Hello from mock!');
    expect(response.stopReason).toBe('end_turn');
    expect(response.inputTokens).toBe(10);
    expect(response.outputTokens).toBe(5);
    expect(response.totalTokens).toBe(15);
    expect(model.callCount).toBe(1);
  });

  it('ask() is alias for invoke()', () => {
    const model = new MockModel();
    const agent = new StrandsAgent(new AgentConfig({ model }));
    const r = agent.ask('Test');
    expect(r.text).toBe('Hello from mock!');
  });

  it('maintains conversation history', () => {
    const model = new MockModel();
    const agent = new StrandsAgent(new AgentConfig({ model }));

    agent.invoke('First');
    expect(agent.messages).toHaveLength(2); // user + assistant

    agent.invoke('Second');
    expect(agent.messages).toHaveLength(4);
  });

  it('resets conversation', () => {
    const model = new MockModel();
    const agent = new StrandsAgent(new AgentConfig({ model }));
    agent.invoke('Hello');
    expect(agent.messages.length).toBeGreaterThan(0);
    agent.resetConversation();
    expect(agent.messages).toHaveLength(0);
  });

  it('executes tools when model requests them', () => {
    const tool = new MockTool('calculator');
    let callCount = 0;

    class ToolUseModel extends ModelProvider {
      converse(): string {
        callCount++;
        if (callCount === 1) {
          return JSON.stringify({
            output: { message: { content: [{ toolUse: { name: 'calculator', toolUseId: 'tu-1', input: { expr: '2+2' } } }] } },
            stopReason: 'tool_use',
            usage: { inputTokens: 5, outputTokens: 3 },
          });
        }
        return JSON.stringify({
          output: { message: { content: [{ text: 'The answer is 4' }] } },
          stopReason: 'end_turn',
          usage: { inputTokens: 8, outputTokens: 4 },
        });
      }
      get modelId(): string { return 'mock'; }
      get providerName(): string { return 'mock'; }
    }

    const agent = new StrandsAgent(new AgentConfig({ model: new ToolUseModel(), tools: [tool] }));
    const response = agent.invoke('What is 2+2?');
    expect(response.text).toBe('The answer is 4');
    expect(tool.executionCount).toBe(1);
    expect(response.inputTokens).toBe(13);
    expect(response.outputTokens).toBe(7);
  });

  it('handles model errors gracefully', () => {
    const model = new MockModel({ error: 'Something broke' });
    const agent = new StrandsAgent(new AgentConfig({ model }));
    const response = agent.invoke('Hello');
    expect(response.text).toContain('Error');
    expect(response.stopReason).toBe('error');
  });

  it('fires callback handler events', () => {
    const handler = new MockCallbackHandler();
    const agent = new StrandsAgent(new AgentConfig({
      model: new MockModel(), callbackHandler: handler,
    }));
    agent.invoke('Hello');

    const types = handler.events.map(e => e.type);
    expect(types).toContain('agentStart');
    expect(types).toContain('modelStart');
    expect(types).toContain('modelEnd');
    expect(types).toContain('textChunk');
    expect(types).toContain('agentEnd');
  });

  it('fires callback on tool execution', () => {
    const handler = new MockCallbackHandler();
    const tool = new MockTool('calc');
    let callCount = 0;

    class ToolModel extends ModelProvider {
      converse(): string {
        callCount++;
        if (callCount === 1) {
          return JSON.stringify({
            output: { message: { content: [{ toolUse: { name: 'calc', toolUseId: 'tu-1', input: {} } }] } },
            stopReason: 'tool_use',
          });
        }
        return JSON.stringify({ output: { message: { content: [{ text: 'done' }] } }, stopReason: 'end_turn' });
      }
      get modelId(): string { return 'mock'; }
      get providerName(): string { return 'mock'; }
    }

    const agent = new StrandsAgent(new AgentConfig({
      model: new ToolModel(), tools: [tool], callbackHandler: handler,
    }));
    agent.invoke('test');

    const types = handler.events.map(e => e.type);
    expect(types).toContain('toolStart');
    expect(types).toContain('toolEnd');
  });

  it('uses conversation manager', () => {
    const model = new MockModel();
    const agent = new StrandsAgent(new AgentConfig({
      model, conversationManager: new SlidingWindowConversationManager(2),
    }));
    agent.invoke('One');
    agent.invoke('Two');
    agent.invoke('Three');

    const lastMsgs = JSON.parse(model.lastMessagesJson);
    expect(lastMsgs.length).toBeLessThanOrEqual(2);
  });

  it('handles missing tool gracefully', () => {
    let callCount = 0;
    class BadToolModel extends ModelProvider {
      converse(): string {
        callCount++;
        if (callCount === 1) {
          return JSON.stringify({
            output: { message: { content: [{ toolUse: { name: 'nonexistent', toolUseId: 'tu-x', input: {} } }] } },
            stopReason: 'tool_use',
          });
        }
        return JSON.stringify({ output: { message: { content: [{ text: 'OK' }] } }, stopReason: 'end_turn' });
      }
      get modelId(): string { return 'mock'; }
      get providerName(): string { return 'mock'; }
    }

    const agent = new StrandsAgent(new AgentConfig({ model: new BadToolModel() }));
    const response = agent.invoke('test');
    expect(response.text).toBe('OK');
  });

  it('respects maxCycles', () => {
    class InfiniteModel extends ModelProvider {
      converse(): string {
        return JSON.stringify({
          output: { message: { content: [{ toolUse: { name: 'loop', toolUseId: 'tu', input: {} } }] } },
          stopReason: 'tool_use',
        });
      }
      get modelId(): string { return 'mock'; }
      get providerName(): string { return 'mock'; }
    }

    const tool = new MockTool('loop');
    const agent = new StrandsAgent(new AgentConfig({ model: new InfiniteModel(), tools: [tool], maxCycles: 3 }));
    const response = agent.invoke('loop');
    expect(response.stopReason).toBe('maxCycles');
    expect(tool.executionCount).toBe(3);
  });

  it('reports tool names', () => {
    const agent = new StrandsAgent(new AgentConfig({
      model: new MockModel(), tools: [new MockTool('alpha'), new MockTool('beta')],
    }));
    const names = JSON.parse(agent.toolNames);
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
    expect(agent.toolCount).toBe(2);
  });

  it('handles reasoning content from model', () => {
    const model = new MockModel({
      output: { message: { content: [
        { reasoningContent: { reasoningText: { text: 'Let me think...', signature: 'sig' } } },
        { text: 'The answer is 42.' },
      ] } },
      stopReason: 'end_turn',
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    const agent = new StrandsAgent(new AgentConfig({ model }));
    const response = agent.invoke('Meaning of life?');
    expect(response.text).toBe('The answer is 42.');
    expect(response.message.content).toHaveLength(2);
    expect(response.message.content[0].isReasoning).toBe(true);
    expect(response.message.content[0].asReasoning?.text).toBe('Let me think...');
    expect(response.message.content[1].isText).toBe(true);
  });

  // ── Direct tool calls ───────────────────────────────────

  it('callTool calls tool and records history', () => {
    const tool = new MockTool('calc');
    const agent = new StrandsAgent(new AgentConfig({ model: new MockModel(), tools: [tool] }));

    const result = agent.callTool('calc', '{"x":"hello"}');
    expect(result.success).toBe(true);
    expect(result.toolName).toBe('calc');
    expect(JSON.parse(result.resultJson).result).toBe('mocked');
    expect(agent.messages).toHaveLength(4); // 4-message sequence
  });

  it('toolCall returns result JSON directly', () => {
    const tool = new MockTool('calc');
    const agent = new StrandsAgent(new AgentConfig({ model: new MockModel(), tools: [tool] }));

    const resultJson = agent.toolCall('calc', '{"x":"test"}');
    expect(JSON.parse(resultJson).result).toBe('mocked');
  });

  it('callTool + invoke uses tool context', () => {
    const model = new MockModel();
    const tool = new MockTool('calc');
    const agent = new StrandsAgent(new AgentConfig({ model, tools: [tool] }));

    agent.callTool('calc', '{"x":"6*7"}');
    const response = agent.invoke('What was the result?');
    expect(response.text).toBe('Hello from mock!');
    // Model should have received messages including tool context
    expect(agent.messages.length).toBeGreaterThan(4);
  });

  // ── Hooks integration ───────────────────────────────────

  it('hook can cancel invocation', () => {
    class CancelHook extends HookProvider {
      public beforeInvocation(event: BeforeInvocationEvent): void {
        if (event.prompt.includes('BAD')) event.cancelled = true;
      }
    }

    const agent = new StrandsAgent(new AgentConfig({ model: new MockModel() }));
    agent.hookRegistry.register(new CancelHook());

    const response = agent.invoke('BAD query');
    expect(response.text).toContain('cancelled');
    expect(response.stopReason).toBe('cancelled');
  });

  it('hooks fire for full lifecycle', () => {
    const events: string[] = [];
    class TrackHook extends HookProvider {
      public beforeInvocation(): void { events.push('before'); }
      public afterInvocation(e: AfterInvocationEvent): void { events.push(`after:${e.stopReason}`); }
    }

    const agent = new StrandsAgent(new AgentConfig({ model: new MockModel() }));
    agent.hookRegistry.register(new TrackHook());
    agent.invoke('test');

    expect(events).toContain('before');
    expect(events).toContain('after:end_turn');
  });

  // ── ToolRegistry at runtime ─────────────────────────────

  it('add/remove tools at runtime', () => {
    const agent = new StrandsAgent(new AgentConfig({ model: new MockModel() }));
    expect(agent.toolCount).toBe(0);

    agent.toolRegistry.add(new MockTool('dynamic'));
    expect(agent.toolCount).toBe(1);
    expect(agent.toolRegistry.has('dynamic')).toBe(true);

    agent.toolRegistry.remove('dynamic');
    expect(agent.toolCount).toBe(0);
  });

  // ── appendRawMessages ───────────────────────────────────

  it('appendRawMessages adds to history', () => {
    const agent = new StrandsAgent(new AgentConfig({ model: new MockModel() }));
    agent.appendRawMessages(JSON.stringify([
      { role: 'user', content: [{ text: 'injected' }] },
      { role: 'assistant', content: [{ text: 'response' }] },
    ]));
    expect(agent.messages).toHaveLength(2);
    expect(agent.messages[0].role).toBe('user');
    expect(agent.messages[1].role).toBe('assistant');
  });

  it('appendRawMessages handles toolUse and toolResult blocks', () => {
    const agent = new StrandsAgent(new AgentConfig({ model: new MockModel() }));
    agent.appendRawMessages(JSON.stringify([
      { role: 'assistant', content: [{ toolUse: { name: 'calc', toolUseId: 'tu-1', input: { x: 1 } } }] },
      { role: 'user', content: [{ toolResult: { toolUseId: 'tu-1', status: 'success', content: [{ json: { result: 42 } }] } }] },
    ]));
    expect(agent.messages).toHaveLength(2);
    expect(agent.messages[0].content[0].isToolUse).toBe(true);
    expect(agent.messages[1].content[0].isToolResult).toBe(true);
  });

  it('fires error callback when tool throws', () => {
    const handler = new MockCallbackHandler();
    let callCount = 0;

    class ToolModel extends ModelProvider {
      converse(): string {
        callCount++;
        if (callCount === 1) {
          return JSON.stringify({
            output: { message: { content: [{ toolUse: { name: 'bad', toolUseId: 'tu-1', input: {} } }] } },
            stopReason: 'tool_use',
          });
        }
        return JSON.stringify({ output: { message: { content: [{ text: 'done' }] } }, stopReason: 'end_turn' });
      }
      get modelId(): string { return 'mock'; }
      get providerName(): string { return 'mock'; }
    }

    class BadTool extends ToolDefinition {
      constructor() { super(new ToolSpecification('bad', 'Bad', '{"type":"object"}')); }
      public execute(): string { throw new Error('tool failure'); }
    }

    const agent = new StrandsAgent(new AgentConfig({
      model: new ToolModel(), tools: [new BadTool()], callbackHandler: handler,
    }));
    agent.invoke('test');

    const errorEvents = handler.events.filter(e => e.type === 'error');
    expect(errorEvents.length).toBeGreaterThan(0);
    expect(errorEvents[0].args[0]).toContain('tool failure');
  });

  it('fires error callback on model error', () => {
    const handler = new MockCallbackHandler();
    const agent = new StrandsAgent(new AgentConfig({
      model: new MockModel({ error: 'Model broke' }), callbackHandler: handler,
    }));
    agent.invoke('test');
    const errorEvents = handler.events.filter(e => e.type === 'error');
    expect(errorEvents.length).toBeGreaterThan(0);
  });
});
