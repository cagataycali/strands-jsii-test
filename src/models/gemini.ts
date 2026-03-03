import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ModelProvider } from './provider';
import { buildGeminiRequest, parseGeminiResponse } from '../providers/formats';

export interface GeminiModelConfigOptions {
  readonly modelId?: string; readonly apiKey?: string; readonly maxTokens?: number; readonly temperature?: number;
  readonly topP?: number; readonly topK?: number; readonly stopSequencesJson?: string;
  readonly geminiToolsJson?: string; readonly additionalParamsJson?: string; readonly thinkingBudgetTokens?: number;
}

export class GeminiModelConfig {
  public readonly modelId: string; public readonly apiKey: string; public readonly maxTokens: number;
  public readonly temperature: number; public readonly topP: number; public readonly topK: number;
  public readonly stopSequencesJson: string; public readonly geminiToolsJson: string;
  public readonly additionalParamsJson: string; public readonly thinkingBudgetTokens: number;
  public constructor(options?: GeminiModelConfigOptions) {
    this.modelId = options?.modelId ?? 'gemini-2.5-flash'; this.apiKey = options?.apiKey ?? process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? '';
    this.maxTokens = options?.maxTokens ?? 4096; this.temperature = options?.temperature ?? -1; this.topP = options?.topP ?? -1; this.topK = options?.topK ?? -1;
    this.stopSequencesJson = options?.stopSequencesJson ?? ''; this.geminiToolsJson = options?.geminiToolsJson ?? '';
    this.additionalParamsJson = options?.additionalParamsJson ?? ''; this.thinkingBudgetTokens = options?.thinkingBudgetTokens ?? -1;
  }
}

export class GeminiModelProvider extends ModelProvider {
  public readonly config: GeminiModelConfig;
  public constructor(config?: GeminiModelConfig) { super(); this.config = config ?? new GeminiModelConfig(); }

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
