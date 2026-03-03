# How It Works

This page explains the architecture for people who want to understand *why* things work, not just *how* to use them. If you just want to build things, skip to [Tutorials](../tutorials/cli-assistant.md).

## The Big Idea

The SDK is written **once** in TypeScript. A tool called [jsii](https://github.com/aws/jsii) compiles that TypeScript into native bindings for Python, Java, C#, and Go. Then a set of thin "sugar" scripts add language-native idioms on top.

```
TypeScript source  →  jsii compile  →  Language bindings  →  Sugar patches  →  Ship
                                        (Python .whl)         (@tool decorator)
                                        (Java .jar)           (Sugar.toolOf lambda)
                                        (C# .nupkg)           (Sugar.ToolOf delegate)
                                        (Go module)           (NewTool, functional opts)
```

This is the same approach the [AWS CDK](https://github.com/aws/aws-cdk) uses to support multiple languages from one codebase.

## Two API Layers

Every language gives you **two** ways to use the SDK:

### Layer 1: jsii-native (works everywhere, no patches needed)

These APIs are generated directly by jsii and work identically in all five languages:

```java
// This works in Java, C#, Go, Python, and TypeScript — same API
var agent = Strands.agent();
var agent = Strands.agentWith(Strands.bedrock(), myTool);
var tool = Strands.tool("name", "desc").param("x", "string", "desc").withHandler(h).create();
agent.ask("prompt");
agent.toolCall("name", "{\"x\": \"value\"}");
```

### Layer 2: Language sugar (thin patches for native idioms)

Each language gets extra convenience on top:

| Language | Sugar | What it does |
|----------|-------|-------------|
| Python | `@tool`, `agent("prompt")`, `agent.tool.X()` | Decorators, `__call__`, attribute proxy |
| TypeScript | `tool(fn)`, `Agent()` callable, `agent.tool.X()` | Function wrapper, Proxy |
| Go | `NewAgent(opts...)`, `NewTool(fn, params)` | Functional options pattern |
| Java | `Sugar.toolOf(lambda)`, `@ToolMethod` | Lambda tools, annotation extraction |
| C# | `Sugar.ToolOf(delegate)` | Delegate-based tools |

!!! tip "Sugar is optional"
    The jsii-native API always works. Sugar just makes things feel more natural in each language. If you're writing cross-language code, stick to the `Strands.*` factory methods.

## The Agent Loop (in detail)

When you call `agent("prompt")`, here's exactly what happens:

1. **Append** your prompt as a user message
2. **Apply** the conversation manager (trim/summarize if needed)
3. **Send** messages + system prompt + tool specs to the model provider
4. **Parse** the response:
    - If `stopReason` is `end_turn` or `max_tokens` → **return** the response
    - If `stopReason` is `tool_use` → **execute** each requested tool
5. **Append** tool results as messages
6. **Check** cycle count (are we under `maxCycles`?)
7. **Loop** back to step 2

Hooks fire at each step (if registered). Callback handlers get notified of each event.

The loop is identical across all five languages — it lives in `agent.ts` and jsii distributes it.

## How Model Providers Work

All four providers (Bedrock, Anthropic, OpenAI, Gemini) normalize to the same response format internally. The agent loop doesn't care which provider you use.

Why `execSync` and `curl`? jsii methods must be **synchronous**. Bedrock uses `execSync` to call a child Node.js process with the AWS SDK. The other providers use `curl` via `execSync`. This keeps the jsii contract clean while supporting HTTP under the hood.

## Source Tree

```
strands-jsii/
├── src/                          # TypeScript source (single source of truth)
│   ├── agent.ts                  # Agent loop + .ask() + .toolCall()
│   ├── strands.ts                # Universal Strands.* factory class
│   ├── models/                   # Bedrock, Anthropic, OpenAI, Gemini providers
│   ├── tools/                    # FunctionTool, ToolBuilder, Registry, Watcher, AgentTool
│   ├── conversation/             # Sliding window, summarizing managers
│   ├── hooks/                    # Callbacks + hook registry
│   ├── errors/                   # Typed errors + retry strategy
│   └── safety/                   # Guardrails
├── scripts/
│   ├── patch-python.py           # Adds @tool, __call__, agent.tool.X()
│   ├── patch-typescript.ts       # Adds callable Agent(), Proxy, tool()
│   ├── patch-java-csharp.py      # Adds Sugar.toolOf(), @ToolMethod
│   ├── patch-go.py               # Adds NewTool(), functional options
│   └── patch-all.py              # Runs all patchers
└── dist/                         # Generated packages per language
```

## Key Design Decisions

**Why jsii?** One TypeScript source generates bindings for five languages. Fix a bug once, ship everywhere. No manual binding maintenance.

**Why per-language patches?** jsii generates the lowest-common-denominator API. Python developers expect `@tool` and `agent("prompt")`. Go developers expect functional options. Java developers expect builders and lambdas. Same concepts, native syntax.

**Why the `Strands` static factory?** It provides a universal entry point that jsii translates identically into every language. No patches needed — `Strands.agent()`, `Strands.bedrock()`, `Strands.tool()` work the same everywhere.

**Why `make_use_tool` instead of hardcoded tools?** Hardcoded tools cover a fraction of a library. `make_use_tool("boto3")` covers *everything*. The agent discovers what it needs at runtime.

## Next Steps

- **[Build a CLI Assistant](../tutorials/cli-assistant.md)** — Put this knowledge into practice
- **[Creating Tools](../tools/creating-tools.md)** — Deep dive into tool creation
- **[Building from Source](../advanced/building-from-source.md)** — Compile the SDK yourself

## Shared Provider Formats

Under `src/providers/formats.ts`, there's a shared format layer that all providers use. This is the **single source of truth** for:

- **Message formatting** — Converting Bedrock Converse format to each provider's native format
- **Tool formatting** — Converting tool specifications to each provider's tool format
- **Response parsing** — Converting each provider's response back to Bedrock Converse format
- **SSE parsing** — Converting streaming chunks for browser-side providers

This design means the Node.js providers (`src/models/`) and the browser providers (`src/web/`) share the same format logic — zero duplication. Only the transport layer differs (Node.js uses `execSync`+`curl`, browser uses `fetch`).
