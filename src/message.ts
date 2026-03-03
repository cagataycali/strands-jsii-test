/**
 * Message representation for jsii multi-language bindings.
 */

import { ContentBlock } from './content';
import { MessageRole } from './types';

/**
 * A message in a conversation between user and assistant.
 *
 * Each message has a role (user or assistant) and an array of content blocks.
 *
 * @example
 *
 * In Python:
 * msg = AgentMessage(
 *     role=MessageRole.USER,
 *     content=[ContentBlock.from_text("What is 2 + 2?")]
 * )
 *
 * In Java:
 * AgentMessage msg = new AgentMessage(
 *     MessageRole.USER,
 *     Arrays.asList(ContentBlock.fromText("What is 2 + 2?"))
 * );
 */
export class AgentMessage {
  /**
   * The role of the message sender.
   */
  public readonly role: MessageRole;

  /**
   * Array of content blocks that make up this message.
   */
  public readonly content: ContentBlock[];

  /**
   * Creates a new message.
   * @param role The role (USER or ASSISTANT)
   * @param content Array of content blocks
   */
  public constructor(role: MessageRole, content: ContentBlock[]) {
    this.role = role;
    this.content = content;
  }

  /**
   * Convenience factory to create a simple user text message.
   * @param text The user's text input
   */
  public static userMessage(text: string): AgentMessage {
    return new AgentMessage(MessageRole.USER, [ContentBlock.fromText(text)]);
  }

  /**
   * Convenience factory to create a simple assistant text message.
   * @param text The assistant's text response
   */
  public static assistantMessage(text: string): AgentMessage {
    return new AgentMessage(MessageRole.ASSISTANT, [ContentBlock.fromText(text)]);
  }

  /**
   * Get the text content of the first text block in this message.
   * Returns undefined if there are no text blocks.
   */
  public get firstText(): string | undefined {
    for (const block of this.content) {
      if (block.isText && block.asText) {
        return block.asText.text;
      }
    }
    return undefined;
  }

  /**
   * Get all text content concatenated.
   */
  public get fullText(): string {
    return this.content
      .filter(b => b.isText && b.asText)
      .map(b => b.asText!.text)
      .join('');
  }
}
