# Creating Tools

Tools are how agents interact with the world. You write a function — the SDK turns it into something the model can call. Every language has its own idiomatic way to define tools, plus a universal approach that works everywhere.

## Quick Reference

| Method | Languages | Best for |
|--------|-----------|----------|
| `@tool` decorator | Python | Quick, idiomatic Python tools |
| `tool(fn)` | TypeScript | Quick JS/TS tools |
| `NewTool()` / `ToolFromFunc()` | Go | Go tools with functional patterns |
| `Sugar.toolOf()` | Java | Lambda-based tools |
| `Sugar.ToolOf()` | C# | Delegate-based tools |
| `Strands.tool().param().create()` | All languages | Fluent builder (jsii-native, no patches) |
| `FunctionTool(name, desc, schema, handler)` | All languages | Maximum control (jsii-native) |

## Python: The @tool Decorator

The fastest way. Write a normal function — the decorator handles everything.

```python
from strands_jsii import tool

@tool
def calculator(expression: str) -> str:
    """Evaluate a math expression."""
    return str(eval(expression))

@tool
def search(query: str, max_results: int = 5) -> str:
    """Search the web for information."""
    return f"Results for: {query} (limit: {max_results})"
```

What the decorator does:

1. Reads the function name → tool name
2. Reads the docstring → tool description
3. Reads type hints → JSON Schema properties
4. `Optional[X]` or default values → non-required parameters
5. Wraps it as a `FunctionTool`

You can also customize the name and description:

```python
@tool(name="web_search", description="Search the web")
def search(query: str, max_results: int = 5) -> str:
    return f"Results for: {query}"
```

## TypeScript: tool(fn)

```typescript
const { tool } = require('strands-jsii');

const calculator = tool(function calculator({ expression }) {
    return { result: eval(expression) };
}, { description: "Evaluate a math expression" });

// Or with explicit parameter definitions
const search = tool({
    name: 'search',
    description: 'Search the web',
    params: {
        query: { type: 'string', description: 'Search query', required: true },
        max_results: { type: 'number', description: 'Max results', required: false },
    }
}, ({ query, max_results }) => {
    return { results: [`Result for: ${query}`] };
});
```

## Go: NewTool and ToolFromFunc

Two patterns — map-based or struct-based:

```go
// Map-based (explicit parameters)
calc := NewTool("calculator", "Evaluate math",
    func(params map[string]interface{}) (interface{}, error) {
        expr := params["expression"].(string)
        return map[string]interface{}{"result": 42}, nil
    },
    map[string]ParamDef{
        "expression": {Type: "string", Description: "Math expression", Required: true},
    },
)

// Struct-based (auto-schema from struct tags)
type CalcInput struct {
    Expression string `json:"expression" desc:"Math expression"`
}

calc := ToolFromFunc("calculator", "Evaluate math",
    func(input CalcInput) (interface{}, error) {
        return map[string]interface{}{"result": input.Expression}, nil
    },
)
```

## Java: Builders and Lambdas

```java
// Option 1: jsii-native ToolBuilder (works without patches)
var calc = Strands.tool("calculator", "Evaluate math")
    .param("expression", "string", "Math expression")
    .withHandler(handler)
    .create();

// Option 2: Java Sugar with lambdas
var calc = Sugar.toolOf("calculator", "Evaluate math",
    params -> Map.of("result", eval((String) params.get("expression"))),
    Sugar.param("expression", "string", "Math expression", true));

// Option 3: Annotation-based
public class MyTools {
    @Sugar.ToolMethod(name = "calc", description = "Evaluate math")
    public String calc(@Sugar.ToolParam(name = "expression") String expr) {
        return String.valueOf(eval(expr));
    }
}
List<FunctionTool> tools = Sugar.toolsFromClass(new MyTools());
```

## C#: Builders and Delegates

```csharp
// Option 1: jsii-native ToolBuilder
var calc = Strands.Tool("calculator", "Evaluate math")
    .Param("expression", "string", "Math expression")
    .WithHandler(handler)
    .Create();

// Option 2: C# Sugar with delegates
var calc = Sugar.ToolOf("calculator", "Evaluate math",
    p => new { result = Eval((string)p["expression"]) },
    new Sugar.ToolParam("expression", "string", "Math expression"));
```

## Universal: FunctionTool (All Languages)

For maximum control, use `FunctionTool` directly. This works in every language without any patches:

```python
from strands_jsii import FunctionTool, ToolHandler
import json

class CalcHandler(ToolHandler):
    def handle(self, input_json):
        params = json.loads(input_json)
        result = eval(params["expression"])
        return json.dumps({"result": result})

calc = FunctionTool(
    "calculator",
    "Evaluate a math expression",
    '{"type":"object","properties":{"expression":{"type":"string","description":"Math expression"}},"required":["expression"]}',
    CalcHandler()
)
```

## Universal: ToolBuilder (All Languages)

The fluent builder is also jsii-native and works everywhere:

```python
calc = Strands.tool("calculator", "Evaluate math") \
    .param("expression", "string", "Math expression") \
    .with_handler(handler) \
    .create()
```

Additional builder methods: `addStringParam`, `addNumberParam`, `addBooleanParam`, `addArrayParam`, `addObjectParam`.

## Passing Tools to an Agent

All tool types are interchangeable. Mix and match:

```python
agent = Agent(tools=[
    calculator,           # @tool decorator
    search,               # @tool decorator
    custom_function_tool, # FunctionTool
])
```

## Next Steps

- **[Direct Tool Calls](direct-tool-calls.md)** — Call tools programmatically to inject context
- **[Hot Reload](hot-reload.md)** — Drop a file, get a tool, no restart
- **[The use_X Pattern](use-x-pattern.md)** — Wrap entire libraries as tools
