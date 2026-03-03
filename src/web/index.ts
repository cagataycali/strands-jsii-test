/**
 * strands-jsii/web — Full browser-compatible agent SDK.
 * 
 * Zero Node.js dependencies. Pure fetch(). 
 * Works in browsers, service workers, Deno, Bun, Cloudflare Workers.
 *
 * Architecture:
 * ┌─ Streaming agents (P0) ─────────────────────────────┐
 * │  StreamingWebAgent + 4 streaming model providers     │
 * ├─ Browser tools (P0) ────────────────────────────────┤
 * │  render_ui, create_tool, js_eval, storage, notify    │
 * ├─ Agent mesh (P1) ───────────────────────────────────┤
 * │  BroadcastChannel + WebSocket relay + ring context   │
 * ├─ Core types (reused from jsii) ─────────────────────┤
 * │  ContentBlock, ToolRegistry, Hooks, Errors, etc.     │
 * └─────────────────────────────────────────────────────┘
 */

// ══════════════════════════════════════════════════════════
// STREAMING (Primary API)
// ══════════════════════════════════════════════════════════
export { StreamingWebAgent } from './agent.stream';
export type { StreamingWebAgentOptions } from './agent.stream';
export { StreamingModelProvider } from './streaming';
export type { StreamEvent, StreamEventBase, ModelMessageStartEvent, ModelContentBlockStartEvent, ModelContentBlockDeltaEvent, ModelContentBlockStopEvent, ModelMessageStopEvent, ModelMetadataEvent, BeforeToolCallEvent, AfterToolCallEvent, TextDelta, ToolUseInputDelta, ToolUseStart } from './streaming';

// Streaming providers
export { StreamAnthropicProvider } from './anthropic.stream';
export type { StreamAnthropicOptions } from './anthropic.stream';
export { StreamOpenAIProvider } from './openai.stream';
export type { StreamOpenAIOptions } from './openai.stream';
export { StreamGeminiProvider } from './gemini.stream';
export type { StreamGeminiOptions } from './gemini.stream';

// ══════════════════════════════════════════════════════════
// NON-STREAMING (Backward compat / simple use cases)
// ══════════════════════════════════════════════════════════
export { WebAgent } from './agent.web';
export type { WebAgentOptions } from './agent.web';
export { AsyncModelProvider } from './provider';
export { WebAnthropicProvider } from './anthropic.web';
export type { WebAnthropicOptions } from './anthropic.web';
export { WebOpenAIProvider } from './openai.web';
export type { WebOpenAIOptions } from './openai.web';
export { WebGeminiProvider } from './gemini.web';
export type { WebGeminiOptions } from './gemini.web';

// ══════════════════════════════════════════════════════════
// BROWSER-NATIVE TOOLS (agi.diy parity)
// ══════════════════════════════════════════════════════════
export { renderUiTool, jsEvalTool, storageGetTool, storageSetTool, fetchUrlTool, notifyTool, createCreateToolTool, createListToolsTool, createDeleteToolTool, createUpdateSelfTool, loadCustomTools, getAllBrowserTools } from './tools.browser';

// ══════════════════════════════════════════════════════════
// AGENT MESH (Cross-tab + Cross-device)
// ══════════════════════════════════════════════════════════
export { AgentMesh } from './mesh';
export type { MeshAgent, RingEntry, MeshMessage, MeshCredentials, MeshEventHandler, MeshEvent } from './mesh';
export { createInvokeAgentTool, createBroadcastTool, createListAgentsTool, createGetRingTool, getAllMeshTools } from './tools.mesh';

// ══════════════════════════════════════════════════════════
// CORE TYPES (reused from jsii — already browser-safe)
// ══════════════════════════════════════════════════════════
export { MessageRole, StopReason, ToolResultStatus } from '../types/enums';
export { TextContent, ToolUseContent, ToolResultContent, ReasoningContent, ContentBlock } from '../types/content';
export { AgentMessage } from '../types/message';
export { AgentResponse } from '../types/response';
export { AgentError, MaxTokensReachedError, ContextWindowOverflowError, ModelThrottledError, ToolExecutionError, MaxCyclesReachedError, GuardrailInterventionError } from '../errors/base';
export { ErrorClassifier } from '../errors/classifier';
export { ToolSpecification, ToolDefinition, ContextAwareToolDefinition, ToolContext } from '../tools/definition';
export { ToolRegistry } from '../tools/registry';
export { ToolHandler, FunctionTool, ToolBuilder } from '../tools/function-tool';
export { ToolCaller, DirectToolCallResult, MessageAppender } from '../tools/caller';
export { AgentTool } from '../tools/agent-tool';
export { UniversalToolFactory } from '../tools/universal-factory';
export { ConversationManager } from '../conversation/manager';
export { NullConversationManager } from '../conversation/null';
export { SlidingWindowConversationManager } from '../conversation/sliding-window';
export { SummarizingConversationManager } from '../conversation/summarizing';
export { CallbackHandler } from '../hooks/handler';
export { HookProvider, HookRegistry, BeforeInvocationEvent, AfterInvocationEvent, MessageAddedEvent, ToolStartEvent, ToolEndEvent } from '../hooks/hooks';
export { Identifier } from '../utils/identifier';

// ══════════════════════════════════════════════════════════
// UNIVERSAL PROVIDER (define once, run everywhere)
// ══════════════════════════════════════════════════════════
export { UniversalProvider, createProvider } from './providers/engine';
export type { ProviderConfig } from './providers/protocol';
export { BUILDERS, PARSERS } from './providers/definitions';
export type { BodyBuilder, ResponseParser } from './providers/definitions';

// ══════════════════════════════════════════════════════════
// SHARED FORMAT DEFINITIONS (usable by both jsii and browser)
// ══════════════════════════════════════════════════════════
export { REQUEST_BUILDERS, RESPONSE_PARSERS, SSE_PARSERS, DEFAULTS } from '../providers/formats';
export type { ProviderRequest, ProviderDefaults, StreamChunk } from '../providers/formats';

// ══════════════════════════════════════════════════════════
// MULTI-AGENT TOOLS (use_agent, scheduler, pub/sub)
// ══════════════════════════════════════════════════════════
export { useAgentTool, schedulerTool, subscribeTopicTool, publishTopicTool, getAllAgentTools } from './tools.agents';

// ══════════════════════════════════════════════════════════
// SENSORY TOOLS (vision, context, bluetooth)
// ══════════════════════════════════════════════════════════
export { captureImageTool, readFileTool, getUserContextTool, setContextTool, enableContextTrackingTool, scanBluetoothTool, getDynamicContext, getAllSensoryTools } from './tools.sensory';

// ══════════════════════════════════════════════════════════
// SERVICE WORKER / PWA
// ══════════════════════════════════════════════════════════
export { generateServiceWorker, registerServiceWorker, generateManifest } from './sw';
