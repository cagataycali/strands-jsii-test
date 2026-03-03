# Anthropic

Direct Anthropic API access (not via Bedrock).

## Setup

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Usage

=== "Python"
    ```python
    from strands_jsii import Agent, Anthropic

    agent = Agent(model=Anthropic(api_key="sk-ant-...", model_id="claude-sonnet-4-20250514"))
    ```

=== "TypeScript"
    ```typescript
    const { Agent, Anthropic } = require('strands-jsii');
    const agent = Agent({ model: Anthropic({ apiKey: "sk-ant-...", modelId: "claude-sonnet-4-20250514" }) });
    ```

=== "Java"
    ```java
    var agent = Strands.agentWith(Strands.anthropic("claude-sonnet-4-20250514", "sk-ant-..."));
    ```

=== "Go"
    ```go
    agent := NewAgent(WithModel(AnthropicProvider("claude-sonnet-4-20250514", "sk-ant-...")))
    ```

=== "C#"
    ```csharp
    var agent = Strands.AgentWith(Strands.Anthropic("claude-sonnet-4-20250514", "sk-ant-..."));
    ```

## Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `modelId` | string | `claude-sonnet-4-20250514` | Model identifier |
| `apiKey` | string | `ANTHROPIC_API_KEY` env | API key |
| `maxTokens` | number | `4096` | Maximum tokens to generate |
| `temperature` | number | `-1` (API default) | Sampling temperature |
| `baseUrl` | string | `https://api.anthropic.com` | API base URL |

## Available Models

| Model | Notes |
|-------|-------|
| `claude-sonnet-4-20250514` | Best balance of speed and quality (default) |
| `claude-opus-4-20250514` | Highest quality |
| `claude-haiku-3-20250307` | Fastest and cheapest |
