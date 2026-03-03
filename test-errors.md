Skip to content
cagataycali
strands-jsii
Repository navigation
Code
Issues
Pull requests
Agents
Actions
Projects
Wiki
Security
Insights
Settings
CI
ci: web bundle + multi-provider streaming E2E workflow #37
All jobs
Run details
Annotations
1 error
build-and-test (22)
failed 7 minutes ago in 23s
Search logs
1s
1s
2s
5s
11s
Run npx jest --no-coverage
FAIL test/models.test.ts (6.128 s)
  ● AnthropicModelProvider › handles rate limit error from stdout

    expect(received).toContain(expected) // indexOf

    Expected substring: "Throttled"
    Received string:    "Rate limited"

      778 |
      779 |     const result = JSON.parse(provider.converse('[]'));
    > 780 |     expect(result.error).toContain('Throttled');
          |                          ^
      781 |   });
      782 |
      783 |   it('handles context overflow error', () => {

      at Object.<anonymous> (test/models.test.ts:780:26)

  ● AnthropicModelProvider › handles context overflow error

    expect(received).toContain(expected) // indexOf

    Expected substring: "Context overflow"
    Received string:    "prompt is too long for context window"

      790 |
      791 |     const result = JSON.parse(provider.converse('[]'));
    > 792 |     expect(result.error).toContain('Context overflow');
          |                          ^
      793 |   });
      794 |
      795 |   it('merges additional params into request body', () => {

      at Object.<anonymous> (test/models.test.ts:792:26)

  ● OllamaModelProvider › handles connection refused error

    expect(received).toContain(expected) // indexOf

    Expected substring: "Ollama server not reachable"
    Received string:    "Ollama not reachable at http://localhost:11434. Try: ollama serve"

      1446 |
      1447 |     const result = JSON.parse(provider.converse('[]'));
    > 1448 |     expect(result.error).toContain('Ollama server not reachable');
           |                          ^
0s
0s
0s
0s
0s
0s
0s
