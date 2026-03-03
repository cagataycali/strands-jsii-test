# Agent as Tool

`AgentTool` wraps an entire agent as a tool for another agent. This is the foundation of all multi-agent patterns — the coordinator agent sees each sub-agent as a tool with a single `prompt` parameter.

## Basic Example

```python
from strands_jsii import Agent, AgentTool, tool

@tool
def search(query: str) -> str:
    """Search the web."""
    return f"Results for: {query}"

researcher = Agent(tools=[search], system_prompt="You research topics thoroughly.")
writer = Agent(system_prompt="You write clear, engaging content.")

coordinator = Agent(
    tools=[
        AgentTool("research", "Research a topic in depth", researcher),
        AgentTool("write", "Write polished content", writer),
    ],
    system_prompt="You coordinate research and writing tasks.",
)

coordinator("Write a blog post about quantum computing.")
```

## What Happens

1. The coordinator receives your prompt
2. The model decides to call the `research` tool with a research-focused prompt
3. `AgentTool` forwards that prompt to the researcher agent, which runs its own loop (calling `search`, thinking, etc.)
4. The researcher's result goes back to the coordinator
5. The coordinator calls the `write` tool with the research findings
6. The writer agent produces the article
7. The coordinator presents the final result

Each sub-agent has its own conversation context, tools, system prompt, and optionally a different model.

## Cross-Language

=== "TypeScript"
    ```typescript
    const { Agent, tool } = require('strands-jsii');
    const { AgentTool } = require('strands-jsii');

    const researcher = Agent({ tools: [search], systemPrompt: "You research topics." });
    const writer = Agent({ systemPrompt: "You write clear content." });

    const coordinator = Agent({
        tools: [
            new AgentTool("research", "Research a topic", researcher),
            new AgentTool("write", "Write content", writer),
        ],
    });
    ```

=== "Java"
    ```java
    var researcher = Strands.agentWith(Strands.bedrock(), search);
    var writer = Strands.agent(new QuickAgentOptions() {{ systemPrompt = "You write clear content."; }});

    var coordinator = Strands.agentWith(Strands.bedrock(),
        new AgentTool("research", "Research a topic", researcher),
        new AgentTool("write", "Write content", writer));
    ```

=== "Go"
    ```go
    researcher := NewAgent(WithTools(search), WithSystemPrompt("You research topics."))
    writer := NewAgent(WithSystemPrompt("You write clear content."))

    coordinator := NewAgent(
        WithTools(
            strands.NewAgentTool(jsii.String("research"), jsii.String("Research a topic"), researcher),
            strands.NewAgentTool(jsii.String("write"), jsii.String("Write content"), writer),
        ),
    )
    ```

## Key Points

- Each sub-agent is **independent** — its own conversation history, tools, and model
- The coordinator doesn't know *how* the sub-agent works — it just sends a prompt and gets a result
- Sub-agents can themselves have sub-agents (nesting)
- Different agents can use different model providers

See **[Patterns](patterns.md)** for pipeline, fan-out, and hierarchical architectures.
