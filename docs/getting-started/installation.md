# Installation

## Pick Your Language

=== "Python"
    ```bash
    pip install strands-jsii
    ```

    Verify it works:
    ```python
    from strands_jsii import Agent, tool
    print("Ready to go!")
    ```

=== "TypeScript"
    ```bash
    npm install strands-jsii
    ```

=== "Java"
    ```xml
    <dependency>
      <groupId>io.github.cagataycali</groupId>
      <artifactId>strands-jsii</artifactId>
      <version>0.1.0</version>
    </dependency>
    ```

=== "Go"
    ```bash
    go get github.com/cagataycali/strands-jsii/go
    ```

=== "C#"
    ```bash
    dotnet add package Strands.Agents.Jsii
    ```

!!! note "Node.js is required"
    All languages need **Node.js 20+** installed. The jsii runtime uses it under the hood. Get it from [nodejs.org](https://nodejs.org).

## Set Up a Model Provider

The default model provider is **Amazon Bedrock** (Claude Sonnet). You need AWS credentials:

```bash
# Option 1: AWS CLI (recommended)
aws configure

# Option 2: Environment variables
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_DEFAULT_REGION=us-west-2
```

!!! tip "Don't have AWS credentials?"
    You can use any of the four providers. See [Model Providers](../providers/overview.md) for Anthropic, OpenAI, and Gemini setup.

## Language Requirements

| Language | Version | Notes |
|----------|---------|-------|
| Python | 3.10+ | + Node.js 20+ for jsii runtime |
| TypeScript | Node.js 20+ | |
| Java | JDK 11+ | + Node.js 20+ |
| Go | 1.21+ | + Node.js 20+ |
| C# | .NET 6+ | + Node.js 20+ |

## Next Step

→ **[Build your first agent](first-agent.md)**
