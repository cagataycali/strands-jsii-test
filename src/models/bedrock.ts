import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ModelProvider } from './provider';
import { GuardrailConfig } from '../safety/guardrails';

export { GuardrailConfig } from '../safety/guardrails';

export interface BedrockModelConfigOptions {
  /** The Bedrock model ID. Default: us.anthropic.claude-sonnet-4-20250514-v1:0 */
  readonly modelId?: string;
  /** AWS region. Default: us-west-2 */
  readonly region?: string;
  /** Maximum tokens to generate. Default: 4096 */
  readonly maxTokens?: number;
  /** Temperature (0.0-1.0). Default: 0.7 */
  readonly temperature?: number;
  /** Top-P for nucleus sampling. Default: 0.9 */
  readonly topP?: number;
  /** Use ConverseStream API. Default: true */
  readonly streaming?: boolean;
  /** JSON array of stop sequences. */
  readonly stopSequencesJson?: string;
  /** Guardrail configuration. */
  readonly guardrail?: GuardrailConfig;
  /** Additional request fields as JSON (e.g., thinking config). */
  readonly additionalRequestFieldsJson?: string;
}

export class BedrockModelConfig {
  /** The Bedrock model ID. */
  public readonly modelId: string;
  /** AWS region for the Bedrock service. */
  public readonly region: string;
  /** Maximum number of tokens to generate. */
  public readonly maxTokens: number;
  /** Temperature for controlling randomness (0.0 - 1.0). */
  public readonly temperature: number;
  /** Top-P for nucleus sampling. */
  public readonly topP: number;
  /** Whether to use streaming (ConverseStream) or non-streaming (Converse). Defaults to true. */
  public readonly streaming: boolean;
  /** Optional stop sequences that will stop generation when encountered. JSON array string. */
  public readonly stopSequencesJson: string;
  /** Optional guardrail configuration. */
  public readonly guardrail: GuardrailConfig | undefined;
  /** Optional additional model request fields as JSON string (e.g., thinking config). */
  public readonly additionalRequestFieldsJson: string;

  /**
   * Creates a new Bedrock model configuration.
   * @param options Configuration options
   */
  public constructor(options?: BedrockModelConfigOptions) {
    this.modelId = options?.modelId ?? 'us.anthropic.claude-sonnet-4-20250514-v1:0';
    this.region = options?.region ?? 'us-west-2';
    this.maxTokens = options?.maxTokens ?? 4096;
    this.temperature = options?.temperature ?? 0.7;
    this.topP = options?.topP ?? 0.9;
    this.streaming = options?.streaming ?? true;
    this.stopSequencesJson = options?.stopSequencesJson ?? '';
    this.guardrail = options?.guardrail;
    this.additionalRequestFieldsJson = options?.additionalRequestFieldsJson ?? '';
  }
}

/**
 * AWS Bedrock model provider.
 *
 * @example
 *
 * Python:
 *   model = Bedrock(model_id="us.anthropic.claude-sonnet-4-20250514-v1:0")
 *
 * TypeScript:
 *   const model = new BedrockModelProvider({ modelId: "us.anthropic.claude-sonnet-4-20250514-v1:0" });
 */

export class BedrockModelProvider extends ModelProvider {
  /** The model configuration. */
  public readonly config: BedrockModelConfig;

  /**
   * Creates a new Bedrock model provider.
   * @param config Model configuration (BedrockModelConfig or BedrockModelConfigOptions)
   */
  public constructor(config?: BedrockModelConfig) {
    super();
    this.config = config ?? new BedrockModelConfig();
  }

  /** @inheritdoc */
  public converse(
    messagesJson: string,
    systemPrompt?: string,
    toolSpecsJson?: string,
  ): string {
    const request: Record<string, unknown> = {
      modelId: this.config.modelId,
      messages: JSON.parse(messagesJson),
      inferenceConfig: {
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
        topP: this.config.topP,
        ...(this.config.stopSequencesJson ? { stopSequences: JSON.parse(this.config.stopSequencesJson) } : {}),
      },
    };

    if (systemPrompt) {
      request.system = [{ text: systemPrompt }];
    }

    if (toolSpecsJson) {
      const toolSpecs = JSON.parse(toolSpecsJson);
      request.toolConfig = {
        tools: toolSpecs.map((spec: { name: string; description: string; inputSchema: object }) => ({
          toolSpec: {
            name: spec.name,
            description: spec.description,
            inputSchema: { json: spec.inputSchema },
          },
        })),
      };
    }

    // Guardrail configuration (matches Python SDK)
    if (this.config.guardrail) {
      const gc: Record<string, unknown> = {
        guardrailIdentifier: this.config.guardrail.guardrailId,
        guardrailVersion: this.config.guardrail.guardrailVersion,
        trace: this.config.guardrail.trace,
      };
      if (this.config.guardrail.streamProcessingMode) {
        gc.streamProcessingMode = this.config.guardrail.streamProcessingMode;
      }
      request.guardrailConfig = gc;
    }

    // Additional model request fields (e.g., thinking config)
    if (this.config.additionalRequestFieldsJson) {
      request.additionalModelRequestFields = JSON.parse(this.config.additionalRequestFieldsJson);
    }

    return this._execSync(request);
  }

  /** @inheritdoc */
  public get modelId(): string {
    return this.config.modelId;
  }

  /** @inheritdoc */
  public get providerName(): string {
    return 'bedrock';
  }

  private _execSync(request: Record<string, unknown>): string {
    const reqFile = join(tmpdir(), `strands-jsii-req-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    const scriptFile = join(tmpdir(), `strands-jsii-run-${Date.now()}-${Math.random().toString(36).slice(2)}.js`);

    writeFileSync(reqFile, JSON.stringify(request));

    const sdkPath = require.resolve('@aws-sdk/client-bedrock-runtime').replace(/\\/g, '/');
    const sdkDir = sdkPath.substring(0, sdkPath.lastIndexOf('/node_modules/') + '/node_modules/'.length) + '@aws-sdk/client-bedrock-runtime';

    let script: string;

    if (this.config.streaming) {
      // Use ConverseStreamCommand — matches Python SDK's converse_stream behavior.
      // Collects streaming chunks, assembles content blocks, fixes stopReason for tool_use,
      // and returns the same { output, stopReason, usage } shape as non-streaming.
      script = [
        "const fs = require('fs');",
        `const { BedrockRuntimeClient, ConverseStreamCommand } = require('${sdkDir.replace(/'/g, "\\'")}');`,
        `const request = JSON.parse(fs.readFileSync('${reqFile.replace(/'/g, "\\'")}', 'utf-8'));`,
        // Bearer token support: if AWS_BEARER_TOKEN_BEDROCK is set, use it as token identity
        'const clientConfig = { region: ' + JSON.stringify(this.config.region) + ", customUserAgent: 'strands-agents-jsii' };",
        'if (process.env.AWS_BEARER_TOKEN_BEDROCK) {',
        '  clientConfig.token = { token: process.env.AWS_BEARER_TOKEN_BEDROCK };',
        '}',
        'const client = new BedrockRuntimeClient(clientConfig);',
        '',
        'async function run() {',
        '  const response = await client.send(new ConverseStreamCommand(request));',
        '  const contentBlocks = [];',
        '  let currentBlockIdx = -1;',
        '  let role = "assistant";',
        '  let stopReason = "end_turn";',
        '  let usage = {};',
        '  let hasToolUse = false;',
        '',
        '  for await (const chunk of response.stream) {',
        '    if (chunk.messageStart) {',
        '      role = chunk.messageStart.role || "assistant";',
        '    }',
        '    if (chunk.contentBlockStart) {',
        '      currentBlockIdx = chunk.contentBlockStart.contentBlockIndex ?? (currentBlockIdx + 1);',
        '      const start = chunk.contentBlockStart.start || {};',
        '      if (start.toolUse) {',
        '        hasToolUse = true;',
        '        contentBlocks[currentBlockIdx] = { toolUse: { toolUseId: start.toolUse.toolUseId, name: start.toolUse.name, input: "" } };',
        '      } else {',
        '        contentBlocks[currentBlockIdx] = { text: "" };',
        '      }',
        '    }',
        '    if (chunk.contentBlockDelta) {',
        '      const delta = chunk.contentBlockDelta.delta || {};',
        '      const idx = chunk.contentBlockDelta.contentBlockIndex ?? currentBlockIdx;',
        // Ensure block exists — contentBlockDelta can arrive without contentBlockStart for text blocks
        '      if (!contentBlocks[idx]) {',
        '        currentBlockIdx = idx;',
        '        contentBlocks[idx] = { text: "" };',
        '      }',
        '      const block = contentBlocks[idx];',
        '      if (delta.text !== undefined) {',
        '        if (block.text !== undefined) block.text += delta.text;',
        '        else block.text = delta.text;',
        '      }',
        '      if (delta.toolUse && block.toolUse) {',
        '        block.toolUse.input += delta.toolUse.input || "";',
        '      }',
        '      if (delta.reasoningContent) {',
        '        if (!block.reasoningContent) {',
        '          block.reasoningContent = { reasoningText: { text: "", signature: "" } };',
        '          delete block.text;',
        '        }',
        '        if (delta.reasoningContent.text) block.reasoningContent.reasoningText.text += delta.reasoningContent.text;',
        '        if (delta.reasoningContent.signature) block.reasoningContent.reasoningText.signature += delta.reasoningContent.signature;',
        '      }',
        '    }',
        '    if (chunk.contentBlockStop) {',
        '      const idx = chunk.contentBlockStop.contentBlockIndex ?? currentBlockIdx;',
        '      const block = contentBlocks[idx];',
        '      if (block && block.toolUse && typeof block.toolUse.input === "string") {',
        '        try { block.toolUse.input = JSON.parse(block.toolUse.input); }',
        '        catch { block.toolUse.input = {}; }',
        '      }',
        '    }',
        '    if (chunk.messageStop) {',
        '      stopReason = chunk.messageStop.stopReason || "end_turn";',
        // Fix stopReason: if we saw tool_use blocks but stopReason is end_turn,
        // override to tool_use — matches Python SDK behavior exactly.
        '      if (hasToolUse && stopReason === "end_turn") stopReason = "tool_use";',
        '    }',
        '    if (chunk.metadata) {',
        '      if (chunk.metadata.usage) usage = chunk.metadata.usage;',
        '    }',
        '  }',
        '',
        '  const result = {',
        '    output: { message: { role, content: contentBlocks.filter(Boolean) } },',
        '    stopReason,',
        '    usage: { inputTokens: usage.inputTokens || 0, outputTokens: usage.outputTokens || 0 },',
        '  };',
        '  process.stdout.write(JSON.stringify(result));',
        '}',
        '',
        'run().catch(e => {',
        '  process.stdout.write(JSON.stringify({ error: e.message }));',
        '  process.exit(1);',
        '});',
      ].join('\n');
    } else {
      // Non-streaming: use ConverseCommand (original behavior).
      // Also applies the stopReason fix for tool_use consistency.
      script = [
        "const fs = require('fs');",
        `const { BedrockRuntimeClient, ConverseCommand } = require('${sdkDir.replace(/'/g, "\\'")}');`,
        `const request = JSON.parse(fs.readFileSync('${reqFile.replace(/'/g, "\\'")}', 'utf-8'));`,
        // Bearer token support for non-streaming path
        'const clientConfig = { region: ' + JSON.stringify(this.config.region) + ", customUserAgent: 'strands-agents-jsii' };",
        'if (process.env.AWS_BEARER_TOKEN_BEDROCK) {',
        '  clientConfig.token = { token: process.env.AWS_BEARER_TOKEN_BEDROCK };',
        '}',
        'const client = new BedrockRuntimeClient(clientConfig);',
        'client.send(new ConverseCommand(request)).then(r => {',
        '  let stopReason = r.stopReason || "end_turn";',
        '  const content = r.output?.message?.content || [];',
        '  if (stopReason === "end_turn" && content.some(b => b.toolUse)) {',
        '    stopReason = "tool_use";',
        '  }',
        '  process.stdout.write(JSON.stringify({ output: r.output, stopReason, usage: r.usage }));',
        '}).catch(e => {',
        '  process.stdout.write(JSON.stringify({ error: e.message }));',
        '  process.exit(1);',
        '});',
      ].join('\n');
    }

    writeFileSync(scriptFile, script);

    try {
      const result = execSync(`node "${scriptFile}"`, {
        encoding: 'utf-8',
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
        env: process.env,
      });
      return result.trim();
    } catch (error: unknown) {
      const err = error as { stdout?: string; message?: string };
      if (err.stdout) {
        return err.stdout.trim();
      }
      return JSON.stringify({ error: err.message ?? 'Unknown error' });
    } finally {
      try { unlinkSync(reqFile); } catch { /* ignore */ }
      try { unlinkSync(scriptFile); } catch { /* ignore */ }
    }
  }
}

