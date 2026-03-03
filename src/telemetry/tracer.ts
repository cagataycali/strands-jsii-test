/**
 * OpenTelemetry tracing for strands-jsii.
 * 
 * Provides span creation for agent invocations, model calls, tool executions,
 * and event loop cycles. Compatible with Langfuse and any OTLP backend.
 * 
 * Based on the Python SDK's telemetry/tracer.py implementation.
 * 
 * Since jsii requires synchronous code and concrete classes,
 * this implements the tracer as a CallbackHandler + HookProvider
 * that automatically creates spans when used with an agent.
 */

import { CallbackHandler } from '../hooks/handler';
import { HookProvider, BeforeInvocationEvent, AfterInvocationEvent, ToolStartEvent, ToolEndEvent } from '../hooks/hooks';

/**
 * Span data structure for tracing. 
 * Since jsii can't depend on the OTEL SDK directly,
 * we emit events in a standard format that can be consumed by any OTLP exporter.
 */
export class SpanData {
  public readonly spanId: string;
  public readonly traceId: string;
  public readonly parentSpanId: string;
  public readonly name: string;
  public readonly startTimeMs: number;
  public endTimeMs: number;
  public readonly attributes: Record<string, string | number | boolean>;
  public readonly events: SpanEvent[];
  public status: string;
  public errorMessage: string;

  public constructor(name: string, traceId: string, parentSpanId?: string) {
    this.spanId = _generateId(16);
    this.traceId = traceId;
    this.parentSpanId = parentSpanId ?? '';
    this.name = name;
    this.startTimeMs = Date.now();
    this.endTimeMs = 0;
    this.attributes = {};
    this.events = [];
    this.status = 'UNSET';
    this.errorMessage = '';
  }

  public setAttribute(key: string, value: string | number | boolean): void {
    this.attributes[key] = value;
  }

  public addEvent(name: string, attributesJson?: string): void {
    this.events.push(new SpanEvent(name, attributesJson));
  }

  public end(error?: string): void {
    this.endTimeMs = Date.now();
    if (error) {
      this.status = 'ERROR';
      this.errorMessage = error;
    } else {
      this.status = 'OK';
    }
  }

  public get durationMs(): number {
    return this.endTimeMs > 0 ? this.endTimeMs - this.startTimeMs : Date.now() - this.startTimeMs;
  }

  /** Export as OTLP-compatible JSON. */
  public toJson(): string {
    return JSON.stringify({
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId || undefined,
      name: this.name,
      startTimeUnixNano: this.startTimeMs * 1_000_000,
      endTimeUnixNano: this.endTimeMs * 1_000_000,
      attributes: Object.entries(this.attributes).map(([k, v]) => ({
        key: k, value: typeof v === 'string' ? { stringValue: v } : typeof v === 'number' ? { intValue: v } : { boolValue: v },
      })),
      events: this.events.map(e => e.toObject()),
      status: { code: this.status === 'ERROR' ? 2 : this.status === 'OK' ? 1 : 0, message: this.errorMessage },
    });
  }
}

export class SpanEvent {
  public readonly name: string;
  public readonly timeMs: number;
  public readonly attributesJson: string;

  public constructor(name: string, attributesJson?: string) {
    this.name = name;
    this.timeMs = Date.now();
    this.attributesJson = attributesJson ?? '{}';
  }

  public toObject(): object {
    return {
      name: this.name,
      timeUnixNano: this.timeMs * 1_000_000,
      attributes: JSON.parse(this.attributesJson),
    };
  }
}

/**
 * Span exporter interface. Implement to send spans to your backend.
 */
export abstract class SpanExporter {
  /** Export a completed span. */
  public abstract exportSpan(spanJson: string): void;
  /** Flush any buffered spans. */
  public flush(): void { /* no-op default */ }
}

/**
 * Console span exporter — prints spans to stdout.
 */
export class ConsoleSpanExporter extends SpanExporter {
  public exportSpan(spanJson: string): void {
    const span = JSON.parse(spanJson);
    const duration = (span.endTimeUnixNano - span.startTimeUnixNano) / 1_000_000;
    process.stdout.write(`[OTEL] ${span.name} (${duration.toFixed(0)}ms) trace=${span.traceId.substring(0, 8)} status=${span.status.code === 2 ? 'ERROR' : 'OK'}\n`);
  }
}

/**
 * Buffered exporter that collects spans for batch export.
 */
export class BufferedSpanExporter extends SpanExporter {
  private readonly _spans: string[];
  private readonly _maxSize: number;

  public constructor(maxSize?: number) {
    super();
    this._spans = [];
    this._maxSize = maxSize ?? 1000;
  }

  public exportSpan(spanJson: string): void {
    if (this._spans.length >= this._maxSize) this._spans.shift();
    this._spans.push(spanJson);
  }

  /** Get all collected spans as a JSON array string. */
  public get exportedSpansJson(): string {
    return '[' + this._spans.join(',') + ']';
  }

  /** Get span count. */
  public get spanCount(): number { return this._spans.length; }

  /** Clear all spans. */
  public clear(): void { this._spans.length = 0; }

  public flush(): void { /* spans are already stored */ }
}

/**
 * TracingCallbackHandler — automatically creates OTEL spans for all agent events.
 * 
 * Attach to an agent as both callbackHandler and hook provider to get full tracing.
 * 
 * @example
 * const tracer = new TracingCallbackHandler();
 * tracer.addExporter(new ConsoleSpanExporter());
 * const agent = Strands.agent({ callbackHandler: tracer, ... });
 * agent.hookRegistry.register(tracer);
 */
export class TracingCallbackHandler extends CallbackHandler {
  private readonly _exporters: SpanExporter[];
  private _currentTraceId: string;
  private _agentSpan: SpanData | undefined;
  private _modelSpan: SpanData | undefined;
  private _toolSpans: Map<string, SpanData>;
  private _cycleCount: number;
  private _totalInputTokens: number;
  private _totalOutputTokens: number;
  
  /** Service name for OTEL resource. */
  public readonly serviceName: string;

  public constructor(serviceName?: string) {
    super();
    this._exporters = [];
    this._currentTraceId = _generateId(32);
    this._toolSpans = new Map();
    this._cycleCount = 0;
    this._totalInputTokens = 0;
    this._totalOutputTokens = 0;
    this.serviceName = serviceName ?? 'strands-agents-jsii';
  }

  /** Add a span exporter. */
  public addExporter(exporter: SpanExporter): void {
    this._exporters.push(exporter);
  }

  /** Get the current trace ID. */
  public get traceId(): string { return this._currentTraceId; }

  /** Get accumulated input tokens. */
  public get totalInputTokens(): number { return this._totalInputTokens; }

  /** Get accumulated output tokens. */
  public get totalOutputTokens(): number { return this._totalOutputTokens; }

  // ── CallbackHandler overrides ────────────────────────

  public onAgentStart(prompt: string): void {
    this._currentTraceId = _generateId(32);
    this._cycleCount = 0;
    this._totalInputTokens = 0;
    this._totalOutputTokens = 0;

    this._agentSpan = new SpanData('invoke_agent', this._currentTraceId);
    this._agentSpan.setAttribute('gen_ai.operation.name', 'invoke_agent');
    this._agentSpan.setAttribute('gen_ai.system', 'strands-agents');
    this._agentSpan.setAttribute('service.name', this.serviceName);
    this._agentSpan.addEvent('gen_ai.user.message', JSON.stringify({ content: prompt.substring(0, 1000) }));
  }

  public onModelStart(messagesJson: string): void {
    this._cycleCount++;
    const parentId = this._agentSpan?.spanId;
    this._modelSpan = new SpanData('chat', this._currentTraceId, parentId);
    this._modelSpan.setAttribute('gen_ai.operation.name', 'chat');
    this._modelSpan.setAttribute('gen_ai.system', 'strands-agents');
    this._modelSpan.setAttribute('event_loop.cycle_id', this._cycleCount);

    // Count messages being sent
    try {
      const msgs = JSON.parse(messagesJson);
      this._modelSpan.setAttribute('gen_ai.request.message_count', msgs.length);
    } catch { /* ignore */ }
  }

  public onModelEnd(responseJson: string): void {
    if (!this._modelSpan) return;

    try {
      const response = JSON.parse(responseJson);
      if (response.error) {
        this._modelSpan.end(response.error);
      } else {
        const usage = response.usage ?? {};
        const inTokens = usage.inputTokens ?? 0;
        const outTokens = usage.outputTokens ?? 0;
        this._totalInputTokens += inTokens;
        this._totalOutputTokens += outTokens;

        this._modelSpan.setAttribute('gen_ai.usage.input_tokens', inTokens);
        this._modelSpan.setAttribute('gen_ai.usage.output_tokens', outTokens);
        this._modelSpan.setAttribute('gen_ai.usage.prompt_tokens', inTokens);
        this._modelSpan.setAttribute('gen_ai.usage.completion_tokens', outTokens);
        this._modelSpan.setAttribute('gen_ai.response.stop_reason', response.stopReason ?? 'unknown');
        this._modelSpan.end();
      }
    } catch {
      this._modelSpan.end();
    }

    this._export(this._modelSpan);
    this._modelSpan = undefined;
  }

  public onToolStart(toolName: string, inputJson: string): void {
    const parentId = this._agentSpan?.spanId;
    const span = new SpanData(`execute_tool ${toolName}`, this._currentTraceId, parentId);
    span.setAttribute('gen_ai.operation.name', 'execute_tool');
    span.setAttribute('gen_ai.tool.name', toolName);
    span.setAttribute('gen_ai.system', 'strands-agents');
    span.addEvent('gen_ai.tool.message', JSON.stringify({ role: 'tool', content: inputJson.substring(0, 500) }));
    this._toolSpans.set(toolName, span);
  }

  public onToolEnd(toolName: string, resultJson: string, durationMs: number): void {
    const span = this._toolSpans.get(toolName);
    if (!span) return;

    span.setAttribute('gen_ai.tool.duration_ms', durationMs);
    
    // Check for errors in result
    try {
      const result = JSON.parse(resultJson);
      if (result.error) {
        span.setAttribute('gen_ai.tool.status', 'error');
        span.end(result.error);
      } else {
        span.setAttribute('gen_ai.tool.status', 'success');
        span.end();
      }
    } catch {
      span.setAttribute('gen_ai.tool.status', 'success');
      span.end();
    }

    this._export(span);
    this._toolSpans.delete(toolName);
  }

  public onTextChunk(_text: string): void {
    // Text chunks are captured at model level, not as separate spans
  }

  public onAgentEnd(responseText: string, _inputTokens: number, _outputTokens: number): void {
    if (!this._agentSpan) return;

    this._agentSpan.setAttribute('gen_ai.usage.input_tokens', this._totalInputTokens);
    this._agentSpan.setAttribute('gen_ai.usage.output_tokens', this._totalOutputTokens);
    this._agentSpan.setAttribute('gen_ai.usage.prompt_tokens', this._totalInputTokens);
    this._agentSpan.setAttribute('gen_ai.usage.completion_tokens', this._totalOutputTokens);
    this._agentSpan.setAttribute('gen_ai.usage.total_tokens', this._totalInputTokens + this._totalOutputTokens);
    this._agentSpan.setAttribute('gen_ai.agent.cycles', this._cycleCount);
    this._agentSpan.addEvent('gen_ai.choice', JSON.stringify({
      message: responseText.substring(0, 1000),
      finish_reason: 'end_turn',
    }));
    this._agentSpan.end();
    this._export(this._agentSpan);
    this._agentSpan = undefined;

    // Flush all exporters
    for (const exp of this._exporters) exp.flush();
  }

  public onError(errorMessage: string, phase: string): void {
    if (this._agentSpan) {
      this._agentSpan.addEvent('gen_ai.error', JSON.stringify({ phase, message: errorMessage }));
    }
  }

  private _export(span: SpanData): void {
    const json = span.toJson();
    for (const exporter of this._exporters) {
      try { exporter.exportSpan(json); }
      catch { /* ignore export errors */ }
    }
  }
}

/**
 * TracingHookProvider — hook-based tracing (can be used alongside TracingCallbackHandler).
 */
export class TracingHookProvider extends HookProvider {
  private readonly _handler: TracingCallbackHandler;

  public constructor(handler: TracingCallbackHandler) {
    super();
    this._handler = handler;
    void this._handler;
  }

  public beforeInvocation(_event: BeforeInvocationEvent): void {
    // Additional hook-level tracing if needed
  }

  public afterInvocation(_event: AfterInvocationEvent): void {
    // Captured by callback handler
  }

  public onToolStart(_event: ToolStartEvent): void {
    // Captured by callback handler
  }

  public onToolEnd(_event: ToolEndEvent): void {
    // Captured by callback handler
  }
}

/** Generate a random hex ID of the given byte length. */
function _generateId(bytes: number): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < bytes; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}
