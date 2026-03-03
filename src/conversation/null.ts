import { ConversationManager } from './manager';
export class NullConversationManager extends ConversationManager {
  public apply(messagesJson: string): string { return messagesJson; }
  public get managerType(): string { return 'null'; }
}
