/**
 * Streaming Anthropic provider — SSE via fetch + ReadableStream.
 * Full feature parity with agi.diy's AnthropicBrowserModel.
 */
import { StreamingModelProvider, StreamEvent } from './streaming';

export interface StreamAnthropicOptions {
  readonly modelId?: string;
  readonly apiKey?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly topP?: number;
  readonly topK?: number;
  readonly baseUrl?: string;
  readonly anthropicVersion?: string;
  readonly stopSequences?: string[];
  readonly thinkingBudgetTokens?: number;
  readonly proxyUrl?: string;
}

export class StreamAnthropicProvider extends StreamingModelProvider {
  private readonly opts: StreamAnthropicOptions & { modelId: string; apiKey: string; baseUrl: string; anthropicVersion: string; maxTokens: number };

  constructor(options?: StreamAnthropicOptions) {
    super();
    this.opts = {
      ...options,
      modelId: options?.modelId ?? 'claude-sonnet-4-20250514',
      apiKey: options?.apiKey ?? '',
      maxTokens: options?.maxTokens ?? 4096,
      baseUrl: options?.baseUrl ?? 'https://api.anthropic.com',
      anthropicVersion: options?.anthropicVersion ?? '2023-06-01',
    };
  }

  get modelId(): string { return this.opts.modelId; }
  get providerName(): string { return 'anthropic'; }

  async *stream(messagesJson: string, systemPrompt?: string, toolSpecsJson?: string): AsyncGenerator<StreamEvent> {
    const messages = JSON.parse(messagesJson);
    const body: Record<string, unknown> = {
      model: this.opts.modelId,
      messages: this.formatMessages(messages),
      max_tokens: this.opts.maxTokens,
      stream: true,
    };

    if (this.opts.temperature !== undefined) body.temperature = this.opts.temperature;
    if (this.opts.topP !== undefined) body.top_p = this.opts.topP;
    if (this.opts.topK !== undefined) body.top_k = this.opts.topK;
    if (this.opts.stopSequences) body.stop_sequences = this.opts.stopSequences;
    if (systemPrompt) body.system = systemPrompt;

    if (toolSpecsJson) {
      const specs = JSON.parse(toolSpecsJson);
      body.tools = specs.map((s: any) => ({ name: s.name, description: s.description, input_schema: s.inputSchema }));
    }

    if (this.opts.thinkingBudgetTokens) {
      body.thinking = { type: 'enabled', budget_tokens: this.opts.thinkingBudgetTokens };
    }

    const url = this.opts.proxyUrl ?? `${this.opts.baseUrl}/v1/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.opts.apiKey,
        'anthropic-version': this.opts.anthropicVersion,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Anthropic ${response.status}: ${await response.text()}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const ev = JSON.parse(data);

            if (ev.type === 'message_start') {
              yield { type: 'modelMessageStartEvent', role: 'assistant' };
            } else if (ev.type === 'content_block_start') {
              const start: any = { type: 'modelContentBlockStartEvent' };
              if (ev.content_block?.type === 'tool_use') {
                start.start = { type: 'toolUseStart', name: ev.content_block.name, toolUseId: ev.content_block.id };
              }
              yield start;
            } else if (ev.type === 'content_block_delta') {
              if (ev.delta?.type === 'text_delta') {
                yield { type: 'modelContentBlockDeltaEvent', delta: { type: 'textDelta', text: ev.delta.text } };
              } else if (ev.delta?.type === 'input_json_delta') {
                yield { type: 'modelContentBlockDeltaEvent', delta: { type: 'toolUseInputDelta', input: ev.delta.partial_json } };
              }
            } else if (ev.type === 'content_block_stop') {
              yield { type: 'modelContentBlockStopEvent' };
            } else if (ev.type === 'message_delta') {
              if (ev.delta?.stop_reason) {
                const map: Record<string, string> = { tool_use: 'toolUse', max_tokens: 'maxTokens', stop_sequence: 'stopSequence' };
                yield { type: 'modelMessageStopEvent', stopReason: map[ev.delta.stop_reason] || 'endTurn' };
              }
              if (ev.usage) {
                yield { type: 'modelMetadataEvent', usage: { inputTokens: ev.usage.input_tokens || 0, outputTokens: ev.usage.output_tokens || 0 } };
              }
            }
          } catch {}
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private formatMessages(messages: any[]): any[] {
    const formatted: any[] = [];
    for (const msg of messages) {
      const parts: any[] = [];
      for (const block of (msg.content ?? [])) {
        if (block.text !== undefined) parts.push({ type: 'text', text: block.text });
        else if (block.toolUse) parts.push({ type: 'tool_use', id: block.toolUse.toolUseId, name: block.toolUse.name, input: block.toolUse.input });
        else if (block.toolResult) {
          const tr = block.toolResult;
          const content = Array.isArray(tr.content)
            ? tr.content.map((item: any) => item.json !== undefined ? { type: 'text', text: JSON.stringify(item.json) } : item.text !== undefined ? { type: 'text', text: item.text } : { type: 'text', text: JSON.stringify(item) })
            : JSON.stringify(tr.content);
          parts.push({ type: 'tool_result', tool_use_id: tr.toolUseId, content, is_error: tr.status === 'error' });
        } else if (block.reasoningContent) {
          parts.push({ type: 'thinking', thinking: block.reasoningContent.reasoningText?.text ?? '', signature: block.reasoningContent.reasoningText?.signature ?? '' });
        }
      }
      if (parts.length > 0) formatted.push({ role: msg.role, content: parts });
    }
    return formatted;
  }
}
