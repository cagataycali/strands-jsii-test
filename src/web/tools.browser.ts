/**
 * Browser-native tools — the agi.diy tool set ported to strands-jsii.
 * These tools only work in browser environments (DOM, localStorage, fetch, etc.)
 */
import { ToolHandler, FunctionTool, ToolBuilder } from '../tools/function-tool';
import { ToolRegistry } from '../tools/registry';
import { ToolDefinition } from '../tools/definition';

// ── render_ui — The Killer Feature ──────────────────────────

class RenderUIHandler extends ToolHandler {
  handle(inputJson: string): string {
    const { html, css, script, title } = JSON.parse(inputJson);
    // Emit a custom event that the host page can listen for
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('strands:render_ui', {
        detail: { html, css, script, title: title || 'component' },
      }));
    }
    return JSON.stringify({ rendered: true, title: title || 'component' });
  }
}

export const renderUiTool = new FunctionTool(
  'render_ui',
  'Render a dynamic HTML/CSS/JS component in the chat. Creates interactive UI that the user can see and interact with.',
  JSON.stringify({
    type: 'object',
    properties: {
      html: { type: 'string', description: 'HTML content to render' },
      css: { type: 'string', description: 'CSS styles (optional)' },
      script: { type: 'string', description: 'JavaScript code to execute (optional)' },
      title: { type: 'string', description: 'Component title (optional)' },
    },
    required: ['html'],
  }),
  new RenderUIHandler(),
);

// ── create_tool — Self-Modification ─────────────────────────

class CreateToolHandler extends ToolHandler {
  private registry: ToolRegistry;
  constructor(registry: ToolRegistry) { super(); this.registry = registry; }

  handle(inputJson: string): string {
    const { name, description, parameters, code } = JSON.parse(inputJson);
    if (!name || !description || !code) return JSON.stringify({ error: 'name, description, and code are required' });

    // Reserved tool names
    const reserved = ['render_ui', 'create_tool', 'list_tools', 'delete_tool', 'update_self',
      'javascript_eval', 'storage_get', 'storage_set', 'fetch_url', 'notify'];
    if (reserved.includes(name)) return JSON.stringify({ error: `Cannot override built-in tool: ${name}` });

    try {
      // Create handler from code string
      const handlerFn = new Function('input', code);
      const handler = new class extends ToolHandler {
        handle(inp: string): string {
          try {
            const params = JSON.parse(inp);
            const result = handlerFn(params);
            return typeof result === 'string' ? result : JSON.stringify({ result });
          } catch (e: any) { return JSON.stringify({ error: e.message }); }
        }
      };

      // Build schema
      const schema = parameters ? (typeof parameters === 'string' ? parameters : JSON.stringify(parameters))
        : JSON.stringify({ type: 'object', properties: {} });

      const tool = new FunctionTool(name, description, schema, handler);
      this.registry.add(tool);

      // Persist to localStorage
      if (typeof localStorage !== 'undefined') {
        const stored = JSON.parse(localStorage.getItem('strands_custom_tools') || '{}');
        stored[name] = { description, parameters: schema, code };
        localStorage.setItem('strands_custom_tools', JSON.stringify(stored));
      }

      return JSON.stringify({ success: true, tool_name: name, message: `Tool "${name}" created and registered` });
    } catch (e: any) {
      return JSON.stringify({ error: `Failed to create tool: ${e.message}` });
    }
  }
}

export function createCreateToolTool(registry: ToolRegistry): FunctionTool {
  return new FunctionTool(
    'create_tool',
    'Create a new tool at runtime. The tool persists across sessions. The code receives an input object and should return a result.',
    JSON.stringify({
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tool name (snake_case)' },
        description: { type: 'string', description: 'What the tool does' },
        parameters: { type: 'object', description: 'JSON Schema for input parameters (optional)' },
        code: { type: 'string', description: 'JavaScript function body. Receives `input` object, should return result.' },
      },
      required: ['name', 'description', 'code'],
    }),
    new CreateToolHandler(registry),
  );
}

// ── list_tools ──────────────────────────────────────────────

export function createListToolsTool(registry: ToolRegistry): FunctionTool {
  return new FunctionTool('list_tools', 'List all available tools', JSON.stringify({ type: 'object', properties: {} }),
    new class extends ToolHandler {
      handle(): string {
        const tools = registry.allTools().map(t => ({ name: t.spec.name, description: t.spec.description }));
        const custom = typeof localStorage !== 'undefined' ? Object.keys(JSON.parse(localStorage.getItem('strands_custom_tools') || '{}')) : [];
        return JSON.stringify({ tools, customTools: custom, total: tools.length });
      }
    });
}

// ── delete_tool ─────────────────────────────────────────────

export function createDeleteToolTool(registry: ToolRegistry): FunctionTool {
  return new FunctionTool('delete_tool', 'Delete a custom tool', JSON.stringify({ type: 'object', properties: { name: { type: 'string', description: 'Tool name to delete' } }, required: ['name'] }),
    new class extends ToolHandler {
      handle(inputJson: string): string {
        const { name } = JSON.parse(inputJson);
        const reserved = ['render_ui', 'create_tool', 'list_tools', 'delete_tool', 'update_self'];
        if (reserved.includes(name)) return JSON.stringify({ error: `Cannot delete built-in tool: ${name}` });
        registry.remove(name);
        if (typeof localStorage !== 'undefined') {
          const stored = JSON.parse(localStorage.getItem('strands_custom_tools') || '{}');
          delete stored[name];
          localStorage.setItem('strands_custom_tools', JSON.stringify(stored));
        }
        return JSON.stringify({ success: true, deleted: name });
      }
    });
}

// ── update_self ─────────────────────────────────────────────

export function createUpdateSelfTool(agentRef: { systemPrompt: string }): FunctionTool {
  return new FunctionTool('update_self', 'Update agent system prompt or configuration',
    JSON.stringify({ type: 'object', properties: { section: { type: 'string', enum: ['system_prompt', 'config'], description: 'What to update' }, content: { type: 'string', description: 'New content' } }, required: ['section', 'content'] }),
    new class extends ToolHandler {
      handle(inputJson: string): string {
        const { section, content } = JSON.parse(inputJson);
        if (section === 'system_prompt') {
          (agentRef as any).systemPrompt = content;
          return JSON.stringify({ success: true, updated: 'system_prompt' });
        }
        return JSON.stringify({ error: `Unknown section: ${section}` });
      }
    });
}

// ── javascript_eval ─────────────────────────────────────────

class JSEvalHandler extends ToolHandler {
  handle(inputJson: string): string {
    const { code } = JSON.parse(inputJson);
    try { return JSON.stringify({ result: String(eval(code)) }); }
    catch (e: any) { return JSON.stringify({ error: e.message }); }
  }
}

export const jsEvalTool = new FunctionTool('javascript_eval', 'Execute JavaScript code and return the result',
  JSON.stringify({ type: 'object', properties: { code: { type: 'string', description: 'JavaScript code' } }, required: ['code'] }),
  new JSEvalHandler());

// ── storage_get / storage_set ───────────────────────────────

export const storageGetTool = new FunctionTool('storage_get', 'Get a value from localStorage',
  JSON.stringify({ type: 'object', properties: { key: { type: 'string', description: 'Storage key' } }, required: ['key'] }),
  new class extends ToolHandler {
    handle(inputJson: string): string {
      const { key } = JSON.parse(inputJson);
      return JSON.stringify({ key, value: typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null });
    }
  });

export const storageSetTool = new FunctionTool('storage_set', 'Set a value in localStorage',
  JSON.stringify({ type: 'object', properties: { key: { type: 'string', description: 'Key' }, value: { type: 'string', description: 'Value' } }, required: ['key', 'value'] }),
  new class extends ToolHandler {
    handle(inputJson: string): string {
      const { key, value } = JSON.parse(inputJson);
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
      return JSON.stringify({ success: true });
    }
  });

// ── fetch_url ───────────────────────────────────────────────

export const fetchUrlTool = new FunctionTool('fetch_url', 'HTTP fetch (CORS applies)',
  JSON.stringify({ type: 'object', properties: { url: { type: 'string', description: 'URL' }, method: { type: 'string', description: 'HTTP method' }, headers: { type: 'object', description: 'Headers' }, body: { type: 'string', description: 'Request body' } }, required: ['url'] }),
  new class extends ToolHandler {
    handle(inputJson: string): string {
      // Note: This is sync but fetch is async. In practice, tools in the browser
      // may need an async tool interface. For now, return a placeholder.
      const { url } = JSON.parse(inputJson);
      return JSON.stringify({ note: 'Use javascript_eval with fetch() for async HTTP requests', url });
    }
  });

// ── notify ──────────────────────────────────────────────────

export const notifyTool = new FunctionTool('notify', 'Send a browser notification',
  JSON.stringify({ type: 'object', properties: { title: { type: 'string', description: 'Title' }, body: { type: 'string', description: 'Body' } }, required: ['title', 'body'] }),
  new class extends ToolHandler {
    handle(inputJson: string): string {
      const { title, body } = JSON.parse(inputJson);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(title, { body });
        return JSON.stringify({ sent: true });
      }
      // Try service worker
      if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SHOW_NOTIFICATION', title, body });
        return JSON.stringify({ sent: true, via: 'service_worker' });
      }
      return JSON.stringify({ sent: false, reason: 'Notifications not permitted' });
    }
  });

// ── Load persisted custom tools ─────────────────────────────

export function loadCustomTools(registry: ToolRegistry): number {
  if (typeof localStorage === 'undefined') return 0;
  try {
    const stored = JSON.parse(localStorage.getItem('strands_custom_tools') || '{}');
    let count = 0;
    for (const [name, def] of Object.entries(stored) as [string, any][]) {
      try {
        const handlerFn = new Function('input', def.code);
        const handler = new class extends ToolHandler {
          handle(inp: string): string {
            try { const params = JSON.parse(inp); const result = handlerFn(params); return typeof result === 'string' ? result : JSON.stringify({ result }); }
            catch (e: any) { return JSON.stringify({ error: e.message }); }
          }
        };
        registry.add(new FunctionTool(name, def.description, def.parameters, handler));
        count++;
      } catch {}
    }
    return count;
  } catch { return 0; }
}

// ── Convenience: get all browser tools ──────────────────────

export function getAllBrowserTools(registry: ToolRegistry, agentRef?: { systemPrompt: string }): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    renderUiTool, jsEvalTool, storageGetTool, storageSetTool, fetchUrlTool, notifyTool,
    createCreateToolTool(registry), createListToolsTool(registry), createDeleteToolTool(registry),
  ];
  if (agentRef) tools.push(createUpdateSelfTool(agentRef));
  return tools;
}
