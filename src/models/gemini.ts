import { Worker } from 'worker_threads';
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
  public readonly modelId: string;
  public readonly apiKey: string;
  public readonly maxTokens: number;
  public readonly temperature: number;
  public readonly topP: number;
  public readonly topK: number;
  public readonly stopSequencesJson: string;
  public readonly geminiToolsJson: string;
  public readonly additionalParamsJson: string;
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
 * Uses worker_threads + Atomics.wait — no fork, no temp files, no curl.
 */
export class GeminiModelProvider extends ModelProvider {
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

    const rawResponse = this._httpWorker(req.url, { 'content-type': 'application/json' }, req.body);

    try {
      return parseGeminiResponse(JSON.parse(rawResponse));
    } catch {
      return JSON.stringify({ error: rawResponse || 'Gemini API error' });
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
  public get providerName(): string { return 'gemini'; }
}
