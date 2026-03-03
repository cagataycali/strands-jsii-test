import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ModelProvider } from './provider';
import { buildOllamaRequest, parseOllamaResponse } from '../providers/formats';

/**
 * Configuration options for the Ollama model provider.
 */
export interface OllamaModelConfigOptions {
  /** Ollama model name (e.g., "llama3", "qwen3:8b"). Default: llama3 */
  readonly modelId?: string;
  /** Ollama server URL. Default: http://localhost:11434 */
  readonly host?: string;
  /** Maximum tokens to generate (num_predict). Default: -1 (model default) */
  readonly maxTokens?: number;
  /** Sampling temperature. Default: -1 (model default) */
  readonly temperature?: number;
  /** Top-P for nucleus sampling. Default: -1 (model default) */
  readonly topP?: number;
  /** Top-K sampling. Default: -1 (model default) */
  readonly topK?: number;
  /** How long to keep model loaded in memory. Default: "5m" */
  readonly keepAlive?: string;
  /** JSON array of stop sequences. */
  readonly stopSequencesJson?: string;
  /** Additional Ollama options as JSON (e.g., num_ctx, num_gpu). */
  readonly optionsJson?: string;
  /** Extra request body fields as JSON. */
  readonly additionalArgsJson?: string;
}

/**
 * Resolved configuration for the Ollama model provider.
 */
export class OllamaModelConfig {
  /** Ollama model name. */
  public readonly modelId: string;
  /** Ollama server URL. */
  public readonly host: string;
  /** Maximum tokens to generate (num_predict). */
  public readonly maxTokens: number;
  /** Sampling temperature. */
  public readonly temperature: number;
  /** Top-P for nucleus sampling. */
  public readonly topP: number;
  /** Top-K sampling. */
  public readonly topK: number;
  /** How long to keep model loaded in memory. */
  public readonly keepAlive: string;
  /** Optional stop sequences as JSON array string. */
  public readonly stopSequencesJson: string;
  /** Additional Ollama-specific options as JSON string. */
  public readonly optionsJson: string;
  /** Extra request body fields as JSON string. */
  public readonly additionalArgsJson: string;

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
 * Ollama model provider for local inference.
 *
 * @example
 *
 * Python:
 *   model = Ollama(model_id="llama3")
 *
 * TypeScript:
 *   const model = new OllamaModelProvider(new OllamaModelConfig({ modelId: "llama3" }));
 */
export class OllamaModelProvider extends ModelProvider {
  /** The model configuration. */
  public readonly config: OllamaModelConfig;

  public constructor(config?: OllamaModelConfig) {
    super();
    this.config = config ?? new OllamaModelConfig();
  }

  public converse(messagesJson: string, systemPrompt?: string, toolSpecsJson?: string): string {
    const req = buildOllamaRequest({
      modelId: this.config.modelId, host: this.config.host, maxTokens: this.config.maxTokens,
      temperature: this.config.temperature, topP: this.config.topP, topK: this.config.topK,
      keepAlive: this.config.keepAlive, stopSequences: this.config.stopSequencesJson || undefined,
      optionsJson: this.config.optionsJson || undefined, additionalArgsJson: this.config.additionalArgsJson || undefined,
    }, JSON.parse(messagesJson), systemPrompt, toolSpecsJson);

    const bodyFile = join(tmpdir(), `strands-jsii-ollama-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(bodyFile, JSON.stringify(req.body));
    try {
      const result = execSync(`curl -s -X POST "${req.url}" -H "content-type: application/json" -d @"${bodyFile}"`, { encoding: 'utf-8', timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      return parseOllamaResponse(JSON.parse(result.trim()));
    } catch (error: unknown) {
      const err = error as { stdout?: string; message?: string };
      if (err.stdout) { try { const r = JSON.parse(err.stdout.trim()); if (r.error) return JSON.stringify({ error: r.error }); } catch {} }
      const msg = (error as any).message ?? '';
      if (msg.includes('Connection refused') || msg.includes('ECONNREFUSED')) return JSON.stringify({ error: `Ollama server not reachable at ${this.config.host}. Try: ollama serve` });
      return JSON.stringify({ error: msg || 'Ollama API error' });
    } finally { try { unlinkSync(bodyFile); } catch {} }
  }

  public get modelId(): string { return this.config.modelId; }
  public get providerName(): string { return 'ollama'; }
}
