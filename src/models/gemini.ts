import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ModelProvider } from './provider';
import { buildGeminiRequest, parseGeminiResponse } from '../providers/formats';

/**
 * Configuration options for the Gemini model provider.
 */
export interface GeminiModelConfigOptions {
  /** Gemini model name. Default: gemini-2.5-flash */
  readonly modelId?: string;
  /** Google API key. Default: GOOGLE_API_KEY or GEMINI_API_KEY env var */
  readonly apiKey?: string;
  /** Maximum tokens to generate. Default: 4096 */
  readonly maxTokens?: number;
  /** Sampling temperature. Default: -1 (API default) */
  readonly temperature?: number;
  /** Top-P for nucleus sampling. Default: -1 (API default) */
  readonly topP?: number;
  /** Top-K sampling. Default: -1 (API default) */
  readonly topK?: number;
  /** JSON array of stop sequences. */
  readonly stopSequencesJson?: string;
  /** Gemini-specific tools as JSON (e.g., GoogleSearch, CodeExecution). */
  readonly geminiToolsJson?: string;
  /** Additional generation config params as JSON. */
  readonly additionalParamsJson?: string;
  /** Token budget for Gemini thinking mode. Default: -1 (disabled) */
  readonly thinkingBudgetTokens?: number;
}

/**
 * Resolved configuration for the Gemini model provider.
 */
export class GeminiModelConfig {
  /** Gemini model name. */
  public readonly modelId: string;
  /** Google API key. */
  public readonly apiKey: string;
  /** Maximum tokens to generate. */
  public readonly maxTokens: number;
  /** Sampling temperature. */
  public readonly temperature: number;
  /** Top-P for nucleus sampling. */
  public readonly topP: number;
  /** Top-K sampling. */
  public readonly topK: number;
  /** Optional stop sequences as JSON array string. */
  public readonly stopSequencesJson: string;
  /** Gemini-specific tools as JSON string. */
  public readonly geminiToolsJson: string;
  /** Additional generation config as JSON string. */
  public readonly additionalParamsJson: string;
  /** Token budget for Gemini thinking mode. */
  public readonly thinkingBudgetTokens: number;

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
 * @example
 *
 * Python:
 *   model = Gemini(api_key="AIza...", model_id="gemini-2.5-flash")
 *
 * TypeScript:
 *   const model = new GeminiModelProvider(new GeminiModelConfig({ modelId: "gemini-2.5-flash" }));
 */
export class GeminiModelProvider extends ModelProvider {
  /** The model configuration. */
  public readonly config: GeminiModelConfig;

  public constructor(config?: GeminiModelConfig) {
    super();
    this.config = config ?? new GeminiModelConfig();
  }

  public converse(messagesJson: string, systemPrompt?: string, toolSpecsJson?: string): string {
    const req = buildGeminiRequest({
      modelId: this.config.modelId, apiKey: this.config.apiKey, maxTokens: this.config.maxTokens,
      temperature: this.config.temperature, topP: this.config.topP, topK: this.config.topK,
      stopSequences: this.config.stopSequencesJson || undefined, geminiToolsJson: this.config.geminiToolsJson || undefined,
      additionalParamsJson: this.config.additionalParamsJson || undefined, thinkingBudgetTokens: this.config.thinkingBudgetTokens,
    }, JSON.parse(messagesJson), systemPrompt, toolSpecsJson);

    const bodyFile = join(tmpdir(), `strands-jsii-gemini-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(bodyFile, JSON.stringify(req.body));
    try {
      const result = execSync(`curl -s -X POST "${req.url}" -H "content-type: application/json" -d @"${bodyFile}"`, { encoding: 'utf-8', timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      return parseGeminiResponse(JSON.parse(result.trim()));
    } catch (error: unknown) {
      const err = error as { stdout?: string; message?: string };
      if (err.stdout) { try { return parseGeminiResponse(JSON.parse(err.stdout.trim())); } catch {} }
      return JSON.stringify({ error: err.message ?? 'Gemini API error' });
    } finally { try { unlinkSync(bodyFile); } catch {} }
  }

  public get modelId(): string { return this.config.modelId; }
  public get providerName(): string { return 'gemini'; }
}
