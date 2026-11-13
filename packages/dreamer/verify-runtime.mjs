// Run through packaged Electron with ELECTRON_RUN_AS_NODE=1. Fixture data only.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import {writeFileSync} from 'node:fs';
import {dshRuntimeRoot} from '../../scripts/local-paths.mjs';
const base=pathToFileURL(dshRuntimeRoot()+'node_modules/@deepseek-ai/').href;
registerHooks({resolve(specifier,context,next){if(specifier==='@deepseek-ai/dsh-session')return next(base+'dsh-session/lib/index.js',context);return next(specifier,context);}});
const {Context}=await import(base+'cordis/lib/index.js');
const {default:SessionStore}=await import(base+'dsh-session/lib/index.js');
const {default:LlmRuntime,LlmAdapter,createUserMessage}=await import(base+'dsh-llm/lib/index.js');
const {ToolRuntime}=await import(base+'dsh-tools/lib/index.js');
const {NativeToolExecutor}=await import(base+'dsh-tool-executor-native/lib/index.js');
const {createScope}=await import(base+'dsh-scope/lib/index.js');
const {agentEvents}=await import(base+'dsh-agent/lib/index.js');
const plugin=await import('./index.js');
const ctx=new Context();const provide=(name,value)=>{ctx.provide(name);ctx.set(name,value);};
provide('systemPrompt',{tools(){}});
new SessionStore(ctx);new LlmRuntime(ctx);new ToolRuntime(ctx,{mode:'native'});ctx.tools.setExecutor(new NativeToolExecutor(ctx));
const data=new Map();provide('storageDomain',{async open(){return {table:()=>({get:key=>data.get(key),put:async(key,value)=>data.set(key,structuredClone(value))}),close(){}};}});
const session=ctx.sessions.create('dreamer-runtime-fixture');
const agent={session,status:'idle'};const scope=createScope(ctx,agent);agent.ctx=scope.ctx;
provide('agents',{get:id=>id===session.id?agent:undefined});
const commands=new Map();provide('commands',{register:definition=>commands.set(definition.name,definition)});
let modelCalls=0;
class FixtureAdapter extends LlmAdapter{
  async resolveModel(provider,model){return {provider,id:model,name:model};}
  async *stream(options){
    modelCalls++;assert.equal(options.tools,undefined);
    const residue=JSON.parse(options.messages[0].content[0].text);
    const value={title:'A gate worth keeping',class:'technical',narrative:'A failed lookup is a concrete reminder that validation should happen before the work leaves its boundary. The error belongs in a regression test, where it can be repeated and understood. A narrow check will make the next repair easier to assess, while an untested rewrite could merely move the same failure elsewhere.',symbols:[{symbol:'gate',meaning:'The validation boundary'}],insights:[{text:'Preserve the failed lookup as a regression test.',target:'lookup validation tests',evidence:[residue.observations[0].id]}]};
    const text=JSON.stringify(value);
    yield {type:'block-start',index:0,blockType:'text'};
    yield {type:'text-delta',index:0,text};
    yield {type:'block-end',index:0,block:{type:'text',text}};
    yield {type:'finish',reason:{kind:'stop'}};
  }
}
ctx.llm.registerAdapter(['dreamer-fixture'],new FixtureAdapter());
const fiber=ctx.plugin(plugin,{automatic:false,provider:'dreamer-fixture',model:'mock'});
try{
  await fiber.await();
  session.append('user/message',createUserMessage({source:{kind:'user'},content:[{type:'text',text:'The lookup failed. Preserve the regression.'}]}),{surfaceOp:'append'});
  const batch=await ctx.tools.execute({agent,signal:new AbortController().signal,calls:[{type:'tool-call',id:'dream-fixture',name:'dream_now',arguments:'{}'}]});
  const result=batch.results[0].result;
  assert.ok(!result.isError,JSON.stringify(result));assert.ok(result.value.ok,JSON.stringify(result.value));assert.equal(modelCalls,1);
  const wakeSession=ctx.sessions.create('dreamer-wake-fixture');const wakeAgent={session:wakeSession,status:'idle'};const wakeScope=createScope(ctx,wakeAgent);wakeAgent.ctx=wakeScope.ctx;
  const decision=await agentEvents(ctx,wakeAgent).waterfall('agent/pre-step',{turn:1,step:1,messages:[],signal:new AbortController().signal},async()=>({kind:'enter',messages:[]}));
  assert.equal(decision.messages[0].source.kind,'dreamer-wake');
  wakeSession.append('user/message',decision.messages[0],{surfaceOp:'append'});
  const read=await ctx.tools.execute({agent,signal:new AbortController().signal,calls:[{type:'tool-call',id:'journal-fixture',name:'dream_journal',arguments:'{}'}]});
  assert.equal(read.results[0].result.value.dreams[0].wakedSession,wakeSession.id);
  assert.ok(commands.has('dream'));
  const command=await commands.get('dream').handler({agent,rawInput:' status',signal:new AbortController().signal});assert.equal(command.kind,'success');assert.equal(modelCalls,1);
  await wakeScope.dispose();
  writeFileSync(new URL('./runtime-verification.json',import.meta.url),JSON.stringify({dsh:'0.2.2-rc.3',realSessionStore:true,realLlmRuntime:true,realToolExecutor:true,realPreStepDispatcher:true,modelCalls,fixtureAdapterOnly:true,liveProviderCalls:false,wakeAdmission:true,commandRegistration:true},null,2));
  console.log('PASS: packaged rc.3 SessionStore, LlmRuntime fixture adapter, tools, plugin audit records and real first-turn dispatcher. No live model calls.');
}finally{await fiber.dispose();await scope.dispose();}
