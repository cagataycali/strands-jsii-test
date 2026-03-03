export class TextContent {
  public readonly text: string;
  public constructor(text: string) { this.text = text; }
}

export class ToolUseContent {
  public readonly name: string;
  public readonly toolUseId: string;
  public readonly inputJson: string;
  public constructor(name: string, toolUseId: string, inputJson: string) {
    this.name = name; this.toolUseId = toolUseId; this.inputJson = inputJson;
  }
}

export class ToolResultContent {
  public readonly toolUseId: string;
  public readonly status: string;
  public readonly contentJson: string;
  public constructor(toolUseId: string, status: string, contentJson: string) {
    this.toolUseId = toolUseId; this.status = status; this.contentJson = contentJson;
  }
}

export class ReasoningContent {
  public readonly text: string;
  public readonly signature: string;
  public constructor(text: string, signature?: string) {
    this.text = text; this.signature = signature ?? '';
  }
}

export class ContentBlock {
  private readonly _text?: TextContent;
  private readonly _toolUse?: ToolUseContent;
  private readonly _toolResult?: ToolResultContent;
  private readonly _reasoning?: ReasoningContent;

  private constructor(text?: TextContent, toolUse?: ToolUseContent, toolResult?: ToolResultContent, reasoning?: ReasoningContent) {
    this._text = text; this._toolUse = toolUse; this._toolResult = toolResult; this._reasoning = reasoning;
  }

  public static fromText(text: string): ContentBlock { return new ContentBlock(new TextContent(text)); }
  public static fromToolUse(name: string, toolUseId: string, inputJson: string): ContentBlock {
    return new ContentBlock(undefined, new ToolUseContent(name, toolUseId, inputJson));
  }
  public static fromToolResult(toolUseId: string, status: string, contentJson: string): ContentBlock {
    return new ContentBlock(undefined, undefined, new ToolResultContent(toolUseId, status, contentJson));
  }
  public static fromReasoning(text: string, signature?: string): ContentBlock {
    return new ContentBlock(undefined, undefined, undefined, new ReasoningContent(text, signature));
  }

  public get isText(): boolean { return this._text !== undefined; }
  public get isToolUse(): boolean { return this._toolUse !== undefined; }
  public get isToolResult(): boolean { return this._toolResult !== undefined; }
  public get isReasoning(): boolean { return this._reasoning !== undefined; }
  public get asText(): TextContent | undefined { return this._text; }
  public get asToolUse(): ToolUseContent | undefined { return this._toolUse; }
  public get asToolResult(): ToolResultContent | undefined { return this._toolResult; }
  public get asReasoning(): ReasoningContent | undefined { return this._reasoning; }
  public get blockType(): string {
    if (this._text) return 'text';
    if (this._toolUse) return 'toolUse';
    if (this._toolResult) return 'toolResult';
    if (this._reasoning) return 'reasoning';
    return 'unknown';
  }
}
