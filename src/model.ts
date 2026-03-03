/**
 * Model provider configuration and implementation for jsii bindings.
 *
 * Wraps the Strands BedrockModel with jsii-compatible interfaces.
 * The actual model invocation happens via the AWS SDK for Bedrock.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandInput,
  type ConverseCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';

/**
 * Configuration for the Bedrock model provider.
 *
 * @example
 *
 * In Python:
 * config = BedrockModelConfig(
 *     model_id="us.anthropic.claude-sonnet-4-20250514-v1:0",
 *     region="us-west-2",
 *     max_tokens=4096,
 *     temperature=0.7
 * )
 */
export class BedrockModelConfig {
  /**
   * The Bedrock model ID.
   * @default "us.anthropic.claude-sonnet-4-20250514-v1:0"
   */
  public readonly modelId: string;

  /**
   * AWS region for the Bedrock service.
   * @default "us-west-2"
   */
  public readonly region: string;

  /**
   * Maximum number of tokens to generate.
   * @default 4096
   */
  public readonly maxTokens: number;

  /**
   * Temperature for controlling randomness (0.0 - 1.0).
   * @default 0.7
   */
  public readonly temperature: number;

  /**
   * Top-P for nucleus sampling.
   * @default 0.9
   */
  public readonly topP: number;

  /**
   * Creates a new Bedrock model configuration.
   * @param modelId The model identifier
   * @param region AWS region
   * @param maxTokens Maximum tokens to generate
   * @param temperature Sampling temperature
   * @param topP Nucleus sampling parameter
   */
  public constructor(
    modelId?: string,
    region?: string,
    maxTokens?: number,
    temperature?: number,
    topP?: number,
  ) {
    this.modelId = modelId ?? 'us.anthropic.claude-sonnet-4-20250514-v1:0';
    this.region = region ?? 'us-west-2';
    this.maxTokens = maxTokens ?? 4096;
    this.temperature = temperature ?? 0.7;
    this.topP = topP ?? 0.9;
  }
}

/**
 * AWS Bedrock model provider.
 *
 * This is a jsii-compatible wrapper around the AWS Bedrock Converse API.
 * It handles creating the client, formatting requests, and parsing responses.
 *
 * @example
 *
 * In Python:
 * config = BedrockModelConfig(model_id="us.anthropic.claude-sonnet-4-20250514-v1:0")
 * provider = BedrockModelProvider(config)
 *
 * # Use with StrandsAgent
 * agent = StrandsAgent(AgentConfig(model=provider))
 */
export class BedrockModelProvider {
  /**
   * The model configuration.
   */
  public readonly config: BedrockModelConfig;

  private readonly _client: BedrockRuntimeClient;

  /**
   * Creates a new Bedrock model provider.
   * @param config Model configuration
   */
  public constructor(config?: BedrockModelConfig) {
    this.config = config ?? new BedrockModelConfig();
    this._client = new BedrockRuntimeClient({
      region: this.config.region,
      customUserAgent: 'strands-agents-jsii-sdk',
    });
  }

  /**
   * Send a conversation to the model and get a response.
   *
   * This is a synchronous-style wrapper (returns Promise) around the Bedrock Converse API.
   * jsii doesn't support async generators, so this uses the non-streaming Converse API.
   *
   * @param messagesJson JSON string of the messages array
   * @param systemPrompt Optional system prompt
   * @param toolSpecsJson Optional JSON string of tool specifications array
   * @returns JSON string of the response
   */
  public async converse(
    messagesJson: string,
    systemPrompt?: string,
    toolSpecsJson?: string,
  ): Promise<string> {
    const messages = JSON.parse(messagesJson);
    const request: ConverseCommandInput = {
      modelId: this.config.modelId,
      messages: messages,
      inferenceConfig: {
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
        topP: this.config.topP,
      },
    };

    if (systemPrompt) {
      request.system = [{ text: systemPrompt }];
    }

    if (toolSpecsJson) {
      const toolSpecs = JSON.parse(toolSpecsJson);
      request.toolConfig = {
        tools: toolSpecs.map((spec: { name: string; description: string; inputSchema: object }) => ({
          toolSpec: {
            name: spec.name,
            description: spec.description,
            inputSchema: { json: spec.inputSchema },
          },
        })),
      };
    }

    const command = new ConverseCommand(request);
    const response: ConverseCommandOutput = await this._client.send(command);

    return JSON.stringify({
      output: response.output,
      stopReason: response.stopReason,
      usage: response.usage,
    });
  }

  /**
   * Get the model ID.
   */
  public get modelId(): string {
    return this.config.modelId;
  }
}
