import test from 'node:test';
import assert from 'node:assert/strict';
import {configOf,observation,parseDream,residue,blank,redact} from '../lib/model.js';
import {openStore} from '../lib/store.js';
import {Dreamer} from '../lib/engine.js';
import {apply} from '../index.js';
const NOW=1800000000000;
function response(evidence='session:1'){
  return {title:'The unlatched gate',class:'technical',mood:'self-congratulatory',narrative:'The gate around a failing lookup stayed open while a test pointed toward the missing validation. A narrow repair would turn the error into a reproducible check, rather than another broad rewrite. The work suggests preserving the exact failing case and testing it before changing the interface. ',symbols:[{symbol:'gate',meaning:'Input validation boundary'}],insights:[{text:'Keep a regression for the failing lookup.',target:'lookup validation tests',evidence:[evidence]}]};
}
async function fixture(config={}){
  const values=new Map(),logs=[],calls=[];let now=NOW;let send=()=>JSON.stringify(response());
  const ctx={storageDomain:{async open(){return {table:()=>({get:key=>values.get(key),put:async(key,value)=>values.set(key,structuredClone(value))}),close(){}};}},sessions:{get:()=>session},llm:{async prepareCall(config,signal){calls.push(config);return {config,async *stream(options){const result=await send(options,signal);if(typeof result==='string')yield {type:'text-delta',text:result};else if(result)yield result;yield {type:'finish',reason:{kind:'stop'}};}};}}};
  const session={id:'session',append(type,data){logs.push({type,data});}};
  const store=await openStore(ctx);const engine=new Dreamer(ctx,store,configOf(config),()=>now);
  await engine.observe(session,{seq:0,time:now,type:'request/header',data:{header:{config:{provider:'fixture',model:'example'}}}});
  await engine.observe(session,{seq:1,time:now,type:'user/message',data:{source:{kind:'user'},content:[{type:'text',text:'The lookup failed. Preserve its test.'}]}});
  return {ctx,session,store,engine,logs,calls,values,setSend:value=>send=value,advance:ms=>now+=ms};
}
test('config rejects unknown fields, mismatched routes and unbounded budgets',()=>{
  assert.throws(()=>configOf({provider:'x'}),/together/);
  assert.throws(()=>configOf({injectMaxChars:100000}),/injectMaxChars/);
  assert.throws(()=>configOf({apiKey:'not-accepted'}),/Unknown/);
});
test('residue excludes wake echoes, reasoning and obvious credentials',()=>{
  const session={id:'s'};
  assert.equal(observation(session,{seq:1,type:'user/message',data:{source:{kind:'dreamer-wake'},content:[{type:'text',text:'a previous insight'}]}}),null);
  const item=observation(session,{seq:2,time:NOW,type:'assistant/message',data:{message:{content:[{type:'reasoning',text:'private reasoning'},{type:'text',text:'password=example-secret failed'}]}}});
  assert.doesNotMatch(item.text,/example-secret|private reasoning/);
  assert.match(item.text,/redacted/);
});
test('quality gate requires exact evidence, concrete targets and a substantive narrative',()=>{
  const input={phase:'light',mood:'cautious',observations:[{id:'session:1',text:'failed lookup'}]};
  assert.equal(parseDream(JSON.stringify(response()),input).mood,'cautious');
  assert.throws(()=>parseDream(JSON.stringify(response('invented')),input),/observation ids/);
  assert.throws(()=>parseDream(JSON.stringify({...response(),narrative:'thin'}),input),/thin/);
});
test('manual dream uses the recorded route, logs exact request and persists without tools',async()=>{
  const f=await fixture();const dream=await f.engine.run({session:f.session});
  assert.equal(dream.route.model,'example');assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].tools,undefined);assert.equal(f.store.read().dreams.length,1);
  assert.ok(f.logs.some(log=>log.type==='dreamer/request'&&log.data.messages[0].content[0].text.includes('session:1')));
  const reloaded=await openStore(f.ctx);assert.equal(reloaded.read().dreams[0].id,dream.id);
});
test('invalid generation retries once; unavailable models and tool calls never fabricate a dream',async()=>{
  const f=await fixture();let attempts=0;f.setSend(()=>++attempts===1?'not json':JSON.stringify(response()));
  await f.engine.run();assert.equal(attempts,2);
  const failed=await fixture();failed.setSend(()=>{throw Error('Provider unavailable');});
  await assert.rejects(()=>failed.engine.run(),/Provider unavailable/);assert.equal(failed.store.read().dreams.length,0);
  failed.setSend(()=>({type:'tool-call-delta',name:'write_file'}));
  await assert.rejects(()=>failed.engine.run(),/must not use tools/);assert.equal(failed.store.read().dreams.length,0);
});
test('idle scheduler respects active turns, intervals, configuration and startup idle time',async()=>{
  const f=await fixture({idleMinutes:1,intervalMinutes:1});
  await f.engine.tick();assert.equal(f.calls.length,0);
  await f.engine.observe(f.session,{time:NOW,seq:2,type:'turn/start',data:{turn:1}});
  f.advance(120000);await f.engine.tick();assert.equal(f.calls.length,0);
  await f.engine.observe(f.session,{time:NOW,seq:3,type:'turn/end',data:{turn:1}});
  f.advance(61000);await f.engine.tick();assert.equal(f.calls.length,1);
  await f.engine.tick();assert.equal(f.calls.length,1);
  const disabled=await fixture({automatic:false});disabled.advance(86400000);await disabled.engine.tick();assert.equal(disabled.calls.length,0);
});
test('wake is reserved for one fresh session and consumed only after durable admission',async()=>{
  const f=await fixture();await f.engine.run();
  const wake=await f.engine.claimWake('fresh');assert.ok(wake);
  assert.equal(await f.engine.claimWake('other'),null);
  assert.equal(f.store.read().dreams[0].wakedAt,undefined);
  await f.engine.observe({id:'fresh'},{seq:1,time:NOW,type:'user/message',data:wake});
  assert.equal(f.store.read().dreams[0].wakedSession,'fresh');
  assert.equal(await f.engine.claimWake('other'),null);
  assert.ok(wake.content[0].text.length<=2000);
  assert.equal(f.store.read().observations.length,1,'wake cannot verify its own insights');
});
test('aborted pre-admission wake claims are released and old dreams expire',async()=>{
  const f=await fixture();await f.engine.run();await f.engine.claimWake('canceled');
  await f.engine.observe({id:'canceled'},{seq:2,time:NOW,type:'turn/end',data:{turn:1}});
  assert.ok(await f.engine.claimWake('next'));
  f.advance(49*3600000);assert.equal(await f.engine.claimWake('later'),null);
});
test('shutdown aborts and awaits a pending generation; concurrent runs are rejected',async()=>{
  const f=await fixture();let started;const ready=new Promise(resolve=>started=resolve);
  f.setSend((_options,signal)=>new Promise((_resolve,reject)=>{started();signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});}));
  const running=f.engine.run();await ready;
  await assert.rejects(()=>f.engine.run(),/in progress/);
  const stopped=f.engine.dispose();await assert.rejects(()=>running,/aborted/);await stopped;
  assert.equal(f.store.read().dreams.length,0);
});
test('plugin registers three tools; fresh-session hook fails open and never calls a model',async()=>{
  const f=await fixture();const handlers=new Map(),tools=new Map(),cleanup=[];
  await apply({...f.ctx,on:(name,handler)=>handlers.set(name,handler),tools:{register:tool=>tools.set(tool.name,tool)},effect:fn=>cleanup.push(fn())},{automatic:false},{appendPluginRecord:(session,type,data)=>session.append(type,data)});
  assert.deepEqual([...tools.keys()],['dream_now','dream_journal','dream_status']);
  const enter={kind:'enter',messages:[]};
  assert.equal(await handlers.get('agent/pre-step')({agent:{session:f.session},turn:2,step:1,signal:new AbortController().signal},async()=>enter),enter);
  assert.equal((await tools.get('dream_status').execute()).dreams,0);assert.equal(f.calls.length,0);
  for(const dispose of cleanup)await dispose();
});
test('history backfill uses read-only handles, skips wake echoes and deduplicates records',async()=>{
  const f=await fixture();let closed=0;
  f.engine.persistence={list:async()=>[{header:{id:'old',createdAt:NOW-86400000},eventCount:2}],open:async(id,access)=>{
    assert.equal(access,'read');return {read:async()=>({events:[{seq:0,time:NOW-5000,type:'user/message',data:{source:{kind:'user'},content:[{type:'text',text:'Old failed lookup'}]}},{seq:1,time:NOW-4000,type:'user/message',data:{source:{kind:'dreamer-wake'},content:[{type:'text',text:'Do not count me'}]}}]}),close:async()=>closed++};
  }};
  await f.engine.backfill(new AbortController().signal);await f.engine.backfill(new AbortController().signal);
  assert.equal(closed,2);assert.equal(f.store.read().observations.length,2);assert.ok(!JSON.stringify(f.store.read()).includes('Do not count me'));
});
test('fifth-dream phase survives journal pruning and measured class drift is counted',async()=>{
  const f=await fixture();
  await f.store.mutate(state=>({...state,totalDreams:104,dreams:[{class:'technical',title:'Prior',at:NOW-1000,insights:[]}]}));
  f.setSend(()=>JSON.stringify({...response(),narrative:response().narrative.repeat(2)}));
  const dream=await f.engine.run();
  assert.equal(dream.phase,'deep');assert.equal(f.calls[0].maxTokens,1200);
  assert.equal(f.engine.status().dreams,105);assert.equal(f.engine.status().classImbalanceOverrepeats,1);
});
test('slash command reads the journal/status without spending a model call',async()=>{
  const f=await fixture();let command;const cleanup=[];
  const commands={register:value=>command=value};
  await apply({...f.ctx,get:name=>name==='commands'?commands:undefined,on(){},tools:{register(){}},effect:fn=>cleanup.push(fn())},{automatic:false},{appendPluginRecord(){}});
  const args={agent:{session:f.session},rawInput:' status',signal:new AbortController().signal};
  assert.equal((await command.handler(args)).kind,'success');assert.equal(f.calls.length,0);
  assert.match((await command.handler({...args,rawInput:''})).text,/empty/);
  for(const dispose of cleanup)await dispose();
});
test('native block-end text is supported without double-counting deltas',async()=>{
  const f=await fixture();
  f.setSend(()=>({type:'block-end',index:0,block:{type:'text',text:JSON.stringify(response())}}));
  assert.ok((await f.engine.run()).id);assert.equal(f.calls.length,1);
});
