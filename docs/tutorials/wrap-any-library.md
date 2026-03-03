# Tutorial: Wrap Any Library as a Tool

Most agent tools hardcode a fixed set of actions. The `use_X` pattern takes a different approach — it wraps an **entire library** and lets the agent discover what it needs at runtime.

## The Problem with Hardcoded Tools

```python
# You end up writing this:
@tool
def aws_tool(action: str, bucket: str = "", key: str = ""):
    if action == "list_buckets": ...
    elif action == "create_bucket": ...
    elif action == "put_object": ...
    # 200 more elif branches, and you're always behind the API
```

Every new API feature requires a code change. You're writing glue code forever.

## The Solution: One Line

```python
from strands_jsii import Agent, make_use_tool

use_boto3 = make_use_tool("boto3", "AWS SDK for Python")
agent = Agent(tools=[use_boto3])
```

That's it. Every API in boto3 is now available to the agent. When AWS adds a new service, the agent can use it immediately — no code change.

## How the Agent Uses It

The agent follows a three-step discovery workflow:

### 1. Discover — "What's available?"

The agent calls the tool with a special `__discovery__` module:

```python
agent.tool.use_boto3(module="__discovery__")
```

Returns something like:
```json
{
  "packages": ["s3", "ec2", "dynamodb", "lambda", "iam"],
  "modules": ["session", "utils"],
  "public": ["client", "resource", "Session"]
}
```

### 2. Describe — "What does this function expect?"

The agent inspects a specific method:

```python
agent.tool.use_boto3(module="", method="__describe__")
```

Returns parameter info, types, and documentation.

### 3. Call — "Do it"

The agent calls the actual function:

```python
agent.tool.use_boto3(module="", method="client", parameters={"service_name": "s3"})
```

## Full Example: AWS Infrastructure Agent

```python
from strands_jsii import Agent, make_use_tool

use_boto3 = make_use_tool("boto3", "AWS SDK for Python")

agent = Agent(
    tools=[use_boto3],
    system_prompt="You manage AWS infrastructure. Use boto3 to fulfill requests.",
)

# The agent will:
# 1. Discover boto3's API structure
# 2. Figure out how to create an S3 client
# 3. Call list_buckets()
# 4. Format and return the result
response = agent("List all my S3 buckets")
print(response.message.full_text)
```

## Mix use_X with Regular Tools

You can combine `make_use_tool` with regular `@tool` functions:

```python
from strands_jsii import Agent, tool, make_use_tool

@tool
def summarize(text: str) -> str:
    """Summarize text into bullet points."""
    return f"• Summary of: {text[:100]}..."

use_pandas = make_use_tool("pandas", "Data analysis library")
use_boto3 = make_use_tool("boto3", "AWS SDK")

agent = Agent(tools=[summarize, use_pandas, use_boto3])
agent("Download the sales CSV from S3, analyze it with pandas, and summarize the key trends")
```

## The Universal Schema

Every `use_X` tool shares the same four parameters:

| Parameter | Type | Purpose |
|-----------|------|---------|
| `module` | string | Dotted path to a module or class. Use `"__discovery__"` to explore. |
| `method` | string | Method to call. Use `"__describe__"` to inspect. |
| `parameters` | object | Keyword arguments to pass to the method. |
| `label` | string | Human-readable description for logging. |

## Error Recovery

The agent self-corrects when things go wrong. If it passes wrong parameters, it gets back the expected function signature and tries again. If a module isn't installed, it sees `pip install X` in the error.

## TypeScript Version

```typescript
const { Agent, make_use_tool } = require('strands-jsii');

const use_lodash = make_use_tool("lodash", "Utility library");
const use_axios = make_use_tool("axios", "HTTP client");

const agent = Agent({ tools: [use_lodash, use_axios] });
agent("Fetch data from https://api.example.com and group the results by category");
```

## When to Use What

| Approach | Best for |
|----------|---------|
| `@tool` / `tool()` / `NewTool()` | Custom logic, specific workflows, performance-critical tools |
| `make_use_tool()` | Exploring libraries, ad-hoc tasks, rapid prototyping |
| Both together | Production systems where you need both custom tools and library access |

## Next Tutorial

→ **[Add a Custom Model Provider](custom-provider.md)** — Connect to any LLM API
