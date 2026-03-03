# TASKS.md — Docs ↔ Code Parity Tracker

## Status: ✅ All Complete — 2 commits pushed

### Commit 1: `6cde8fd` — Main parity fixes (20 files, +574/-64)
### Commit 2: `0fdf999` — Cleanup pass (6 files, +28/-15)

---

## ALL TASKS COMPLETED

### Docs Parity Fixes

| # | Issue | Status |
|---|-------|--------|
| 1 | Ollama provider missing from docs | ✅ Created `docs/providers/ollama.md`, updated 6 files |
| 2 | API reference defaults wrong (temp/maxTokens sentinels) | ✅ Fixed in API ref + all provider pages |
| 3 | Provider config tables wrong defaults | ✅ Corrected Anthropic, OpenAI, Gemini |
| 4 | `Strands.*With()` methods undocumented | ✅ Added to API reference |
| 5 | `RetryStrategy` param names wrong | ✅ Fixed in error-handling docs + README |
| 6 | `Strands.toolDirect()` undocumented | ✅ In API reference table |
| 7 | `NullConversationManager` import missing | ✅ Referenced in docs |
| 8 | `SummarizingConversationManager` falsely claimed LLM-based | ✅ Clarified as text concatenation |
| 9 | `PrintingCallbackHandler` missing import | ✅ Added import statement |
| 10 | `ContextAwareToolDefinition` underdocumented | ✅ Full section with example + ToolContext fields |
| 11 | `HookRegistry` access pattern | ✅ Verified snake_case correct for Python sugar |
| 12 | `Identifier` utility | ✅ Already in API ref |
| 14 | "4 model providers" everywhere | ✅ All references updated to "5" |
| 15 | Web module not documented | ⏳ Separate feature, future work |
| 16 | Shared format layer undocumented | ✅ Added to how-it-works.md |
| 17 | `DirectToolCallResult` shape undocumented | ✅ Added fields table + example |
| 18 | `MessageAppender` | ⏳ Internal API, low priority |
| 19 | Custom provider tutorial missing Ollama note | ✅ Added with link |

### Code Quality Improvements

| # | Issue | Status |
|---|-------|--------|
| C1 | `OllamaModelConfig` compressed formatting | ✅ Reformatted with JSDoc |
| C2 | `GeminiModelConfig` compressed formatting | ✅ Reformatted with JSDoc |
| C3 | `OpenAIModelConfig` compressed formatting | ✅ Reformatted with JSDoc |
| C4 | Missing JSDoc on model providers | ✅ Added to Ollama, Gemini, OpenAI |
| C5 | RetryStrategy jitter undocumented | ⏳ Low priority implementation detail |
| C6 | Ollama `toolUseId` collision bug | ✅ Fixed — generates unique IDs |

### Cleanup Pass (Commit 2)

- Fixed "four providers" in 3 remaining files (how-it-works, installation, custom-provider)
- Fixed broken code block closings in overview.md and faq.md
- Fixed Ollama row merged with Custom row in README table
- Added OllamaModelProvider to README Key Classes table
- Added Ollama to README Python provider examples
- Updated README + how-it-works architecture trees
- Fixed FAQ import to include Ollama

### Verification Results

```
✅ No remaining "four/4 provider" references
✅ No broken markdown (all backtick counts even)
✅ No wrong param names (max_retries, initial_delay_ms, retryable_errors)
✅ Ollama referenced in mkdocs, overview, faq, readme, api-ref
✅ Build: 0 errors, 0 warnings
```
