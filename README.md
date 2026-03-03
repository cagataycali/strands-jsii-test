# Strands Agents jsii - Multi-Language SDK Bindings

Generate **Python**, **Java**, **C#/.NET**, and **Go** libraries from the Strands Agents TypeScript SDK using [jsii](https://github.com/aws/jsii).

## 🌍 Supported Languages

| Language | Package | Status |
|----------|---------|--------|
| **TypeScript/JavaScript** | `@strands-agents/jsii` | ✅ Source |
| **Python** | `strands-agents-jsii` | ✅ Generated |
| **Java** | `io.github.strands-agents:strands-agents-jsii` | ✅ Generated |
| **C#/.NET** | `Strands.Agents.Jsii` | ✅ Generated |
| **Go** | `github.com/strands-agents/strands-agents-go` | ✅ Generated |

## 🚀 Quick Start

### TypeScript (Source)

```typescript
import { StrandsAgent, AgentConfig, BedrockModelProvider, BedrockModelConfig } from '@strands-agents/jsii';

const agent = new StrandsAgent(new AgentConfig(
  new BedrockModelProvider(new BedrockModelConfig('us.anthropic.claude-sonnet-4-20250514-v1:0')),
  'You are a helpful assistant.'
));

const response = await agent.invoke('What is the capital of France?');
console.log(response.text);
```

### Python

```python
from strands_agents_jsii import StrandsAgent, AgentConfig, BedrockModelProvider, BedrockModelConfig

agent = StrandsAgent(AgentConfig(
    model=BedrockModelProvider(BedrockModelConfig(
        model_id="us.anthropic.claude-sonnet-4-20250514-v1:0"
    )),
    system_prompt="You are a helpful assistant."
))

response = agent.invoke("What is the capital of France?")
print(response.text)
```

### Java

```java
import io.github.strands.agents.jsii.*;

StrandsAgent agent = new StrandsAgent(new AgentConfig(
    new BedrockModelProvider(new BedrockModelConfig()),
    "You are a helpful assistant.",
    Collections.emptyList(),
    50
));

AgentResponse response = agent.invoke("What is the capital of France?");
System.out.println(response.getText());
```

### C# / .NET

```csharp
using Strands.Agents.Jsii;

var agent = new StrandsAgent(new AgentConfig(
    new BedrockModelProvider(new BedrockModelConfig()),
    "You are a helpful assistant."
));

var response = await agent.Invoke("What is the capital of France?");
Console.WriteLine(response.Text);
```

### Go

```go
package main

import (
    "fmt"
    strands "github.com/strands-agents/strands-agents-go"
    "github.com/aws/jsii-runtime-go"
)

func main() {
    agent := strands.NewStrandsAgent(strands.NewAgentConfig(
        strands.NewBedrockModelProvider(strands.NewBedrockModelConfig(nil, nil, nil, nil, nil)),
        jsii.String("You are a helpful assistant."),
        nil, nil,
    ))

    response, _ := agent.Invoke(jsii.String("What is the capital of France?"))
    fmt.Println(*response.Text())
}
```

## 🔧 Custom Tools

Define tools in any language by extending `ToolDefinition`:

### Python Tool Example

```python
from strands_agents_jsii import ToolDefinition, ToolSpecification
import json

class Calculator(ToolDefinition):
    def __init__(self):
        super().__init__(ToolSpecification(
            "calculator",
            "Performs arithmetic calculations",
            json.dumps({
                "type": "object",
                "properties": {
                    "expression": {"type": "string", "description": "Math expression to evaluate"}
                },
                "required": ["expression"]
            })
        ))

    def execute(self, input_json: str) -> str:
        params = json.loads(input_json)
        result = eval(params["expression"])  # Use a safe evaluator in production!
        return json.dumps({"result": result})

# Use the tool with an agent
agent = StrandsAgent(AgentConfig(
    model=BedrockModelProvider(BedrockModelConfig()),
    system_prompt="You are a helpful math assistant.",
    tools=[Calculator()]
))

response = agent.invoke("What is 42 * 17?")
print(response.text)
```

## 🏗️ Building

### Prerequisites

- Node.js >= 20
- npm

### Build & Package

```bash
# Install dependencies
npm install

# Build with jsii compiler
npm run build

# Generate all language packages
npm run package:all

# Or generate specific languages:
npm run package:python
npm run package:java
npm run package:dotnet
npm run package:go
```

Generated packages are output to the `dist/` directory:

```
dist/
├── python/    # Python wheel and sdist
├── java/      # Maven JAR
├── dotnet/    # NuGet package
└── go/        # Go module
```

## 📐 Architecture

This project creates a **jsii-compatible wrapper layer** around the Strands Agents TypeScript SDK:

```
┌─────────────────────────────────────┐
│        Your Application Code        │
│   (Python / Java / C# / Go / TS)   │
└────────────────┬────────────────────┘
                 │
┌────────────────▼────────────────────┐
│     @strands-agents/jsii            │
│     (jsii-compatible wrappers)      │
│                                     │
│  StrandsAgent  ─── AgentConfig      │
│  BedrockModelProvider               │
│  ToolDefinition (abstract)          │
│  AgentMessage / ContentBlock        │
└────────────────┬────────────────────┘
                 │
┌────────────────▼────────────────────┐
│     AWS SDK for Bedrock             │
│     (Converse API)                  │
└─────────────────────────────────────┘
```

### Why a Wrapper?

The native Strands TypeScript SDK uses advanced TypeScript features that jsii doesn't support:
- **Async generators** (`async *stream()`) → Wrapped with Promise-based `invoke()`
- **Type exports** (`export type`) → Converted to classes and enums
- **Discriminated unions** → Modeled as classes with accessor methods
- **Generic abstract classes** → Concrete implementations
- **ESM modules** → CommonJS for jsii compatibility

## License

Apache-2.0
