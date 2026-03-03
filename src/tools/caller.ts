import { ToolRegistry } from './registry';

/**
 * Result of a direct tool call via agent.tool.X().
 */
export class DirectToolCallResult {
  public readonly toolName: string;
  public readonly toolUseId: string;
  public readonly inputJson: string;
  public readonly resultJson: string;
  public readonly success: boolean;
  public readonly durationMs: number;

  public constructor(toolName: string, toolUseId: string, inputJson: string, resultJson: string, success: boolean, durationMs: number) {
    this.toolName = toolName;
    this.toolUseId = toolUseId;
    this.inputJson = inputJson;
    this.resultJson = resultJson;
    this.success = success;
    this.durationMs = durationMs;
  }
}

/**
 * Callback for appending messages to agent history.
 */
export abstract class MessageAppender {
  /** Append raw Bedrock Converse-format messages. */
  public abstract appendMessages(messagesJson: string): void;
}

/**
 * Direct tool caller — executes tools and injects context into message history.
 *
 * Creates a 4-message sequence per Python SDK pattern:
 * 1. user: description of the call
 * 2. assistant: toolUse block
 * 3. user: toolResult block
 * 4. assistant: acknowledgment
 *
 * @example
 *
 * agent.tool.calculator(expression="6 * 7")
 * response = agent("What was the result?")
 */
export class ToolCaller {
  private readonly _registry: ToolRegistry;
  private readonly _appender: MessageAppender;

  public constructor(registry: ToolRegistry, appender: MessageAppender) {
    this._registry = registry;
    this._appender = appender;
  }

  /**
   * Call a tool by name and inject result into message history.
   *
   * @param toolName Name of the registered tool
   * @param inputJson JSON string of input parameters
   * @param recordInHistory Whether to record in message history (default: true)
   */
  public callTool(toolName: string, inputJson: string, recordInHistory?: boolean): DirectToolCallResult {
    const shouldRecord = recordInHistory ?? true;
    const tool = this._registry.get(toolName);

    const toolUseId = 'tooluse_' + toolName + '_' + Math.random().toString(36).slice(2, 11);
    const startTime = Date.now();
    let resultJson: string;
    let success = true;

    if (!tool) {
      resultJson = JSON.stringify({ error: 'Tool not found: ' + toolName });
      success = false;
    } else {
      try {
        resultJson = tool.execute(inputJson);
      } catch (e: unknown) {
        const error = e instanceof Error ? e : new Error(String(e));
        resultJson = JSON.stringify({ error: error.message });
        success = false;
      }
    }

    const durationMs = Date.now() - startTime;

    if (shouldRecord) {
      const input = JSON.parse(inputJson);
      const inputStr = JSON.stringify(input);

      const messages = [
        { role: 'user', content: [{ text: 'agent.tool.' + toolName + ' direct tool call.\nInput parameters: ' + inputStr }] },
        { role: 'assistant', content: [{ toolUse: { toolUseId: toolUseId, name: toolName, input: input } }] },
        { role: 'user', content: [{ toolResult: { toolUseId: toolUseId, content: [{ json: JSON.parse(resultJson) }], status: success ? 'success' : 'error' } }] },
        { role: 'assistant', content: [{ text: 'agent.tool.' + toolName + ' was called.' }] },
      ];

      this._appender.appendMessages(JSON.stringify(messages));
    }

    return new DirectToolCallResult(toolName, toolUseId, inputJson, resultJson, success, durationMs);
  }
}
