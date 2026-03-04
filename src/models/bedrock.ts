import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Worker } from 'worker_threads';
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

    return this._converseWorker(request);
  }

  /** @inheritdoc */
  public get modelId(): string {
    return this.config.modelId;
  }

  /** @inheritdoc */
  public get providerName(): string {
    return 'bedrock';
  }

  /**
   * Execute a Bedrock request using worker_threads + Atomics.wait.
   *
   * Architecture:
   *   Main thread (JSII runtime) — blocked synchronously via Atomics.wait
   *   Worker thread — runs async AWS SDK call, writes result to SharedArrayBuffer
   *
   * Eliminates: child process spawn, temp file writes/reads, unlinkSync cleanup
   * Result: ~0 disk I/O, ~0 fork overhead, same-process AWS SDK client
   */
  private _converseWorker(request: Record<string, unknown>): string {
    const sdkDir = require.resolve('@aws-sdk/client-bedrock-runtime').replace(/\\/g, '/');

    // Shared memory for synchronization
    const DATA_SIZE = 10 * 1024 * 1024; // 10MB max response
    const signalBuf = new SharedArrayBuffer(4);
    const signal = new Int32Array(signalBuf);
    const dataBuf = new SharedArrayBuffer(DATA_SIZE);
    const dataView = new Uint8Array(dataBuf);
    const lenBuf = new SharedArrayBuffer(4);
    const lenView = new Int32Array(lenBuf);

    const streaming = this.config.streaming;

    // Worker code — runs async, writes result to SharedArrayBuffer, notifies main thread
    const workerCode = `
      const { workerData } = require('worker_threads');
      const signal = new Int32Array(workerData.signal);
      const dataView = new Uint8Array(workerData.data);
      const lenView = new Int32Array(workerData.len);

      function done(resultStr) {
        const encoded = new TextEncoder().encode(resultStr);
        if (encoded.length > dataView.length) {
          const truncated = JSON.stringify({ error: 'Response too large: ' + encoded.length + ' bytes' });
          const enc2 = new TextEncoder().encode(truncated);
          dataView.set(enc2);
          Atomics.store(lenView, 0, enc2.length);
        } else {
          dataView.set(encoded);
          Atomics.store(lenView, 0, encoded.length);
        }
        Atomics.store(signal, 0, 1);
        Atomics.notify(signal, 0);
      }

      async function run() {
        const sdk = require(workerData.sdkDir);
        const cfg = { region: workerData.region, customUserAgent: 'strands-agents-jsii' };
        if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
          cfg.token = { token: process.env.AWS_BEARER_TOKEN_BEDROCK };
        }
        const client = new sdk.BedrockRuntimeClient(cfg);

        if (workerData.streaming) {
          // ConverseStream — collect chunks, assemble content blocks
          const response = await client.send(new sdk.ConverseStreamCommand(workerData.request));
          const blocks = [];
          let idx = -1, role = 'assistant', stop = 'end_turn', usage = {}, hasTU = false;

          for await (const chunk of response.stream) {
            if (chunk.messageStart) role = chunk.messageStart.role || 'assistant';
            if (chunk.contentBlockStart) {
              idx = chunk.contentBlockStart.contentBlockIndex ?? ++idx;
              const s = chunk.contentBlockStart.start || {};
              if (s.toolUse) {
                hasTU = true;
                blocks[idx] = { toolUse: { toolUseId: s.toolUse.toolUseId, name: s.toolUse.name, input: '' } };
              } else {
                blocks[idx] = { text: '' };
              }
            }
            if (chunk.contentBlockDelta) {
              const d = chunk.contentBlockDelta.delta || {};
              const i = chunk.contentBlockDelta.contentBlockIndex ?? idx;
              if (!blocks[i]) blocks[i] = { text: '' };
              const block = blocks[i];
              if (d.text !== undefined) {
                if (block.text !== undefined) block.text += d.text;
                else block.text = d.text;
              }
              if (d.toolUse && block.toolUse) block.toolUse.input += d.toolUse.input || '';
              if (d.reasoningContent) {
                if (!block.reasoningContent) {
                  block.reasoningContent = { reasoningText: { text: '', signature: '' } };
                  delete block.text;
                }
                if (d.reasoningContent.text) block.reasoningContent.reasoningText.text += d.reasoningContent.text;
                if (d.reasoningContent.signature) block.reasoningContent.reasoningText.signature += d.reasoningContent.signature;
              }
            }
            if (chunk.contentBlockStop) {
              const i = chunk.contentBlockStop.contentBlockIndex ?? idx;
              const b = blocks[i];
              if (b && b.toolUse && typeof b.toolUse.input === 'string') {
                try { b.toolUse.input = JSON.parse(b.toolUse.input); } catch { b.toolUse.input = {}; }
              }
            }
            if (chunk.messageStop) {
              stop = chunk.messageStop.stopReason || 'end_turn';
              if (hasTU && stop === 'end_turn') stop = 'tool_use';
            }
            if (chunk.metadata && chunk.metadata.usage) usage = chunk.metadata.usage;
          }

          done(JSON.stringify({
            output: { message: { role, content: blocks.filter(Boolean) } },
            stopReason: stop,
            usage: { inputTokens: usage.inputTokens || 0, outputTokens: usage.outputTokens || 0 },
          }));
        } else {
          // Non-streaming: ConverseCommand
          const r = await client.send(new sdk.ConverseCommand(workerData.request));
          let stop = r.stopReason || 'end_turn';
          const content = r.output?.message?.content || [];
          if (stop === 'end_turn' && content.some(b => b.toolUse)) stop = 'tool_use';
          done(JSON.stringify({ output: r.output, stopReason: stop, usage: r.usage }));
        }
      }

      run().catch(e => done(JSON.stringify({ error: e.message })));
    `;

    const worker = new Worker(workerCode, {
      eval: true,
      workerData: {
        signal: signalBuf,
        data: dataBuf,
        len: lenBuf,
        sdkDir,
        region: this.config.region,
        streaming,
        request,
      },
    });

    // Block synchronously until worker completes
    const waitResult = Atomics.wait(signal, 0, 0, 120000); // 120s timeout

    const len = Atomics.load(lenView, 0);
    const result = new TextDecoder().decode(dataView.slice(0, len));

    // Clean up worker
    worker.terminate();

    if (waitResult === 'timed-out' || len === 0) {
      return JSON.stringify({ error: 'Bedrock request timed out (120s)' });
    }

    return result;
  }

  /**
   * Fallback: execSync-based execution (kept for environments where worker_threads is unavailable).
   * @internal
   */
  // @ts-ignore: kept as fallback
  private _execSyncFallback(request: Record<string, unknown>): string {
    const reqFile = join(tmpdir(), `strands-jsii-req-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    const scriptFile = join(tmpdir(), `strands-jsii-run-${Date.now()}-${Math.random().toString(36).slice(2)}.js`);

    writeFileSync(reqFile, JSON.stringify(request));

    const sdkPath = require.resolve('@aws-sdk/client-bedrock-runtime').replace(/\\/g, '/');
    const sdkDir = sdkPath.substring(0, sdkPath.lastIndexOf('/node_modules/') + '/node_modules/'.length) + '@aws-sdk/client-bedrock-runtime';

    const script = this.config.streaming
      ? this._buildStreamingScript(sdkDir, reqFile)
      : this._buildNonStreamingScript(sdkDir, reqFile);

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

  private _buildStreamingScript(sdkDir: string, reqFile: string): string {
    return [
      "const fs = require('fs');",
      `const { BedrockRuntimeClient, ConverseStreamCommand } = require('${sdkDir.replace(/'/g, "\\'")}');`,
      `const request = JSON.parse(fs.readFileSync('${reqFile.replace(/'/g, "\\'")}', 'utf-8'));`,
      'const clientConfig = { region: ' + JSON.stringify(this.config.region) + ", customUserAgent: 'strands-agents-jsii' };",
      'if (process.env.AWS_BEARER_TOKEN_BEDROCK) clientConfig.token = { token: process.env.AWS_BEARER_TOKEN_BEDROCK };',
      'const client = new BedrockRuntimeClient(clientConfig);',
      'async function run() {',
      '  const response = await client.send(new ConverseStreamCommand(request));',
      '  const blocks = []; let idx = -1, role = "assistant", stop = "end_turn", usage = {}, hasTU = false;',
      '  for await (const chunk of response.stream) {',
      '    if (chunk.contentBlockStart) { idx = chunk.contentBlockStart.contentBlockIndex ?? ++idx; const s = chunk.contentBlockStart.start || {}; if (s.toolUse) { hasTU = true; blocks[idx] = { toolUse: { toolUseId: s.toolUse.toolUseId, name: s.toolUse.name, input: "" } }; } else { blocks[idx] = { text: "" }; } }',
      '    if (chunk.contentBlockDelta) { const d = chunk.contentBlockDelta.delta || {}, i = chunk.contentBlockDelta.contentBlockIndex ?? idx; if (!blocks[i]) blocks[i] = { text: "" }; if (d.text !== undefined) blocks[i].text = (blocks[i].text || "") + d.text; if (d.toolUse && blocks[i].toolUse) blocks[i].toolUse.input += d.toolUse.input || ""; if (d.reasoningContent) { if (!blocks[i].reasoningContent) { blocks[i].reasoningContent = { reasoningText: { text: "", signature: "" } }; delete blocks[i].text; } if (d.reasoningContent.text) blocks[i].reasoningContent.reasoningText.text += d.reasoningContent.text; if (d.reasoningContent.signature) blocks[i].reasoningContent.reasoningText.signature += d.reasoningContent.signature; } }',
      '    if (chunk.contentBlockStop) { const i = chunk.contentBlockStop.contentBlockIndex ?? idx, b = blocks[i]; if (b && b.toolUse && typeof b.toolUse.input === "string") try { b.toolUse.input = JSON.parse(b.toolUse.input); } catch { b.toolUse.input = {}; } }',
      '    if (chunk.messageStop) { stop = chunk.messageStop.stopReason || "end_turn"; if (hasTU && stop === "end_turn") stop = "tool_use"; }',
      '    if (chunk.metadata && chunk.metadata.usage) usage = chunk.metadata.usage;',
      '  }',
      '  process.stdout.write(JSON.stringify({ output: { message: { role, content: blocks.filter(Boolean) } }, stopReason: stop, usage: { inputTokens: usage.inputTokens || 0, outputTokens: usage.outputTokens || 0 } }));',
      '}',
      'run().catch(e => { process.stdout.write(JSON.stringify({ error: e.message })); process.exit(1); });',
    ].join('\n');
  }

  private _buildNonStreamingScript(sdkDir: string, reqFile: string): string {
    return [
      "const fs = require('fs');",
      `const { BedrockRuntimeClient, ConverseCommand } = require('${sdkDir.replace(/'/g, "\\'")}');`,
      `const request = JSON.parse(fs.readFileSync('${reqFile.replace(/'/g, "\\'")}', 'utf-8'));`,
      'const clientConfig = { region: ' + JSON.stringify(this.config.region) + ", customUserAgent: 'strands-agents-jsii' };",
      'if (process.env.AWS_BEARER_TOKEN_BEDROCK) clientConfig.token = { token: process.env.AWS_BEARER_TOKEN_BEDROCK };',
      'const client = new BedrockRuntimeClient(clientConfig);',
      'client.send(new ConverseCommand(request)).then(r => {',
      '  let stop = r.stopReason || "end_turn"; const content = r.output?.message?.content || [];',
      '  if (stop === "end_turn" && content.some(b => b.toolUse)) stop = "tool_use";',
      '  process.stdout.write(JSON.stringify({ output: r.output, stopReason: stop, usage: r.usage }));',
      '}).catch(e => { process.stdout.write(JSON.stringify({ error: e.message })); process.exit(1); });',
    ].join('\n');
  }
}

