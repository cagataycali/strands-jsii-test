import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ModelProvider } from './provider';

/**
 * Tool choice configuration for OpenAI models.
 *
 * Controls how the model selects tools:
 * - "auto": Model decides whether to use tools (default)
 * - "required": Model must use at least one tool (maps from Bedrock "any")
 * - "function": Model must use the specific named function
 *
 * @example
 *
 * // Force specific tool usage
 * const choice = new OpenAIToolChoice("function", "calculator");
 *
 * // Let model decide
 * const choice = new OpenAIToolChoice("auto");
 *
 * // Must use some tool
 * const choice = new OpenAIToolChoice("required");
 */
export class OpenAIToolChoice {
  /** The tool choice mode: "auto", "required", or "function". */
  public readonly choiceMode: string;
  /** The specific function name (only used when choiceMode is "function"). */
  public readonly functionName: string;

  /**
   * Creates a new tool choice configuration.
   * @param choiceMode Choice mode: "auto", "required", or "function"
   * @param functionName Specific function name (required when choiceMode is "function")
   */
  public constructor(choiceMode?: string, functionName?: string) {
    this.choiceMode = choiceMode ?? 'auto';
    this.functionName = functionName ?? '';
  }
}

/**
 * Configuration options for the OpenAI model provider.
 *
 * Mirrors the Python SDK's OpenAIConfig with full feature parity:
 * - model_id (required)
 * - params dict for max_tokens, temperature, top_p, frequency_penalty, etc.
 * - client_args for api_key, base_url
 *
 * @example
 *
 * Python equivalent:
 *   OpenAIModel(model_id="gpt-4o",
 *               client_args={"api_key": "sk-..."},
 *               params={"temperature": 0.7, "top_p": 0.9})
 *
 * TypeScript:
 *   new OpenAIModelConfig({
 *     modelId: "gpt-4o",
 *     apiKey: "sk-...",
 *     temperature: 0.7,
 *     topP: 0.9,
 *   })
 */
export interface OpenAIModelConfigOptions {
  /** The OpenAI model ID. Default: gpt-4o */
  readonly modelId?: string;
  /** OpenAI API key. If not provided, uses OPENAI_API_KEY env var. */
  readonly apiKey?: string;
  /** Maximum tokens to generate. -1 = not explicitly set (model default). */
  readonly maxTokens?: number;
  /** Sampling temperature. -1 = not explicitly set. */
  readonly temperature?: number;
  /** Top-P for nucleus sampling. -1 = not set. */
  readonly topP?: number;
  /** Frequency penalty (-2.0 to 2.0). Uses sentinel 999 for "not set". */
  readonly frequencyPenalty?: number;
  /** Presence penalty (-2.0 to 2.0). Uses sentinel 999 for "not set". */
  readonly presencePenalty?: number;
  /** Random seed for deterministic generation. -1 = not set. */
  readonly seed?: number;
  /** Base URL for the API (for OpenAI-compatible endpoints). Default: https://api.openai.com */
  readonly baseUrl?: string;
  /** Stop sequences JSON array string. */
  readonly stopSequencesJson?: string;
  /** Tool choice configuration. */
  readonly toolChoice?: OpenAIToolChoice;
  /**
   * Additional model parameters as JSON string.
   * These are merged into the request body directly.
   * Matches the Python SDK's `params` dict.
   *
   * Example: '{"logprobs": true, "top_logprobs": 5}'
   *
   * @see https://platform.openai.com/docs/api-reference/chat/create
   */
  readonly additionalParamsJson?: string;
}

export class OpenAIModelConfig {
  /** The OpenAI model ID. */
  public readonly modelId: string;
  /** OpenAI API key. */
  public readonly apiKey: string;
  /** Maximum tokens to generate. -1 = not explicitly set. */
  public readonly maxTokens: number;
  /** Sampling temperature. -1 = not explicitly set. */
  public readonly temperature: number;
  /** Top-P for nucleus sampling. -1 = not set. */
  public readonly topP: number;
  /** Frequency penalty. 999 = not set. */
  public readonly frequencyPenalty: number;
  /** Presence penalty. 999 = not set. */
  public readonly presencePenalty: number;
  /** Random seed. -1 = not set. */
  public readonly seed: number;
  /** Base URL for the API. */
  public readonly baseUrl: string;
  /** Stop sequences JSON array string. */
  public readonly stopSequencesJson: string;
  /** Tool choice configuration. */
  public readonly toolChoice: OpenAIToolChoice | undefined;
  /** Additional parameters JSON. */
  public readonly additionalParamsJson: string;

  /**
   * Creates a new OpenAI model configuration.
   * @param options Configuration options
   */
  public constructor(options?: OpenAIModelConfigOptions) {
    this.modelId = options?.modelId ?? 'gpt-4o';
    this.apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.maxTokens = options?.maxTokens ?? -1;
    this.temperature = options?.temperature ?? -1;
    this.topP = options?.topP ?? -1;
    this.frequencyPenalty = options?.frequencyPenalty ?? 999;
    this.presencePenalty = options?.presencePenalty ?? 999;
    this.seed = options?.seed ?? -1;
    this.baseUrl = options?.baseUrl ?? 'https://api.openai.com';
    this.stopSequencesJson = options?.stopSequencesJson ?? '';
    this.toolChoice = options?.toolChoice;
    this.additionalParamsJson = options?.additionalParamsJson ?? '';
  }
}

/**
 * OpenAI model provider.
 *
 * Full feature parity with the Python SDK's OpenAIModel, including:
 * - Image content (image_url with base64 data URI)
 * - Document/file content (file with base64 data URI)
 * - Proper tool result formatting (nested content, single-text optimization, JSON→text)
 * - Image extraction from tool results (moved to user messages per OpenAI API rules)
 * - Tool choice (auto, required, specific function)
 * - Reasoning content (reasoning_content on responses)
 * - All parameters (temperature, top_p, frequency_penalty, presence_penalty, seed, stop)
 * - Error classification (context_length_exceeded, rate limit, overflow)
 * - OpenAI-compatible endpoints (vLLM, Together, Fireworks, Databricks, etc.)
 *
 * Uses synchronous HTTP via curl (jsii requirement — no async).
 *
 * @example
 *
 * Python equivalent:
 *   model = OpenAIModel(model_id="gpt-4o", client_args={"api_key": "sk-..."})
 *   agent = Agent(model=model)
 *
 * TypeScript:
 *   const model = new OpenAIModelProvider(new OpenAIModelConfig({
 *     modelId: "gpt-4o",
 *     apiKey: "sk-...",
 *   }));
 *
 * With OpenAI-compatible endpoint:
 *   const model = new OpenAIModelProvider(new OpenAIModelConfig({
 *     modelId: "meta-llama/Llama-3-70b",
 *     baseUrl: "https://api.together.xyz",
 *     apiKey: "...",
 *   }));
 */
export class OpenAIModelProvider extends ModelProvider {
  /** The model configuration. */
  public readonly config: OpenAIModelConfig;

  /**
   * Creates a new OpenAI model provider.
   * @param config Model configuration
   */
  public constructor(config?: OpenAIModelConfig) {
    super();
    this.config = config ?? new OpenAIModelConfig();
  }

  /** @inheritdoc */
  public converse(
    messagesJson: string,
    systemPrompt?: string,
    toolSpecsJson?: string,
  ): string {
    const messages = JSON.parse(messagesJson);

    // Convert from Bedrock format to OpenAI format
    const openaiMessages = this._formatRequestMessages(messages, systemPrompt);

    // Build request body
    const body: Record<string, unknown> = {
      model: this.config.modelId,
      messages: openaiMessages,
    };

    // Only include params when explicitly set
    if (this.config.maxTokens >= 0) {
      body.max_tokens = this.config.maxTokens;
    }
    if (this.config.temperature >= 0) {
      body.temperature = this.config.temperature;
    }
    if (this.config.topP >= 0) {
      body.top_p = this.config.topP;
    }
    if (this.config.frequencyPenalty !== 999) {
      body.frequency_penalty = this.config.frequencyPenalty;
    }
    if (this.config.presencePenalty !== 999) {
      body.presence_penalty = this.config.presencePenalty;
    }
    if (this.config.seed >= 0) {
      body.seed = this.config.seed;
    }
    if (this.config.stopSequencesJson) {
      body.stop = JSON.parse(this.config.stopSequencesJson);
    }

    // Tools
    if (toolSpecsJson) {
      const toolSpecs = JSON.parse(toolSpecsJson);
      body.tools = toolSpecs.map((spec: { name: string; description: string; inputSchema: object }) => ({
        type: 'function',
        function: {
          name: spec.name,
          description: spec.description,
          parameters: spec.inputSchema,
        },
      }));
    }

    // Tool choice — matches Python SDK's _format_request_tool_choice
    if (this.config.toolChoice) {
      const tc = this.config.toolChoice;
      if (tc.choiceMode === 'auto') {
        body.tool_choice = 'auto';
      } else if (tc.choiceMode === 'required') {
        body.tool_choice = 'required';
      } else if (tc.choiceMode === 'function' && tc.functionName) {
        body.tool_choice = { type: 'function', function: { name: tc.functionName } };
      }
    }

    // Additional params — merged directly into body (like Python SDK's params dict)
    if (this.config.additionalParamsJson) {
      const additionalParams = JSON.parse(this.config.additionalParamsJson);
      for (const [key, value] of Object.entries(additionalParams)) {
        body[key] = value;
      }
    }

    return this._curlSync(body);
  }

  /** @inheritdoc */
  public get modelId(): string {
    return this.config.modelId;
  }

  /** @inheritdoc */
  public get providerName(): string {
    return 'openai';
  }

  // ── Request Formatting (Bedrock → OpenAI) ─────────────────

  /**
   * Format a single content block from Bedrock Converse format to OpenAI format.
   *
   * Handles:
   * - text → { type: "text", text }
   * - image → { type: "image_url", image_url: { url: data URI } }
   * - document → { type: "file", file: { file_data: data URI, filename } }
   *
   * Matches Python SDK's format_request_message_content.
   */
  private _formatContentBlock(block: any): any | null {
    // Text content
    if (block.text !== undefined) {
      return { type: 'text', text: block.text };
    }

    // Image content → image_url with base64 data URI
    if (block.image) {
      const img = block.image;
      const bytes = img.source?.bytes;
      const format = img.format ?? 'png';

      const mimeMap: Record<string, string> = {
        png: 'image/png', jpeg: 'image/jpeg', jpg: 'image/jpeg',
        gif: 'image/gif', webp: 'image/webp',
      };
      const mimeType = mimeMap[format] ?? 'image/png';

      if (bytes) {
        const base64Data = typeof bytes === 'string'
          ? bytes
          : Buffer.from(bytes).toString('base64');

        return {
          type: 'image_url',
          image_url: {
            detail: 'auto',
            format: mimeType,
            url: `data:${mimeType};base64,${base64Data}`,
          },
        };
      }
      return null;
    }

    // Document content → file with base64 data URI
    if (block.document) {
      const doc = block.document;
      const bytes = doc.source?.bytes;
      const format = doc.format ?? 'txt';
      const name = doc.name ?? 'document';

      const docMimeMap: Record<string, string> = {
        pdf: 'application/pdf', txt: 'text/plain', md: 'text/plain',
        csv: 'text/csv', html: 'text/html',
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
          type: 'file',
          file: {
            file_data: `data:${mimeType};base64,${base64Data}`,
            filename: name,
          },
        };
      }
      return null;
    }

    // Skip reasoning content, toolUse, toolResult (handled separately)
    if (block.reasoningContent || block.toolUse || block.toolResult || block.cachePoint !== undefined) {
      return null;
    }

    return block;
  }

  /**
   * Format a tool use block to OpenAI tool_call format.
   * Matches Python SDK's format_request_message_tool_call.
   */
  private _formatToolCall(toolUse: any): any {
    return {
      id: toolUse.toolUseId,
      type: 'function',
      function: {
        name: toolUse.name,
        arguments: JSON.stringify(toolUse.input ?? {}),
      },
    };
  }

  /**
   * Format a tool result block to OpenAI tool message.
   *
   * Handles:
   * - JSON content → text conversion
   * - Nested content block formatting
   * - Single text optimization (string instead of array)
   * - Image extraction (returned separately for user message)
   *
   * Matches Python SDK's format_request_tool_message + _split_tool_message_images.
   */
  private _formatToolMessage(toolResult: any): { toolMsg: any; imageUserMsg: any | null } {
    const toolUseId = toolResult.toolUseId;
    const contents = toolResult.content ?? [];

    // Format each content item
    const formattedContents: any[] = [];
    for (const item of contents) {
      if (item.json !== undefined) {
        // JSON → text (matches Python SDK)
        formattedContents.push({ type: 'text', text: JSON.stringify(item.json) });
      } else {
        const formatted = this._formatContentBlock(item);
        if (formatted) {
          formattedContents.push(formatted);
        }
      }
    }

    // Split images from tool message (OpenAI requires images in user messages only)
    const textContent: any[] = [];
    const imageContent: any[] = [];

    for (const item of formattedContents) {
      if (item.type === 'image_url') {
        imageContent.push(item);
      } else {
        textContent.push(item);
      }
    }

    // If images found, add note and create separate user message
    let imageUserMsg: any | null = null;
    if (imageContent.length > 0) {
      textContent.push({
        type: 'text',
        text: 'Tool successfully returned an image. The image is being provided in the following user message.',
      });
      imageUserMsg = { role: 'user', content: imageContent };
    }

    // Single text content optimization — use string instead of array (matches Python SDK)
    let content: any;
    if (textContent.length === 1 && textContent[0].type === 'text') {
      content = textContent[0].text;
    } else {
      content = textContent;
    }

    const toolMsg = {
      role: 'tool',
      tool_call_id: toolUseId,
      content,
    };

    return { toolMsg, imageUserMsg };
  }

  /**
   * Format messages array from Bedrock Converse format to OpenAI format.
   *
   * Matches Python SDK's format_request_messages:
   * - System prompt → system message
   * - User messages with content blocks (text, image, document)
   * - Assistant messages with content + tool_calls
   * - Tool results → tool messages (with image extraction to user messages)
   * - Reasoning content filtered from multi-turn (with warning pattern)
   */
  private _formatRequestMessages(messages: any[], systemPrompt?: string): any[] {
    const formatted: any[] = [];

    // System prompt
    if (systemPrompt) {
      formatted.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      const contents = msg.content ?? [];

      // Separate content types
      const regularContents: any[] = [];
      const toolUses: any[] = [];
      const toolResults: any[] = [];

      for (const block of contents) {
        if (block.toolUse) {
          toolUses.push(block.toolUse);
        } else if (block.toolResult) {
          toolResults.push(block.toolResult);
        } else if (block.reasoningContent) {
          // Skip reasoning content in multi-turn (matches Python SDK warning)
          continue;
        } else {
          const formatted_block = this._formatContentBlock(block);
          if (formatted_block !== null) {
            regularContents.push(formatted_block);
          }
        }
      }

      // Build the primary message
      if (msg.role === 'assistant') {
        const assistantMsg: Record<string, unknown> = { role: 'assistant' };

        if (regularContents.length > 0) {
          // If only text blocks, join them (simpler format)
          const allText = regularContents.every(c => c.type === 'text');
          if (allText) {
            assistantMsg.content = regularContents.map(c => c.text).join('');
          } else {
            assistantMsg.content = regularContents;
          }
        }

        if (toolUses.length > 0) {
          assistantMsg.tool_calls = toolUses.map(tu => this._formatToolCall(tu));
        }

        // Only add if there's content or tool_calls
        if (assistantMsg.content || assistantMsg.tool_calls) {
          formatted.push(assistantMsg);
        }
      } else {
        // User message
        if (regularContents.length > 0) {
          // If single text, use simple string format
          if (regularContents.length === 1 && regularContents[0].type === 'text') {
            formatted.push({ role: 'user', content: regularContents[0].text });
          } else {
            formatted.push({ role: 'user', content: regularContents });
          }
        }

        // Tool results → separate tool messages + image user messages
        // All tool messages grouped first, then image user messages (matches Python SDK)
        const imageUserMsgs: any[] = [];

        for (const tr of toolResults) {
          const { toolMsg, imageUserMsg } = this._formatToolMessage(tr);
          formatted.push(toolMsg);
          if (imageUserMsg) {
            imageUserMsgs.push(imageUserMsg);
          }
        }

        // Append image user messages after all tool messages
        formatted.push(...imageUserMsgs);
      }
    }

    // Filter out messages with no content and no tool_calls (matches Python SDK)
    return formatted.filter(m => m.content !== undefined || m.tool_calls !== undefined);
  }

  // ── Response Formatting (OpenAI → Bedrock) ─────────────────

  /**
   * Convert OpenAI API response to Bedrock Converse-compatible format.
   *
   * Handles:
   * - text content → text
   * - tool_calls → toolUse
   * - reasoning_content → reasoningContent
   * - finish_reason mapping (tool_calls, length, content_filter, stop)
   */
  private _formatResponse(response: any): string {
    if (response.error) {
      const errorMessage = response.error.message ?? JSON.stringify(response.error);
      const errorCode = response.error.code ?? '';

      // Error classification matching Python SDK
      if (errorCode === 'context_length_exceeded') {
        return JSON.stringify({ error: `Context overflow: ${errorMessage}` });
      }
      if (errorCode === 'rate_limit_exceeded' || errorMessage.toLowerCase().includes('rate limit')) {
        return JSON.stringify({ error: `Throttled: ${errorMessage}` });
      }

      // Check alternative context overflow messages (Databricks, etc.)
      const overflowMessages = [
        'Input is too long for requested model',
        'input length and `max_tokens` exceed context limit',
        'too many total text bytes',
      ];
      const lowerMsg = errorMessage.toLowerCase();
      for (const overflow of overflowMessages) {
        if (lowerMsg.includes(overflow.toLowerCase())) {
          return JSON.stringify({ error: `Context overflow: ${errorMessage}` });
        }
      }

      return JSON.stringify({ error: errorMessage });
    }

    const choice = response.choices?.[0];
    if (!choice) {
      return JSON.stringify({ error: 'No response from OpenAI' });
    }

    const content: any[] = [];

    // Reasoning content (o1, o3 models)
    if (choice.message?.reasoning_content) {
      content.push({
        reasoningContent: {
          reasoningText: {
            text: choice.message.reasoning_content,
          },
        },
      });
    }

    // Text content
    if (choice.message?.content) {
      content.push({ text: choice.message.content });
    }

    // Tool calls → toolUse
    if (choice.message?.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        content.push({
          toolUse: {
            name: tc.function.name,
            toolUseId: tc.id,
            input: JSON.parse(tc.function.arguments ?? '{}'),
          },
        });
      }
    }

    // Map finish_reason to Bedrock-compatible stopReason
    const finishReason = choice.finish_reason ?? '';
    let stopReason: string;
    if (finishReason === 'tool_calls') {
      stopReason = 'tool_use';
    } else if (finishReason === 'length') {
      stopReason = 'max_tokens';
    } else if (finishReason === 'content_filter') {
      stopReason = 'content_filtered';
    } else {
      stopReason = 'end_turn';
    }

    return JSON.stringify({
      output: { message: { role: 'assistant', content } },
      stopReason,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
    });
  }

  // ── HTTP Execution ────────────────────────────────────────

  private _curlSync(body: Record<string, unknown>): string {
    const bodyFile = join(tmpdir(), `strands-jsii-openai-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(bodyFile, JSON.stringify(body));

    try {
      const result = execSync(
        `curl -s -X POST "${this.config.baseUrl}/v1/chat/completions" ` +
        `-H "content-type: application/json" ` +
        `-H "Authorization: Bearer ${this.config.apiKey}" ` +
        `-d @"${bodyFile}"`,
        { encoding: 'utf-8', timeout: 300000, maxBuffer: 10 * 1024 * 1024 },
      );

      const response = JSON.parse(result.trim());
      return this._formatResponse(response);
    } catch (error: unknown) {
      const err = error as { stdout?: string; message?: string };

      // Try to parse OpenAI error from stdout
      if (err.stdout) {
        try {
          const errorResponse = JSON.parse(err.stdout.trim());
          if (errorResponse.error) {
            return this._formatResponse(errorResponse);
          }
        } catch { /* not JSON, fall through */ }
      }

      return JSON.stringify({ error: err.message ?? 'OpenAI API error' });
    } finally {
      try { unlinkSync(bodyFile); } catch { /* ignore */ }
    }
  }
}
