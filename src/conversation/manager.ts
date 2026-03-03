export abstract class ConversationManager {
  public abstract apply(messagesJson: string): string;
  public abstract get managerType(): string;
}
