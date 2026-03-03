# Ollama

Local model inference via [Ollama](https://ollama.com). Run models on your own machine — no API keys, no cloud, no cost.

## Setup

Install and start Ollama:

```bash
# Install (macOS)
brew install ollama

# Or download from https://ollama.com

# Start the server
ollama serve

# Pull a model
ollama pull llama3
```

## Usage

=== "Python"
    ```python
    from strands_jsii import Agent, Ollama

    # Default (llama3, localhost:11434)
    agent = Agent(model=Ollama())

    # Custom model
    agent = Agent(model=Ollama(model_id="qwen3:8b"))
    ```

=== "TypeScript"
    ```typescript
    const { Agent } = require('strands-jsii');
    const { Strands } = require('strands-jsii');

    const agent = Agent({ model: Strands.ollama("llama3") });
    const agent = Agent({ model: Strands.ollama("qwen3:8b", "http://myserver:11434") });
    ```

=== "Java"
    ```java
    var agent = Strands.agentWith(Strands.ollama("llama3"));
    var agent = Strands.agentWith(Strands.ollama("qwen3:8b", "http://myserver:11434"));
    ```

=== "Go"
    ```go
    agent := NewAgent(WithModel(OllamaProvider("llama3")))
    agent := NewAgent(WithModel(OllamaProvider("qwen3:8b", "http://myserver:11434")))
    ```

=== "C#"
    ```csharp
    var agent = Strands.AgentWith(Strands.Ollama("llama3"));
    var agent = Strands.AgentWith(Strands.Ollama("qwen3:8b", "http://myserver:11434"));
    ```

## Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `modelId` | string | `llama3` | Ollama model name |
| `host` | string | `http://localhost:11434` | Ollama server URL |
| `maxTokens` | number | `-1` (model default) | Max tokens to generate (`num_predict`) |
| `temperature` | number | `-1` (model default) | Sampling temperature |
| `topP` | number | `-1` (model default) | Nucleus sampling |
| `topK` | number | `-1` (model default) | Top-K sampling |
| `keepAlive` | string | `5m` | How long to keep model loaded in memory |
| `stopSequencesJson` | string | `""` | JSON array of stop sequences |
| `optionsJson` | string | `""` | Additional Ollama options as JSON (e.g., `num_ctx`, `num_gpu`) |
| `additionalArgsJson` | string | `""` | Extra request body fields as JSON |

## Advanced Configuration

Use `Strands.ollamaWith()` for full control:

```python
from strands_jsii import Strands

agent = Strands.agent(model=Strands.ollama_with({
    "model_id": "qwen3:8b",
    "host": "http://localhost:11434",
    "temperature": 0.7,
    "top_p": 0.9,
    "keep_alive": "10m",
    "options_json": '{"num_ctx": 8192, "num_gpu": 1}',
}))
```

## Available Models

Any model available through `ollama pull`:

| Model | Notes |
|-------|-------|
| `llama3` | Meta Llama 3 (default) |
| `llama3.1` | Meta Llama 3.1 |
| `qwen3:8b` | Alibaba Qwen 3 8B |
| `qwen3:1.7b` | Alibaba Qwen 3 1.7B (fast) |
| `mistral` | Mistral 7B |
| `codellama` | Code-specialized Llama |
| `deepseek-coder` | DeepSeek Coder |

Run `ollama list` to see installed models.

## Troubleshooting

**"Ollama server not reachable"** — Make sure `ollama serve` is running:

```bash
ollama serve
```

**Model not found** — Pull it first:

```bash
ollama pull llama3
```

**Remote server** — Point to the remote host:

```python
agent = Agent(model=Ollama(host="http://192.168.1.100:11434", model_id="llama3"))
```
