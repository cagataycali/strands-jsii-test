/**
 * Streaming types and interfaces for browser model providers.
 * Matches agi.diy's Strands SDK streaming event protocol.
 */

// ── Stream Event Types ──────────────────────────────────────

export interface StreamEventBase {
  readonly type: string;
}

export interface ModelMessageStartEvent extends StreamEventBase {
  readonly type: 'modelMessageStartEvent';
  readonly role: string;
}

export interface ToolUseStart {
  readonly type: 'toolUseStart';
  readonly name: string;
  readonly toolUseId: string;
}

export interface ModelContentBlockStartEvent extends StreamEventBase {
  readonly type: 'modelContentBlockStartEvent';
  readonly start?: ToolUseStart;
}

export interface TextDelta {
  readonly type: 'textDelta';
  readonly text: string;
}

export interface ToolUseInputDelta {
  readonly type: 'toolUseInputDelta';
  readonly input: string;
}

export interface ModelContentBlockDeltaEvent extends StreamEventBase {
  readonly type: 'modelContentBlockDeltaEvent';
  readonly delta: TextDelta | ToolUseInputDelta;
}

export interface ModelContentBlockStopEvent extends StreamEventBase {
  readonly type: 'modelContentBlockStopEvent';
}

export interface ModelMessageStopEvent extends StreamEventBase {
  readonly type: 'modelMessageStopEvent';
  readonly stopReason: string;
}

export interface ModelMetadataEvent extends StreamEventBase {
  readonly type: 'modelMetadataEvent';
  readonly usage: { inputTokens: number; outputTokens: number };
}

// Tool lifecycle events (emitted by agent loop)
export interface BeforeToolCallEvent extends StreamEventBase {
  readonly type: 'beforeToolCallEvent';
  readonly toolUse: { name: string; toolUseId: string; input: unknown };
}

export interface AfterToolCallEvent extends StreamEventBase {
  readonly type: 'afterToolCallEvent';
  readonly toolUse: { name: string; toolUseId: string };
  readonly result: string;
  readonly durationMs: number;
}

export type StreamEvent =
  | ModelMessageStartEvent
  | ModelContentBlockStartEvent
  | ModelContentBlockDeltaEvent
  | ModelContentBlockStopEvent
  | ModelMessageStopEvent
  | ModelMetadataEvent
  | BeforeToolCallEvent
  | AfterToolCallEvent;

// ── Streaming Model Provider ────────────────────────────────

export abstract class StreamingModelProvider {
  /** Stream model responses as async generator — the browser-native way. */
  abstract stream(
    messagesJson: string,
    systemPrompt?: string,
    toolSpecsJson?: string,
  ): AsyncGenerator<StreamEvent>;

  abstract get modelId(): string;
  abstract get providerName(): string;

  /**
   * Non-streaming fallback — collects all stream events into a single response.
   * Compatible with WebAgent's existing converse() interface.
   */
  async converse(messagesJson: string, systemPrompt?: string, toolSpecsJson?: string): Promise<string> {
    const content: any[] = [];
    let stopReason = 'end_turn';
    let usage = { inputTokens: 0, outputTokens: 0 };
    let currentText = '';
    let currentToolUse: { name: string; toolUseId: string; input: string } | null = null;

    for await (const event of this.stream(messagesJson, systemPrompt, toolSpecsJson)) {
      switch (event.type) {
        case 'modelContentBlockStartEvent':
          if (event.start?.type === 'toolUseStart') {
            currentToolUse = { name: event.start.name, toolUseId: event.start.toolUseId, input: '' };
          }
          break;
        case 'modelContentBlockDeltaEvent':
          if (event.delta.type === 'textDelta') {
            currentText += event.delta.text;
          } else if (event.delta.type === 'toolUseInputDelta' && currentToolUse) {
            currentToolUse.input += event.delta.input;
          }
          break;
        case 'modelContentBlockStopEvent':
          if (currentToolUse) {
            let parsedInput = {};
            try { parsedInput = JSON.parse(currentToolUse.input); } catch {}
            content.push({ toolUse: { name: currentToolUse.name, toolUseId: currentToolUse.toolUseId, input: parsedInput } });
            currentToolUse = null;
          } else if (currentText) {
            content.push({ text: currentText });
            currentText = '';
          }
          break;
        case 'modelMessageStopEvent':
          stopReason = event.stopReason;
          // Flush any remaining text
          if (currentText) { content.push({ text: currentText }); currentText = ''; }
          break;
        case 'modelMetadataEvent':
          usage = event.usage;
          break;
      }
    }

    // Flush remaining
    if (currentText) content.push({ text: currentText });
    if (currentToolUse) {
      let parsedInput = {};
      try { parsedInput = JSON.parse(currentToolUse.input); } catch {}
      content.push({ toolUse: { name: currentToolUse.name, toolUseId: currentToolUse.toolUseId, input: parsedInput } });
    }

    return JSON.stringify({
      output: { message: { role: 'assistant', content } },
      stopReason,
      usage,
    });
  }
}
