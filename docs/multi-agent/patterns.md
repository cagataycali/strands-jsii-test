# Multi-Agent Patterns

Three common ways to coordinate multiple agents, all built on `AgentTool`.

## Pipeline

Agents work in sequence: analyst → writer → reviewer.

```python
analyst = Agent(system_prompt="Analyze data. Output structured findings.")
writer = Agent(system_prompt="Turn analysis into a report.")
reviewer = Agent(system_prompt="Review for accuracy. Output corrections.")

pipeline = Agent(tools=[
    AgentTool("analyze", "Analyze data", analyst),
    AgentTool("write", "Write report from analysis", writer),
    AgentTool("review", "Review report", reviewer),
])

pipeline("Analyze our Q4 sales data and produce a board report.")
```

The coordinator calls each agent in order, feeding results forward.

## Fan-Out / Fan-In

Multiple agents research in parallel, then results are synthesized:

```python
tech = Agent(system_prompt="Research technical aspects.")
market = Agent(system_prompt="Research market aspects.")
legal = Agent(system_prompt="Research legal/regulatory aspects.")

aggregator = Agent(
    tools=[
        AgentTool("tech_research", "Technical research", tech),
        AgentTool("market_research", "Market research", market),
        AgentTool("legal_research", "Legal research", legal),
    ],
    system_prompt="Research from all angles, then synthesize into one report.",
)
```

The coordinator decides the order and how to combine results.

## Hierarchical

Managers delegate to team leads, who delegate to workers:

```python
frontend_dev = Agent(system_prompt="Frontend developer.")
backend_dev = Agent(system_prompt="Backend developer.")
qa_engineer = Agent(system_prompt="QA engineer.")

dev_lead = Agent(tools=[
    AgentTool("frontend", "Frontend work", frontend_dev),
    AgentTool("backend", "Backend work", backend_dev),
], system_prompt="Development team lead.")

qa_lead = Agent(tools=[
    AgentTool("test", "Run tests", qa_engineer),
], system_prompt="QA team lead.")

director = Agent(tools=[
    AgentTool("development", "Development team", dev_lead),
    AgentTool("quality", "QA team", qa_lead),
], system_prompt="Engineering director.")
```

The director delegates to leads, leads delegate to workers. Each level only sees one level down.

## Tips

- **Keep system prompts specific.** The more focused each agent's role, the better the results.
- **Mix models.** Use fast/cheap models for simple sub-tasks, powerful models for complex ones.
- **Limit nesting.** Deep hierarchies add latency. Two levels is usually enough.
- **Monitor with callbacks.** Add a `CallbackHandler` to the coordinator to see the full orchestration flow.

For a complete walkthrough, see the **[Research Pipeline tutorial](../tutorials/research-pipeline.md)**.
