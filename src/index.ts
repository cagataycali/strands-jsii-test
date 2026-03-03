/**
 * Strands Agents SDK - jsii Multi-Language Bindings
 *
 * Write once in TypeScript, use from Python, Java, C#, and Go.
 *
 * @example
 *
 * In Python:
 * from strands_jsii import Agent
 * agent = Agent()
 * response = agent("Hello!")
 *
 * @packageDocumentation
 */

// ── Types & Enums ──
export { MessageRole, StopReason, ToolResultStatus } from './types/enums';
export { TextContent, ToolUseContent, ToolResultContent, ReasoningContent, ContentBlock } from './types/content';
export { AgentMessage } from './types/message';
export { AgentResponse } from './types/response';

// ── Errors ──
export { AgentError, MaxTokensReachedError, ContextWindowOverflowError, ModelThrottledError } from './errors/base';
export { ToolExecutionError, MaxCyclesReachedError, GuardrailInterventionError } from './errors/base';
export { ErrorClassifier } from './errors/classifier';
export { RetryStrategy } from './errors/retry';

// ── Model Providers ──
export { ModelProvider } from './models/provider';
export { BedrockModelConfig, BedrockModelConfigOptions, BedrockModelProvider } from './models/bedrock';
export { AnthropicModelConfig, AnthropicModelConfigOptions, AnthropicModelProvider, AnthropicToolChoice } from './models/anthropic';
export { OpenAIModelConfig, OpenAIModelConfigOptions, OpenAIModelProvider, OpenAIToolChoice } from './models/openai';
export { OllamaModelConfig, OllamaModelConfigOptions, OllamaModelProvider } from './models/ollama';
export { GeminiModelConfig, GeminiModelConfigOptions, GeminiModelProvider } from './models/gemini';

// ── Tools ──
export { ToolSpecification, ToolDefinition, ContextAwareToolDefinition, ToolContext } from './tools/definition';
export { ToolRegistry } from './tools/registry';
export { AgentTool } from './tools/agent-tool';
export { ToolHandler, FunctionTool, ToolBuilder } from './tools/function-tool';
export { ToolCaller, DirectToolCallResult, MessageAppender } from './tools/caller';
export { ToolWatcher, ToolWatcherOptions } from './tools/watcher';

// ── Tool Factories ──
export { UniversalToolFactory } from './tools/universal-factory';

// ── Conversation Management ──
export { ConversationManager } from './conversation/manager';
export { NullConversationManager } from './conversation/null';
export { SlidingWindowConversationManager } from './conversation/sliding-window';
export { SummarizingConversationManager, SummarizingConversationManagerConfig } from './conversation/summarizing';

// ── Callbacks & Hooks ──
export { CallbackHandler } from './hooks/handler';
export { PrintingCallbackHandler } from './hooks/printing';
export { HookProvider, HookRegistry } from './hooks/hooks';
export { BeforeInvocationEvent, AfterInvocationEvent, MessageAddedEvent, ToolStartEvent, ToolEndEvent } from './hooks/hooks';

// ── Safety ──
export { GuardrailConfig } from './safety/guardrails';

// ── Utilities ──
export { Identifier } from './utils/identifier';

// ── Agent (the star of the show) ──
export { AgentConfig, AgentConfigOptions, StrandsAgent } from './agent';

// ── Telemetry & Tracing ──
export { SpanData, SpanEvent, SpanExporter, ConsoleSpanExporter, BufferedSpanExporter, TracingCallbackHandler, TracingHookProvider } from './telemetry/tracer';

// ── Universal Factory (the DX equalizer) ──
export { Strands, QuickAgentOptions } from './strands';
