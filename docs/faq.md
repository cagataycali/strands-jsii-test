# FAQ

## General

### What is jsii?

[jsii](https://github.com/aws/jsii) is a tool created by AWS that compiles TypeScript into native bindings for Python, Java, C#, and Go. It's the same technology behind the AWS CDK. We write the agent framework once in TypeScript, and jsii generates the multi-language packages.

### Why do I need Node.js even for Python/Java/Go/C#?

The jsii runtime uses Node.js under the hood to execute the TypeScript code. Your language's bindings call into this runtime. It's a dependency, but you don't interact with it directly.

### Is this a wrapper around the Python Strands SDK?

No. This is a **reimplementation** of the agent loop in TypeScript, designed from the start for cross-language use via jsii. It follows the same concepts (agent loop, tools, model providers) but is a separate codebase.

### What's the difference between the jsii-native API and the sugar API?

The **jsii-native** API (`Strands.agent()`, `Strands.tool()`, etc.) is generated directly by jsii and works identically in all five languages. The **sugar** API (`@tool`, `Agent()`, `agent("prompt")`) is language-specific convenience added by post-build patches. Sugar is optional — the jsii-native API always works.

---

## Installation & Setup

### I get "Module not found" errors

Make sure Node.js 20+ is installed:

```bash
node --version  # Should be v20.x or higher
```

The jsii runtime requires it even if you're using Python, Java, Go, or C#.

### AWS credentials aren't working

Check your credentials:

```bash
aws sts get-caller-identity
```

If that fails, reconfigure:

```bash
aws configure
```

Make sure your region has Bedrock access and the model you're using is enabled in the Bedrock console.

### Can I use this without AWS?

Yes. Use any of the other four providers:

```python
from strands_jsii import Agent, Anthropic, OpenAI, Gemini

agent = Agent(model=Anthropic(api_key="sk-ant-..."))
agent = Agent(model=OpenAI(api_key="sk-..."))
agent = Agent(model=Gemini(api_key="AIza..."))
agent = Agent(model=Ollama())  # Local, no API key needed```

---

## Tools

### My @tool function isn't being called

Common causes:

1. **Missing docstring** — The model uses the description to decide when to call the tool. No description = the model doesn't know what it does.
2. **Vague description** — "Do stuff" doesn't help the model. Be specific: "Execute a shell command and return stdout."
3. **Type hints missing** — Without type hints, the SDK can't generate the JSON Schema.

### Can I use async tools?

jsii methods must be synchronous. If your tool needs to do async work, wrap it with synchronous calls (e.g., `asyncio.run()` in Python, `execSync` in JS).

### How do I make a tool parameter optional?

In Python, use `Optional` or a default value:

```python
@tool
def search(query: str, max_results: int = 5) -> str:
    """Search the web."""
    return f"Results for {query}"
```

The `max_results` parameter becomes non-required in the JSON Schema.

### Can I have tools call other tools?

Not directly — tools are independent functions. But you can:

1. Have one tool call another tool's underlying function
2. Use multi-agent patterns where each agent has different tools

---

## Model Providers

### Which provider should I use?

| Situation | Recommendation |
|-----------|---------------|
| Production, AWS account | **Bedrock** — no API keys to manage, integrated with AWS |
| Quick prototyping | **Anthropic** or **OpenAI** — just an API key |
| Google Cloud shop | **Gemini** |
| Self-hosted model | **Custom provider** — extend `ModelProvider` |

### Why does the SDK use `execSync` and `curl` for API calls?

jsii requires all methods to be synchronous. The SDK uses `execSync` to run child processes that handle the async HTTP calls. This is an implementation detail — you don't need to worry about it.

### Can I use different models for different agents?

Yes! Each agent has its own model provider:

```python
fast_agent = Agent(
    model=Bedrock(model_id="us.anthropic.claude-haiku-3-20250307-v1:0"),
    system_prompt="You handle simple tasks.",
)

smart_agent = Agent(
    model=Bedrock(model_id="us.anthropic.claude-sonnet-4-20250514-v1:0"),
    system_prompt="You handle complex tasks.",
)
```

---

## Multi-Agent

### How does the coordinator decide which agent to call?

The coordinator's model makes this decision based on:

1. The **tool descriptions** you provide in `AgentTool("name", "description", agent)`
2. The **system prompt** you give the coordinator
3. The **content of the user's request**

Write clear, distinct descriptions for each sub-agent so the model can route effectively.

### Can sub-agents talk to each other?

Not directly. Communication goes through the coordinator: User → Coordinator → Sub-agent A → Coordinator → Sub-agent B → Coordinator → User. The coordinator is the hub.

### How deep can I nest agents?

There's no hard limit, but each level adds latency (a full model call per level). Two levels (coordinator → specialists) is the sweet spot for most use cases.

---

## Performance & Limits

### How many tools can I give an agent?

Technically, as many as you want. Practically, more tools = more tokens in the system prompt = higher cost and potentially slower responses. 10-20 tools is comfortable. 50+ tools might degrade quality as the model has too many options.

### My agent is looping too many times

Set `maxCycles` to a reasonable limit:

```python
agent = Agent(max_cycles=10)  # Default is 50
```

Also check if your tools are returning useful results — the model loops when it doesn't have enough information to answer.

### The conversation is getting too long

Use a conversation manager:

```python
from strands_jsii import SlidingWindowConversationManager

agent = Agent(conversation_manager=SlidingWindowConversationManager(window_size=20))
```

Or reset between tasks:

```python
agent.reset_conversation()
```

---

## Troubleshooting

### "ContextWindowOverflowError"

Your conversation history is too large for the model's context window. Solutions:

1. Add a `SlidingWindowConversationManager` or `SummarizingConversationManager`
2. Call `agent.reset_conversation()` between independent tasks
3. Use a model with a larger context window

### "ModelThrottledError"

You're hitting rate limits. Add a retry strategy:

```python
from strands_jsii import RetryStrategy

agent = Agent(retry_strategy=RetryStrategy(max_attempts=3, initial_delay=1.0, backoff_multiplier=2.0))
```

### "MaxCyclesReachedError"

The agent ran for too many iterations without finishing. Either:

1. Increase `maxCycles` if the task genuinely needs more iterations
2. Simplify the task
3. Check your tools — unclear tool outputs cause unnecessary loops

### Tools work in Python but not in other languages

Make sure you're using the jsii-native API (`Strands.tool().param().create()`) for cross-language tools. Language-specific sugar (`@tool`, `tool()`, `NewTool()`) only works in its target language.
