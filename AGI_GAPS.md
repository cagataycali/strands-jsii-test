# AGI_GAPS.md — strands-jsii/web vs agi.diy Feature Parity

> Last updated: 2026-03-03 — after full implementation pass.

## Status Legend
- ✅ Implemented in strands-jsii/web
- 🟡 Partial / external dependency needed
- ⬜ Not applicable (external library integration)

---

## 1. Streaming ✅ COMPLETE

| Feature | Status | File |
|---------|--------|------|
| `async *stream()` generator | ✅ | `streaming.ts`, `agent.stream.ts` |
| Anthropic SSE streaming | ✅ | `anthropic.stream.ts` |
| OpenAI SSE streaming | ✅ | `openai.stream.ts` |
| Gemini SSE streaming | ✅ | `gemini.stream.ts` |
| UniversalProvider (any provider, one class) | ✅ | `providers/engine.ts` |
| Non-streaming fallback | ✅ | `agent.web.ts` + `*.web.ts` |
| StreamEvent types (10 event types) | ✅ | `streaming.ts` |

---

## 2. Browser-Native Tools ✅ COMPLETE (27 tools)

### Core Tools (tools.browser.ts)
| Tool | Status | Description |
|------|--------|-------------|
| `render_ui` | ✅ | HTML/CSS/JS component rendering via CustomEvent |
| `create_tool` | ✅ | Runtime tool creation + localStorage persistence |
| `list_tools` | ✅ | List all registered tools |
| `delete_tool` | ✅ | Remove custom tools |
| `update_self` | ✅ | Modify agent system prompt |
| `javascript_eval` | ✅ | Execute JS in browser |
| `storage_get` | ✅ | localStorage read |
| `storage_set` | ✅ | localStorage write |
| `fetch_url` | ✅ | HTTP fetch |
| `notify` | ✅ | Browser + Service Worker notifications |

### Multi-Agent Tools (tools.agents.ts)
| Tool | Status | Description |
|------|--------|-------------|
| `use_agent` | ✅ | Spawn sub-agents with own system prompt |
| `scheduler` | ✅ | Cron-based recurring tasks ("every 30s/5m/1h") |
| `subscribe_topic` | ✅ | Pub/sub topic subscription |
| `publish_topic` | ✅ | Pub/sub message publishing via BroadcastChannel |

### Mesh Tools (tools.mesh.ts)
| Tool | Status | Description |
|------|--------|-------------|
| `invoke_agent` | ✅ | Send message to specific agent |
| `broadcast_to_agents` | ✅ | Fan-out to all agents |
| `list_agents` | ✅ | Discover local + remote agents |
| `get_ring_context` | ✅ | Shared activity log |

### Sensory Tools (tools.sensory.ts)
| Tool | Status | Description |
|------|--------|-------------|
| `capture_image` | ✅ | Camera/file/clipboard via CustomEvent bridge |
| `read_file` | ✅ | File picker (text/base64/arraybuffer) |
| `get_user_context` | ✅ | Geolocation, activity, device info |
| `set_context` | ✅ | Dynamic key-value context store |
| `enable_context_tracking` | ✅ | GPS watch + idle detection |
| `scan_bluetooth` | ✅ | Web Bluetooth API bridge |

### Convenience functions
| Function | Status | Description |
|----------|--------|-------------|
| `getAllBrowserTools()` | ✅ | Get all 10 core browser tools |
| `getAllAgentTools()` | ✅ | Get all 4 multi-agent tools |
| `getAllMeshTools()` | ✅ | Get all 4 mesh tools |
| `getAllSensoryTools()` | ✅ | Get all 6 sensory tools |
| `loadCustomTools()` | ✅ | Restore persisted custom tools from localStorage |
| `getDynamicContext()` | ✅ | Get context string for system prompt injection |

---

## 3. Agent Mesh ✅ COMPLETE

| Feature | Status | File |
|---------|--------|------|
| BroadcastChannel (cross-tab, zero config) | ✅ | `mesh.ts` |
| WebSocket relay (cross-device) | ✅ | `mesh.ts` |
| Ring context (shared activity log) | ✅ | `mesh.ts` |
| Credential sync across tabs | ✅ | `mesh.ts` |
| Agent auto-discovery + heartbeat + pruning | ✅ | `mesh.ts` |
| Event system (on/emit) | ✅ | `mesh.ts` |
| Stream chunk forwarding | ✅ | `mesh.ts` |

---

## 4. Self-Modification ✅ COMPLETE

| Feature | Status | File |
|---------|--------|------|
| `create_tool` (agent creates tools at runtime) | ✅ | `tools.browser.ts` |
| `update_self` (agent modifies system prompt) | ✅ | `tools.browser.ts` |
| `list_tools` / `delete_tool` | ✅ | `tools.browser.ts` |
| localStorage persistence | ✅ | `tools.browser.ts` |

---

## 5. Service Worker / PWA ✅ COMPLETE

| Feature | Status | File |
|---------|--------|------|
| `generateServiceWorker()` | ✅ | `sw.ts` |
| `registerServiceWorker()` | ✅ | `sw.ts` |
| `generateManifest()` | ✅ | `sw.ts` |
| Offline caching | ✅ | `sw.ts` |
| Push notifications | ✅ | `sw.ts` |
| Background sync support | ✅ | `sw.ts` |

---

## 6. Shared Format Definitions ✅ COMPLETE

| Feature | Status | File |
|---------|--------|------|
| Anthropic format (request + response + SSE) | ✅ | `providers/formats.ts` |
| OpenAI format (request + response + SSE) | ✅ | `providers/formats.ts` |
| Gemini format (request + response + SSE) | ✅ | `providers/formats.ts` |
| Ollama format (request + response) | ✅ | `providers/formats.ts` |
| Shared by jsii (Node.js) + web (browser) | ✅ | imported by both |
| jsii providers use shared formats | ✅ | `src/models/*.ts` |
| Web UniversalProvider uses shared formats | ✅ | `providers/engine.ts` |

---

## 7. Remaining — External Integrations ⬜

These require external library dependencies and are better as separate optional packages:

| Feature | Dependency | Suggested Package |
|---------|-----------|-------------------|
| WebLLM (local models in browser) | `@anthropic-ai/sdk` or `@webllm/webllm` | `strands-jsii-webllm` |
| Map tools (Mapbox GL) | `mapbox-gl` (80KB) | `strands-jsii-maps` |
| Google OAuth + APIs | Google Identity Services SDK | `strands-jsii-google` |
| Voice / Speech-to-Speech | Requires AudioWorklet + provider SDKs (Nova Sonic, Gemini Live, OpenAI Realtime) | `strands-jsii-voice` |

These are NOT gaps in the core SDK — they're integration plugins.

---

## Architecture

```
src/
├── providers/
│   └── formats.ts              ← SINGLE SOURCE OF TRUTH (527 lines)
│       ├── Anthropic: build + parse + SSE
│       ├── OpenAI: build + parse + SSE
│       ├── Gemini: build + parse + SSE
│       └── Ollama: build + parse
│
├── models/                      ← jsii (Python/Java/Go/C#)
│   ├── anthropic.ts  (114 lines, was 615)
│   ├── openai.ts     ( 60 lines, was 683)
│   ├── gemini.ts     ( 53 lines, was 592)
│   ├── ollama.ts     ( 56 lines, was 455)
│   └── bedrock.ts    (313 lines, AWS SDK specific)
│
├── web/                         ← browser bundle (93KB)
│   ├── streaming.ts             StreamEvent types
│   ├── agent.stream.ts          StreamingWebAgent (async *stream)
│   ├── agent.web.ts             WebAgent (async invoke)
│   ├── anthropic.stream.ts      Streaming Anthropic
│   ├── openai.stream.ts         Streaming OpenAI
│   ├── gemini.stream.ts         Streaming Gemini
│   ├── *.web.ts                 Non-streaming providers
│   ├── providers/engine.ts      UniversalProvider
│   ├── mesh.ts                  BroadcastChannel + WS relay
│   ├── tools.browser.ts         10 core browser tools
│   ├── tools.agents.ts          4 multi-agent tools
│   ├── tools.mesh.ts            4 mesh tools
│   ├── tools.sensory.ts         6 sensory tools
│   ├── sw.ts                    Service Worker + PWA
│   └── index.ts                 51 exports
│
└── (agent.ts, tools/, types/, hooks/, conversation/, errors/)
    └── Shared by both jsii + web
```

## Build Commands

```bash
# jsii build (Python/Java/Go/C# bindings)
npx jsii

# Web bundle (browser)
npm run build:web

# Both
npx jsii && npm run build:web
```

## Metrics

| Metric | Value |
|--------|-------|
| Bundle size | 93KB minified |
| Node.js deps | 0 |
| Total exports | 51 |
| Total files (web) | 20 |
| Total tools | 27 |
| jsii provider reduction | −78% (2,658 → 596 lines) |
| Format logic duplication | 0 (single source in formats.ts) |
