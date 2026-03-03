/**
 * WebAgent — async browser-compatible agent.
 *
 * Reuses 100% of existing: ContentBlock, AgentMessage, AgentResponse,
 * ToolRegistry, ToolCaller, ConversationManager, CallbackHandler, HookRegistry, ErrorClassifier.
 *
 * Only difference: converse() is async → agent loop is async.
 * Everything else is identical to StrandsAgent.
 */

import { ContentBlock } from '../types/content';
import { AgentMessage } from '../types/message';
import { AgentResponse } from '../types/response';
import { MessageRole } from '../types/enums';
import { ToolDefinition, ContextAwareToolDefinition, ToolContext } from '../tools/definition';
import { ToolRegistry } from '../tools/registry';
import { ToolCaller, DirectToolCallResult, MessageAppender } from '../tools/caller';
import { ConversationManager } from '../conversation/manager';
import { NullConversationManager } from '../conversation/null';
import { CallbackHandler } from '../hooks/handler';
import { HookRegistry, BeforeInvocationEvent, AfterInvocationEvent, MessageAddedEvent, ToolStartEvent, ToolEndEvent } from '../hooks/hooks';
import { ErrorClassifier } from '../errors/classifier';
import { AsyncModelProvider } from './provider';

export interface WebAgentOptions {
  readonly model: AsyncModelProvider;
  readonly systemPrompt?: string;
  readonly tools?: ToolDefinition[];
  readonly conversationManager?: ConversationManager;
  readonly callbackHandler?: CallbackHandler;
  readonly recordDirectToolCall?: boolean;
  readonly maxCycles?: number;
}

class WebMessageAppender extends MessageAppender {
  private readonly _agent: WebAgent;
  constructor(agent: WebAgent) { super(); this._agent = agent; }
  appendMessages(messagesJson: string): void { this._agent.appendRawMessages(messagesJson); }
}

export class WebAgent {
  readonly model: AsyncModelProvider;
  readonly systemPrompt: string;
  readonly toolRegistry: ToolRegistry;
  readonly hookRegistry: HookRegistry;
  readonly maxCycles: number;

  private _messages: AgentMessage[];
  private readonly _toolCaller: ToolCaller;
  private readonly _conversationManager: ConversationManager;
  private readonly _callbackHandler?: CallbackHandler;
  private readonly _recordDirectToolCall: boolean;

  constructor(options: WebAgentOptions) {
    this.model = options.model;
    this.systemPrompt = options.systemPrompt ?? 'You are a helpful AI assistant.';
    this.maxCycles = options.maxCycles ?? 50;
    this._messages = [];
    this._conversationManager = options.conversationManager ?? new NullConversationManager();
    this._callbackHandler = options.callbackHandler;
    this._recordDirectToolCall = options.recordDirectToolCall ?? true;
    this.toolRegistry = ToolRegistry.fromTools(options.tools ?? []);
    this.hookRegistry = new HookRegistry();
    this._toolCaller = new ToolCaller(this.toolRegistry, new WebMessageAppender(this));
  }

  /** Invoke the agent — async because model.converse() is async in browser. */
  async invoke(prompt: string): Promise<AgentResponse> {
    return this._runLoop(prompt);
  }

  /** Alias for invoke(). */
  async ask(prompt: string): Promise<AgentResponse> { return this.invoke(prompt); }

  /** Call a tool directly (sync — tools are still sync). */
  callTool(toolName: string, inputJson: string): DirectToolCallResult {
    return this._toolCaller.callTool(toolName, inputJson, this._recordDirectToolCall);
  }

  /** Shorthand tool call. */
  toolCall(toolName: string, inputJson: string): string {
    return this._toolCaller.callTool(toolName, inputJson, this._recordDirectToolCall).resultJson;
  }

  resetConversation(): void { this._messages = []; }
  get messages(): AgentMessage[] { return [...this._messages]; }
  get toolCount(): number { return this.toolRegistry.size; }
  get toolNames(): string { return this.toolRegistry.listNames(); }

  appendRawMessages(messagesJson: string): void {
    const rawMessages = JSON.parse(messagesJson);
    for (const raw of rawMessages) {
      const blocks: ContentBlock[] = [];
      for (const block of (raw.content ?? [])) {
        if (block.text) blocks.push(ContentBlock.fromText(block.text));
        else if (block.toolUse) blocks.push(ContentBlock.fromToolUse(block.toolUse.name, block.toolUse.toolUseId, JSON.stringify(block.toolUse.input ?? {})));
        else if (block.toolResult) {
          const tr = block.toolResult;
          const content = tr.content?.[0]?.json ?? tr.content?.[0]?.text ?? {};
          blocks.push(ContentBlock.fromToolResult(tr.toolUseId, tr.status ?? 'success', JSON.stringify(content)));
        }
      }
      this._messages.push(new AgentMessage(raw.role === 'assistant' ? MessageRole.ASSISTANT : MessageRole.USER, blocks));
    }
  }

  // ─── Async Agent Loop ─────────────────────────────────────

  private async _runLoop(prompt: string): Promise<AgentResponse> {
    const handler = this._callbackHandler;

    const beforeEvent = new BeforeInvocationEvent(prompt, JSON.stringify(this._messages.map(m => ({ role: m.role }))));
    this.hookRegistry.emitBeforeInvocation(beforeEvent);
    if (beforeEvent.cancelled) {
      const cancelMsg = AgentMessage.assistantMessage('Invocation cancelled by hook.');
      return new AgentResponse(cancelMsg, 'cancelled', [...this._messages, cancelMsg], 0, 0);
    }

    if (handler) handler.onAgentStart(prompt);
    this._messages.push(AgentMessage.userMessage(prompt));
    this.hookRegistry.emitMessageAdded(new MessageAddedEvent('user', JSON.stringify([{ text: prompt }])));

    let inTokens = 0, outTokens = 0;

    try {
      for (let cycle = 0; cycle < this.maxCycles; cycle++) {
        const managedJson = this._conversationManager.apply(JSON.stringify(this._formatMessagesForModel()));

        let toolSpecsJson: string | undefined;
        const tools = this.toolRegistry.allTools();
        if (tools.length > 0) {
          toolSpecsJson = JSON.stringify(tools.map(t => ({
            name: t.spec.name, description: t.spec.description, inputSchema: JSON.parse(t.spec.inputSchemaJson),
          })));
        }

        if (handler) handler.onModelStart(managedJson);

        // ★ THE KEY DIFFERENCE: await the async converse()
        const responseJson = await this.model.converse(managedJson, this.systemPrompt, toolSpecsJson);

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
            toolUses.push(block.toolUse);
          } else if (block.reasoningContent) {
            const rc = block.reasoningContent;
            blocks.push(ContentBlock.fromReasoning(rc.reasoningText?.text ?? '', rc.reasoningText?.signature ?? ''));
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

        // Execute tools (sync — tools run in JS, not subprocess)
        const results: ContentBlock[] = [];
        for (const tu of toolUses) {
          const tool = this.toolRegistry.get(tu.name);
          const inp = JSON.stringify(tu.input ?? {});
          if (handler) handler.onToolStart(tu.name, inp);
          this.hookRegistry.emitToolStart(new ToolStartEvent(tu.name, inp));

          const t0 = performance.now();
          let res: string;
          if (tool) {
            try {
              res = (tool instanceof ContextAwareToolDefinition)
                ? tool.executeWithContext(inp, new ToolContext(this, tu.toolUseId, tu.name, '[]', this.systemPrompt))
                : tool.execute(inp);
            } catch (e: any) { res = JSON.stringify({ error: e.message ?? String(e) }); }
          } else {
            res = JSON.stringify({ error: 'Tool not found: ' + tu.name });
          }

          const ms = performance.now() - t0;
          if (handler) handler.onToolEnd(tu.name, res, ms);
          this.hookRegistry.emitToolEnd(new ToolEndEvent(tu.name, res, ms));
          results.push(ContentBlock.fromToolResult(tu.toolUseId, tool ? 'success' : 'error', res));
        }

        this._messages.push(new AgentMessage(MessageRole.USER, results));
      }

      const last = this._messages[this._messages.length - 1];
      if (handler) handler.onAgentEnd('Max cycles reached', inTokens, outTokens);
      return new AgentResponse(last, 'maxCycles', [...this._messages], inTokens, outTokens);
    } catch (e: any) {
      if (handler) handler.onError(e.message ?? String(e), 'agent');
      throw e;
    }
  }

  private _formatMessagesForModel(): object[] {
    return this._messages.map(msg => {
      const content: object[] = [];
      for (const block of msg.content) {
        if (block.isText && block.asText) content.push({ text: block.asText.text });
        else if (block.isToolUse && block.asToolUse) {
          const tu = block.asToolUse;
          content.push({ toolUse: { toolUseId: tu.toolUseId, name: tu.name, input: JSON.parse(tu.inputJson) } });
        } else if (block.isToolResult && block.asToolResult) {
          const tr = block.asToolResult;
          content.push({ toolResult: { toolUseId: tr.toolUseId, content: [{ json: JSON.parse(tr.contentJson) }], status: tr.status } });
        } else if (block.isReasoning && block.asReasoning) {
          const rc = block.asReasoning;
          content.push({ reasoningContent: { reasoningText: { text: rc.text, ...(rc.signature ? { signature: rc.signature } : {}) } } });
        }
      }
      return { role: msg.role, content };
    });
  }
}
