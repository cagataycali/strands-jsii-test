import { Worker } from 'worker_threads';
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
  public readonly modelId: string;
  public readonly apiKey: string;
  public readonly maxTokens: number;
  public readonly temperature: number;
  public readonly topP: number;
  public readonly frequencyPenalty: number;
  public readonly presencePenalty: number;
  public readonly seed: number;
  public readonly baseUrl: string;
  public readonly stopSequencesJson: string;
  public readonly toolChoice: OpenAIToolChoice | undefined;
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
 * Uses worker_threads + Atomics.wait — no fork, no temp files, no curl.
 *
 * Also works with any OpenAI-compatible endpoint (vLLM, Together, Fireworks, etc.)
 * by setting the `baseUrl` config option.
 */
export class OpenAIModelProvider extends ModelProvider {
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

    const rawResponse = this._httpWorker(req.url, req.headers, req.body);

    try {
      return parseOpenAIResponse(JSON.parse(rawResponse));
    } catch {
      return JSON.stringify({ error: rawResponse || 'OpenAI API error' });
    }
  }

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
  public get providerName(): string { return 'openai'; }
}
