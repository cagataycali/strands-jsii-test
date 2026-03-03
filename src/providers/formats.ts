/**
 * Provider format definitions — SINGLE SOURCE OF TRUTH.
 * 
 * Pure functions + data. No Node.js deps. No browser deps.
 * Importable by BOTH jsii (src/models/) and web (src/web/).
 * 
 * Each provider defines:
 * - formatMessages(): Bedrock Converse → Provider request format
 * - formatTools(): Bedrock tool specs → Provider tool format
 * - buildBody(): Assemble the full request body
 * - parseResponse(): Provider response → Bedrock Converse format
 * - parseSSE(): Provider SSE chunk → StreamEvent (for streaming)
 */

// ═══════════════════════════════════════════════════════════
// TYPES (no external imports — self-contained)
// ═══════════════════════════════════════════════════════════

export interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface ProviderDefaults {
  modelId: string;
  maxTokens: number;
  baseUrl: string;
}

/** Normalized stream event (same shape as web/streaming.ts but no import dependency) */
export interface StreamChunk {
  type: 'messageStart' | 'blockStart' | 'textDelta' | 'toolDelta' | 'blockStop' | 'messageStop' | 'metadata';
  text?: string;
  toolName?: string;
  toolUseId?: string;
  toolInput?: string;
  stopReason?: string;
  inputTokens?: number;
  outputTokens?: number;
}

// ═══════════════════════════════════════════════════════════
// ANTHROPIC
// ═══════════════════════════════════════════════════════════

export const ANTHROPIC_DEFAULTS: ProviderDefaults = {
  modelId: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  baseUrl: 'https://api.anthropic.com',
};

export function formatAnthropicContent(blocks: any[]): any[] {
  const parts: any[] = [];
  for (const block of blocks) {
    if (block.text !== undefined) {
      parts.push({ type: 'text', text: block.text });
    } else if (block.toolUse) {
      parts.push({ type: 'tool_use', id: block.toolUse.toolUseId, name: block.toolUse.name, input: block.toolUse.input });
    } else if (block.toolResult) {
      const tr = block.toolResult;
      const content = Array.isArray(tr.content)
        ? tr.content.map((item: any) =>
            item.json !== undefined ? { type: 'text', text: JSON.stringify(item.json) }
            : item.text !== undefined ? { type: 'text', text: item.text }
            : { type: 'text', text: JSON.stringify(item) })
        : JSON.stringify(tr.content);
      parts.push({ type: 'tool_result', tool_use_id: tr.toolUseId, content, is_error: tr.status === 'error' });
    } else if (block.reasoningContent) {
      const rc = block.reasoningContent;
      parts.push({ type: 'thinking', thinking: rc.reasoningText?.text ?? '', signature: rc.reasoningText?.signature ?? '' });
    } else if (block.image) {
      const img = block.image;
      const bytes = img.source?.bytes;
      if (bytes) {
        const fmt = img.format ?? 'png';
        const mime: Record<string, string> = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
        const b64 = typeof bytes === 'string' ? bytes : (typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : btoa(String.fromCharCode(...new Uint8Array(bytes))));
        parts.push({ type: 'image', source: { type: 'base64', media_type: mime[fmt] ?? 'image/png', data: b64 } });
      }
    } else if (block.document) {
      const doc = block.document;
      const bytes = doc.source?.bytes;
      const format = doc.format ?? 'txt';
      const name = doc.name ?? 'document';
      const docMimeMap: Record<string, string> = { pdf: 'application/pdf', txt: 'text/plain', md: 'text/plain', csv: 'text/csv', html: 'text/html', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
      const mimeType = docMimeMap[format] ?? 'application/octet-stream';
      if (bytes) {
        const isText = mimeType === 'text/plain';
        const data = isText
          ? (typeof bytes === 'string' ? bytes : (typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('utf-8') : ''))
          : (typeof bytes === 'string' ? bytes : (typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : ''));
        parts.push({ type: 'document', source: { type: isText ? 'text' : 'base64', media_type: mimeType, data }, title: name });
      }
    } else if (block.cachePoint !== undefined) {
      if (parts.length > 0) parts[parts.length - 1].cache_control = { type: 'ephemeral' };
    }
  }
  return parts;
}

export function formatAnthropicMessages(messages: any[]): any[] {
  const formatted: any[] = [];
  for (const msg of messages) {
    const parts = formatAnthropicContent(msg.content ?? []);
    if (parts.length > 0) formatted.push({ role: msg.role, content: parts });
  }
  return formatted;
}

export function buildAnthropicRequest(config: any, messages: any[], systemPrompt?: string, toolSpecsJson?: string, stream?: boolean): ProviderRequest {
  const body: Record<string, unknown> = {
    model: config.modelId ?? ANTHROPIC_DEFAULTS.modelId,
    messages: formatAnthropicMessages(messages),
    max_tokens: config.maxTokens ?? ANTHROPIC_DEFAULTS.maxTokens,
  };
  if (stream) body.stream = true;
  if (config.temperature !== undefined && config.temperature >= 0) body.temperature = config.temperature;
  if (config.topP !== undefined && config.topP >= 0) body.top_p = config.topP;
  if (config.topK !== undefined && config.topK >= 0) body.top_k = config.topK;
  if (config.stopSequences) body.stop_sequences = typeof config.stopSequences === 'string' ? JSON.parse(config.stopSequences) : config.stopSequences;
  if (systemPrompt) body.system = systemPrompt;
  if (config.toolChoice) {
    const tc = config.toolChoice;
    if (tc.choiceMode === 'tool' && tc.toolName) body.tool_choice = { type: 'tool', name: tc.toolName };
    else if (tc.choiceMode === 'any') body.tool_choice = { type: 'any' };
    else if (tc.choiceMode === 'auto') body.tool_choice = { type: 'auto' };
  }
  if (config.thinkingJson || config.thinkingBudgetTokens) {
    body.thinking = config.thinkingJson ? JSON.parse(config.thinkingJson) : { type: 'enabled', budget_tokens: config.thinkingBudgetTokens };
  }
  if (config.additionalParamsJson) Object.assign(body, JSON.parse(config.additionalParamsJson));
  if (toolSpecsJson) {
    const specs = JSON.parse(toolSpecsJson);
    body.tools = specs.map((s: any) => ({ name: s.name, description: s.description, input_schema: s.inputSchema }));
  }

  return {
    url: config.proxyUrl ?? `${config.baseUrl ?? ANTHROPIC_DEFAULTS.baseUrl}/v1/messages`,
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey ?? '',
      'anthropic-version': config.anthropicVersion ?? '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body,
  };
}

export function parseAnthropicResponse(data: any): string {
  if (data.error) return JSON.stringify({ error: data.error.message ?? JSON.stringify(data.error) });
  const content: any[] = [];
  for (const block of (data.content ?? [])) {
    if (block.type === 'text') content.push({ text: block.text });
    else if (block.type === 'tool_use') content.push({ toolUse: { name: block.name, toolUseId: block.id, input: block.input } });
    else if (block.type === 'thinking') content.push({ reasoningContent: { reasoningText: { text: block.thinking ?? '', signature: block.signature ?? '' } } });
  }
  const sr = data.stop_reason === 'tool_use' ? 'tool_use' : data.stop_reason === 'max_tokens' ? 'max_tokens' : data.stop_reason === 'stop_sequence' ? 'stop_sequence' : 'end_turn';
  return JSON.stringify({
    output: { message: { role: 'assistant', content } }, stopReason: sr,
    usage: { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0,
      ...(data.usage?.cache_creation_input_tokens !== undefined ? { cacheCreationInputTokens: data.usage.cache_creation_input_tokens } : {}),
      ...(data.usage?.cache_read_input_tokens !== undefined ? { cacheReadInputTokens: data.usage.cache_read_input_tokens } : {}) },
  });
}

export function parseAnthropicSSE(ev: any): StreamChunk[] {
  const chunks: StreamChunk[] = [];
  if (ev.type === 'message_start') chunks.push({ type: 'messageStart' });
  else if (ev.type === 'content_block_start') {
    const c: StreamChunk = { type: 'blockStart' };
    if (ev.content_block?.type === 'tool_use') { c.toolName = ev.content_block.name; c.toolUseId = ev.content_block.id; }
    chunks.push(c);
  } else if (ev.type === 'content_block_delta') {
    if (ev.delta?.type === 'text_delta') chunks.push({ type: 'textDelta', text: ev.delta.text });
    else if (ev.delta?.type === 'input_json_delta') chunks.push({ type: 'toolDelta', toolInput: ev.delta.partial_json });
  } else if (ev.type === 'content_block_stop') chunks.push({ type: 'blockStop' });
  else if (ev.type === 'message_delta') {
    if (ev.delta?.stop_reason) {
      const m: Record<string, string> = { tool_use: 'toolUse', max_tokens: 'maxTokens', stop_sequence: 'stopSequence' };
      chunks.push({ type: 'messageStop', stopReason: m[ev.delta.stop_reason] || 'endTurn' });
    }
    if (ev.usage) chunks.push({ type: 'metadata', inputTokens: ev.usage.input_tokens ?? 0, outputTokens: ev.usage.output_tokens ?? 0 });
  }
  return chunks;
}

// ═══════════════════════════════════════════════════════════
// OPENAI
// ═══════════════════════════════════════════════════════════

export const OPENAI_DEFAULTS: ProviderDefaults = {
  modelId: 'gpt-4o',
  maxTokens: -1, // OpenAI uses model default if not set
  baseUrl: 'https://api.openai.com',
};

export function formatOpenAIMessages(messages: any[], systemPrompt?: string): any[] {
  const formatted: any[] = [];
  if (systemPrompt) formatted.push({ role: 'system', content: systemPrompt });
  for (const msg of messages) {
    const contents = msg.content ?? [];
    const regular: any[] = [], toolUses: any[] = [], toolResults: any[] = [];
    for (const block of contents) {
      if (block.toolUse) toolUses.push(block.toolUse);
      else if (block.toolResult) toolResults.push(block.toolResult);
      else if (block.reasoningContent) continue;
      else if (block.text !== undefined) regular.push({ type: 'text', text: block.text });
      else if (block.image) {
        const bytes = block.image.source?.bytes;
        if (bytes) {
          const fmt = block.image.format ?? 'png';
          const mime: Record<string, string> = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
          const b64 = typeof bytes === 'string' ? bytes : (typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : '');
          regular.push({ type: 'image_url', image_url: { detail: 'auto', url: `data:${mime[fmt] ?? 'image/png'};base64,${b64}` } });
        }
      } else if (block.document) {
        const doc = block.document;
        const bytes = doc.source?.bytes;
        const format = doc.format ?? 'txt';
        const name = doc.name ?? 'document';
        const docMimeMap: Record<string, string> = { pdf: 'application/pdf', txt: 'text/plain', md: 'text/plain', csv: 'text/csv', html: 'text/html' };
        const mimeType = docMimeMap[format] ?? 'application/octet-stream';
        if (bytes) {
          const b64 = typeof bytes === 'string' ? bytes : (typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : '');
          regular.push({ type: 'file', file: { file_data: `data:${mimeType};base64,${b64}`, filename: name } });
        }
      }
    }
    if (msg.role === 'assistant') {
      const am: Record<string, unknown> = { role: 'assistant' };
      if (regular.length) am.content = regular.every((c: any) => c.type === 'text') ? regular.map((c: any) => c.text).join('') : regular;
      if (toolUses.length) am.tool_calls = toolUses.map(tu => ({ id: tu.toolUseId, type: 'function', function: { name: tu.name, arguments: JSON.stringify(tu.input ?? {}) } }));
      if (am.content || am.tool_calls) formatted.push(am);
    } else {
      if (regular.length) formatted.push(regular.length === 1 && regular[0].type === 'text' ? { role: 'user', content: regular[0].text } : { role: 'user', content: regular });
      for (const tr of toolResults) {
        const items = (tr.content ?? []).map((item: any) => item.json !== undefined ? JSON.stringify(item.json) : item.text ?? JSON.stringify(item));
        formatted.push({ role: 'tool', tool_call_id: tr.toolUseId, content: items.join('\n') });
      }
    }
  }
  return formatted.filter(m => m.content !== undefined || m.tool_calls !== undefined);
}

export function buildOpenAIRequest(config: any, messages: any[], systemPrompt?: string, toolSpecsJson?: string, stream?: boolean): ProviderRequest {
  const body: Record<string, unknown> = {
    model: config.modelId ?? OPENAI_DEFAULTS.modelId,
    messages: formatOpenAIMessages(messages, systemPrompt),
  };
  if (stream) { body.stream = true; body.stream_options = { include_usage: true }; }
  if (config.maxTokens !== undefined && config.maxTokens >= 0) body.max_tokens = config.maxTokens;
  if (config.temperature !== undefined && config.temperature >= 0) body.temperature = config.temperature;
  if (config.topP !== undefined && config.topP >= 0) body.top_p = config.topP;
  if (config.frequencyPenalty !== undefined && config.frequencyPenalty !== 999) body.frequency_penalty = config.frequencyPenalty;
  if (config.presencePenalty !== undefined && config.presencePenalty !== 999) body.presence_penalty = config.presencePenalty;
  if (config.seed !== undefined && config.seed >= 0) body.seed = config.seed;
  if (config.stopSequences) body.stop = typeof config.stopSequences === 'string' ? JSON.parse(config.stopSequences) : config.stopSequences;
  if (config.additionalParamsJson) Object.assign(body, JSON.parse(config.additionalParamsJson));
  if (toolSpecsJson) {
    const specs = JSON.parse(toolSpecsJson);
    body.tools = specs.map((s: any) => ({ type: 'function', function: { name: s.name, description: s.description, parameters: s.inputSchema } }));
  }
  if (config.toolChoice) {
    const tc = config.toolChoice;
    if (tc.choiceMode === 'auto') body.tool_choice = 'auto';
    else if (tc.choiceMode === 'required') body.tool_choice = 'required';
    else if (tc.choiceMode === 'function' && tc.functionName) body.tool_choice = { type: 'function', function: { name: tc.functionName } };
  }
  return {
    url: config.proxyUrl ?? `${config.baseUrl ?? OPENAI_DEFAULTS.baseUrl}/v1/chat/completions`,
    headers: { 'content-type': 'application/json', 'Authorization': `Bearer ${config.apiKey ?? ''}` },
    body,
  };
}

export function parseOpenAIResponse(data: any): string {
  if (data.error) {
    const msg = data.error.message ?? JSON.stringify(data.error);
    const code = data.error.code ?? '';
    if (code === 'context_length_exceeded') return JSON.stringify({ error: `Context overflow: ${msg}` });
    if (code === 'rate_limit_exceeded' || msg.toLowerCase().includes('rate limit')) return JSON.stringify({ error: `Throttled: ${msg}` });
    // Check alternative context overflow messages
    const overflowPatterns = ['input is too long', 'input length and `max_tokens` exceed', 'too many total text bytes'];
    const lowerMsg = msg.toLowerCase();
    for (const pattern of overflowPatterns) {
      if (lowerMsg.includes(pattern.toLowerCase())) return JSON.stringify({ error: `Context overflow: ${msg}` });
    }
    return JSON.stringify({ error: msg });
  }
  const choice = data.choices?.[0];
  if (!choice) return JSON.stringify({ error: 'No response from OpenAI' });
  const content: any[] = [];
  if (choice.message?.reasoning_content) content.push({ reasoningContent: { reasoningText: { text: choice.message.reasoning_content } } });
  if (choice.message?.content) content.push({ text: choice.message.content });
  if (choice.message?.tool_calls) for (const tc of choice.message.tool_calls) content.push({ toolUse: { name: tc.function.name, toolUseId: tc.id, input: JSON.parse(tc.function.arguments ?? '{}') } });
  const sr = choice.finish_reason === 'tool_calls' ? 'tool_use' : choice.finish_reason === 'length' ? 'max_tokens' : choice.finish_reason === 'content_filter' ? 'content_filtered' : 'end_turn';
  return JSON.stringify({ output: { message: { role: 'assistant', content } }, stopReason: sr, usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0, totalTokens: data.usage?.total_tokens ?? 0 } });
}

export function parseOpenAISSE(chunk: any): StreamChunk[] {
  const chunks: StreamChunk[] = [];
  if (!chunk.choices?.length) {
    if (chunk.usage) chunks.push({ type: 'metadata', inputTokens: chunk.usage.prompt_tokens ?? 0, outputTokens: chunk.usage.completion_tokens ?? 0 });
    return chunks;
  }
  const c = chunk.choices[0], dl = c.delta;
  if (dl?.role) chunks.push({ type: 'messageStart' });
  if (dl?.content) chunks.push({ type: 'textDelta', text: dl.content });
  if (dl?.tool_calls) {
    for (const tc of dl.tool_calls) {
      if (tc.id && tc.function?.name) chunks.push({ type: 'blockStart', toolName: tc.function.name, toolUseId: tc.id });
      if (tc.function?.arguments) chunks.push({ type: 'toolDelta', toolInput: tc.function.arguments });
    }
  }
  if (c.finish_reason) {
    const m: Record<string, string> = { stop: 'endTurn', tool_calls: 'toolUse', length: 'maxTokens' };
    chunks.push({ type: 'messageStop', stopReason: m[c.finish_reason] || 'endTurn' });
  }
  return chunks;
}

// ═══════════════════════════════════════════════════════════
// GEMINI
// ═══════════════════════════════════════════════════════════

export const GEMINI_DEFAULTS: ProviderDefaults = {
  modelId: 'gemini-2.5-flash',
  maxTokens: 4096,
  baseUrl: 'https://generativelanguage.googleapis.com',
};

export function formatGeminiMessages(messages: any[], toolUseIdToName: Record<string, string>): any[] {
  const contents: any[] = [];
  for (const msg of messages) {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts: any[] = [];
    for (const block of (msg.content ?? [])) {
      if (block.text !== undefined) parts.push({ text: block.text });
      else if (block.toolUse) {
        toolUseIdToName[block.toolUse.toolUseId] = block.toolUse.name;
        const part: any = { functionCall: { name: block.toolUse.name, args: block.toolUse.input, id: block.toolUse.toolUseId } };
        if (block.toolUse.reasoningSignature) part.thoughtSignature = block.toolUse.reasoningSignature;
        parts.push(part);
      } else if (block.toolResult) {
        const tr = block.toolResult;
        const name = toolUseIdToName[tr.toolUseId] ?? tr.toolUseId;
        const output = Array.isArray(tr.content) ? tr.content.map((item: any) => item.json !== undefined ? item : item.text !== undefined ? { text: item.text } : item) : tr.content;
        parts.push({ functionResponse: { id: tr.toolUseId, name, response: { output } } });
      } else if (block.reasoningContent) {
        const rc = block.reasoningContent;
        const part: any = { text: rc.reasoningText?.text ?? '', thought: true };
        if (rc.reasoningText?.signature) part.thoughtSignature = rc.reasoningText.signature;
        parts.push(part);
      } else if (block.image) {
        const bytes = block.image.source?.bytes;
        if (bytes) {
          const fmt = block.image.format ?? 'png';
          const mime: Record<string, string> = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
          const b64 = typeof bytes === 'string' ? bytes : (typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : '');
          parts.push({ inlineData: { mimeType: mime[fmt] ?? 'image/png', data: b64 } });
        }
      } else if (block.document) {
        const doc = block.document;
        const bytes = doc.source?.bytes;
        const format = doc.format ?? 'txt';
        const docMimeMap: Record<string, string> = { pdf: 'application/pdf', txt: 'text/plain', md: 'text/plain', csv: 'text/csv', html: 'text/html' };
        const mimeType = docMimeMap[format] ?? 'application/octet-stream';
        if (bytes) {
          const b64 = typeof bytes === 'string' ? bytes : (typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : '');
          parts.push({ inlineData: { mimeType, data: b64 } });
        }
      }
    }
    if (parts.length > 0) contents.push({ role, parts });
  }
  return contents;
}

export function buildGeminiRequest(config: any, messages: any[], systemPrompt?: string, toolSpecsJson?: string, stream?: boolean): ProviderRequest {
  const toolUseIdToName: Record<string, string> = {};
  for (const msg of messages) for (const b of (msg.content ?? [])) if (b.toolUse) toolUseIdToName[b.toolUse.toolUseId] = b.toolUse.name;

  const generationConfig: Record<string, unknown> = { maxOutputTokens: config.maxTokens ?? GEMINI_DEFAULTS.maxTokens };
  if (config.temperature !== undefined && config.temperature >= 0) generationConfig.temperature = config.temperature;
  if (config.topP !== undefined && config.topP >= 0) generationConfig.topP = config.topP;
  if (config.topK !== undefined && config.topK >= 0) generationConfig.topK = config.topK;
  if (config.stopSequences) generationConfig.stopSequences = typeof config.stopSequences === 'string' ? JSON.parse(config.stopSequences) : config.stopSequences;
  if (config.thinkingBudgetTokens && config.thinkingBudgetTokens > 0) generationConfig.thinkingConfig = { thinkingBudget: config.thinkingBudgetTokens };
  if (config.additionalParamsJson) Object.assign(generationConfig, JSON.parse(config.additionalParamsJson));

  const body: Record<string, unknown> = { contents: formatGeminiMessages(messages, toolUseIdToName), generationConfig };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
  
  const tools: object[] = [];
  if (toolSpecsJson) {
    const specs = JSON.parse(toolSpecsJson);
    tools.push({ functionDeclarations: specs.map((s: any) => ({ name: s.name, description: s.description, parameters: s.inputSchema })) });
  }
  if (config.geminiToolsJson) for (const t of JSON.parse(config.geminiToolsJson)) tools.push(t);
  if (tools.length > 0) body.tools = tools;

  const modelId = config.modelId ?? GEMINI_DEFAULTS.modelId;
  const action = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
  const separator = action.includes('?') ? '&' : '?';
  return {
    url: config.proxyUrl ?? `${config.baseUrl ?? GEMINI_DEFAULTS.baseUrl}/v1beta/models/${modelId}:${action}${separator}key=${config.apiKey ?? ''}`,
    headers: { 'content-type': 'application/json' },
    body,
  };
}

export function parseGeminiResponse(data: any): string {
  if (data.error) {
    const msg = data.error.message ?? JSON.stringify(data.error);
    const status = data.error.status ?? '';
    if (status === 'RESOURCE_EXHAUSTED' || status === 'UNAVAILABLE') return JSON.stringify({ error: `Throttled: ${msg}` });
    if (status === 'INVALID_ARGUMENT' && msg.includes('exceeds the maximum number of tokens')) return JSON.stringify({ error: `Context overflow: ${msg}` });
    return JSON.stringify({ error: msg });
  }
  const candidate = data.candidates?.[0];
  if (!candidate) return JSON.stringify({ error: 'No Gemini response candidate' });
  const content: any[] = [];
  let hasToolUse = false;
  for (const part of (candidate.content?.parts ?? [])) {
    if (part.functionCall) {
      const id = part.functionCall.id ?? `tooluse_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      const toolUseBlock: any = { name: part.functionCall.name, toolUseId: id, input: part.functionCall.args ?? {} };
      if (part.thoughtSignature) toolUseBlock.reasoningSignature = part.thoughtSignature;
      content.push({ toolUse: toolUseBlock });
      hasToolUse = true;
    } else if (part.thought === true && part.text) {
      const rc: any = { text: part.text };
      if (part.thoughtSignature) rc.signature = part.thoughtSignature;
      content.push({ reasoningContent: { reasoningText: rc } });
    } else if (part.text !== undefined) {
      content.push({ text: part.text });
    }
  }
  const sr = hasToolUse ? 'tool_use' : candidate.finishReason === 'MAX_TOKENS' ? 'max_tokens' : candidate.finishReason === 'SAFETY' ? 'content_filtered' : candidate.finishReason === 'RECITATION' ? 'content_filtered' : 'end_turn';
  return JSON.stringify({ output: { message: { role: 'assistant', content } }, stopReason: sr, usage: { inputTokens: data.usageMetadata?.promptTokenCount ?? 0, outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0, totalTokens: data.usageMetadata?.totalTokenCount ?? 0 } });
}

export function parseGeminiSSE(chunk: any): StreamChunk[] {
  const chunks: StreamChunk[] = [];
  const candidate = chunk.candidates?.[0];
  if (!candidate?.content?.parts) {
    if (chunk.usageMetadata) chunks.push({ type: 'metadata', inputTokens: chunk.usageMetadata.promptTokenCount ?? 0, outputTokens: chunk.usageMetadata.candidatesTokenCount ?? 0 });
    return chunks;
  }
  for (const part of candidate.content.parts) {
    if (part.functionCall) {
      const id = part.functionCall.id ?? `tooluse_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      chunks.push({ type: 'blockStart', toolName: part.functionCall.name, toolUseId: id });
      chunks.push({ type: 'toolDelta', toolInput: JSON.stringify(part.functionCall.args ?? {}) });
      chunks.push({ type: 'blockStop' });
    } else if (part.text !== undefined) {
      chunks.push({ type: 'textDelta', text: part.text });
    }
  }
  if (chunk.usageMetadata) chunks.push({ type: 'metadata', inputTokens: chunk.usageMetadata.promptTokenCount ?? 0, outputTokens: chunk.usageMetadata.candidatesTokenCount ?? 0 });
  return chunks;
}

// ═══════════════════════════════════════════════════════════
// OLLAMA
// ═══════════════════════════════════════════════════════════

export const OLLAMA_DEFAULTS: ProviderDefaults = {
  modelId: 'llama3',
  maxTokens: -1,
  baseUrl: 'http://localhost:11434',
};

export function formatOllamaMessages(messages: any[], systemPrompt?: string): any[] {
  const formatted: any[] = [];
  if (systemPrompt) formatted.push({ role: 'system', content: systemPrompt });
  for (const msg of messages) {
    for (const block of (msg.content ?? [])) {
      if (block.text !== undefined) formatted.push({ role: msg.role, content: block.text });
      else if (block.toolUse) formatted.push({ role: msg.role, tool_calls: [{ function: { name: block.toolUse.toolUseId, arguments: block.toolUse.input } }] });
      else if (block.toolResult) {
        for (const item of (block.toolResult.content ?? [])) {
          if (item.json !== undefined) formatted.push({ role: 'tool', content: JSON.stringify(item.json) });
          else if (item.text !== undefined) formatted.push({ role: 'tool', content: item.text });
        }
      } else if (block.image) {
        const bytes = block.image.source?.bytes;
        if (bytes) {
          const b64 = typeof bytes === 'string' ? bytes : (typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : '');
          formatted.push({ role: msg.role, images: [b64] });
        }
      } else if (block.document) {
        const doc = block.document;
        const bytes = doc.source?.bytes;
        const format = doc.format ?? 'txt';
        const name = doc.name ?? 'document';
        if (bytes && (format === 'txt' || format === 'md')) {
          const text = typeof bytes === 'string' ? bytes : (typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('utf-8') : '');
          formatted.push({ role: msg.role, content: `[Document: ${name}]\n${text}` });
        } else {
          formatted.push({ role: msg.role, content: `[Document: ${name} (${format})]` });
        }
      }
    }
  }
  return formatted;
}

export function buildOllamaRequest(config: any, messages: any[], systemPrompt?: string, toolSpecsJson?: string): ProviderRequest {
  const options: Record<string, unknown> = {};
  if (config.optionsJson) Object.assign(options, JSON.parse(config.optionsJson));
  if (config.maxTokens !== undefined && config.maxTokens >= 0) options.num_predict = config.maxTokens;
  if (config.temperature !== undefined && config.temperature >= 0) options.temperature = config.temperature;
  if (config.topP !== undefined && config.topP >= 0) options.top_p = config.topP;
  if (config.topK !== undefined && config.topK >= 0) options.top_k = config.topK;
  if (config.stopSequences) options.stop = typeof config.stopSequences === 'string' ? JSON.parse(config.stopSequences) : config.stopSequences;

  const body: Record<string, unknown> = {
    model: config.modelId ?? OLLAMA_DEFAULTS.modelId,
    messages: formatOllamaMessages(messages, systemPrompt),
    options, stream: false,
  };
  if (config.keepAlive) body.keep_alive = config.keepAlive;
  if (config.additionalArgsJson) Object.assign(body, JSON.parse(config.additionalArgsJson));
  if (toolSpecsJson) {
    const specs = JSON.parse(toolSpecsJson);
    body.tools = specs.map((s: any) => ({ type: 'function', function: { name: s.name, description: s.description, parameters: s.inputSchema } }));
  }
  return {
    url: config.proxyUrl ?? `${config.host ?? OLLAMA_DEFAULTS.baseUrl}/api/chat`,
    headers: { 'content-type': 'application/json' },
    body,
  };
}

export function parseOllamaResponse(data: any): string {
  if (data.error) return JSON.stringify({ error: data.error });
  const content: any[] = [];
  let hasToolUse = false;
  if (data.message?.content) content.push({ text: data.message.content });
  if (data.message?.tool_calls) {
    for (const tc of data.message.tool_calls) {
      content.push({ toolUse: { name: tc.function?.name ?? 'unknown', toolUseId: `tooluse_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`, input: tc.function?.arguments ?? {} } });
      hasToolUse = true;
    }
  }
  const sr = hasToolUse ? 'tool_use' : data.done_reason === 'length' ? 'max_tokens' : 'end_turn';
  return JSON.stringify({ output: { message: { role: 'assistant', content } }, stopReason: sr, usage: { inputTokens: data.prompt_eval_count ?? 0, outputTokens: data.eval_count ?? 0 }, metrics: { latencyMs: data.total_duration ? data.total_duration / 1e6 : 0 } });
}

// ═══════════════════════════════════════════════════════════
// REGISTRY — lookup by provider name
// ═══════════════════════════════════════════════════════════

export const REQUEST_BUILDERS: Record<string, (config: any, messages: any[], systemPrompt?: string, toolSpecsJson?: string, stream?: boolean) => ProviderRequest> = {
  anthropic: buildAnthropicRequest,
  openai: buildOpenAIRequest,
  gemini: buildGeminiRequest,
  ollama: buildOllamaRequest,
};

export const RESPONSE_PARSERS: Record<string, (data: any) => string> = {
  anthropic: parseAnthropicResponse,
  openai: parseOpenAIResponse,
  gemini: parseGeminiResponse,
  ollama: parseOllamaResponse,
};

export const SSE_PARSERS: Record<string, (ev: any) => StreamChunk[]> = {
  anthropic: parseAnthropicSSE,
  openai: parseOpenAISSE,
  gemini: parseGeminiSSE,
};

export const DEFAULTS: Record<string, ProviderDefaults> = {
  anthropic: ANTHROPIC_DEFAULTS,
  openai: OPENAI_DEFAULTS,
  gemini: GEMINI_DEFAULTS,
  ollama: OLLAMA_DEFAULTS,
};
