/**
 * Gemini model provider — browser-compatible via fetch().
 */
import { AsyncModelProvider } from './provider';

export interface WebGeminiOptions {
  readonly modelId?: string;
  readonly apiKey?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly topP?: number;
  readonly topK?: number;
  readonly thinkingBudgetTokens?: number;
  readonly proxyUrl?: string;
}

export class WebGeminiProvider extends AsyncModelProvider {
  private readonly opts: WebGeminiOptions & { modelId: string; apiKey: string };

  constructor(options?: WebGeminiOptions) {
    super();
    this.opts = { ...options, modelId: options?.modelId ?? 'gemini-2.5-flash', apiKey: options?.apiKey ?? '' };
  }

  get modelId(): string { return this.opts.modelId; }
  get providerName(): string { return 'gemini'; }

  async converse(messagesJson: string, systemPrompt?: string, toolSpecsJson?: string): Promise<string> {
    const messages = JSON.parse(messagesJson);
    const toolUseIdToName: Record<string, string> = {};
    for (const msg of messages) for (const b of (msg.content ?? [])) if (b.toolUse) toolUseIdToName[b.toolUse.toolUseId] = b.toolUse.name;

    const contents = this.formatMessages(messages, toolUseIdToName);
    const generationConfig: Record<string, unknown> = { maxOutputTokens: this.opts.maxTokens ?? 4096 };
    if (this.opts.temperature !== undefined) generationConfig.temperature = this.opts.temperature;
    if (this.opts.topP !== undefined) generationConfig.topP = this.opts.topP;
    if (this.opts.topK !== undefined) generationConfig.topK = this.opts.topK;
    if (this.opts.thinkingBudgetTokens) generationConfig.thinkingConfig = { thinkingBudget: this.opts.thinkingBudgetTokens };

    const body: Record<string, unknown> = { contents, generationConfig };
    if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };

    const tools: object[] = [];
    if (toolSpecsJson) {
      const specs = JSON.parse(toolSpecsJson);
      tools.push({ functionDeclarations: specs.map((s: any) => ({ name: s.name, description: s.description, parameters: s.inputSchema })) });
    }
    if (tools.length > 0) body.tools = tools;

    const url = this.opts.proxyUrl ?? `https://generativelanguage.googleapis.com/v1beta/models/${this.opts.modelId}:generateContent?key=${this.opts.apiKey}`;
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (data.error) return JSON.stringify({ error: data.error.message ?? JSON.stringify(data.error) });
      return this.formatResponse(data);
    } catch (err: any) {
      return JSON.stringify({ error: err.message ?? 'Gemini fetch error' });
    }
  }

  private formatMessages(messages: any[], toolUseIdToName: Record<string, string>): any[] {
    const contents: any[] = [];
    for (const msg of messages) {
      const role = msg.role === 'assistant' ? 'model' : 'user';
      const parts: any[] = [];
      for (const block of (msg.content ?? [])) {
        if (block.text !== undefined) parts.push({ text: block.text });
        else if (block.toolUse) {
          toolUseIdToName[block.toolUse.toolUseId] = block.toolUse.name;
          parts.push({ functionCall: { name: block.toolUse.name, args: block.toolUse.input, id: block.toolUse.toolUseId } });
        } else if (block.toolResult) {
          const tr = block.toolResult;
          const name = toolUseIdToName[tr.toolUseId] ?? tr.toolUseId;
          const output = Array.isArray(tr.content) ? tr.content.map((item: any) => item.json !== undefined ? item : item.text !== undefined ? { text: item.text } : item) : tr.content;
          parts.push({ functionResponse: { id: tr.toolUseId, name, response: { output } } });
        } else if (block.reasoningContent) {
          parts.push({ text: block.reasoningContent.reasoningText?.text ?? '', thought: true });
        }
      }
      if (parts.length > 0) contents.push({ role, parts });
    }
    return contents;
  }

  private formatResponse(response: any): string {
    const candidate = response.candidates?.[0];
    if (!candidate) return JSON.stringify({ error: 'No Gemini response candidate' });

    const content: any[] = [];
    let hasToolUse = false;
    for (const part of (candidate.content?.parts ?? [])) {
      if (part.functionCall) {
        const id = part.functionCall.id ?? `tooluse_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        content.push({ toolUse: { name: part.functionCall.name, toolUseId: id, input: part.functionCall.args ?? {} } });
        hasToolUse = true;
      } else if (part.thought && part.text) {
        content.push({ reasoningContent: { reasoningText: { text: part.text, ...(part.thoughtSignature ? { signature: part.thoughtSignature } : {}) } } });
      } else if (part.text !== undefined) {
        content.push({ text: part.text });
      }
    }

    const stopReason = hasToolUse ? 'tool_use' : candidate.finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn';
    return JSON.stringify({
      output: { message: { role: 'assistant', content } }, stopReason,
      usage: { inputTokens: response.usageMetadata?.promptTokenCount ?? 0, outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0 },
    });
  }
}
