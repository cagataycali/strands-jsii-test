/**
 * Strands Agents SDK - jsii Multi-Language Bindings
 *
 * This module provides jsii-compatible wrappers around the Strands Agents TypeScript SDK,
 * enabling the SDK to be used from Python, Java, C#, and Go.
 *
 * jsii has specific constraints that differ from standard TypeScript:
 * - No async generators in public APIs (wrapped with Promise-based patterns)
 * - No `type` keyword exports (use `interface` or `class`)
 * - No ESM (CommonJS only)
 * - All public classes must be concrete (no bare abstract + generics in public API)
 * - Union types must be modeled as classes
 *
 * @packageDocumentation
 */

// ============================================================================
// Core Types & Enums
// ============================================================================
export { MessageRole } from './types';
export { StopReasonType } from './types';
export { ToolResultStatusType } from './types';

// ============================================================================
// Content Blocks
// ============================================================================
export { TextContent } from './content';
export { ToolUseContent } from './content';
export { ToolResultContent } from './content';
export { ContentBlock } from './content';

// ============================================================================
// Messages
// ============================================================================
export { AgentMessage } from './message';

// ============================================================================
// Tools
// ============================================================================
export { ToolSpecification } from './tools';
export { ToolDefinition } from './tools';

// ============================================================================
// Model Configuration
// ============================================================================
export { BedrockModelConfig } from './model';
export { BedrockModelProvider } from './model';

// ============================================================================
// Agent
// ============================================================================
export { AgentConfig } from './agent';
export { AgentResponse } from './agent';
export { StrandsAgent } from './agent';
