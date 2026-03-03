/**
 * UniversalProvider — ONE streaming provider that works with ANY backend.
 * 
 * Usage:
 *   const model = new UniversalProvider({ provider: 'anthropic', apiKey: 'sk-...' });
 *   const model = new UniversalProvider({ provider: 'openai', apiKey: 'sk-...' });
 *   const model = new UniversalProvider({ provider: 'gemini', apiKey: 'AIza...' });
 *
 * The provider config is the ONLY thing that changes. 
 * The streaming SSE parser and agent loop are universal.
 */

import { StreamingModelProvider, StreamEvent } from '../streaming';
import { BUILDERS, PARSERS, type BodyBuilder, type ResponseParser } from './definitions';
import type { ProviderConfig } from './protocol';

// ── SSE Stream Parsers (per-provider, because SSE formats differ) ──

function* parseAnthropicSSE(ev: any): Generator<StreamEvent> {
  if (ev.type === 'message_start') yield { type: 'modelMessageStartEvent', role: 'assistant' };
  else if (ev.type === 'content_block_start') {
    const start: any = { type: 'modelContentBlockStartEvent' };
    if (ev.content_block?.type === 'tool_use') start.start = { type: 'toolUseStart', name: ev.content_block.name, toolUseId: ev.content_block.id };
    yield start;
  } else if (ev.type === 'content_block_delta') {
    if (ev.delta?.type === 'text_delta') yield { type: 'modelContentBlockDeltaEvent', delta: { type: 'textDelta', text: ev.delta.text } };
    else if (ev.delta?.type === 'input_json_delta') yield { type: 'modelContentBlockDeltaEvent', delta: { type: 'toolUseInputDelta', input: ev.delta.partial_json } };
  } else if (ev.type === 'content_block_stop') yield { type: 'modelContentBlockStopEvent' };
  else if (ev.type === 'message_delta') {
    if (ev.delta?.stop_reason) {
      const m: Record<string, string> = { tool_use: 'toolUse', max_tokens: 'maxTokens', stop_sequence: 'stopSequence' };
      yield { type: 'modelMessageStopEvent', stopReason: m[ev.delta.stop_reason] || 'endTurn' };
    }
    if (ev.usage) yield { type: 'modelMetadataEvent', usage: { inputTokens: ev.usage.input_tokens ?? 0, outputTokens: ev.usage.output_tokens ?? 0 } };
  }
}

function* parseOpenAISSE(chunk: any): Generator<StreamEvent> {
  if (!chunk.choices?.length) {
    if (chunk.usage) yield { type: 'modelMetadataEvent', usage: { inputTokens: chunk.usage.prompt_tokens ?? 0, outputTokens: chunk.usage.completion_tokens ?? 0 } };
    return;
  }
  const c = chunk.choices[0], dl = c.delta;
  if (dl?.role) yield { type: 'modelMessageStartEvent', role: dl.role };
  if (dl?.content) yield { type: 'modelContentBlockDeltaEvent', delta: { type: 'textDelta', text: dl.content } };
  if (dl?.tool_calls) {
    for (const tc of dl.tool_calls) {
      if (tc.id && tc.function?.name) yield { type: 'modelContentBlockStartEvent', start: { type: 'toolUseStart', name: tc.function.name, toolUseId: tc.id } };
      if (tc.function?.arguments) yield { type: 'modelContentBlockDeltaEvent', delta: { type: 'toolUseInputDelta', input: tc.function.arguments } };
    }
  }
  if (c.finish_reason) {
    const m: Record<string, string> = { stop: 'endTurn', tool_calls: 'toolUse', length: 'maxTokens' };
    yield { type: 'modelMessageStopEvent', stopReason: m[c.finish_reason] || 'endTurn' };
  }
}

function* parseGeminiSSE(chunk: any): Generator<StreamEvent> {
  const candidate = chunk.candidates?.[0];
  if (!candidate?.content?.parts) return;
  for (const part of candidate.content.parts) {
    if (part.functionCall) {
      const id = part.functionCall.id ?? `tooluse_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      yield { type: 'modelContentBlockStartEvent', start: { type: 'toolUseStart', name: part.functionCall.name, toolUseId: id } };
      yield { type: 'modelContentBlockDeltaEvent', delta: { type: 'toolUseInputDelta', input: JSON.stringify(part.functionCall.args ?? {}) } };
      yield { type: 'modelContentBlockStopEvent' };
    } else if (part.text !== undefined) {
      yield { type: 'modelContentBlockDeltaEvent', delta: { type: 'textDelta', text: part.text } };
    }
  }
  if (chunk.usageMetadata) yield { type: 'modelMetadataEvent', usage: { inputTokens: chunk.usageMetadata.promptTokenCount ?? 0, outputTokens: chunk.usageMetadata.candidatesTokenCount ?? 0 } };
}

const SSE_PARSERS: Record<string, (ev: any) => Generator<StreamEvent>> = {
  anthropic: parseAnthropicSSE,
  openai: parseOpenAISSE,
  gemini: parseGeminiSSE,
};

// ── Universal Provider ──────────────────────────────────────

export class UniversalProvider extends StreamingModelProvider {
  private readonly config: ProviderConfig;
  private readonly builder: BodyBuilder;
  private readonly parser: ResponseParser;
  private readonly sseParser: (ev: any) => Generator<StreamEvent>;

  constructor(config: ProviderConfig) {
    super();
    this.config = config;
    this.builder = BUILDERS[config.provider];
    this.parser = PARSERS[config.provider];
    this.sseParser = SSE_PARSERS[config.provider];

    if (!this.builder) throw new Error(`Unknown provider: ${config.provider}. Available: ${Object.keys(BUILDERS).join(', ')}`);
    if (!this.sseParser) throw new Error(`No SSE parser for provider: ${config.provider}`);
  }

  get modelId(): string { return this.config.modelId ?? BUILDERS[this.config.provider] ? '' : 'unknown'; }
  get providerName(): string { return this.config.provider; }

  async *stream(messagesJson: string, systemPrompt?: string, toolSpecsJson?: string): AsyncGenerator<StreamEvent> {
    const messages = JSON.parse(messagesJson);
    const { url, headers, body } = this.builder(this.config, messages, systemPrompt, toolSpecsJson, true);

    const response = await fetch(url, {
      method: 'POST',
      headers: { ...headers, ...(this.config.headers ?? {}) },
      body: JSON.stringify(body),
    });

    if (!response.ok) throw new Error(`${this.config.provider} ${response.status}: ${await response.text()}`);

    // Anthropic needs initial message start emitted from SSE
    // OpenAI and Gemini need it too but emit it from their first chunk
    let emittedStart = false;
    if (this.config.provider === 'gemini') {
      yield { type: 'modelMessageStartEvent', role: 'assistant' };
      emittedStart = true;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let hasTextBlock = false;
    let hasToolUse = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            for (const event of this.sseParser(parsed)) {
              // Track state for Gemini (which doesn't have explicit block boundaries)
              if (event.type === 'modelContentBlockStartEvent' && event.start?.type === 'toolUseStart') hasToolUse = true;
              if (event.type === 'modelContentBlockDeltaEvent' && event.delta.type === 'textDelta' && !hasTextBlock && this.config.provider === 'openai') {
                yield { type: 'modelContentBlockStartEvent' };
                hasTextBlock = true;
              }
              yield event;
            }
          } catch {}
        }
      }
    } finally { reader.releaseLock(); }

    // Close open text block for OpenAI
    if (hasTextBlock && this.config.provider === 'openai') yield { type: 'modelContentBlockStopEvent' };
    // Gemini needs explicit stop
    if (this.config.provider === 'gemini') yield { type: 'modelMessageStopEvent', stopReason: hasToolUse ? 'toolUse' : 'endTurn' };
  }

  /** Non-streaming converse (uses parent's collector that calls stream()) */
  // Inherited from StreamingModelProvider.converse()
}

/**
 * Create a universal streaming provider with minimal config.
 * 
 * Usage:
 *   const model = createProvider('anthropic', 'sk-ant-...');
 *   const model = createProvider('openai', 'sk-...', { modelId: 'gpt-4o' });
 *   const model = createProvider('gemini', 'AIza...');
 */
export function createProvider(provider: string, apiKey: string, options?: Partial<ProviderConfig>): UniversalProvider {
  return new UniversalProvider({ provider, apiKey, ...options });
}
