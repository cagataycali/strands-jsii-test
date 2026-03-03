/**
 * Tool definitions for jsii multi-language bindings.
 */

export class ToolSpecification {
  public readonly name: string;
  public readonly description: string;
  public readonly inputSchemaJson: string;
  public constructor(name: string, description: string, inputSchemaJson: string) {
    this.name = name; this.description = description; this.inputSchemaJson = inputSchemaJson;
  }
}

export class ToolContext {
  private readonly _agentRef: object;
  public readonly toolUseId: string;
  public readonly toolName: string;
  public readonly messagesJson: string;
  public readonly systemPrompt: string;
  public readonly invocationStateJson: string;
  public constructor(agentRef: object, toolUseId: string, toolName: string, messagesJson: string, systemPrompt: string, invocationStateJson?: string) {
    this._agentRef = agentRef; this.toolUseId = toolUseId; this.toolName = toolName;
    this.messagesJson = messagesJson; this.systemPrompt = systemPrompt;
    this.invocationStateJson = invocationStateJson ?? '{}';
  }
  public get agent(): object { return this._agentRef; }
}

export abstract class ToolDefinition {
  public readonly spec: ToolSpecification;
  public constructor(spec: ToolSpecification) { this.spec = spec; }
  public abstract execute(inputJson: string): string;
}

export abstract class ContextAwareToolDefinition extends ToolDefinition {
  public constructor(spec: ToolSpecification) { super(spec); }
  public abstract executeWithContext(inputJson: string, context: ToolContext): string;
  public execute(inputJson: string): string {
    const emptyCtx = new ToolContext({}, '', this.spec.name, '[]', '', '{}');
    return this.executeWithContext(inputJson, emptyCtx);
  }
}
