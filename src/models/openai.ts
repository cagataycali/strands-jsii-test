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

export interface OpenAIModelConfigOptions {
  readonly modelId?: string; readonly apiKey?: string; readonly maxTokens?: number; readonly temperature?: number;
  readonly topP?: number; readonly frequencyPenalty?: number; readonly presencePenalty?: number; readonly seed?: number;
  readonly baseUrl?: string; readonly stopSequencesJson?: string; readonly toolChoice?: OpenAIToolChoice; readonly additionalParamsJson?: string;
}

export class OpenAIModelConfig {
  public readonly modelId: string; public readonly apiKey: string; public readonly maxTokens: number; public readonly temperature: number;
  public readonly topP: number; public readonly frequencyPenalty: number; public readonly presencePenalty: number; public readonly seed: number;
  public readonly baseUrl: string; public readonly stopSequencesJson: string; public readonly toolChoice: OpenAIToolChoice | undefined; public readonly additionalParamsJson: string;
  public constructor(options?: OpenAIModelConfigOptions) {
    this.modelId = options?.modelId ?? 'gpt-4o'; this.apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.maxTokens = options?.maxTokens ?? -1; this.temperature = options?.temperature ?? -1; this.topP = options?.topP ?? -1;
    this.frequencyPenalty = options?.frequencyPenalty ?? 999; this.presencePenalty = options?.presencePenalty ?? 999;
    this.seed = options?.seed ?? -1; this.baseUrl = options?.baseUrl ?? 'https://api.openai.com';
    this.stopSequencesJson = options?.stopSequencesJson ?? ''; this.toolChoice = options?.toolChoice; this.additionalParamsJson = options?.additionalParamsJson ?? '';
  }
}

export class OpenAIModelProvider extends ModelProvider {
  public readonly config: OpenAIModelConfig;
  public constructor(config?: OpenAIModelConfig) { super(); this.config = config ?? new OpenAIModelConfig(); }

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
      if (err.stdout) { try { return parseOpenAIResponse(JSON.parse(err.stdout.trim())); } catch {} }
      return JSON.stringify({ error: err.message ?? 'OpenAI API error' });
    } finally { try { unlinkSync(bodyFile); } catch {} }
  }

  public get modelId(): string { return this.config.modelId; }
  public get providerName(): string { return 'openai'; }
}
