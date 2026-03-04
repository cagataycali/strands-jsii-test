import { Worker } from 'worker_threads';
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
 * Uses worker_threads + Atomics.wait for zero-fork, zero-disk HTTP calls.
 */
export class AnthropicModelProvider extends ModelProvider {
  public readonly config: AnthropicModelConfig;

  public constructor(config?: AnthropicModelConfig) {
    super();
    this.config = config ?? new AnthropicModelConfig();
  }

  public converse(messagesJson: string, systemPrompt?: string, toolSpecsJson?: string): string {
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

    const rawResponse = this._httpWorker(req.url, req.headers, req.body);

    try {
      const parsed = JSON.parse(rawResponse);
      if (parsed.error) {
        const msg = parsed.error.message ?? JSON.stringify(parsed.error);
        const errorType = parsed.error.type ?? '';
        if (errorType === 'rate_limit_error' || msg.toLowerCase().includes('rate limit'))
          return JSON.stringify({ error: `Throttled: ${msg}` });
        if (errorType === 'invalid_request_error') {
          const lower = msg.toLowerCase();
          if (lower.includes('too long') || lower.includes('context') || lower.includes('input length'))
            return JSON.stringify({ error: `Context overflow: ${msg}` });
        }
        return JSON.stringify({ error: msg });
      }
      return parseAnthropicResponse(parsed);
    } catch {
      return JSON.stringify({ error: rawResponse || 'Anthropic API error' });
    }
  }

  /**
   * HTTP POST via worker_threads + Atomics.wait — no fork, no temp files, no curl.
   */
  private _httpWorker(url: string, headers: Record<string, string>, body: unknown): string {
    const DATA_SIZE = 10 * 1024 * 1024;
    const signalBuf = new SharedArrayBuffer(4);
    const signal = new Int32Array(signalBuf);
    const dataBuf = new SharedArrayBuffer(DATA_SIZE);
    const dataView = new Uint8Array(dataBuf);
    const lenBuf = new SharedArrayBuffer(4);
    const lenView = new Int32Array(lenBuf);

    const workerCode = `
      const { workerData } = require('worker_threads');
      const signal = new Int32Array(workerData.signal);
      const dataView = new Uint8Array(workerData.data);
      const lenView = new Int32Array(workerData.len);

      function done(s) {
        const enc = new TextEncoder().encode(s);
        if (enc.length > dataView.length) {
          const t = new TextEncoder().encode(JSON.stringify({ error: 'Response too large' }));
          dataView.set(t); Atomics.store(lenView, 0, t.length);
        } else {
          dataView.set(enc); Atomics.store(lenView, 0, enc.length);
        }
        Atomics.store(signal, 0, 1); Atomics.notify(signal, 0);
      }

      const https = require('https');
      const http = require('http');
      const url = new URL(workerData.url);
      const mod = url.protocol === 'https:' ? https : http;
      const postData = JSON.stringify(workerData.body);
      const opts = {
        hostname: url.hostname, port: url.port, path: url.pathname + url.search,
        method: 'POST', headers: { ...workerData.headers, 'content-length': Buffer.byteLength(postData) },
      };
      const req = mod.request(opts, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => done(Buffer.concat(chunks).toString()));
      });
      req.on('error', e => done(JSON.stringify({ error: e.message })));
      req.setTimeout(300000, () => { req.destroy(); done(JSON.stringify({ error: 'Request timeout' })); });
      req.write(postData);
      req.end();
    `;

    const worker = new Worker(workerCode, {
      eval: true,
      workerData: { signal: signalBuf, data: dataBuf, len: lenBuf, url, headers, body },
    });

    Atomics.wait(signal, 0, 0, 300000);
    const len = Atomics.load(lenView, 0);
    const result = new TextDecoder().decode(dataView.slice(0, len));
    worker.terminate();

    if (len === 0) return JSON.stringify({ error: 'Request timed out (300s)' });
    return result;
  }

  public get modelId(): string { return this.config.modelId; }
  public get providerName(): string { return 'anthropic'; }
}
