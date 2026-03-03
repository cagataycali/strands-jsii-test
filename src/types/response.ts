import { AgentMessage } from './message';

export class AgentResponse {
  public readonly message: AgentMessage;
  public readonly stopReason: string;
  public readonly messages: AgentMessage[];
  public readonly inputTokens: number;
  public readonly outputTokens: number;
  public constructor(message: AgentMessage, stopReason: string, messages: AgentMessage[], inputTokens: number, outputTokens: number) {
    this.message = message; this.stopReason = stopReason; this.messages = messages;
    this.inputTokens = inputTokens; this.outputTokens = outputTokens;
  }
  public get text(): string { return this.message.fullText; }
  public get totalTokens(): number { return this.inputTokens + this.outputTokens; }
}
