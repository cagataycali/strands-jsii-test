/**
 * OpenAI model provider — browser-compatible via fetch().
 * Works with OpenAI, Together, Fireworks, vLLM, any OpenAI-compatible endpoint.
 */
import { AsyncModelProvider } from './provider';

export interface WebOpenAIOptions {
  readonly modelId?: string;
  readonly apiKey?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly topP?: number;
  readonly frequencyPenalty?: number;
  readonly presencePenalty?: number;
  readonly baseUrl?: string;
  readonly stopSequences?: string[];
  readonly proxyUrl?: string;
}

export class WebOpenAIProvider extends AsyncModelProvider {
  private readonly opts: WebOpenAIOptions & { modelId: string; apiKey: string; baseUrl: string };

  constructor(options?: WebOpenAIOptions) {
    super();
    this.opts = {
      ...options,
      modelId: options?.modelId ?? 'gpt-4o',
      apiKey: options?.apiKey ?? '',
      baseUrl: options?.baseUrl ?? 'https://api.openai.com',
    };
  }

  get modelId(): string { return this.opts.modelId; }
  get providerName(): string { return 'openai'; }

  async converse(messagesJson: string, systemPrompt?: string, toolSpecsJson?: string): Promise<string> {
    const messages = JSON.parse(messagesJson);
    const openaiMessages = this.formatMessages(messages, systemPrompt);

    const body: Record<string, unknown> = { model: this.opts.modelId, messages: openaiMessages };
    if (this.opts.maxTokens !== undefined) body.max_tokens = this.opts.maxTokens;
    if (this.opts.temperature !== undefined) body.temperature = this.opts.temperature;
    if (this.opts.topP !== undefined) body.top_p = this.opts.topP;
    if (this.opts.frequencyPenalty !== undefined) body.frequency_penalty = this.opts.frequencyPenalty;
    if (this.opts.presencePenalty !== undefined) body.presence_penalty = this.opts.presencePenalty;
    if (this.opts.stopSequences) body.stop = this.opts.stopSequences;

    if (toolSpecsJson) {
      const specs = JSON.parse(toolSpecsJson);
      body.tools = specs.map((s: any) => ({ type: 'function', function: { name: s.name, description: s.description, parameters: s.inputSchema } }));
    }

    const url = this.opts.proxyUrl ?? `${this.opts.baseUrl}/v1/chat/completions`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Authorization': `Bearer ${this.opts.apiKey}` },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (data.error) return JSON.stringify({ error: data.error.message ?? JSON.stringify(data.error) });
      return this.formatResponse(data);
    } catch (err: any) {
      return JSON.stringify({ error: err.message ?? 'OpenAI fetch error' });
    }
  }

  private formatMessages(messages: any[], systemPrompt?: string): any[] {
    const formatted: any[] = [];
    if (systemPrompt) formatted.push({ role: 'system', content: systemPrompt });

    for (const msg of messages) {
      const contents = msg.content ?? [];
      const regularContents: any[] = [];
      const toolUses: any[] = [];
      const toolResults: any[] = [];

      for (const block of contents) {
        if (block.toolUse) toolUses.push(block.toolUse);
        else if (block.toolResult) toolResults.push(block.toolResult);
        else if (block.text !== undefined) regularContents.push({ type: 'text', text: block.text });
      }

      if (msg.role === 'assistant') {
        const assistantMsg: Record<string, unknown> = { role: 'assistant' };
        if (regularContents.length > 0) {
          const allText = regularContents.every((c: any) => c.type === 'text');
          assistantMsg.content = allText ? regularContents.map((c: any) => c.text).join('') : regularContents;
        }
        if (toolUses.length > 0) {
          assistantMsg.tool_calls = toolUses.map(tu => ({
            id: tu.toolUseId, type: 'function', function: { name: tu.name, arguments: JSON.stringify(tu.input ?? {}) },
          }));
        }
        if (assistantMsg.content || assistantMsg.tool_calls) formatted.push(assistantMsg);
      } else {
        if (regularContents.length > 0) {
          formatted.push(regularContents.length === 1 && regularContents[0].type === 'text'
            ? { role: 'user', content: regularContents[0].text }
            : { role: 'user', content: regularContents });
        }
        for (const tr of toolResults) {
          const contentItems = (tr.content ?? []).map((item: any) => item.json !== undefined ? JSON.stringify(item.json) : item.text ?? JSON.stringify(item));
          formatted.push({ role: 'tool', tool_call_id: tr.toolUseId, content: contentItems.join('\n') });
        }
      }
    }
    return formatted.filter(m => m.content !== undefined || m.tool_calls !== undefined);
  }

  private formatResponse(response: any): string {
    const choice = response.choices?.[0];
    if (!choice) return JSON.stringify({ error: 'No response from OpenAI' });

    const content: any[] = [];
    if (choice.message?.reasoning_content) content.push({ reasoningContent: { reasoningText: { text: choice.message.reasoning_content } } });
    if (choice.message?.content) content.push({ text: choice.message.content });
    if (choice.message?.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        content.push({ toolUse: { name: tc.function.name, toolUseId: tc.id, input: JSON.parse(tc.function.arguments ?? '{}') } });
      }
    }

    const stopReason = choice.finish_reason === 'tool_calls' ? 'tool_use' : choice.finish_reason === 'length' ? 'max_tokens' : 'end_turn';
    return JSON.stringify({
      output: { message: { role: 'assistant', content } }, stopReason,
      usage: { inputTokens: response.usage?.prompt_tokens ?? 0, outputTokens: response.usage?.completion_tokens ?? 0 },
    });
  }
}
