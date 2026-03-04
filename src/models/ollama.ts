import { Worker } from 'worker_threads';
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
  public readonly modelId: string;
  public readonly host: string;
  public readonly maxTokens: number;
  public readonly temperature: number;
  public readonly topP: number;
  public readonly topK: number;
  public readonly keepAlive: string;
  public readonly stopSequencesJson: string;
  public readonly optionsJson: string;
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
 * Uses worker_threads + Atomics.wait — no fork, no temp files, no curl.
 */
export class OllamaModelProvider extends ModelProvider {
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

    const rawResponse = this._httpWorker(req.url, { 'content-type': 'application/json' }, req.body);

    try {
      const parsed = JSON.parse(rawResponse);
      if (parsed.error) return JSON.stringify({ error: parsed.error });
      return parseOllamaResponse(parsed);
    } catch {
      const msg = rawResponse || 'Ollama API error';
      if (msg.includes('ECONNREFUSED'))
        return JSON.stringify({ error: `Ollama server not reachable at ${this.config.host}. Try: ollama serve` });
      return JSON.stringify({ error: msg });
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
  public get providerName(): string { return 'ollama'; }
}
