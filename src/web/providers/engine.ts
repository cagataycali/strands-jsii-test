/**
 * UniversalProvider — Browser streaming engine using shared format definitions.
 * Imports from src/providers/formats.ts (the SINGLE SOURCE OF TRUTH).
 */
import { StreamingModelProvider, StreamEvent } from '../streaming';
import { REQUEST_BUILDERS, RESPONSE_PARSERS, SSE_PARSERS, type ProviderRequest, type StreamChunk } from '../../providers/formats';

export interface ProviderConfig {
  provider: string;
  apiKey: string;
  modelId?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  baseUrl?: string;
  headers?: Record<string, string>;
  proxyUrl?: string;
  [key: string]: unknown;
}

export class UniversalProvider extends StreamingModelProvider {
  private readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    super();
    this.config = config;
    if (!REQUEST_BUILDERS[config.provider]) throw new Error(`Unknown provider: ${config.provider}. Available: ${Object.keys(REQUEST_BUILDERS).join(', ')}`);
  }

  get modelId(): string { return this.config.modelId ?? ''; }
  get providerName(): string { return this.config.provider; }

  async *stream(messagesJson: string, systemPrompt?: string, toolSpecsJson?: string): AsyncGenerator<StreamEvent> {
    const messages = JSON.parse(messagesJson);
    const builder = REQUEST_BUILDERS[this.config.provider];
    const sseParser = SSE_PARSERS[this.config.provider];
    const req = builder(this.config, messages, systemPrompt, toolSpecsJson, true);

    const response = await fetch(req.url, {
      method: 'POST',
      headers: { ...req.headers, ...(this.config.headers ?? {}) },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) throw new Error(`${this.config.provider} ${response.status}: ${await response.text()}`);

    if (this.config.provider === 'gemini') yield { type: 'modelMessageStartEvent', role: 'assistant' };

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '', hasTextBlock = false;

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
            const chunks: StreamChunk[] = sseParser ? sseParser(parsed) : [];
            for (const chunk of chunks) {
              const event = this.chunkToEvent(chunk);
              if (event) {
                if (event.type === 'modelContentBlockDeltaEvent' && event.delta.type === 'textDelta' && !hasTextBlock && this.config.provider === 'openai') {
                  yield { type: 'modelContentBlockStartEvent' };
                  hasTextBlock = true;
                }
                yield event;
              }
            }
          } catch {}
        }
      }
    } finally { reader.releaseLock(); }

    if (hasTextBlock && this.config.provider === 'openai') yield { type: 'modelContentBlockStopEvent' };
    if (this.config.provider === 'gemini') yield { type: 'modelMessageStopEvent', stopReason: 'endTurn' };
  }

  private chunkToEvent(chunk: StreamChunk): StreamEvent | null {
    switch (chunk.type) {
      case 'messageStart': return { type: 'modelMessageStartEvent', role: 'assistant' };
      case 'blockStart': {
        const evt: any = { type: 'modelContentBlockStartEvent' };
        if (chunk.toolName) evt.start = { type: 'toolUseStart', name: chunk.toolName, toolUseId: chunk.toolUseId ?? '' };
        return evt;
      }
      case 'textDelta': return { type: 'modelContentBlockDeltaEvent', delta: { type: 'textDelta', text: chunk.text ?? '' } };
      case 'toolDelta': return { type: 'modelContentBlockDeltaEvent', delta: { type: 'toolUseInputDelta', input: chunk.toolInput ?? '' } };
      case 'blockStop': return { type: 'modelContentBlockStopEvent' };
      case 'messageStop': return { type: 'modelMessageStopEvent', stopReason: chunk.stopReason ?? 'endTurn' };
      case 'metadata': return { type: 'modelMetadataEvent', usage: { inputTokens: chunk.inputTokens ?? 0, outputTokens: chunk.outputTokens ?? 0 } };
      default: return null;
    }
  }
}

export function createProvider(provider: string, apiKey: string, options?: Partial<ProviderConfig>): UniversalProvider {
  return new UniversalProvider({ provider, apiKey, ...options });
}
