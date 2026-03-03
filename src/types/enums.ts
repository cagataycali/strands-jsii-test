export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
}
export enum StopReason {
  END_TURN = 'end_turn',
  TOOL_USE = 'tool_use',
  MAX_TOKENS = 'max_tokens',
  STOP_SEQUENCE = 'stop_sequence',
  CONTENT_FILTERED = 'content_filtered',
  GUARDRAIL_INTERVENED = 'guardrail_intervened',
}
export enum ToolResultStatus {
  SUCCESS = 'success',
  ERROR = 'error',
}
