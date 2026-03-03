import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ModelProvider } from './provider';

/**
 * Tool choice configuration for Anthropic models.
 *
 * Controls how the model selects tools:
 * - "auto": Model decides whether to use tools (default)
 * - "any": Model must use at least one tool
 * - "tool": Model must use the specific named tool
 *
 * @example
 *
 * // Force specific tool usage
 * const choice = new AnthropicToolChoice("tool", "calculator");
 *
 * // Let model decide
 * const choice = new AnthropicToolChoice("auto");
 *
 * // Must use some tool
 * const choice = new AnthropicToolChoice("any");
 */
export class AnthropicToolChoice {
  /** The tool choice mode: "auto", "any", or "tool". */
  public readonly choiceMode: string;
  /** The specific tool name (only used when choiceMode is "tool"). */
  public readonly toolName: string;

  /**
   * Creates a new tool choice configuration.
   * @param choiceMode Choice mode: "auto", "any", or "tool"
   * @param toolName Specific tool name (required when choiceMode is "tool")
   */
  public constructor(choiceMode?: string, toolName?: string) {
    this.choiceMode = choiceMode ?? 'auto';
    this.toolName = toolName ?? '';
  }
}

/**
 * Configuration for Anthropic model parameters.
 *
 * Mirrors the Python SDK's AnthropicConfig with full feature parity:
 * - model_id, max_tokens (required)
 * - params dict for temperature, top_p, top_k, stop_sequences, etc.
 * - client_args for API key, base URL, anthropic-version header
 *
 * @example
 *
 * Python equivalent:
 *   AnthropicModel(model_id="claude-sonnet-4-20250514", max_tokens=8192,
 *                  params={"temperature": 0.7, "top_p": 0.9})
 *
 * TypeScript:
 *   new AnthropicModelConfig({
 *     modelId: "claude-sonnet-4-20250514",
 *     maxTokens: 8192,
 *     temperature: 0.7,
 *     topP: 0.9,
 *   })
 */
export interface AnthropicModelConfigOptions {
  /** The Anthropic model ID. Default: claude-sonnet-4-20250514 */
  readonly modelId?: string;
  /** Anthropic API key. If not provided, uses ANTHROPIC_API_KEY env var. */
  readonly apiKey?: string;
  /** Maximum tokens to generate. Default: 4096 */
  readonly maxTokens?: number;
  /** Sampling temperature (0.0-1.0). */
  readonly temperature?: number;
  /** Top-P for nucleus sampling (0.0-1.0). */
  readonly topP?: number;
  /** Top-K for sampling. Only sample from top K options. */
  readonly topK?: number;
  /** Base URL for the Anthropic API. Default: https://api.anthropic.com */
  readonly baseUrl?: string;
  /** Anthropic API version header. Default: 2023-06-01 */
  readonly anthropicVersion?: string;
  /** Stop sequences that will halt generation. JSON array string. */
  readonly stopSequencesJson?: string;
  /** Tool choice configuration. */
  readonly toolChoice?: AnthropicToolChoice;
  /**
   * Extended thinking configuration.
   * When enabled, the model will include reasoning/thinking blocks.
   *
   * JSON string: {"type": "enabled", "budget_tokens": 10000}
   *
   * Note: When thinking is enabled, temperature must be 1.0 and
   * top_k/top_p should not be set (Anthropic API requirement).
   */
  readonly thinkingJson?: string;
  /**
   * Additional model parameters as JSON string.
   * These are merged into the request body directly.
   * Matches the Python SDK's `params` dict.
   *
   * Example: '{"metadata": {"user_id": "user123"}}'
   */
  readonly additionalParamsJson?: string;
}

export class AnthropicModelConfig {
  /** The Anthropic model ID. */
  public readonly modelId: string;
  /** Anthropic API key. If not provided, uses ANTHROPIC_API_KEY env var. */
  public readonly apiKey: string;
  /** Maximum tokens to generate. */
  public readonly maxTokens: number;
  /** Sampling temperature. */
  public readonly temperature: number;
  /** Top-P for nucleus sampling. */
  public readonly topP: number;
  /** Top-K for sampling. -1 means not set. */
  public readonly topK: number;
  /** Base URL for the API. */
  public readonly baseUrl: string;
  /** Anthropic API version header. */
  public readonly anthropicVersion: string;
  /** Stop sequences JSON array string. */
  public readonly stopSequencesJson: string;
  /** Tool choice configuration. */
  public readonly toolChoice: AnthropicToolChoice | undefined;
  /** Extended thinking configuration JSON. */
  public readonly thinkingJson: string;
  /** Additional parameters JSON. */
  public readonly additionalParamsJson: string;

  /**
   * Creates a new Anthropic model configuration.
   * @param options Configuration options
   */
  public constructor(options?: AnthropicModelConfigOptions) {
    this.modelId = options?.modelId ?? 'claude-sonnet-4-20250514';
    this.apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
    this.maxTokens = options?.maxTokens ?? 4096;
    this.temperature = options?.temperature ?? -1; // -1 = not explicitly set
    this.topP = options?.topP ?? -1; // -1 = not set
    this.topK = options?.topK ?? -1; // -1 = not set
    this.baseUrl = options?.baseUrl ?? 'https://api.anthropic.com';
    this.anthropicVersion = options?.anthropicVersion ?? '2023-06-01';
    this.stopSequencesJson = options?.stopSequencesJson ?? '';
    this.toolChoice = options?.toolChoice;
    this.thinkingJson = options?.thinkingJson ?? '';
    this.additionalParamsJson = options?.additionalParamsJson ?? '';
  }
}

/**
 * Anthropic Claude model provider (direct API).
 *
 * Full feature parity with the Python SDK's AnthropicModel, including:
 * - Extended thinking / reasoning content
 * - Image and document content blocks
 * - Cache points (prompt caching)
 * - Tool choice (auto, any, specific tool)
 * - All sampling parameters (temperature, top_p, top_k, stop_sequences)
 * - Proper content block format conversion (Bedrock ↔ Anthropic)
 *
 * Uses synchronous HTTP via curl (jsii requirement — no async).
 *
 * @example
 *
 * Python equivalent:
 *   model = AnthropicModel(model_id="claude-sonnet-4-20250514", max_tokens=8192)
 *   agent = Agent(model=model)
 *
 * TypeScript:
 *   const model = new AnthropicModelProvider(new AnthropicModelConfig({
 *     modelId: "claude-sonnet-4-20250514",
 *     maxTokens: 8192,
 *   }));
 *   const agent = new StrandsAgent(new AgentConfig({ model }));
 *
 * Java:
 *   var config = new AnthropicModelConfig(AnthropicModelConfigOptions.builder()
 *       .modelId("claude-sonnet-4-20250514").maxTokens(8192).build());
 *   var model = new AnthropicModelProvider(config);
 *
 * With extended thinking:
 *   const model = new AnthropicModelProvider(new AnthropicModelConfig({
 *     modelId: "claude-sonnet-4-20250514",
 *     maxTokens: 16000,
 *     thinkingJson: '{"type":"enabled","budget_tokens":10000}',
 *   }));
 */
export class AnthropicModelProvider extends ModelProvider {
  /** The model configuration. */
  public readonly config: AnthropicModelConfig;

  /**
   * Creates a new Anthropic model provider.
   * @param config Model configuration
   */
  public constructor(config?: AnthropicModelConfig) {
    super();
    this.config = config ?? new AnthropicModelConfig();
  }

  /** @inheritdoc */
  public converse(
    messagesJson: string,
    systemPrompt?: string,
    toolSpecsJson?: string,
  ): string {
    const messages = JSON.parse(messagesJson);

    // Convert from Bedrock Converse format to Anthropic Messages API format
    const anthropicMessages = this._formatRequestMessages(messages);

    // Build request body
    const body: Record<string, unknown> = {
      model: this.config.modelId,
      messages: anthropicMessages,
      max_tokens: this.config.maxTokens,
    };

    // Sampling parameters — only include if explicitly set
    if (this.config.temperature >= 0) {
      body.temperature = this.config.temperature;
    }
    if (this.config.topP >= 0) {
      body.top_p = this.config.topP;
    }
    if (this.config.topK >= 0) {
      body.top_k = this.config.topK;
    }

    // Stop sequences
    if (this.config.stopSequencesJson) {
      body.stop_sequences = JSON.parse(this.config.stopSequencesJson);
    }

    // System prompt
    if (systemPrompt) {
      body.system = systemPrompt;
    }

    // Tools
    if (toolSpecsJson) {
      const toolSpecs = JSON.parse(toolSpecsJson);
      body.tools = toolSpecs.map((spec: { name: string; description: string; inputSchema: object }) => ({
        name: spec.name,
        description: spec.description,
        input_schema: spec.inputSchema,
      }));
    }

    // Tool choice — matches Python SDK's _format_tool_choice
    if (this.config.toolChoice) {
      const tc = this.config.toolChoice;
      if (tc.choiceMode === 'any') {
        body.tool_choice = { type: 'any' };
      } else if (tc.choiceMode === 'tool' && tc.toolName) {
        body.tool_choice = { type: 'tool', name: tc.toolName };
      } else if (tc.choiceMode === 'auto') {
        body.tool_choice = { type: 'auto' };
      }
    }

    // Extended thinking — matches Python SDK's thinking/reasoning support
    if (this.config.thinkingJson) {
      body.thinking = JSON.parse(this.config.thinkingJson);
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
    return 'anthropic';
  }

  // ── Request Formatting (Bedrock → Anthropic) ─────────────

  /**
   * Format a single content block from Bedrock Converse format to Anthropic format.
   *
   * Handles:
   * - text → text
   * - toolUse → tool_use
   * - toolResult → tool_result (with nested content)
   * - reasoningContent → thinking (extended thinking)
   * - image → image (base64)
   * - document → document (base64 or text)
   *
   * Matches Python SDK's _format_request_message_content.
   */
  private _formatContentBlock(block: any): any | null {
    // Text content
    if (block.text !== undefined) {
      return { type: 'text', text: block.text };
    }

    // Tool use
    if (block.toolUse) {
      const tu = block.toolUse;
      return {
        type: 'tool_use',
        id: tu.toolUseId,
        name: tu.name,
        input: tu.input,
      };
    }

    // Tool result — format nested content properly (matches Python SDK)
    if (block.toolResult) {
      const tr = block.toolResult;
      let formattedContent: any;

      if (Array.isArray(tr.content)) {
        // Format each nested content block
        formattedContent = tr.content.map((item: any) => {
          if (item.json !== undefined) {
            return { type: 'text', text: JSON.stringify(item.json) };
          }
          if (item.text !== undefined) {
            return { type: 'text', text: item.text };
          }
          if (item.image) {
            return this._formatContentBlock(item);
          }
          // Fallback: stringify the whole thing
          return { type: 'text', text: JSON.stringify(item) };
        });
      } else {
        formattedContent = JSON.stringify(tr.content);
      }

      return {
        type: 'tool_result',
        tool_use_id: tr.toolUseId,
        content: formattedContent,
        is_error: tr.status === 'error',
      };
    }

    // Reasoning / extended thinking (Bedrock format → Anthropic thinking format)
    if (block.reasoningContent) {
      const rc = block.reasoningContent;
      const reasoningText = rc.reasoningText ?? rc;
      return {
        type: 'thinking',
        thinking: reasoningText.text ?? '',
        signature: reasoningText.signature ?? '',
      };
    }

    // Image content (matches Python SDK's image handling)
    if (block.image) {
      const img = block.image;
      const bytes = img.source?.bytes;
      const format = img.format ?? 'png';

      // Map format to MIME type
      const mimeMap: Record<string, string> = {
        png: 'image/png',
        jpeg: 'image/jpeg',
        jpg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
      };
      const mediaType = mimeMap[format] ?? 'image/png';

      if (bytes) {
        // bytes can be a Buffer or base64 string
        const base64Data = typeof bytes === 'string'
          ? bytes
          : Buffer.from(bytes).toString('base64');

        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: base64Data,
          },
        };
      }

      // Skip if no bytes (location sources not supported, matching Python SDK)
      return null;
    }

    // Document content (matches Python SDK's document handling)
    if (block.document) {
      const doc = block.document;
      const bytes = doc.source?.bytes;
      const format = doc.format ?? 'txt';
      const name = doc.name ?? 'document';

      // Map format to MIME type
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
        const isText = mimeType === 'text/plain';
        const data = isText
          ? (typeof bytes === 'string' ? bytes : Buffer.from(bytes).toString('utf-8'))
          : (typeof bytes === 'string' ? bytes : Buffer.from(bytes).toString('base64'));

        return {
          type: 'document',
          source: {
            type: isText ? 'text' : 'base64',
            media_type: mimeType,
            data: data,
          },
          title: name,
        };
      }

      return null;
    }

    // Cache point — applies cache_control to the previous block
    // (handled at the message level in _formatRequestMessages)
    if (block.cachePoint !== undefined) {
      return null; // sentinel, handled by caller
    }

    // Unknown block type — return as-is
    return block;
  }

  /**
   * Format messages array from Bedrock Converse format to Anthropic format.
   *
   * Handles cache points by attaching cache_control to the preceding content block,
   * matching the Python SDK's _format_request_messages behavior.
   */
  private _formatRequestMessages(messages: any[]): any[] {
    const formatted: any[] = [];

    for (const msg of messages) {
      const formattedContents: any[] = [];

      for (const block of (msg.content ?? [])) {
        // Cache point: attach cache_control to the previous block
        if (block.cachePoint !== undefined) {
          if (formattedContents.length > 0) {
            formattedContents[formattedContents.length - 1].cache_control = { type: 'ephemeral' };
          }
          continue;
        }

        const formatted_block = this._formatContentBlock(block);
        if (formatted_block !== null) {
          formattedContents.push(formatted_block);
        }
      }

      if (formattedContents.length > 0) {
        formatted.push({
          role: msg.role,
          content: formattedContents,
        });
      }
    }

    return formatted;
  }

  // ── Response Formatting (Anthropic → Bedrock) ─────────────

  /**
   * Convert Anthropic API response to Bedrock Converse-compatible format.
   *
   * Handles:
   * - text → text
   * - tool_use → toolUse
   * - thinking → reasoningContent (extended thinking)
   *
   * Matches the Python SDK's format_chunk behavior for non-streaming.
   */
  private _formatResponse(response: any): string {
    if (response.error) {
      return JSON.stringify({ error: response.error.message ?? response.error });
    }

    const content: any[] = [];

    for (const block of (response.content ?? [])) {
      switch (block.type) {
        case 'text':
          content.push({ text: block.text });
          break;

        case 'tool_use':
          content.push({
            toolUse: {
              name: block.name,
              toolUseId: block.id,
              input: block.input,
            },
          });
          break;

        case 'thinking':
          // Extended thinking → reasoningContent (Bedrock format)
          content.push({
            reasoningContent: {
              reasoningText: {
                text: block.thinking ?? '',
                signature: block.signature ?? '',
              },
            },
          });
          break;

        default:
          // Unknown block type — skip
          break;
      }
    }

    // Map stop_reason to Bedrock-compatible values
    const stopReason = response.stop_reason === 'tool_use' ? 'tool_use' :
      response.stop_reason === 'max_tokens' ? 'max_tokens' :
        response.stop_reason === 'stop_sequence' ? 'stop_sequence' : 'end_turn';

    return JSON.stringify({
      output: { message: { role: 'assistant', content } },
      stopReason,
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        // Include cache metrics if available (prompt caching)
        ...(response.usage?.cache_creation_input_tokens !== undefined
          ? { cacheCreationInputTokens: response.usage.cache_creation_input_tokens }
          : {}),
        ...(response.usage?.cache_read_input_tokens !== undefined
          ? { cacheReadInputTokens: response.usage.cache_read_input_tokens }
          : {}),
      },
    });
  }

  // ── HTTP Execution ────────────────────────────────────────

  private _curlSync(body: Record<string, unknown>): string {
    const bodyFile = join(tmpdir(), `strands-jsii-anthropic-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(bodyFile, JSON.stringify(body));

    try {
      const result = execSync(
        `curl -s -X POST "${this.config.baseUrl}/v1/messages" ` +
        `-H "content-type: application/json" ` +
        `-H "x-api-key: ${this.config.apiKey}" ` +
        `-H "anthropic-version: ${this.config.anthropicVersion}" ` +
        `-d @"${bodyFile}"`,
        { encoding: 'utf-8', timeout: 300000, maxBuffer: 10 * 1024 * 1024 },
      );

      const response = JSON.parse(result.trim());
      return this._formatResponse(response);
    } catch (error: unknown) {
      const err = error as { stdout?: string; message?: string };

      // Try to extract Anthropic error details from stdout
      if (err.stdout) {
        try {
          const errorResponse = JSON.parse(err.stdout.trim());
          if (errorResponse.error) {
            const msg = errorResponse.error.message ?? JSON.stringify(errorResponse.error);
            const errorType = errorResponse.error.type ?? '';

            // Match Python SDK's error classification
            if (errorType === 'rate_limit_error' || msg.toLowerCase().includes('rate limit')) {
              return JSON.stringify({ error: `Throttled: ${msg}` });
            }
            if (errorType === 'invalid_request_error') {
              // Check for context window overflow
              const lower = msg.toLowerCase();
              if (lower.includes('too long') || lower.includes('context') || lower.includes('input length')) {
                return JSON.stringify({ error: `Context overflow: ${msg}` });
              }
            }
            return JSON.stringify({ error: msg });
          }
        } catch { /* not JSON, fall through */ }
      }

      return JSON.stringify({ error: err.message ?? 'Anthropic API error' });
    } finally {
      try { unlinkSync(bodyFile); } catch { /* ignore */ }
    }
  }
}
