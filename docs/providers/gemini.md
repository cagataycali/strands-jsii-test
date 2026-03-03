# Google Gemini

Google Gemini API access.

## Setup

```bash
export GOOGLE_API_KEY=AIza...
# or
export GEMINI_API_KEY=AIza...
```

## Usage

=== "Python"
    ```python
    from strands_jsii import Agent, Gemini

    agent = Agent(model=Gemini(api_key="AIza...", model_id="gemini-2.5-flash"))
    ```

=== "TypeScript"
    ```typescript
    const { Agent, Gemini } = require('strands-jsii');
    const agent = Agent({ model: Gemini({ apiKey: "AIza...", modelId: "gemini-2.5-flash" }) });
    ```

=== "Java"
    ```java
    var agent = Strands.agentWith(Strands.gemini("gemini-2.5-flash", "AIza..."));
    ```

=== "Go"
    ```go
    agent := NewAgent(WithModel(GeminiProvider("gemini-2.5-flash", "AIza...")))
    ```

=== "C#"
    ```csharp
    var agent = Strands.AgentWith(Strands.Gemini("gemini-2.5-flash", "AIza..."));
    ```

## Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `modelId` | string | `gemini-2.5-flash` | Model identifier |
| `apiKey` | string | `GOOGLE_API_KEY` / `GEMINI_API_KEY` env | API key |
| `maxTokens` | number | `4096` | Maximum tokens to generate |
| `temperature` | number | `-1` (API default) | Sampling temperature |

## Available Models

| Model | Notes |
|-------|-------|
| `gemini-2.5-flash` | Fast, efficient (default) |
| `gemini-2.5-pro` | Highest quality |
| `gemini-2.0-flash` | Previous gen, very fast |
