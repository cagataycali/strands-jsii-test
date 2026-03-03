import { ContentBlock } from './content';
import { MessageRole } from './enums';

export class AgentMessage {
  public readonly role: MessageRole;
  public readonly content: ContentBlock[];
  public constructor(role: MessageRole, content: ContentBlock[]) {
    this.role = role; this.content = content;
  }
  public static userMessage(text: string): AgentMessage {
    return new AgentMessage(MessageRole.USER, [ContentBlock.fromText(text)]);
  }
  public static assistantMessage(text: string): AgentMessage {
    return new AgentMessage(MessageRole.ASSISTANT, [ContentBlock.fromText(text)]);
  }
  public get firstText(): string | undefined {
    for (const block of this.content) { if (block.isText && block.asText) return block.asText.text; }
    return undefined;
  }
  public get fullText(): string {
    return this.content.filter(b => b.isText && b.asText).map(b => b.asText!.text).join('');
  }
}
