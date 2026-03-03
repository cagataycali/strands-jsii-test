/**
 * Provider protocol definitions — the SINGLE SOURCE OF TRUTH.
 * 
 * Each provider's format rules defined ONCE as data.
 * The engine (browser or node) reads these to do the transforms.
 */

// ── Anthropic Message Formatting ────────────────────────────

export function formatAnthropicMessages(messages: any[]): any[] {
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
        const rc = block.reasoningContent;
        parts.push({ type: 'thinking', thinking: rc.reasoningText?.text ?? '', signature: rc.reasoningText?.signature ?? '' });
      }
    }
    if (parts.length > 0) formatted.push({ role: msg.role, content: parts });
  }
  return formatted;
}

export function formatAnthropicTools(specs: any[]): any[] {
  return specs.map(s => ({ name: s.name, description: s.description, input_schema: s.inputSchema }));
}

export function buildAnthropicBody(config: any, messages: any[], systemPrompt?: string, toolSpecsJson?: string, stream?: boolean): { url: string; headers: Record<string, string>; body: any } {
  const body: Record<string, unknown> = {
    model: config.modelId ?? 'claude-sonnet-4-20250514',
    messages: formatAnthropicMessages(messages),
    max_tokens: config.maxTokens ?? 4096,
  };
  if (stream) body.stream = true;
  if (config.temperature !== undefined) body.temperature = config.temperature;
  if (config.topP !== undefined) body.top_p = config.topP;
  if (config.topK !== undefined) body.top_k = config.topK;
  if (config.stopSequences) body.stop_sequences = config.stopSequences;
  if (systemPrompt) body.system = systemPrompt;
  if (toolSpecsJson) body.tools = formatAnthropicTools(JSON.parse(toolSpecsJson));
  if (config.thinkingBudgetTokens) body.thinking = { type: 'enabled', budget_tokens: config.thinkingBudgetTokens };

  return {
    url: config.proxyUrl ?? `${config.baseUrl ?? 'https://api.anthropic.com'}/v1/messages`,
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey,
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
  const sr = data.stop_reason === 'tool_use' ? 'tool_use' : data.stop_reason === 'max_tokens' ? 'max_tokens' : 'end_turn';
  return JSON.stringify({ output: { message: { role: 'assistant', content } }, stopReason: sr, usage: { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 } });
}

// ── OpenAI Message Formatting ───────────────────────────────

export function formatOpenAIMessages(messages: any[], systemPrompt?: string): any[] {
  const formatted: any[] = [];
  if (systemPrompt) formatted.push({ role: 'system', content: systemPrompt });
  for (const msg of messages) {
    const contents = msg.content ?? [];
    const regular: any[] = [], toolUses: any[] = [], toolResults: any[] = [];
    for (const block of contents) {
      if (block.toolUse) toolUses.push(block.toolUse);
      else if (block.toolResult) toolResults.push(block.toolResult);
      else if (block.reasoningContent) continue; // skip reasoning in multi-turn
      else if (block.text !== undefined) regular.push({ type: 'text', text: block.text });
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

export function buildOpenAIBody(config: any, messages: any[], systemPrompt?: string, toolSpecsJson?: string, stream?: boolean): { url: string; headers: Record<string, string>; body: any } {
  const body: Record<string, unknown> = {
    model: config.modelId ?? 'gpt-4o',
    messages: formatOpenAIMessages(messages, systemPrompt),
  };
  if (stream) { body.stream = true; body.stream_options = { include_usage: true }; }
  if (config.maxTokens !== undefined) body.max_tokens = config.maxTokens;
  if (config.temperature !== undefined) body.temperature = config.temperature;
  if (config.topP !== undefined) body.top_p = config.topP;
  if (config.stopSequences) body.stop = config.stopSequences;
  if (toolSpecsJson) {
    const specs = JSON.parse(toolSpecsJson);
    body.tools = specs.map((s: any) => ({ type: 'function', function: { name: s.name, description: s.description, parameters: s.inputSchema } }));
  }
  return {
    url: config.proxyUrl ?? `${config.baseUrl ?? 'https://api.openai.com'}/v1/chat/completions`,
    headers: { 'content-type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
    body,
  };
}

export function parseOpenAIResponse(data: any): string {
  if (data.error) return JSON.stringify({ error: data.error.message ?? JSON.stringify(data.error) });
  const choice = data.choices?.[0];
  if (!choice) return JSON.stringify({ error: 'No response' });
  const content: any[] = [];
  if (choice.message?.reasoning_content) content.push({ reasoningContent: { reasoningText: { text: choice.message.reasoning_content } } });
  if (choice.message?.content) content.push({ text: choice.message.content });
  if (choice.message?.tool_calls) for (const tc of choice.message.tool_calls) content.push({ toolUse: { name: tc.function.name, toolUseId: tc.id, input: JSON.parse(tc.function.arguments ?? '{}') } });
  const sr = choice.finish_reason === 'tool_calls' ? 'tool_use' : choice.finish_reason === 'length' ? 'max_tokens' : 'end_turn';
  return JSON.stringify({ output: { message: { role: 'assistant', content } }, stopReason: sr, usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 } });
}

// ── Gemini Message Formatting ───────────────────────────────

export function formatGeminiMessages(messages: any[], toolUseIdToName: Record<string, string>): any[] {
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
      } else if (block.reasoningContent) {
        parts.push({ text: block.reasoningContent.reasoningText?.text ?? '', thought: true });
      }
    }
    if (parts.length > 0) contents.push({ role, parts });
  }
  return contents;
}

export function buildGeminiBody(config: any, messages: any[], systemPrompt?: string, toolSpecsJson?: string, stream?: boolean): { url: string; headers: Record<string, string>; body: any } {
  const toolUseIdToName: Record<string, string> = {};
  for (const msg of messages) for (const b of (msg.content ?? [])) if (b.toolUse) toolUseIdToName[b.toolUse.toolUseId] = b.toolUse.name;

  const generationConfig: Record<string, unknown> = { maxOutputTokens: config.maxTokens ?? 4096 };
  if (config.temperature !== undefined) generationConfig.temperature = config.temperature;
  if (config.topP !== undefined) generationConfig.topP = config.topP;
  if (config.topK !== undefined) generationConfig.topK = config.topK;
  if (config.thinkingBudgetTokens) generationConfig.thinkingConfig = { thinkingBudget: config.thinkingBudgetTokens };

  const body: Record<string, unknown> = { contents: formatGeminiMessages(messages, toolUseIdToName), generationConfig };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
  if (toolSpecsJson) {
    const specs = JSON.parse(toolSpecsJson);
    body.tools = [{ functionDeclarations: specs.map((s: any) => ({ name: s.name, description: s.description, parameters: s.inputSchema })) }];
  }

  const action = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
  return {
    url: config.proxyUrl ?? `https://generativelanguage.googleapis.com/v1beta/models/${config.modelId ?? 'gemini-2.5-flash'}:${action}&key=${config.apiKey}`,
    headers: { 'content-type': 'application/json' },
    body,
  };
}

export function parseGeminiResponse(data: any): string {
  if (data.error) return JSON.stringify({ error: data.error.message ?? JSON.stringify(data.error) });
  const candidate = data.candidates?.[0];
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
  const sr = hasToolUse ? 'tool_use' : candidate.finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn';
  return JSON.stringify({ output: { message: { role: 'assistant', content } }, stopReason: sr, usage: { inputTokens: data.usageMetadata?.promptTokenCount ?? 0, outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0 } });
}

// ── Universal Builder Registry ──────────────────────────────

export type BodyBuilder = (config: any, messages: any[], systemPrompt?: string, toolSpecsJson?: string, stream?: boolean) => { url: string; headers: Record<string, string>; body: any };
export type ResponseParser = (data: any) => string;

export const BUILDERS: Record<string, BodyBuilder> = {
  anthropic: buildAnthropicBody,
  openai: buildOpenAIBody,
  gemini: buildGeminiBody,
};

export const PARSERS: Record<string, ResponseParser> = {
  anthropic: parseAnthropicResponse,
  openai: parseOpenAIResponse,
  gemini: parseGeminiResponse,
};
