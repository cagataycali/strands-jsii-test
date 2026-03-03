import { AgentError, MaxTokensReachedError, ContextWindowOverflowError, ModelThrottledError, GuardrailInterventionError } from './base';

export class ErrorClassifier {
  private constructor() {}
  public static classify(responseJson: string): AgentError | undefined {
    try {
      const response = JSON.parse(responseJson);
      if (!response.error) return undefined;
      const msg = response.error as string;
      const lower = msg.toLowerCase();
      if (lower.includes('throttl')) return new ModelThrottledError(msg);
      if (lower.includes('too long') || lower.includes('context limit') || lower.includes('too many total text'))
        return new ContextWindowOverflowError(msg);
      if (lower.includes('max_tokens') || lower.includes('maximum token'))
        return new MaxTokensReachedError(msg);
      if (lower.includes('guardrail')) return new GuardrailInterventionError(msg);
      return new AgentError(msg, 'model');
    } catch { return undefined; }
  }
}
