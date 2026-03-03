import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ModelProvider } from './provider';
import { buildAnthropicRequest, parseAnthropicResponse } from '../providers/formats';

export class AnthropicToolChoice {
  public readonly choiceMode: string;
  public readonly toolName: string;
  public constructor(choiceMode?: string, toolName?: string) {
    this.choiceMode = choiceMode ?? 'auto';
    this.toolName = toolName ?? '';
  }
}

export interface AnthropicModelConfigOptions {
  readonly modelId?: string;
  readonly apiKey?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly topP?: number;
  readonly topK?: number;
  readonly baseUrl?: string;
  readonly anthropicVersion?: string;
  readonly stopSequencesJson?: string;
  readonly toolChoice?: AnthropicToolChoice;
  readonly thinkingJson?: string;
  readonly additionalParamsJson?: string;
}

export class AnthropicModelConfig {
  public readonly modelId: string;
  public readonly apiKey: string;
  public readonly maxTokens: number;
  public readonly temperature: number;
  public readonly topP: number;
  public readonly topK: number;
  public readonly baseUrl: string;
  public readonly anthropicVersion: string;
  public readonly stopSequencesJson: string;
  public readonly toolChoice: AnthropicToolChoice | undefined;
  public readonly thinkingJson: string;
  public readonly additionalParamsJson: string;

  public constructor(options?: AnthropicModelConfigOptions) {
    this.modelId = options?.modelId ?? 'claude-sonnet-4-20250514';
    this.apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
    this.maxTokens = options?.maxTokens ?? 4096;
    this.temperature = options?.temperature ?? -1;
    this.topP = options?.topP ?? -1;
    this.topK = options?.topK ?? -1;
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
 * Uses shared format definitions from src/providers/formats.ts.
 * Only the HTTP transport (execSync+curl) is Node.js specific.
 */
export class AnthropicModelProvider extends ModelProvider {
  public readonly config: AnthropicModelConfig;

  public constructor(config?: AnthropicModelConfig) {
    super();
    this.config = config ?? new AnthropicModelConfig();
  }

  public converse(messagesJson: string, systemPrompt?: string, toolSpecsJson?: string): string {
    // Use shared format definitions — ZERO duplication
    const req = buildAnthropicRequest({
      modelId: this.config.modelId,
      apiKey: this.config.apiKey,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      topP: this.config.topP,
      topK: this.config.topK,
      baseUrl: this.config.baseUrl,
      anthropicVersion: this.config.anthropicVersion,
      stopSequences: this.config.stopSequencesJson || undefined,
      toolChoice: this.config.toolChoice,
      thinkingJson: this.config.thinkingJson || undefined,
      additionalParamsJson: this.config.additionalParamsJson || undefined,
    }, JSON.parse(messagesJson), systemPrompt, toolSpecsJson);

    // Transport: Node.js execSync+curl (the ONLY Node-specific part)
    const bodyFile = join(tmpdir(), `strands-jsii-anthropic-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(bodyFile, JSON.stringify(req.body));
    try {
      const headerFlags = Object.entries(req.headers).map(([k, v]) => `-H "${k}: ${v}"`).join(' ');
      const result = execSync(
        `curl -s -X POST "${req.url}" ${headerFlags} -d @"${bodyFile}"`,
        { encoding: 'utf-8', timeout: 300000, maxBuffer: 10 * 1024 * 1024 },
      );
      // Use shared response parser
      return parseAnthropicResponse(JSON.parse(result.trim()));
    } catch (error: unknown) {
      const err = error as { stdout?: string; message?: string };
      if (err.stdout) {
        try {
          const errorResponse = JSON.parse(err.stdout.trim());
          if (errorResponse.error) {
            const msg = errorResponse.error.message ?? JSON.stringify(errorResponse.error);
            const errorType = errorResponse.error.type ?? '';
            if (errorType === 'rate_limit_error' || msg.toLowerCase().includes('rate limit'))
              return JSON.stringify({ error: `Throttled: ${msg}` });
            if (errorType === 'invalid_request_error') {
              const lower = msg.toLowerCase();
              if (lower.includes('too long') || lower.includes('context') || lower.includes('input length'))
                return JSON.stringify({ error: `Context overflow: ${msg}` });
            }
            return JSON.stringify({ error: msg });
          }
          return parseAnthropicResponse(errorResponse);
        } catch {}
      }
      return JSON.stringify({ error: err.message ?? 'Anthropic API error' });
    } finally {
      try { unlinkSync(bodyFile); } catch {}
    }
  }

  public get modelId(): string { return this.config.modelId; }
  public get providerName(): string { return 'anthropic'; }
}
