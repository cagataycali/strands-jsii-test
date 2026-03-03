import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ModelProvider } from './provider';
import { buildOllamaRequest, parseOllamaResponse } from '../providers/formats';

export interface OllamaModelConfigOptions {
  readonly modelId?: string; readonly host?: string; readonly maxTokens?: number; readonly temperature?: number;
  readonly topP?: number; readonly topK?: number; readonly keepAlive?: string;
  readonly stopSequencesJson?: string; readonly optionsJson?: string; readonly additionalArgsJson?: string;
}

export class OllamaModelConfig {
  public readonly modelId: string; public readonly host: string; public readonly maxTokens: number;
  public readonly temperature: number; public readonly topP: number; public readonly topK: number;
  public readonly keepAlive: string; public readonly stopSequencesJson: string;
  public readonly optionsJson: string; public readonly additionalArgsJson: string;
  public constructor(options?: OllamaModelConfigOptions) {
    this.modelId = options?.modelId ?? 'llama3'; this.host = options?.host ?? 'http://localhost:11434';
    this.maxTokens = options?.maxTokens ?? -1; this.temperature = options?.temperature ?? -1;
    this.topP = options?.topP ?? -1; this.topK = options?.topK ?? -1;
    this.keepAlive = options?.keepAlive ?? '5m'; this.stopSequencesJson = options?.stopSequencesJson ?? '';
    this.optionsJson = options?.optionsJson ?? ''; this.additionalArgsJson = options?.additionalArgsJson ?? '';
  }
}

export class OllamaModelProvider extends ModelProvider {
  public readonly config: OllamaModelConfig;
  public constructor(config?: OllamaModelConfig) { super(); this.config = config ?? new OllamaModelConfig(); }

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
      if (msg.includes('Connection refused') || msg.includes('ECONNREFUSED')) return JSON.stringify({ error: `Ollama not reachable at ${this.config.host}. Try: ollama serve` });
      return JSON.stringify({ error: msg || 'Ollama API error' });
    } finally { try { unlinkSync(bodyFile); } catch {} }
  }

  public get modelId(): string { return this.config.modelId; }
  public get providerName(): string { return 'ollama'; }
}
