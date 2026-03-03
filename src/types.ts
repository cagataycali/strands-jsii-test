/**
 * Core type definitions for Strands Agents jsii bindings.
 *
 * jsii doesn't support TypeScript `type` aliases or string literal unions directly,
 * so we model them as enums and concrete classes.
 */

/**
 * Role of a message in a conversation.
 */
export enum MessageRole {
  /** Human input */
  USER = 'user',
  /** Model response */
  ASSISTANT = 'assistant',
}

/**
 * Reason the model stopped generating.
 */
export enum StopReasonType {
  /** Model completed its response naturally */
  END_TURN = 'endTurn',
  /** Model wants to use a tool */
  TOOL_USE = 'toolUse',
  /** Maximum token limit reached */
  MAX_TOKENS = 'maxTokens',
  /** Stop sequence encountered */
  STOP_SEQUENCE = 'stopSequence',
  /** Content was filtered */
  CONTENT_FILTERED = 'contentFiltered',
  /** Guardrail intervened */
  GUARDRAIL_INTERVENED = 'guardrailIntervened',
}

/**
 * Status of a tool execution result.
 */
export enum ToolResultStatusType {
  /** Tool executed successfully */
  SUCCESS = 'success',
  /** Tool execution encountered an error */
  ERROR = 'error',
}
