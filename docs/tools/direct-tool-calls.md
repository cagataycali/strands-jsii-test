# Direct Tool Calls

Sometimes you want to call a tool **programmatically** — not through the model, but from your code. This is useful for pre-loading context before a conversation or injecting data the model hasn't asked for.

## How It Works

When you call `agent.tool.X(...)`, the SDK:

1. Executes the tool function directly
2. Injects a **4-message sequence** into the conversation history so the model sees it as if *it* had called the tool
3. Returns the result to your code

The 4 messages are: a user request, an assistant tool_use, a user toolResult, and an assistant acknowledgment. This makes the model "aware" of the tool's output.

## Python: agent.tool.X()

```python
agent = Agent(tools=[calculator, weather])

# Pre-fill context before the model sees it
agent.tool.calculator(expression="6 * 7")
agent.tool.weather(city="Seattle")

# Now ask a question that uses both pieces of context
response = agent("Given the math result and weather, plan my day.")
```

The model's conversation history now includes the calculator result (`42`) and Seattle's weather — as if it had called those tools itself.

## TypeScript: agent.tool.X()

```typescript
const agent = Agent({ tools: [calculator, weather] });

agent.tool.calculator({ expression: "6 * 7" });
agent.tool.weather({ city: "Seattle" });

const response = agent("Given the math result and weather, plan my day.");
```

## Go, Java, C#: .toolCall()

Languages without attribute proxies use the string-based `toolCall` method:

```java
agent.toolCall("calculator", "{\"expression\": \"6 * 7\"}");
agent.toolCall("weather", "{\"city\": \"Seattle\"}");
agent.ask("Given the math result and weather, plan my day.");
```

## When to Use Direct Tool Calls

| Scenario | Why |
|----------|-----|
| **Pre-loading context** | Give the model data before it starts thinking |
| **Testing tools** | Verify a tool works correctly before letting the model use it |
| **Hybrid workflows** | Your code orchestrates some steps, the model handles others |
| **Seeding conversations** | Start a conversation with pre-computed results |

## Disabling History Injection

If you just want the result without modifying conversation history:

```python
# This injects into history (default)
agent.call_tool("calculator", '{"expression": "6 * 7"}')

# To get just the result, use the tool directly
result = calculator(expression="6 * 7")
```
