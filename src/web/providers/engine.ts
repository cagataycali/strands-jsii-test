/**
 * UniversalProvider — Browser streaming engine using shared format definitions.
 */
import { StreamingModelProvider, StreamEvent } from '../streaming';
import { REQUEST_BUILDERS, SSE_PARSERS, type StreamChunk } from '../../providers/formats';

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

    // Handle non-200 responses BEFORE trying to stream
    if (!response.ok) {
      let errorText = '';
      try { errorText = await response.text(); } catch {}
      throw new Error(`${this.config.provider} ${response.status}: ${errorText}`);
    }

    // Handle missing body (shouldn't happen with 200, but be safe)
    if (!response.body) {
      throw new Error(`${this.config.provider}: No response body (status ${response.status})`);
    }

    if (this.config.provider === 'gemini') yield { type: 'modelMessageStartEvent', role: 'assistant' };

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let hasTextBlock = false;
    let hasToolUse = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        
        // Split on newlines — handle both \n and \r\n
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          // Handle "data: {json}" and "data:{json}" (some providers don't include space)
          const data = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed.slice(5);
          if (!data || data === '[DONE]') continue;

          let parsed: any;
          try { parsed = JSON.parse(data); } catch { continue; } // Skip non-JSON lines

          // Check for inline error responses in SSE stream
          if (parsed.error) {
            const errMsg = parsed.error.message ?? JSON.stringify(parsed.error);
            throw new Error(`${this.config.provider} stream error: ${errMsg}`);
          }

          const chunks: StreamChunk[] = sseParser ? sseParser(parsed) : [];
          for (const chunk of chunks) {
            const event = this.chunkToEvent(chunk);
            if (!event) continue;

            // Track state
            if (event.type === 'modelContentBlockStartEvent') {
              if ((event as any).start?.type === 'toolUseStart') hasToolUse = true;
            }

            // OpenAI doesn't emit explicit blockStart for text — inject one
            if (event.type === 'modelContentBlockDeltaEvent' && 
                (event as any).delta?.type === 'textDelta' && 
                !hasTextBlock) {
              yield { type: 'modelContentBlockStartEvent' };
              hasTextBlock = true;
            }

            yield event;
          }
        }
      }
    } finally { reader.releaseLock(); }

    // Close any open blocks
    if (hasTextBlock) yield { type: 'modelContentBlockStopEvent' };
    // Gemini needs explicit message stop
    if (this.config.provider === 'gemini') {
      yield { type: 'modelMessageStopEvent', stopReason: hasToolUse ? 'toolUse' : 'endTurn' };
    }
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
