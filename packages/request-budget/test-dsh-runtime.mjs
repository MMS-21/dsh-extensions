import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {homedir,tmpdir} from 'node:os';
import {mkdtempSync,existsSync,unlinkSync,rmdirSync} from 'node:fs';
const budgetPlugin=await import(process.env.DSH_BUDGET_TEST_MODULE??'./index.mjs');
const runtimeRoot=process.env.DSH_RUNTIME_ROOT??join(homedir(),'AppData/Local/Programs/DeepSeek Harness/resources/app.asar/dsh');
const root=join(runtimeRoot,'node_modules/@deepseek-ai/').replaceAll('\\','/')+'/';
const fixtureRoot=mkdtempSync(join(tmpdir(),'dsh-request-budget-'));
const {Context,Service}=await import(pathToFileURL(root+'cordis/lib/index.js').href);
const {LlmRuntime}=await import(pathToFileURL(root+'dsh-llm/lib/index.js').href);
const pi=await import(pathToFileURL(root+'dsh-llm-pi-ai/lib/index.js').href);
const ctx=new Context();new LlmRuntime(ctx);
class Meter extends Service {constructor(ctx){super(ctx,'tokenMeter');}estimateMessage(message){return Math.ceil(JSON.stringify(message).length/4);}}
class Projections extends Service {constructor(ctx){super(ctx,'sessionProjections');}register(){return Promise.resolve({stateOf:()=>({})});}}
new Meter(ctx);new Projections(ctx);
class Agents extends Service {constructor(ctx){super(ctx,'agents');}}
class Sessions extends Service {constructor(ctx){super(ctx,'sessions');}}
new Agents(ctx);new Sessions(ctx);
const {ToolResultPruner}=await import(pathToFileURL(root+'dsh-compaction-tool-result-pruner/lib/index.js').href);
new ToolResultPruner(ctx,{thresholdChars:1024,headChars:128,tailChars:128});
const retry=await import(pathToFileURL(root+'dsh-llm-retry/lib/index.js').href);
await retry.apply(ctx,{}, {random:()=>0.5});

const bodies=[];
const server=createServer((req,res)=>{let body='';req.on('data',x=>body+=x);req.on('end',()=>{
 bodies.push(Buffer.byteLength(body));res.writeHead(200,{'content-type':'text/event-stream'});
 res.end('data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',created:1,model:'fixture',choices:[{index:0,delta:{role:'assistant',content:'ok'},finish_reason:null}]})+'\n\ndata: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',created:1,model:'fixture',choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');
});});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
process.env.DSH_BUDGET_FIXTURE_KEY='fixture-only-not-a-real-key';
const provider={apiKeyEnv:'DSH_BUDGET_FIXTURE_KEY',api:'openai-completions',baseURL:'http://127.0.0.1:'+server.address().port+'/v1',models:[{id:'fixture',name:'Fixture',contextWindow:32000,maxTokens:100,input:['text']}],retryPolicy:{mode:'normal',maxRetries:0}};
try {
 pi.apply(ctx,{providers:{get:()=>({fixture:provider})}});
 const mounting=ctx.plugin(budgetPlugin,{maxRequestBytes:4096,diagnosticPath:join(fixtureRoot,'sizes.jsonl')});
 await mounting;
 const run=async text=>{const chunks=[];for await(const chunk of ctx.llm.stream({provider:'fixture',model:'fixture',messages:[{role:'user',content:[{type:'text',text}]}],sessionId:'budget-fixture'}))chunks.push(chunk);return chunks;};
 const small=await run('Small test');
 console.log(JSON.stringify({small,bodies}));
 assert.equal(bodies.length,1);
 const big=await run('x'.repeat(10000));
 console.log(JSON.stringify({big,bodies}));
 assert.equal(bodies.length,1,'Oversized SDK request must not reach mock provider');
 assert.equal(big.at(-1).reason.failure.status,413);
 console.log('PASS real bundled LLM service + pi-ai adapter + provider SDK: oversized serialized payload blocked before I/O.');
 let toolExecutions=0;
 const executeTool=()=>{toolExecutions++;return 'saved-output-'.repeat(2000);};
 const nativeLlm=await import(pathToFileURL(root+'dsh-llm/lib/index.js').href);
 const user=nativeLlm.createUserMessage({content:[{type:'text',text:'Read a file and explain it.'}],source:{kind:'user'}});
 const assistant=nativeLlm.createAssistantMessage({content:[{type:'tool-call',id:'call-1',name:'fixture_read',arguments:'{}'}],source:{provider:'fixture',model:'fixture'}});
 const tool=nativeLlm.createToolResultMessage({toolCallId:'call-1',content:[{type:'text',text:executeTool()}],source:{kind:'tool',callId:'call-1'}});
 const events=[{seq:0,type:'user/message',data:{message:user}},{seq:1,type:'assistant/message',data:{message:assistant}},{seq:2,type:'tool/result',data:{message:tool}}];
 const session={id:'recovery-fixture',surface:{nodes:[0,1,2]},eventAt:seq=>events[seq],deriveEventMessage:event=>event.data.message,
  append(type,data,intent){const event={seq:events.length,type,data};events.push(event);if(intent?.surfaceOp?.op==='replace'){const a=this.surface.nodes.indexOf(intent.surfaceOp.startSeq),b=this.surface.nodes.indexOf(intent.surfaceOp.endSeq);this.surface.nodes.splice(a,b-a+1,event.seq);}return event;}};
 const request=()=>({provider:'fixture',model:'fixture',sessionId:session.id,messages:session.surface.nodes.map(seq=>session.deriveEventMessage(session.eventAt(seq))),tools:[{name:'fixture_read',description:'Fixture only',parameters:{type:'object',properties:{}}}]});
 let chunks=[];for await(const chunk of ctx.llm.stream(request()))chunks.push(chunk);
 assert.equal(chunks.at(-1).reason.failure.status,413);
 const abort=new AbortController();const agent={session};
 const action=await ctx.waterfall('agent/request-error',{agent,turn:1,step:1,provider:'fixture',failure:chunks.at(-1).reason.failure,signal:abort.signal,retryPolicy:{mode:'always',initialDelayMs:1,maxDelayMs:1,jitterRatio:0}},async()=>undefined);
 assert.equal(action?.kind,'retry');
 assert.ok(events.some(x=>x.type==='compaction/prune'));
 assert.equal(events[2].data.message.content[0].text.length,26000);
 chunks=[];for await(const chunk of ctx.llm.stream(request()))chunks.push(chunk);
 assert.equal(chunks.at(-1).reason.kind,'stop');assert.equal(toolExecutions,1);
 console.log('PASS native durable tool-result pruning recovers the real SDK request; tool executed once.');
 const irreducible={id:'irreducible',surface:{nodes:[0]},eventAt:()=>({type:'user/message',data:{message:user}}),deriveEventMessage:e=>e.data.message};
 const stopped=await ctx.waterfall('agent/request-error',{agent:{session:irreducible},turn:1,step:1,provider:'fixture',failure:{code:'HTTP_413',status:413,message:'413 too large'},signal:abort.signal,retryPolicy:{mode:'always',initialDelayMs:1,maxDelayMs:1,jitterRatio:0}},async()=>undefined);
 assert.equal(stopped,undefined,'Even an always retry policy must not resend unchanged oversized input');
 console.log('PASS irreducible oversized request does not enter the native always-retry loop.');

}finally{await new Promise(resolve=>server.close(resolve));if(typeof ctx.fiber?.dispose==='function')await ctx.fiber.dispose();delete process.env.DSH_BUDGET_FIXTURE_KEY;if(existsSync(join(fixtureRoot,'sizes.jsonl')))unlinkSync(join(fixtureRoot,'sizes.jsonl'));rmdirSync(fixtureRoot);}
