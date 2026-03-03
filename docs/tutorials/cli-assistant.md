# Tutorial: Build a CLI Assistant

In this tutorial, you'll build a command-line assistant that can run shell commands, read files, and answer questions about your codebase. It takes about 10 minutes.

## What You'll Build

An agent that can:

- Execute shell commands and show you the output
- Read files from your project
- Answer questions about code by combining both tools

## Prerequisites

- Python 3.10+ with `strands-jsii` installed
- AWS credentials configured (for Bedrock) — or any other provider

## Step 1: Create the Shell Tool

```python
# cli_assistant.py
from strands_jsii import Agent, tool
import subprocess

@tool
def shell(command: str) -> str:
    """Execute a shell command and return its output."""
    try:
        result = subprocess.run(
            command, shell=True, capture_output=True, text=True, timeout=30
        )
        output = result.stdout
        if result.stderr:
            output += f"\nSTDERR: {result.stderr}"
        if result.returncode != 0:
            output += f"\nExit code: {result.returncode}"
        return output or "(no output)"
    except subprocess.TimeoutExpired:
        return "Command timed out after 30 seconds"
```

The `@tool` decorator does the heavy lifting:

- Reads `command: str` and generates `{"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}`
- Uses the docstring as the tool description
- Wraps it as a `FunctionTool` ready for the agent

## Step 2: Create the File Reader Tool

```python
@tool
def read_file(path: str) -> str:
    """Read the contents of a file."""
    try:
        with open(path, 'r') as f:
            content = f.read()
        if len(content) > 10000:
            return content[:10000] + "\n... (truncated)"
        return content
    except FileNotFoundError:
        return f"File not found: {path}"
    except Exception as e:
        return f"Error reading file: {e}"
```

## Step 3: Wire It Together

```python
agent = Agent(
    tools=[shell, read_file],
    system_prompt="You are a helpful CLI assistant. You can run shell commands and read files. Be concise.",
)
```

## Step 4: Add a REPL Loop

```python
print("CLI Assistant (type 'quit' to exit)")
print("=" * 40)

while True:
    try:
        query = input("\n> ")
        if query.lower() in ("quit", "exit", "q"):
            break
        if not query.strip():
            continue

        response = agent(query)
        print(response.message.full_text)
    except KeyboardInterrupt:
        break

print("\nGoodbye!")
```

## The Complete Script

```python
#!/usr/bin/env python3
"""A CLI assistant that can run commands and read files."""

from strands_jsii import Agent, tool
import subprocess

@tool
def shell(command: str) -> str:
    """Execute a shell command and return its output."""
    try:
        result = subprocess.run(
            command, shell=True, capture_output=True, text=True, timeout=30
        )
        output = result.stdout
        if result.stderr:
            output += f"\nSTDERR: {result.stderr}"
        if result.returncode != 0:
            output += f"\nExit code: {result.returncode}"
        return output or "(no output)"
    except subprocess.TimeoutExpired:
        return "Command timed out after 30 seconds"

@tool
def read_file(path: str) -> str:
    """Read the contents of a file."""
    try:
        with open(path, 'r') as f:
            content = f.read()
        if len(content) > 10000:
            return content[:10000] + "\n... (truncated)"
        return content
    except FileNotFoundError:
        return f"File not found: {path}"
    except Exception as e:
        return f"Error reading file: {e}"

agent = Agent(
    tools=[shell, read_file],
    system_prompt="You are a helpful CLI assistant. You can run shell commands and read files. Be concise.",
)

print("CLI Assistant (type 'quit' to exit)")
while True:
    try:
        query = input("\n> ")
        if query.lower() in ("quit", "exit", "q"):
            break
        if not query.strip():
            continue
        response = agent(query)
        print(response.message.full_text)
    except KeyboardInterrupt:
        break
```

Run it:

```bash
python cli_assistant.py
```

Try these prompts:

- `"What files are in the current directory?"`
- `"Read the README.md and summarize it"`
- `"How many Python files are in this project?"`
- `"Show me the git log for the last 5 commits"`

## What's Happening Under the Hood

When you type `"How many Python files are in this project?"`:

1. The model receives your prompt plus descriptions of both tools
2. It decides to call `shell` with `command="find . -name '*.py' | wc -l"`
3. Your `shell` function runs the command and returns `"42"`
4. The model receives `"42"` and generates: *"There are 42 Python files in this project."*

The agent figured out the right shell command **on its own**. You just provided the capability — the model provided the intelligence.

## Going Further

**Add a callback handler** to see what the agent is doing:

```python
from strands_jsii import CallbackHandler

class VerboseHandler(CallbackHandler):
    def on_tool_start(self, tool_name, input_json):
        print(f"  🔧 Calling {tool_name}...")

    def on_tool_end(self, tool_name, result_json, duration_ms):
        print(f"  ✅ {tool_name} completed ({duration_ms:.0f}ms)")

agent = Agent(
    tools=[shell, read_file],
    callback_handler=VerboseHandler(),
)
```

**Add conversation management** so the agent doesn't run out of context:

```python
from strands_jsii import SlidingWindowConversationManager

agent = Agent(
    tools=[shell, read_file],
    conversation_manager=SlidingWindowConversationManager(window_size=20),
)
```

## Next Tutorial

→ **[Build a Research Pipeline](research-pipeline.md)** — Coordinate multiple specialist agents
