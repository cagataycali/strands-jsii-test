import { CallbackHandler } from './handler';

export class PrintingCallbackHandler extends CallbackHandler {
  public onModelStart(messagesJson: string): void {
    const msgs = JSON.parse(messagesJson);
    process.stdout.write(`[Model] Sending ${msgs.length} messages...\n`);
  }
  public onModelEnd(responseJson: string): void {
    const r = JSON.parse(responseJson);
    process.stdout.write(`[Model] Stop: ${r.stopReason ?? 'unknown'}\n`);
  }
  public onToolStart(toolName: string, _inputJson: string): void {
    process.stdout.write(`[Tool] ${toolName} executing...\n`);
  }
  public onToolEnd(toolName: string, _resultJson: string, durationMs: number): void {
    process.stdout.write(`[Tool] ${toolName} completed (${durationMs.toFixed(0)}ms)\n`);
  }
  public onTextChunk(text: string): void { process.stdout.write(text); }
  public onAgentEnd(_responseText: string, inputTokens: number, outputTokens: number): void {
    process.stdout.write(`\n[Agent] Done. Tokens: ${inputTokens} in / ${outputTokens} out\n`);
  }
  public onError(errorMessage: string, phase: string): void {
    process.stderr.write(`[Error] ${phase}: ${errorMessage}\n`);
  }
}
