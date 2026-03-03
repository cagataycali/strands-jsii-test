
Skip to content
cagataycali
strands-jsii
Repository navigation
Code
Issues
Pull requests
Agents
Actions
Projects
Wiki
Security
Insights
Settings
Web Bundle + Multi-Provider E2E
ci: web bundle + multi-provider streaming E2E workflow #1
All jobs
Run details
Annotations
1 error
E2E Streaming — Anthropic
failed 1 minute ago in 17s
Search logs
1s
1s
1s
6s
5s
0s
0s
Run node --input-type=module << 'TESTEOF'
  node --input-type=module << 'TESTEOF'
  import { createProvider, StreamingWebAgent, FunctionTool, ToolHandler, ToolBuilder } from './dist/strands-jsii.web.mjs';
  
  class CalcHandler extends ToolHandler {
    handle(inputJson) {
      const { expression } = JSON.parse(inputJson);
      try { return JSON.stringify({ result: String(eval(expression)) }); }
      catch (e) { return JSON.stringify({ error: e.message }); }
    }
  }
  
  const calc = new ToolBuilder('calculator', new CalcHandler())
    .description('Evaluate math')
    .addStringParam('expression', 'Math expression', true)
    .create();
  
  const model = createProvider('anthropic', process.env.ANTHROPIC_API_KEY, { modelId: 'claude-haiku-4-5-20250414', maxTokens: 256 });
  const agent = new StreamingWebAgent({ model, tools: [calc], systemPrompt: 'You are a math assistant. Always use the calculator tool.' });
  
  console.log('🔄 Streaming Anthropic with tool calling...');
  let fullText = '', toolCalls = 0, chunks = 0;
  const t0 = Date.now();
  
  for await (const event of agent.stream('What is 42 * 17?')) {
    if (event.type === 'modelContentBlockDeltaEvent' && event.delta?.type === 'textDelta') {
      fullText += event.delta.text;
      chunks++;
    }
    if (event.type === 'beforeToolCallEvent') {
      toolCalls++;
      console.log(`  🔧 Tool call: ${event.toolUse.name}`);
    }
  }
  
  const ms = Date.now() - t0;
  console.log(`  Response (${chunks} chunks, ${ms}ms): ${fullText.slice(0, 200)}`);
  console.log(`  Tool calls: ${toolCalls}`);
  
  if (chunks === 0) throw new Error('No streaming chunks received');
  if (toolCalls === 0) throw new Error('No tool calls made');
  if (!fullText.includes('714')) console.warn('⚠️ Expected 714 in response');
  console.log('✅ Anthropic streaming + tool calling passed!');
  TESTEOF
  shell: /usr/bin/bash -e {0}
  env:
    ANTHROPIC_API_KEY: ***
🔄 Streaming Anthropic with tool calling...
file:///home/runner/work/strands-jsii/strands-jsii/dist/strands-jsii.web.mjs:9
0s
0s
0s


----]

Skip to content
cagataycali
strands-jsii
Repository navigation
Code
Issues
Pull requests
Agents
Actions
Projects
Wiki
Security
Insights
Settings
Web Bundle + Multi-Provider E2E
ci: web bundle + multi-provider streaming E2E workflow #1
All jobs
Run details
Annotations
1 error
E2E Streaming — OpenAI
failed 2 minutes ago in 17s
Search logs
1s
1s
3s
4s
5s
0s
1s
Run node --input-type=module << 'TESTEOF'
🔄 Streaming OpenAI with tool calling...
  Response (0 chunks): 
file:///home/runner/work/strands-jsii/strands-jsii/[eval1]:24
if (chunks === 0) throw new Error('No streaming chunks received');
                        ^

Error: No streaming chunks received
    at file:///home/runner/work/strands-jsii/strands-jsii/[eval1]:24:25
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)

Node.js v22.22.0
Error: Process completed with exit code 1.
0s
0s
0s


----]

Skip to content
cagataycali
strands-jsii
Repository navigation
Code
Issues
Pull requests
Agents
Actions
Projects
Wiki
Security
Insights
Settings
Web Bundle + Multi-Provider E2E
ci: web bundle + multi-provider streaming E2E workflow #1
All jobs
Run details
Annotations
1 error
E2E Streaming — Gemini
failed 2 minutes ago in 16s
Search logs
1s
1s
1s
6s
4s
0s
1s
Run node --input-type=module << 'TESTEOF'
🔄 Streaming Gemini with tool calling...
file:///home/runner/work/strands-jsii/strands-jsii/dist/strands-jsii.web.mjs:9
`)})}}}return t.filter(o=>o.content!==void 0||o.tool_calls!==void 0)}function Ut(n,e,t,o,s){let r={model:n.modelId??$e.modelId,messages:Rt(e,t)};if(s&&(r.stream=!0,r.stream_options={include_usage:!0}),n.maxTokens!==void 0&&n.maxTokens>=0&&(r.max_tokens=n.maxTokens),n.temperature!==void 0&&n.temperature>=0&&(r.temperature=n.temperature),n.topP!==void 0&&n.topP>=0&&(r.top_p=n.topP),n.frequencyPenalty!==void 0&&n.frequencyPenalty!==999&&(r.frequency_penalty=n.frequencyPenalty),n.presencePenalty!==void 0&&n.presencePenalty!==999&&(r.presence_penalty=n.presencePenalty),n.seed!==void 0&&n.seed>=0&&(r.seed=n.seed),n.stopSequences&&(r.stop=typeof n.stopSequences=="string"?JSON.parse(n.stopSequences):n.stopSequences),n.additionalParamsJson&&Object.assign(r,JSON.parse(n.additionalParamsJson)),o){let i=JSON.parse(o);r.tools=i.map(a=>({type:"function",function:{name:a.name,description:a.description,parameters:a.inputSchema}}))}if(n.toolChoice){let i=n.toolChoice;i.choiceMode==="auto"?r.tool_choice="auto":i.choiceMode==="required"?r.tool_choice="required":i.choiceMode==="function"&&i.functionName&&(r.tool_choice={type:"function",function:{name:i.functionName}})}return{url:n.proxyUrl??`${n.baseUrl??$e.baseUrl}/v1/chat/completions`,headers:{"content-type":"application/json",Authorization:`***""}`},body:r}}function wt(n){if(n.error){let s=n.error.message??JSON.stringify(n.error),r=n.error.code??"";return r==="context_length_exceeded"?JSON.stringify({error:`Context overflow: ${s}`}):r==="rate_limit_exceeded"||s.toLowerCase().includes("rate limit")?JSON.stringify({error:`Throttled: ${s}`}):JSON.stringify({error:s})}let e=n.choices?.[0];if(!e)return JSON.stringify({error:"No response from OpenAI"});let t=[];if(e.message?.reasoning_content&&t.push({reasoningContent:{reasoningText:{text:e.message.reasoning_content}}}),e.message?.content&&t.push({text:e.message.content}),e.message?.tool_calls)for(let s of e.message.tool_calls)t.push({toolUse:{name:s.function.name,toolUseId:s.id,input:JSON.parse(s.function.arguments??"{}")}});let o=e.finish_reason==="tool_calls"?"tool_use":e.finish_reason==="length"?"max_tokens":e.finish_reason==="content_filter"?"content_filtered":"end_turn";return JSON.stringify({output:{message:{role:"assistant",content:t}},stopReason:o,usage:{inputTokens:n.usage?.prompt_tokens??0,outputTokens:n.usage?.completion_tokens??0,totalTokens:n.usage?.total_tokens??0}})}function Ct(n){let e=[];if(!n.choices?.length)return n.usage&&e.push({type:"metadata",inputTokens:n.usage.prompt_tokens??0,outputTokens:n.usage.completion_tokens??0}),e;let t=n.choices[0],o=t.delta;if(o?.role&&e.push({type:"messageStart"}),o?.content&&e.push({type:"textDelta",text:o.content}),o?.tool_calls)for(let s of o.tool_calls)s.id&&s.function?.name&&e.push({type:"blockStart",toolName:s.function.name,toolUseId:s.id}),s.function?.arguments&&e.push({type:"toolDelta",toolInput:s.function.arguments});if(t.finish_reason){let s={stop:"endTurn",tool_calls:"toolUse",length:"maxTokens"};e.push({type:"messageStop",stopReason:s[t.finish_reason]||"endTurn"})}return e}var me={modelId:"gemini-2.5-flash",maxTokens:4096,baseUrl:"https://generativelanguage.googleapis.com"};function Jt(n,e){let t=[];for(let o of n){let s=o.role==="assistant"?"model":"user",r=[];for(let i of o.content??[])if(i.text!==void 0)r.push({text:i.text});else if(i.toolUse){e[i.toolUse.toolUseId]=i.toolUse.name;let a={functionCall:{name:i.toolUse.name,args:i.toolUse.input,id:i.toolUse.toolUseId}};i.toolUse.reasoningSignature&&(a.thoughtSignature=i.toolUse.reasoningSignature),r.push(a)}else if(i.toolResult){let a=i.toolResult,l=e[a.toolUseId]??a.toolUseId,c=Array.isArray(a.content)?a.content.map(p=>p.json!==void 0?p:p.text!==void 0?{text:p.text}:p):a.content;r.push({functionResponse:{id:a.toolUseId,name:l,response:{output:c}}})}else if(i.reasoningContent){let a=i.reasoningContent,l={text:a.reasoningText?.text??"",thought:!0};a.reasoningText?.signature&&(l.thoughtSignature=a.reasoningText.signature),r.push(l)}else if(i.image){let a=i.image.source?.bytes;if(a){let l=i.image.format??"png",c={png:"image/png",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp"},p=typeof a=="string"?a:typeof Buffer<"u"?Buffer.from(a).toString("base64"):"";r.push({inlineData:{mimeType:c[l]??"image/png",data:p}})}}r.length>0&&t.push({role:s,parts:r})}return t}function Mt(n,e,t,o,s){let r={};for(let u of e)for(let g of u.content??[])g.toolUse&&(r[g.toolUse.toolUseId]=g.toolUse.name);let i={maxOutputTokens:n.maxTokens??me.maxTokens};n.temperature!==void 0&&n.temperature>=0&&(i.temperature=n.temperature),n.topP!==void 0&&n.topP>=0&&(i.topP=n.topP),n.topK!==void 0&&n.topK>=0&&(i.topK=n.topK),n.stopSequences&&(i.stopSequences=typeof n.stopSequences=="string"?JSON.parse(n.stopSequences):n.stopSequences),n.thinkingBudgetTokens&&n.thinkingBudgetTokens>0&&(i.thinkingConfig={thinkingBudget:n.thinkingBudgetTokens}),n.additionalParamsJson&&Object.assign(i,JSON.parse(n.additionalParamsJson));let a={contents:Jt(e,r),generationConfig:i};t&&(a.systemInstruction={parts:[{text:t}]});let l=[];if(o){let u=JSON.parse(o);l.push({functionDeclarations:u.map(g=>({name:g.name,description:g.description,parameters:g.inputSchema}))})}if(n.geminiToolsJson)for(let u of JSON.parse(n.geminiToolsJson))l.push(u);l.length>0&&(a.tools=l);let c=n.modelId??me.modelId,p=s?"streamGenerateContent?alt=sse":"generateContent";return{url:n.proxyUrl??`${n.baseUrl??me.baseUrl}/v1beta/models/${c}:${p}&key=${n.apiKey??""}`,headers:{"content-type":"application/json"},body:a}}function Et(n){if(n.error){let r=n.error.message??JSON.stringify(n.error),i=n.error.status??"";return JSON.stringify(i==="RESOURCE_EXHAUSTED"||i==="UNAVAILABLE"?{error:`Throttled: ${r}`}:{error:r})}let e=n.candidates?.[0];if(!e)return JSON.stringify({error:"No Gemini response candidate"});let t=[],o=!1;for(let r of e.content?.parts??[])if(r.functionCall){let i=r.functionCall.id??`tooluse_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`,a={name:r.functionCall.name,toolUseId:i,input:r.functionCall.args??{}};r.thoughtSignature&&(a.reasoningSignature=r.thoughtSignature),t.push({toolUse:a}),o=!0}else if(r.thought===!0&&r.text){let i={text:r.text};r.thoughtSignature&&(i.signature=r.thoughtSignature),t.push({reasoningContent:{reasoningText:i}})}else r.text!==void 0&&t.push({text:r.text});let s=o?"tool_use":e.finishReason==="MAX_TOKENS"?"max_tokens":e.finishReason==="SAFETY"?"content_filtered":"end_turn";return JSON.stringify({output:{message:{role:"assistant",content:t}},stopReason:s,usage:{inputTokens:n.usageMetadata?.promptTokenCount??0,outputTokens:n.usageMetadata?.candidatesTokenCount??0,totalTokens:n.usageMetadata?.totalTokenCount??0}})}function At(n){let e=[],t=n.candidates?.[0];if(!t?.content?.parts)return n.usageMetadata&&e.push({type:"metadata",inputTokens:n.usageMetadata.promptTokenCount??0,outputTokens:n.usageMetadata.candidatesTokenCount??0}),e;for(let o of t.content.parts)if(o.functionCall){let s=o.functionCall.id??`tooluse_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`;e.push({type:"blockStart",toolName:o.functionCall.name,toolUseId:s}),e.push({type:"toolDelta",toolInput:JSON.stringify(o.functionCall.args??{})}),e.push({type:"blockStop"})}else o.text!==void 0&&e.push({type:"textDelta",text:o.text});return n.usageMetadata&&e.push({type:"metadata",inputTokens:n.usageMetadata.promptTokenCount??0,outputTokens:n.usageMetadata.candidatesTokenCount??0}),e}var Ke={modelId:"llama3",maxTokens:-1,baseUrl:"http://localhost:11434"};function Pt(n,e){let t=[];e&&t.push({role:"system",content:e});for(let o of n)for(let s of o.content??[])if(s.text!==void 0)t.push({role:o.role,content:s.text});else if(s.toolUse)t.push({role:o.role,tool_calls:[{function:{name:s.toolUse.toolUseId,arguments:s.toolUse.input}}]});else if(s.toolResult)for(let r of s.toolResult.content??[])r.json!==void 0?t.push({role:"tool",content:JSON.stringify(r.json)}):r.text!==void 0&&t.push({role:"tool",content:r.text});else if(s.image){let r=s.image.source?.bytes;if(r){let i=typeof r=="string"?r:typeof Buffer<"u"?Buffer.from(r).toString("base64"):"";t.push({role:o.role,images:[i]})}}return t}function Dt(n,e,t,o){let s={};n.optionsJson&&Object.assign(s,JSON.parse(n.optionsJson)),n.maxTokens!==void 0&&n.maxTokens>=0&&(s.num_predict=n.maxTokens),n.temperature!==void 0&&n.temperature>=0&&(s.temperature=n.temperature),n.topP!==void 0&&n.topP>=0&&(s.top_p=n.topP),n.topK!==void 0&&n.topK>=0&&(s.top_k=n.topK),n.stopSequences&&(s.stop=typeof n.stopSequences=="string"?JSON.parse(n.stopSequences):n.stopSequences);let r={model:n.modelId??Ke.modelId,messages:Pt(e,t),options:s,stream:!1};if(n.keepAlive&&(r.keep_alive=n.keepAlive),n.additionalArgsJson&&Object.assign(r,JSON.parse(n.additionalArgsJson)),o){let i=JSON.parse(o);r.tools=i.map(a=>({type:"function",function:{name:a.name,description:a.description,parameters:a.inputSchema}}))}return{url:n.proxyUrl??`${n.host??Ke.baseUrl}/api/chat`,headers:{"content-type":"application/json"},body:r}}function Bt(n){if(n.error)return JSON.stringify({error:n.error});let e=[],t=!1;if(n.message?.content&&e.push({text:n.message.content}),n.message?.tool_calls)for(let s of n.message.tool_calls)e.push({toolUse:{name:s.function?.name??"unknown",toolUseId:s.function?.name??"unknown",input:s.function?.arguments??{}}}),t=!0;let o=t?"tool_use":n.done_reason==="length"?"max_tokens":"end_turn";return JSON.stringify({output:{message:{role:"assistant",content:e}},stopReason:o,usage:{inputTokens:n.prompt_eval_count??0,outputTokens:n.eval_count??0},metrics:{latencyMs:n.total_duration?n.total_duration/1e6:0}})}var re={anthropic:It,openai:Ut,gemini:Mt,ollama:Dt},jt={anthropic:Nt,openai:wt,gemini:Et,ollama:Bt},Le={anthropic:Ot,openai:Ct,gemini:At},qt={anthropic:ge,openai:$e,gemini:me,ollama:Ke};var fe=class extends U{constructor(e){if(super(),this.config=e,!re[e.provider])throw new Error(`Unknown provider: ${e.provider}. Available: ${Object.keys(re).join(", ")}`)}get modelId(){return this.config.modelId??""}get providerName(){return this.config.provider}async*stream(e,t,o){let s=JSON.parse(e),r=re[this.config.provider],i=Le[this.config.provider],a=r(this.config,s,t,o,!0),l=await fetch(a.url,{method:"POST",headers:{...a.headers,...this.config.headers??{}},body:JSON.stringify(a.body)});if(!l.ok)throw new Error(`${this.config.provider} ${l.status}: ${await l.text()}`);this.config.provider==="gemini"&&(yield{type:"modelMessageStartEvent",role:"assistant"});let c=l.body.getReader(),p=new TextDecoder,u="",g=!1;try{for(;;){let{done:m,value:I}=await c.read();if(m)break;u+=p.decode(I,{stream:!0});let b=u.split(`
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            

Error: gemini 429: {
  "error": {
    "code": 429,
    "message": "You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-2.0-flash\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-2.0-flash\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_input_token_count, limit: 0, model: gemini-2.0-flash\nPlease retry in 56.977679908s.",
    "status": "RESOURCE_EXHAUSTED",
    "details": [
      {
        "@type": "type.googleapis.com/google.rpc.Help",
        "links": [
          {
            "description": "Learn more about Gemini API quotas",
            "url": "https://ai.google.dev/gemini-api/docs/rate-limits"
          }
        ]
      },
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        "violations": [
          {
            "quotaMetric": "generativelanguage.googleapis.com/generate_content_free_tier_requests",
            "quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
            "quotaDimensions": {
              "model": "gemini-2.0-flash",
              "location": "global"
            }
          },
          {
            "quotaMetric": "generativelanguage.googleapis.com/generate_content_free_tier_requests",
            "quotaId": "GenerateRequestsPerMinutePerProjectPerModel-FreeTier",
            "quotaDimensions": {
              "location": "global",
              "model": "gemini-2.0-flash"
            }
          },
          {
            "quotaMetric": "generativelanguage.googleapis.com/generate_content_free_tier_input_token_count",
            "quotaId": "GenerateContentInputTokensPerModelPerMinute-FreeTier",
            "quotaDimensions": {
              "location": "global",
              "model": "gemini-2.0-flash"
            }
          }
        ]
      },
      {
        "@type": "type.googleapis.com/google.rpc.RetryInfo",
        "retryDelay": "56s"
      }
    ]
  }
}

    at fe.stream (file:///home/runner/work/strands-jsii/strands-jsii/dist/strands-jsii.web.mjs:9:10328)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async xe.stream (file:///home/runner/work/strands-jsii/strands-jsii/dist/strands-jsii.web.mjs:2:2386)
    at async file:///home/runner/work/strands-jsii/strands-jsii/[eval1]:19:18

Node.js v22.22.0
Error: Process completed with exit code 1.
0s
0s
0s
