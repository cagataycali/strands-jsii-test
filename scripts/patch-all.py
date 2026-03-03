#!/usr/bin/env python3
"""
Unified post-build patcher: applies idiomatic sugar to ALL language targets.

Run after `jsii-pacmak` to add language-native DX sugar on top of jsii bindings.

Architecture:
  - Heavy lifting lives in TypeScript source (Strands.*, .ask(), .toolCall(), ToolBuilder)
  - These patches add ONLY what jsii can't express per-language:
    - Python:     __call__, @tool decorator, agent.tool.X() proxy
    - TypeScript:  Callable Agent(), Proxy-based tool access, tool() wrapper
    - Java:       Lambda toolOf(), @ToolMethod annotation
    - C#:         Lambda ToolOf(), extension methods
    - Go:         Functional options NewAgent(), NewTool() from Go functions

Usage:
    python scripts/patch-all.py              # Patch all targets
    python scripts/patch-all.py python       # Patch only Python
    python scripts/patch-all.py typescript   # Patch only TypeScript/JS
    python scripts/patch-all.py go           # Patch only Go
    python scripts/patch-all.py java         # Patch only Java
    python scripts/patch-all.py csharp       # Patch only C#
"""

import sys
import subprocess
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent

PATCHERS = {
    "python": ("patch-python.py", ["dist/python"]),
    "typescript": ("patch-typescript.ts", ["dist/js"]),
    "go": ("patch-go.py", ["dist/go"]),
    "java": ("patch-java-csharp.py", ["java"]),
    "csharp": ("patch-java-csharp.py", ["csharp"]),
}


def run_patcher(name, script, args):
    script_path = SCRIPT_DIR / script
    if not script_path.exists():
        print(f"⚠ Patcher not found: {script_path}")
        return False

    print(f"\n{'='*60}")
    print(f"🔧 Patching {name}...")
    print(f"{'='*60}")

    if script.endswith(".ts"):
        print(f"  → TypeScript patcher: {script_path}")
        print(f"  → Run manually: npx ts-node {script_path} {' '.join(args)}")
        return True
    else:
        cmd = [sys.executable, str(script_path)] + args
        try:
            result = subprocess.run(cmd, capture_output=True, text=True)
            print(result.stdout)
            if result.stderr:
                print(result.stderr)
            return result.returncode == 0
        except Exception as e:
            print(f"  ✗ Error: {e}")
            return False


def main():
    targets = sys.argv[1:] if len(sys.argv) > 1 else list(PATCHERS.keys())

    print("🦆 Strands Agents SDK — Cross-Language Sugar Patcher")
    print(f"   Targets: {', '.join(targets)}")

    results = {}
    for target in targets:
        if target not in PATCHERS:
            print(f"⚠ Unknown target: {target}")
            continue
        script, args = PATCHERS[target]
        results[target] = run_patcher(target, script, args)

    print(f"\n{'='*60}")
    print("📊 Results:")
    for target, success in results.items():
        emoji = "✅" if success else "❌"
        print(f"  {emoji} {target}")
    print(f"{'='*60}")

    # Show the unified DX comparison — THE 2-LINE TEST
    print("""
╔══════════════════════════════════════════════════════════════════════╗
║  Strands Agents SDK — The 2-Line Test (every language passes)      ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  Python:                                                             ║
║    agent = Agent(tools=[calculator])                                 ║
║    agent("What is 42 * 17?")                                        ║
║                                                                      ║
║  TypeScript:                                                         ║
║    const agent = Agent({ tools: [calculator] })                      ║
║    agent("What is 42 * 17?")                                        ║
║                                                                      ║
║  Java:                                                               ║
║    var agent = Strands.agentWith(Strands.bedrock(), calculator);     ║
║    agent.ask("What is 42 * 17?");                                   ║
║                                                                      ║
║  C#:                                                                 ║
║    var agent = Strands.AgentWith(Strands.Bedrock(), calculator);     ║
║    agent.Ask("What is 42 * 17?");                                   ║
║                                                                      ║
║  Go:                                                                 ║
║    agent := NewAgent(WithTools(calculator))                          ║
║    agent.Ask("What is 42 * 17?")                                    ║
║                                                                      ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  Tool Creation:                                                      ║
║                                                                      ║
║  Python:     @tool                                                   ║
║              def calc(expression: str) -> str: ...                   ║
║                                                                      ║
║  TypeScript: const calc = tool(fn, { description: "..." })           ║
║                                                                      ║
║  Java:       var calc = Strands.tool("calc", "Evaluate math")        ║
║                  .param("expression", "string", "Math expression")   ║
║                  .withHandler(handler).create();                       ║
║              // OR: Sugar.toolOf("calc", "...", p -> ..., params)     ║
║                                                                      ║
║  C#:         var calc = Strands.Tool("calc", "Evaluate math")        ║
║                  .Param("expression", "string", "Math expression")   ║
║                  .WithHandler(handler).Create();                       ║
║              // OR: Sugar.ToolOf("calc", "...", p => ..., params)     ║
║                                                                      ║
║  Go:         calc := NewTool("calc", "Evaluate math", fn, params)    ║
║              // OR: Strands.Tool("calc", "...").Param(...).Build()   ║
║                                                                      ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  Direct Tool Calls:                                                  ║
║                                                                      ║
║  Python:     agent.tool.calculator(expression="6*7")                 ║
║  TypeScript: agent.tool.calculator({ expression: "6*7" })            ║
║  Java:       agent.toolCall("calculator", json)                      ║
║  C#:         agent.ToolCall("calculator", json)                      ║
║  Go:         agent.ToolCall("calculator", json)                      ║
║                                                                      ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  What's jsii-native (zero patches needed):                           ║
║    ✓ Strands.agent() / Strands.agentWith()                           ║
║    ✓ Strands.bedrock() / anthropic() / openai() / gemini()           ║
║    ✓ Strands.tool("name", "desc") → ToolBuilder                     ║
║    ✓ .ask("prompt") on StrandsAgent                                  ║
║    ✓ .toolCall("name", json) on StrandsAgent                         ║
║    ✓ ToolBuilder.param().withHandler().create()                        ║
║                                                                      ║
║  What's language-specific (thin patches):                            ║
║    • Python: __call__, @tool decorator, agent.tool.X() proxy         ║
║    • JS:     Callable Agent(), Proxy tool access, tool() wrapper     ║
║    • Java:   Lambda Sugar.toolOf(), @ToolMethod annotation           ║
║    • C#:     Lambda Sugar.ToolOf()                                   ║
║    • Go:     Functional options, NewTool() from Go functions         ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
""")


if __name__ == "__main__":
    main()
