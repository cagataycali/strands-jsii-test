# OpenAI

OpenAI API access. Also works with any OpenAI-compatible endpoint (vLLM, Together, Fireworks).

## Setup

```bash
export OPENAI_API_KEY=sk-...
```

## Usage

=== "Python"
    ```python
    from strands_jsii import Agent, OpenAI

    agent = Agent(model=OpenAI(api_key="sk-...", model_id="gpt-4o"))
    ```

=== "TypeScript"
    ```typescript
    const { Agent, OpenAI } = require('strands-jsii');
    const agent = Agent({ model: OpenAI({ apiKey: "sk-...", modelId: "gpt-4o" }) });
    ```

=== "Java"
    ```java
    var agent = Strands.agentWith(Strands.openai("gpt-4o", "sk-..."));
    ```

=== "Go"
    ```go
    agent := NewAgent(WithModel(OpenAIProvider("gpt-4o", "sk-...")))
    ```

=== "C#"
    ```csharp
    var agent = Strands.AgentWith(Strands.Openai("gpt-4o", "sk-..."));
    ```

## Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `modelId` | string | `gpt-4o` | Model identifier |
| `apiKey` | string | `OPENAI_API_KEY` env | API key |
| `maxTokens` | number | `4096` | Maximum tokens to generate |
| `temperature` | number | `0.7` | Sampling temperature |
| `baseUrl` | string | `https://api.openai.com` | API base URL |

## Compatible Endpoints

Use `baseUrl` to point to any OpenAI-compatible API:

```python
agent = Agent(model=OpenAI(
    base_url="https://api.together.xyz",
    api_key="...",
    model_id="meta-llama/Llama-3-70b-chat-hf",
))
```

## Available Models

| Model | Notes |
|-------|-------|
| `gpt-4o` | Flagship model (default) |
| `gpt-4o-mini` | Fast, affordable |
| `o3` | Reasoning model |
| `o4-mini` | Fast reasoning |
