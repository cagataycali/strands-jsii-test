/**
 * StreamingWebAgent — full streaming agent loop for browsers.
 * Yields StreamEvents as tokens arrive. The UI renders progressively.
 * Also supports non-streaming invoke() for backward compat.
 */
import { ContentBlock } from '../types/content';
import { AgentMessage } from '../types/message';
import { AgentResponse } from '../types/response';
import { MessageRole } from '../types/enums';
import { ToolDefinition, ContextAwareToolDefinition, ToolContext } from '../tools/definition';
import { ToolRegistry } from '../tools/registry';
import { ToolCaller, MessageAppender } from '../tools/caller';
import { ConversationManager } from '../conversation/manager';
import { NullConversationManager } from '../conversation/null';
import { CallbackHandler } from '../hooks/handler';
import { HookRegistry, BeforeInvocationEvent, AfterInvocationEvent, MessageAddedEvent, ToolStartEvent, ToolEndEvent } from '../hooks/hooks';
import { ErrorClassifier } from '../errors/classifier';
import { StreamingModelProvider, StreamEvent } from './streaming';

export interface StreamingWebAgentOptions {
  readonly model: StreamingModelProvider;
  readonly systemPrompt?: string;
  readonly tools?: ToolDefinition[];
  readonly conversationManager?: ConversationManager;
  readonly callbackHandler?: CallbackHandler;
  readonly maxCycles?: number;
}

class StreamMessageAppender extends MessageAppender {
  private readonly _agent: StreamingWebAgent;
  constructor(agent: StreamingWebAgent) { super(); this._agent = agent; }
  appendMessages(messagesJson: string): void { this._agent.appendRawMessages(messagesJson); }
}

export class StreamingWebAgent {
  readonly model: StreamingModelProvider;
  readonly systemPrompt: string;
  readonly toolRegistry: ToolRegistry;
  readonly hookRegistry: HookRegistry;
  readonly maxCycles: number;

  private _messages: AgentMessage[];
  private readonly _toolCaller: ToolCaller;
  private readonly _conversationManager: ConversationManager;
  private readonly _callbackHandler?: CallbackHandler;

  constructor(options: StreamingWebAgentOptions) {
    this.model = options.model;
    this.systemPrompt = options.systemPrompt ?? 'You are a helpful AI assistant.';
    this.maxCycles = options.maxCycles ?? 50;
    this._messages = [];
    this._conversationManager = options.conversationManager ?? new NullConversationManager();
    this._callbackHandler = options.callbackHandler;
    this.toolRegistry = ToolRegistry.fromTools(options.tools ?? []);
    this.hookRegistry = new HookRegistry();
    this._toolCaller = new ToolCaller(this.toolRegistry, new StreamMessageAppender(this));
  }

  /**
   * Stream the agent loop — yields events as they happen.
   * This is the primary API for browser UIs.
   */
  async *stream(prompt: string): AsyncGenerator<StreamEvent> {
    const handler = this._callbackHandler;
    const beforeEvent = new BeforeInvocationEvent(prompt, '[]');
    this.hookRegistry.emitBeforeInvocation(beforeEvent);
    if (beforeEvent.cancelled) return;

    if (handler) handler.onAgentStart(prompt);
    this._messages.push(AgentMessage.userMessage(prompt));

    for (let cycle = 0; cycle < this.maxCycles; cycle++) {
      const managedJson = this._conversationManager.apply(JSON.stringify(this._formatMessagesForModel()));
      let toolSpecsJson: string | undefined;
      const tools = this.toolRegistry.allTools();
      if (tools.length > 0) {
        toolSpecsJson = JSON.stringify(tools.map(t => ({ name: t.spec.name, description: t.spec.description, inputSchema: JSON.parse(t.spec.inputSchemaJson) })));
      }

      // Stream from model
      const blocks: ContentBlock[] = [];
      const toolUses: Array<{ name: string; toolUseId: string; input: string }> = [];
      let currentText = '', currentToolInput = '', currentToolName = '', currentToolId = '';
      let stopReason = 'endTurn';
      let inToolBlock = false;

      for await (const event of this.model.stream(managedJson, this.systemPrompt, toolSpecsJson)) {
        yield event; // Forward to consumer

        switch (event.type) {
          case 'modelContentBlockStartEvent':
            if (event.start?.type === 'toolUseStart') {
              inToolBlock = true;
              currentToolName = event.start.name;
              currentToolId = event.start.toolUseId;
              currentToolInput = '';
            }
            break;
          case 'modelContentBlockDeltaEvent':
            if (event.delta.type === 'textDelta') currentText += event.delta.text;
            else if (event.delta.type === 'toolUseInputDelta') currentToolInput += event.delta.input;
            break;
          case 'modelContentBlockStopEvent':
            if (inToolBlock) {
              toolUses.push({ name: currentToolName, toolUseId: currentToolId, input: currentToolInput });
              let parsedInput = {};
              try { parsedInput = JSON.parse(currentToolInput); } catch {}
              blocks.push(ContentBlock.fromToolUse(currentToolName, currentToolId, JSON.stringify(parsedInput)));
              inToolBlock = false;
            } else if (currentText) {
              blocks.push(ContentBlock.fromText(currentText));
              currentText = '';
            }
            break;
          case 'modelMessageStopEvent':
            stopReason = event.stopReason;
            if (currentText) { blocks.push(ContentBlock.fromText(currentText)); currentText = ''; }
            break;
        }
      }

      // Flush remaining
      if (currentText) blocks.push(ContentBlock.fromText(currentText));

      const assistantMsg = new AgentMessage(MessageRole.ASSISTANT, blocks);
      this._messages.push(assistantMsg);

      // If no tool use, we're done
      if (stopReason !== 'toolUse' || toolUses.length === 0) {
        if (handler) handler.onAgentEnd(assistantMsg.fullText, 0, 0);
        return;
      }

      // Execute tools
      const results: ContentBlock[] = [];
      for (const tu of toolUses) {
        const tool = this.toolRegistry.get(tu.name);
        let parsedInput = {};
        try { parsedInput = JSON.parse(tu.input); } catch {}
        const inp = JSON.stringify(parsedInput);

        yield { type: 'beforeToolCallEvent', toolUse: { name: tu.name, toolUseId: tu.toolUseId, input: parsedInput } };
        if (handler) handler.onToolStart(tu.name, inp);

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
        yield { type: 'afterToolCallEvent', toolUse: { name: tu.name, toolUseId: tu.toolUseId }, result: res, durationMs: ms };
        if (handler) handler.onToolEnd(tu.name, res, ms);
        results.push(ContentBlock.fromToolResult(tu.toolUseId, tool ? 'success' : 'error', res));
      }

      this._messages.push(new AgentMessage(MessageRole.USER, results));
      // Loop continues — model sees tool results
    }
  }

  /** Non-streaming invoke — collects stream into AgentResponse. */
  async invoke(prompt: string): Promise<AgentResponse> {
    let fullText = '', inTokens = 0, outTokens = 0, stopReason = 'end_turn';
    for await (const event of this.stream(prompt)) {
      if (event.type === 'modelContentBlockDeltaEvent' && event.delta.type === 'textDelta') fullText += event.delta.text;
      if (event.type === 'modelMetadataEvent') { inTokens += event.usage.inputTokens; outTokens += event.usage.outputTokens; }
      if (event.type === 'modelMessageStopEvent') stopReason = event.stopReason;
    }
    const msg = AgentMessage.assistantMessage(fullText);
    return new AgentResponse(msg, stopReason, [...this._messages], inTokens, outTokens);
  }

  async ask(prompt: string): Promise<AgentResponse> { return this.invoke(prompt); }
  resetConversation(): void { this._messages = []; }
  get messages(): AgentMessage[] { return [...this._messages]; }
  get toolCount(): number { return this.toolRegistry.size; }

  appendRawMessages(messagesJson: string): void {
    const rawMessages = JSON.parse(messagesJson);
    for (const raw of rawMessages) {
      const blocks: ContentBlock[] = [];
      for (const block of (raw.content ?? [])) {
        if (block.text) blocks.push(ContentBlock.fromText(block.text));
        else if (block.toolUse) blocks.push(ContentBlock.fromToolUse(block.toolUse.name, block.toolUse.toolUseId, JSON.stringify(block.toolUse.input ?? {})));
        else if (block.toolResult) blocks.push(ContentBlock.fromToolResult(block.toolResult.toolUseId, block.toolResult.status ?? 'success', JSON.stringify(block.toolResult.content?.[0]?.json ?? {})));
      }
      this._messages.push(new AgentMessage(raw.role === 'assistant' ? MessageRole.ASSISTANT : MessageRole.USER, blocks));
    }
  }

  private _formatMessagesForModel(): object[] {
    return this._messages.map(msg => {
      const content: object[] = [];
      for (const block of msg.content) {
        if (block.isText && block.asText) content.push({ text: block.asText.text });
        else if (block.isToolUse && block.asToolUse) { const tu = block.asToolUse; content.push({ toolUse: { toolUseId: tu.toolUseId, name: tu.name, input: JSON.parse(tu.inputJson) } }); }
        else if (block.isToolResult && block.asToolResult) { const tr = block.asToolResult; content.push({ toolResult: { toolUseId: tr.toolUseId, content: [{ json: JSON.parse(tr.contentJson) }], status: tr.status } }); }
        else if (block.isReasoning && block.asReasoning) { const rc = block.asReasoning; content.push({ reasoningContent: { reasoningText: { text: rc.text, ...(rc.signature ? { signature: rc.signature } : {}) } } }); }
      }
      return { role: msg.role, content };
    });
  }
}
