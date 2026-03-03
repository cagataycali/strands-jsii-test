#!/usr/bin/env node
/**
 * Post-build: patches TypeScript/JS distribution with idiomatic sugar.
 *
 * Most DX now lives in the TypeScript source (Strands.*, .ask(), .toolCall(), ToolBuilder).
 * This patch adds ONLY JS-specific idioms that jsii can't express:
 *   - Agent(...) as callable function (Agent("prompt") — JS can do this, jsii can't)
 *   - agent.tool.X(...) proxy via Proxy object
 *   - tool() decorator function (via function wrapper pattern)
 *   - Bedrock/Anthropic/OpenAI/Gemini shorthand functions
 *   - make_use_tool universal factory
 */

import { writeFileSync } from 'fs';
import { join } from 'path';

const SUGAR_CODE = `
// === STRANDS IDIOMATIC SUGAR (TypeScript/JS) ===
// Thin layer — Strands.*, .ask(), .toolCall(), ToolBuilder are jsii-native.
// This adds JS-specific: callable Agent(), Proxy-based agent.tool.X(), tool() wrapper.

const base = require('./index');
const { StrandsAgent, AgentConfig, BedrockModelProvider, BedrockModelConfig,
        AnthropicModelProvider, AnthropicModelConfig,
        OpenAIModelProvider, OpenAIModelConfig,
        GeminiModelProvider, GeminiModelConfig,
        FunctionTool, ToolHandler, ToolBuilder,
        Strands: _Strands } = base;

// ── Agent(...) callable wrapper ──
// JS-specific: makes agent("prompt") work as a function call
function Agent(opts = {}) {
  const config = opts instanceof AgentConfig ? opts : new AgentConfig(opts);
  const inner = new StrandsAgent(config);

  const callable = function(prompt) {
    return inner.invoke(prompt);
  };

  // Copy all properties and methods from inner agent
  Object.setPrototypeOf(callable, Object.getPrototypeOf(inner));
  for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(inner))) {
    if (key === 'constructor') continue;
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(inner), key);
    if (desc && typeof desc.get === 'function') {
      Object.defineProperty(callable, key, {
        get: () => inner[key],
        configurable: true,
      });
    } else if (typeof inner[key] === 'function') {
      callable[key] = inner[key].bind(inner);
    }
  }

  // agent.tool.X() proxy — JS-specific Proxy object
  Object.defineProperty(callable, 'tool', {
    get() {
      return new Proxy({}, {
        get(_, name) {
          if (typeof name !== 'string') return undefined;
          const reg = inner.toolRegistry;
          let toolName = name;
          if (!reg.has(toolName) && toolName.includes('_')) {
            const alt = toolName.replace(/_/g, '-');
            if (reg.has(alt)) toolName = alt;
          }
          if (!reg.has(toolName)) {
            throw new Error(\\\`Tool '\\\${name}' not found. Available: \\\${reg.listNames()}\\\`);
          }
          return (params = {}) => {
            const inputJson = JSON.stringify(params);
            const result = inner.callTool(toolName, inputJson);
            try { return JSON.parse(result.resultJson); }
            catch { return result.resultJson; }
          };
        }
      });
    }
  });

  return callable;
}

// ── Shorthand functions (JS-specific — complement jsii-native Strands.*) ──
function Bedrock(opts = {}) {
  return new BedrockModelProvider(new BedrockModelConfig(opts));
}
function Anthropic(opts = {}) {
  return new AnthropicModelProvider(new AnthropicModelConfig(
    opts.modelId, opts.apiKey, opts.maxTokens, opts.temperature, opts.baseUrl
  ));
}
function OpenAI(opts = {}) {
  return new OpenAIModelProvider(new OpenAIModelConfig(
    opts.modelId, opts.apiKey, opts.maxTokens, opts.temperature, opts.baseUrl
  ));
}
function Gemini(opts = {}) {
  return new GeminiModelProvider(new GeminiModelConfig(
    opts.modelId, opts.apiKey, opts.maxTokens, opts.temperature
  ));
}

// ── tool() decorator (JS-specific — wraps function as FunctionTool) ──
function _buildSchema(func, paramDefs) {
  if (paramDefs) {
    const properties = {};
    const required = [];
    for (const [name, def] of Object.entries(paramDefs)) {
      properties[name] = { type: def.type || 'string', description: def.description || name.replace(/_/g, ' ') };
      if (def.required !== false) required.push(name);
    }
    return JSON.stringify({ type: 'object', properties, required: required.length ? required : undefined });
  }
  const funcStr = func.toString();
  const paramMatch = funcStr.match(/\\({?([^})]*)\\}?\\)/);
  if (!paramMatch) return JSON.stringify({ type: 'object', properties: {} });
  const paramNames = paramMatch[1].split(',').map(p => p.trim().split('=')[0].trim()).filter(p => p && !p.startsWith('...'));
  const properties = {};
  const required = [];
  for (const name of paramNames) {
    properties[name] = { type: 'string', description: name.replace(/_/g, ' ') };
    required.push(name);
  }
  return JSON.stringify({ type: 'object', properties, required: required.length ? required : undefined });
}

function tool(funcOrOpts, funcOrParamDefs) {
  let func, name, description, paramDefs;
  if (typeof funcOrOpts === 'function') {
    func = funcOrOpts;
    const opts = funcOrParamDefs || {};
    name = opts.name || func.name;
    description = opts.description || (func.name ? 'Tool: ' + func.name : 'A tool');
    paramDefs = opts.params;
  } else if (typeof funcOrOpts === 'object' && typeof funcOrParamDefs === 'function') {
    func = funcOrParamDefs;
    name = funcOrOpts.name || func.name || 'unnamed_tool';
    description = funcOrOpts.description || 'A tool';
    paramDefs = funcOrOpts.params;
  } else {
    throw new Error('tool() expects (function, opts?) or (opts, function)');
  }
  const schema = _buildSchema(func, paramDefs);
  class InlineHandler extends ToolHandler {
    handle(inputJson) {
      const params = JSON.parse(inputJson);
      const result = func(params);
      if (typeof result === 'string') {
        try { JSON.parse(result); return result; } catch { return JSON.stringify({ result }); }
      }
      if (result && typeof result === 'object') return JSON.stringify(result);
      return JSON.stringify({ result });
    }
  }
  return new FunctionTool(name, description, schema, new InlineHandler());
}

// ── use_library / make_use_tool (JS-specific — Node.js require) ──
function use_library(libraryName, module, method, parameters) {
  module = module || '__discovery__';
  parameters = parameters || {};
  try {
    if (module === '__discovery__') {
      try {
        const mod = require(libraryName);
        const pub = Object.keys(mod).filter(k => !k.startsWith('_')).slice(0, 30);
        return { status: 'success', content: [{ text: JSON.stringify({ public: pub }) }] };
      } catch (e) {
        return { status: 'error', content: [{ text: libraryName + ' not found. npm install ' + libraryName }] };
      }
    }
    let target;
    try { target = require(libraryName + '/' + module); }
    catch { const lib = require(libraryName); const parts = module.split('.'); target = lib; for (const part of parts) { target = target[part]; } }
    if (method === '__describe__') {
      const info = { type: typeof target, name: target.name || String(target).slice(0, 50) };
      return { status: 'success', content: [{ text: JSON.stringify(info, null, 2) }] };
    }
    if (method) { target = target[method]; }
    if (typeof target !== 'function') { return { status: 'success', content: [{ text: JSON.stringify(target).slice(0, 3000) }] }; }
    const result = target(parameters);
    const serialized = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    return { status: 'success', content: [{ text: serialized.slice(0, 3000) }] };
  } catch (e) { return { status: 'error', content: [{ text: e.message || String(e) }] }; }
}

function make_use_tool(libraryName, description) {
  description = description || 'Universal ' + libraryName + ' access';
  return tool(
    { name: 'use_' + libraryName, description: description + ' - discover, inspect, call any ' + libraryName + ' API.' },
    function({ module, method, parameters }) { return use_library(libraryName, module, method, parameters); }
  );
}

// ── Export: jsii base + JS sugar ──
module.exports = {
  ...base,
  Agent,
  Bedrock,
  Anthropic,
  OpenAI,
  Gemini,
  tool,
  use_library,
  make_use_tool,
};
`;

function patch(distDir: string = 'lib') {
  const sugarPath = join(distDir, 'sugar.js');
  console.log(`Writing TypeScript/JS sugar to ${sugarPath}`);
  writeFileSync(sugarPath, SUGAR_CODE.trim());
  console.log('✅ TypeScript/JS sugar written (thin layer — Strands.*, .ask(), .toolCall(), ToolBuilder are jsii-native)');
  console.log('Usage: const { Agent, Bedrock, tool } = require("@strands-agents/jsii");');
}

if (require.main === module) {
  patch(process.argv[2] || 'lib');
}

export { patch };
