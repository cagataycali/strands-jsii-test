import { ConversationManager } from './manager';

export interface SummarizingConversationManagerConfig {
  readonly summaryRatio?: number;
  readonly preserveRecentMessages?: number;
  readonly maxMessages?: number;
  readonly summarizationPrompt?: string;
}

export class SummarizingConversationManager extends ConversationManager {
  public readonly summaryRatio: number;
  public readonly preserveRecentMessages: number;
  public readonly maxMessages: number;
  public readonly summarizationPrompt: string;

  public constructor(config?: SummarizingConversationManagerConfig) {
    super();
    this.summaryRatio = Math.max(0.1, Math.min(0.8, config?.summaryRatio ?? 0.3));
    this.preserveRecentMessages = config?.preserveRecentMessages ?? 10;
    this.maxMessages = config?.maxMessages ?? 40;
    this.summarizationPrompt = config?.summarizationPrompt ?? 'Summarize the conversation concisely.';
  }

  public apply(messagesJson: string): string {
    const messages = JSON.parse(messagesJson);
    if (messages.length <= this.maxMessages) return messagesJson;
    const numToSummarize = Math.max(1, Math.floor(messages.length * this.summaryRatio));
    const keepFrom = Math.max(numToSummarize, messages.length - this.preserveRecentMessages);
    const oldMessages = messages.slice(0, keepFrom);
    const summaryParts: string[] = ['[Conversation Summary]'];
    for (const msg of oldMessages) {
      const role = msg.role ?? 'unknown';
      const texts = (msg.content ?? []).filter((b: any) => b.text).map((b: any) => b.text).join(' ');
      const tools = (msg.content ?? []).filter((b: any) => b.toolUse).map((b: any) => `[Tool: ${b.toolUse.name}]`).join(' ');
      if (texts || tools) summaryParts.push(`${role}: ${texts} ${tools}`.trim());
    }
    const summaryMessage = { role: 'user', content: [{ text: summaryParts.join('\n') }] };
    const recentMessages = messages.slice(keepFrom);
    return JSON.stringify([summaryMessage, ...recentMessages]);
  }

  public get managerType(): string { return 'summarizing'; }
}
