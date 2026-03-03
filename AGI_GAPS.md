# AGI_GAPS.md — What strands-jsii/web is Missing vs agi.diy

> Analysis of [agi.diy](https://github.com/cagataycali/agi-diy) capabilities that strands-jsii/web needs to reach feature parity for browser-native agentic experiences.

## Status Legend
- 🟢 Already in strands-jsii/web
- 🟡 Partially there / easy to add
- 🔴 Missing entirely — needs implementation

---

## 1. Streaming (🔴 CRITICAL GAP)

**agi.diy**: Full SSE streaming via `async *stream()` generator — tokens render in real-time, tool calls show live status, markdown renders progressively.

**strands-jsii/web**: `converse()` returns a single `Promise<string>` — blocks until complete response. No streaming.

### What's needed:
```typescript
// New: AsyncModelProvider.stream() generator
abstract async *stream(
  messagesJson: string, systemPrompt?: string, toolSpecsJson?: string
): AsyncGenerator<StreamEvent>;

// StreamEvent types (matching agi.diy's Strands SDK):
// - modelMessageStartEvent
// - modelContentBlockStartEvent { start: { type: 'toolUseStart', name, toolUseId } }
// - modelContentBlockDeltaEvent { delta: { type: 'textDelta' | 'toolUseInputDelta', text/input } }
// - modelContentBlockStopEvent
// - modelMessageStopEvent { stopReason }
// - modelMetadataEvent { usage }
```

**Priority**: P0 — streaming is the #1 UX differentiator. Without it the browser feels dead.

---

## 2. Browser-Native Tools (🟡 PARTIAL)

### What strands-jsii/web has:
| Tool | Status |
|------|--------|
| calculator | 🟢 via ToolBuilder |
| current_time | 🟢 via ToolBuilder |
| screen_info | 🟢 via ToolBuilder |

### What agi.diy has that we're missing:

| Tool | Priority | Description |
|------|----------|-------------|
| **render_ui** | 🔴 P0 | Render HTML/CSS/JS components inline in chat — THE killer feature |
| **create_tool** | 🔴 P0 | Agent creates new tools at runtime (persisted to localStorage) |
| **update_self** | 🔴 P1 | Agent modifies its own system prompt & config |
| **javascript_eval** | 🟡 easy | Execute JS in browser (agi.diy has it, our demo has it but not in bundle) |
| **fetch_url** | 🟡 easy | HTTP fetch with CORS |
| **storage_get/set** | 🟡 easy | localStorage read/write |
| **notify** | 🔴 P1 | Browser push notifications (uses Service Worker) |
| **use_agent** | 🔴 P1 | Spawn sub-agents for parallel tasks |
| **scheduler** | 🔴 P2 | Cron-based recurring tasks |
| **invoke_agent** | 🔴 P1 | Send message to another agent, await response |
| **broadcast_to_agents** | 🔴 P1 | Fan-out message to all agents |
| **list_agents** | 🔴 P2 | Discover all agents (local + remote) |
| **invoke_remote_agent** | 🔴 P2 | Cross-tab/device agent invocation via relay |
| **subscribe_topic / publish_topic** | 🔴 P2 | Pub/sub messaging between agents |
| **scan_bluetooth** | 🔴 P3 | Discover nearby BLE agents |
| **send_to_agent** (BLE) | 🔴 P3 | Send message to BLE-discovered agent |
| **get_user_context** | 🔴 P2 | Activity state, geolocation, environment |
| **set_context / enable_context_tracking** | 🔴 P2 | Dynamic context injection into system prompt |
| **add_map_marker / pan_map / fly_to** | 🔴 P3 | Mapbox GL integration (6 map tools) |
| **google_auth / use_google / gmail_send** | 🔴 P3 | Google OAuth + APIs |
| **list_tools / delete_tool** | 🔴 P1 | Tool management at runtime |

---

## 3. Agent Mesh / Multi-Agent (🔴 CRITICAL GAP)

**agi.diy** has a full peer-to-peer agent mesh:

### Local Mesh (BroadcastChannel)
```javascript
const bus = new BroadcastChannel('agi-mesh');
// Agents in different tabs automatically discover each other
// Zero config, instant, same-origin
```
**strands-jsii/web**: No BroadcastChannel support. Each WebAgent is isolated.

### Remote Mesh (WebSocket relay)
```
Tab A ←→ WebSocket relay (ws://localhost:10000) ←→ Tab B
                    ↕
              CLI DevDuck (Zenoh)
                    ↕
              AgentCore (cloud)
                    ↕
              GitHub Actions agents
```
**strands-jsii/web**: No relay connectivity.

### Cross-Tab Credential Sync (agent-mesh.js)
```javascript
// Unified credential storage shared across ALL tabs
AgentMesh.getCredentials() → { anthropic: {apiKey}, openai: {apiKey}, ... }
AgentMesh.setCredentials(creds) → broadcasts to all tabs
```
**strands-jsii/web**: No credential management or sharing.

### What's needed:
1. `AgentMesh` class — BroadcastChannel + WebSocket relay
2. `MeshAgent` — agent that auto-registers with mesh, handles invoke requests
3. Ring context — shared activity log across all agents
4. Fan-out messaging — send to multiple agents simultaneously
5. Agent discovery — list_agents across local + remote

---

## 4. Self-Modification (🔴 GAP)

**agi.diy tools**:
- `create_tool`: Agent writes JS code → becomes a new tool → persisted to localStorage
- `update_self`: Agent modifies its own system prompt
- `list_tools` / `delete_tool`: Agent manages its tool inventory

**strands-jsii/web**: ToolRegistry supports `add()` / `remove()` but no persistence, no agent-driven tool creation.

### What's needed:
```typescript
// Tool that lets the agent create new tools
class CreateToolHandler extends ToolHandler {
  handle(inputJson) {
    const { name, description, parameters, code } = JSON.parse(inputJson);
    const handler = new Function('input', code); // or safer eval
    const tool = new FunctionTool(name, description, schemaJson, wrappedHandler);
    agent.toolRegistry.add(tool);
    localStorage.setItem('custom_tools', ...); // persist
  }
}
```

---

## 5. render_ui — The Killer Feature (🔴 P0 GAP)

agi.diy's most powerful tool: the agent generates HTML/CSS/JS and it renders LIVE in the chat.

```javascript
render_ui({
  html: '<div id="app">...</div>',
  css: '.app { background: #000; ... }',
  script: 'document.getElementById("app").addEventListener(...)',
  title: 'Interactive Chart'
})
```

This enables:
- Agent builds dashboards
- Agent creates forms that collect user input
- Agent renders charts, games, visualizations
- Agent builds its own UI tools

**strands-jsii/web**: No DOM manipulation, no component rendering.

### What's needed:
- `render_ui` tool that creates sandboxed iframes or shadow DOM
- Security: sandbox attribute, CSP headers for iframe
- Communication bridge: rendered component ↔ agent (postMessage)

---

## 6. Service Worker / PWA (🔴 GAP)

**agi.diy** (sw.js):
- Offline caching of all assets
- Background push notifications
- Background sync for queued messages
- Full PWA with manifest.json

**strands-jsii/web**: Pure JS module, no offline support, no background capabilities.

---

## 7. Vision / Multimodal (🔴 GAP)

**agi.diy** (vision.js — 46KB):
- Camera capture → send image to model
- File upload (images, PDFs, documents)
- Base64 encoding + proper format detection
- Document blocks for Bedrock Converse API

**strands-jsii/web**: ContentBlock supports image/document types in the protocol, but no browser capture or file handling utilities.

---

## 8. Voice / Speech-to-Speech (🔴 GAP)

**agi.diy** (mesh.html):
- 3 voice providers: Nova Sonic (AWS), Gemini Live, OpenAI Realtime
- AudioWorklet for mic capture (16kHz PCM)
- AudioWorklet for playback (streaming audio chunks)
- Real-time transcription display
- Interrupt detection (barge-in)

**strands-jsii/web**: No audio support.

---

## 9. Context Injection (🔴 GAP)

**agi.diy** (context-injector.js — 29KB):
- Activity tracking (user idle/active, focus/blur)
- Geolocation tracking
- Device context (battery, network, screen)
- Custom key-value context that auto-injects into system prompt
- Ring context from other agents

**strands-jsii/web**: System prompt is static. No dynamic context injection per-turn.

---

## 10. Local Model Support (🔴 GAP)

**agi.diy** (webllm.js — 18KB):
- WebLLM integration — run models in-browser via WebGPU/WASM
- Model download, caching, inference
- Same streaming interface as cloud models

**strands-jsii/web**: Cloud-only (Anthropic, OpenAI, Gemini).

---

## 11. Bedrock Converse Stream (🟡 PARTIAL)

**agi.diy**: Full AWS Event Stream binary protocol parser for `converse-stream` endpoint with Bearer token auth.

**strands-jsii/web**: Has `BedrockModelProvider` in Node.js version but no browser Bedrock provider yet (needs fetch + event stream parser).

---

## Implementation Priority Roadmap

### Phase 1 — Core Browser UX (makes it usable)
1. **Streaming** — `async *stream()` on all providers
2. **render_ui** — Agent generates live UI components
3. **create_tool** — Self-modifying tool creation + localStorage persistence

### Phase 2 — Multi-Agent Mesh (makes it powerful)
4. **BroadcastChannel mesh** — Cross-tab agent discovery
5. **WebSocket relay** — Remote agent communication
6. **Ring context** — Shared activity log
7. **use_agent / invoke_agent** — Sub-agent spawning

### Phase 3 — Sensory (makes it magical)
8. **Vision** — Camera + file upload
9. **Voice** — AudioWorklet + speech providers
10. **Context injection** — Activity tracking, geolocation
11. **Notifications** — Service Worker push

### Phase 4 — Edge (makes it autonomous)
12. **WebLLM** — Local model inference
13. **Bedrock browser** — Event stream parser
14. **PWA** — Offline + background sync
15. **Bluetooth mesh** — Physical device discovery

---

## Architecture Comparison

```
agi.diy (current):
┌─────────────────────────────────────────────────┐
│ strands.js (624KB bundled fork)                  │
│ ┌─ Agent loop (async *stream)                    │
│ ├─ 3 model providers (Anthropic/OpenAI/Bedrock)  │
│ ├─ Tool system (z schema validation)             │
│ └─ Message types (TextBlock, ToolUseBlock, etc)  │
├─────────────────────────────────────────────────┤
│ agent-mesh.js (72KB)                             │
│ ┌─ BroadcastChannel (cross-tab)                  │
│ ├─ WebSocket relay (cross-device)                │
│ ├─ Unified credentials                           │
│ └─ SPA navigation                                │
├─────────────────────────────────────────────────┤
│ Per-page: index.html (265KB) / agi.html (199KB)  │
│ ┌─ ~25 browser-native tools                      │
│ ├─ Streaming UI + markdown rendering             │
│ ├─ Multi-agent orchestration                     │
│ └─ render_ui sandboxed execution                 │
├─────────────────────────────────────────────────┤
│ Plugins: vision.js, context-injector.js,         │
│          map.js, webllm.js, sw.js                │
└─────────────────────────────────────────────────┘

strands-jsii/web (current — 25KB):
┌─────────────────────────────────────────────────┐
│ strands-jsii.web.mjs (25KB)                      │
│ ┌─ WebAgent (async invoke, NOT streaming)        │
│ ├─ 3 model providers (Anthropic/OpenAI/Gemini)   │
│ ├─ Tool system (ToolBuilder, FunctionTool)        │
│ ├─ Content types (same Bedrock Converse format)   │
│ ├─ ConversationManager (sliding window, etc)      │
│ ├─ Hooks + Callbacks                             │
│ └─ Error classification + typed errors            │
├─────────────────────────────────────────────────┤
│                   NOTHING ELSE                   │
│  No mesh, no streaming, no render_ui,            │
│  no vision, no voice, no context, no SW          │
└─────────────────────────────────────────────────┘

Target:
┌─────────────────────────────────────────────────┐
│ strands-jsii.web.mjs (core — ~30KB)              │
│ ┌─ WebAgent (async invoke + stream)              │
│ ├─ 4 providers (+ Bedrock browser)               │
│ ├─ Full tool system with persistence             │
│ ├─ All types, hooks, errors, conversation        │
│ └─ render_ui + create_tool built-in              │
├─────────────────────────────────────────────────┤
│ strands-jsii.mesh.mjs (optional — ~10KB)         │
│ ┌─ BroadcastChannel mesh                         │
│ ├─ WebSocket relay                               │
│ ├─ Ring context                                  │
│ └─ Credential sync                               │
├─────────────────────────────────────────────────┤
│ strands-jsii.voice.mjs (optional — ~8KB)         │
│ strands-jsii.vision.mjs (optional — ~5KB)        │
│ strands-jsii.context.mjs (optional — ~5KB)       │
│ strands-jsii.webllm.mjs (optional — ~3KB)        │
└─────────────────────────────────────────────────┘
```

The advantage of strands-jsii: it's **also** usable from Python/Java/Go/C# (via jsii), while agi.diy is browser-only. The web bundle is a bonus output from the same codebase.
