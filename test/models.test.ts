/**
 * Comprehensive tests for all model providers.
 *
 * Tests cover:
 * - Config construction & defaults
 * - Config with custom options
 * - Provider instantiation & metadata
 * - Message format conversion (Bedrock Converse ↔ provider-specific)
 * - Response format conversion (provider-specific → Bedrock Converse)
 * - Tool specification formatting
 * - Error handling & classification
 * - Edge cases (empty messages, missing fields, special content types)
 *
 * NOTE: These are unit tests — no live API calls. We mock execSync/curl
 * to test the formatting/parsing logic in isolation.
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import {
  ModelProvider,
  BedrockModelConfig,
  BedrockModelProvider,
  AnthropicModelConfig,
  AnthropicModelProvider,
  AnthropicToolChoice,
  OpenAIModelConfig,
  OpenAIModelProvider,
  OpenAIToolChoice,
  OllamaModelConfig,
  OllamaModelProvider,
  GeminiModelConfig,
  GeminiModelProvider,
  GuardrailConfig,
} from '../src/index';

// ── Mock Setup ─────────────────────────────────────────────

// Track what gets written to temp files
const writtenFiles: Map<string, string> = new Map();

jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    writeFileSync: jest.fn((path: string, data: string) => {
      writtenFiles.set(String(path), String(data));
    }),
    unlinkSync: jest.fn(),
  };
});

const mockedExecSync = execSync as jest.MockedFunction<typeof execSync>;

beforeEach(() => {
  writtenFiles.clear();
});

afterEach(() => {
  jest.clearAllMocks();
});

// ── Helper: capture the request body written to temp file ──

function captureWrittenRequest(): any {
  for (const [path, content] of writtenFiles) {
    if (path.includes('.json') && !path.includes('req')) {
      try { return JSON.parse(content); } catch { continue; }
    }
  }
  // Fallback: find any JSON file
  for (const [path, content] of writtenFiles) {
    if (path.includes('.json')) {
      try { return JSON.parse(content); } catch { continue; }
    }
  }
  return null;
}

// For Bedrock which writes both a JSON file and a JS script
function captureBedrockWrittenRequest(): any {
  for (const [path, content] of writtenFiles) {
    if (path.includes('req') && path.includes('.json')) {
      try { return JSON.parse(content); } catch { continue; }
    }
  }
  return null;
}

function captureBedrockScript(): string {
  for (const [path, content] of writtenFiles) {
    if (path.includes('run') && path.includes('.js')) {
      return content;
    }
  }
  return '';
}

// ═══════════════════════════════════════════════════════════
// GuardrailConfig
// ═══════════════════════════════════════════════════════════

describe('GuardrailConfig', () => {
  it('creates with required fields', () => {
    const gc = new GuardrailConfig('g-1', '2');
    expect(gc.guardrailId).toBe('g-1');
    expect(gc.guardrailVersion).toBe('2');
    expect(gc.trace).toBe('enabled');
    expect(gc.streamProcessingMode).toBe('');
  });

  it('accepts optional fields', () => {
    const gc = new GuardrailConfig('g', '1', 'disabled', 'async');
    expect(gc.trace).toBe('disabled');
    expect(gc.streamProcessingMode).toBe('async');
  });
});

// ═══════════════════════════════════════════════════════════
// ModelProvider (abstract)
// ═══════════════════════════════════════════════════════════

class MockModelProvider extends ModelProvider {
  private readonly _response: string;
  public callCount = 0;

  constructor(response?: object) {
    super();
    this._response = JSON.stringify(response ?? {
      output: { message: { content: [{ text: 'mock response' }] } },
      stopReason: 'end_turn',
      usage: { inputTokens: 10, outputTokens: 5 },
    });
  }

  public converse(messagesJson: string, _sp?: string, _ts?: string): string {
    this.callCount++;
    return this._response;
  }

  public get modelId(): string { return 'mock-model'; }
  public get providerName(): string { return 'mock'; }
}

describe('ModelProvider (abstract)', () => {
  it('can be extended and used', () => {
    const provider = new MockModelProvider();
    const result = JSON.parse(provider.converse('[]'));
    expect(result.output.message.content[0].text).toBe('mock response');
    expect(provider.callCount).toBe(1);
    expect(provider.modelId).toBe('mock-model');
    expect(provider.providerName).toBe('mock');
  });

  it('supports custom response shapes', () => {
    const custom = new MockModelProvider({
      output: { message: { content: [{ toolUse: { name: 'calc', toolUseId: 'id1', input: {} } }] } },
      stopReason: 'tool_use',
      usage: { inputTokens: 100, outputTokens: 50 },
    });
    const result = JSON.parse(custom.converse('[]'));
    expect(result.stopReason).toBe('tool_use');
    expect(result.output.message.content[0].toolUse.name).toBe('calc');
  });
});

// ═══════════════════════════════════════════════════════════
// BedrockModelConfig
// ═══════════════════════════════════════════════════════════

describe('BedrockModelConfig', () => {
  it('defaults model to Claude Sonnet', () => {
    const cfg = new BedrockModelConfig();
    expect(cfg.modelId).toContain('anthropic');
    expect(cfg.region).toBe('us-west-2');
    expect(cfg.streaming).toBe(true);
    expect(cfg.maxTokens).toBe(4096);
    expect(cfg.temperature).toBe(0.7);
    expect(cfg.topP).toBe(0.9);
  });

  it('accepts custom model ID and region', () => {
    const cfg = new BedrockModelConfig({ modelId: 'my-model', region: 'eu-west-1' });
    expect(cfg.modelId).toBe('my-model');
    expect(cfg.region).toBe('eu-west-1');
  });

  it('accepts temperature and maxTokens', () => {
    const cfg = new BedrockModelConfig({ maxTokens: 2048, temperature: 0.5 });
    expect(cfg.maxTokens).toBe(2048);
    expect(cfg.temperature).toBe(0.5);
  });

  it('accepts streaming false', () => {
    expect(new BedrockModelConfig({ streaming: false }).streaming).toBe(false);
  });

  it('accepts guardrail', () => {
    const gc = new GuardrailConfig('g-1', '1');
    const cfg = new BedrockModelConfig({ guardrail: gc });
    expect(cfg.guardrail?.guardrailId).toBe('g-1');
  });

  it('accepts stop sequences', () => {
    const cfg = new BedrockModelConfig({ stopSequencesJson: '["\\n\\n", "STOP"]' });
    expect(JSON.parse(cfg.stopSequencesJson)).toEqual(['\n\n', 'STOP']);
  });

  it('accepts additional request fields', () => {
    const cfg = new BedrockModelConfig({
      additionalRequestFieldsJson: '{"thinking":{"type":"enabled","budget_tokens":5000}}',
    });
    const parsed = JSON.parse(cfg.additionalRequestFieldsJson);
    expect(parsed.thinking.type).toBe('enabled');
  });

  it('has sensible defaults for all fields', () => {
    const cfg = new BedrockModelConfig();
    expect(cfg.stopSequencesJson).toBe('');
    expect(cfg.guardrail).toBeUndefined();
    expect(cfg.additionalRequestFieldsJson).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════
// BedrockModelProvider
// ═══════════════════════════════════════════════════════════

describe('BedrockModelProvider', () => {
  it('instantiates with defaults', () => {
    const provider = new BedrockModelProvider();
    expect(provider.modelId).toContain('anthropic');
    expect(provider.providerName).toBe('bedrock');
    expect(provider.config).toBeDefined();
  });

  it('instantiates with custom config', () => {
    const cfg = new BedrockModelConfig({ modelId: 'custom-model', region: 'ap-south-1' });
    const provider = new BedrockModelProvider(cfg);
    expect(provider.modelId).toBe('custom-model');
    expect(provider.config.region).toBe('ap-south-1');
  });

  it('builds correct request with messages only', () => {
    const provider = new BedrockModelProvider(new BedrockModelConfig({ streaming: false }));
    const messages = [{ role: 'user', content: [{ text: 'Hello' }] }];

    mockedExecSync.mockReturnValue(JSON.stringify({
      output: { message: { role: 'assistant', content: [{ text: 'Hi!' }] } },
      stopReason: 'end_turn',
      usage: { inputTokens: 5, outputTokens: 3 },
    }));

    provider.converse(JSON.stringify(messages));
    const request = captureBedrockWrittenRequest();

    expect(request.modelId).toContain('anthropic');
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0].content[0].text).toBe('Hello');
    expect(request.inferenceConfig.maxTokens).toBe(4096);
    expect(request.inferenceConfig.temperature).toBe(0.7);
  });

  it('includes system prompt', () => {
    const provider = new BedrockModelProvider(new BedrockModelConfig({ streaming: false }));
    mockedExecSync.mockReturnValue('{}');

    provider.converse('[]', 'You are helpful');
    const request = captureBedrockWrittenRequest();

    expect(request.system).toEqual([{ text: 'You are helpful' }]);
  });

  it('formats tool specs correctly', () => {
    const provider = new BedrockModelProvider(new BedrockModelConfig({ streaming: false }));
    mockedExecSync.mockReturnValue('{}');

    const tools = [
      { name: 'calculator', description: 'Math tool', inputSchema: { type: 'object', properties: { expr: { type: 'string' } } } },
    ];
    provider.converse('[]', undefined, JSON.stringify(tools));
    const request = captureBedrockWrittenRequest();

    expect(request.toolConfig.tools).toHaveLength(1);
    expect(request.toolConfig.tools[0].toolSpec.name).toBe('calculator');
    expect(request.toolConfig.tools[0].toolSpec.inputSchema.json).toBeDefined();
  });

  it('includes guardrail config', () => {
    const gc = new GuardrailConfig('guard-1', '3', 'enabled', 'sync');
    const provider = new BedrockModelProvider(new BedrockModelConfig({ guardrail: gc, streaming: false }));
    mockedExecSync.mockReturnValue('{}');

    provider.converse('[]');
    const request = captureBedrockWrittenRequest();

    expect(request.guardrailConfig.guardrailIdentifier).toBe('guard-1');
    expect(request.guardrailConfig.guardrailVersion).toBe('3');
    expect(request.guardrailConfig.trace).toBe('enabled');
    expect(request.guardrailConfig.streamProcessingMode).toBe('sync');
  });

  it('includes additional model request fields', () => {
    const provider = new BedrockModelProvider(new BedrockModelConfig({
      additionalRequestFieldsJson: '{"thinking":{"type":"enabled","budget_tokens":8000}}',
      streaming: false,
    }));
    mockedExecSync.mockReturnValue('{}');

    provider.converse('[]');
    const request = captureBedrockWrittenRequest();

    expect(request.additionalModelRequestFields.thinking.type).toBe('enabled');
    expect(request.additionalModelRequestFields.thinking.budget_tokens).toBe(8000);
  });

  it('includes stop sequences in inferenceConfig', () => {
    const provider = new BedrockModelProvider(new BedrockModelConfig({
      stopSequencesJson: '["STOP", "END"]',
      streaming: false,
    }));
    mockedExecSync.mockReturnValue('{}');

    provider.converse('[]');
    const request = captureBedrockWrittenRequest();

    expect(request.inferenceConfig.stopSequences).toEqual(['STOP', 'END']);
  });

  it('generates streaming script by default', () => {
    const provider = new BedrockModelProvider(); // streaming: true by default
    mockedExecSync.mockReturnValue('{}');

    provider.converse('[]');
    const script = captureBedrockScript();

    expect(script).toContain('ConverseStreamCommand');
    expect(script).not.toContain('ConverseCommand');
  });

  it('generates non-streaming script when streaming=false', () => {
    const provider = new BedrockModelProvider(new BedrockModelConfig({ streaming: false }));
    mockedExecSync.mockReturnValue('{}');

    provider.converse('[]');
    const script = captureBedrockScript();

    expect(script).toContain('ConverseCommand');
    expect(script).not.toContain('ConverseStreamCommand');
  });

  it('handles execSync error with stdout', () => {
    const provider = new BedrockModelProvider(new BedrockModelConfig({ streaming: false }));
    const error = new Error('exec failed') as any;
    error.stdout = '{"error": "Model not found"}';
    mockedExecSync.mockImplementation(() => { throw error; });

    const result = provider.converse('[]');
    expect(result).toBe('{"error": "Model not found"}');
  });

  it('handles execSync error without stdout', () => {
    const provider = new BedrockModelProvider(new BedrockModelConfig({ streaming: false }));
    mockedExecSync.mockImplementation(() => { throw new Error('Connection timeout'); });

    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toContain('Connection timeout');
  });

  it('writes temp files for request and script', () => {
    const provider = new BedrockModelProvider(new BedrockModelConfig({ streaming: false }));
    mockedExecSync.mockReturnValue('{}');

    provider.converse('[]');

    // Should have written both a .json request file and a .js script file
    const jsonFiles = [...writtenFiles.keys()].filter(k => k.includes('.json'));
    const jsFiles = [...writtenFiles.keys()].filter(k => k.includes('.js'));
    expect(jsonFiles.length).toBeGreaterThanOrEqual(1);
    expect(jsFiles.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════
// AnthropicToolChoice
// ═══════════════════════════════════════════════════════════

describe('AnthropicToolChoice', () => {
  it('defaults to auto', () => {
    const tc = new AnthropicToolChoice();
    expect(tc.choiceMode).toBe('auto');
    expect(tc.toolName).toBe('');
  });

  it('accepts any mode', () => {
    const tc = new AnthropicToolChoice('any');
    expect(tc.choiceMode).toBe('any');
  });

  it('accepts tool mode with name', () => {
    const tc = new AnthropicToolChoice('tool', 'calculator');
    expect(tc.choiceMode).toBe('tool');
    expect(tc.toolName).toBe('calculator');
  });
});

// ═══════════════════════════════════════════════════════════
// AnthropicModelConfig
// ═══════════════════════════════════════════════════════════

describe('AnthropicModelConfig', () => {
  it('has sensible defaults', () => {
    const cfg = new AnthropicModelConfig();
    expect(cfg.modelId).toContain('claude');
    expect(cfg.maxTokens).toBe(4096);
    expect(cfg.temperature).toBe(-1); // not explicitly set
    expect(cfg.topP).toBe(-1);
    expect(cfg.topK).toBe(-1);
    expect(cfg.baseUrl).toBe('https://api.anthropic.com');
    expect(cfg.anthropicVersion).toBe('2023-06-01');
    expect(cfg.stopSequencesJson).toBe('');
    expect(cfg.thinkingJson).toBe('');
    expect(cfg.additionalParamsJson).toBe('');
  });

  it('accepts all custom options', () => {
    const cfg = new AnthropicModelConfig({
      modelId: 'claude-opus-4-20250514',
      apiKey: 'sk-test',
      maxTokens: 8192,
      temperature: 0.5,
      topP: 0.9,
      topK: 40,
      baseUrl: 'https://custom.api.com',
      anthropicVersion: '2024-01-01',
      stopSequencesJson: '["STOP"]',
      thinkingJson: '{"type":"enabled","budget_tokens":10000}',
      additionalParamsJson: '{"metadata":{"user_id":"u1"}}',
    });
    expect(cfg.modelId).toBe('claude-opus-4-20250514');
    expect(cfg.apiKey).toBe('sk-test');
    expect(cfg.maxTokens).toBe(8192);
    expect(cfg.temperature).toBe(0.5);
    expect(cfg.topP).toBe(0.9);
    expect(cfg.topK).toBe(40);
    expect(cfg.baseUrl).toBe('https://custom.api.com');
    expect(cfg.anthropicVersion).toBe('2024-01-01');
  });

  it('accepts tool choice', () => {
    const tc = new AnthropicToolChoice('tool', 'search');
    const cfg = new AnthropicModelConfig({ toolChoice: tc });
    expect(cfg.toolChoice?.choiceMode).toBe('tool');
    expect(cfg.toolChoice?.toolName).toBe('search');
  });
});

// ═══════════════════════════════════════════════════════════
// AnthropicModelProvider
// ═══════════════════════════════════════════════════════════

describe('AnthropicModelProvider', () => {
  it('instantiates with defaults', () => {
    const provider = new AnthropicModelProvider();
    expect(provider.providerName).toBe('anthropic');
    expect(provider.modelId).toContain('claude');
  });

  it('instantiates with custom config', () => {
    const cfg = new AnthropicModelConfig({ modelId: 'claude-opus-4-20250514', apiKey: 'test-key' });
    const provider = new AnthropicModelProvider(cfg);
    expect(provider.modelId).toBe('claude-opus-4-20250514');
  });

  it('formats simple text messages correctly', () => {
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({ apiKey: 'test' }));
    const anthropicResponse = {
      content: [{ type: 'text', text: 'Hello!' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    mockedExecSync.mockReturnValue(JSON.stringify(anthropicResponse));

    const result = JSON.parse(provider.converse(
      JSON.stringify([{ role: 'user', content: [{ text: 'Hi' }] }]),
    ));

    expect(result.output.message.content[0].text).toBe('Hello!');
    expect(result.stopReason).toBe('end_turn');
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(5);
  });

  it('formats request with system prompt', () => {
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      content: [{ type: 'text', text: 'ok' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    }));

    provider.converse('[]', 'Be helpful');
    const request = captureWrittenRequest();

    expect(request.system).toBe('Be helpful');
  });

  it('formats tool specs in Anthropic format', () => {
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      content: [], stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 },
    }));

    const tools = [{ name: 'calc', description: 'Calculator', inputSchema: { type: 'object' } }];
    provider.converse('[]', undefined, JSON.stringify(tools));
    const request = captureWrittenRequest();

    expect(request.tools[0].name).toBe('calc');
    expect(request.tools[0].input_schema).toEqual({ type: 'object' });
    // Should NOT have inputSchema (OpenAI format)
    expect(request.tools[0].inputSchema).toBeUndefined();
  });

  it('converts tool_use response to Bedrock format', () => {
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      content: [
        { type: 'text', text: 'Let me calculate' },
        { type: 'tool_use', id: 'tu_1', name: 'calculator', input: { expr: '2+2' } },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 20, output_tokens: 15 },
    }));

    const result = JSON.parse(provider.converse('[]'));

    expect(result.output.message.content).toHaveLength(2);
    expect(result.output.message.content[0].text).toBe('Let me calculate');
    expect(result.output.message.content[1].toolUse.name).toBe('calculator');
    expect(result.output.message.content[1].toolUse.toolUseId).toBe('tu_1');
    expect(result.output.message.content[1].toolUse.input).toEqual({ expr: '2+2' });
    expect(result.stopReason).toBe('tool_use');
  });

  it('converts thinking response to reasoningContent', () => {
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({
      apiKey: 'test',
      thinkingJson: '{"type":"enabled","budget_tokens":5000}',
    }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      content: [
        { type: 'thinking', thinking: 'Let me think...', signature: 'sig123' },
        { type: 'text', text: 'The answer is 4' },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 30, output_tokens: 20 },
    }));

    const result = JSON.parse(provider.converse('[]'));

    expect(result.output.message.content[0].reasoningContent.reasoningText.text).toBe('Let me think...');
    expect(result.output.message.content[0].reasoningContent.reasoningText.signature).toBe('sig123');
    expect(result.output.message.content[1].text).toBe('The answer is 4');
  });

  it('includes sampling parameters only when set', () => {
    // Default: temperature=-1, topP=-1, topK=-1 → should NOT be in request
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      content: [], stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 },
    }));

    provider.converse('[]');
    const request = captureWrittenRequest();

    expect(request.temperature).toBeUndefined();
    expect(request.top_p).toBeUndefined();
    expect(request.top_k).toBeUndefined();
  });

  it('includes sampling parameters when explicitly set', () => {
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({
      apiKey: 'test', temperature: 0.8, topP: 0.95, topK: 50,
    }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      content: [], stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 },
    }));

    provider.converse('[]');
    const request = captureWrittenRequest();

    expect(request.temperature).toBe(0.8);
    expect(request.top_p).toBe(0.95);
    expect(request.top_k).toBe(50);
  });

  it('formats tool choice auto', () => {
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({
      apiKey: 'test', toolChoice: new AnthropicToolChoice('auto'),
    }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      content: [], stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 },
    }));

    provider.converse('[]');
    const request = captureWrittenRequest();
    expect(request.tool_choice).toEqual({ type: 'auto' });
  });

  it('formats tool choice any', () => {
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({
      apiKey: 'test', toolChoice: new AnthropicToolChoice('any'),
    }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      content: [], stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 },
    }));

    provider.converse('[]');
    const request = captureWrittenRequest();
    expect(request.tool_choice).toEqual({ type: 'any' });
  });

  it('formats tool choice with specific tool', () => {
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({
      apiKey: 'test', toolChoice: new AnthropicToolChoice('tool', 'search'),
    }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      content: [], stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 },
    }));

    provider.converse('[]');
    const request = captureWrittenRequest();
    expect(request.tool_choice).toEqual({ type: 'tool', name: 'search' });
  });

  it('formats toolUse blocks in messages (Bedrock→Anthropic)', () => {
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      content: [], stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 },
    }));

    const messages = [
      { role: 'user', content: [{ text: 'Calculate 2+2' }] },
      { role: 'assistant', content: [{ toolUse: { toolUseId: 'tu1', name: 'calc', input: { expr: '2+2' } } }] },
      { role: 'user', content: [{ toolResult: { toolUseId: 'tu1', content: [{ text: '4' }] } }] },
    ];

    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();

    // User message
    expect(request.messages[0].content[0]).toEqual({ type: 'text', text: 'Calculate 2+2' });
    // Assistant with tool_use
    expect(request.messages[1].content[0].type).toBe('tool_use');
    expect(request.messages[1].content[0].id).toBe('tu1');
    expect(request.messages[1].content[0].name).toBe('calc');
    // Tool result
    expect(request.messages[2].content[0].type).toBe('tool_result');
    expect(request.messages[2].content[0].tool_use_id).toBe('tu1');
  });

  it('formats tool result with error status', () => {
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      content: [], stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 },
    }));

    const messages = [
      { role: 'user', content: [{ toolResult: { toolUseId: 'tu1', status: 'error', content: [{ text: 'Division by zero' }] } }] },
    ];

    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();

    expect(request.messages[0].content[0].is_error).toBe(true);
  });

  it('handles cache points in messages', () => {
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      content: [], stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 },
    }));

    const messages = [
      { role: 'user', content: [{ text: 'Long context here' }, { cachePoint: {} }] },
    ];

    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();

    // cache_control should be on the preceding text block
    expect(request.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' });
    // cachePoint itself should NOT appear
    expect(request.messages[0].content).toHaveLength(1);
  });

  it('formats reasoning content in messages (Bedrock→Anthropic)', () => {
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      content: [], stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 },
    }));

    const messages = [
      { role: 'assistant', content: [
        { reasoningContent: { reasoningText: { text: 'Thinking...', signature: 'sig' } } },
        { text: 'Answer' },
      ] },
    ];

    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();

    expect(request.messages[0].content[0].type).toBe('thinking');
    expect(request.messages[0].content[0].thinking).toBe('Thinking...');
    expect(request.messages[0].content[0].signature).toBe('sig');
  });

  it('maps stop_reason correctly', () => {
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({ apiKey: 'test' }));

    const testCases = [
      { stop_reason: 'end_turn', expected: 'end_turn' },
      { stop_reason: 'tool_use', expected: 'tool_use' },
      { stop_reason: 'max_tokens', expected: 'max_tokens' },
      { stop_reason: 'stop_sequence', expected: 'stop_sequence' },
    ];

    for (const tc of testCases) {
      mockedExecSync.mockReturnValue(JSON.stringify({
        content: [{ type: 'text', text: 'x' }],
        stop_reason: tc.stop_reason,
        usage: { input_tokens: 1, output_tokens: 1 },
      }));

      const result = JSON.parse(provider.converse('[]'));
      expect(result.stopReason).toBe(tc.expected);
    }
  });

  it('includes cache usage metrics', () => {
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      content: [{ type: 'text', text: 'ok' }],
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 20,
        cache_read_input_tokens: 80,
      },
    }));

    const result = JSON.parse(provider.converse('[]'));
    expect(result.usage.cacheCreationInputTokens).toBe(20);
    expect(result.usage.cacheReadInputTokens).toBe(80);
  });

  it('handles API error response', () => {
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      error: { type: 'invalid_request_error', message: 'Invalid API key' },
    }));

    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toContain('Invalid API key');
  });

  it('handles rate limit error from stdout', () => {
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({ apiKey: 'test' }));
    const error = new Error('curl failed') as any;
    error.stdout = JSON.stringify({
      error: { type: 'rate_limit_error', message: 'Rate limited' },
    });
    mockedExecSync.mockImplementation(() => { throw error; });

    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toContain('Throttled');
  });

  it('handles context overflow error', () => {
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({ apiKey: 'test' }));
    const error = new Error('curl failed') as any;
    error.stdout = JSON.stringify({
      error: { type: 'invalid_request_error', message: 'prompt is too long for context window' },
    });
    mockedExecSync.mockImplementation(() => { throw error; });

    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toContain('Context overflow');
  });

  it('merges additional params into request body', () => {
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({
      apiKey: 'test',
      additionalParamsJson: '{"metadata":{"user_id":"u123"}}',
    }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      content: [], stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 },
    }));

    provider.converse('[]');
    const request = captureWrittenRequest();
    expect(request.metadata).toEqual({ user_id: 'u123' });
  });
});

// ═══════════════════════════════════════════════════════════
// OpenAIToolChoice
// ═══════════════════════════════════════════════════════════

describe('OpenAIToolChoice', () => {
  it('defaults to auto', () => {
    const tc = new OpenAIToolChoice();
    expect(tc.choiceMode).toBe('auto');
    expect(tc.functionName).toBe('');
  });

  it('accepts required mode', () => {
    const tc = new OpenAIToolChoice('required');
    expect(tc.choiceMode).toBe('required');
  });

  it('accepts function mode with name', () => {
    const tc = new OpenAIToolChoice('function', 'search');
    expect(tc.choiceMode).toBe('function');
    expect(tc.functionName).toBe('search');
  });
});

// ═══════════════════════════════════════════════════════════
// OpenAIModelConfig
// ═══════════════════════════════════════════════════════════

describe('OpenAIModelConfig', () => {
  it('has sensible defaults', () => {
    const cfg = new OpenAIModelConfig();
    expect(cfg.modelId).toBe('gpt-4o');
    expect(cfg.maxTokens).toBe(-1);
    expect(cfg.temperature).toBe(-1);
    expect(cfg.topP).toBe(-1);
    expect(cfg.frequencyPenalty).toBe(999);
    expect(cfg.presencePenalty).toBe(999);
    expect(cfg.seed).toBe(-1);
    expect(cfg.baseUrl).toBe('https://api.openai.com');
    expect(cfg.stopSequencesJson).toBe('');
    expect(cfg.additionalParamsJson).toBe('');
  });

  it('accepts all custom options', () => {
    const cfg = new OpenAIModelConfig({
      modelId: 'gpt-4-turbo',
      apiKey: 'sk-test',
      maxTokens: 2048,
      temperature: 0.3,
      topP: 0.8,
      frequencyPenalty: 0.5,
      presencePenalty: 0.3,
      seed: 42,
      baseUrl: 'https://custom.openai.com',
      stopSequencesJson: '["\\n"]',
      additionalParamsJson: '{"logprobs":true}',
    });
    expect(cfg.modelId).toBe('gpt-4-turbo');
    expect(cfg.maxTokens).toBe(2048);
    expect(cfg.temperature).toBe(0.3);
    expect(cfg.frequencyPenalty).toBe(0.5);
    expect(cfg.seed).toBe(42);
    expect(cfg.baseUrl).toBe('https://custom.openai.com');
  });
});

// ═══════════════════════════════════════════════════════════
// OpenAIModelProvider
// ═══════════════════════════════════════════════════════════

describe('OpenAIModelProvider', () => {
  it('instantiates with defaults', () => {
    const provider = new OpenAIModelProvider();
    expect(provider.providerName).toBe('openai');
    expect(provider.modelId).toBe('gpt-4o');
  });

  it('formats simple text conversation', () => {
    const provider = new OpenAIModelProvider(new OpenAIModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }));

    const result = JSON.parse(provider.converse(
      JSON.stringify([{ role: 'user', content: [{ text: 'Hi' }] }]),
    ));

    expect(result.output.message.content[0].text).toBe('Hello!');
    expect(result.stopReason).toBe('end_turn');
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(5);
    expect(result.usage.totalTokens).toBe(15);
  });

  it('formats system prompt as system message', () => {
    const provider = new OpenAIModelProvider(new OpenAIModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }));

    provider.converse('[]', 'You are helpful');
    const request = captureWrittenRequest();

    expect(request.messages[0]).toEqual({ role: 'system', content: 'You are helpful' });
  });

  it('formats tool specs in OpenAI function format', () => {
    const provider = new OpenAIModelProvider(new OpenAIModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      choices: [{ message: { content: '' }, finish_reason: 'stop' }],
      usage: {},
    }));

    const tools = [{ name: 'calc', description: 'Calculator', inputSchema: { type: 'object', properties: { x: { type: 'number' } } } }];
    provider.converse('[]', undefined, JSON.stringify(tools));
    const request = captureWrittenRequest();

    expect(request.tools[0].type).toBe('function');
    expect(request.tools[0].function.name).toBe('calc');
    expect(request.tools[0].function.parameters.type).toBe('object');
  });

  it('converts tool_calls response to Bedrock toolUse format', () => {
    const provider = new OpenAIModelProvider(new OpenAIModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      choices: [{
        message: {
          content: 'Let me calculate',
          tool_calls: [{
            id: 'call_1',
            type: 'function',
            function: { name: 'calc', arguments: '{"expr":"2+2"}' },
          }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    }));

    const result = JSON.parse(provider.converse('[]'));

    expect(result.output.message.content[0].text).toBe('Let me calculate');
    expect(result.output.message.content[1].toolUse.name).toBe('calc');
    expect(result.output.message.content[1].toolUse.toolUseId).toBe('call_1');
    expect(result.output.message.content[1].toolUse.input).toEqual({ expr: '2+2' });
    expect(result.stopReason).toBe('tool_use');
  });

  it('converts reasoning_content to Bedrock reasoningContent', () => {
    const provider = new OpenAIModelProvider(new OpenAIModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      choices: [{
        message: { content: 'The answer is 4', reasoning_content: 'I need to add 2+2...' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }));

    const result = JSON.parse(provider.converse('[]'));

    expect(result.output.message.content[0].reasoningContent.reasoningText.text).toBe('I need to add 2+2...');
    expect(result.output.message.content[1].text).toBe('The answer is 4');
  });

  it('only includes explicitly set parameters', () => {
    const provider = new OpenAIModelProvider(new OpenAIModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      choices: [{ message: { content: '' }, finish_reason: 'stop' }], usage: {},
    }));

    provider.converse('[]');
    const request = captureWrittenRequest();

    // None of these should be present with defaults
    expect(request.max_tokens).toBeUndefined();
    expect(request.temperature).toBeUndefined();
    expect(request.top_p).toBeUndefined();
    expect(request.frequency_penalty).toBeUndefined();
    expect(request.presence_penalty).toBeUndefined();
    expect(request.seed).toBeUndefined();
  });

  it('includes all explicitly set parameters', () => {
    const provider = new OpenAIModelProvider(new OpenAIModelConfig({
      apiKey: 'test',
      maxTokens: 1024,
      temperature: 0.5,
      topP: 0.9,
      frequencyPenalty: 0.3,
      presencePenalty: 0.1,
      seed: 123,
    }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      choices: [{ message: { content: '' }, finish_reason: 'stop' }], usage: {},
    }));

    provider.converse('[]');
    const request = captureWrittenRequest();

    expect(request.max_tokens).toBe(1024);
    expect(request.temperature).toBe(0.5);
    expect(request.top_p).toBe(0.9);
    expect(request.frequency_penalty).toBe(0.3);
    expect(request.presence_penalty).toBe(0.1);
    expect(request.seed).toBe(123);
  });

  it('formats tool choice auto', () => {
    const provider = new OpenAIModelProvider(new OpenAIModelConfig({
      apiKey: 'test', toolChoice: new OpenAIToolChoice('auto'),
    }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      choices: [{ message: { content: '' }, finish_reason: 'stop' }], usage: {},
    }));

    provider.converse('[]');
    const request = captureWrittenRequest();
    expect(request.tool_choice).toBe('auto');
  });

  it('formats tool choice required', () => {
    const provider = new OpenAIModelProvider(new OpenAIModelConfig({
      apiKey: 'test', toolChoice: new OpenAIToolChoice('required'),
    }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      choices: [{ message: { content: '' }, finish_reason: 'stop' }], usage: {},
    }));

    provider.converse('[]');
    const request = captureWrittenRequest();
    expect(request.tool_choice).toBe('required');
  });

  it('formats tool choice function with name', () => {
    const provider = new OpenAIModelProvider(new OpenAIModelConfig({
      apiKey: 'test', toolChoice: new OpenAIToolChoice('function', 'search'),
    }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      choices: [{ message: { content: '' }, finish_reason: 'stop' }], usage: {},
    }));

    provider.converse('[]');
    const request = captureWrittenRequest();
    expect(request.tool_choice).toEqual({ type: 'function', function: { name: 'search' } });
  });

  it('formats assistant messages with tool_calls (Bedrock→OpenAI)', () => {
    const provider = new OpenAIModelProvider(new OpenAIModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      choices: [{ message: { content: '' }, finish_reason: 'stop' }], usage: {},
    }));

    const messages = [
      { role: 'assistant', content: [
        { text: 'Calling calc' },
        { toolUse: { toolUseId: 'call_1', name: 'calc', input: { x: 5 } } },
      ] },
    ];

    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();

    const assistantMsg = request.messages.find((m: any) => m.role === 'assistant');
    expect(assistantMsg.content).toBe('Calling calc');
    expect(assistantMsg.tool_calls[0].id).toBe('call_1');
    expect(assistantMsg.tool_calls[0].function.name).toBe('calc');
    expect(assistantMsg.tool_calls[0].function.arguments).toBe('{"x":5}');
  });

  it('formats tool results as tool messages (Bedrock→OpenAI)', () => {
    const provider = new OpenAIModelProvider(new OpenAIModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      choices: [{ message: { content: '' }, finish_reason: 'stop' }], usage: {},
    }));

    const messages = [
      { role: 'user', content: [
        { toolResult: { toolUseId: 'call_1', content: [{ text: 'Result: 42' }] } },
      ] },
    ];

    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();

    const toolMsg = request.messages.find((m: any) => m.role === 'tool');
    expect(toolMsg.tool_call_id).toBe('call_1');
    expect(toolMsg.content).toBe('Result: 42'); // single text optimization
  });

  it('maps finish_reason correctly', () => {
    const provider = new OpenAIModelProvider(new OpenAIModelConfig({ apiKey: 'test' }));

    const testCases = [
      { finish_reason: 'stop', expected: 'end_turn' },
      { finish_reason: 'tool_calls', expected: 'tool_use' },
      { finish_reason: 'length', expected: 'max_tokens' },
      { finish_reason: 'content_filter', expected: 'content_filtered' },
    ];

    for (const tc of testCases) {
      mockedExecSync.mockReturnValue(JSON.stringify({
        choices: [{ message: { content: 'x' }, finish_reason: tc.finish_reason }],
        usage: {},
      }));

      const result = JSON.parse(provider.converse('[]'));
      expect(result.stopReason).toBe(tc.expected);
    }
  });

  it('handles context_length_exceeded error', () => {
    const provider = new OpenAIModelProvider(new OpenAIModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      error: { code: 'context_length_exceeded', message: 'Too many tokens' },
    }));

    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toContain('Context overflow');
  });

  it('handles rate limit error', () => {
    const provider = new OpenAIModelProvider(new OpenAIModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      error: { code: 'rate_limit_exceeded', message: 'Rate limit hit' },
    }));

    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toContain('Throttled');
  });

  it('handles no choices in response', () => {
    const provider = new OpenAIModelProvider(new OpenAIModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({ choices: [] }));

    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toContain('No response');
  });

  it('merges additional params into request body', () => {
    const provider = new OpenAIModelProvider(new OpenAIModelConfig({
      apiKey: 'test',
      additionalParamsJson: '{"logprobs":true,"top_logprobs":5}',
    }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      choices: [{ message: { content: '' }, finish_reason: 'stop' }], usage: {},
    }));

    provider.converse('[]');
    const request = captureWrittenRequest();
    expect(request.logprobs).toBe(true);
    expect(request.top_logprobs).toBe(5);
  });

  it('skips reasoning content in multi-turn messages', () => {
    const provider = new OpenAIModelProvider(new OpenAIModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      choices: [{ message: { content: '' }, finish_reason: 'stop' }], usage: {},
    }));

    const messages = [
      { role: 'assistant', content: [
        { reasoningContent: { reasoningText: { text: 'thinking...' } } },
        { text: 'The answer is 4' },
      ] },
    ];

    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();

    const assistantMsg = request.messages.find((m: any) => m.role === 'assistant');
    // reasoning should be filtered, only text remains
    expect(assistantMsg.content).toBe('The answer is 4');
  });
});

// ═══════════════════════════════════════════════════════════
// OllamaModelConfig
// ═══════════════════════════════════════════════════════════

describe('OllamaModelConfig', () => {
  it('has sensible defaults', () => {
    const cfg = new OllamaModelConfig();
    expect(cfg.modelId).toBe('llama3');
    expect(cfg.host).toBe('http://localhost:11434');
    expect(cfg.maxTokens).toBe(-1);
    expect(cfg.temperature).toBe(-1);
    expect(cfg.topP).toBe(-1);
    expect(cfg.topK).toBe(-1);
    expect(cfg.keepAlive).toBe('5m');
    expect(cfg.stopSequencesJson).toBe('');
    expect(cfg.optionsJson).toBe('');
    expect(cfg.additionalArgsJson).toBe('');
  });

  it('accepts all custom options', () => {
    const cfg = new OllamaModelConfig({
      modelId: 'qwen3:8b',
      host: 'http://gpu-server:11434',
      maxTokens: 2048,
      temperature: 0.8,
      topP: 0.95,
      topK: 40,
      keepAlive: '10m',
      stopSequencesJson: '["END"]',
      optionsJson: '{"num_ctx":8192,"repeat_penalty":1.1}',
      additionalArgsJson: '{"format":"json"}',
    });
    expect(cfg.modelId).toBe('qwen3:8b');
    expect(cfg.host).toBe('http://gpu-server:11434');
    expect(cfg.maxTokens).toBe(2048);
    expect(cfg.keepAlive).toBe('10m');
    expect(JSON.parse(cfg.optionsJson).num_ctx).toBe(8192);
  });
});

// ═══════════════════════════════════════════════════════════
// OllamaModelProvider
// ═══════════════════════════════════════════════════════════

describe('OllamaModelProvider', () => {
  it('instantiates with defaults', () => {
    const provider = new OllamaModelProvider();
    expect(provider.providerName).toBe('ollama');
    expect(provider.modelId).toBe('llama3');
  });

  it('formats simple text conversation', () => {
    const provider = new OllamaModelProvider(new OllamaModelConfig({ modelId: 'llama3' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      message: { role: 'assistant', content: 'Hello!' },
      done: true,
      done_reason: 'stop',
      prompt_eval_count: 10,
      eval_count: 5,
      total_duration: 1000000000,
    }));

    const result = JSON.parse(provider.converse(
      JSON.stringify([{ role: 'user', content: [{ text: 'Hi' }] }]),
    ));

    expect(result.output.message.content[0].text).toBe('Hello!');
    expect(result.stopReason).toBe('end_turn');
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(5);
  });

  it('formats system prompt as system message', () => {
    const provider = new OllamaModelProvider(new OllamaModelConfig());
    mockedExecSync.mockReturnValue(JSON.stringify({
      message: { role: 'assistant', content: 'ok' }, done: true,
    }));

    provider.converse('[]', 'You are a pirate');
    const request = captureWrittenRequest();

    expect(request.messages[0]).toEqual({ role: 'system', content: 'You are a pirate' });
  });

  it('formats tool specs in function format', () => {
    const provider = new OllamaModelProvider(new OllamaModelConfig());
    mockedExecSync.mockReturnValue(JSON.stringify({
      message: { role: 'assistant', content: '' }, done: true,
    }));

    const tools = [{ name: 'calc', description: 'Math', inputSchema: { type: 'object' } }];
    provider.converse('[]', undefined, JSON.stringify(tools));
    const request = captureWrittenRequest();

    expect(request.tools[0].type).toBe('function');
    expect(request.tools[0].function.name).toBe('calc');
  });

  it('converts tool_calls response to Bedrock toolUse', () => {
    const provider = new OllamaModelProvider(new OllamaModelConfig());
    mockedExecSync.mockReturnValue(JSON.stringify({
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{ function: { name: 'calc', arguments: { x: 5 } } }],
      },
      done: true,
    }));

    const result = JSON.parse(provider.converse('[]'));

    expect(result.output.message.content[0].toolUse.name).toBe('calc');
    expect(result.output.message.content[0].toolUse.input).toEqual({ x: 5 });
    expect(result.stopReason).toBe('tool_use');
  });

  it('sets stream:false in request (jsii sync requirement)', () => {
    const provider = new OllamaModelProvider(new OllamaModelConfig());
    mockedExecSync.mockReturnValue(JSON.stringify({
      message: { role: 'assistant', content: '' }, done: true,
    }));

    provider.converse('[]');
    const request = captureWrittenRequest();
    expect(request.stream).toBe(false);
  });

  it('includes options from convenience params', () => {
    const provider = new OllamaModelProvider(new OllamaModelConfig({
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      maxTokens: 2048,
      stopSequencesJson: '["STOP"]',
    }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      message: { role: 'assistant', content: '' }, done: true,
    }));

    provider.converse('[]');
    const request = captureWrittenRequest();

    expect(request.options.temperature).toBe(0.7);
    expect(request.options.top_p).toBe(0.9);
    expect(request.options.top_k).toBe(40);
    expect(request.options.num_predict).toBe(2048);
    expect(request.options.stop).toEqual(['STOP']);
  });

  it('merges base options with convenience params (convenience wins)', () => {
    const provider = new OllamaModelProvider(new OllamaModelConfig({
      temperature: 0.5, // convenience
      optionsJson: '{"temperature":0.9,"num_ctx":8192}', // base
    }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      message: { role: 'assistant', content: '' }, done: true,
    }));

    provider.converse('[]');
    const request = captureWrittenRequest();

    // Convenience param should override base
    expect(request.options.temperature).toBe(0.5);
    expect(request.options.num_ctx).toBe(8192); // from base
  });

  it('includes keep_alive in request', () => {
    const provider = new OllamaModelProvider(new OllamaModelConfig({ keepAlive: '10m' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      message: { role: 'assistant', content: '' }, done: true,
    }));

    provider.converse('[]');
    const request = captureWrittenRequest();
    expect(request.keep_alive).toBe('10m');
  });

  it('merges additional args into request body', () => {
    const provider = new OllamaModelProvider(new OllamaModelConfig({
      additionalArgsJson: '{"format":"json"}',
    }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      message: { role: 'assistant', content: '' }, done: true,
    }));

    provider.converse('[]');
    const request = captureWrittenRequest();
    expect(request.format).toBe('json');
  });

  it('flattens messages (Ollama format)', () => {
    const provider = new OllamaModelProvider(new OllamaModelConfig());
    mockedExecSync.mockReturnValue(JSON.stringify({
      message: { role: 'assistant', content: '' }, done: true,
    }));

    const messages = [
      { role: 'user', content: [{ text: 'Part 1' }, { text: 'Part 2' }] },
    ];

    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();

    // Each text block becomes a separate message (Ollama doesn't support content arrays)
    expect(request.messages[0]).toEqual({ role: 'user', content: 'Part 1' });
    expect(request.messages[1]).toEqual({ role: 'user', content: 'Part 2' });
  });

  it('formats tool results with JSON content', () => {
    const provider = new OllamaModelProvider(new OllamaModelConfig());
    mockedExecSync.mockReturnValue(JSON.stringify({
      message: { role: 'assistant', content: '' }, done: true,
    }));

    const messages = [
      { role: 'user', content: [
        { toolResult: { toolUseId: 'tu1', content: [{ json: { result: 42 } }] } },
      ] },
    ];

    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();

    const toolMsg = request.messages.find((m: any) => m.role === 'tool');
    expect(toolMsg.content).toBe('{"result":42}');
  });

  it('maps done_reason to stopReason correctly', () => {
    const provider = new OllamaModelProvider(new OllamaModelConfig());

    // stop → end_turn
    mockedExecSync.mockReturnValue(JSON.stringify({
      message: { role: 'assistant', content: 'x' }, done: true, done_reason: 'stop',
    }));
    expect(JSON.parse(provider.converse('[]')).stopReason).toBe('end_turn');

    // length → max_tokens
    mockedExecSync.mockReturnValue(JSON.stringify({
      message: { role: 'assistant', content: 'x' }, done: true, done_reason: 'length',
    }));
    expect(JSON.parse(provider.converse('[]')).stopReason).toBe('max_tokens');
  });

  it('includes latency metrics', () => {
    const provider = new OllamaModelProvider(new OllamaModelConfig());
    mockedExecSync.mockReturnValue(JSON.stringify({
      message: { role: 'assistant', content: 'ok' },
      done: true,
      total_duration: 2500000000, // 2.5s in nanoseconds
    }));

    const result = JSON.parse(provider.converse('[]'));
    expect(result.metrics.latencyMs).toBe(2500);
  });

  it('handles connection refused error', () => {
    const provider = new OllamaModelProvider(new OllamaModelConfig());
    mockedExecSync.mockImplementation(() => {
      throw new Error('Connection refused');
    });

    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toContain('Ollama server not reachable');
    expect(result.error).toContain('ollama serve');
  });

  it('handles Ollama error response in stdout', () => {
    const provider = new OllamaModelProvider(new OllamaModelConfig());
    const error = new Error('curl failed') as any;
    error.stdout = JSON.stringify({ error: 'model not found' });
    mockedExecSync.mockImplementation(() => { throw error; });

    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toBe('model not found');
  });
});

// ═══════════════════════════════════════════════════════════
// GeminiModelConfig
// ═══════════════════════════════════════════════════════════

describe('GeminiModelConfig', () => {
  it('has sensible defaults', () => {
    const cfg = new GeminiModelConfig();
    expect(cfg.modelId).toBe('gemini-2.5-flash');
    expect(cfg.maxTokens).toBe(4096);
    expect(cfg.temperature).toBe(-1);
    expect(cfg.topP).toBe(-1);
    expect(cfg.topK).toBe(-1);
    expect(cfg.stopSequencesJson).toBe('');
    expect(cfg.geminiToolsJson).toBe('');
    expect(cfg.additionalParamsJson).toBe('');
    expect(cfg.thinkingBudgetTokens).toBe(-1);
  });

  it('accepts all custom options', () => {
    const cfg = new GeminiModelConfig({
      modelId: 'gemini-2.0-pro',
      apiKey: 'AIza-test',
      maxTokens: 8192,
      temperature: 0.8,
      topP: 0.95,
      topK: 50,
      stopSequencesJson: '["END"]',
      geminiToolsJson: '[{"googleSearch":{}}]',
      additionalParamsJson: '{"candidateCount":1}',
      thinkingBudgetTokens: 10000,
    });
    expect(cfg.modelId).toBe('gemini-2.0-pro');
    expect(cfg.maxTokens).toBe(8192);
    expect(cfg.thinkingBudgetTokens).toBe(10000);
  });
});

// ═══════════════════════════════════════════════════════════
// GeminiModelProvider
// ═══════════════════════════════════════════════════════════

describe('GeminiModelProvider', () => {
  it('instantiates with defaults', () => {
    const provider = new GeminiModelProvider();
    expect(provider.providerName).toBe('gemini');
    expect(provider.modelId).toContain('gemini');
  });

  it('formats simple text conversation', () => {
    const provider = new GeminiModelProvider(new GeminiModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      candidates: [{
        content: { role: 'model', parts: [{ text: 'Hello!' }] },
        finishReason: 'STOP',
      }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
    }));

    const result = JSON.parse(provider.converse(
      JSON.stringify([{ role: 'user', content: [{ text: 'Hi' }] }]),
    ));

    expect(result.output.message.content[0].text).toBe('Hello!');
    expect(result.stopReason).toBe('end_turn');
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(5);
  });

  it('formats system prompt as systemInstruction', () => {
    const provider = new GeminiModelProvider(new GeminiModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'STOP' }],
    }));

    provider.converse('[]', 'Be helpful');
    const request = captureWrittenRequest();

    expect(request.systemInstruction).toEqual({ parts: [{ text: 'Be helpful' }] });
  });

  it('formats tool specs as functionDeclarations', () => {
    const provider = new GeminiModelProvider(new GeminiModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'STOP' }],
    }));

    const tools = [{ name: 'calc', description: 'Math', inputSchema: { type: 'object' } }];
    provider.converse('[]', undefined, JSON.stringify(tools));
    const request = captureWrittenRequest();

    expect(request.tools[0].functionDeclarations[0].name).toBe('calc');
    expect(request.tools[0].functionDeclarations[0].parameters).toEqual({ type: 'object' });
  });

  it('includes Gemini-specific tools (GoogleSearch)', () => {
    const provider = new GeminiModelProvider(new GeminiModelConfig({
      apiKey: 'test',
      geminiToolsJson: '[{"googleSearch":{}}]',
    }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'STOP' }],
    }));

    provider.converse('[]');
    const request = captureWrittenRequest();

    expect(request.tools[0]).toEqual({ googleSearch: {} });
  });

  it('converts functionCall response to Bedrock toolUse', () => {
    const provider = new GeminiModelProvider(new GeminiModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      candidates: [{
        content: {
          role: 'model',
          parts: [
            { text: 'Let me calculate' },
            { functionCall: { name: 'calc', args: { x: 5 }, id: 'fc_1' } },
          ],
        },
        finishReason: 'STOP',
      }],
      usageMetadata: {},
    }));

    const result = JSON.parse(provider.converse('[]'));

    expect(result.output.message.content[0].text).toBe('Let me calculate');
    expect(result.output.message.content[1].toolUse.name).toBe('calc');
    expect(result.output.message.content[1].toolUse.toolUseId).toBe('fc_1');
    expect(result.output.message.content[1].toolUse.input).toEqual({ x: 5 });
    expect(result.stopReason).toBe('tool_use');
  });

  it('generates toolUseId when Gemini doesnt provide one', () => {
    const provider = new GeminiModelProvider(new GeminiModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      candidates: [{
        content: {
          parts: [{ functionCall: { name: 'calc', args: {} } }],
        },
        finishReason: 'STOP',
      }],
    }));

    const result = JSON.parse(provider.converse('[]'));
    expect(result.output.message.content[0].toolUse.toolUseId).toMatch(/^tooluse_/);
  });

  it('converts thinking parts to reasoningContent', () => {
    const provider = new GeminiModelProvider(new GeminiModelConfig({
      apiKey: 'test',
      thinkingBudgetTokens: 5000,
    }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      candidates: [{
        content: {
          parts: [
            { text: 'Thinking about this...', thought: true, thoughtSignature: 'sig123' },
            { text: 'The answer is 42' },
          ],
        },
        finishReason: 'STOP',
      }],
      usageMetadata: {},
    }));

    const result = JSON.parse(provider.converse('[]'));

    expect(result.output.message.content[0].reasoningContent.reasoningText.text).toBe('Thinking about this...');
    expect(result.output.message.content[0].reasoningContent.reasoningText.signature).toBe('sig123');
    expect(result.output.message.content[1].text).toBe('The answer is 42');
  });

  it('includes thinking config in generationConfig', () => {
    const provider = new GeminiModelProvider(new GeminiModelConfig({
      apiKey: 'test',
      thinkingBudgetTokens: 8000,
    }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'STOP' }],
    }));

    provider.converse('[]');
    const request = captureWrittenRequest();

    expect(request.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 8000 });
  });

  it('includes generation config parameters only when set', () => {
    const provider = new GeminiModelProvider(new GeminiModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'STOP' }],
    }));

    provider.converse('[]');
    const request = captureWrittenRequest();

    expect(request.generationConfig.maxOutputTokens).toBe(4096);
    expect(request.generationConfig.temperature).toBeUndefined();
    expect(request.generationConfig.topP).toBeUndefined();
    expect(request.generationConfig.topK).toBeUndefined();
  });

  it('includes generation config parameters when explicitly set', () => {
    const provider = new GeminiModelProvider(new GeminiModelConfig({
      apiKey: 'test',
      temperature: 0.5,
      topP: 0.9,
      topK: 40,
      stopSequencesJson: '["END"]',
    }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'STOP' }],
    }));

    provider.converse('[]');
    const request = captureWrittenRequest();

    expect(request.generationConfig.temperature).toBe(0.5);
    expect(request.generationConfig.topP).toBe(0.9);
    expect(request.generationConfig.topK).toBe(40);
    expect(request.generationConfig.stopSequences).toEqual(['END']);
  });

  it('formats toolUse in messages (Bedrock→Gemini functionCall)', () => {
    const provider = new GeminiModelProvider(new GeminiModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'STOP' }],
    }));

    const messages = [
      { role: 'assistant', content: [
        { toolUse: { toolUseId: 'tu1', name: 'calc', input: { x: 5 } } },
      ] },
    ];

    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();

    // assistant → model in Gemini
    expect(request.contents[0].role).toBe('model');
    expect(request.contents[0].parts[0].functionCall.name).toBe('calc');
    expect(request.contents[0].parts[0].functionCall.id).toBe('tu1');
  });

  it('formats toolResult in messages (Bedrock→Gemini functionResponse)', () => {
    const provider = new GeminiModelProvider(new GeminiModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'STOP' }],
    }));

    const messages = [
      // Need to include the toolUse first so the id→name mapping is built
      { role: 'assistant', content: [
        { toolUse: { toolUseId: 'tu1', name: 'calc', input: {} } },
      ] },
      { role: 'user', content: [
        { toolResult: { toolUseId: 'tu1', content: [{ text: '42' }] } },
      ] },
    ];

    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();

    const userContent = request.contents[1]; // user message with tool result
    expect(userContent.parts[0].functionResponse.name).toBe('calc');
    expect(userContent.parts[0].functionResponse.id).toBe('tu1');
  });

  it('maps finishReason correctly', () => {
    const provider = new GeminiModelProvider(new GeminiModelConfig({ apiKey: 'test' }));

    const testCases = [
      { finishReason: 'STOP', expected: 'end_turn' },
      { finishReason: 'MAX_TOKENS', expected: 'max_tokens' },
      { finishReason: 'SAFETY', expected: 'content_filtered' },
      { finishReason: 'RECITATION', expected: 'content_filtered' },
    ];

    for (const tc of testCases) {
      mockedExecSync.mockReturnValue(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'x' }] }, finishReason: tc.finishReason }],
      }));

      const result = JSON.parse(provider.converse('[]'));
      expect(result.stopReason).toBe(tc.expected);
    }
  });

  it('handles RESOURCE_EXHAUSTED error', () => {
    const provider = new GeminiModelProvider(new GeminiModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' },
    }));

    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toContain('Throttled');
  });

  it('handles context overflow error', () => {
    const provider = new GeminiModelProvider(new GeminiModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      error: { status: 'INVALID_ARGUMENT', message: 'exceeds the maximum number of tokens' },
    }));

    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toContain('Context overflow');
  });

  it('handles no candidates in response', () => {
    const provider = new GeminiModelProvider(new GeminiModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({ candidates: [] }));

    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toBeDefined();
  });

  it('merges additional params into generationConfig', () => {
    const provider = new GeminiModelProvider(new GeminiModelConfig({
      apiKey: 'test',
      additionalParamsJson: '{"candidateCount":1,"responseMimeType":"application/json"}',
    }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'STOP' }],
    }));

    provider.converse('[]');
    const request = captureWrittenRequest();
    expect(request.generationConfig.candidateCount).toBe(1);
    expect(request.generationConfig.responseMimeType).toBe('application/json');
  });

  it('handles reasoningContent in input messages (Bedrock→Gemini)', () => {
    const provider = new GeminiModelProvider(new GeminiModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'STOP' }],
    }));

    const messages = [
      { role: 'assistant', content: [
        { reasoningContent: { reasoningText: { text: 'thinking...', signature: 'sig' } } },
        { text: 'Answer' },
      ] },
    ];

    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();

    expect(request.contents[0].parts[0].thought).toBe(true);
    expect(request.contents[0].parts[0].text).toBe('thinking...');
    expect(request.contents[0].parts[0].thoughtSignature).toBe('sig');
    expect(request.contents[0].parts[1].text).toBe('Answer');
  });

  it('formats thoughtSignature on functionCall response', () => {
    const provider = new GeminiModelProvider(new GeminiModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            functionCall: { name: 'calc', args: {}, id: 'fc1' },
            thoughtSignature: 'sig456',
          }],
        },
        finishReason: 'STOP',
      }],
    }));

    const result = JSON.parse(provider.converse('[]'));
    expect(result.output.message.content[0].toolUse.reasoningSignature).toBe('sig456');
  });
});

// ═══════════════════════════════════════════════════════════
// Cross-Provider: Bedrock Converse Format Roundtrip
// ═══════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════
// Anthropic: Image, Document, ToolResult edge cases
// ═══════════════════════════════════════════════════════════

describe('AnthropicModelProvider — content block formatting', () => {
  let provider: AnthropicModelProvider;

  beforeEach(() => {
    provider = new AnthropicModelProvider(new AnthropicModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      content: [], stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 },
    }));
  });

  it('formats image content blocks (base64 string)', () => {
    const messages = [{
      role: 'user', content: [{
        image: { source: { bytes: 'iVBORw0KGgo=' }, format: 'png' },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const block = request.messages[0].content[0];
    expect(block.type).toBe('image');
    expect(block.source.type).toBe('base64');
    expect(block.source.media_type).toBe('image/png');
    expect(block.source.data).toBe('iVBORw0KGgo=');
  });

  it('formats image content with jpeg format', () => {
    const messages = [{
      role: 'user', content: [{
        image: { source: { bytes: 'abc123' }, format: 'jpeg' },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    expect(request.messages[0].content[0].source.media_type).toBe('image/jpeg');
  });

  it('skips image with no bytes', () => {
    const messages = [{
      role: 'user', content: [{ text: 'hi' }, { image: { format: 'png' } }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    expect(request.messages[0].content).toHaveLength(1);
    expect(request.messages[0].content[0].type).toBe('text');
  });

  it('formats document content blocks (text/plain)', () => {
    const messages = [{
      role: 'user', content: [{
        document: { source: { bytes: 'Hello doc' }, format: 'txt', name: 'readme' },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const block = request.messages[0].content[0];
    expect(block.type).toBe('document');
    expect(block.source.type).toBe('text');
    expect(block.source.media_type).toBe('text/plain');
    expect(block.source.data).toBe('Hello doc');
    expect(block.title).toBe('readme');
  });

  it('formats document content blocks (pdf/base64)', () => {
    const messages = [{
      role: 'user', content: [{
        document: { source: { bytes: 'JVBERi0=' }, format: 'pdf', name: 'report' },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const block = request.messages[0].content[0];
    expect(block.source.type).toBe('base64');
    expect(block.source.media_type).toBe('application/pdf');
  });

  it('skips document with no bytes', () => {
    const messages = [{
      role: 'user', content: [{ text: 'hi' }, { document: { format: 'pdf', name: 'x' } }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    expect(request.messages[0].content).toHaveLength(1);
  });

  it('formats tool result with json content', () => {
    const messages = [{
      role: 'user', content: [{
        toolResult: { toolUseId: 'tu1', content: [{ json: { answer: 42 } }] },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const trBlock = request.messages[0].content[0];
    expect(trBlock.content[0]).toEqual({ type: 'text', text: '{"answer":42}' });
  });

  it('formats tool result with image content', () => {
    const messages = [{
      role: 'user', content: [{
        toolResult: {
          toolUseId: 'tu1',
          content: [{ image: { source: { bytes: 'abc' }, format: 'png' } }],
        },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const trBlock = request.messages[0].content[0];
    expect(trBlock.content[0].type).toBe('image');
  });

  it('formats tool result with fallback (unknown) content', () => {
    const messages = [{
      role: 'user', content: [{
        toolResult: { toolUseId: 'tu1', content: [{ customField: 'data' }] },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const trBlock = request.messages[0].content[0];
    expect(trBlock.content[0]).toEqual({ type: 'text', text: '{"customField":"data"}' });
  });

  it('formats tool result with non-array content (stringified)', () => {
    const messages = [{
      role: 'user', content: [{
        toolResult: { toolUseId: 'tu1', content: 'plain string result' },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const trBlock = request.messages[0].content[0];
    expect(trBlock.content).toBe('"plain string result"');
  });

  it('includes stop_sequences in request', () => {
    const p = new AnthropicModelProvider(new AnthropicModelConfig({
      apiKey: 'test', stopSequencesJson: '["\\nUser:", "STOP"]',
    }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      content: [], stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 },
    }));
    p.converse('[]');
    const request = captureWrittenRequest();
    expect(request.stop_sequences).toEqual(['\nUser:', 'STOP']);
  });

  it('includes thinking config in request body', () => {
    const p = new AnthropicModelProvider(new AnthropicModelConfig({
      apiKey: 'test', thinkingJson: '{"type":"enabled","budget_tokens":5000}',
    }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      content: [], stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 },
    }));
    p.converse('[]');
    const request = captureWrittenRequest();
    expect(request.thinking).toEqual({ type: 'enabled', budget_tokens: 5000 });
  });

  it('passes through unknown block types', () => {
    const messages = [{
      role: 'user', content: [{ text: 'hi' }, { unknownType: 'value' }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    // unknown block should be passed as-is
    expect(request.messages[0].content).toHaveLength(2);
  });

  it('handles error with non-JSON stdout', () => {
    const error = new Error('curl failed') as any;
    error.stdout = 'Not valid JSON at all';
    mockedExecSync.mockImplementation(() => { throw error; });
    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toContain('curl failed');
  });

  it('handles error with no stdout and no message', () => {
    const error = {} as any;
    mockedExecSync.mockImplementation(() => { throw error; });
    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toBe('Anthropic API error');
  });

  it('handles generic error from stdout (non rate_limit, non context)', () => {
    const error = new Error('curl failed') as any;
    error.stdout = JSON.stringify({
      error: { type: 'authentication_error', message: 'Invalid credentials' },
    });
    mockedExecSync.mockImplementation(() => { throw error; });
    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toBe('Invalid credentials');
  });

  it('skips empty messages after formatting', () => {
    // A message with only a cachePoint should produce no formatted content
    // and thus be excluded from the messages array
    const messages = [
      { role: 'user', content: [{ cachePoint: {} }] },
      { role: 'user', content: [{ text: 'actual content' }] },
    ];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    // First message should be omitted (empty after filtering cachePoint)
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0].content[0].type).toBe('text');
  });
});

// ═══════════════════════════════════════════════════════════
// OpenAI: Image, Document, ToolResult edge cases
// ═══════════════════════════════════════════════════════════

describe('OpenAIModelProvider — content block formatting', () => {
  let provider: OpenAIModelProvider;

  beforeEach(() => {
    provider = new OpenAIModelProvider(new OpenAIModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      choices: [{ message: { content: '' }, finish_reason: 'stop' }], usage: {},
    }));
  });

  it('formats image content blocks (base64 data URI)', () => {
    const messages = [{
      role: 'user', content: [{ image: { source: { bytes: 'iVBORw0KGgo=' }, format: 'png' } }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const userMsg = request.messages.find((m: any) => m.role === 'user');
    expect(userMsg.content[0].type).toBe('image_url');
    expect(userMsg.content[0].image_url.url).toContain('data:image/png;base64,');
  });

  it('formats image with gif format', () => {
    const messages = [{
      role: 'user', content: [{ image: { source: { bytes: 'R0lGODlh' }, format: 'gif' } }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const userMsg = request.messages.find((m: any) => m.role === 'user');
    expect(userMsg.content[0].image_url.format).toBe('image/gif');
  });

  it('skips image with no bytes', () => {
    const messages = [{
      role: 'user', content: [{ text: 'hi' }, { image: { format: 'png' } }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const userMsg = request.messages.find((m: any) => m.role === 'user');
    expect(userMsg.content).toBe('hi');
  });

  it('formats document content blocks (file with data URI)', () => {
    const messages = [{
      role: 'user', content: [{
        document: { source: { bytes: 'JVBERi0=' }, format: 'pdf', name: 'report.pdf' },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const userMsg = request.messages.find((m: any) => m.role === 'user');
    expect(userMsg.content[0].type).toBe('file');
    expect(userMsg.content[0].file.filename).toBe('report.pdf');
    expect(userMsg.content[0].file.file_data).toContain('data:application/pdf;base64,');
  });

  it('skips document with no bytes', () => {
    const messages = [{
      role: 'user', content: [{ text: 'hi' }, { document: { format: 'pdf', name: 'x' } }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const userMsg = request.messages.find((m: any) => m.role === 'user');
    expect(userMsg.content).toBe('hi');
  });

  it('formats multi-content user messages as array', () => {
    const messages = [{
      role: 'user', content: [
        { text: 'Look at this' },
        { image: { source: { bytes: 'abc' }, format: 'png' } },
      ],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const userMsg = request.messages.find((m: any) => m.role === 'user');
    expect(Array.isArray(userMsg.content)).toBe(true);
    expect(userMsg.content).toHaveLength(2);
  });

  it('formats tool result with JSON content', () => {
    const messages = [{
      role: 'user', content: [{
        toolResult: { toolUseId: 'c1', content: [{ json: { result: 42 } }] },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const toolMsg = request.messages.find((m: any) => m.role === 'tool');
    expect(toolMsg.content).toBe('{"result":42}');
  });

  it('formats tool result with multiple text items as array', () => {
    const messages = [{
      role: 'user', content: [{
        toolResult: { toolUseId: 'c1', content: [{ text: 'line1' }, { text: 'line2' }] },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const toolMsg = request.messages.find((m: any) => m.role === 'tool');
    expect(Array.isArray(toolMsg.content)).toBe(true);
    expect(toolMsg.content).toHaveLength(2);
  });

  it('splits images from tool results into user messages', () => {
    const messages = [{
      role: 'user', content: [{
        toolResult: {
          toolUseId: 'c1',
          content: [
            { text: 'Here is the chart' },
            { image: { source: { bytes: 'imgdata' }, format: 'png' } },
          ],
        },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();

    // Tool message should have text + note about image
    const toolMsg = request.messages.find((m: any) => m.role === 'tool');
    expect(toolMsg).toBeDefined();

    // Image should be in a separate user message
    const userMsgs = request.messages.filter((m: any) => m.role === 'user');
    const imageUserMsg = userMsgs.find((m: any) =>
      Array.isArray(m.content) && m.content.some((c: any) => c.type === 'image_url'),
    );
    expect(imageUserMsg).toBeDefined();
  });

  it('handles stop_sequences', () => {
    const p = new OpenAIModelProvider(new OpenAIModelConfig({
      apiKey: 'test', stopSequencesJson: '["\\n\\n", "DONE"]',
    }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      choices: [{ message: { content: '' }, finish_reason: 'stop' }], usage: {},
    }));
    p.converse('[]');
    const request = captureWrittenRequest();
    expect(request.stop).toEqual(['\n\n', 'DONE']);
  });

  it('handles alternative context overflow messages', () => {
    mockedExecSync.mockReturnValue(JSON.stringify({
      error: { message: 'Input is too long for requested model' },
    }));
    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toContain('Context overflow');
  });

  it('handles rate limit via message text', () => {
    mockedExecSync.mockReturnValue(JSON.stringify({
      error: { message: 'Rate limit exceeded for this model' },
    }));
    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toContain('Throttled');
  });

  it('handles error with non-JSON stdout (OpenAI)', () => {
    const error = new Error('curl failed') as any;
    error.stdout = 'some garbage';
    mockedExecSync.mockImplementation(() => { throw error; });
    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toContain('curl failed');
  });

  it('handles error with no stdout and no message', () => {
    const error = {} as any;
    mockedExecSync.mockImplementation(() => { throw error; });
    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toBe('OpenAI API error');
  });

  it('handles error with valid JSON stdout containing error', () => {
    const error = new Error('curl failed') as any;
    error.stdout = JSON.stringify({ error: { code: 'rate_limit_exceeded', message: 'Too many requests' } });
    mockedExecSync.mockImplementation(() => { throw error; });
    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toContain('Throttled');
  });

  it('formats assistant with non-text content blocks (mixed)', () => {
    const messages = [{
      role: 'assistant', content: [
        { text: 'Here is the image' },
        { image: { source: { bytes: 'abc' }, format: 'png' } },
      ],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const assistantMsg = request.messages.find((m: any) => m.role === 'assistant');
    // Mixed content should use array format (not joined string)
    expect(Array.isArray(assistantMsg.content)).toBe(true);
  });

  it('skips assistant messages with no content and no tool_calls', () => {
    const messages = [
      { role: 'assistant', content: [{ reasoningContent: { reasoningText: { text: 'think' } } }] },
    ];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    // Should be filtered out
    expect(request.messages.filter((m: any) => m.role === 'assistant')).toHaveLength(0);
  });

  it('handles cachePoint blocks (skipped)', () => {
    const messages = [{
      role: 'user', content: [{ text: 'hi' }, { cachePoint: {} }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const userMsg = request.messages.find((m: any) => m.role === 'user');
    expect(userMsg.content).toBe('hi');
  });

  it('passes through unknown block types', () => {
    const messages = [{
      role: 'user', content: [{ unknownField: 'data' }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const userMsg = request.messages.find((m: any) => m.role === 'user');
    expect(userMsg.content[0].unknownField).toBe('data');
  });
});

// ═══════════════════════════════════════════════════════════
// Ollama: Image, Document, ToolUse, edge cases
// ═══════════════════════════════════════════════════════════

describe('OllamaModelProvider — content block formatting', () => {
  let provider: OllamaModelProvider;

  beforeEach(() => {
    provider = new OllamaModelProvider(new OllamaModelConfig());
    mockedExecSync.mockReturnValue(JSON.stringify({
      message: { role: 'assistant', content: '' }, done: true,
    }));
  });

  it('formats image content (base64)', () => {
    const messages = [{
      role: 'user', content: [{ image: { source: { bytes: 'iVBORw0=' }, format: 'png' } }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const imgMsg = request.messages.find((m: any) => m.images);
    expect(imgMsg.images[0]).toBe('iVBORw0=');
    expect(imgMsg.role).toBe('user');
  });

  it('skips image with no bytes', () => {
    const messages = [{
      role: 'user', content: [{ text: 'hi' }, { image: { format: 'png' } }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0].content).toBe('hi');
  });

  it('formats toolUse blocks in messages', () => {
    const messages = [{
      role: 'assistant', content: [{
        toolUse: { toolUseId: 'tu1', name: 'calc', input: { x: 5 } },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const assistantMsg = request.messages.find((m: any) => m.tool_calls);
    expect(assistantMsg.tool_calls[0].function.name).toBe('tu1'); // Ollama uses toolUseId
    expect(assistantMsg.tool_calls[0].function.arguments).toEqual({ x: 5 });
  });

  it('formats tool result with nested text content', () => {
    const messages = [{
      role: 'user', content: [{
        toolResult: { toolUseId: 'tu1', content: [{ text: 'Result is 42' }] },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const toolMsg = request.messages.find((m: any) => m.role === 'tool');
    expect(toolMsg.content).toBe('Result is 42');
  });

  it('formats document content (text/md)', () => {
    const messages = [{
      role: 'user', content: [{
        document: { source: { bytes: '# Hello\nWorld' }, format: 'md', name: 'readme.md' },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    expect(request.messages[0].content).toContain('[Document: readme.md]');
    expect(request.messages[0].content).toContain('# Hello\nWorld');
  });

  it('formats document content (non-text format)', () => {
    const messages = [{
      role: 'user', content: [{
        document: { source: { bytes: 'JVBERi0=' }, format: 'pdf', name: 'report.pdf' },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    expect(request.messages[0].content).toBe('[Document: report.pdf (pdf)]');
  });

  it('formats document with no bytes', () => {
    const messages = [{
      role: 'user', content: [{
        document: { format: 'pdf', name: 'x.pdf' },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    expect(request.messages[0].content).toBe('[Document: x.pdf (pdf)]');
  });

  it('skips unsupported block types (cachePoint, reasoningContent)', () => {
    const messages = [{
      role: 'user', content: [
        { text: 'hi' },
        { cachePoint: {} },
        { reasoningContent: { reasoningText: { text: 'thinking' } } },
      ],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    // Only the text message should remain
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0].content).toBe('hi');
  });

  it('handles ECONNREFUSED error', () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:11434');
    });
    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toContain('Ollama server not reachable');
  });

  it('handles error with non-JSON stdout', () => {
    const error = new Error('curl error') as any;
    error.stdout = 'garbage output';
    mockedExecSync.mockImplementation(() => { throw error; });
    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toContain('curl error');
  });

  it('handles error with empty message', () => {
    const error = { message: '' } as any;
    mockedExecSync.mockImplementation(() => { throw error; });
    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toBe('Ollama API error');
  });

  it('handles Ollama error in direct response', () => {
    mockedExecSync.mockReturnValue(JSON.stringify({ error: 'model "nonexistent" not found' }));
    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toBe('model "nonexistent" not found');
  });

  it('calculates totalTokens in usage', () => {
    mockedExecSync.mockReturnValue(JSON.stringify({
      message: { role: 'assistant', content: 'ok' },
      done: true,
      prompt_eval_count: 100,
      eval_count: 50,
    }));
    const result = JSON.parse(provider.converse('[]'));
    expect(result.usage.totalTokens).toBe(150);
  });

  it('handles no total_duration (latency = 0)', () => {
    mockedExecSync.mockReturnValue(JSON.stringify({
      message: { role: 'assistant', content: 'ok' }, done: true,
    }));
    const result = JSON.parse(provider.converse('[]'));
    expect(result.metrics.latencyMs).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Gemini: Image, Document, edge cases
// ═══════════════════════════════════════════════════════════

describe('GeminiModelProvider — content block formatting', () => {
  let provider: GeminiModelProvider;

  beforeEach(() => {
    provider = new GeminiModelProvider(new GeminiModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'STOP' }],
    }));
  });

  it('formats image content as inlineData', () => {
    const messages = [{
      role: 'user', content: [{
        image: { source: { bytes: 'iVBORw0=' }, format: 'jpeg' },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const part = request.contents[0].parts[0];
    expect(part.inlineData.mimeType).toBe('image/jpeg');
    expect(part.inlineData.data).toBe('iVBORw0=');
  });

  it('skips image with no bytes', () => {
    const messages = [{
      role: 'user', content: [{ text: 'hi' }, { image: { format: 'png' } }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    expect(request.contents[0].parts).toHaveLength(1);
    expect(request.contents[0].parts[0].text).toBe('hi');
  });

  it('formats document content as inlineData', () => {
    const messages = [{
      role: 'user', content: [{
        document: { source: { bytes: 'JVBERi0=' }, format: 'pdf', name: 'report' },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const part = request.contents[0].parts[0];
    expect(part.inlineData.mimeType).toBe('application/pdf');
    expect(part.inlineData.data).toBe('JVBERi0=');
  });

  it('skips document with no bytes', () => {
    const messages = [{
      role: 'user', content: [{ text: 'hi' }, { document: { format: 'pdf' } }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    expect(request.contents[0].parts).toHaveLength(1);
  });

  it('skips cachePoint blocks', () => {
    const messages = [{
      role: 'user', content: [{ text: 'hi' }, { cachePoint: {} }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    expect(request.contents[0].parts).toHaveLength(1);
  });

  it('passes through unknown block types', () => {
    const messages = [{
      role: 'user', content: [{ customThing: 'data' }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    expect(request.contents[0].parts[0].customThing).toBe('data');
  });

  it('formats toolUse with reasoningSignature', () => {
    const messages = [{
      role: 'assistant', content: [{
        toolUse: { toolUseId: 'tu1', name: 'calc', input: {}, reasoningSignature: 'sig123' },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    expect(request.contents[0].parts[0].thoughtSignature).toBe('sig123');
  });

  it('formats toolResult with json content', () => {
    const messages = [
      { role: 'assistant', content: [{ toolUse: { toolUseId: 'tu1', name: 'calc', input: {} } }] },
      { role: 'user', content: [{
        toolResult: { toolUseId: 'tu1', content: [{ json: { answer: 42 } }] },
      }] },
    ];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const frPart = request.contents[1].parts[0].functionResponse;
    expect(frPart.response.output[0].json).toEqual({ answer: 42 });
  });

  it('formats toolResult with non-array content', () => {
    const messages = [
      { role: 'assistant', content: [{ toolUse: { toolUseId: 'tu1', name: 'calc', input: {} } }] },
      { role: 'user', content: [{
        toolResult: { toolUseId: 'tu1', content: 'raw string result' },
      }] },
    ];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const frPart = request.contents[1].parts[0].functionResponse;
    expect(frPart.response.output).toBe('raw string result');
  });

  it('uses toolUseId as fallback name when not in mapping', () => {
    const messages = [{
      role: 'user', content: [{
        toolResult: { toolUseId: 'unknown_id', content: [{ text: 'ok' }] },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const frPart = request.contents[0].parts[0].functionResponse;
    expect(frPart.name).toBe('unknown_id');
  });

  it('handles UNAVAILABLE error', () => {
    mockedExecSync.mockReturnValue(JSON.stringify({
      error: { status: 'UNAVAILABLE', message: 'Service unavailable' },
    }));
    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toContain('Throttled');
  });

  it('handles generic error status', () => {
    mockedExecSync.mockReturnValue(JSON.stringify({
      error: { status: 'PERMISSION_DENIED', message: 'No access' },
    }));
    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toBe('No access');
  });

  it('handles error with non-JSON stdout', () => {
    const error = new Error('curl failed') as any;
    error.stdout = 'garbage';
    mockedExecSync.mockImplementation(() => { throw error; });
    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toContain('curl failed');
  });

  it('handles error with no message', () => {
    const error = {} as any;
    mockedExecSync.mockImplementation(() => { throw error; });
    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toBe('Gemini API error');
  });

  it('handles error with valid JSON in stdout', () => {
    const error = new Error('curl failed') as any;
    error.stdout = JSON.stringify({
      error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota used' },
    });
    mockedExecSync.mockImplementation(() => { throw error; });
    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toContain('Throttled');
  });

  it('handles no candidates with error message', () => {
    mockedExecSync.mockReturnValue(JSON.stringify({
      candidates: [],
      error: { message: 'blocked by safety' },
    }));
    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toContain('blocked by safety');
  });

  it('handles thinking part without signature', () => {
    mockedExecSync.mockReturnValue(JSON.stringify({
      candidates: [{
        content: {
          parts: [{ text: 'Thinking...', thought: true }, { text: 'Answer' }],
        },
        finishReason: 'STOP',
      }],
    }));
    const result = JSON.parse(provider.converse('[]'));
    expect(result.output.message.content[0].reasoningContent.reasoningText.text).toBe('Thinking...');
    // No signature field when not present
    expect(result.output.message.content[0].reasoningContent.reasoningText.signature).toBeUndefined();
  });

  it('formats reasoning without signature in input messages', () => {
    const messages = [{
      role: 'assistant', content: [{
        reasoningContent: { reasoningText: { text: 'thinking' } },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const part = request.contents[0].parts[0];
    expect(part.thought).toBe(true);
    expect(part.text).toBe('thinking');
    expect(part.thoughtSignature).toBeUndefined();
  });

  it('skips empty messages', () => {
    const messages = [
      { role: 'user', content: [{ cachePoint: {} }] },
      { role: 'user', content: [{ text: 'actual' }] },
    ];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    expect(request.contents).toHaveLength(1);
    expect(request.contents[0].parts[0].text).toBe('actual');
  });
});

// ═══════════════════════════════════════════════════════════
// Bedrock: Additional edge cases
// ═══════════════════════════════════════════════════════════

describe('BedrockModelProvider — additional edge cases', () => {
  it('does not include system when not provided', () => {
    const provider = new BedrockModelProvider(new BedrockModelConfig({ streaming: false }));
    mockedExecSync.mockReturnValue('{}');
    provider.converse('[]');
    const request = captureBedrockWrittenRequest();
    expect(request.system).toBeUndefined();
  });

  it('does not include toolConfig when no tools', () => {
    const provider = new BedrockModelProvider(new BedrockModelConfig({ streaming: false }));
    mockedExecSync.mockReturnValue('{}');
    provider.converse('[]');
    const request = captureBedrockWrittenRequest();
    expect(request.toolConfig).toBeUndefined();
  });

  it('does not include guardrailConfig when no guardrail', () => {
    const provider = new BedrockModelProvider(new BedrockModelConfig({ streaming: false }));
    mockedExecSync.mockReturnValue('{}');
    provider.converse('[]');
    const request = captureBedrockWrittenRequest();
    expect(request.guardrailConfig).toBeUndefined();
  });

  it('does not include additionalModelRequestFields when empty', () => {
    const provider = new BedrockModelProvider(new BedrockModelConfig({ streaming: false }));
    mockedExecSync.mockReturnValue('{}');
    provider.converse('[]');
    const request = captureBedrockWrittenRequest();
    expect(request.additionalModelRequestFields).toBeUndefined();
  });

  it('does not include stopSequences when empty', () => {
    const provider = new BedrockModelProvider(new BedrockModelConfig({ streaming: false }));
    mockedExecSync.mockReturnValue('{}');
    provider.converse('[]');
    const request = captureBedrockWrittenRequest();
    expect(request.inferenceConfig.stopSequences).toBeUndefined();
  });

  it('guardrail without streamProcessingMode omits that field', () => {
    const gc = new GuardrailConfig('g-1', '1', 'enabled');
    const provider = new BedrockModelProvider(new BedrockModelConfig({ guardrail: gc, streaming: false }));
    mockedExecSync.mockReturnValue('{}');
    provider.converse('[]');
    const request = captureBedrockWrittenRequest();
    expect(request.guardrailConfig.streamProcessingMode).toBeUndefined();
  });
});



// ═══════════════════════════════════════════════════════════
// Final Branch Coverage: remaining edge cases
// ═══════════════════════════════════════════════════════════

describe('Anthropic — remaining branch coverage', () => {

  it('handles unknown block type in response (default case)', () => {
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({ apiKey: 'test' }));
    // Return a response with an unknown block type
    mockedExecSync.mockReturnValue(JSON.stringify({
      content: [
        { type: 'text', text: 'ok' },
        { type: 'unknown_future_type', data: 'xyz' },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    }));
    const result = JSON.parse(provider.converse('[]'));
    // Unknown type should be skipped, only text remains
    expect(result.output.message.content).toHaveLength(1);
    expect(result.output.message.content[0].text).toBe('ok');
  });

  it('formats image with Buffer bytes (non-string)', () => {
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      content: [], stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 },
    }));
    // Use an array-like object to simulate Buffer-like bytes
    const messages = [{
      role: 'user', content: [{
        image: { source: { bytes: 'base64str' }, format: 'webp' },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    expect(request.messages[0].content[0].source.media_type).toBe('image/webp');
  });

  it('formats document with md format (text/plain)', () => {
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      content: [], stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 },
    }));
    const messages = [{
      role: 'user', content: [{
        document: { source: { bytes: '# Markdown' }, format: 'md', name: 'notes' },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const block = request.messages[0].content[0];
    expect(block.source.type).toBe('text');
    expect(block.source.media_type).toBe('text/plain');
  });

  it('formats document with unknown format', () => {
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      content: [], stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 },
    }));
    const messages = [{
      role: 'user', content: [{
        document: { source: { bytes: 'data' }, format: 'xyz' },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const block = request.messages[0].content[0];
    expect(block.source.type).toBe('base64');
    expect(block.source.media_type).toBe('application/octet-stream');
  });

  it('formats image with unknown format', () => {
    const provider = new AnthropicModelProvider(new AnthropicModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      content: [], stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 },
    }));
    const messages = [{
      role: 'user', content: [{
        image: { source: { bytes: 'data' }, format: 'bmp' },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    expect(request.messages[0].content[0].source.media_type).toBe('image/png'); // fallback
  });
});

describe('OpenAI — remaining branch coverage', () => {
  it('handles generic error (not overflow, not rate limit)', () => {
    const provider = new OpenAIModelProvider(new OpenAIModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      error: { code: 'server_error', message: 'Internal server error' },
    }));
    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toBe('Internal server error');
  });

  it('handles error.message as serialized object when no message field', () => {
    const provider = new OpenAIModelProvider(new OpenAIModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      error: { code: 'some_code' },
    }));
    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toContain('some_code');
  });

  it('formats image with webp format', () => {
    const provider = new OpenAIModelProvider(new OpenAIModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      choices: [{ message: { content: '' }, finish_reason: 'stop' }], usage: {},
    }));
    const messages = [{
      role: 'user', content: [{
        image: { source: { bytes: 'data' }, format: 'webp' },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const userMsg = request.messages.find((m: any) => m.role === 'user');
    expect(userMsg.content[0].image_url.url).toContain('image/webp');
  });

  it('formats document with txt format', () => {
    const provider = new OpenAIModelProvider(new OpenAIModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      choices: [{ message: { content: '' }, finish_reason: 'stop' }], usage: {},
    }));
    const messages = [{
      role: 'user', content: [{
        document: { source: { bytes: 'hello' }, format: 'txt', name: 'file.txt' },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const userMsg = request.messages.find((m: any) => m.role === 'user');
    expect(userMsg.content[0].file.file_data).toContain('text/plain');
  });

  it('handles alternative overflow: max_tokens exceed context limit', () => {
    const provider = new OpenAIModelProvider(new OpenAIModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      error: { message: "input length and `max_tokens` exceed context limit" },
    }));
    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toContain('Context overflow');
  });

  it('handles alternative overflow: too many total text bytes', () => {
    const provider = new OpenAIModelProvider(new OpenAIModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      error: { message: 'too many total text bytes in request' },
    }));
    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toContain('Context overflow');
  });
});

describe('Ollama — remaining branch coverage', () => {
  it('handles tool result with non-json non-text nested content', () => {
    const provider = new OllamaModelProvider(new OllamaModelConfig());
    mockedExecSync.mockReturnValue(JSON.stringify({
      message: { role: 'assistant', content: '' }, done: true,
    }));
    const messages = [{
      role: 'user', content: [{
        toolResult: { toolUseId: 'tu1', content: [{ image: { source: { bytes: 'abc' }, format: 'png' } }] },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const imgMsg = request.messages.find((m: any) => m.images);
    expect(imgMsg).toBeDefined();
    expect(imgMsg.role).toBe('tool');
  });

  it('handles document with txt format and string bytes', () => {
    const provider = new OllamaModelProvider(new OllamaModelConfig());
    mockedExecSync.mockReturnValue(JSON.stringify({
      message: { role: 'assistant', content: '' }, done: true,
    }));
    const messages = [{
      role: 'user', content: [{
        document: { source: { bytes: 'Hello world content' }, format: 'txt', name: 'notes.txt' },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    expect(request.messages[0].content).toContain('Hello world content');
  });
});

describe('Gemini — remaining branch coverage', () => {
  it('formats toolResult with unknown content item type (return item)', () => {
    const provider = new GeminiModelProvider(new GeminiModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'STOP' }],
    }));
    const messages = [
      { role: 'assistant', content: [{ toolUse: { toolUseId: 'tu1', name: 'calc', input: {} } }] },
      { role: 'user', content: [{
        toolResult: { toolUseId: 'tu1', content: [{ customField: 'data' }] },
      }] },
    ];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    const frPart = request.contents[1].parts[0].functionResponse;
    // Unknown items should be passed through as-is
    expect(frPart.response.output[0]).toEqual({ customField: 'data' });
  });

  it('formats image with unknown format (fallback mime)', () => {
    const provider = new GeminiModelProvider(new GeminiModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'STOP' }],
    }));
    const messages = [{
      role: 'user', content: [{
        image: { source: { bytes: 'data' }, format: 'bmp' },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    expect(request.contents[0].parts[0].inlineData.mimeType).toBe('image/png'); // fallback
  });

  it('formats document with unknown format (fallback mime)', () => {
    const provider = new GeminiModelProvider(new GeminiModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'STOP' }],
    }));
    const messages = [{
      role: 'user', content: [{
        document: { source: { bytes: 'data' }, format: 'xyz' },
      }],
    }];
    provider.converse(JSON.stringify(messages));
    const request = captureWrittenRequest();
    expect(request.contents[0].parts[0].inlineData.mimeType).toBe('application/octet-stream');
  });

  it('handles functionCall response with no args', () => {
    const provider = new GeminiModelProvider(new GeminiModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      candidates: [{
        content: { parts: [{ functionCall: { name: 'calc', id: 'fc1' } }] },
        finishReason: 'STOP',
      }],
    }));
    const result = JSON.parse(provider.converse('[]'));
    expect(result.output.message.content[0].toolUse.input).toEqual({});
  });

  it('handles response with no content parts', () => {
    const provider = new GeminiModelProvider(new GeminiModelConfig({ apiKey: 'test' }));
    mockedExecSync.mockReturnValue(JSON.stringify({
      candidates: [{ content: {}, finishReason: 'STOP' }],
    }));
    const result = JSON.parse(provider.converse('[]'));
    expect(result.output.message.content).toHaveLength(0);
    expect(result.stopReason).toBe('end_turn');
  });
});

describe('Bedrock — remaining branch coverage', () => {
  it('handles error with no stdout and no message (Unknown error)', () => {
    const provider = new BedrockModelProvider(new BedrockModelConfig({ streaming: false }));
    const error = {} as any;
    mockedExecSync.mockImplementation(() => { throw error; });
    const result = JSON.parse(provider.converse('[]'));
    expect(result.error).toBe('Unknown error');
  });
});


describe('Cross-Provider Format Compatibility', () => {
  const standardToolSpec = [
    { name: 'calculator', description: 'Math operations', inputSchema: { type: 'object', properties: { expr: { type: 'string' } } } },
  ];

  it('all providers produce Bedrock Converse-compatible output', () => {
    // Each provider should return { output: { message: { role, content } }, stopReason, usage }
    const providers: [string, ModelProvider, string][] = [
      ['anthropic', new AnthropicModelProvider(new AnthropicModelConfig({ apiKey: 'test' })),
        JSON.stringify({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } })],
      ['openai', new OpenAIModelProvider(new OpenAIModelConfig({ apiKey: 'test' })),
        JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })],
      ['ollama', new OllamaModelProvider(new OllamaModelConfig()),
        JSON.stringify({ message: { role: 'assistant', content: 'ok' }, done: true, done_reason: 'stop' })],
      ['gemini', new GeminiModelProvider(new GeminiModelConfig({ apiKey: 'test' })),
        JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } })],
    ];

    for (const [name, provider, mockResponse] of providers) {
      mockedExecSync.mockReturnValue(mockResponse);

      const result = JSON.parse(provider.converse(
        JSON.stringify([{ role: 'user', content: [{ text: 'Hello' }] }]),
      ));

      // Validate Bedrock Converse format
      expect(result.output).toBeDefined();
      expect(result.output.message).toBeDefined();
      expect(result.output.message.content).toBeDefined();
      expect(Array.isArray(result.output.message.content)).toBe(true);
      expect(result.stopReason).toBeDefined();
      expect(typeof result.stopReason).toBe('string');
      expect(result.usage).toBeDefined();

      // At least one text content block
      const textBlock = result.output.message.content.find((b: any) => b.text !== undefined);
      expect(textBlock).toBeDefined();
      expect(textBlock.text).toBe('ok');
    }
  });

  it('all providers normalize tool_use stopReason', () => {
    const providers: [string, ModelProvider, string][] = [
      ['anthropic', new AnthropicModelProvider(new AnthropicModelConfig({ apiKey: 'test' })),
        JSON.stringify({
          content: [{ type: 'tool_use', id: 'tu', name: 'calc', input: {} }],
          stop_reason: 'tool_use',
          usage: { input_tokens: 1, output_tokens: 1 },
        })],
      ['openai', new OpenAIModelProvider(new OpenAIModelConfig({ apiKey: 'test' })),
        JSON.stringify({
          choices: [{ message: { tool_calls: [{ id: 'tu', type: 'function', function: { name: 'calc', arguments: '{}' } }] }, finish_reason: 'tool_calls' }],
          usage: {},
        })],
      ['ollama', new OllamaModelProvider(new OllamaModelConfig()),
        JSON.stringify({
          message: { tool_calls: [{ function: { name: 'calc', arguments: {} } }] },
          done: true,
        })],
      ['gemini', new GeminiModelProvider(new GeminiModelConfig({ apiKey: 'test' })),
        JSON.stringify({
          candidates: [{ content: { parts: [{ functionCall: { name: 'calc', args: {}, id: 'tu' } }] }, finishReason: 'STOP' }],
        })],
    ];

    for (const [name, provider, mockResponse] of providers) {
      mockedExecSync.mockReturnValue(mockResponse);

      const result = JSON.parse(provider.converse('[]'));
      expect(result.stopReason).toBe('tool_use');

      // Should have toolUse in content
      const toolBlock = result.output.message.content.find((b: any) => b.toolUse);
      expect(toolBlock).toBeDefined();
      expect(toolBlock.toolUse.name).toBe('calc');
    }
  });
});
