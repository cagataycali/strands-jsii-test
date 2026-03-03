/**
 * Mesh agent tools — invoke_agent, broadcast_to_agents, list_agents, subscribe/publish.
 * These tools integrate with AgentMesh for cross-tab/device communication.
 */
import { ToolHandler, FunctionTool } from '../tools/function-tool';
import { ToolDefinition } from '../tools/definition';
import { AgentMesh } from './mesh';

export function createInvokeAgentTool(mesh: AgentMesh): FunctionTool {
  return new FunctionTool('invoke_agent', 'Send a message to another agent and wait for response',
    JSON.stringify({ type: 'object', properties: { agent_id: { type: 'string', description: 'Target agent ID' }, prompt: { type: 'string', description: 'Message to send' } }, required: ['agent_id', 'prompt'] }),
    new class extends ToolHandler {
      handle(inputJson: string): string {
        const { agent_id, prompt } = JSON.parse(inputJson);
        const agent = mesh.getAgent(agent_id);
        if (!agent) return JSON.stringify({ error: `Agent not found: ${agent_id}`, available: mesh.getAgents().map(a => a.id) });
        mesh.invoke(agent_id, prompt);
        mesh.addRing(`→ ${agent_id}: ${prompt.slice(0, 100)}`);
        return JSON.stringify({ sent: true, agent_id, agent_name: agent.name, agent_type: agent.type });
      }
    });
}

export function createBroadcastTool(mesh: AgentMesh): FunctionTool {
  return new FunctionTool('broadcast_to_agents', 'Broadcast a message to ALL agents in the mesh',
    JSON.stringify({ type: 'object', properties: { message: { type: 'string', description: 'Message to broadcast' } }, required: ['message'] }),
    new class extends ToolHandler {
      handle(inputJson: string): string {
        const { message } = JSON.parse(inputJson);
        mesh.broadcast(message);
        const agents = mesh.getAgents().filter(a => !a.isSelf);
        mesh.addRing(`📢 Broadcast: ${message.slice(0, 100)}`);
        return JSON.stringify({ broadcast: true, recipients: agents.length, agents: agents.map(a => a.id) });
      }
    });
}

export function createListAgentsTool(mesh: AgentMesh): FunctionTool {
  return new FunctionTool('list_agents', 'List all agents in the mesh (local + remote)',
    JSON.stringify({ type: 'object', properties: {} }),
    new class extends ToolHandler {
      handle(): string {
        const agents = mesh.getAgents().map(a => ({
          id: a.id, name: a.name, type: a.type, status: a.status,
          model: a.model, tools: a.toolCount ?? a.tools?.length ?? 0,
          isSelf: a.isSelf, hostname: a.hostname,
        }));
        return JSON.stringify({
          agents, total: agents.length,
          local: agents.filter(a => a.type === 'browser').length,
          remote: agents.filter(a => a.type !== 'browser').length,
          relay_connected: mesh.isRelayConnected,
          broadcast_connected: mesh.isLocalConnected,
        });
      }
    });
}

export function createGetRingTool(mesh: AgentMesh): FunctionTool {
  return new FunctionTool('get_ring_context', 'Get the shared ring context (recent activity from all agents)',
    JSON.stringify({ type: 'object', properties: { max_entries: { type: 'number', description: 'Max entries (default 20)' } } }),
    new class extends ToolHandler {
      handle(inputJson: string): string {
        const { max_entries } = JSON.parse(inputJson || '{}');
        const entries = mesh.getRing(max_entries ?? 20);
        return JSON.stringify({ entries, total: entries.length });
      }
    });
}

/** Get all mesh tools for an agent. */
export function getAllMeshTools(mesh: AgentMesh): ToolDefinition[] {
  return [
    createInvokeAgentTool(mesh),
    createBroadcastTool(mesh),
    createListAgentsTool(mesh),
    createGetRingTool(mesh),
  ];
}
