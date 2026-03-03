/**
 * Multi-agent tools — use_agent, scheduler, pub/sub.
 * Enables agents to spawn sub-agents, schedule tasks, and communicate via topics.
 */
import { ToolHandler, FunctionTool } from '../tools/function-tool';
import { ToolDefinition } from '../tools/definition';
import { ToolRegistry } from '../tools/registry';

// ── use_agent — Spawn sub-agents ────────────────────────────

interface SubAgentInstance {
  id: string;
  name: string;
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  status: 'idle' | 'running';
}

const _subAgents = new Map<string, SubAgentInstance>();

export const useAgentTool = new FunctionTool(
  'use_agent',
  'Create and run a sub-agent for a specific task. The sub-agent has its own system prompt and conversation history. Returns the sub-agent response.',
  JSON.stringify({
    type: 'object',
    properties: {
      agent_name: { type: 'string', description: 'Name/ID for the sub-agent' },
      system_prompt: { type: 'string', description: 'System prompt for the sub-agent' },
      prompt: { type: 'string', description: 'The task/prompt to send to the sub-agent' },
    },
    required: ['agent_name', 'prompt'],
  }),
  new class extends ToolHandler {
    handle(inputJson: string): string {
      const { agent_name, system_prompt, prompt } = JSON.parse(inputJson);
      // Create or get sub-agent
      let agent = _subAgents.get(agent_name);
      if (!agent) {
        agent = { id: agent_name, name: agent_name, systemPrompt: system_prompt ?? `You are ${agent_name}, a specialized sub-agent.`, messages: [], status: 'idle' };
        _subAgents.set(agent_name, agent);
      }
      agent.messages.push({ role: 'user', content: prompt });
      // In browser context, actual model call would go through the parent agent's model
      // For now, return a delegation signal that the parent agent loop can handle
      return JSON.stringify({
        delegated: true, agent_name, prompt,
        system_prompt: agent.systemPrompt,
        message_count: agent.messages.length,
        note: 'Sub-agent delegation queued. The parent agent should process this task.',
      });
    }
  },
);

// ── scheduler — Cron-based recurring tasks ──────────────────

interface ScheduledTask {
  id: string;
  name: string;
  prompt: string;
  intervalMs: number;
  cron?: string;
  nextRun: number;
  runs: number;
  maxRuns: number;
  timerId?: ReturnType<typeof setInterval>;
  lastResult?: string;
}

const _scheduledTasks = new Map<string, ScheduledTask>();

function parseCronToMs(cron: string): number {
  // Simple cron parser: "every Ns" "every Nm" "every Nh"
  const match = cron.match(/every\s+(\d+)\s*(s|sec|m|min|h|hr|hour)/i);
  if (match) {
    const val = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith('s')) return val * 1000;
    if (unit.startsWith('m')) return val * 60000;
    if (unit.startsWith('h')) return val * 3600000;
  }
  // Try raw milliseconds
  const ms = parseInt(cron);
  if (!isNaN(ms)) return ms;
  return 60000; // default: 1 minute
}

export const schedulerTool = new FunctionTool(
  'scheduler',
  'Schedule a task to run once or on a recurring basis. Supports "every Ns/Nm/Nh" patterns.',
  JSON.stringify({
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['create', 'list', 'cancel', 'cancel_all'], description: 'Action to perform' },
      name: { type: 'string', description: 'Task name (for create/cancel)' },
      prompt: { type: 'string', description: 'The prompt to execute (for create)' },
      interval: { type: 'string', description: 'Interval: "every 30s", "every 5m", "every 1h", or milliseconds (for create)' },
      max_runs: { type: 'number', description: 'Max number of runs (0 = unlimited, default: 1 for one-shot)' },
    },
    required: ['action'],
  }),
  new class extends ToolHandler {
    handle(inputJson: string): string {
      const { action, name, prompt, interval, max_runs } = JSON.parse(inputJson);

      switch (action) {
        case 'create': {
          if (!name || !prompt) return JSON.stringify({ error: 'name and prompt required' });
          if (_scheduledTasks.has(name)) return JSON.stringify({ error: `Task "${name}" already exists. Cancel it first.` });

          const intervalMs = interval ? parseCronToMs(interval) : 0;
          const maxRuns = max_runs ?? (intervalMs > 0 ? 0 : 1); // recurring = unlimited, one-shot = 1

          const task: ScheduledTask = {
            id: name, name, prompt, intervalMs,
            cron: interval, nextRun: Date.now() + intervalMs,
            runs: 0, maxRuns,
          };

          if (intervalMs > 0) {
            // Recurring
            task.timerId = setInterval(() => {
              task.runs++;
              task.lastResult = `[Run #${task.runs}] Triggered at ${new Date().toISOString()}`;
              // Emit event for the agent to pick up
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('strands:scheduled_task', { detail: { name, prompt, run: task.runs } }));
              }
              if (task.maxRuns > 0 && task.runs >= task.maxRuns) {
                clearInterval(task.timerId);
                _scheduledTasks.delete(name);
              }
            }, intervalMs);
          } else {
            // One-shot
            task.timerId = setTimeout(() => {
              task.runs = 1;
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('strands:scheduled_task', { detail: { name, prompt, run: 1 } }));
              }
              _scheduledTasks.delete(name);
            }, 100) as any;
          }

          _scheduledTasks.set(name, task);
          return JSON.stringify({ created: true, name, interval: interval ?? 'one-shot', maxRuns, nextRun: new Date(task.nextRun).toISOString() });
        }

        case 'list': {
          const tasks = [..._scheduledTasks.values()].map(t => ({
            name: t.name, prompt: t.prompt.slice(0, 100), interval: t.cron ?? 'one-shot',
            runs: t.runs, maxRuns: t.maxRuns, lastResult: t.lastResult,
          }));
          return JSON.stringify({ tasks, total: tasks.length });
        }

        case 'cancel': {
          if (!name) return JSON.stringify({ error: 'name required' });
          const task = _scheduledTasks.get(name);
          if (!task) return JSON.stringify({ error: `Task "${name}" not found` });
          if (task.timerId) clearInterval(task.timerId);
          _scheduledTasks.delete(name);
          return JSON.stringify({ cancelled: true, name, runs: task.runs });
        }

        case 'cancel_all': {
          const count = _scheduledTasks.size;
          for (const [, task] of _scheduledTasks) { if (task.timerId) clearInterval(task.timerId); }
          _scheduledTasks.clear();
          return JSON.stringify({ cancelled_all: true, count });
        }

        default:
          return JSON.stringify({ error: `Unknown action: ${action}` });
      }
    }
  },
);

// ── Pub/Sub Topics ──────────────────────────────────────────

const _topicSubscribers = new Map<string, Set<(msg: any) => void>>();
const _topicHistory = new Map<string, any[]>();

export const subscribeTopicTool = new FunctionTool(
  'subscribe_topic',
  'Subscribe to a topic to receive messages from other agents.',
  JSON.stringify({
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'Topic name to subscribe to' },
    },
    required: ['topic'],
  }),
  new class extends ToolHandler {
    handle(inputJson: string): string {
      const { topic } = JSON.parse(inputJson);
      if (!_topicSubscribers.has(topic)) _topicSubscribers.set(topic, new Set());
      // Return recent messages on this topic
      const history = _topicHistory.get(topic) ?? [];
      return JSON.stringify({ subscribed: true, topic, recentMessages: history.slice(-10) });
    }
  },
);

export const publishTopicTool = new FunctionTool(
  'publish_topic',
  'Publish a message to a topic. All subscribers will receive it.',
  JSON.stringify({
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'Topic name' },
      message: { type: 'string', description: 'Message to publish' },
    },
    required: ['topic', 'message'],
  }),
  new class extends ToolHandler {
    handle(inputJson: string): string {
      const { topic, message } = JSON.parse(inputJson);
      const entry = { topic, message, timestamp: Date.now(), sender: 'agent' };
      // Store in history
      if (!_topicHistory.has(topic)) _topicHistory.set(topic, []);
      const hist = _topicHistory.get(topic)!;
      hist.push(entry);
      if (hist.length > 100) _topicHistory.set(topic, hist.slice(-100));
      // Dispatch event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('strands:topic_message', { detail: entry }));
      }
      // Notify via BroadcastChannel if available
      try {
        const ch = new BroadcastChannel('strands-topics');
        ch.postMessage(entry);
        ch.close();
      } catch {}
      const subs = _topicSubscribers.get(topic)?.size ?? 0;
      return JSON.stringify({ published: true, topic, subscribers: subs });
    }
  },
);

/** Get all multi-agent tools. */
export function getAllAgentTools(): ToolDefinition[] {
  return [useAgentTool, schedulerTool, subscribeTopicTool, publishTopicTool];
}
