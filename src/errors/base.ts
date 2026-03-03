export class AgentError {
  public readonly message: string;
  public readonly phase: string;
  public readonly originalError: string;
  public constructor(message: string, phase?: string, originalError?: string) {
    this.message = message; this.phase = phase ?? 'unknown'; this.originalError = originalError ?? '';
  }
  public toString(): string { return `[${this.phase}] ${this.message}`; }
}

export class MaxTokensReachedError extends AgentError {
  public constructor(message?: string) { super(message ?? 'Model reached maximum token generation limit', 'model'); }
}
export class ContextWindowOverflowError extends AgentError {
  public constructor(message?: string) { super(message ?? 'Input exceeds model context window', 'model'); }
}
export class ModelThrottledError extends AgentError {
  public constructor(message?: string) { super(message ?? 'Model service is throttling requests', 'model'); }
}
export class ToolExecutionError extends AgentError {
  public readonly toolName: string;
  public constructor(toolName: string, message?: string) {
    super(message ?? `Tool '${toolName}' execution failed`, 'tool');
    this.toolName = toolName;
  }
}
export class MaxCyclesReachedError extends AgentError {
  public readonly cycles: number;
  public constructor(cycles: number) { super(`Agent exceeded maximum cycles: ${cycles}`, 'agent'); this.cycles = cycles; }
}
export class GuardrailInterventionError extends AgentError {
  public constructor(message?: string) { super(message ?? 'Guardrail blocked the request', 'model'); }
}
