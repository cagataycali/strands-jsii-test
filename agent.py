from strands import Agent, tool

@tool
def hello(text: str) -> str:
    return f"Hello {text}"

agent = Agent()

agent("say hello 50 times.")