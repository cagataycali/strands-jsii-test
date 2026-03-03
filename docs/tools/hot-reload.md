# Hot Reload

`ToolWatcher` monitors a directory for Python files and automatically registers them as tools. Save a file, and it's instantly available to the agent — no restart needed.

## Basic Setup

```python
from strands_jsii import Agent, ToolWatcher

agent = Agent()
watcher = ToolWatcher(agent.tool_registry, directory="./tools")
watcher.start()
```

Now create `tools/greet.py`:

```python
def greet(name: str) -> str:
    """Greet someone by name."""
    return f"Hello, {name}!"
```

The agent can immediately call `agent.tool.greet(name="World")`. No restart, no re-import. Just save the file.

## How It Works

1. `ToolWatcher` does an initial scan of the directory for `.py` files
2. It polls the directory at a configurable interval (default: 2 seconds)
3. When a file is added or modified, it introspects the file for tool metadata
4. It auto-registers (or re-registers) the tool in the `ToolRegistry`
5. The agent's next tool call picks up the new or updated tool

## Configuration

```python
watcher = ToolWatcher(
    agent.tool_registry,
    directory="./tools",
    poll_interval_ms=2000,  # Check every 2 seconds (default)
)

watcher.start()     # Start watching
watcher.stop()      # Stop watching
watcher.scan()      # Manual scan (without polling)
watcher.running     # Check if active
watcher.directory   # Get watched directory
```

## ToolRegistry

You can also manage tools directly at runtime:

```python
registry = agent.tool_registry

registry.add(new_tool)              # Register a tool
registry.remove("old_tool")         # Remove by name → bool
registry.has("calc")                # Check if registered → bool
registry.get("calc")                # Get by name → ToolDefinition or None
registry.all_tools()                # All registered tools → list
registry.list_names()               # JSON array of names → str
registry.size                       # Count → int
registry.clear()                    # Remove all
registry.add_all([tool1, tool2])    # Register multiple
```

## Development Workflow

The typical workflow:

1. Start your agent with `ToolWatcher` pointed at `./tools/`
2. Write tool files in `./tools/` as you develop
3. Test immediately — the agent picks them up
4. Iterate on tools without restarting anything

This is especially useful for long-running agents or interactive sessions where restarting loses conversation context.
