# Model Providers

Five providers ship with the SDK. All normalize to the same internal format, so switching providers is a one-line change. The agent loop doesn't care which provider you use.

## At a Glance

| Provider | Auth | Default Model | Docs |
|----------|------|---------------|------|
| **[Bedrock](bedrock.md)** | AWS credentials | Claude Sonnet 4 | Default, recommended for production |
| **[Anthropic](anthropic.md)** | `ANTHROPIC_API_KEY` | Claude Sonnet 4 | Direct API access |
| **[OpenAI](openai.md)** | `OPENAI_API_KEY` | GPT-4o | Also works with compatible endpoints |
| **[Gemini](gemini.md)** | `GOOGLE_API_KEY` | Gemini 2.5 Flash | Google AI |
| **[Ollama](ollama.md)** | None (local) | Llama 3 | Local inference, no cloud needed |

## Switching Providers

=== "Python"
    ```python
    from strands_jsii import Agent, Bedrock, Anthropic, OpenAI, Gemini

    agent = Agent()                                              # Bedrock (default)
    agent = Agent(model=Anthropic(api_key="sk-ant-..."))         # Anthropic
    agent = Agent(model=OpenAI(api_key="sk-..."))                # OpenAI
    agent = Agent(model=Gemini(api_key="AIza..."))               # Gemini
    agent = Agent(model=Ollama())                                    # Ollama (local)    ```

=== "TypeScript"
    ```typescript
    const { Agent, Bedrock, Anthropic, OpenAI, Gemini } = require('strands-jsii');

    const agent = Agent();                                            // Bedrock
    const agent = Agent({ model: Anthropic({ apiKey: "sk-ant-..." }) });
    const agent = Agent({ model: OpenAI({ apiKey: "sk-..." }) });
    const agent = Agent({ model: Gemini({ apiKey: "AIza..." }) });
    const agent = Agent({ model: Strands.ollama("llama3") });              // Ollama    ```

=== "Java"
    ```java
    var agent = Strands.agent();                                         // Bedrock
    var agent = Strands.agentWith(Strands.anthropic("claude-sonnet-4-20250514", "sk-ant-..."));
    var agent = Strands.agentWith(Strands.openai("gpt-4o", "sk-..."));
    var agent = Strands.agentWith(Strands.gemini("gemini-2.5-flash", "AIza..."));
    var agent = Strands.agentWith(Strands.ollama("llama3"));    ```

=== "Go"
    ```go
    agent := NewAgent()                                               // Bedrock
    agent := NewAgent(WithModel(AnthropicProvider("claude-sonnet-4-20250514", "sk-ant-...")))
    agent := NewAgent(WithModel(OpenAIProvider("gpt-4o", "sk-...")))
    agent := NewAgent(WithModel(GeminiProvider("gemini-2.5-flash", "AIza...")))
    agent := NewAgent(WithModel(OllamaProvider("llama3")))    ```

=== "C#"
    ```csharp
    var agent = Strands.Agent();                                         // Bedrock
    var agent = Strands.AgentWith(Strands.Anthropic("claude-sonnet-4-20250514", "sk-ant-..."));
    var agent = Strands.AgentWith(Strands.Openai("gpt-4o", "sk-..."));
    var agent = Strands.AgentWith(Strands.Gemini("gemini-2.5-flash", "AIza..."));
    var agent = Strands.AgentWith(Strands.Ollama("llama3"));    ```

## Custom Provider

Need to connect to a different LLM? Extend `ModelProvider` and implement `converse()`. See the **[Custom Provider tutorial](../tutorials/custom-provider.md)** for a complete walkthrough.
