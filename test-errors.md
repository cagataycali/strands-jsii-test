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
failed 8 minutes ago in 23s
Search logs
1s
1s
2s
5s
11s

      2862 |     }));
      2863 |     const result = JSON.parse(provider.converse('[]'));
    > 2864 |     expect(result.error).toContain('Context overflow');
           |                          ^
      2865 |   });
      2866 |
      2867 |   it('handles alternative overflow: too many total text bytes', () => {

      at Object.<anonymous> (test/models.test.ts:2864:26)

  ● OpenAI — remaining branch coverage › handles alternative overflow: too many total text bytes

    expect(received).toContain(expected) // indexOf

    Expected substring: "Context overflow"
    Received string:    "too many total text bytes in request"

      2871 |     }));
      2872 |     const result = JSON.parse(provider.converse('[]'));
    > 2873 |     expect(result.error).toContain('Context overflow');
           |                          ^
      2874 |   });
      2875 | });
      2876 |

      at Object.<anonymous> (test/models.test.ts:2873:26)

  ● Ollama — remaining branch coverage › handles tool result with non-json non-text nested content

    expect(received).toBeDefined()

    Received: undefined

      2889 |     const request = captureWrittenRequest();
      2890 |     const imgMsg = request.messages.find((m: any) => m.images);
    > 2891 |     expect(imgMsg).toBeDefined();
           |                    ^
      2892 |     expect(imgMsg.role).toBe('tool');
      2893 |   });
      2894 |

      at Object.<anonymous> (test/models.test.ts:2891:20)

  ● Ollama — remaining branch coverage › handles document with txt format and string bytes

    TypeError: Cannot read properties of undefined (reading 'content')

      2905 |     provider.converse(JSON.stringify(messages));
      2906 |     const request = captureWrittenRequest();
    > 2907 |     expect(request.messages[0].content).toContain('Hello world content');
           |                                ^
      2908 |   });
      2909 | });
      2910 |

      at Object.<anonymous> (test/models.test.ts:2907:32)

  ● Gemini — remaining branch coverage › formats document with unknown format (fallback mime)

    TypeError: Cannot read properties of undefined (reading 'parts')

      2955 |     provider.converse(JSON.stringify(messages));
      2956 |     const request = captureWrittenRequest();
    > 2957 |     expect(request.contents[0].parts[0].inlineData.mimeType).toBe('application/octet-stream');
           |                                ^
      2958 |   });
      2959 |
      2960 |   it('handles functionCall response with no args', () => {

      at Object.<anonymous> (test/models.test.ts:2957:32)

PASS test/tools.test.ts
PASS test/agent.test.ts
PASS test/errors.test.ts
PASS test/hooks.test.ts
PASS test/types.test.ts
PASS test/strands.test.ts
PASS test/conversation.test.ts

Test Suites: 1 failed, 7 passed, 8 total
Tests:       30 failed, 373 passed, 403 total
Snapshots:   0 total
Time:        9.021 s
Ran all test suites.
Error: Process completed with exit code 1.
0s
0s
0s
0s
0s
0s
0s
