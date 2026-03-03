/**
 * Abstract base class for all model providers.
 *
 * The converse method must be synchronous (jsii requirement).
 * All providers normalize their response to Bedrock Converse format.
 */
export abstract class ModelProvider {
  /**
   * Send a conversation to the model and get a response (synchronous).
   *
   * @param messagesJson JSON string of messages array in Bedrock Converse format
   * @param systemPrompt Optional system prompt
   * @param toolSpecsJson Optional JSON string of tool specifications
   * @returns JSON string with { output, stopReason, usage } structure
   */
  public abstract converse(messagesJson: string, systemPrompt?: string, toolSpecsJson?: string): string;

  /** Get the model identifier string. */
  public abstract get modelId(): string;

  /** Get the provider name. */
  public abstract get providerName(): string;
}
