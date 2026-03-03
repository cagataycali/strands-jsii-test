# Your First Agent

Let's build an agent that can do math and tell you the weather. By the end of this page, you'll understand the three core concepts: **agents**, **tools**, and **model providers**.

## Step 1: Define a Tool

A tool is a function the agent can call. You write the function — the SDK turns it into something the model understands.

=== "Python"
    ```python
    from strands_jsii import tool

    @tool
    def weather(city: str) -> str:
        """Get the current weather for a city."""
        # In a real app, this would call a weather API
        return f"72°F and sunny in {city}"
    ```

    The `@tool` decorator reads your function's name, docstring, and type hints, then generates the JSON Schema that the model needs. You just write a normal function.

=== "TypeScript"
    ```typescript
    const { tool } = require('strands-jsii');

    const weather = tool(function weather({ city }) {
        return { result: `72°F and sunny in ${city}` };
    }, { description: "Get the current weather for a city" });
    ```

=== "Java"
    ```java
    var weather = Strands.tool("weather", "Get the current weather for a city")
        .param("city", "string", "City name")
        .withHandler(new ToolHandler() {
            public String handle(String inputJson) {
                var params = new org.json.JSONObject(inputJson);
                return "{\"result\": \"72°F and sunny in " + params.getString("city") + "\"}";
            }
        })
        .create();
    ```

=== "Go"
    ```go
    weather := NewTool("weather", "Get the current weather for a city",
        func(params map[string]interface{}) (interface{}, error) {
            city := params["city"].(string)
            return map[string]string{"result": fmt.Sprintf("72°F and sunny in %s", city)}, nil
        },
        map[string]ParamDef{
            "city": {Type: "string", Description: "City name", Required: true},
        },
    )
    ```

=== "C#"
    ```csharp
    var weather = Strands.Tool("weather", "Get the current weather for a city")
        .Param("city", "string", "City name")
        .WithHandler(handler)
        .Create();
    ```

## Step 2: Create an Agent

An agent is a model + tools + a conversation loop. Give it tools, and it decides when to use them.

=== "Python"
    ```python
    from strands_jsii import Agent

    agent = Agent(tools=[weather])
    ```

=== "TypeScript"
    ```typescript
    const { Agent } = require('strands-jsii');
    const agent = Agent({ tools: [weather] });
    ```

=== "Java"
    ```java
    var agent = Strands.agentWith(Strands.bedrock(), weather);
    ```

=== "Go"
    ```go
    agent := NewAgent(WithTools(weather))
    ```

=== "C#"
    ```csharp
    var agent = Strands.AgentWith(Strands.Bedrock(), weather);
    ```

That's it. No configuration needed — it defaults to Amazon Bedrock with Claude Sonnet.

## Step 3: Ask It Something

=== "Python"
    ```python
    response = agent("What's the weather in Seattle and Tokyo?")
    print(response.message.full_text)
    ```

=== "TypeScript"
    ```typescript
    const response = agent("What's the weather in Seattle and Tokyo?");
    console.log(response.message.fullText);
    ```

=== "Java"
    ```java
    var response = agent.ask("What's the weather in Seattle and Tokyo?");
    System.out.println(response.getText());
    ```

=== "Go"
    ```go
    response := agent.Ask("What's the weather in Seattle and Tokyo?")
    fmt.Println(response.Message().FullText())
    ```

=== "C#"
    ```csharp
    var response = agent.Ask("What's the weather in Seattle and Tokyo?");
    Console.WriteLine(response.Text);
    ```

Here's what happens behind the scenes:

1. Your prompt goes to the model (Claude on Bedrock, by default)
2. The model sees the `weather` tool is available and decides to call it — twice (once for Seattle, once for Tokyo)
3. Each tool call runs your function and sends the result back to the model
4. The model synthesizes both results into a natural language answer
5. You get the final response

## What You Just Learned

| Concept | What it does |
|---------|-------------|
| **Tool** | A function the agent can call. You write it, the SDK wires it up. |
| **Agent** | The model + tools + conversation loop. It decides *when* to use tools. |
| **Model Provider** | Where the AI model lives. Defaults to Bedrock. Can be Anthropic, OpenAI, or Gemini. |

## The Agent Loop

Every Strands agent — regardless of language — runs the same loop:

```
User prompt → Model thinks → Does it need a tool?
                                ├── YES → Call tool → Feed result back → Model thinks again
                                └── NO  → Return response
```

The model keeps looping (think → tool → think → tool → …) until it has enough information to answer. That's the entire architecture.

## Try It: Add a Second Tool

Tools get more interesting when you combine them. Add a calculator:

=== "Python"
    ```python
    @tool
    def calculator(expression: str) -> str:
        """Evaluate a math expression."""
        return str(eval(expression))

    agent = Agent(tools=[weather, calculator])
    response = agent("If it's 72°F in Seattle and 85°F in Tokyo, what's the average?")
    ```

The model will call `weather` for both cities, then use `calculator` to compute the average. You didn't write any orchestration logic — the model figured out the sequence.

## Next Steps

- **[How It Works](how-it-works.md)** — Understand the architecture: jsii, sugar patches, and the two API layers
- **[Tutorials](../tutorials/cli-assistant.md)** — Build something real
- **[Creating Tools](../tools/creating-tools.md)** — All the ways to create tools in every language
