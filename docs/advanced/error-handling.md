# Error Handling

The SDK provides six typed error classes so you can handle specific failure modes, plus a retry strategy for transient errors.

## Error Types

| Error | When | What to do |
|-------|------|-----------|
| `ModelThrottledError` | Rate limited by the model provider | Wait and retry (automatic with `RetryStrategy`) |
| `MaxTokensReachedError` | Model hit its generation token limit | Increase `maxTokens` or break the task into smaller parts |
| `ContextWindowOverflowError` | Input messages exceed the context window | Use a `ConversationManager` to trim messages |
| `ToolExecutionError` | A tool raised an exception | Fix the tool, check inputs, or add error handling in the tool |
| `MaxCyclesReachedError` | Agent loop exceeded `maxCycles` | Increase `maxCycles` or simplify the task |
| `GuardrailInterventionError` | Bedrock Guardrail blocked the request | Review guardrail configuration or rephrase the request |

All errors extend `AgentError`, which has `message`, `phase`, and `originalError` fields.

## Catching Errors

```python
from strands_jsii import (
    Agent,
    ModelThrottledError,
    ContextWindowOverflowError,
    ToolExecutionError,
    MaxCyclesReachedError,
)

agent = Agent(tools=[my_tool])

try:
    response = agent("Do something complex")
except ModelThrottledError:
    print("Rate limited — try again in a moment")
except ContextWindowOverflowError:
    print("Too much conversation history — reset or use a conversation manager")
    agent.reset_conversation()
except ToolExecutionError as e:
    print(f"Tool '{e.tool_name}' failed: {e.message}")
except MaxCyclesReachedError as e:
    print(f"Agent hit {e.cycles} cycles without finishing")
```

## Retry Strategy

For transient errors (rate limiting, network blips), use `RetryStrategy`:

```python
from strands_jsii import Agent, RetryStrategy

agent = Agent(
    retry_strategy=RetryStrategy(
        max_attempts=3,
        initial_delay=1.0,       # seconds
        max_delay=30.0,          # seconds
        backoff_multiplier=2.0,  # exponential backoff
    ),
)
```

The retry strategy automatically:

- Catches retryable errors (throttling, transient failures)
- Waits with exponential backoff between retries
- Gives up after `max_attempts`

You can also use it manually:

```python
retry = RetryStrategy(max_attempts=3, initial_delay=1.0)
result = retry.converse_with_retry(provider, messages_json, system_prompt, tool_specs_json)

# Check if an error is retryable
is_retryable = RetryStrategy.is_retryable_error(response_json)
```

## Error Classification

The `ErrorClassifier` automatically maps response content to the right error type:

```python
from strands_jsii import ErrorClassifier

error = ErrorClassifier.classify(response_json)  # Returns AgentError or None
```

## Best Practices

1. **Always set `maxCycles`** — the default is 50, but for production, pick a number that matches your use case
2. **Use a conversation manager** for long-running agents — prevents `ContextWindowOverflowError`
3. **Add retry strategy** for production — transient errors are common with cloud APIs
4. **Catch `ToolExecutionError` specifically** — it tells you which tool failed and why
5. **Build error handling into tools** — a tool that returns `"Error: file not found"` is better than one that throws an exception
