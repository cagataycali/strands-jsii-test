/**
 * Anthropic model provider — browser-compatible via fetch().
 * 
 * Drop-in replacement for AnthropicModelProvider.
 * No execSync, no fs, no child_process, no curl.
 * Pure fetch() — works in browsers, service workers, Deno, Bun, Cloudflare Workers.
 */
import { AsyncModelProvider } from './provider';

export interface WebAnthropicOptions {
  readonly modelId?: string;
  readonly apiKey?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly topP?: number;
  readonly topK?: number;
  readonly baseUrl?: string;
  readonly anthropicVersion?: string;
  readonly stopSequences?: string[];
  readonly toolChoiceMode?: string;
  readonly toolChoiceName?: string;
  readonly thinkingBudgetTokens?: number;
  /** Optional proxy URL — routes requests through your backend to avoid CORS */
  readonly proxyUrl?: string;
}

export class WebAnthropicProvider extends AsyncModelProvider {
  private readonly opts: Required<Pick<WebAnthropicOptions, 'modelId' | 'apiKey' | 'maxTokens' | 'baseUrl' | 'anthropicVersion'>> & WebAnthropicOptions;

  constructor(options?: WebAnthropicOptions) {
    super();
    this.opts = {
      modelId: options?.modelId ?? 'claude-sonnet-4-20250514',
      apiKey: options?.apiKey ?? '',
      maxTokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature,
      topP: options?.topP,
      topK: options?.topK,
      baseUrl: options?.baseUrl ?? 'https://api.anthropic.com',
      anthropicVersion: options?.anthropicVersion ?? '2023-06-01',
      stopSequences: options?.stopSequences,
      toolChoiceMode: options?.toolChoiceMode,
      toolChoiceName: options?.toolChoiceName,
      thinkingBudgetTokens: options?.thinkingBudgetTokens,
      proxyUrl: options?.proxyUrl,
    };
  }

  get modelId(): string { return this.opts.modelId; }
  get providerName(): string { return 'anthropic'; }

  async converse(messagesJson: string, systemPrompt?: string, toolSpecsJson?: string): Promise<string> {
    const messages = JSON.parse(messagesJson);
    const anthropicMessages = this.formatMessages(messages);

    const body: Record<string, unknown> = {
      model: this.opts.modelId,
      messages: anthropicMessages,
      max_tokens: this.opts.maxTokens,
    };

    if (this.opts.temperature !== undefined) body.temperature = this.opts.temperature;
    if (this.opts.topP !== undefined) body.top_p = this.opts.topP;
    if (this.opts.topK !== undefined) body.top_k = this.opts.topK;
    if (this.opts.stopSequences) body.stop_sequences = this.opts.stopSequences;
    if (systemPrompt) body.system = systemPrompt;

    if (toolSpecsJson) {
      const specs = JSON.parse(toolSpecsJson);
      body.tools = specs.map((s: any) => ({
        name: s.name, description: s.description, input_schema: s.inputSchema,
      }));
    }

    if (this.opts.toolChoiceMode) {
      if (this.opts.toolChoiceMode === 'tool' && this.opts.toolChoiceName) {
        body.tool_choice = { type: 'tool', name: this.opts.toolChoiceName };
      } else {
        body.tool_choice = { type: this.opts.toolChoiceMode };
      }
    }

    if (this.opts.thinkingBudgetTokens) {
      body.thinking = { type: 'enabled', budget_tokens: this.opts.thinkingBudgetTokens };
    }

    const url = this.opts.proxyUrl
      ? this.opts.proxyUrl
      : `${this.opts.baseUrl}/v1/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.opts.apiKey,
          'anthropic-version': this.opts.anthropicVersion,
          // Required for browser direct calls (Anthropic supports this)
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.error) {
        return JSON.stringify({ error: data.error.message ?? JSON.stringify(data.error) });
      }

      return this.formatResponse(data);
    } catch (err: any) {
      return JSON.stringify({ error: err.message ?? 'Anthropic fetch error' });
    }
  }

  private formatMessages(messages: any[]): any[] {
    const formatted: any[] = [];
    for (const msg of messages) {
      const parts: any[] = [];
      for (const block of (msg.content ?? [])) {
        if (block.text !== undefined) {
          parts.push({ type: 'text', text: block.text });
        } else if (block.toolUse) {
          parts.push({ type: 'tool_use', id: block.toolUse.toolUseId, name: block.toolUse.name, input: block.toolUse.input });
        } else if (block.toolResult) {
          const tr = block.toolResult;
          const content = Array.isArray(tr.content)
            ? tr.content.map((item: any) => item.json !== undefined ? { type: 'text', text: JSON.stringify(item.json) } : item.text !== undefined ? { type: 'text', text: item.text } : { type: 'text', text: JSON.stringify(item) })
            : JSON.stringify(tr.content);
          parts.push({ type: 'tool_result', tool_use_id: tr.toolUseId, content, is_error: tr.status === 'error' });
        } else if (block.reasoningContent) {
          const rc = block.reasoningContent;
          parts.push({ type: 'thinking', thinking: rc.reasoningText?.text ?? '', signature: rc.reasoningText?.signature ?? '' });
        }
      }
      if (parts.length > 0) formatted.push({ role: msg.role, content: parts });
    }
    return formatted;
  }

  private formatResponse(response: any): string {
    const content: any[] = [];
    for (const block of (response.content ?? [])) {
      if (block.type === 'text') content.push({ text: block.text });
      else if (block.type === 'tool_use') content.push({ toolUse: { name: block.name, toolUseId: block.id, input: block.input } });
      else if (block.type === 'thinking') content.push({ reasoningContent: { reasoningText: { text: block.thinking ?? '', signature: block.signature ?? '' } } });
    }
    const stopReason = response.stop_reason === 'tool_use' ? 'tool_use' : response.stop_reason === 'max_tokens' ? 'max_tokens' : 'end_turn';
    return JSON.stringify({
      output: { message: { role: 'assistant', content } },
      stopReason,
      usage: { inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 },
    });
  }
}
