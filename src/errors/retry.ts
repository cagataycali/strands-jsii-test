import { execSync } from 'child_process';
import { ModelProvider } from '../models/provider';

export class RetryStrategy {
  public readonly maxAttempts: number;
  public readonly initialDelay: number;
  public readonly maxDelay: number;
  public readonly backoffMultiplier: number;
  public constructor(maxAttempts?: number, initialDelay?: number, maxDelay?: number, backoffMultiplier?: number) {
    this.maxAttempts = maxAttempts ?? 3;
    this.initialDelay = initialDelay ?? 1.0;
    this.maxDelay = maxDelay ?? 30.0;
    this.backoffMultiplier = backoffMultiplier ?? 2.0;
  }
  public calculateDelay(attempt: number): number {
    const base = this.initialDelay * Math.pow(this.backoffMultiplier, attempt);
    const capped = Math.min(base, this.maxDelay);
    return capped + Math.random() * capped * 0.5;
  }
  public converseWithRetry(provider: ModelProvider, messagesJson: string, systemPrompt?: string, toolSpecsJson?: string): string {
    let lastError = '';
    for (let attempt = 0; attempt <= this.maxAttempts; attempt++) {
      const result = provider.converse(messagesJson, systemPrompt, toolSpecsJson);
      try {
        const parsed = JSON.parse(result);
        if (parsed.error) {
          const msg = (parsed.error as string).toLowerCase();
          const retryable = msg.includes('throttl') || msg.includes('too many requests') || msg.includes('rate exceeded') || msg.includes('service unavailable');
          if (retryable && attempt < this.maxAttempts) {
            lastError = parsed.error;
            const d = this.calculateDelay(attempt);
            try { execSync(`sleep ${d.toFixed(2)}`, { timeout: (d + 5) * 1000 }); }
            catch { try { execSync(`node -e "var d=Date.now();while(Date.now()-d<${Math.floor(d*1000)}){}"`, { timeout: (d + 5) * 1000 }); } catch { /* */ } }
            continue;
          }
        }
        return result;
      } catch { return result; }
    }
    return JSON.stringify({ error: `Max retries exceeded: ${lastError}` });
  }
  public static isRetryableError(responseJson: string): boolean {
    try {
      const p = JSON.parse(responseJson);
      if (!p.error) return false;
      const m = (p.error as string).toLowerCase();
      return m.includes('throttl') || m.includes('too many requests') || m.includes('rate exceeded') || m.includes('service unavailable');
    } catch { return false; }
  }
}
