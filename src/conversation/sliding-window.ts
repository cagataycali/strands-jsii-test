import { ConversationManager } from './manager';
export class SlidingWindowConversationManager extends ConversationManager {
  public readonly windowSize: number;
  public constructor(windowSize?: number) { super(); this.windowSize = windowSize ?? 20; }
  public apply(messagesJson: string): string {
    const messages = JSON.parse(messagesJson);
    if (messages.length <= this.windowSize) return messagesJson;
    const trimmed = [messages[0], ...messages.slice(messages.length - this.windowSize + 1)];
    return JSON.stringify(trimmed);
  }
  public get managerType(): string { return 'sliding_window'; }
}
