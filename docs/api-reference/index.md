# API Reference

Complete reference for every class, method, and parameter in the SDK.

---

## StrandsAgent

The core agent class. Created via `Agent()` (Python sugar), `Strands.agent()`, or `new StrandsAgent(config)`.

### Creation

=== "Python (sugar)"
    ```python
    from strands_jsii import Agent, Bedrock

    agent = Agent(
        model=Bedrock(),
        tools=[calc, weather],
        system_prompt="You are helpful.",
        max_cycles=10,
        conversation_manager=SlidingWindowConversationManager(20),
        callback_handler=PrintingCallbackHandler(),
    )
    ```

=== "jsii-native (all languages)"
    ```java
    var agent = Strands.agent(new QuickAgentOptions() {{
        model = Strands.bedrock();
        tools = List.of(calc, weather);
        systemPrompt = "You are helpful.";
        maxCycles = 10;
    }});

    // Or shorthand
    var agent = Strands.agentWith(Strands.bedrock(), calc, weather);
    ```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `invoke(prompt)` / `ask(prompt)` | `AgentResponse` | Run the agent loop with a prompt |
| `callTool(name, inputJson)` | `DirectToolCallResult` | Call a tool directly, inject 4-message context |
| `toolCall(name, inputJson)` | `string` | Call a tool, return result JSON only |
| `resetConversation()` | void | Clear all message history |
| `appendRawMessages(json)` | void | Append Bedrock Converse-format messages |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `messages` | `AgentMessage[]` | Current conversation history (copy) |
| `systemPrompt` | `string` | The system prompt |
| `model` | `ModelProvider` | The model provider |
| `toolCount` | `number` | Number of registered tools |
| `toolNames` | `string` | JSON array of tool names |
| `maxCycles` | `number` | Maximum agent loop cycles |
| `toolRegistry` | `ToolRegistry` | Tool registry |
| `hookRegistry` | `HookRegistry` | Hook registry |

### AgentConfig Options

| Option | Type | Default |
|--------|------|---------|
| `model` | `ModelProvider` | `BedrockModelProvider` |
| `systemPrompt` | `string` | `"You are a helpful AI assistant."` |
| `tools` | `ToolDefinition[]` | `[]` |
| `conversationManager` | `ConversationManager` | `NullConversationManager` |
| `callbackHandler` | `CallbackHandler` | `undefined` |
| `recordDirectToolCall` | `boolean` | `true` |
| `maxCycles` | `number` | `50` |

---

## Strands (Universal Factory)

Static factory class — works identically in all five languages via jsii.

| Method | Returns |
|--------|---------|
| `Strands.agent(options?)` | `StrandsAgent` |
| `Strands.agentWith(model, ...tools)` | `StrandsAgent` |
| `Strands.bedrock(modelId?, region?)` | `BedrockModelProvider` |
| `Strands.anthropic(modelId?, apiKey?)` | `AnthropicModelProvider` |
| `Strands.openai(modelId?, apiKey?)` | `OpenAIModelProvider` |
| `Strands.gemini(modelId?, apiKey?)` | `GeminiModelProvider` |
| `Strands.tool(name, desc, handler?)` | `ToolBuilder` |
| `Strands.toolDirect(name, desc, schema, handler)` | `FunctionTool` |

---

## AgentResponse

| Property | Type | Description |
|----------|------|-------------|
| `message` | `AgentMessage` | The assistant's response message |
| `text` | `string` | Shorthand for `message.fullText` |
| `stopReason` | `string` | `"end_turn"`, `"tool_use"`, `"max_tokens"`, `"maxCycles"` |
| `messages` | `AgentMessage[]` | Full conversation history |
| `inputTokens` | `number` | Input tokens consumed |
| `outputTokens` | `number` | Tokens generated |
| `totalTokens` | `number` | `inputTokens + outputTokens` |

---

## Tools

### @tool (Python)

```python
@tool
def my_tool(param: str) -> str:
    """Tool description."""
    return "result"

@tool(name="custom_name", description="Custom description")
def another(x: int, y: int = 0) -> str:
    return str(x + y)
```

Supported types: `str`, `int`, `float`, `bool`, `list`, `dict`, `Optional[X]`.

### tool() (TypeScript)

```typescript
const calc = tool(function calc({ expression }) {
    return { result: eval(expression) };
}, { description: "Evaluate math" });
```

### NewTool (Go)

```go
calc := NewTool("calculator", "Evaluate math", fn, map[string]ParamDef{
    "expression": {Type: "string", Description: "Math expression", Required: true},
})
```

### Sugar.toolOf() (Java) / Sugar.ToolOf() (C#)

```java
var tool = Sugar.toolOf("name", "description", params -> result,
    Sugar.param("name", "type", "description", required));
```

### FunctionTool (all languages)

```python
FunctionTool(name, description, input_schema_json, handler)
```

### ToolHandler (abstract)

Implement `handle(inputJson: string) -> string`.

### ToolBuilder (all languages)

```
Strands.tool(name, desc).param(name, type, desc).withHandler(h).create()
```

Methods: `param`, `addStringParam`, `addNumberParam`, `addBooleanParam`, `addArrayParam`, `addObjectParam`, `description`, `withHandler`, `create`.

### AgentTool

```python
AgentTool(name, description, inner_agent)
```

Wraps an agent as a tool with a single `prompt` parameter.

### ToolRegistry

| Method | Returns |
|--------|---------|
| `add(tool)` | void |
| `remove(name)` | `boolean` |
| `has(name)` | `boolean` |
| `get(name)` | `ToolDefinition` |
| `allTools()` | `ToolDefinition[]` |
| `listNames()` | `string` (JSON array) |
| `size` | `number` |
| `clear()` | void |
| `addAll(tools)` | void |

### ToolWatcher

```python
watcher = ToolWatcher(registry, directory="./tools", poll_interval_ms=2000)
watcher.start()
watcher.stop()
watcher.scan()
```

### UniversalToolFactory

```python
tool = UniversalToolFactory.create("lib", "description", handler)
spec = UniversalToolFactory.create_spec("lib", "description")
schema = UniversalToolFactory.schema  # JSON string
```

### ContextAwareToolDefinition

Extends `ToolDefinition`. Implement `executeWithContext(inputJson, context)` for tools needing agent state via `ToolContext`.

---

## Model Providers

### BedrockModelProvider

| Option | Default |
|--------|---------|
| `modelId` | `us.anthropic.claude-sonnet-4-20250514-v1:0` |
| `region` | `us-west-2` |
| `maxTokens` | `4096` |
| `temperature` | `0.7` |
| `topP` | `0.9` |
| `streaming` | `true` |
| `guardrail` | `undefined` |

### AnthropicModelProvider

| Option | Default |
|--------|---------|
| `modelId` | `claude-sonnet-4-20250514` |
| `apiKey` | `ANTHROPIC_API_KEY` env |
| `maxTokens` | `4096` |
| `temperature` | `0.7` |
| `baseUrl` | `https://api.anthropic.com` |

### OpenAIModelProvider

| Option | Default |
|--------|---------|
| `modelId` | `gpt-4o` |
| `apiKey` | `OPENAI_API_KEY` env |
| `maxTokens` | `4096` |
| `temperature` | `0.7` |
| `baseUrl` | `https://api.openai.com` |

### GeminiModelProvider

| Option | Default |
|--------|---------|
| `modelId` | `gemini-2.5-flash` |
| `apiKey` | `GOOGLE_API_KEY` / `GEMINI_API_KEY` env |
| `maxTokens` | `4096` |
| `temperature` | `0.7` |

### ModelProvider (abstract)

| Method | Returns |
|--------|---------|
| `converse(messagesJson, systemPrompt?, toolSpecsJson?)` | `string` (JSON) |
| `modelId` | `string` |
| `providerName` | `string` |

---

## Conversation Managers

| Class | Behavior |
|-------|----------|
| `NullConversationManager()` | Keep all messages (default) |
| `SlidingWindowConversationManager(windowSize)` | Keep first + last N |
| `SummarizingConversationManager(config)` | Summarize old messages |

### SummarizingConversationManager Config

| Option | Default |
|--------|---------|
| `summaryRatio` | `0.3` |
| `preserveRecentMessages` | `10` |
| `maxMessages` | `40` |
| `summarizationPrompt` | `"Summarize the conversation concisely."` |

---

## Callbacks & Hooks

### CallbackHandler Methods

`onAgentStart(prompt)`, `onAgentEnd(responseText, inputTokens, outputTokens)`, `onModelStart(messagesJson)`, `onModelEnd(responseJson)`, `onToolStart(toolName, inputJson)`, `onToolEnd(toolName, resultJson, durationMs)`, `onTextChunk(text)`, `onError(errorMessage, phase)`.

### HookProvider Methods

`beforeInvocation(event)` (can set `event.cancelled = true`), `afterInvocation(event)`, `onMessageAdded(event)`, `onToolStart(event)`, `onToolEnd(event)`.

### HookRegistry

`register(hook)`, `hookCount`.

---

## Errors

| Class | Key Fields |
|-------|-----------|
| `AgentError` | `message`, `phase`, `originalError` |
| `MaxTokensReachedError` | — |
| `ContextWindowOverflowError` | — |
| `ModelThrottledError` | — |
| `ToolExecutionError` | `toolName` |
| `MaxCyclesReachedError` | `cycles` |
| `GuardrailInterventionError` | — |

### ErrorClassifier

`ErrorClassifier.classify(responseJson)` → `AgentError` or `None`

### RetryStrategy

```python
RetryStrategy(max_attempts=3, initial_delay=1.0, max_delay=30.0, backoff_multiplier=2.0)
```

Methods: `converse_with_retry(provider, messagesJson, systemPrompt, toolSpecsJson)`, `RetryStrategy.is_retryable_error(responseJson)`.

---

## GuardrailConfig

```python
GuardrailConfig(guardrail_id, guardrail_version, trace="enabled", stream_processing_mode="")
```

## Identifier

```python
Identifier.generate()           # "strands-lx1234-abc123"
Identifier.generate("custom")   # "custom-lx1234-abc123"
```

---

## Sugar Summary

### jsii-native (all languages, no patches)

`Strands.agent()`, `Strands.agentWith()`, `Strands.bedrock()`, `Strands.anthropic()`, `Strands.openai()`, `Strands.gemini()`, `Strands.tool()`, `.ask()`, `.toolCall()`, all error classes, conversation managers, hooks, callbacks.

### Language-specific patches

| Sugar | Language | Equivalent |
|-------|----------|-----------|
| `Agent(**kw)` / `agent("prompt")` | Python | `StrandsAgent(AgentConfig(**kw))` / `.invoke()` |
| `@tool` | Python | `FunctionTool(name, desc, schema, handler)` |
| `agent.tool.X()` | Python, TS | `agent.callTool("X", json)` |
| `Bedrock(**kw)` | Python, TS | `BedrockModelProvider(BedrockModelConfig(**kw))` |
| `make_use_tool("lib")` | Python, TS | `UniversalToolFactory.create(...)` |
| `tool(fn)` | TypeScript | `FunctionTool(...)` |
| `NewAgent(opts...)` | Go | `Strands_Agent(options)` |
| `NewTool(fn, params)` | Go | `NewFunctionTool(...)` |
| `Sugar.toolOf(lambda)` | Java | `FunctionTool(...)` |
| `@ToolMethod` | Java | `FunctionTool(...)` via reflection |
| `Sugar.ToolOf(delegate)` | C# | `FunctionTool(...)` |
