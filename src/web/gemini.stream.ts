/**
 * Streaming Gemini provider — Gemini doesn't have SSE, so we use generateContent
 * and yield the full response as chunks. For true streaming, Gemini requires
 * streamGenerateContent which returns NDJSON — we parse that.
 */
import { StreamingModelProvider, StreamEvent } from './streaming';

export interface StreamGeminiOptions {
  readonly modelId?: string;
  readonly apiKey?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly topP?: number;
  readonly topK?: number;
  readonly thinkingBudgetTokens?: number;
  readonly proxyUrl?: string;
}

export class StreamGeminiProvider extends StreamingModelProvider {
  private readonly opts: StreamGeminiOptions & { modelId: string; apiKey: string };

  constructor(options?: StreamGeminiOptions) {
    super();
    this.opts = { ...options, modelId: options?.modelId ?? 'gemini-2.5-flash', apiKey: options?.apiKey ?? '' };
  }

  get modelId(): string { return this.opts.modelId; }
  get providerName(): string { return 'gemini'; }

  async *stream(messagesJson: string, systemPrompt?: string, toolSpecsJson?: string): AsyncGenerator<StreamEvent> {
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

    if (toolSpecsJson) {
      const specs = JSON.parse(toolSpecsJson);
      body.tools = [{ functionDeclarations: specs.map((s: any) => ({ name: s.name, description: s.description, parameters: s.inputSchema })) }];
    }

    // Use streamGenerateContent for streaming
    const url = this.opts.proxyUrl ?? `https://generativelanguage.googleapis.com/v1beta/models/${this.opts.modelId}:streamGenerateContent?alt=sse&key=${this.opts.apiKey}`;
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

    if (!response.ok) throw new Error(`Gemini ${response.status}: ${await response.text()}`);

    yield { type: 'modelMessageStartEvent', role: 'assistant' };

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let hasToolUse = false;
    let textBlockOpen = false;

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
            const chunk = JSON.parse(data);
            const candidate = chunk.candidates?.[0];
            if (!candidate?.content?.parts) continue;

            for (const part of candidate.content.parts) {
              if (part.functionCall) {
                if (textBlockOpen) { yield { type: 'modelContentBlockStopEvent' }; textBlockOpen = false; }
                const id = part.functionCall.id ?? `tooluse_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
                yield { type: 'modelContentBlockStartEvent', start: { type: 'toolUseStart', name: part.functionCall.name, toolUseId: id } };
                yield { type: 'modelContentBlockDeltaEvent', delta: { type: 'toolUseInputDelta', input: JSON.stringify(part.functionCall.args ?? {}) } };
                yield { type: 'modelContentBlockStopEvent' };
                hasToolUse = true;
              } else if (part.text !== undefined) {
                if (!textBlockOpen) { yield { type: 'modelContentBlockStartEvent' }; textBlockOpen = true; }
                yield { type: 'modelContentBlockDeltaEvent', delta: { type: 'textDelta', text: part.text } };
              }
            }

            // Usage metadata
            if (chunk.usageMetadata) {
              yield { type: 'modelMetadataEvent', usage: { inputTokens: chunk.usageMetadata.promptTokenCount ?? 0, outputTokens: chunk.usageMetadata.candidatesTokenCount ?? 0 } };
            }
          } catch {}
        }
      }
    } finally { reader.releaseLock(); }

    if (textBlockOpen) yield { type: 'modelContentBlockStopEvent' };
    yield { type: 'modelMessageStopEvent', stopReason: hasToolUse ? 'toolUse' : 'endTurn' };
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
          const output = Array.isArray(tr.content) ? tr.content.map((item: any) => item.json !== undefined ? item : { text: item.text ?? JSON.stringify(item) }) : tr.content;
          parts.push({ functionResponse: { id: tr.toolUseId, name, response: { output } } });
        }
      }
      if (parts.length > 0) contents.push({ role, parts });
    }
    return contents;
  }
}
