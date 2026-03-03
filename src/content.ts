/**
 * Content blocks for messages in the Strands Agents conversation model.
 *
 * These are jsii-compatible representations of the SDK's ContentBlock types.
 * jsii doesn't support discriminated unions, so each content type is a separate class
 * and ContentBlock wraps them with accessor methods.
 */

/**
 * Plain text content within a message.
 *
 * @example
 *
 * In Python:
 * text = TextContent("Hello, world!")
 * print(text.text)
 *
 * In Java:
 * TextContent text = new TextContent("Hello, world!");
 * System.out.println(text.getText());
 */
export class TextContent {
  /**
   * The text content.
   */
  public readonly text: string;

  /**
   * Creates a new text content block.
   * @param text The text content
   */
  public constructor(text: string) {
    this.text = text;
  }
}

/**
 * Represents a tool use request from the model.
 *
 * When the model decides to use a tool, it generates a ToolUseContent block
 * containing the tool name, a unique ID, and the input parameters.
 */
export class ToolUseContent {
  /**
   * The name of the tool to execute.
   */
  public readonly name: string;

  /**
   * Unique identifier for this tool use instance.
   */
  public readonly toolUseId: string;

  /**
   * The input parameters as a JSON string.
   *
   * jsii doesn't support `unknown` or `any` types, so input is serialized as JSON string.
   * Parse this in your target language to access the input parameters.
   */
  public readonly inputJson: string;

  /**
   * Creates a new tool use content block.
   * @param name Tool name
   * @param toolUseId Unique tool use ID
   * @param inputJson JSON-encoded input parameters
   */
  public constructor(name: string, toolUseId: string, inputJson: string) {
    this.name = name;
    this.toolUseId = toolUseId;
    this.inputJson = inputJson;
  }
}

/**
 * Result content from a tool execution.
 *
 * After a tool executes, a ToolResultContent block is created to return the
 * result back to the model.
 */
export class ToolResultContent {
  /**
   * The tool use ID this result corresponds to.
   */
  public readonly toolUseId: string;

  /**
   * Whether the tool execution succeeded or failed.
   */
  public readonly status: string;

  /**
   * The result content as a JSON string.
   */
  public readonly contentJson: string;

  /**
   * Creates a new tool result content block.
   * @param toolUseId The tool use ID this result corresponds to
   * @param status 'success' or 'error'
   * @param contentJson JSON-encoded result content
   */
  public constructor(toolUseId: string, status: string, contentJson: string) {
    this.toolUseId = toolUseId;
    this.status = status;
    this.contentJson = contentJson;
  }
}

/**
 * A content block within a message.
 *
 * Since jsii doesn't support TypeScript discriminated unions, this class
 * wraps the different content types and provides accessor methods to
 * determine the type and extract the content.
 *
 * @example
 *
 * In Python:
 * block = ContentBlock.from_text("Hello!")
 * if block.is_text:
 *     print(block.as_text.text)
 */
export class ContentBlock {
  private readonly _text?: TextContent;
  private readonly _toolUse?: ToolUseContent;
  private readonly _toolResult?: ToolResultContent;

  private constructor(text?: TextContent, toolUse?: ToolUseContent, toolResult?: ToolResultContent) {
    this._text = text;
    this._toolUse = toolUse;
    this._toolResult = toolResult;
  }

  /**
   * Creates a ContentBlock containing text.
   * @param text The text content
   */
  public static fromText(text: string): ContentBlock {
    return new ContentBlock(new TextContent(text));
  }

  /**
   * Creates a ContentBlock containing a tool use request.
   * @param name Tool name
   * @param toolUseId Unique tool use ID
   * @param inputJson JSON-encoded input
   */
  public static fromToolUse(name: string, toolUseId: string, inputJson: string): ContentBlock {
    return new ContentBlock(undefined, new ToolUseContent(name, toolUseId, inputJson));
  }

  /**
   * Creates a ContentBlock containing a tool result.
   * @param toolUseId The tool use ID
   * @param status 'success' or 'error'
   * @param contentJson JSON-encoded result
   */
  public static fromToolResult(toolUseId: string, status: string, contentJson: string): ContentBlock {
    return new ContentBlock(undefined, undefined, new ToolResultContent(toolUseId, status, contentJson));
  }

  /**
   * Whether this block contains text content.
   */
  public get isText(): boolean {
    return this._text !== undefined;
  }

  /**
   * Whether this block contains a tool use request.
   */
  public get isToolUse(): boolean {
    return this._toolUse !== undefined;
  }

  /**
   * Whether this block contains a tool result.
   */
  public get isToolResult(): boolean {
    return this._toolResult !== undefined;
  }

  /**
   * Get the text content. Returns undefined if this is not a text block.
   */
  public get asText(): TextContent | undefined {
    return this._text;
  }

  /**
   * Get the tool use content. Returns undefined if this is not a tool use block.
   */
  public get asToolUse(): ToolUseContent | undefined {
    return this._toolUse;
  }

  /**
   * Get the tool result content. Returns undefined if this is not a tool result block.
   */
  public get asToolResult(): ToolResultContent | undefined {
    return this._toolResult;
  }

  /**
   * Get a string representation of the content block type.
   * Returns 'text', 'toolUse', 'toolResult', or 'unknown'.
   */
  public get blockType(): string {
    if (this._text) return 'text';
    if (this._toolUse) return 'toolUse';
    if (this._toolResult) return 'toolResult';
    return 'unknown';
  }
}
