# The use_X Pattern

Wrap an **entire library** as a tool with one line. The agent discovers APIs at runtime — no hardcoded actions, no glue code, no maintenance.

```python
from strands_jsii import Agent, make_use_tool

use_boto3 = make_use_tool("boto3", "AWS SDK for Python")
agent = Agent(tools=[use_boto3])
```

Every API in boto3 is now available to the agent.

For the full walkthrough, see the **[Wrap Any Library tutorial](../tutorials/wrap-any-library.md)**.

## How It Works

Every `use_X` tool follows a 3-step workflow:

| Step | What the agent does | Example |
|------|-------------------|---------|
| **Discover** | `module="__discovery__"` — see what's available | Packages, modules, public attributes |
| **Describe** | `method="__describe__"` — inspect a specific method | Parameters, types, documentation |
| **Call** | `method="target_fn"` — execute it | Pass parameters, get results |

The agent handles this workflow automatically. You just ask it to do something.

## Universal Schema

Every `use_X` tool uses the same four parameters:

| Parameter | Type | Purpose |
|-----------|------|---------|
| `module` | string | Dotted path to module/class. `"__discovery__"` to explore. |
| `method` | string | Method to call. `"__describe__"` to inspect. |
| `parameters` | object | Keyword arguments to pass. |
| `label` | string | Human-readable description for logging. |

## Examples

```python
# AWS
use_boto3 = make_use_tool("boto3", "AWS SDK")

# Data science
use_numpy = make_use_tool("numpy", "Numerical computing")
use_pandas = make_use_tool("pandas", "Data analysis")

# HTTP
use_requests = make_use_tool("requests", "HTTP client")
```

TypeScript:

```typescript
const use_lodash = make_use_tool("lodash", "Utility library");
const use_axios = make_use_tool("axios", "HTTP client");
const use_fs = make_use_tool("fs", "File system");
```

## Direct Use (Without an Agent)

```python
from strands_jsii import use_library

# Discover
use_library("json", module="__discovery__")

# Describe
use_library("os", module="path", method="__describe__")

# Call
use_library("os", module="path", method="exists", parameters={"path": "/tmp"})
```

## Java, Go, C#

Use `UniversalToolFactory` with a language-native handler:

```java
FunctionTool tool = UniversalToolFactory.create("my_lib", "My library", new MyNativeHandler());
```
