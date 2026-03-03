import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ModelProvider } from './provider';
import { buildOpenAIRequest, parseOpenAIResponse } from '../providers/formats';

export class OpenAIToolChoice {
  public readonly choiceMode: string;
  public readonly functionName: string;
  public constructor(choiceMode?: string, functionName?: string) { this.choiceMode = choiceMode ?? 'auto'; this.functionName = functionName ?? ''; }
}

/**
 * Configuration options for the OpenAI model provider.
 */
export interface OpenAIModelConfigOptions {
  /** Model identifier. Default: gpt-4o */
  readonly modelId?: string;
  /** OpenAI API key. Default: OPENAI_API_KEY env var */
  readonly apiKey?: string;
  /** Maximum tokens to generate. Default: -1 (API default) */
  readonly maxTokens?: number;
  /** Sampling temperature. Default: -1 (API default) */
  readonly temperature?: number;
  /** Top-P for nucleus sampling. Default: -1 (API default) */
  readonly topP?: number;
  /** Frequency penalty. Default: 999 (unset sentinel) */
  readonly frequencyPenalty?: number;
  /** Presence penalty. Default: 999 (unset sentinel) */
  readonly presencePenalty?: number;
  /** Random seed for deterministic generation. Default: -1 (unset) */
  readonly seed?: number;
  /** API base URL (supports OpenAI-compatible endpoints). Default: https://api.openai.com */
  readonly baseUrl?: string;
  /** JSON array of stop sequences. */
  readonly stopSequencesJson?: string;
  /** Tool choice configuration. */
  readonly toolChoice?: OpenAIToolChoice;
  /** Additional request body params as JSON. */
  readonly additionalParamsJson?: string;
}

/**
 * Resolved configuration for the OpenAI model provider.
 */
export class OpenAIModelConfig {
  /** Model identifier. */
  public readonly modelId: string;
  /** OpenAI API key. */
  public readonly apiKey: string;
  /** Maximum tokens to generate. */
  public readonly maxTokens: number;
  /** Sampling temperature. */
  public readonly temperature: number;
  /** Top-P for nucleus sampling. */
  public readonly topP: number;
  /** Frequency penalty. */
  public readonly frequencyPenalty: number;
  /** Presence penalty. */
  public readonly presencePenalty: number;
  /** Random seed for deterministic generation. */
  public readonly seed: number;
  /** API base URL. */
  public readonly baseUrl: string;
  /** Optional stop sequences as JSON array string. */
  public readonly stopSequencesJson: string;
  /** Tool choice configuration. */
  public readonly toolChoice: OpenAIToolChoice | undefined;
  /** Additional request body params as JSON string. */
  public readonly additionalParamsJson: string;

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
 * Also works with any OpenAI-compatible endpoint (vLLM, Together, Fireworks, etc.)
 * by setting the `baseUrl` config option.
 *
 * @example
 *
 * Python:
 *   model = OpenAI(api_key="sk-...", model_id="gpt-4o")
 *
 * TypeScript:
 *   const model = new OpenAIModelProvider(new OpenAIModelConfig({ modelId: "gpt-4o" }));
 */
export class OpenAIModelProvider extends ModelProvider {
  /** The model configuration. */
  public readonly config: OpenAIModelConfig;

  public constructor(config?: OpenAIModelConfig) {
    super();
    this.config = config ?? new OpenAIModelConfig();
  }

  public converse(messagesJson: string, systemPrompt?: string, toolSpecsJson?: string): string {
    const req = buildOpenAIRequest({
      modelId: this.config.modelId, apiKey: this.config.apiKey, maxTokens: this.config.maxTokens, temperature: this.config.temperature,
      topP: this.config.topP, frequencyPenalty: this.config.frequencyPenalty, presencePenalty: this.config.presencePenalty, seed: this.config.seed,
      baseUrl: this.config.baseUrl, stopSequences: this.config.stopSequencesJson || undefined,
      toolChoice: this.config.toolChoice, additionalParamsJson: this.config.additionalParamsJson || undefined,
    }, JSON.parse(messagesJson), systemPrompt, toolSpecsJson);

    const bodyFile = join(tmpdir(), `strands-jsii-openai-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(bodyFile, JSON.stringify(req.body));
    try {
      const headerFlags = Object.entries(req.headers).map(([k, v]) => `-H "${k}: ${v}"`).join(' ');
      const result = execSync(`curl -s -X POST "${req.url}" ${headerFlags} -d @"${bodyFile}"`, { encoding: 'utf-8', timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      return parseOpenAIResponse(JSON.parse(result.trim()));
    } catch (error: unknown) {
      const err = error as { stdout?: string; message?: string };
      if (err.stdout) {
        try {
          const errorResponse = JSON.parse(err.stdout.trim());
          if (errorResponse.error) return parseOpenAIResponse(errorResponse);
          return parseOpenAIResponse(errorResponse);
        } catch {}
      }
      return JSON.stringify({ error: err.message ?? 'OpenAI API error' });
    } finally { try { unlinkSync(bodyFile); } catch {} }
  }

  public get modelId(): string { return this.config.modelId; }
  public get providerName(): string { return 'openai'; }
}
