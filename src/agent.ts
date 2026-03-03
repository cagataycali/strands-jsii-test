/**
 * StrandsAgent - The main agent class for jsii multi-language bindings.
 *
 * This implements the core agent loop (model → tool → model → ...) in a
 * jsii-compatible way. The key difference from the TypeScript SDK is that
 * this uses Promise-based APIs instead of async generators.
 *
 * The agent loop:
 * 1. Sends conversation history to the model
 * 2. Model responds with text or tool use requests
 * 3. If tool use: execute tools, add results to history, go to 1
 * 4. If no tool use: return the response
 */

import { ContentBlock } from './content';
import { AgentMessage } from './message';
import { ToolDefinition } from './tools';
import { BedrockModelProvider } from './model';
import { MessageRole } from './types';

/**
 * Configuration for creating a StrandsAgent.
 *
 * @example
 *
 * In Python:
 * config = AgentConfig(
 *     model=BedrockModelProvider(BedrockModelConfig(
 *         model_id="us.anthropic.claude-sonnet-4-20250514-v1:0"
 *     )),
 *     system_prompt="You are a helpful assistant.",
 *     tools=[calculator, web_search]
 * )
 * agent = StrandsAgent(config)
 *
 * In Java:
 * AgentConfig config = new AgentConfig(
 *     new BedrockModelProvider(new BedrockModelConfig()),
 *     "You are a helpful assistant.",
 *     Arrays.asList(calculator, webSearch),
 *     50
 * );
 * StrandsAgent agent = new StrandsAgent(config);
 */
export class AgentConfig {
  /**
   * The model provider to use for inference.
   */
  public readonly model: BedrockModelProvider;

  /**
   * System prompt to guide model behavior.
   */
  public readonly systemPrompt: string;

  /**
   * Tools available to the agent.
   */
  public readonly tools: ToolDefinition[];

  /**
   * Maximum number of agent loop cycles to prevent infinite loops.
   * @default 50
   */
  public readonly maxCycles: number;

  /**
   * Creates an agent configuration.
   * @param model The model provider
   * @param systemPrompt System prompt text
   * @param tools Array of tool definitions
   * @param maxCycles Maximum loop cycles
   */
  public constructor(
    model?: BedrockModelProvider,
    systemPrompt?: string,
    tools?: ToolDefinition[],
    maxCycles?: number,
  ) {
    this.model = model ?? new BedrockModelProvider();
    this.systemPrompt = systemPrompt ?? 'You are a helpful AI assistant.';
    this.tools = tools ?? [];
    this.maxCycles = maxCycles ?? 50;
  }
}

/**
 * Response from an agent invocation.
 *
 * Contains the final message, stop reason, conversation history,
 * and token usage statistics.
 */
export class AgentResponse {
  /**
   * The final assistant message.
   */
  public readonly message: AgentMessage;

  /**
   * Why the model stopped generating.
   */
  public readonly stopReason: string;

  /**
   * The full conversation history after this invocation.
   */
  public readonly messages: AgentMessage[];

  /**
   * Total input tokens used across all model calls.
   */
  public readonly inputTokens: number;

  /**
   * Total output tokens used across all model calls.
   */
  public readonly outputTokens: number;

  /**
   * Creates an agent response.
   * @param message The final assistant message
   * @param stopReason Why the model stopped
   * @param messages Full conversation history
   * @param inputTokens Total input tokens
   * @param outputTokens Total output tokens
   */
  public constructor(
    message: AgentMessage,
    stopReason: string,
    messages: AgentMessage[],
    inputTokens: number,
    outputTokens: number,
  ) {
    this.message = message;
    this.stopReason = stopReason;
    this.messages = messages;
    this.inputTokens = inputTokens;
    this.outputTokens = outputTokens;
  }

  /**
   * Get the text content of the response.
   */
  public get text(): string {
    return this.message.fullText;
  }
}

/**
 * The main Strands Agent class.
 *
 * Orchestrates the interaction between a model and tools.
 * Implements the agent loop: model → tool → model → ... until completion.
 *
 * This is the primary entry point for using Strands Agents from any language.
 *
 * @example
 *
 * In Python:
 * from strands_agents_jsii import StrandsAgent, AgentConfig, BedrockModelProvider, BedrockModelConfig
 *
 * agent = StrandsAgent(AgentConfig(
 *     model=BedrockModelProvider(BedrockModelConfig(
 *         model_id="us.anthropic.claude-sonnet-4-20250514-v1:0"
 *     )),
 *     system_prompt="You are a helpful assistant."
 * ))
 *
 * response = agent.invoke("What is the capital of France?")
 * print(response.text)
 *
 * In Java:
 * StrandsAgent agent = new StrandsAgent(new AgentConfig(
 *     new BedrockModelProvider(new BedrockModelConfig()),
 *     "You are a helpful assistant.",
 *     Collections.emptyList(),
 *     50
 * ));
 *
 * AgentResponse response = agent.invoke("What is the capital of France?");
 * System.out.println(response.getText());
 *
 * In C#:
 * var agent = new StrandsAgent(new AgentConfig(
 *     new BedrockModelProvider(new BedrockModelConfig()),
 *     "You are a helpful assistant."
 * ));
 *
 * var response = await agent.Invoke("What is the capital of France?");
 * Console.WriteLine(response.Text);
 *
 * In Go:
 * agent := strandsagents.NewStrandsAgent(strandsagents.NewAgentConfig(
 *     strandsagents.NewBedrockModelProvider(strandsagents.NewBedrockModelConfig(nil, nil, nil, nil, nil)),
 *     jsii.String("You are a helpful assistant."),
 *     nil,
 *     nil,
 * ))
 *
 * response, _ := agent.Invoke(jsii.String("What is the capital of France?"))
 * fmt.Println(*response.Text())
 */
export class StrandsAgent {
  /**
   * The agent configuration.
   */
  public readonly agentConfig: AgentConfig;

  /**
   * The conversation history.
   */
  private _messages: AgentMessage[];

  /**
   * Tool registry mapping name -> tool.
   */
  private readonly _toolMap: Map<string, ToolDefinition>;

  /**
   * Creates a new StrandsAgent.
   * @param config Agent configuration
   */
  public constructor(config?: AgentConfig) {
    this.agentConfig = config ?? new AgentConfig();
    this._messages = [];
    this._toolMap = new Map();

    // Register tools
    for (const tool of this.agentConfig.tools) {
      this._toolMap.set(tool.spec.name, tool);
    }
  }

  /**
   * Invoke the agent with a text prompt.
   *
   * Runs the full agent loop: sends the prompt to the model, executes any
   * requested tools, and continues until the model completes without requesting tools.
   *
   * @param prompt The user's text input
   * @returns The agent's response
   */
  public async invoke(prompt: string): Promise<AgentResponse> {
    // Add user message
    const userMessage = AgentMessage.userMessage(prompt);
    this._messages.push(userMessage);

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Agent loop
    for (let cycle = 0; cycle < this.agentConfig.maxCycles; cycle++) {
      // Format messages for Bedrock
      const bedrockMessages = this._formatMessagesForBedrock();

      // Format tool specs
      let toolSpecsJson: string | undefined;
      if (this.agentConfig.tools.length > 0) {
        const toolSpecs = this.agentConfig.tools.map(t => ({
          name: t.spec.name,
          description: t.spec.description,
          inputSchema: JSON.parse(t.spec.inputSchemaJson),
        }));
        toolSpecsJson = JSON.stringify(toolSpecs);
      }

      // Call model
      const responseJson = await this.agentConfig.model.converse(
        JSON.stringify(bedrockMessages),
        this.agentConfig.systemPrompt,
        toolSpecsJson,
      );

      const response = JSON.parse(responseJson);

      // Track usage
      if (response.usage) {
        totalInputTokens += response.usage.inputTokens ?? 0;
        totalOutputTokens += response.usage.outputTokens ?? 0;
      }

      // Parse assistant message
      const assistantContent = response.output?.message?.content ?? [];
      const contentBlocks: ContentBlock[] = [];
      const toolUseBlocks: Array<{ name: string; toolUseId: string; input: unknown }> = [];

      for (const block of assistantContent) {
        if (block.text) {
          contentBlocks.push(ContentBlock.fromText(block.text));
        } else if (block.toolUse) {
          const tu = block.toolUse;
          contentBlocks.push(ContentBlock.fromToolUse(
            tu.name,
            tu.toolUseId,
            JSON.stringify(tu.input ?? {}),
          ));
          toolUseBlocks.push({
            name: tu.name,
            toolUseId: tu.toolUseId,
            input: tu.input,
          });
        }
      }

      const assistantMessage = new AgentMessage(MessageRole.ASSISTANT, contentBlocks);
      this._messages.push(assistantMessage);

      // Check stop reason
      const stopReason = response.stopReason ?? 'end_turn';

      if (stopReason !== 'tool_use' || toolUseBlocks.length === 0) {
        // Done - return response
        return new AgentResponse(
          assistantMessage,
          stopReason,
          [...this._messages],
          totalInputTokens,
          totalOutputTokens,
        );
      }

      // Execute tools
      const toolResults: ContentBlock[] = [];
      for (const toolUse of toolUseBlocks) {
        const tool = this._toolMap.get(toolUse.name);
        let resultJson: string;

        if (tool) {
          try {
            resultJson = tool.execute(JSON.stringify(toolUse.input ?? {}));
          } catch (e: unknown) {
            const error = e instanceof Error ? e : new Error(String(e));
            resultJson = JSON.stringify({ error: error.message });
          }
        } else {
          resultJson = JSON.stringify({ error: `Tool '${toolUse.name}' not found` });
        }

        toolResults.push(ContentBlock.fromToolResult(
          toolUse.toolUseId,
          tool ? 'success' : 'error',
          resultJson,
        ));
      }

      // Add tool result message
      const toolResultMessage = new AgentMessage(MessageRole.USER, toolResults);
      this._messages.push(toolResultMessage);
    }

    // Max cycles reached
    const lastMessage = this._messages[this._messages.length - 1];
    return new AgentResponse(
      lastMessage,
      'maxCycles',
      [...this._messages],
      totalInputTokens,
      totalOutputTokens,
    );
  }

  /**
   * Reset the conversation history.
   */
  public resetConversation(): void {
    this._messages = [];
  }

  /**
   * Get the current conversation history.
   */
  public get messages(): AgentMessage[] {
    return [...this._messages];
  }

  /**
   * Format messages for the Bedrock Converse API.
   */
  private _formatMessagesForBedrock(): object[] {
    return this._messages.map(msg => {
      const content: object[] = [];

      for (const block of msg.content) {
        if (block.isText && block.asText) {
          content.push({ text: block.asText.text });
        } else if (block.isToolUse && block.asToolUse) {
          const tu = block.asToolUse;
          content.push({
            toolUse: {
              toolUseId: tu.toolUseId,
              name: tu.name,
              input: JSON.parse(tu.inputJson),
            },
          });
        } else if (block.isToolResult && block.asToolResult) {
          const tr = block.asToolResult;
          content.push({
            toolResult: {
              toolUseId: tr.toolUseId,
              content: [{ json: JSON.parse(tr.contentJson) }],
              status: tr.status,
            },
          });
        }
      }

      return {
        role: msg.role,
        content,
      };
    });
  }
}
