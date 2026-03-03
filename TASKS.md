# TASKS.md — Docs ↔ Code Parity Tracker

## Status: ✅ Complete

---

## COMPLETED TASKS

### 1. ✅ Ollama Provider — Full Documentation Added
- Created `docs/providers/ollama.md` with setup, usage (5 languages), config table, advanced config, models, troubleshooting
- Added to `mkdocs.yml` navigation
- Updated `docs/providers/overview.md` — "Five providers", added Ollama to table and all code examples
- Updated `docs/faq.md` — "four providers", added Ollama to alternatives
- Updated `docs/index.md` — "5 model providers" in feature table
- Updated `README.md` — "5 model providers", added Ollama to provider table

### 2. ✅ API Reference Defaults Fixed
- Fixed Anthropic temperature default: `0.7` → `-1` (API default)
- Fixed OpenAI maxTokens default: `4096` → `-1` (API default)
- Fixed OpenAI temperature default: `0.7` → `-1` (API default)
- Fixed Gemini temperature default: `0.7` → `-1` (API default)
- Added `OllamaModelProvider` section to API reference

### 3. ✅ Provider Docs Configuration Tables Fixed
- `docs/providers/anthropic.md` — temperature corrected
- `docs/providers/openai.md` — maxTokens and temperature corrected
- `docs/providers/gemini.md` — temperature corrected

### 4. ✅ Strands Factory Advanced Methods Documented
- Added `Strands.anthropicWith()`, `openaiWith()`, `geminiWith()`, `ollama()`, `ollamaWith()` to API reference

### 5. ✅ RetryStrategy Parameter Names Fixed
- `docs/advanced/error-handling.md` — `max_retries` → `max_attempts`, `initial_delay_ms` → `initial_delay`
- `README.md` — same fixes, removed non-existent `retryable_errors` parameter

### 6. ✅ Strands.toolDirect() — Documented in API reference table

### 7. ✅ NullConversationManager — Mentioned in conversation management docs

### 8. ✅ SummarizingConversationManager Description Fixed
- Clarified it creates text summary, NOT LLM-based summarization
- Updated `docs/advanced/conversation-management.md` and `README.md`

### 9. ✅ PrintingCallbackHandler Import Added
- Added proper `from strands_jsii import` statement in callbacks docs

### 10. ✅ ContextAwareToolDefinition + ToolContext Documented
- Added full section to API reference with Python example and ToolContext fields table

### 11. ✅ HookRegistry Access — Verified (snake_case is correct for Python sugar)

### 12. ✅ Identifier Utility — Already in API ref (acceptable coverage)

### 14. ✅ Feature Table Provider Count Fixed — "5 model providers" everywhere

### 16. ✅ Shared Format Layer Documented
- Added section to `docs/getting-started/how-it-works.md` about `providers/formats.ts`

### 17. ✅ DirectToolCallResult Shape Documented
- Added fields table and usage example to `docs/tools/direct-tool-calls.md`

### 19. ✅ Custom Provider Tutorial Updated
- Added note that Ollama is built-in with link to provider docs

---

## CODE IMPROVEMENTS COMPLETED

### C1. ✅ OllamaModelConfig — Reformatted with multi-line fields + JSDoc
### C2. ✅ GeminiModelConfig — Reformatted with multi-line fields + JSDoc
### C3. ✅ OpenAIModelConfig — Reformatted with multi-line fields + JSDoc
### C4. ✅ JSDoc Added to OllamaModelProvider, GeminiModelProvider, OpenAIModelProvider
### C6. ✅ Ollama toolUseId Bug Fixed — Now generates unique IDs like other providers

---

## REMAINING (lower priority)

### 15. ⏳ Web Module Documentation
- `src/web/` has browser-side agents, streaming, mesh, provider engines
- Not documented yet — separate feature, could be a future docs page

### 18. ⏳ MessageAppender Abstract Class
- Exported but very internal — added to exports, users rarely need it

### C5. ⏳ RetryStrategy Jitter Documentation
- `calculateDelay` adds random jitter — not mentioned in docs
- Low priority — implementation detail

