<div align="center">
  <img src="assets/logo.svg" alt="Strands JSII Logo" width="180" style="margin-bottom: 1rem;">
  <h1>Strands Agents — Cross-Language SDK</h1>
  <p><strong>Write agents once. Run them in Python, TypeScript, Java, Go, and C#.</strong></p>
</div>

---

You build an agent in Python. It works beautifully. Then someone asks: *"Can I use this from Java?"*

That question used to mean rewriting everything. **Not anymore.**

Strands Agents JSII takes the [Strands Agents SDK](https://github.com/strands-agents/sdk-python) and makes it callable from five languages — all from one TypeScript source, compiled through [jsii](https://github.com/aws/jsii). Each language gets native idioms so it never feels like a wrapper.

```
          ┌──────────────────────────┐
          │   Your Agent Logic       │
          │   (write it once)        │
          └────────────┬─────────────┘
                       │ jsii
       ┌───────┬───────┼───────┬───────┐
       ▼       ▼       ▼       ▼       ▼
     .whl    .npm    .jar   .nupkg    .go
    Python    TS     Java     C#      Go
```

## See It in Action

=== "Python"
    ```python
    from strands_jsii import Agent, tool

    @tool
    def calculator(expression: str) -> str:
        """Evaluate math."""
        return str(eval(expression))

    agent = Agent(tools=[calculator])
    response = agent("What is 42 * 17?")
    ```

=== "TypeScript"
    ```typescript
    const { Agent, tool } = require('strands-jsii');

    const calculator = tool(function calculator({ expression }) {
        return { result: eval(expression) };
    }, { description: "Evaluate math" });

    const agent = Agent({ tools: [calculator] });
    const response = agent("What is 42 * 17?");
    ```

=== "Java"
    ```java
    var calc = Strands.tool("calculator", "Evaluate math")
        .param("expression", "string", "Math expression")
        .withHandler(handler)
        .create();

    var agent = Strands.agentWith(Strands.bedrock(), calc);
    agent.ask("What is 42 * 17?");
    ```

=== "Go"
    ```go
    calc := NewTool("calculator", "Evaluate math", calcFn, map[string]ParamDef{
        "expression": {Type: "string", Description: "Math expression", Required: true},
    })
    agent := NewAgent(WithTools(calc))
    response := agent.Ask("What is 42 * 17?")
    ```

=== "C#"
    ```csharp
    var calc = Strands.Tool("calculator", "Evaluate math")
        .Param("expression", "string", "Math expression")
        .WithHandler(handler)
        .Create();

    var agent = Strands.AgentWith(Strands.Bedrock(), calc);
    agent.Ask("What is 42 * 17?");
    ```

Same agent loop. Same tool system. Same model providers. **Native syntax in every language.**

## What You Can Do

| Feature | Python | TypeScript | Go | Java | C# |
|---------|:------:|:----------:|:--:|:----:|:--:|
| Create & invoke agents | `agent("…")` | `agent("…")` | `agent.Ask("…")` | `agent.ask("…")` | `agent.Ask("…")` |
| Define tools | `@tool` | `tool(fn)` | `NewTool()` | `Strands.tool()` | `Strands.Tool()` |
| 5 model providers | ✅ | ✅ | ✅ | ✅ | ✅ |
| Wrap any library | `make_use_tool()` | `make_use_tool()` | — | — | — |
| Multi-agent delegation | ✅ | ✅ | ✅ | ✅ | ✅ |
| Hot-reload tools | ✅ | ✅ | ✅ | ✅ | ✅ |
| Hooks & callbacks | ✅ | ✅ | ✅ | ✅ | ✅ |
| Guardrails | ✅ | ✅ | ✅ | ✅ | ✅ |

## Start Here

<div class="grid cards" markdown>

-   :material-rocket-launch: **[Installation](getting-started/installation.md)**

    Get set up in 30 seconds. All five languages.

-   :material-play-circle: **[Your First Agent](getting-started/first-agent.md)**

    Build a working agent step by step. Understand every line.

-   :material-school: **[Tutorials](tutorials/cli-assistant.md)**

    Build real things: CLI assistants, research pipelines, library wrappers.

-   :material-help-circle: **[FAQ](faq.md)**

    Common questions, troubleshooting, and gotchas.

</div>

## Design Principles

1. **Simplest thing that works.** `Agent()` then `agent("prompt")`. If it takes more than two lines to start, we failed.
2. **Same mental model, native idioms.** Python gets `@tool`. Go gets functional options. Java gets builders. The loop underneath is identical.
3. **Tools are the ecosystem.** `make_use_tool("boto3")` — any installed package becomes a tool.
4. **Hot everything.** Reload tools, swap models, clear messages — all at runtime.
5. **One codebase, all languages.** Fix a bug once, ship everywhere.
