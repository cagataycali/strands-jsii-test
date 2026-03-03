/**
 * Universal Model Protocol — Define once, run everywhere.
 * 
 * The insight: Every model provider does exactly 3 things:
 * 1. FORMAT REQUEST:  Bedrock Converse → Provider API format
 * 2. HTTP CALL:       Send to API (the ONLY runtime-specific part)
 * 3. PARSE RESPONSE:  Provider API response → Bedrock Converse format
 *
 * Steps 1 and 3 are PURE DATA TRANSFORMS described by JSON config.
 * Step 2 is the only thing that changes between Node.js (execSync+curl)
 * and browser (fetch+ReadableStream).
 *
 * So: define the protocol once as JSON, implement the engine twice.
 * 
 * Architecture:
 * ┌─────────────────────────────────────────────────────┐
 * │  ProviderProtocol (JSON config)                     │
 * │  ├── endpoint URL pattern                           │
 * │  ├── headers                                        │
 * │  ├── request body mapping (Bedrock → API)           │
 * │  ├── response body mapping (API → Bedrock)          │
 * │  ├── SSE event mapping (streaming)                  │
 * │  └── error classification rules                     │
 * ├─────────────────────────────────────────────────────┤
 * │  ProtocolEngine (runtime-specific, implemented 2x)  │
 * │  ├── BrowserEngine: fetch + ReadableStream          │
 * │  └── NodeEngine: execSync + curl (for jsii)         │
 * └─────────────────────────────────────────────────────┘
 */

// ── Provider Protocol Definition ────────────────────────────

export interface ProviderProtocol {
  /** Provider identifier */
  id: string;
  /** Display name */
  name: string;

  /** API endpoint configuration */
  endpoint: {
    /** URL template with ${var} placeholders. e.g. "https://api.anthropic.com/v1/messages" */
    url: string;
    /** URL template for streaming. If not set, uses url with stream flag in body. */
    streamUrl?: string;
    /** HTTP method */
    method: 'POST';
  };

  /** Headers template. Values can use ${var} for config interpolation. */
  headers: Record<string, string>;

  /** How to build the request body from Bedrock Converse format */
  request: {
    /** Top-level body field mappings */
    body: Record<string, RequestFieldMapping>;
    /** How to format system prompt */
    systemPrompt: 'string' | 'array_text' | 'system_instruction';
    /** How to format tools/functions */
    toolFormat: 'anthropic' | 'openai' | 'gemini';
    /** Flag name to enable streaming in the body. e.g. "stream" */
    streamFlag?: string;
  };

  /** Message content block format mapping (Bedrock → Provider) */
  contentMapping: {
    text: ContentBlockMapping;
    toolUse: ContentBlockMapping;
    toolResult: ContentBlockMapping;
    reasoning?: ContentBlockMapping;
    image?: ContentBlockMapping;
  };

  /** How to parse streaming SSE events */
  streaming: {
    /** SSE data prefix to strip (usually "data: ") */
    prefix: string;
    /** Done signal */
    doneSignal: string;
    /** JSON path to text delta */
    textDeltaPath: string;
    /** JSON path to tool use delta */
    toolDeltaPath?: string;
    /** JSON path to stop reason */
    stopReasonPath: string;
    /** Stop reason value mapping */
    stopReasonMap: Record<string, string>;
    /** Event type field (Anthropic uses ev.type, OpenAI uses choices[0].finish_reason) */
    eventTypePath?: string;
    /** JSON path to usage in metadata event */
    usagePaths?: { input: string; output: string };
  };

  /** Response format mapping (non-streaming) */
  response: {
    /** JSON path to message content array */
    contentPath: string;
    /** JSON path to stop reason */
    stopReasonPath: string;
    /** JSON path to usage */
    usagePaths: { input: string; output: string };
    /** Stop reason value mapping */
    stopReasonMap: Record<string, string>;
  };

  /** Error classification */
  errors: {
    /** JSON path to error message */
    messagePath: string;
    /** Patterns that indicate throttling */
    throttlePatterns: string[];
    /** Patterns that indicate context overflow */
    overflowPatterns: string[];
  };

  /** Default config values */
  defaults: {
    modelId: string;
    maxTokens: number;
    temperature?: number;
  };
}

export interface RequestFieldMapping {
  /** Target field name in the API body */
  field: string;
  /** Source: 'config' (from provider config) or 'input' (from converse args) */
  source: 'config' | 'input' | 'literal';
  /** Config key or literal value */
  value: string;
  /** Only include if value is set */
  optional?: boolean;
}

export interface ContentBlockMapping {
  /** How to transform this content type to provider format */
  format: 'anthropic' | 'openai' | 'gemini' | 'bedrock';
}

// ── Provider Config (user-facing, simple) ───────────────────

export interface ProviderConfig {
  /** Which protocol to use */
  provider: string;
  /** API key */
  apiKey: string;
  /** Model ID override */
  modelId?: string;
  /** Max tokens override */
  maxTokens?: number;
  /** Temperature override */
  temperature?: number;
  /** Top-P override */
  topP?: number;
  /** Custom base URL (for compatible endpoints) */
  baseUrl?: string;
  /** Additional headers */
  headers?: Record<string, string>;
  /** Region (for Bedrock) */
  region?: string;
  /** Proxy URL */
  proxyUrl?: string;
}

// ── Built-in Protocol Registry ──────────────────────────────

export const PROTOCOLS: Record<string, ProviderProtocol> = {};

export function registerProtocol(protocol: ProviderProtocol): void {
  PROTOCOLS[protocol.id] = protocol;
}

export function getProtocol(id: string): ProviderProtocol | undefined {
  return PROTOCOLS[id];
}
