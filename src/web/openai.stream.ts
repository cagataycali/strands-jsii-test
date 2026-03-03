/**
 * Streaming OpenAI provider — SSE via fetch + ReadableStream.
 * Works with OpenAI, Together, Fireworks, vLLM, any OpenAI-compatible endpoint.
 */
import { StreamingModelProvider, StreamEvent } from './streaming';

export interface StreamOpenAIOptions {
  readonly modelId?: string;
  readonly apiKey?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly topP?: number;
  readonly baseUrl?: string;
  readonly stopSequences?: string[];
  readonly proxyUrl?: string;
}

export class StreamOpenAIProvider extends StreamingModelProvider {
  private readonly opts: StreamOpenAIOptions & { modelId: string; apiKey: string; baseUrl: string };

  constructor(options?: StreamOpenAIOptions) {
    super();
    this.opts = { ...options, modelId: options?.modelId ?? 'gpt-4o', apiKey: options?.apiKey ?? '', baseUrl: options?.baseUrl ?? 'https://api.openai.com' };
  }

  get modelId(): string { return this.opts.modelId; }
  get providerName(): string { return 'openai'; }

  async *stream(messagesJson: string, systemPrompt?: string, toolSpecsJson?: string): AsyncGenerator<StreamEvent> {
    const messages = JSON.parse(messagesJson);
    const openaiMessages = this.formatMessages(messages, systemPrompt);

    const body: Record<string, unknown> = { model: this.opts.modelId, messages: openaiMessages, stream: true, stream_options: { include_usage: true } };
    if (this.opts.maxTokens !== undefined) body.max_tokens = this.opts.maxTokens;
    if (this.opts.temperature !== undefined) body.temperature = this.opts.temperature;
    if (this.opts.topP !== undefined) body.top_p = this.opts.topP;
    if (this.opts.stopSequences) body.stop = this.opts.stopSequences;

    if (toolSpecsJson) {
      const specs = JSON.parse(toolSpecsJson);
      body.tools = specs.map((s: any) => ({ type: 'function', function: { name: s.name, description: s.description, parameters: s.inputSchema } }));
    }

    const url = this.opts.proxyUrl ?? `${this.opts.baseUrl}/v1/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Authorization': `Bearer ${this.opts.apiKey}` },
      body: JSON.stringify(body),
    });

    if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '', started = false, textStarted = false;

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
            const chunk = JSON.parse(data);
            if (!chunk.choices?.length) {
              if (chunk.usage) yield { type: 'modelMetadataEvent', usage: { inputTokens: chunk.usage.prompt_tokens || 0, outputTokens: chunk.usage.completion_tokens || 0 } };
              continue;
            }
            const c = chunk.choices[0], dl = c.delta;
            if (dl?.role && !started) { started = true; yield { type: 'modelMessageStartEvent', role: dl.role }; }
            if (dl?.content?.length) {
              if (!textStarted) { textStarted = true; yield { type: 'modelContentBlockStartEvent' }; }
              yield { type: 'modelContentBlockDeltaEvent', delta: { type: 'textDelta', text: dl.content } };
            }
            if (dl?.tool_calls) {
              for (const tc of dl.tool_calls) {
                if (tc.id && tc.function?.name) yield { type: 'modelContentBlockStartEvent', start: { type: 'toolUseStart', name: tc.function.name, toolUseId: tc.id } };
                if (tc.function?.arguments) yield { type: 'modelContentBlockDeltaEvent', delta: { type: 'toolUseInputDelta', input: tc.function.arguments } };
              }
            }
            if (c.finish_reason) {
              if (textStarted) { yield { type: 'modelContentBlockStopEvent' }; textStarted = false; }
              const sm: Record<string, string> = { stop: 'endTurn', tool_calls: 'toolUse', length: 'maxTokens' };
              yield { type: 'modelMessageStopEvent', stopReason: sm[c.finish_reason] || 'endTurn' };
            }
          } catch {}
        }
      }
    } finally { reader.releaseLock(); }
  }

  private formatMessages(messages: any[], systemPrompt?: string): any[] {
    const formatted: any[] = [];
    if (systemPrompt) formatted.push({ role: 'system', content: systemPrompt });
    for (const msg of messages) {
      const contents = msg.content ?? [];
      const regularContents: any[] = [], toolUses: any[] = [], toolResults: any[] = [];
      for (const block of contents) {
        if (block.toolUse) toolUses.push(block.toolUse);
        else if (block.toolResult) toolResults.push(block.toolResult);
        else if (block.text !== undefined) regularContents.push({ type: 'text', text: block.text });
      }
      if (msg.role === 'assistant') {
        const am: Record<string, unknown> = { role: 'assistant' };
        if (regularContents.length) am.content = regularContents.every((c: any) => c.type === 'text') ? regularContents.map((c: any) => c.text).join('') : regularContents;
        if (toolUses.length) am.tool_calls = toolUses.map(tu => ({ id: tu.toolUseId, type: 'function', function: { name: tu.name, arguments: JSON.stringify(tu.input ?? {}) } }));
        if (am.content || am.tool_calls) formatted.push(am);
      } else {
        if (regularContents.length) formatted.push(regularContents.length === 1 && regularContents[0].type === 'text' ? { role: 'user', content: regularContents[0].text } : { role: 'user', content: regularContents });
        for (const tr of toolResults) {
          const items = (tr.content ?? []).map((item: any) => item.json !== undefined ? JSON.stringify(item.json) : item.text ?? JSON.stringify(item));
          formatted.push({ role: 'tool', tool_call_id: tr.toolUseId, content: items.join('\n') });
        }
      }
    }
    return formatted.filter(m => m.content !== undefined || m.tool_calls !== undefined);
  }
}
