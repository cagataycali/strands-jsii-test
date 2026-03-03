# Amazon Bedrock

The default provider. Uses the AWS SDK `ConverseStream` API. Zero API keys needed — just AWS credentials.

## Setup

```bash
# Option 1: AWS CLI
aws configure

# Option 2: Environment variables
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_DEFAULT_REGION=us-west-2
```

## Usage

=== "Python"
    ```python
    from strands_jsii import Agent, Bedrock

    # Zero-config default (Claude Sonnet, us-west-2)
    agent = Agent()

    # Custom configuration
    agent = Agent(model=Bedrock(
        model_id="us.anthropic.claude-sonnet-4-20250514-v1:0",
        region="us-east-1",
        max_tokens=8192,
        temperature=0.7,
        top_p=0.9,
    ))
    ```

=== "TypeScript"
    ```typescript
    const { Agent, Bedrock } = require('strands-jsii');

    const agent = Agent();
    const agent = Agent({ model: Bedrock({
        modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
        region: 'us-east-1',
        maxTokens: 8192,
    })});
    ```

=== "Java"
    ```java
    var agent = Strands.agent();
    var agent = Strands.agentWith(Strands.bedrock("us.anthropic.claude-sonnet-4-20250514-v1:0", "us-east-1"));
    ```

=== "Go"
    ```go
    agent := NewAgent()
    agent := NewAgent(WithModel(BedrockWithModel("us.anthropic.claude-sonnet-4-20250514-v1:0")))
    ```

=== "C#"
    ```csharp
    var agent = Strands.Agent();
    var agent = Strands.AgentWith(Strands.Bedrock("us.anthropic.claude-sonnet-4-20250514-v1:0", "us-east-1"));
    ```

## Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `modelId` | string | `us.anthropic.claude-sonnet-4-20250514-v1:0` | Bedrock model identifier |
| `region` | string | `us-west-2` | AWS region |
| `maxTokens` | number | `4096` | Maximum tokens to generate |
| `temperature` | number | `0.7` | Sampling temperature (0.0–1.0) |
| `topP` | number | `0.9` | Nucleus sampling parameter |
| `streaming` | boolean | `true` | Use ConverseStream API |
| `guardrail` | GuardrailConfig | — | Bedrock Guardrails |
| `additionalRequestFieldsJson` | string | `""` | Extra fields (e.g., thinking config) |

## Guardrails

```python
from strands_jsii import Bedrock, GuardrailConfig, Agent

agent = Agent(model=Bedrock(
    guardrail=GuardrailConfig(
        guardrail_id="abc123",
        guardrail_version="1",
        trace="enabled",
    ),
))
```

## Streaming vs Non-Streaming

Streaming (default) uses `ConverseStreamCommand` for lower latency. Disable it for simpler debugging:

```python
agent = Agent(model=Bedrock(streaming=False))
```

## Available Models

| Model ID | Provider | Notes |
|----------|----------|-------|
| `us.anthropic.claude-sonnet-4-20250514-v1:0` | Anthropic | Default — best balance |
| `us.anthropic.claude-opus-4-20250514-v1:0` | Anthropic | Highest quality |
| `us.anthropic.claude-haiku-3-20250307-v1:0` | Anthropic | Fastest, cheapest |
| `us.amazon.nova-pro-v1:0` | Amazon | |
| `us.amazon.nova-lite-v1:0` | Amazon | |
| `us.meta.llama3-3-70b-instruct-v1:0` | Meta | |
