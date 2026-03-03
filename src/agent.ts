/**
 * StrandsAgent — the core agent.
 *
 * Clean interface. Tools, hooks, conversation management.
 * The model talks, tools act, the loop continues.
 */

import { ContentBlock } from './types/content';
import { AgentMessage } from './types/message';
import { AgentResponse } from './types/response';
import { MessageRole } from './types/enums';
import { ToolDefinition, ContextAwareToolDefinition, ToolContext } from './tools/definition';
import { ToolRegistry } from './tools/registry';
import { ToolCaller, DirectToolCallResult, MessageAppender } from './tools/caller';
import { ModelProvider } from './models/provider';
import { BedrockModelProvider } from './models/bedrock';
import { ConversationManager } from './conversation/manager';
import { NullConversationManager } from './conversation/null';
import { CallbackHandler } from './hooks/handler';
import { HookRegistry, BeforeInvocationEvent, AfterInvocationEvent, MessageAddedEvent, ToolStartEvent, ToolEndEvent } from './hooks/hooks';
import { ErrorClassifier } from './errors/classifier';

/**
 * Agent configuration options.
 *
 * @example
 *
 * Python:
 *   agent = Agent(model=Bedrock(), tools=[calculator])
 *
 * TypeScript:
 *   const agent = new StrandsAgent({ model: new BedrockModelProvider(), tools: [calc] });
 *
 * Java:
 *   new StrandsAgent(AgentConfig.builder().model(bedrock).tools(tools).build());
 */
export interface AgentConfigOptions {
  /** Model provider. Default: BedrockModelProvider */
  readonly model?: ModelProvider;
  /** System prompt. Default: "You are a helpful AI assistant." */
  readonly systemPrompt?: string;
  /** Tools available to the agent. */
  readonly tools?: ToolDefinition[];
  /** Conversation manager. Default: NullConversationManager */
  readonly conversationManager?: ConversationManager;
  /** Callback handler for lifecycle events. */
  readonly callbackHandler?: CallbackHandler;
  /** Whether agent.tool.X() records in history. Default: true */
  readonly recordDirectToolCall?: boolean;
  /** Maximum agent loop cycles. Default: 50 */
  readonly maxCycles?: number;
}

/**
 * Resolved agent configuration. All fields are guaranteed set.
 */
export class AgentConfig {
  public readonly model: ModelProvider;
  public readonly systemPrompt: string;
  public readonly tools: ToolDefinition[];
  public readonly conversationManager: ConversationManager;
  public readonly callbackHandler: CallbackHandler | undefined;
  public readonly recordDirectToolCall: boolean;
  public readonly maxCycles: number;

  public constructor(options?: AgentConfigOptions) {
    this.model = options?.model ?? new BedrockModelProvider();
    this.systemPrompt = options?.systemPrompt ?? 'You are a helpful AI assistant.';
    this.tools = options?.tools ?? [];
    this.conversationManager = options?.conversationManager ?? new NullConversationManager();
    this.callbackHandler = options?.callbackHandler;
    this.recordDirectToolCall = options?.recordDirectToolCall ?? true;
    this.maxCycles = options?.maxCycles ?? 50;
  }
}

/**
 * Internal message appender that bridges ToolCaller to agent's message history.
 */
class AgentMessageAppender extends MessageAppender {
  private readonly _agent: StrandsAgent;
  public constructor(agent: StrandsAgent) {
    super();
    this._agent = agent;
  }
  public appendMessages(messagesJson: string): void {
    this._agent.appendRawMessages(messagesJson);
  }
}

/**
 * The Strands Agent.
 *
 * @example
 *
 * Python:
 *   agent = Agent(model=Bedrock(), tools=[calculator])
 *   agent.tool.calculator(expression="6 * 7")
 *   response = agent("What was the result?")
 *
 * Java:
 *   StrandsAgent agent = new StrandsAgent(new AgentConfig(opts));
 *   agent.callTool("calculator", "{\"expression\": \"6 * 7\"}");
 *   AgentResponse r = agent.invoke("What was the result?");
 */
export class StrandsAgent {
  public readonly agentConfig: AgentConfig;
  public readonly toolRegistry: ToolRegistry;
  public readonly hookRegistry: HookRegistry;

  private _messages: AgentMessage[];
  private readonly _toolCaller: ToolCaller;

  public constructor(config?: AgentConfig) {
    this.agentConfig = config ?? new AgentConfig();
    this._messages = [];
    this.toolRegistry = ToolRegistry.fromTools(this.agentConfig.tools);
    this.hookRegistry = new HookRegistry();
    this._toolCaller = new ToolCaller(this.toolRegistry, new AgentMessageAppender(this));
  }

  // ─── Public API ───────────────────────────────────────────

  /** Invoke the agent with a text prompt. */
  public invoke(prompt: string): AgentResponse {
    return this._runLoop(prompt);
  }

  /**
   * Ask the agent a question. Alias for invoke().
   *
   * Universal shorthand that works identically across all languages:
   *   Python:     agent.ask("Hello!")
   *   TypeScript: agent.ask("Hello!")
   *   Java:       agent.ask("Hello!");
   *   C#:         agent.Ask("Hello!");
   *   Go:         agent.Ask("Hello!")
   */
  public ask(prompt: string): AgentResponse {
    return this.invoke(prompt);
  }

  /** Call a tool directly and inject the 4-message context into history. */
  public callTool(toolName: string, inputJson: string): DirectToolCallResult {
    return this._toolCaller.callTool(toolName, inputJson, this.agentConfig.recordDirectToolCall);
  }

  /**
   * Get a tool proxy for fluent tool invocation.
   *
   * Universal shorthand that works identically across all languages:
   *   Python:     agent.tool_call("calculator", '{"expression":"6*7"}')
   *   TypeScript: agent.toolCall("calculator", '{"expression":"6*7"}')
   *   Java:       agent.toolCall("calculator", "{\"expression\":\"6*7\"}");
   *   C#:         agent.ToolCall("calculator", "{\"expression\":\"6*7\"}");
   *   Go:         agent.ToolCall("calculator", `{"expression":"6*7"}`)
   *
   * Returns the result JSON string directly — simpler than callTool().
   */
  public toolCall(toolName: string, inputJson: string): string {
    const result = this._toolCaller.callTool(toolName, inputJson, this.agentConfig.recordDirectToolCall);
    return result.resultJson;
  }

  /** Reset conversation history. */
  public resetConversation(): void { this._messages = []; }

  /** Current conversation history. */
  public get messages(): AgentMessage[] { return [...this._messages]; }

  /** System prompt. */
  public get systemPrompt(): string { return this.agentConfig.systemPrompt; }

  /** Model provider. */
  public get model(): ModelProvider { return this.agentConfig.model; }

  /** Registered tool count. */
  public get toolCount(): number { return this.toolRegistry.size; }

  /** Registered tool names as JSON array string. */
  public get toolNames(): string { return this.toolRegistry.listNames(); }

  /** Max cycles for the agent loop. */
  public get maxCycles(): number { return this.agentConfig.maxCycles; }

  /** Append raw Bedrock Converse-format messages to history. */
  public appendRawMessages(messagesJson: string): void {
    const rawMessages = JSON.parse(messagesJson);
    for (const raw of rawMessages) {
      const blocks: ContentBlock[] = [];
      for (const block of (raw.content ?? [])) {
        if (block.text) {
          blocks.push(ContentBlock.fromText(block.text));
        } else if (block.toolUse) {
          blocks.push(ContentBlock.fromToolUse(block.toolUse.name, block.toolUse.toolUseId, JSON.stringify(block.toolUse.input ?? {})));
        } else if (block.toolResult) {
          const tr = block.toolResult;
          const content = tr.content?.[0]?.json ?? tr.content?.[0]?.text ?? {};
          blocks.push(ContentBlock.fromToolResult(tr.toolUseId, tr.status ?? 'success', JSON.stringify(content)));
        }
      }
      const role = raw.role === 'assistant' ? MessageRole.ASSISTANT : MessageRole.USER;
      this._messages.push(new AgentMessage(role, blocks));
    }
  }

  // ─── Agent Loop ───────────────────────────────────────────

  private _runLoop(prompt: string): AgentResponse {
    const handler = this.agentConfig.callbackHandler;

    const beforeEvent = new BeforeInvocationEvent(prompt, JSON.stringify(this._messages.map(m => ({ role: m.role }))));
    this.hookRegistry.emitBeforeInvocation(beforeEvent);
    if (beforeEvent.cancelled) {
      const cancelMsg = AgentMessage.assistantMessage('Invocation cancelled by hook.');
      return new AgentResponse(cancelMsg, 'cancelled', [...this._messages, cancelMsg], 0, 0);
    }

    if (handler) handler.onAgentStart(prompt);
    this._messages.push(AgentMessage.userMessage(prompt));
    this.hookRegistry.emitMessageAdded(new MessageAddedEvent('user', JSON.stringify([{ text: prompt }])));

    let inTokens = 0;
    let outTokens = 0;

    try {
      for (let cycle = 0; cycle < this.agentConfig.maxCycles; cycle++) {
        const managedJson = this.agentConfig.conversationManager.apply(JSON.stringify(this._formatMessagesForModel()));

        let toolSpecsJson: string | undefined;
        const tools = this.toolRegistry.allTools();
        if (tools.length > 0) {
          toolSpecsJson = JSON.stringify(tools.map(t => ({
            name: t.spec.name, description: t.spec.description, inputSchema: JSON.parse(t.spec.inputSchemaJson),
          })));
        }

        if (handler) handler.onModelStart(managedJson);
        const responseJson = this.agentConfig.model.converse(managedJson, this.agentConfig.systemPrompt, toolSpecsJson);
        if (handler) handler.onModelEnd(responseJson);

        const response = JSON.parse(responseJson);

        if (response.error) {
          const classified = ErrorClassifier.classify(responseJson);
          const msg = classified ? classified.message : response.error;
          if (handler) handler.onError(msg, classified?.phase ?? 'model');
          const errMsg = new AgentMessage(MessageRole.ASSISTANT, [ContentBlock.fromText('Error: ' + msg)]);
          this._messages.push(errMsg);
          return new AgentResponse(errMsg, 'error', [...this._messages], inTokens, outTokens);
        }

        inTokens += response.usage?.inputTokens ?? 0;
        outTokens += response.usage?.outputTokens ?? 0;

        const blocks: ContentBlock[] = [];
        const toolUses: Array<{ name: string; toolUseId: string; input: unknown }> = [];

        for (const block of (response.output?.message?.content ?? [])) {
          if (block.text) {
            blocks.push(ContentBlock.fromText(block.text));
            if (handler) handler.onTextChunk(block.text);
          } else if (block.toolUse) {
            blocks.push(ContentBlock.fromToolUse(block.toolUse.name, block.toolUse.toolUseId, JSON.stringify(block.toolUse.input ?? {})));
            toolUses.push({ name: block.toolUse.name, toolUseId: block.toolUse.toolUseId, input: block.toolUse.input });
          } else if (block.reasoningContent) {
            const rc = block.reasoningContent;
            blocks.push(ContentBlock.fromReasoning(rc.reasoningText?.text ?? rc.text ?? '', rc.reasoningText?.signature ?? ''));
          }
        }

        const assistantMsg = new AgentMessage(MessageRole.ASSISTANT, blocks);
        this._messages.push(assistantMsg);
        this.hookRegistry.emitMessageAdded(new MessageAddedEvent('assistant', JSON.stringify(response.output?.message?.content ?? [])));

        const stopReason = response.stopReason ?? 'end_turn';

        if (stopReason !== 'tool_use' || toolUses.length === 0) {
          if (handler) handler.onAgentEnd(assistantMsg.fullText, inTokens, outTokens);
          this.hookRegistry.emitAfterInvocation(new AfterInvocationEvent(assistantMsg.fullText, stopReason, inTokens, outTokens));
          return new AgentResponse(assistantMsg, stopReason, [...this._messages], inTokens, outTokens);
        }

        const results: ContentBlock[] = [];
        for (const tu of toolUses) {
          const tool = this.toolRegistry.get(tu.name);
          const inp = JSON.stringify(tu.input ?? {});

          if (handler) handler.onToolStart(tu.name, inp);
          this.hookRegistry.emitToolStart(new ToolStartEvent(tu.name, inp));

          const t0 = Date.now();
          let res: string;
          if (tool) {
            try {
              res = (tool instanceof ContextAwareToolDefinition)
                ? tool.executeWithContext(inp, new ToolContext(this, tu.toolUseId, tu.name, '[]', this.agentConfig.systemPrompt))
                : tool.execute(inp);
            } catch (e: unknown) {
              const err = e instanceof Error ? e : new Error(String(e));
              res = JSON.stringify({ error: err.message });
              if (handler) handler.onError(err.message, 'tool');
            }
          } else {
            res = JSON.stringify({ error: 'Tool not found: ' + tu.name });
          }

          const ms = Date.now() - t0;
          if (handler) handler.onToolEnd(tu.name, res, ms);
          this.hookRegistry.emitToolEnd(new ToolEndEvent(tu.name, res, ms));
          results.push(ContentBlock.fromToolResult(tu.toolUseId, tool ? 'success' : 'error', res));
        }

        this._messages.push(new AgentMessage(MessageRole.USER, results));
      }

      const last = this._messages[this._messages.length - 1];
      if (handler) handler.onAgentEnd('Max cycles reached', inTokens, outTokens);
      return new AgentResponse(last, 'maxCycles', [...this._messages], inTokens, outTokens);
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (handler) handler.onError(err.message, 'agent');
      throw err;
    }
  }

  private _formatMessagesForModel(): object[] {
    return this._messages.map(msg => {
      const content: object[] = [];
      for (const block of msg.content) {
        if (block.isText && block.asText) {
          content.push({ text: block.asText.text });
        } else if (block.isToolUse && block.asToolUse) {
          const tu = block.asToolUse;
          content.push({ toolUse: { toolUseId: tu.toolUseId, name: tu.name, input: JSON.parse(tu.inputJson) } });
        } else if (block.isToolResult && block.asToolResult) {
          const tr = block.asToolResult;
          content.push({ toolResult: { toolUseId: tr.toolUseId, content: [{ json: JSON.parse(tr.contentJson) }], status: tr.status } });
        } else if (block.isReasoning && block.asReasoning) {
          const rc = block.asReasoning;
          const rt: Record<string, string> = { text: rc.text };
          if (rc.signature) rt.signature = rc.signature;
          content.push({ reasoningContent: { reasoningText: rt } });
        }
      }
      return { role: msg.role, content };
    });
  }
}
