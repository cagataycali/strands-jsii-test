# Building from Source

How to compile the SDK yourself from the TypeScript source.

## Prerequisites

- Node.js 20+
- Python 3.10+ (for Python target)
- JDK 11+ (for Java target)
- .NET 6+ (for C# target)
- Go 1.21+ (for Go target)

## Full Build

```bash
git clone https://github.com/cagataycali/strands-jsii.git
cd strands-jsii

# Install dependencies
npm install

# Compile TypeScript → jsii assembly
npx jsii

# Generate all language bindings
npx jsii-pacmak

# Apply idiomatic sugar to all targets
python3 scripts/patch-all.py
```

## Individual Targets

Build for a specific language only:

```bash
# Python
npx jsii-pacmak --targets python
python3 scripts/patch-python.py
pip install dist/python/strands_jsii-0.1.0-py3-none-any.whl

# Java
npx jsii-pacmak --targets java
python3 scripts/patch-java-csharp.py java

# C#
npx jsii-pacmak --targets dotnet
python3 scripts/patch-java-csharp.py csharp

# Go
npx jsii-pacmak --targets go
python3 scripts/patch-go.py
```

## What the Build Pipeline Does

| Step | Command | Output |
|------|---------|--------|
| Compile + validate | `npx jsii` | `.jsii` manifest + compiled JS |
| Generate bindings | `npx jsii-pacmak` | Python .whl, Java .jar, C# .nupkg, Go module |
| Apply sugar | `scripts/patch-*.py` | Language-native idioms on top of bindings |

## What the Sugar Patches Add

| Language | Script | Additions |
|----------|--------|-----------|
| Python | `patch-python.py` | `@tool`, `Agent()`, `agent("prompt")`, `agent.tool.X()`, `make_use_tool()` |
| TypeScript | `patch-typescript.ts` | Callable `Agent()`, `Proxy` tool access, `tool()` wrapper |
| Go | `patch-go.py` | `NewAgent(opts...)`, `NewTool(name, fn, params)`, `ToolFromFunc()` |
| Java | `patch-java-csharp.py` | `Sugar.toolOf()` lambdas, `@ToolMethod` annotation |
| C# | `patch-java-csharp.py` | `Sugar.ToolOf()` delegates, `LambdaToolHandler` |

Patches **only add** — they never modify jsii-generated code. The raw jsii API always works.

## Verify

```bash
python3 -c "from strands_jsii import Agent, tool; print('✅ Python ready')"
```
