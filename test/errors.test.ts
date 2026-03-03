/**
 * Integration tests for error classes, ErrorClassifier, and RetryStrategy.
 */
import {
  AgentError, MaxTokensReachedError, ContextWindowOverflowError,
  ModelThrottledError, ToolExecutionError, MaxCyclesReachedError,
  GuardrailInterventionError, ErrorClassifier, RetryStrategy,
  ModelProvider,
} from '../src/index';

// ── Mock provider for retry tests ────────────────────────

class RetryMockProvider extends ModelProvider {
  public responses: string[];
  public callCount = 0;

  constructor(responses: string[]) {
    super();
    this.responses = responses;
  }
  public converse(_messagesJson: string, _sp?: string, _ts?: string): string {
    return this.responses[this.callCount++] ?? this.responses[this.responses.length - 1];
  }
  public get modelId(): string { return 'retry-mock'; }
  public get providerName(): string { return 'retry-mock'; }
}

// ── Error Classes ────────────────────────────────────────

describe('AgentError', () => {
  it('creates with message and phase', () => {
    const err = new AgentError('broken', 'model');
    expect(err.message).toBe('broken');
    expect(err.phase).toBe('model');
    expect(err.originalError).toBe('');
  });

  it('defaults phase to unknown', () => {
    expect(new AgentError('oops').phase).toBe('unknown');
  });

  it('stores original error', () => {
    const err = new AgentError('wrapped', 'tool', 'original');
    expect(err.originalError).toBe('original');
  });

  it('toString formats correctly', () => {
    expect(new AgentError('test', 'model').toString()).toBe('[model] test');
  });
});

describe('MaxTokensReachedError', () => {
  it('defaults message', () => {
    const err = new MaxTokensReachedError();
    expect(err.message).toContain('maximum token');
    expect(err.phase).toBe('model');
  });
  it('custom message', () => {
    expect(new MaxTokensReachedError('custom').message).toBe('custom');
  });
});

describe('ContextWindowOverflowError', () => {
  it('defaults message', () => {
    const err = new ContextWindowOverflowError();
    expect(err.message).toContain('context window');
    expect(err.phase).toBe('model');
  });
});

describe('ModelThrottledError', () => {
  it('defaults message', () => {
    const err = new ModelThrottledError();
    expect(err.message).toContain('throttling');
    expect(err.phase).toBe('model');
  });
});

describe('ToolExecutionError', () => {
  it('stores tool name', () => {
    const err = new ToolExecutionError('calc');
    expect(err.toolName).toBe('calc');
    expect(err.message).toContain('calc');
    expect(err.phase).toBe('tool');
  });
  it('custom message', () => {
    const err = new ToolExecutionError('search', 'timeout');
    expect(err.message).toBe('timeout');
    expect(err.toolName).toBe('search');
  });
});

describe('MaxCyclesReachedError', () => {
  it('stores cycle count', () => {
    const err = new MaxCyclesReachedError(50);
    expect(err.cycles).toBe(50);
    expect(err.message).toContain('50');
    expect(err.phase).toBe('agent');
  });
});

describe('GuardrailInterventionError', () => {
  it('defaults message', () => {
    const err = new GuardrailInterventionError();
    expect(err.message).toContain('Guardrail');
    expect(err.phase).toBe('model');
  });
});

// ── ErrorClassifier ──────────────────────────────────────

describe('ErrorClassifier', () => {
  it('classifies throttling', () => {
    const err = ErrorClassifier.classify('{"error":"ThrottlingException: rate exceeded"}');
    expect(err).toBeInstanceOf(ModelThrottledError);
  });

  it('classifies context overflow (too long)', () => {
    expect(ErrorClassifier.classify('{"error":"Input is too long for the model"}')).toBeInstanceOf(ContextWindowOverflowError);
  });

  it('classifies context overflow (context limit)', () => {
    expect(ErrorClassifier.classify('{"error":"Exceeds context limit"}')).toBeInstanceOf(ContextWindowOverflowError);
  });

  it('classifies context overflow (too many total text)', () => {
    expect(ErrorClassifier.classify('{"error":"too many total text bytes"}')).toBeInstanceOf(ContextWindowOverflowError);
  });

  it('classifies max tokens', () => {
    expect(ErrorClassifier.classify('{"error":"Reached max_tokens limit"}')).toBeInstanceOf(MaxTokensReachedError);
  });

  it('classifies maximum token variant', () => {
    expect(ErrorClassifier.classify('{"error":"Maximum token count reached"}')).toBeInstanceOf(MaxTokensReachedError);
  });

  it('classifies guardrail', () => {
    expect(ErrorClassifier.classify('{"error":"Guardrail blocked"}')).toBeInstanceOf(GuardrailInterventionError);
  });

  it('classifies generic model error', () => {
    const err = ErrorClassifier.classify('{"error":"Unknown failure"}');
    expect(err).toBeInstanceOf(AgentError);
    expect(err?.phase).toBe('model');
  });

  it('returns undefined for no error', () => {
    expect(ErrorClassifier.classify('{"output":{}}')).toBeUndefined();
  });

  it('returns undefined for invalid JSON', () => {
    expect(ErrorClassifier.classify('not json')).toBeUndefined();
  });

  it('returns undefined for empty object', () => {
    expect(ErrorClassifier.classify('{}')).toBeUndefined();
  });
});

// ── RetryStrategy ────────────────────────────────────────

describe('RetryStrategy', () => {
  it('uses defaults', () => {
    const r = new RetryStrategy();
    expect(r.maxAttempts).toBe(3);
    expect(r.initialDelay).toBe(1.0);
    expect(r.maxDelay).toBe(30.0);
    expect(r.backoffMultiplier).toBe(2.0);
  });

  it('accepts custom values', () => {
    const r = new RetryStrategy(5, 0.5, 60, 3);
    expect(r.maxAttempts).toBe(5);
    expect(r.initialDelay).toBe(0.5);
    expect(r.maxDelay).toBe(60);
    expect(r.backoffMultiplier).toBe(3);
  });

  describe('calculateDelay', () => {
    it('returns delay in expected range for attempt 0', () => {
      const r = new RetryStrategy(3, 1.0, 30.0, 2.0);
      const d = r.calculateDelay(0);
      expect(d).toBeGreaterThanOrEqual(1.0);
      expect(d).toBeLessThanOrEqual(1.5);
    });

    it('increases with attempt', () => {
      const r = new RetryStrategy(5, 1.0, 100.0, 2.0);
      const d0 = r.calculateDelay(0);
      const d4 = r.calculateDelay(4);
      expect(d4).toBeGreaterThan(d0);
    });

    it('caps at maxDelay plus jitter', () => {
      const r = new RetryStrategy(10, 1.0, 5.0, 2.0);
      const d = r.calculateDelay(100);
      expect(d).toBeLessThanOrEqual(7.5);
    });
  });

  describe('isRetryableError', () => {
    it.each([
      ['ThrottlingException', true],
      ['Too many requests', true],
      ['Rate exceeded', true],
      ['Service unavailable', true],
      ['Invalid input', false],
    ])('"%s" → %s', (msg, expected) => {
      expect(RetryStrategy.isRetryableError(`{"error":"${msg}"}`)).toBe(expected);
    });

    it('returns false for no error', () => {
      expect(RetryStrategy.isRetryableError('{"output":{}}')).toBe(false);
    });

    it('returns false for invalid JSON', () => {
      expect(RetryStrategy.isRetryableError('not json')).toBe(false);
    });
  });

  describe('converseWithRetry', () => {
    it('returns immediately on success', () => {
      const provider = new RetryMockProvider([
        JSON.stringify({ output: { message: { content: [{ text: 'ok' }] } }, stopReason: 'end_turn' }),
      ]);
      const r = new RetryStrategy(3, 0.001, 0.01, 2);
      const result = JSON.parse(r.converseWithRetry(provider, '[]'));
      expect(result.output.message.content[0].text).toBe('ok');
      expect(provider.callCount).toBe(1);
    });

    it('returns non-retryable error immediately', () => {
      const provider = new RetryMockProvider([
        JSON.stringify({ error: 'Invalid input format' }),
      ]);
      const r = new RetryStrategy(3, 0.001, 0.01, 2);
      const result = JSON.parse(r.converseWithRetry(provider, '[]'));
      expect(result.error).toBe('Invalid input format');
      expect(provider.callCount).toBe(1);
    });

    it('retries on throttling then succeeds', () => {
      const provider = new RetryMockProvider([
        JSON.stringify({ error: 'ThrottlingException' }),
        JSON.stringify({ output: { message: { content: [{ text: 'ok' }] } }, stopReason: 'end_turn' }),
      ]);
      const r = new RetryStrategy(3, 0.001, 0.01, 2);
      const result = JSON.parse(r.converseWithRetry(provider, '[]'));
      expect(result.output.message.content[0].text).toBe('ok');
      expect(provider.callCount).toBe(2);
    });

    it('exhausts retries and returns error', () => {
      const provider = new RetryMockProvider([
        JSON.stringify({ error: 'Too many requests' }),
        JSON.stringify({ error: 'Too many requests' }),
        JSON.stringify({ error: 'Too many requests' }),
        JSON.stringify({ error: 'Too many requests' }),
        JSON.stringify({ error: 'Too many requests' }),
      ]);
      const r = new RetryStrategy(2, 0.001, 0.01, 2);
      const result = JSON.parse(r.converseWithRetry(provider, '[]'));
      expect(result.error).toContain('Too many requests');
    });

    it('returns unparseable response as-is', () => {
      const provider = new RetryMockProvider(['not-json']);
      const r = new RetryStrategy(1, 0.001, 0.01, 2);
      const result = r.converseWithRetry(provider, '[]');
      expect(result).toBe('not-json');
    });

    it('passes through systemPrompt and toolSpecsJson', () => {
      let capturedSP = '';
      let capturedTS = '';
      class CapturingProvider extends ModelProvider {
        public converse(_m: string, sp?: string, ts?: string): string {
          capturedSP = sp ?? '';
          capturedTS = ts ?? '';
          return JSON.stringify({ output: {} });
        }
        public get modelId(): string { return 'x'; }
        public get providerName(): string { return 'x'; }
      }
      const r = new RetryStrategy(1, 0.001, 0.01, 2);
      r.converseWithRetry(new CapturingProvider(), '[]', 'sys prompt', '[{"name":"t"}]');
      expect(capturedSP).toBe('sys prompt');
      expect(capturedTS).toBe('[{"name":"t"}]');
    });
  });
});
