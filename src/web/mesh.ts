/**
 * AgentMesh — Cross-tab and cross-device agent communication.
 * 
 * Two transport layers:
 * 1. BroadcastChannel — zero-config same-origin cross-tab (local mesh)
 * 2. WebSocket relay — cross-device via relay server (remote mesh)
 * 
 * Features:
 * - Auto-discovery of agents across tabs
 * - Ring context (shared activity log)
 * - Fan-out messaging (send to multiple agents)
 * - Credential sync across tabs
 * - invoke/broadcast/subscribe patterns
 */

// ── Types ───────────────────────────────────────────────────

export interface MeshAgent {
  id: string;
  name: string;
  type: 'local' | 'browser' | 'virtual' | 'zenoh' | 'agentcore' | 'github';
  status: 'ready' | 'streaming' | 'offline' | 'error';
  model?: string;
  tools?: string[];
  toolCount?: number;
  systemPrompt?: string;
  hostname?: string;
  description?: string;
  color?: string;
  isSelf?: boolean;
  lastSeen?: number;
}

export interface RingEntry {
  id: string;
  agentId: string;
  agentType: string;
  text: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface MeshMessage {
  type: string;
  source: { agentId: string; tabId: string };
  timestamp: number;
  payload?: any;
}

export interface MeshCredentials {
  anthropic?: { apiKey: string; model?: string };
  openai?: { apiKey: string; model?: string };
  bedrock?: { apiKey: string; region?: string; model?: string };
  gemini?: { apiKey: string; model?: string };
}

export type MeshEventHandler = (event: MeshEvent) => void;

export type MeshEvent =
  | { type: 'agent_discovered'; agent: MeshAgent }
  | { type: 'agent_removed'; agentId: string }
  | { type: 'agent_updated'; agent: MeshAgent }
  | { type: 'message_received'; fromAgentId: string; text: string; turnId?: string }
  | { type: 'ring_updated'; entry: RingEntry }
  | { type: 'credentials_updated'; credentials: MeshCredentials }
  | { type: 'connected'; transport: 'broadcast' | 'relay' }
  | { type: 'disconnected'; transport: 'broadcast' | 'relay' }
  | { type: 'stream_chunk'; agentId: string; text: string; turnId?: string }
  | { type: 'stream_end'; agentId: string; fullText: string; turnId?: string };

// ── Mesh Implementation ─────────────────────────────────────

export class AgentMesh {
  private readonly tabId: string;
  private readonly agentId: string;
  private channel: BroadcastChannel | null = null;
  private relay: WebSocket | null = null;
  private relayUrl: string = '';
  private agents: Map<string, MeshAgent> = new Map();
  private ring: RingEntry[] = [];
  private handlers: Set<MeshEventHandler> = new Set();
  private heartbeatTimer: any = null;
  private relayReconnectTimer: any = null;
  private credentials: MeshCredentials = {};

  private static readonly CHANNEL_NAME = 'strands-mesh';
  private static readonly CREDENTIALS_KEY = 'strands_mesh_credentials';
  private static readonly MAX_RING = 200;

  constructor(agentId: string, options?: { name?: string; model?: string; tools?: string[] }) {
    this.tabId = `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    this.agentId = agentId;

    // Register self
    this.agents.set(agentId, {
      id: agentId,
      name: options?.name ?? agentId,
      type: 'browser',
      status: 'ready',
      model: options?.model,
      tools: options?.tools,
      toolCount: options?.tools?.length ?? 0,
      isSelf: true,
      lastSeen: Date.now(),
    });

    // Load credentials
    this.loadCredentials();
  }

  // ── Event System ──────────────────────────────────────────

  on(handler: MeshEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emit(event: MeshEvent): void {
    for (const handler of this.handlers) {
      try { handler(event); } catch {}
    }
  }

  // ── BroadcastChannel (Local Mesh) ─────────────────────────

  startLocal(): void {
    if (typeof BroadcastChannel === 'undefined') return;
    
    this.channel = new BroadcastChannel(AgentMesh.CHANNEL_NAME);
    this.channel.onmessage = (ev: MessageEvent) => this.handleLocalMessage(ev.data);

    // Announce ourselves
    this.broadcastLocal({
      type: 'agent_announce',
      source: { agentId: this.agentId, tabId: this.tabId },
      timestamp: Date.now(),
      payload: this.getSelfAgent(),
    });

    // Heartbeat every 5s
    this.heartbeatTimer = setInterval(() => {
      this.broadcastLocal({
        type: 'agent_heartbeat',
        source: { agentId: this.agentId, tabId: this.tabId },
        timestamp: Date.now(),
        payload: { status: this.agents.get(this.agentId)?.status ?? 'ready' },
      });

      // Prune stale agents (no heartbeat in 15s)
      const now = Date.now();
      for (const [id, agent] of this.agents) {
        if (agent.isSelf) continue;
        if (agent.type === 'browser' && agent.lastSeen && now - agent.lastSeen > 15000) {
          this.agents.delete(id);
          this.emit({ type: 'agent_removed', agentId: id });
        }
      }
    }, 5000);

    this.emit({ type: 'connected', transport: 'broadcast' });
  }

  private broadcastLocal(msg: MeshMessage): void {
    try { this.channel?.postMessage(msg); } catch {}
  }

  private handleLocalMessage(msg: MeshMessage): void {
    if (!msg?.type || msg.source?.tabId === this.tabId) return;

    switch (msg.type) {
      case 'agent_announce':
      case 'agent_heartbeat': {
        const agentData = msg.payload as MeshAgent;
        const existing = this.agents.get(msg.source.agentId);
        const agent: MeshAgent = {
          ...existing,
          ...agentData,
          id: msg.source.agentId,
          type: 'browser',
          lastSeen: Date.now(),
          isSelf: false,
        };
        this.agents.set(msg.source.agentId, agent);
        this.emit(existing ? { type: 'agent_updated', agent } : { type: 'agent_discovered', agent });
        
        // Reply with our info if it's an announce
        if (msg.type === 'agent_announce') {
          this.broadcastLocal({
            type: 'agent_heartbeat',
            source: { agentId: this.agentId, tabId: this.tabId },
            timestamp: Date.now(),
            payload: this.getSelfAgent(),
          });
        }
        break;
      }

      case 'invoke': {
        const { prompt, turnId } = msg.payload;
        this.emit({ type: 'message_received', fromAgentId: msg.source.agentId, text: prompt, turnId });
        break;
      }

      case 'stream_chunk': {
        this.emit({ type: 'stream_chunk', agentId: msg.source.agentId, text: msg.payload.text, turnId: msg.payload.turnId });
        break;
      }

      case 'stream_end': {
        this.emit({ type: 'stream_end', agentId: msg.source.agentId, fullText: msg.payload.text, turnId: msg.payload.turnId });
        break;
      }

      case 'ring_entry': {
        const entry = msg.payload as RingEntry;
        this.ring.push(entry);
        if (this.ring.length > AgentMesh.MAX_RING) this.ring = this.ring.slice(-AgentMesh.MAX_RING);
        this.emit({ type: 'ring_updated', entry });
        break;
      }

      case 'credentials_updated': {
        this.loadCredentials();
        this.emit({ type: 'credentials_updated', credentials: this.credentials });
        break;
      }

      case 'agent_leave': {
        this.agents.delete(msg.source.agentId);
        this.emit({ type: 'agent_removed', agentId: msg.source.agentId });
        break;
      }
    }
  }

  // ── WebSocket Relay (Remote Mesh) ─────────────────────────

  connectRelay(url: string): void {
    this.relayUrl = url;
    this.connectRelayInternal();
  }

  private connectRelayInternal(): void {
    if (!this.relayUrl) return;

    try {
      this.relay = new WebSocket(this.relayUrl);
    } catch { return; }

    const timeout = setTimeout(() => { this.relay?.close(); }, 5000);

    this.relay.onopen = () => {
      clearTimeout(timeout);
      this.emit({ type: 'connected', transport: 'relay' });

      // Register and request agents
      this.relay!.send(JSON.stringify({ type: 'register_browser_peer', name: this.agents.get(this.agentId)?.name, model: this.agents.get(this.agentId)?.model }));
      this.relay!.send(JSON.stringify({ type: 'list_agents' }));
      this.relay!.send(JSON.stringify({ type: 'get_ring', max_entries: 50 }));
    };

    this.relay.onmessage = (ev) => {
      try { this.handleRelayMessage(JSON.parse(ev.data)); } catch {}
    };

    this.relay.onclose = () => {
      clearTimeout(timeout);
      this.emit({ type: 'disconnected', transport: 'relay' });
      // Reconnect
      if (this.relayReconnectTimer) clearTimeout(this.relayReconnectTimer);
      this.relayReconnectTimer = setTimeout(() => this.connectRelayInternal(), 5000);
    };

    this.relay.onerror = () => { clearTimeout(timeout); };
  }

  private handleRelayMessage(msg: any): void {
    switch (msg.type) {
      case 'agents_list':
      case 'zenoh_peers_update':
        for (const a of (msg.agents ?? msg.peers ?? [])) {
          const agent: MeshAgent = {
            id: a.id,
            name: a.name ?? a.hostname ?? a.id,
            type: a.type ?? 'zenoh',
            status: a.status ?? 'ready',
            model: a.model,
            hostname: a.hostname,
            tools: a.tools,
            toolCount: a.tool_count,
            systemPrompt: a.system_prompt,
            description: a.description,
            isSelf: !!a.is_self,
            lastSeen: Date.now(),
          };
          this.agents.set(agent.id, agent);
          this.emit({ type: 'agent_discovered', agent });
        }
        break;

      case 'chunk':
        this.emit({ type: 'stream_chunk', agentId: msg.agent_id, text: msg.data ?? '', turnId: msg.turn_id });
        break;

      case 'turn_end':
        this.emit({ type: 'stream_end', agentId: msg.agent_id, fullText: msg.response ?? '', turnId: msg.turn_id });
        break;

      case 'ring_context':
        this.ring = msg.entries ?? [];
        for (const entry of this.ring) this.emit({ type: 'ring_updated', entry });
        break;

      case 'ring_update':
        if (msg.entry) {
          this.ring.push(msg.entry);
          this.emit({ type: 'ring_updated', entry: msg.entry });
        }
        break;

      case 'browser_invoke':
        this.emit({ type: 'message_received', fromAgentId: msg.from_ws_id ?? 'relay', text: msg.prompt, turnId: msg.turn_id });
        break;
    }
  }

  // ── Public API ────────────────────────────────────────────

  /** Send a message to a specific agent. */
  invoke(targetAgentId: string, prompt: string, turnId?: string): void {
    const tid = turnId ?? `turn_${Date.now().toString(36)}`;
    const target = this.agents.get(targetAgentId);

    // Try local first
    this.broadcastLocal({
      type: 'invoke',
      source: { agentId: this.agentId, tabId: this.tabId },
      timestamp: Date.now(),
      payload: { prompt, turnId: tid, targetAgentId },
    });

    // Also try relay
    if (this.relay?.readyState === WebSocket.OPEN) {
      this.relay.send(JSON.stringify({
        type: 'invoke',
        agent_id: targetAgentId,
        agent_type: target?.type ?? 'zenoh',
        prompt,
        turn_id: tid,
      }));
    }
  }

  /** Broadcast to all agents. */
  broadcast(message: string): void {
    this.broadcastLocal({
      type: 'invoke',
      source: { agentId: this.agentId, tabId: this.tabId },
      timestamp: Date.now(),
      payload: { prompt: message, broadcast: true },
    });

    if (this.relay?.readyState === WebSocket.OPEN) {
      this.relay.send(JSON.stringify({ type: 'broadcast', message }));
    }
  }

  /** Stream a chunk back to the mesh (when this agent is responding). */
  streamChunk(text: string, turnId?: string): void {
    this.broadcastLocal({
      type: 'stream_chunk',
      source: { agentId: this.agentId, tabId: this.tabId },
      timestamp: Date.now(),
      payload: { text, turnId },
    });

    if (this.relay?.readyState === WebSocket.OPEN) {
      this.relay.send(JSON.stringify({ type: 'browser_stream_chunk', data: text, turn_id: turnId }));
    }
  }

  /** Signal stream end. */
  streamEnd(fullText: string, turnId?: string): void {
    this.broadcastLocal({
      type: 'stream_end',
      source: { agentId: this.agentId, tabId: this.tabId },
      timestamp: Date.now(),
      payload: { text: fullText, turnId },
    });
  }

  // ── Ring Context ──────────────────────────────────────────

  addRing(text: string, agentType?: string): void {
    const entry: RingEntry = {
      id: `ring_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      agentId: this.agentId,
      agentType: agentType ?? 'browser',
      text,
      timestamp: Date.now() / 1000,
    };

    this.ring.push(entry);
    if (this.ring.length > AgentMesh.MAX_RING) this.ring = this.ring.slice(-AgentMesh.MAX_RING);

    this.broadcastLocal({
      type: 'ring_entry',
      source: { agentId: this.agentId, tabId: this.tabId },
      timestamp: Date.now(),
      payload: entry,
    });

    if (this.relay?.readyState === WebSocket.OPEN) {
      this.relay.send(JSON.stringify({ type: 'add_ring', agent_id: this.agentId, agent_type: agentType ?? 'browser', text }));
    }

    this.emit({ type: 'ring_updated', entry });
  }

  getRing(maxEntries?: number): RingEntry[] {
    return this.ring.slice(-(maxEntries ?? 50));
  }

  clearRing(): void {
    this.ring = [];
  }

  // ── Agent Discovery ───────────────────────────────────────

  getAgents(): MeshAgent[] {
    return [...this.agents.values()];
  }

  getAgent(id: string): MeshAgent | undefined {
    return this.agents.get(id);
  }

  /** Update this agent's status in the mesh. */
  updateStatus(status: MeshAgent['status']): void {
    const self = this.agents.get(this.agentId);
    if (self) {
      self.status = status;
      this.broadcastLocal({
        type: 'agent_heartbeat',
        source: { agentId: this.agentId, tabId: this.tabId },
        timestamp: Date.now(),
        payload: self,
      });
    }
  }

  // ── Credentials ───────────────────────────────────────────

  getCredentials(): MeshCredentials {
    return { ...this.credentials };
  }

  setCredentials(creds: MeshCredentials): void {
    this.credentials = { ...this.credentials, ...creds };
    try {
      localStorage.setItem(AgentMesh.CREDENTIALS_KEY, JSON.stringify(this.credentials));
    } catch {}

    this.broadcastLocal({
      type: 'credentials_updated',
      source: { agentId: this.agentId, tabId: this.tabId },
      timestamp: Date.now(),
    });
  }

  private loadCredentials(): void {
    try {
      const stored = localStorage.getItem(AgentMesh.CREDENTIALS_KEY);
      if (stored) this.credentials = JSON.parse(stored);
    } catch {}
  }

  // ── Lifecycle ─────────────────────────────────────────────

  get isLocalConnected(): boolean { return this.channel !== null; }
  get isRelayConnected(): boolean { return this.relay?.readyState === WebSocket.OPEN; }
  get selfId(): string { return this.agentId; }

  private getSelfAgent(): MeshAgent {
    return this.agents.get(this.agentId)!;
  }

  stop(): void {
    // Announce departure
    this.broadcastLocal({
      type: 'agent_leave',
      source: { agentId: this.agentId, tabId: this.tabId },
      timestamp: Date.now(),
    });

    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.relayReconnectTimer) { clearTimeout(this.relayReconnectTimer); this.relayReconnectTimer = null; }
    this.channel?.close();
    this.channel = null;
    this.relay?.close();
    this.relay = null;
  }
}
