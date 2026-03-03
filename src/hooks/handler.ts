/**
 * Callback handlers for agent lifecycle events.
 */
export abstract class CallbackHandler {
  public onModelStart(_messagesJson: string): void { /* no-op */ }
  public onModelEnd(_responseJson: string): void { /* no-op */ }
  public onToolStart(_toolName: string, _inputJson: string): void { /* no-op */ }
  public onToolEnd(_toolName: string, _resultJson: string, _durationMs: number): void { /* no-op */ }
  public onTextChunk(_text: string): void { /* no-op */ }
  public onAgentStart(_prompt: string): void { /* no-op */ }
  public onAgentEnd(_responseText: string, _inputTokens: number, _outputTokens: number): void { /* no-op */ }
  public onError(_errorMessage: string, _phase: string): void { /* no-op */ }
}
