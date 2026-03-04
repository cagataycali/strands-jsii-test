/**
 * BedrockModelProvider v2 — eliminates execSync/writeFileSync.
 *
 * Key changes:
 * 1. AWS SDK client lives IN the JSII runtime process (reused across calls)
 * 2. No child process spawn, no temp files
 * 3. Uses Atomics.wait + SharedArrayBuffer to block on async (Deasync pattern)
 *    OR execSync("node -e ...") with inline script (no temp files)
 *
 * For true streaming back to Python, we'd need jsii to support:
 *   - Async methods (jsii doesn't support this yet)
 *   - Or a callback-based streaming protocol
 *
 * This file shows the "inline execSync" approach as the minimum viable fix,
 * and the "in-process sync" approach as the ideal.
 */

import { execSync } from 'child_process';
import { ModelProvider } from './provider';

// ════════════════════════════════════════════════════════════════
// APPROACH 1: Inline execSync (no temp files, still spawns child)
// ════════════════════════════════════════════════════════════════
//
// Eliminates: writeFileSync × 2, readFileSync × 1, unlinkSync × 2
// Still has:  child process spawn (but lighter — no disk I/O)

function converseInlineExec(config: any, request: any): string {
  const sdkPath = require.resolve('@aws-sdk/client-bedrock-runtime').replace(/\\/g, '/');
  const sdkDir = sdkPath.substring(0, sdkPath.lastIndexOf('/node_modules/') + '/node_modules/'.length)
    + '@aws-sdk/client-bedrock-runtime';

  const requestB64 = Buffer.from(JSON.stringify(request)).toString('base64');

  // Inline script — no temp files needed
  const inlineScript = `
    const{BedrockRuntimeClient,ConverseStreamCommand}=require('${sdkDir}');
    const req=JSON.parse(Buffer.from('${requestB64}','base64').toString());
    const cfg={region:'${config.region}',customUserAgent:'strands-jsii'};
    if(process.env.AWS_BEARER_TOKEN_BEDROCK)cfg.token={token:process.env.AWS_BEARER_TOKEN_BEDROCK};
    const c=new BedrockRuntimeClient(cfg);
    (async()=>{
      const r=await c.send(new ConverseStreamCommand(req));
      const blocks=[];let idx=-1,role='assistant',stop='end_turn',usage={},hasTU=false;
      for await(const ch of r.stream){
        if(ch.contentBlockStart){
          idx=ch.contentBlockStart.contentBlockIndex??++idx;
          const s=ch.contentBlockStart.start||{};
          blocks[idx]=s.toolUse?{toolUse:{toolUseId:s.toolUse.toolUseId,name:s.toolUse.name,input:''}}:{text:''};
          if(s.toolUse)hasTU=true;
        }
        if(ch.contentBlockDelta){
          const d=ch.contentBlockDelta.delta||{},i=ch.contentBlockDelta.contentBlockIndex??idx;
          if(!blocks[i])blocks[i]={text:''};
          if(d.text!==undefined)blocks[i].text=(blocks[i].text||'')+d.text;
          if(d.toolUse&&blocks[i].toolUse)blocks[i].toolUse.input+=d.toolUse.input||'';
        }
        if(ch.contentBlockStop){
          const i=ch.contentBlockStop.contentBlockIndex??idx,b=blocks[i];
          if(b?.toolUse&&typeof b.toolUse.input==='string')try{b.toolUse.input=JSON.parse(b.toolUse.input)}catch{b.toolUse.input={}}
        }
        if(ch.messageStop){stop=ch.messageStop.stopReason||'end_turn';if(hasTU&&stop==='end_turn')stop='tool_use'}
        if(ch.metadata?.usage)usage=ch.metadata.usage;
      }
      process.stdout.write(JSON.stringify({output:{message:{role,content:blocks.filter(Boolean)}},stopReason:stop,usage:{inputTokens:usage.inputTokens||0,outputTokens:usage.outputTokens||0}}));
    })().catch(e=>{process.stdout.write(JSON.stringify({error:e.message}));process.exit(1)});
  `;

  try {
    return execSync(`node -e ${JSON.stringify(inlineScript)}`, {
      encoding: 'utf-8',
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
      env: process.env,
    }).trim();
  } catch (error: any) {
    return error.stdout?.trim() || JSON.stringify({ error: error.message });
  }
}


// ════════════════════════════════════════════════════════════════
// APPROACH 2: In-process sync via worker_threads (IDEAL)
// ════════════════════════════════════════════════════════════════
//
// Eliminates: child process spawn, temp files, disk I/O
// The AWS SDK runs in the SAME Node.js process as the JSII runtime.
// Uses a Worker thread + Atomics.wait to synchronously block.

function converseInProcess(config: any, request: any): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Worker } = require('worker_threads');

  const workerCode = `
    const { parentPort, workerData } = require('worker_threads');
    const { BedrockRuntimeClient, ConverseStreamCommand } = require('${
      require.resolve('@aws-sdk/client-bedrock-runtime').replace(/\\/g, '/')
        .replace(/\/[^/]+$/, '')  // get the package dir
    }');

    (async () => {
      const { request, region } = workerData;
      const cfg = { region, customUserAgent: 'strands-jsii' };
      if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
        cfg.token = { token: process.env.AWS_BEARER_TOKEN_BEDROCK };
      }
      const client = new BedrockRuntimeClient(cfg);
      const response = await client.send(new ConverseStreamCommand(request));

      const blocks = [];
      let idx = -1, role = 'assistant', stop = 'end_turn', usage = {}, hasTU = false;

      for await (const chunk of response.stream) {
        // Could emit per-chunk here for streaming!
        // parentPort.postMessage({ type: 'chunk', data: chunk });

        if (chunk.contentBlockStart) {
          idx = chunk.contentBlockStart.contentBlockIndex ?? ++idx;
          const s = chunk.contentBlockStart.start || {};
          blocks[idx] = s.toolUse
            ? { toolUse: { toolUseId: s.toolUse.toolUseId, name: s.toolUse.name, input: '' } }
            : { text: '' };
          if (s.toolUse) hasTU = true;
        }
        if (chunk.contentBlockDelta) {
          const d = chunk.contentBlockDelta.delta || {};
          const i = chunk.contentBlockDelta.contentBlockIndex ?? idx;
          if (!blocks[i]) blocks[i] = { text: '' };
          if (d.text !== undefined) blocks[i].text = (blocks[i].text || '') + d.text;
          if (d.toolUse && blocks[i].toolUse) blocks[i].toolUse.input += d.toolUse.input || '';
        }
        if (chunk.contentBlockStop) {
          const i = chunk.contentBlockStop.contentBlockIndex ?? idx;
          const b = blocks[i];
          if (b?.toolUse && typeof b.toolUse.input === 'string') {
            try { b.toolUse.input = JSON.parse(b.toolUse.input); } catch { b.toolUse.input = {}; }
          }
        }
        if (chunk.messageStop) {
          stop = chunk.messageStop.stopReason || 'end_turn';
          if (hasTU && stop === 'end_turn') stop = 'tool_use';
        }
        if (chunk.metadata?.usage) usage = chunk.metadata.usage;
      }

      parentPort.postMessage({
        type: 'result',
        data: {
          output: { message: { role, content: blocks.filter(Boolean) } },
          stopReason: stop,
          usage: { inputTokens: usage.inputTokens || 0, outputTokens: usage.outputTokens || 0 },
        },
      });
    })().catch(e => {
      parentPort.postMessage({ type: 'error', data: e.message });
    });
  `;

  // Synchronously wait for worker result using SharedArrayBuffer + Atomics
  const sharedBuffer = new SharedArrayBuffer(4);
  const signal = new Int32Array(sharedBuffer);
  let result: any = null;

  const worker = new Worker(workerCode, {
    eval: true,
    workerData: { request, region: config.region, sharedBuffer },
  });

  worker.on('message', (msg: any) => {
    if (msg.type === 'result') {
      result = JSON.stringify(msg.data);
    } else if (msg.type === 'error') {
      result = JSON.stringify({ error: msg.data });
    }
    Atomics.store(signal, 0, 1);
    Atomics.notify(signal, 0);
  });

  worker.on('error', (err: Error) => {
    result = JSON.stringify({ error: err.message });
    Atomics.store(signal, 0, 1);
    Atomics.notify(signal, 0);
  });

  // Block synchronously until worker posts result
  Atomics.wait(signal, 0, 0, 120000);

  return result || JSON.stringify({ error: 'Worker timeout' });
}


// ════════════════════════════════════════════════════════════════
// APPROACH 3: In-process with STREAMING callbacks (FUTURE)
// ════════════════════════════════════════════════════════════════
//
// If jsii ever supports async or callback-based methods:
//
//   public converseStream(
//     messagesJson: string,
//     systemPrompt: string,
//     toolSpecsJson: string,
//     onChunk: (chunkJson: string) => void,  // called per streaming chunk
//   ): string { ... }
//
// The worker would do:
//   parentPort.postMessage({ type: 'chunk', data: chunk });
//
// And the agent loop would emit chunks to the Python callback handler
// in real-time, giving you token-by-token streaming through the
// jsii bridge. The readline would then see MULTIPLE messages instead
// of one big blob at the end.
//
// Until then, the best we can do is eliminate the process spawn + disk I/O.


export { converseInlineExec, converseInProcess };
