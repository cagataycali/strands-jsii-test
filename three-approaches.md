# Strands Multi-Language SDK: Three Approaches Compared

> **tl;dr**: WASM, JSII, and Browser-native aren't competing — they serve different deployment targets. The question isn't "which one" but "which layer does your customer need."

---

## The Three Approaches

### 1. Native Per-Language (WASM / PyO3 / UniFFI)

Write the agent core in **Rust**, compile to:
- **PyO3** → native `.so` for Python (in-process, zero overhead)
- **WASM** → precompiled `.cwasm` (~2.4MB embedded)
- **UniFFI** → JNA library for Kotlin/Java (loads natively on JVM)

| ✅ Strengths | ❌ Weaknesses |
|---|---|
| Zero subprocess — loads in-process | Must **rewrite the entire agent framework in Rust** |
| Minimal memory footprint | Every model provider, tool system, hook, conversation manager — from scratch |
| Fastest cold start | Rust expertise required across the team |
| Ideal for Lambda (no extra layers) | Slower iteration — compile cycle for every change |
| Works on standard Python/JVM runtimes | No browser story (WASM can't do fetch/DOM/SSE natively) |

**Best for**: Production serverless (Lambda), embedded systems, environments where binary size and cold start matter.

---

### 2. JSII Cross-Language Bindings

Write the agent framework **once in TypeScript**, use [jsii](https://github.com/aws/jsii) to generate **idiomatic bindings** for Python, Java, C#, and Go. Thin language-specific patches add syntactic sugar (`@tool`, `agent()`, functional options).

```
TypeScript source → jsii compile → .whl / .jar / .nupkg / .go
                                    ↓
                              patch-python.py adds @tool, __call__, agent.tool.X()
                              patch-go.py adds NewAgent(WithTools(...))
                              patch-java-csharp.py adds lambda toolOf()
```

| ✅ Strengths | ❌ Weaknesses |
|---|---|
| **One codebase → five languages** | Spawns Node.js subprocess at runtime |
| Fix a bug in TS, ship to all ecosystems | Serialization overhead across process boundary |
| Full framework exists today (50+ classes) | Node.js dependency in target environments |
| Same CDK-proven approach | jsii type restrictions (no unions, no overloads, no `Map<K,V>`) |
| Idiomatic sugar per language (`@tool`, builders, functional options) | Larger deployment artifact |

**Best for**: Developer experience, polyglot teams, rapid prototyping, CDK-style "write once, use everywhere."

---

### 3. Browser-Native / Pure Web

Pure TypeScript agent framework that runs **directly in browsers, Service Workers, Deno, Bun, and Cloudflare Workers**. Zero Node.js. Pure `fetch()`. This is `strands-jsii/src/web/` — it shares types with the jsii side but has its own async agent loop.

```
WebAgent          — async non-streaming (await model.converse())
StreamingWebAgent — AsyncGenerator<StreamEvent> for progressive UI
4 streaming providers: Anthropic, OpenAI, Gemini SSE + fetch
Browser tools: DOM rendering, localStorage, camera, bluetooth, notifications
Agent mesh: BroadcastChannel (cross-tab) + WebSocket relay (cross-device)
```

| ✅ Strengths | ❌ Weaknesses |
|---|---|
| Zero subprocess, zero WASM, zero Node.js | JavaScript/TypeScript only |
| Token streaming with `AsyncGenerator` | Can't generate Python/Java/.NET bindings |
| Full browser API access (DOM, fetch, Service Worker) | Browser-only deployment target |
| Agent mesh across tabs and devices | Not suitable for server-side polyglot |
| Works on Cloudflare Workers, Deno, Bun | |
| ~2000 lines of pure TS — small, auditable | |

**Best for**: Browser UIs, PWAs, edge computing, Cloudflare Workers, real-time streaming interfaces.

---

## What's Often Missed

### strands-jsii has TWO separate runtimes

```
strands-jsii/
├── src/agent.ts              ← JSII path (sync, Node subprocess, → .whl/.jar/.nupkg)
├── src/web/agent.web.ts      ← Browser path (async, pure fetch, in-process)
├── src/web/agent.stream.ts   ← Streaming path (AsyncGenerator, SSE, real-time)
```

The `src/web/` directory is **not jsii**. It's a standalone browser agent framework that reuses jsii's type definitions (ContentBlock, ToolRegistry, hooks, errors) but runs entirely in-process with `async/await`.

### The Bedrock `execSync` is a jsii constraint, not an architecture decision

In `bedrock.ts`, the provider spawns `node` via `execSync` because jsii requires synchronous `converse()`. But `web/agent.web.ts` calls `await this.model.converse()` — fully async, no subprocess. The subprocess pattern only exists for the cross-language binding path.

### WASM can't replace the browser path

WASM gives you Rust-compiled compute, but:
- Can't call `fetch()` natively for streaming SSE
- Can't access DOM, BroadcastChannel, or Service Workers
- Can't yield `AsyncGenerator<StreamEvent>` for progressive UI rendering
- Can't run as a Cloudflare Worker or Deno Deploy function

The browser-native path already does all of this without WASM.

---

## Deployment Target Matrix

| Target | WASM/FFI | JSII (cross-lang) | Web (browser) |
|--------|:--------:|:------------------:|:-------------:|
| AWS Lambda (Python) | ✅ **Best** | ⚠️ Node overhead | ❌ |
| AWS Lambda (Java/Kotlin) | ✅ **Best** | ✅ Works | ❌ |
| Browser UI | ⚠️ Limited | ❌ | ✅ **Best** |
| Desktop Java app | ✅ Good | ✅ Good | ❌ |
| Go microservice | ✅ Good | ✅ Good | ❌ |
| Cloudflare Worker | ❌ | ❌ | ✅ **Best** |
| Service Worker / PWA | ❌ | ❌ | ✅ **Best** |
| Rapid prototyping | ❌ Slow (Rust compile) | ✅ **Best** | ✅ Good |
| "pip install & go" DX | ✅ Good | ✅ **Best** | ❌ |

---

## The Real Answer: Complementary Layers

```
┌──────────────────────────────────────────────────────┐
│                 Application Layer                     │
│    (your agent logic, tools, system prompts)          │
├───────────────┬────────────────┬─────────────────────┤
│   WASM / FFI  │     JSII       │   Web (pure TS)     │
│  Rust → .so   │  TS → 5 langs  │  browser / edge     │
│               │                │                      │
│  • Lambda     │  • Dev teams   │  • Browser UIs       │
│  • Serverless │  • Polyglot    │  • PWAs              │
│  • Embedded   │  • CDK-style   │  • Streaming         │
│  • Cold start │  • Prototyping │  • Cloudflare/Deno   │
└───────────────┴────────────────┴─────────────────────┘
```

- **WASM/FFI** = production runtime where overhead matters
- **JSII** = developer reach where "same code, 5 languages" matters
- **Web** = browser/edge where Node.js doesn't exist

They're **complementary, not competing**. Ship all three — let customers pick the layer that fits their deployment.

---

## Migration & Coexistence

The key insight: **all three can share the same API surface**. An agent written as:

```python
agent = Agent(model=Bedrock(), tools=[calculator])
response = agent("What is 42 * 17?")
```

...should work identically whether the runtime underneath is:
- A Rust `.so` loaded via PyO3 (WASM approach)
- A jsii-generated binding calling Node.js (JSII approach)
- Pure TypeScript in a browser (Web approach)

The API contract is the constant. The runtime is the variable.
