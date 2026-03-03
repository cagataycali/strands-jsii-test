/**
 * Tests for shared provider format definitions (src/providers/formats.ts).
 * These run as part of the normal jest suite — no ts-node needed.
 */
import {
  buildAnthropicRequest, parseAnthropicResponse, parseAnthropicSSE,
  buildOpenAIRequest, parseOpenAIResponse, parseOpenAISSE,
  buildGeminiRequest, parseGeminiResponse, parseGeminiSSE,
  buildOllamaRequest, parseOllamaResponse,
  REQUEST_BUILDERS, RESPONSE_PARSERS, SSE_PARSERS,
} from '../src/providers/formats';

const messages = [
  { role: 'user', content: [{ text: 'What is 2+2?' }] },
  { role: 'assistant', content: [{ text: 'Let me calculate.' }, { toolUse: { name: 'calc', toolUseId: 'tu_1', input: { expr: '2+2' } } }] },
  { role: 'user', content: [{ toolResult: { toolUseId: 'tu_1', content: [{ json: { result: 4 } }], status: 'success' } }] },
];

const config = { apiKey: 'test-key', modelId: 'test-model', maxTokens: 100 };

describe('Shared Format Definitions', () => {
  describe('Registry', () => {
    it('has all builders registered', () => {
      expect(Object.keys(REQUEST_BUILDERS)).toEqual(expect.arrayContaining(['anthropic', 'openai', 'gemini', 'ollama']));
    });
    it('has all response parsers', () => {
      expect(Object.keys(RESPONSE_PARSERS)).toEqual(expect.arrayContaining(['anthropic', 'openai', 'gemini', 'ollama']));
    });
    it('has all SSE parsers', () => {
      expect(Object.keys(SSE_PARSERS)).toEqual(expect.arrayContaining(['anthropic', 'openai', 'gemini']));
    });
  });

  describe('Anthropic', () => {
    it('builds request with correct URL and headers', () => {
      const req = buildAnthropicRequest(config, messages, 'You are helpful', undefined, true);
      expect(req.url).toContain('anthropic.com');
      expect(req.headers['x-api-key']).toBe('test-key');
      expect((req.body as any).stream).toBe(true);
      expect((req.body as any).system).toBe('You are helpful');
    });
    it('formats messages correctly', () => {
      const req = buildAnthropicRequest(config, messages);
      expect((req.body as any).messages).toHaveLength(3);
      expect((req.body as any).messages[1].content[1].type).toBe('tool_use');
      expect((req.body as any).messages[2].content[0].type).toBe('tool_result');
    });
    it('parses response', () => {
      const resp = JSON.parse(parseAnthropicResponse({ content: [{ type: 'text', text: 'Four' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }));
      expect(resp.output.message.content[0].text).toBe('Four');
      expect(resp.stopReason).toBe('end_turn');
      expect(resp.usage.inputTokens).toBe(10);
    });
    it('parses SSE text delta', () => {
      const chunks = parseAnthropicSSE({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'hello' } });
      expect(chunks[0].type).toBe('textDelta');
      expect(chunks[0].text).toBe('hello');
    });
    it('parses SSE tool delta', () => {
      const chunks = parseAnthropicSSE({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"x":1}' } });
      expect(chunks[0].type).toBe('toolDelta');
    });
    it('handles error response', () => {
      const resp = JSON.parse(parseAnthropicResponse({ error: { message: 'Rate limited' } }));
      expect(resp.error).toContain('Rate limited');
    });
  });

  describe('OpenAI', () => {
    it('builds request with correct URL and auth', () => {
      const req = buildOpenAIRequest(config, messages, 'You are helpful', undefined, true);
      expect(req.url).toContain('openai.com');
      expect(req.headers['Authorization']).toContain('Bearer');
      expect((req.body as any).stream).toBe(true);
    });
    it('formats system prompt as first message', () => {
      const req = buildOpenAIRequest(config, messages, 'System prompt');
      expect((req.body as any).messages[0].role).toBe('system');
      expect((req.body as any).messages[0].content).toBe('System prompt');
    });
    it('formats tool_calls correctly', () => {
      const req = buildOpenAIRequest(config, messages);
      const assistantMsg = (req.body as any).messages.find((m: any) => m.tool_calls);
      expect(assistantMsg.tool_calls[0].type).toBe('function');
      expect(assistantMsg.tool_calls[0].function.name).toBe('calc');
    });
    it('parses response', () => {
      const resp = JSON.parse(parseOpenAIResponse({ choices: [{ message: { content: 'Four' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
      expect(resp.output.message.content[0].text).toBe('Four');
      expect(resp.stopReason).toBe('end_turn');
    });
    it('classifies context overflow', () => {
      const resp = JSON.parse(parseOpenAIResponse({ error: { message: 'too many total text bytes in request', code: 'invalid_request' } }));
      expect(resp.error).toContain('Context overflow');
    });
    it('parses SSE text delta', () => {
      const chunks = parseOpenAISSE({ choices: [{ delta: { content: 'hi' }, finish_reason: null }] });
      expect(chunks[0].type).toBe('textDelta');
      expect(chunks[0].text).toBe('hi');
    });
  });

  describe('Gemini', () => {
    it('builds request with correct URL', () => {
      const req = buildGeminiRequest(config, messages, 'Be helpful', undefined, true);
      expect(req.url).toContain('googleapis.com');
      expect(req.url).toContain('streamGenerateContent');
    });
    it('maps roles correctly', () => {
      const req = buildGeminiRequest(config, messages);
      expect((req.body as any).contents[1].role).toBe('model');
    });
    it('formats functionCall and functionResponse', () => {
      const req = buildGeminiRequest(config, messages);
      expect((req.body as any).contents[1].parts[1].functionCall).toBeDefined();
      expect((req.body as any).contents[2].parts[0].functionResponse).toBeDefined();
    });
    it('parses response', () => {
      const resp = JSON.parse(parseGeminiResponse({ candidates: [{ content: { parts: [{ text: 'Four' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }));
      expect(resp.output.message.content[0].text).toBe('Four');
    });
    it('maps RECITATION to content_filtered', () => {
      const resp = JSON.parse(parseGeminiResponse({ candidates: [{ content: { parts: [{ text: 'x' }] }, finishReason: 'RECITATION' }] }));
      expect(resp.stopReason).toBe('content_filtered');
    });
    it('parses SSE text', () => {
      const chunks = parseGeminiSSE({ candidates: [{ content: { parts: [{ text: 'hello' }] } }] });
      expect(chunks[0].type).toBe('textDelta');
    });
  });

  describe('Ollama', () => {
    it('builds request with correct URL', () => {
      const req = buildOllamaRequest({ ...config, host: 'http://localhost:11434' }, messages, 'System');
      expect(req.url).toContain('11434');
      expect((req.body as any).messages[0].role).toBe('system');
    });
    it('parses response with tool use', () => {
      const resp = JSON.parse(parseOllamaResponse({ message: { content: '', tool_calls: [{ function: { name: 'calc', arguments: { x: 1 } } }] } }));
      expect(resp.stopReason).toBe('tool_use');
      expect(resp.output.message.content[0].toolUse.name).toBe('calc');
    });
    it('handles connection error message', () => {
      const resp = JSON.parse(parseOllamaResponse({ error: 'Connection refused' }));
      expect(resp.error).toContain('Connection refused');
    });
  });
});
