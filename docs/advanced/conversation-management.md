# Conversation Management

As conversations grow, you need to manage message history so you don't blow past the model's context window. Three strategies ship with the SDK.

## Managers at a Glance

| Manager | What it does | When to use |
|---------|-------------|-------------|
| `NullConversationManager` | Keeps everything (default) | Short conversations, testing |
| `SlidingWindowConversationManager(n)` | Keeps first message + last N messages | Long conversations with recent-context focus |
| `SummarizingConversationManager` | Summarizes old messages, keeps recent | Long conversations where old context matters |

## Sliding Window

The simplest solution. Keeps the first message (usually has important context) plus the most recent N messages.

```python
from strands_jsii import Agent, SlidingWindowConversationManager

agent = Agent(
    conversation_manager=SlidingWindowConversationManager(window_size=20)
)

# After 100 turns, the model only sees the first message + last 20
```

=== "TypeScript"
    ```typescript
    const { Agent } = require('strands-jsii');
    const { SlidingWindowConversationManager } = require('strands-jsii');

    const agent = Agent({
        conversationManager: new SlidingWindowConversationManager(20)
    });
    ```

=== "Java"
    ```java
    var agent = Strands.agent(new QuickAgentOptions() {{
        conversationManager = new SlidingWindowConversationManager(20);
    }});
    ```

## Summarizing

When old context matters but you can't keep everything. Automatically summarizes old messages when the count exceeds a threshold.

```python
from strands_jsii import Agent, SummarizingConversationManager

agent = Agent(
    conversation_manager=SummarizingConversationManager({
        "summary_ratio": 0.3,               # Summarize 30% of old messages
        "preserve_recent_messages": 10,       # Always keep the last 10
        "max_messages": 40,                   # Trigger summarization at 40 messages
        "summarization_prompt": "Summarize the key points of this conversation.",
    }),
)
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `summaryRatio` | `0.3` | Fraction of messages to summarize (0.1–0.8) |
| `preserveRecentMessages` | `10` | Recent messages to always keep |
| `maxMessages` | `40` | Threshold to trigger summarization |
| `summarizationPrompt` | `"Summarize the conversation concisely."` | Prompt for the summary |

## Accessing Messages Directly

```python
# Read messages
messages = agent.messages
for msg in messages:
    print(msg.role)
    for block in msg.content:
        if block.is_text:
            print(f"  {block.as_text.text[:80]}")

# Clear everything
agent.reset_conversation()
```

## Custom Manager

Extend `ConversationManager` for your own strategy:

```python
from strands_jsii import ConversationManager
import json

class TokenBudgetManager(ConversationManager):
    def __init__(self, max_tokens=50000):
        super().__init__()
        self._max = max_tokens

    def apply(self, messages_json):
        messages = json.loads(messages_json)
        # Your custom trimming logic here
        return json.dumps(messages)

    @property
    def manager_type(self):
        return "token_budget"
```
