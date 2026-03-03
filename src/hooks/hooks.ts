/**
 * Hook system for intercepting agent lifecycle events.
 *
 * Hooks are more powerful than callbacks — they can modify behavior,
 * not just observe it.
 */

export class BeforeInvocationEvent {
  public readonly prompt: string;
  public readonly messagesJson: string;
  public cancelled: boolean;
  public constructor(prompt: string, messagesJson: string) {
    this.prompt = prompt; this.messagesJson = messagesJson; this.cancelled = false;
  }
}

export class AfterInvocationEvent {
  public readonly responseText: string;
  public readonly stopReason: string;
  public readonly inputTokens: number;
  public readonly outputTokens: number;
  public constructor(responseText: string, stopReason: string, inputTokens: number, outputTokens: number) {
    this.responseText = responseText; this.stopReason = stopReason;
    this.inputTokens = inputTokens; this.outputTokens = outputTokens;
  }
}

export class MessageAddedEvent {
  public readonly role: string;
  public readonly contentJson: string;
  public constructor(role: string, contentJson: string) {
    this.role = role; this.contentJson = contentJson;
  }
}

export class ToolStartEvent {
  public readonly toolName: string;
  public readonly inputJson: string;
  public constructor(toolName: string, inputJson: string) {
    this.toolName = toolName; this.inputJson = inputJson;
  }
}

export class ToolEndEvent {
  public readonly toolName: string;
  public readonly resultJson: string;
  public readonly durationMs: number;
  public constructor(toolName: string, resultJson: string, durationMs: number) {
    this.toolName = toolName; this.resultJson = resultJson; this.durationMs = durationMs;
  }
}

export abstract class HookProvider {
  public beforeInvocation(_event: BeforeInvocationEvent): void { /* no-op */ }
  public afterInvocation(_event: AfterInvocationEvent): void { /* no-op */ }
  public onMessageAdded(_event: MessageAddedEvent): void { /* no-op */ }
  public onToolStart(_event: ToolStartEvent): void { /* no-op */ }
  public onToolEnd(_event: ToolEndEvent): void { /* no-op */ }
}

export class HookRegistry {
  private readonly _hooks: HookProvider[];
  public constructor() { this._hooks = []; }
  public register(hook: HookProvider): void { this._hooks.push(hook); }
  public emitBeforeInvocation(hookEvent: BeforeInvocationEvent): void {
    for (const h of this._hooks) h.beforeInvocation(hookEvent);
  }
  public emitAfterInvocation(hookEvent: AfterInvocationEvent): void {
    for (const h of this._hooks) h.afterInvocation(hookEvent);
  }
  public emitMessageAdded(hookEvent: MessageAddedEvent): void {
    for (const h of this._hooks) h.onMessageAdded(hookEvent);
  }
  public emitToolStart(hookEvent: ToolStartEvent): void {
    for (const h of this._hooks) h.onToolStart(hookEvent);
  }
  public emitToolEnd(hookEvent: ToolEndEvent): void {
    for (const h of this._hooks) h.onToolEnd(hookEvent);
  }
  public get hookCount(): number { return this._hooks.length; }
}
