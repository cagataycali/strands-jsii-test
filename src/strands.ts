/**
 * Strands — Universal factory class for cross-language ergonomics.
 *
 * This is the single entry point that makes every language feel native.
 * jsii generates idiomatic bindings automatically:
 *
 *   Python:     Strands.agent(model=Strands.bedrock())
 *   TypeScript: Strands.agent(Strands.bedrock())
 *   Java:       Strands.agent(Strands.bedrock())       — or: import static ... Strands.*
 *   C#:         Strands.Agent(Strands.Bedrock())
 *   Go:         strands.Agent(strands.Bedrock())
 *
 * The goal: kill "Sugar.*", kill boilerplate, 2-line agents in every language.
 */

import { StrandsAgent, AgentConfig } from './agent';
import { ModelProvider } from './models/provider';
import { BedrockModelProvider, BedrockModelConfig } from './models/bedrock';
import { AnthropicModelProvider, AnthropicModelConfig, AnthropicModelConfigOptions } from './models/anthropic';
import { OpenAIModelProvider, OpenAIModelConfig, OpenAIModelConfigOptions } from './models/openai';
import { GeminiModelProvider, GeminiModelConfig, GeminiModelConfigOptions } from './models/gemini';
import { OllamaModelProvider, OllamaModelConfig, OllamaModelConfigOptions } from './models/ollama';
import { ToolDefinition } from './tools/definition';
import { FunctionTool, ToolHandler, ToolBuilder } from './tools/function-tool';
import { ConversationManager } from './conversation/manager';
import { CallbackHandler } from './hooks/handler';

/**
 * Options for creating an agent via Strands.agent().
 */
export interface QuickAgentOptions {
  /** Model provider. Default: Bedrock */
  readonly model?: ModelProvider;
  /** System prompt. */
  readonly systemPrompt?: string;
  /** Tools to register. */
  readonly tools?: ToolDefinition[];
  /** Conversation manager. */
  readonly conversationManager?: ConversationManager;
  /** Callback handler. */
  readonly callbackHandler?: CallbackHandler;
  /** Maximum agent loop cycles. Default: 50 */
  readonly maxCycles?: number;
}

export class Strands {
  private constructor() {} // static-only class

  // ── Agent Creation ──────────────────────────────────────

  /**
   * Create an agent with minimal boilerplate.
   *
   *   Python:     agent = Strands.agent()
   *   TypeScript: const agent = Strands.agent()
   *   Java:       var agent = Strands.agent();
   *   C#:         var agent = Strands.Agent();
   *   Go:         agent := strands.Agent()
   */
  public static agent(options?: QuickAgentOptions): StrandsAgent {
    return new StrandsAgent(new AgentConfig({
      model: options?.model,
      systemPrompt: options?.systemPrompt,
      tools: options?.tools,
      conversationManager: options?.conversationManager,
      callbackHandler: options?.callbackHandler,
      maxCycles: options?.maxCycles,
    }));
  }

  /**
   * Create an agent with model and tools inline.
   *
   *   Java:  var agent = Strands.agent(Strands.bedrock(), calc, shell);
   *   C#:    var agent = Strands.AgentWith(Strands.Bedrock(), calc, shell);
   */
  public static agentWith(model: ModelProvider, ...tools: ToolDefinition[]): StrandsAgent {
    return new StrandsAgent(new AgentConfig({ model, tools }));
  }

  // ── Model Providers ─────────────────────────────────────

  /**
   * Create a Bedrock model provider with defaults.
   *
   *   All languages: Strands.bedrock()
   */
  public static bedrock(modelId?: string, region?: string): BedrockModelProvider {
    return new BedrockModelProvider(new BedrockModelConfig({
      modelId: modelId,
      region: region,
    }));
  }

  /**
   * Create an Anthropic model provider with simple args.
   *
   *   All languages: Strands.anthropic("claude-sonnet-4-20250514", "sk-ant-...")
   */
  public static anthropic(modelId?: string, apiKey?: string): AnthropicModelProvider {
    return new AnthropicModelProvider(new AnthropicModelConfig({
      modelId: modelId,
      apiKey: apiKey,
    }));
  }

  /**
   * Create an Anthropic model provider with full configuration.
   *
   * Supports all Anthropic features: extended thinking, tool choice,
   * sampling params, prompt caching, images, documents, etc.
   *
   *   TypeScript: Strands.anthropicWith({ modelId: "claude-sonnet-4-20250514", maxTokens: 16000,
   *                  thinkingJson: '{"type":"enabled","budget_tokens":10000}' })
   *   Java:       Strands.anthropicWith(AnthropicModelConfigOptions.builder()
   *                  .modelId("claude-sonnet-4-20250514").maxTokens(16000).build())
   */
  public static anthropicWith(options: AnthropicModelConfigOptions): AnthropicModelProvider {
    return new AnthropicModelProvider(new AnthropicModelConfig(options));
  }

  /**
   * Create an OpenAI model provider with simple args.
   *
   *   All languages: Strands.openai("gpt-4o", "sk-...")
   */
  public static openai(modelId?: string, apiKey?: string): OpenAIModelProvider {
    return new OpenAIModelProvider(new OpenAIModelConfig({
      modelId: modelId,
      apiKey: apiKey,
    }));
  }

  /**
   * Create an OpenAI model provider with full configuration.
   *
   * Supports all OpenAI features: tool choice, reasoning content,
   * all sampling params, compatible endpoints (vLLM, Together, etc.).
   *
   *   TypeScript: Strands.openaiWith({ modelId: "gpt-4o", baseUrl: "https://api.together.xyz" })
   *   Java:       Strands.openaiWith(OpenAIModelConfigOptions.builder()
   *                  .modelId("gpt-4o").baseUrl("https://api.together.xyz").build())
   */
  public static openaiWith(options: OpenAIModelConfigOptions): OpenAIModelProvider {
    return new OpenAIModelProvider(new OpenAIModelConfig(options));
  }

  /**
   * Create a Gemini model provider with simple args.
   *
   *   All languages: Strands.gemini("gemini-2.5-flash", "AIza...")
   */
  public static gemini(modelId?: string, apiKey?: string): GeminiModelProvider {
    return new GeminiModelProvider(new GeminiModelConfig({
      modelId: modelId,
      apiKey: apiKey,
    }));
  }

  /**
   * Create a Gemini model provider with full configuration.
   *
   * Supports all Gemini features: thinking, Gemini-specific tools
   * (GoogleSearch, CodeExecution), images, documents, etc.
   *
   *   TypeScript: Strands.geminiWith({ modelId: "gemini-2.5-flash",
   *                  thinkingBudgetTokens: 10000,
   *                  geminiToolsJson: '[{"googleSearch": {}}]' })
   */
  public static geminiWith(options: GeminiModelConfigOptions): GeminiModelProvider {
    return new GeminiModelProvider(new GeminiModelConfig(options));
  }

  /**
   * Create an Ollama model provider for local inference.
   *
   *   All languages: Strands.ollama("llama3")
   *   With custom host: Strands.ollama("llama3", "http://myserver:11434")
   */
  public static ollama(modelId?: string, host?: string): OllamaModelProvider {
    return new OllamaModelProvider(new OllamaModelConfig({
      modelId: modelId,
      host: host,
    }));
  }

  /**
   * Create an Ollama model provider with full configuration.
   *
   * Supports all Ollama features: keep_alive, custom options,
   * temperature, top_p, top_k, stop sequences, etc.
   *
   *   TypeScript: Strands.ollamaWith({ modelId: "qwen3:8b", temperature: 0.7,
   *                  keepAlive: "10m", optionsJson: '{"num_ctx": 8192}' })
   */
  public static ollamaWith(options: OllamaModelConfigOptions): OllamaModelProvider {
    return new OllamaModelProvider(new OllamaModelConfig(options));
  }

  // ── Tool Creation ───────────────────────────────────────

  /**
   * Start building a tool with fluent API.
   *
   *   Java:
   *     var calc = Strands.tool("calculator", "Evaluate math")
   *         .param("expression", "string", "Math expression")
   *         .withHandler(handler)
   *         .create();
   *
   *   C#:
   *     var calc = Strands.Tool("calculator", "Evaluate math")
   *         .Param("expression", "string", "Math expression")
   *         .WithHandler(handler)
   *         .Create();
   *
   *   Go:
   *     calc := strands.Tool("calculator", "Evaluate math").
   *         Param("expression", "string", "Math expression").
   *         WithHandler(handler).
   *         Create()
   */
  public static tool(name: string, description: string, handler?: ToolHandler): ToolBuilder {
    const builder = new ToolBuilder(name, handler ?? new NoOpHandler());
    builder.description(description);
    return builder;
  }

  /**
   * Create a tool directly from name, description, schema JSON, and handler.
   *
   * For cases where you have a pre-built schema string.
   */
  public static toolDirect(name: string, description: string, inputSchemaJson: string, handler: ToolHandler): FunctionTool {
    return new FunctionTool(name, description, inputSchemaJson, handler);
  }
}

/**
 * No-op handler placeholder — replaced via ToolBuilder.setHandler().
 * @internal
 */
class NoOpHandler extends ToolHandler {
  public handle(_inputJson: string): string {
    return JSON.stringify({ error: 'No handler set. Use .setHandler(handler) on the ToolBuilder.' });
  }
}
