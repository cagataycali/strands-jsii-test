import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ModelProvider } from './provider';

/**
 * Configuration options for the Ollama model provider.
 *
 * Mirrors the Python SDK's OllamaConfig with full feature parity:
 * - model_id (required)
 * - host for server address
 * - keep_alive for model persistence in memory
 * - options dict for temperature, top_p, top_k, num_predict, etc.
 * - stop_sequences, max_tokens, temperature, top_p as convenience fields
 *
 * @example
 *
 * Python equivalent:
 *   OllamaModel(host="http://localhost:11434", model_id="llama3",
 *               temperature=0.7, max_tokens=4096, keep_alive="5m")
 *
 * TypeScript:
 *   new OllamaModelConfig({
 *     host: "http://localhost:11434",
 *     modelId: "llama3",
 *     temperature: 0.7,
 *     maxTokens: 4096,
 *     keepAlive: "5m",
 *   })
 */
export interface OllamaModelConfigOptions {
  /** Ollama model ID (e.g., "llama3", "mistral", "phi3", "qwen3:8b"). */
  readonly modelId?: string;
  /** Address of the Ollama server. Default: http://localhost:11434 */
  readonly host?: string;
  /** Maximum tokens to generate (num_predict). -1 = not set. */
  readonly maxTokens?: number;
  /** Sampling temperature. -1 = not set. */
  readonly temperature?: number;
  /** Top-P for nucleus sampling. -1 = not set. */
  readonly topP?: number;
  /** Top-K for sampling. -1 = not set. */
  readonly topK?: number;
  /**
   * How long the model stays loaded in memory after request.
   * Default: "5m". Set to "0" to unload immediately, "-1" to keep forever.
   */
  readonly keepAlive?: string;
  /** Stop sequences JSON array string. */
  readonly stopSequencesJson?: string;
  /**
   * Additional Ollama options as JSON string.
   * These are merged into the "options" object of the request.
   *
   * Example: '{"num_ctx": 8192, "repeat_penalty": 1.1, "seed": 42}'
   *
   * @see https://github.com/ollama/ollama/blob/main/docs/modelfile.md#valid-parameters-and-values
   */
  readonly optionsJson?: string;
  /**
   * Additional top-level request arguments as JSON string.
   * These are merged directly into the request body.
   * Matches the Python SDK's `additional_args` dict.
   *
   * Example: '{"format": "json"}'
   */
  readonly additionalArgsJson?: string;
}

export class OllamaModelConfig {
  /** Ollama model ID. */
  public readonly modelId: string;
  /** Ollama server address. */
  public readonly host: string;
  /** Maximum tokens (num_predict). -1 = not set. */
  public readonly maxTokens: number;
  /** Sampling temperature. -1 = not set. */
  public readonly temperature: number;
  /** Top-P. -1 = not set. */
  public readonly topP: number;
  /** Top-K. -1 = not set. */
  public readonly topK: number;
  /** Keep alive duration. */
  public readonly keepAlive: string;
  /** Stop sequences JSON. */
  public readonly stopSequencesJson: string;
  /** Additional Ollama options JSON. */
  public readonly optionsJson: string;
  /** Additional request args JSON. */
  public readonly additionalArgsJson: string;

  /**
   * Creates a new Ollama model configuration.
   * @param options Configuration options
   */
  public constructor(options?: OllamaModelConfigOptions) {
    this.modelId = options?.modelId ?? 'llama3';
    this.host = options?.host ?? 'http://localhost:11434';
    this.maxTokens = options?.maxTokens ?? -1;
    this.temperature = options?.temperature ?? -1;
    this.topP = options?.topP ?? -1;
    this.topK = options?.topK ?? -1;
    this.keepAlive = options?.keepAlive ?? '5m';
    this.stopSequencesJson = options?.stopSequencesJson ?? '';
    this.optionsJson = options?.optionsJson ?? '';
    this.additionalArgsJson = options?.additionalArgsJson ?? '';
  }
}

/**
 * Ollama model provider for local model inference.
 *
 * Full feature parity with the Python SDK's OllamaModel, including:
 * - Local model invocation via Ollama REST API
 * - Tool/function calling
 * - Image content (bytes/base64)
 * - Flattened message format (Ollama doesn't support content arrays)
 * - Tool result content formatting (JSON→text, nested content)
 * - All options (temperature, top_p, top_k, num_predict, stop, etc.)
 * - keep_alive for model memory persistence
 * - Additional args (format, etc.)
 *
 * Uses synchronous HTTP via curl (jsii requirement — no async).
 *
 * @example
 *
 * Python equivalent:
 *   model = OllamaModel(host="http://localhost:11434", model_id="llama3")
 *   agent = Agent(model=model, tools=[calculator])
 *
 * TypeScript:
 *   const model = new OllamaModelProvider(new OllamaModelConfig({
 *     modelId: "llama3",
 *   }));
 *   const agent = new StrandsAgent(new AgentConfig({ model }));
 *
 * Java:
 *   var config = new OllamaModelConfig(OllamaModelConfigOptions.builder()
 *       .modelId("llama3").host("http://localhost:11434").build());
 *   var model = new OllamaModelProvider(config);
 *
 * With custom options:
 *   const model = new OllamaModelProvider(new OllamaModelConfig({
 *     modelId: "qwen3:8b",
 *     temperature: 0.7,
 *     maxTokens: 4096,
 *     keepAlive: "10m",
 *     optionsJson: '{"num_ctx": 8192, "repeat_penalty": 1.1}',
 *   }));
 */
export class OllamaModelProvider extends ModelProvider {
  /** The model configuration. */
  public readonly config: OllamaModelConfig;

  /**
   * Creates a new Ollama model provider.
   * @param config Model configuration
   */
  public constructor(config?: OllamaModelConfig) {
    super();
    this.config = config ?? new OllamaModelConfig();
  }

  /** @inheritdoc */
  public converse(
    messagesJson: string,
    systemPrompt?: string,
    toolSpecsJson?: string,
  ): string {
    const messages = JSON.parse(messagesJson);

    // Convert from Bedrock format to Ollama format
    const ollamaMessages = this._formatRequestMessages(messages, systemPrompt);

    // Build options object
    const options: Record<string, unknown> = {};

    // Merge base options first
    if (this.config.optionsJson) {
      const baseOptions = JSON.parse(this.config.optionsJson);
      for (const [key, value] of Object.entries(baseOptions)) {
        options[key] = value;
      }
    }

    // Overlay convenience params (higher priority, matches Python SDK)
    if (this.config.maxTokens >= 0) {
      options.num_predict = this.config.maxTokens;
    }
    if (this.config.temperature >= 0) {
      options.temperature = this.config.temperature;
    }
    if (this.config.topP >= 0) {
      options.top_p = this.config.topP;
    }
    if (this.config.topK >= 0) {
      options.top_k = this.config.topK;
    }
    if (this.config.stopSequencesJson) {
      options.stop = JSON.parse(this.config.stopSequencesJson);
    }

    // Build request body
    const body: Record<string, unknown> = {
      model: this.config.modelId,
      messages: ollamaMessages,
      options,
      stream: false, // jsii sync — no streaming
    };

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

    // keep_alive
    if (this.config.keepAlive) {
      body.keep_alive = this.config.keepAlive;
    }

    // Additional args — merged directly into body (like Python SDK's additional_args)
    if (this.config.additionalArgsJson) {
      const additionalArgs = JSON.parse(this.config.additionalArgsJson);
      for (const [key, value] of Object.entries(additionalArgs)) {
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
    return 'ollama';
  }

  // ── Request Formatting (Bedrock → Ollama) ─────────────────

  /**
   * Format a single content block into Ollama message(s).
   *
   * Ollama doesn't support content arrays — each block becomes a separate message.
   * This matches the Python SDK's _format_request_message_contents which returns
   * a list of messages per content block.
   *
   * Handles:
   * - text → { role, content: text }
   * - image → { role, images: [base64] }
   * - toolUse → { role, tool_calls: [{function: {name, arguments}}] }
   * - toolResult → flattened tool messages (recurse into nested content)
   */
  private _formatContentBlock(role: string, block: any): any[] {
    // Text content
    if (block.text !== undefined) {
      return [{ role, content: block.text }];
    }

    // Image content — Ollama uses images array with base64 data
    if (block.image) {
      const bytes = block.image.source?.bytes;
      if (bytes) {
        const base64Data = typeof bytes === 'string'
          ? bytes
          : Buffer.from(bytes).toString('base64');
        return [{ role, images: [base64Data] }];
      }
      return [];
    }

    // Tool use → tool_calls (Ollama uses toolUseId as function name, matching Python SDK)
    if (block.toolUse) {
      return [{
        role,
        tool_calls: [{
          function: {
            name: block.toolUse.toolUseId,
            arguments: block.toolUse.input,
          },
        }],
      }];
    }

    // Tool result → flatten into tool messages (matches Python SDK recursion)
    if (block.toolResult) {
      const results: any[] = [];
      for (const item of (block.toolResult.content ?? [])) {
        if (item.json !== undefined) {
          // JSON → text, then format as tool message
          results.push(...this._formatContentBlock('tool', { text: JSON.stringify(item.json) }));
        } else {
          results.push(...this._formatContentBlock('tool', item));
        }
      }
      return results;
    }

    // Document → convert to text description (Ollama doesn't support docs natively)
    if (block.document) {
      const name = block.document.name ?? 'document';
      const format = block.document.format ?? 'txt';
      const bytes = block.document.source?.bytes;
      if (bytes && (format === 'txt' || format === 'md')) {
        const text = typeof bytes === 'string' ? bytes : Buffer.from(bytes).toString('utf-8');
        return [{ role, content: `[Document: ${name}]\n${text}` }];
      }
      return [{ role, content: `[Document: ${name} (${format})]` }];
    }

    // Skip unsupported types (cachePoint, reasoningContent, etc.)
    return [];
  }

  /**
   * Format messages array from Bedrock Converse format to Ollama format.
   *
   * Ollama messages are flat — each content block becomes its own message.
   * System prompt is a separate system message prepended.
   */
  private _formatRequestMessages(messages: any[], systemPrompt?: string): any[] {
    const formatted: any[] = [];

    // System prompt
    if (systemPrompt) {
      formatted.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      for (const block of (msg.content ?? [])) {
        const blockMessages = this._formatContentBlock(msg.role, block);
        formatted.push(...blockMessages);
      }
    }

    return formatted;
  }

  // ── Response Formatting (Ollama → Bedrock) ─────────────────

  /**
   * Convert Ollama API response to Bedrock Converse-compatible format.
   *
   * Handles:
   * - message.content → text
   * - message.tool_calls → toolUse (uses function.name as both name and toolUseId, matching Python SDK)
   * - done_reason mapping (stop → end_turn, length → max_tokens)
   * - Usage metrics (eval_count, prompt_eval_count)
   */
  private _formatResponse(response: any): string {
    if (response.error) {
      return JSON.stringify({ error: response.error });
    }

    const content: any[] = [];
    let hasToolUse = false;

    // Text content
    if (response.message?.content) {
      content.push({ text: response.message.content });
    }

    // Tool calls
    if (response.message?.tool_calls) {
      for (const tc of response.message.tool_calls) {
        const toolName = tc.function?.name ?? 'unknown';
        content.push({
          toolUse: {
            name: toolName,
            toolUseId: toolName, // Ollama uses name as ID (matches Python SDK)
            input: tc.function?.arguments ?? {},
          },
        });
        hasToolUse = true;
      }
    }

    // Map done_reason to Bedrock-compatible stopReason
    let stopReason: string;
    if (hasToolUse) {
      stopReason = 'tool_use';
    } else if (response.done_reason === 'length') {
      stopReason = 'max_tokens';
    } else {
      stopReason = 'end_turn';
    }

    return JSON.stringify({
      output: { message: { role: 'assistant', content } },
      stopReason,
      usage: {
        inputTokens: response.prompt_eval_count ?? 0,
        outputTokens: response.eval_count ?? 0,
        totalTokens: (response.prompt_eval_count ?? 0) + (response.eval_count ?? 0),
      },
      metrics: {
        latencyMs: response.total_duration ? response.total_duration / 1e6 : 0,
      },
    });
  }

  // ── HTTP Execution ────────────────────────────────────────

  private _curlSync(body: Record<string, unknown>): string {
    const url = `${this.config.host}/api/chat`;
    const bodyFile = join(tmpdir(), `strands-jsii-ollama-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(bodyFile, JSON.stringify(body));

    try {
      const result = execSync(
        `curl -s -X POST "${url}" -H "content-type: application/json" -d @"${bodyFile}"`,
        { encoding: 'utf-8', timeout: 300000, maxBuffer: 10 * 1024 * 1024 },
      );

      const response = JSON.parse(result.trim());
      return this._formatResponse(response);
    } catch (error: unknown) {
      const err = error as { stdout?: string; stderr?: string; message?: string };

      // Try to parse Ollama error from stdout
      if (err.stdout) {
        try {
          const errorResponse = JSON.parse(err.stdout.trim());
          if (errorResponse.error) {
            return JSON.stringify({ error: errorResponse.error });
          }
        } catch { /* not JSON, fall through */ }
      }

      // Connection refused → Ollama server not running
      const msg = err.message ?? '';
      if (msg.includes('Connection refused') || msg.includes('ECONNREFUSED')) {
        return JSON.stringify({
          error: `Ollama server not reachable at ${this.config.host}. Is Ollama running? Try: ollama serve`,
        });
      }

      return JSON.stringify({ error: msg || 'Ollama API error' });
    } finally {
      try { unlinkSync(bodyFile); } catch { /* ignore */ }
    }
  }
}
