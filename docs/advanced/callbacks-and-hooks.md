# Callbacks & Hooks

Two systems for intercepting agent behavior:

- **CallbackHandler** — **observe** what's happening (logging, metrics, streaming)
- **HookProvider** — **intercept and modify** behavior (security, cost control, routing)

## CallbackHandler: Observe

Get notified about agent lifecycle events without changing behavior.

```python
from strands_jsii import Agent, CallbackHandler

class LoggingHandler(CallbackHandler):
    def on_tool_start(self, tool_name, input_json):
        print(f"🔧 Calling {tool_name}...")

    def on_tool_end(self, tool_name, result_json, duration_ms):
        print(f"✅ {tool_name} completed ({duration_ms:.0f}ms)")

    def on_text_chunk(self, text):
        print(text, end="", flush=True)  # Stream text as it arrives

    def on_error(self, error_message, phase):
        print(f"❌ [{phase}] {error_message}")

agent = Agent(callback_handler=LoggingHandler())
```

### All Callback Methods

| Method | When it fires | Parameters |
|--------|--------------|------------|
| `onAgentStart` | Agent invocation begins | `prompt` |
| `onAgentEnd` | Agent invocation ends | `responseText, inputTokens, outputTokens` |
| `onModelStart` | Model call begins | `messagesJson` |
| `onModelEnd` | Model call ends | `responseJson` |
| `onToolStart` | Tool execution begins | `toolName, inputJson` |
| `onToolEnd` | Tool execution ends | `toolName, resultJson, durationMs` |
| `onTextChunk` | Text content streamed | `text` |
| `onError` | Error occurred | `errorMessage, phase` |

### Quick Debugging

Use the built-in `PrintingCallbackHandler` to see everything:

```python
from strands_jsii import PrintingCallbackHandler

agent = Agent(callback_handler=PrintingCallbackHandler())
```

Output looks like:
```
[Model] Sending 3 messages...
[Model] Stop: tool_use
[Tool] calculator executing...
[Tool] calculator completed (15ms)
Hello! The answer is 42.
[Agent] Done. Tokens: 150 in / 42 out
```

## HookProvider: Intercept

Hooks can **modify** behavior. The most important use case: blocking dangerous operations.

```python
from strands_jsii import Agent, HookProvider

class SecurityHook(HookProvider):
    def before_invocation(self, event):
        # Cancel dangerous queries
        if "DROP TABLE" in event.prompt.upper():
            event.cancelled = True

    def after_invocation(self, event):
        print(f"Completed: {event.stop_reason}, tokens: {event.input_tokens}")

    def on_tool_start(self, event):
        if event.tool_name == "shell":
            print(f"⚠️ Shell access: {event.input_json[:100]}")

agent = Agent()
agent.hook_registry.register(SecurityHook())
```

### Hook Events

| Event | Key Fields | Can Modify? |
|-------|-----------|-------------|
| `BeforeInvocationEvent` | `prompt`, `messagesJson`, `cancelled` | Set `cancelled = True` to abort |
| `AfterInvocationEvent` | `responseText`, `stopReason`, `inputTokens`, `outputTokens` | Read-only |
| `MessageAddedEvent` | `role`, `contentJson` | Read-only |
| `ToolStartEvent` | `toolName`, `inputJson` | Read-only |
| `ToolEndEvent` | `toolName`, `resultJson`, `durationMs` | Read-only |

### Multiple Hooks

Register multiple hooks — they fire in order. Any hook can cancel an invocation.

```python
agent.hook_registry.register(SecurityHook())
agent.hook_registry.register(MetricsHook())
agent.hook_registry.register(CostTrackingHook())
```

## Cross-Language

=== "TypeScript"
    ```typescript
    const { Agent } = require('strands-jsii');
    const { CallbackHandler, HookProvider } = require('strands-jsii');

    class MyHandler extends CallbackHandler {
        onToolStart(toolName, inputJson) { console.log(`Calling ${toolName}...`); }
    }

    class MyHook extends HookProvider {
        beforeInvocation(event) {
            if (event.prompt.includes("DROP TABLE")) event.cancelled = true;
        }
    }

    const agent = Agent({ callbackHandler: new MyHandler() });
    agent.hookRegistry.register(new MyHook());
    ```

=== "Java"
    ```java
    class MyHandler extends CallbackHandler {
        @Override public void onToolStart(String toolName, String inputJson) {
            System.out.println("Calling " + toolName + "...");
        }
    }

    class MyHook extends HookProvider {
        @Override public void beforeInvocation(BeforeInvocationEvent event) {
            if (event.getPrompt().toUpperCase().contains("DROP TABLE")) {
                event.setCancelled(true);
            }
        }
    }
    ```
