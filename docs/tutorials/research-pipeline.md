# Tutorial: Build a Research Pipeline

In this tutorial, you'll build a multi-agent system where a coordinator delegates work to specialist agents. One researches, another writes, and a third reviews. The coordinator orchestrates the whole thing.

## What You'll Build

A pipeline that takes a topic and produces a polished article by coordinating three specialists:

1. **Researcher** — gathers information
2. **Writer** — turns research into prose
3. **Reviewer** — checks for quality and accuracy

## The Key Idea: Agent as Tool

The `AgentTool` class wraps an entire agent as a tool for another agent. The coordinator doesn't know *how* the researcher works — it just sends a prompt and gets a result back. Each sub-agent has its own tools, conversation history, and system prompt.

## Step 1: Create the Specialist Agents

```python
from strands_jsii import Agent, AgentTool, tool

# The researcher has a search tool
@tool
def search(query: str) -> str:
    """Search for information on a topic."""
    # In production, this would call a search API
    return f"Search results for '{query}': [relevant facts and data would be here]"

researcher = Agent(
    tools=[search],
    system_prompt=(
        "You are a thorough research specialist. When given a topic, "
        "use the search tool to find relevant information. Organize your "
        "findings with clear headings and cite your sources."
    ),
)

# The writer has no special tools — just good instructions
writer = Agent(
    system_prompt=(
        "You are a skilled technical writer. Take research findings and "
        "turn them into a clear, engaging article. Use simple language, "
        "concrete examples, and a logical structure."
    ),
)

# The reviewer has no special tools either
reviewer = Agent(
    system_prompt=(
        "You are a meticulous editor. Review the article for: "
        "1) Factual accuracy 2) Clarity 3) Structure 4) Missing information. "
        "Provide specific, actionable feedback."
    ),
)
```

## Step 2: Create the Coordinator

```python
coordinator = Agent(
    tools=[
        AgentTool("research", "Research a topic in depth", researcher),
        AgentTool("write", "Write an article from research findings", writer),
        AgentTool("review", "Review an article for quality", reviewer),
    ],
    system_prompt=(
        "You are a content pipeline coordinator. To produce an article:\n"
        "1. Use the research tool to gather information\n"
        "2. Use the write tool to create the article from the research\n"
        "3. Use the review tool to check quality\n"
        "4. If the review suggests improvements, revise and re-review\n"
        "Present the final article to the user."
    ),
)
```

## Step 3: Run It

```python
response = coordinator("Write an article about how WebAssembly is changing backend development")
print(response.message.full_text)
```

## What Happens When You Run This

1. The coordinator reads your request and decides to start with research
2. It calls `AgentTool("research")` with a prompt like *"Research how WebAssembly is changing backend development"*
3. The researcher agent runs its own loop — it calls `search` multiple times, synthesizes results, and returns organized findings
4. The coordinator receives the research and calls `AgentTool("write")` with the findings
5. The writer agent produces a draft article
6. The coordinator calls `AgentTool("review")` with the article
7. The reviewer provides feedback
8. If needed, the coordinator sends the article back to the writer with the feedback
9. The coordinator presents the final article

Each sub-agent runs independently with its own conversation context. The coordinator only sees the final output from each.

## The Complete Script

```python
#!/usr/bin/env python3
"""A multi-agent research pipeline."""

from strands_jsii import Agent, AgentTool, tool

@tool
def search(query: str) -> str:
    """Search for information on a topic."""
    return f"Search results for '{query}': [relevant facts would be here]"

researcher = Agent(
    tools=[search],
    system_prompt="You are a thorough research specialist. Use the search tool to find information.",
)

writer = Agent(
    system_prompt="You are a skilled technical writer. Turn research into clear articles.",
)

reviewer = Agent(
    system_prompt="You are a meticulous editor. Review for accuracy, clarity, and structure.",
)

coordinator = Agent(
    tools=[
        AgentTool("research", "Research a topic in depth", researcher),
        AgentTool("write", "Write an article from research", writer),
        AgentTool("review", "Review an article for quality", reviewer),
    ],
    system_prompt=(
        "You coordinate content production. "
        "1) Research the topic 2) Write the article 3) Review it 4) Present the final version."
    ),
)

response = coordinator("Write an article about how WebAssembly is changing backend development")
print(response.message.full_text)
```

## Variations

### Different Models for Different Agents

Use a fast model for simple tasks and a powerful model for complex ones:

```python
from strands_jsii import Bedrock

# Fast model for routine research
researcher = Agent(
    tools=[search],
    model=Bedrock(model_id="us.anthropic.claude-haiku-3-20250307-v1:0"),
    system_prompt="You are a research specialist.",
)

# Powerful model for writing
writer = Agent(
    model=Bedrock(model_id="us.anthropic.claude-sonnet-4-20250514-v1:0"),
    system_prompt="You are a skilled technical writer.",
)
```

### Fan-Out Research

Multiple researchers working in parallel (determined by the coordinator):

```python
tech_researcher = Agent(tools=[search], system_prompt="Research technical aspects only.")
market_researcher = Agent(tools=[search], system_prompt="Research market and business aspects.")
user_researcher = Agent(tools=[search], system_prompt="Research user experience and adoption.")

coordinator = Agent(
    tools=[
        AgentTool("tech_research", "Research technical aspects", tech_researcher),
        AgentTool("market_research", "Research market aspects", market_researcher),
        AgentTool("user_research", "Research user experience", user_researcher),
        AgentTool("write", "Write the article", writer),
    ],
    system_prompt="Research from all angles, then synthesize into one article.",
)
```

## Next Tutorial

→ **[Wrap Any Library as a Tool](wrap-any-library.md)** — Turn `boto3`, `pandas`, or any package into an agent tool with one line
