# Tutorial: Add a Custom Model Provider

The SDK ships with four providers (Bedrock, Anthropic, OpenAI, Gemini), but you can connect to any LLM API by extending `ModelProvider`. This tutorial shows you how.

## When You Need This

- You're using a self-hosted model (vLLM, TGI, Ollama)
- You want to integrate a provider we don't ship (Cohere, Mistral, Together)
- You need custom preprocessing or postprocessing of messages
- You want to add caching, logging, or routing between models

## The Contract

Your custom provider must implement one method: `converse()`. It receives messages in Bedrock Converse format and must return a response in the same format.

## Step 1: Extend ModelProvider

=== "Python"
    ```python
    from strands_jsii import ModelProvider, Agent
    import json
    import subprocess

    class OllamaProvider(ModelProvider):
        """Model provider for a local Ollama instance."""

        def __init__(self, model="llama3.1"):
            super().__init__()
            self._model = model

        def converse(self, messages_json, system_prompt=None, tool_specs_json=None):
            messages = json.loads(messages_json)

            # Convert Bedrock Converse format to Ollama format
            ollama_messages = []
            if system_prompt:
                ollama_messages.append({"role": "system", "content": system_prompt})

            for msg in messages:
                role = msg["role"]
                text = ""
                for block in msg.get("content", []):
                    if "text" in block:
                        text += block["text"]
                ollama_messages.append({"role": role, "content": text})

            # Call Ollama via curl
            payload = json.dumps({
                "model": self._model,
                "messages": ollama_messages,
                "stream": False,
            })

            result = subprocess.run(
                ["curl", "-s", "http://localhost:11434/api/chat", "-d", payload],
                capture_output=True, text=True
            )

            response = json.loads(result.stdout)
            reply_text = response["message"]["content"]

            # Return in Bedrock Converse format
            return json.dumps({
                "output": {
                    "message": {
                        "role": "assistant",
                        "content": [{"text": reply_text}]
                    }
                },
                "stopReason": "end_turn",
                "usage": {
                    "inputTokens": response.get("prompt_eval_count", 0),
                    "outputTokens": response.get("eval_count", 0),
                }
            })

        @property
        def model_id(self):
            return self._model

        @property
        def provider_name(self):
            return "ollama"
    ```

=== "TypeScript"
    ```typescript
    const { ModelProvider } = require('strands-jsii');
    const { execSync } = require('child_process');

    class OllamaProvider extends ModelProvider {
        constructor(model = 'llama3.1') {
            super();
            this._model = model;
        }

        converse(messagesJson, systemPrompt, toolSpecsJson) {
            const messages = JSON.parse(messagesJson);
            const ollamaMessages = [];

            if (systemPrompt) {
                ollamaMessages.push({ role: 'system', content: systemPrompt });
            }

            for (const msg of messages) {
                const text = msg.content
                    .filter(b => b.text)
                    .map(b => b.text)
                    .join('');
                ollamaMessages.push({ role: msg.role, content: text });
            }

            const payload = JSON.stringify({
                model: this._model,
                messages: ollamaMessages,
                stream: false,
            });

            const result = execSync(
                `curl -s http://localhost:11434/api/chat -d '${payload}'`,
                { encoding: 'utf-8' }
            );

            const response = JSON.parse(result);

            return JSON.stringify({
                output: {
                    message: {
                        role: 'assistant',
                        content: [{ text: response.message.content }]
                    }
                },
                stopReason: 'end_turn',
                usage: { inputTokens: 0, outputTokens: 0 }
            });
        }

        get modelId() { return this._model; }
        get providerName() { return 'ollama'; }
    }
    ```

## Step 2: Use It

```python
agent = Agent(
    model=OllamaProvider("llama3.1"),
    tools=[calculator],
    system_prompt="You are a helpful assistant.",
)

response = agent("What is 42 * 17?")
```

## The Response Format

Your `converse()` method must return JSON with this structure:

```json
{
    "output": {
        "message": {
            "role": "assistant",
            "content": [
                {"text": "The answer is 714."}
            ]
        }
    },
    "stopReason": "end_turn",
    "usage": {
        "inputTokens": 150,
        "outputTokens": 42
    }
}
```

For tool calls, the content includes `toolUse` blocks:

```json
{
    "output": {
        "message": {
            "role": "assistant",
            "content": [
                {
                    "toolUse": {
                        "toolUseId": "unique-id",
                        "name": "calculator",
                        "input": {"expression": "42 * 17"}
                    }
                }
            ]
        }
    },
    "stopReason": "tool_use",
    "usage": {"inputTokens": 150, "outputTokens": 42}
}
```

| Field | Values |
|-------|--------|
| `stopReason` | `"end_turn"` — model finished. `"tool_use"` — model wants to call tools. `"max_tokens"` — hit token limit. |
| `content` blocks | `{"text": "..."}` for text, `{"toolUse": {...}}` for tool calls |
| `usage` | Token counts for cost tracking |

## Tips

- **Start simple.** Get text responses working first, then add tool call support.
- **The `tool_specs_json` parameter** contains the JSON Schema for all available tools. Your provider needs to pass this to the model so it knows what tools exist.
- **Test with `PrintingCallbackHandler`** to see what the agent is sending and receiving.

## Next Steps

- **[Model Providers Overview](../providers/overview.md)** — See how the built-in providers work
- **[Error Handling](../advanced/error-handling.md)** — Handle model errors gracefully
