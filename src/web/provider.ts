/**
 * AsyncModelProvider — browser-compatible abstract base.
 * 
 * The jsii version uses sync execSync+curl.
 * The browser version uses async fetch().
 * Same interface shape, just async.
 */
export abstract class AsyncModelProvider {
  public abstract converse(
    messagesJson: string,
    systemPrompt?: string,
    toolSpecsJson?: string,
  ): Promise<string>;

  public abstract get modelId(): string;
  public abstract get providerName(): string;
}
