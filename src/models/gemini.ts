import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ModelProvider } from './provider';

/**
 * Configuration options for the Gemini model provider.
 *
 * Mirrors the Python SDK's GeminiConfig with full feature parity:
 * - model_id (required)
 * - params dict for temperature, top_p, top_k, candidate_count, etc.
 * - client_args for api_key
 * - gemini_tools for GoogleSearch, CodeExecution, etc.
 *
 * @example
 *
 * Python equivalent:
 *   GeminiModel(model_id="gemini-2.5-flash",
 *               client_args={"api_key": "AIza..."},
 *               params={"temperature": 0.7, "top_p": 0.9})
 *
 * TypeScript:
 *   new GeminiModelConfig({
 *     modelId: "gemini-2.5-flash",
 *     apiKey: "AIza...",
 *     temperature: 0.7,
 *     topP: 0.9,
 *   })
 */
export interface GeminiModelConfigOptions {
  /** The Gemini model ID. Default: gemini-2.5-flash */
  readonly modelId?: string;
  /** Google API key. If not provided, uses GOOGLE_API_KEY or GEMINI_API_KEY env var. */
  readonly apiKey?: string;
  /** Maximum output tokens. Default: 4096 */
  readonly maxTokens?: number;
  /** Sampling temperature. -1 = not explicitly set. */
  readonly temperature?: number;
  /** Top-P for nucleus sampling. -1 = not set. */
  readonly topP?: number;
  /** Top-K for sampling. -1 = not set. */
  readonly topK?: number;
  /** Stop sequences JSON array string. */
  readonly stopSequencesJson?: string;
  /**
   * Gemini-specific tools as JSON array string.
   *
   * For non-FunctionDeclaration tools like GoogleSearch, CodeExecution, etc.
   * Standard function calling tools should use the tools interface instead.
   *
   * Example: '[{"googleSearch": {}}, {"codeExecution": {}}]'
   *
   * @see https://ai.google.dev/api/caching#Tool
   */
  readonly geminiToolsJson?: string;
  /**
   * Additional generation config parameters as JSON string.
   * These are merged into the generationConfig object.
   * Matches the Python SDK's `params` dict.
   *
   * Example: '{"candidateCount": 1, "responseMimeType": "application/json"}'
   *
   * @see https://ai.google.dev/api/generate-content#generationconfig
   */
  readonly additionalParamsJson?: string;
  /**
   * Enable thinking/reasoning mode.
   * When enabled, the model returns reasoning content blocks (thought=true).
   *
   * Set the thinking budget in tokens. -1 = not enabled.
   * Example: 10000
   */
  readonly thinkingBudgetTokens?: number;
}

export class GeminiModelConfig {
  /** The Gemini model ID. */
  public readonly modelId: string;
  /** Google API key. */
  public readonly apiKey: string;
  /** Maximum output tokens. */
  public readonly maxTokens: number;
  /** Sampling temperature. -1 = not explicitly set. */
  public readonly temperature: number;
  /** Top-P for nucleus sampling. -1 = not set. */
  public readonly topP: number;
  /** Top-K for sampling. -1 = not set. */
  public readonly topK: number;
  /** Stop sequences JSON array string. */
  public readonly stopSequencesJson: string;
  /** Gemini-specific tools JSON array string. */
  public readonly geminiToolsJson: string;
  /** Additional generation config params JSON. */
  public readonly additionalParamsJson: string;
  /** Thinking budget tokens. -1 = not enabled. */
  public readonly thinkingBudgetTokens: number;

  /**
   * Creates a new Gemini model configuration.
   * @param options Configuration options
   */
  public constructor(options?: GeminiModelConfigOptions) {
    this.modelId = options?.modelId ?? 'gemini-2.5-flash';
    this.apiKey = options?.apiKey ?? process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? '';
    this.maxTokens = options?.maxTokens ?? 4096;
    this.temperature = options?.temperature ?? -1;
    this.topP = options?.topP ?? -1;
    this.topK = options?.topK ?? -1;
    this.stopSequencesJson = options?.stopSequencesJson ?? '';
    this.geminiToolsJson = options?.geminiToolsJson ?? '';
    this.additionalParamsJson = options?.additionalParamsJson ?? '';
    this.thinkingBudgetTokens = options?.thinkingBudgetTokens ?? -1;
  }
}

/**
 * Google Gemini model provider.
 *
 * Full feature parity with the Python SDK's GeminiModel, including:
 * - Extended thinking / reasoning content (thought + thought_signature)
 * - Image and document content blocks (inline_data)
 * - Proper tool result formatting with toolUseId→name mapping
 * - Tool use IDs from Gemini response or generated
 * - Reasoning signatures on tool_use blocks
 * - All generation parameters (temperature, top_p, top_k, stop_sequences)
 * - Gemini-specific tools (GoogleSearch, CodeExecution, etc.)
 * - Error classification (RESOURCE_EXHAUSTED, context overflow)
 *
 * Uses synchronous HTTP via curl (jsii requirement — no async).
 *
 * @example
 *
 * Python equivalent:
 *   model = GeminiModel(model_id="gemini-2.5-flash", client_args={"api_key": "..."})
 *   agent = Agent(model=model)
 *
 * TypeScript:
 *   const model = new GeminiModelProvider(new GeminiModelConfig({
 *     modelId: "gemini-2.5-flash",
 *     apiKey: "AIza...",
 *   }));
 *
 * With thinking enabled:
 *   const model = new GeminiModelProvider(new GeminiModelConfig({
 *     modelId: "gemini-2.5-flash",
 *     maxTokens: 16000,
 *     thinkingBudgetTokens: 10000,
 *   }));
 */
export class GeminiModelProvider extends ModelProvider {
  /** The model configuration. */
  public readonly config: GeminiModelConfig;

  /**
   * Creates a new Gemini model provider.
   * @param config Model configuration
   */
  public constructor(config?: GeminiModelConfig) {
    super();
    this.config = config ?? new GeminiModelConfig();
  }

  /** @inheritdoc */
  public converse(
    messagesJson: string,
    systemPrompt?: string,
    toolSpecsJson?: string,
  ): string {
    const messages = JSON.parse(messagesJson);

    // Build toolUseId → name mapping across all messages
    // (needed for toolResult formatting — Gemini requires function name)
    const toolUseIdToName: Record<string, string> = {};
    for (const msg of messages) {
      for (const block of (msg.content ?? [])) {
        if (block.toolUse) {
          toolUseIdToName[block.toolUse.toolUseId] = block.toolUse.name;
        }
      }
    }

    // Convert messages from Bedrock Converse format to Gemini format
    const contents = this._formatRequestMessages(messages, toolUseIdToName);

    // Build generationConfig
    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: this.config.maxTokens,
    };

    if (this.config.temperature >= 0) {
      generationConfig.temperature = this.config.temperature;
    }
    if (this.config.topP >= 0) {
      generationConfig.topP = this.config.topP;
    }
    if (this.config.topK >= 0) {
      generationConfig.topK = this.config.topK;
    }
    if (this.config.stopSequencesJson) {
      generationConfig.stopSequences = JSON.parse(this.config.stopSequencesJson);
    }

    // Thinking configuration
    if (this.config.thinkingBudgetTokens > 0) {
      generationConfig.thinkingConfig = {
        thinkingBudget: this.config.thinkingBudgetTokens,
      };
    }

    // Merge additional params
    if (this.config.additionalParamsJson) {
      const additionalParams = JSON.parse(this.config.additionalParamsJson);
      for (const [key, value] of Object.entries(additionalParams)) {
        generationConfig[key] = value;
      }
    }

    // Build request body
    const body: Record<string, unknown> = {
      contents,
      generationConfig,
    };

    // System prompt
    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    // Tools: function declarations + gemini-specific tools
    const tools: object[] = [];

    if (toolSpecsJson) {
      const specs = JSON.parse(toolSpecsJson);
      tools.push({
        functionDeclarations: specs.map((s: { name: string; description: string; inputSchema: object }) => ({
          name: s.name,
          description: s.description,
          parameters: s.inputSchema,
        })),
      });
    }

    // Gemini-specific tools (GoogleSearch, CodeExecution, etc.)
    if (this.config.geminiToolsJson) {
      const geminiTools = JSON.parse(this.config.geminiToolsJson);
      for (const tool of geminiTools) {
        tools.push(tool);
      }
    }

    if (tools.length > 0) {
      body.tools = tools;
    }

    return this._curlSync(body);
  }

  /** @inheritdoc */
  public get modelId(): string {
    return this.config.modelId;
  }

  /** @inheritdoc */
  public get providerName(): string {
    return 'gemini';
  }

  // ── Request Formatting (Bedrock → Gemini) ─────────────────

  /**
   * Format a single content block from Bedrock Converse format to Gemini part.
   *
   * Handles:
   * - text → { text }
   * - toolUse → { functionCall } (with optional thought_signature)
   * - toolResult → { functionResponse } (with id, name from mapping, structured output)
   * - reasoningContent → { text, thought: true, thought_signature }
   * - image → { inlineData } (base64)
   * - document → { inlineData } (bytes)
   *
   * Matches Python SDK's _format_request_content_part.
   */
  private _formatContentPart(block: any, toolUseIdToName: Record<string, string>): any | null {
    // Text content
    if (block.text !== undefined) {
      return { text: block.text };
    }

    // Tool use → functionCall
    if (block.toolUse) {
      const tu = block.toolUse;
      // Track id→name mapping
      toolUseIdToName[tu.toolUseId] = tu.name;

      const part: any = {
        functionCall: {
          name: tu.name,
          args: tu.input,
          id: tu.toolUseId,
        },
      };

      // Reasoning signature on tool_use (matches Python SDK)
      if (tu.reasoningSignature) {
        part.thoughtSignature = tu.reasoningSignature;
      }

      return part;
    }

    // Tool result → functionResponse
    if (block.toolResult) {
      const tr = block.toolResult;
      const toolUseId = tr.toolUseId;
      // Look up function name from mapping (Python SDK pattern)
      const functionName = toolUseIdToName[toolUseId] ?? toolUseId;

      // Format response output — handle nested content blocks
      let output: any;
      if (Array.isArray(tr.content)) {
        output = tr.content.map((item: any) => {
          if (item.json !== undefined) return item;
          if (item.text !== undefined) return { text: item.text };
          return item;
        });
      } else {
        output = tr.content;
      }

      return {
        functionResponse: {
          id: toolUseId,
          name: functionName,
          response: { output },
        },
      };
    }

    // Reasoning / thinking content (Bedrock → Gemini thought format)
    if (block.reasoningContent) {
      const rc = block.reasoningContent;
      const reasoningText = rc.reasoningText ?? rc;

      const part: any = {
        text: reasoningText.text ?? '',
        thought: true,
      };

      // thought_signature (base64 encoded in Bedrock format)
      if (reasoningText.signature) {
        part.thoughtSignature = reasoningText.signature;
      }

      return part;
    }

    // Image content → inlineData
    if (block.image) {
      const img = block.image;
      const bytes = img.source?.bytes;
      const format = img.format ?? 'png';

      const mimeMap: Record<string, string> = {
        png: 'image/png',
        jpeg: 'image/jpeg',
        jpg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
      };
      const mimeType = mimeMap[format] ?? 'image/png';

      if (bytes) {
        const base64Data = typeof bytes === 'string'
          ? bytes
          : Buffer.from(bytes).toString('base64');

        return {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        };
      }
      return null;
    }

    // Document content → inlineData
    if (block.document) {
      const doc = block.document;
      const bytes = doc.source?.bytes;
      const format = doc.format ?? 'txt';

      const docMimeMap: Record<string, string> = {
        pdf: 'application/pdf',
        txt: 'text/plain',
        md: 'text/plain',
        csv: 'text/csv',
        html: 'text/html',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
      const mimeType = docMimeMap[format] ?? 'application/octet-stream';

      if (bytes) {
        const base64Data = typeof bytes === 'string'
          ? bytes
          : Buffer.from(bytes).toString('base64');

        return {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        };
      }
      return null;
    }

    // Cache point — skip (Gemini uses context caching differently)
    if (block.cachePoint !== undefined) {
      return null;
    }

    return block;
  }

  /**
   * Format messages array from Bedrock Converse format to Gemini contents format.
   */
  private _formatRequestMessages(messages: any[], toolUseIdToName: Record<string, string>): any[] {
    const contents: any[] = [];

    for (const msg of messages) {
      const role = msg.role === 'assistant' ? 'model' : 'user';
      const parts: any[] = [];

      for (const block of (msg.content ?? [])) {
        const part = this._formatContentPart(block, toolUseIdToName);
        if (part !== null) {
          parts.push(part);
        }
      }

      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    return contents;
  }

  // ── Response Formatting (Gemini → Bedrock) ─────────────────

  /**
   * Convert Gemini API response to Bedrock Converse-compatible format.
   *
   * Handles:
   * - text → text (with thought detection for reasoning)
   * - functionCall → toolUse (with id or generated id, plus thoughtSignature)
   * - thought parts → reasoningContent
   */
  private _formatResponse(response: any): string {
    if (response.error) {
      // Classify errors matching Python SDK
      const errorMessage = response.error.message ?? JSON.stringify(response.error);
      const errorStatus = response.error.status ?? '';

      if (errorStatus === 'RESOURCE_EXHAUSTED' || errorStatus === 'UNAVAILABLE') {
        return JSON.stringify({ error: `Throttled: ${errorMessage}` });
      }
      if (errorStatus === 'INVALID_ARGUMENT' && errorMessage.includes('exceeds the maximum number of tokens')) {
        return JSON.stringify({ error: `Context overflow: ${errorMessage}` });
      }

      return JSON.stringify({ error: errorMessage });
    }

    const candidate = response.candidates?.[0];
    if (!candidate) {
      return JSON.stringify({ error: response.error?.message ?? 'No Gemini response candidate' });
    }

    const content: any[] = [];
    let hasToolUse = false;

    for (const part of (candidate.content?.parts ?? [])) {
      // Function call → toolUse
      if (part.functionCall) {
        const fc = part.functionCall;
        // Use Gemini's provided ID or generate one (matches Python SDK)
        const toolUseId = fc.id ?? `tooluse_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

        const toolUseBlock: any = {
          name: fc.name,
          toolUseId,
          input: fc.args ?? {},
        };

        // Reasoning signature on tool_use (matches Python SDK)
        if (part.thoughtSignature) {
          toolUseBlock.reasoningSignature = part.thoughtSignature;
        }

        content.push({ toolUse: toolUseBlock });
        hasToolUse = true;
        continue;
      }

      // Thinking / reasoning content
      if (part.thought === true && part.text) {
        const reasoningBlock: any = {
          reasoningText: {
            text: part.text,
          },
        };
        if (part.thoughtSignature) {
          reasoningBlock.reasoningText.signature = part.thoughtSignature;
        }
        content.push({ reasoningContent: reasoningBlock });
        continue;
      }

      // Regular text
      if (part.text !== undefined) {
        content.push({ text: part.text });
        continue;
      }
    }

    // Map finishReason to Bedrock-compatible stopReason
    const finishReason = candidate.finishReason ?? '';
    let stopReason: string;
    if (hasToolUse) {
      stopReason = 'tool_use';
    } else if (finishReason === 'MAX_TOKENS') {
      stopReason = 'max_tokens';
    } else if (finishReason === 'SAFETY') {
      stopReason = 'content_filtered';
    } else if (finishReason === 'RECITATION') {
      stopReason = 'content_filtered';
    } else {
      stopReason = 'end_turn';
    }

    return JSON.stringify({
      output: { message: { role: 'assistant', content } },
      stopReason,
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
      },
    });
  }

  // ── HTTP Execution ────────────────────────────────────────

  private _curlSync(body: Record<string, unknown>): string {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.modelId}:generateContent?key=${this.config.apiKey}`;
    const bodyFile = join(tmpdir(), `strands-jsii-gemini-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(bodyFile, JSON.stringify(body));

    try {
      const result = execSync(
        `curl -s -X POST "${url}" -H "content-type: application/json" -d @"${bodyFile}"`,
        { encoding: 'utf-8', timeout: 300000, maxBuffer: 10 * 1024 * 1024 },
      );

      const response = JSON.parse(result.trim());
      return this._formatResponse(response);
    } catch (error: unknown) {
      const err = error as { stdout?: string; message?: string };

      // Try to parse Gemini error from stdout
      if (err.stdout) {
        try {
          const errorResponse = JSON.parse(err.stdout.trim());
          if (errorResponse.error) {
            return this._formatResponse(errorResponse);
          }
        } catch { /* not JSON, fall through */ }
      }

      return JSON.stringify({ error: err.message ?? 'Gemini API error' });
    } finally {
      try { unlinkSync(bodyFile); } catch { /* ignore */ }
    }
  }
}
