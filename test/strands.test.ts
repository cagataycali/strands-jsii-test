/**
 * Integration tests for Strands universal factory and Identifier utility.
 */
import {
  Strands, StrandsAgent,
  BedrockModelProvider, AnthropicModelProvider, OpenAIModelProvider, GeminiModelProvider,
  ToolHandler, FunctionTool, ToolBuilder,
  ModelProvider, ToolDefinition, ToolSpecification,
  Identifier,
} from '../src/index';

// ── Helpers ──────────────────────────────────────────────

class EchoHandler extends ToolHandler {
  public handle(inputJson: string): string {
    return JSON.stringify({ echo: JSON.parse(inputJson) });
  }
}

class MockModel extends ModelProvider {
  converse(): string {
    return JSON.stringify({
      output: { message: { content: [{ text: 'Strands response' }] } },
      stopReason: 'end_turn',
      usage: { inputTokens: 1, outputTokens: 1 },
    });
  }
  get modelId(): string { return 'mock'; }
  get providerName(): string { return 'mock'; }
}

class SimpleTool extends ToolDefinition {
  constructor(name: string) {
    super(new ToolSpecification(name, `Tool ${name}`, '{"type":"object"}'));
  }
  public execute(_inputJson: string): string {
    return JSON.stringify({ result: 'ok' });
  }
}

// ── Strands.agent() ──────────────────────────────────────

describe('Strands.agent()', () => {
  it('creates agent with no args', () => {
    const agent = Strands.agent();
    expect(agent).toBeInstanceOf(StrandsAgent);
    expect(agent.systemPrompt).toContain('helpful');
    expect(agent.toolCount).toBe(0);
  });

  it('creates agent with options', () => {
    const model = new MockModel();
    const tool = new SimpleTool('t');
    const agent = Strands.agent({
      model, tools: [tool], systemPrompt: 'Custom', maxCycles: 5,
    });
    expect(agent.model).toBe(model);
    expect(agent.toolCount).toBe(1);
    expect(agent.systemPrompt).toBe('Custom');
    expect(agent.maxCycles).toBe(5);
  });

  it('created agent can invoke', () => {
    const agent = Strands.agent({ model: new MockModel() });
    const response = agent.invoke('test');
    expect(response.text).toBe('Strands response');
  });
});

// ── Strands.agentWith() ──────────────────────────────────

describe('Strands.agentWith()', () => {
  it('creates agent with model and tools inline', () => {
    const model = new MockModel();
    const t1 = new SimpleTool('a');
    const t2 = new SimpleTool('b');
    const agent = Strands.agentWith(model, t1, t2);
    expect(agent.model).toBe(model);
    expect(agent.toolCount).toBe(2);
  });

  it('works with no tools', () => {
    const agent = Strands.agentWith(new MockModel());
    expect(agent.toolCount).toBe(0);
  });
});

// ── Strands.bedrock/anthropic/openai/gemini ──────────────

describe('Strands model factories', () => {
  it('bedrock() returns BedrockModelProvider', () => {
    const p = Strands.bedrock();
    expect(p).toBeInstanceOf(BedrockModelProvider);
    expect(p.providerName).toBe('bedrock');
  });

  it('bedrock(modelId, region)', () => {
    const p = Strands.bedrock('custom-model', 'eu-west-1');
    expect(p.modelId).toBe('custom-model');
  });

  it('anthropic() returns AnthropicModelProvider', () => {
    const p = Strands.anthropic();
    expect(p).toBeInstanceOf(AnthropicModelProvider);
    expect(p.providerName).toBe('anthropic');
  });

  it('openai() returns OpenAIModelProvider', () => {
    const p = Strands.openai();
    expect(p).toBeInstanceOf(OpenAIModelProvider);
    expect(p.providerName).toBe('openai');
  });

  it('gemini() returns GeminiModelProvider', () => {
    const p = Strands.gemini();
    expect(p).toBeInstanceOf(GeminiModelProvider);
    expect(p.providerName).toBe('gemini');
  });
});

// ── Strands.tool() ───────────────────────────────────────

describe('Strands.tool()', () => {
  it('returns ToolBuilder', () => {
    const builder = Strands.tool('calc', 'Math calculator');
    expect(builder).toBeInstanceOf(ToolBuilder);
  });

  it('fluent chain creates FunctionTool', () => {
    const tool = Strands.tool('calc', 'Math calculator', new EchoHandler())
      .param('expression', 'string', 'Math expression')
      .param('precision', 'number', 'Decimal places', false)
      .create();

    expect(tool).toBeInstanceOf(FunctionTool);
    expect(tool.spec.name).toBe('calc');
    expect(tool.spec.description).toBe('Math calculator');

    const schema = JSON.parse(tool.spec.inputSchemaJson);
    expect(schema.properties.expression.type).toBe('string');
    expect(schema.properties.precision.type).toBe('number');
    expect(schema.required).toContain('expression');
    expect(schema.required).not.toContain('precision');
  });

  it('withHandler can replace handler', () => {
    const h = new EchoHandler();
    const tool = Strands.tool('t', 'T').withHandler(h).create();
    expect(tool.handler).toBe(h);
  });
});

// ── Strands.toolDirect() ─────────────────────────────────

describe('Strands.toolDirect()', () => {
  it('creates FunctionTool from pre-built schema', () => {
    const tool = Strands.toolDirect('calc', 'Math', '{"type":"object"}', new EchoHandler());
    expect(tool).toBeInstanceOf(FunctionTool);
    expect(tool.spec.name).toBe('calc');
  });
});

// ── End-to-end: Strands factory → invoke ─────────────────

describe('Strands end-to-end', () => {
  it('creates agent with tool and invokes', () => {
    const tool = Strands.tool('echo', 'Echo input', new EchoHandler())
      .param('msg', 'string', 'Message')
      .create();

    const agent = Strands.agent({ model: new MockModel(), tools: [tool] });
    const response = agent.invoke('test');
    expect(response.text).toBe('Strands response');
  });
});

// ── Identifier ───────────────────────────────────────────

describe('Identifier', () => {
  it('generates with default prefix', () => {
    const id = Identifier.generate();
    expect(id).toMatch(/^strands-[a-z0-9]+-[a-z0-9]+$/);
  });

  it('generates with custom prefix', () => {
    const id = Identifier.generate('custom');
    expect(id.startsWith('custom-')).toBe(true);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => Identifier.generate()));
    expect(ids.size).toBe(100);
  });
});
