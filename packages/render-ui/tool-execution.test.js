import test from 'node:test';
import assert from 'node:assert/strict';
import {executeUiTool,validateToolRequest} from './lib/tool-execution.js';
import {createToolBridge} from './src/tool-bridge.js';
import {installToolExecution} from './lib/tool-execution-host.js';

function fixture(result={isError:false,value:{count:7}}) {
  const agent={session:{id:'session-a'}}; const calls=[];
  const ctx={agents:{get:id=>id==='session-a'?agent:undefined},tools:{get:(name,scope)=>{assert.equal(scope,agent);return name==='unknown'?undefined:{parameters:{type:'object'}};},async execute(input){calls.push(input);return {results:[{callId:input.calls[0].id,result}],additionalContexts:[],concluded:false};}}};
  return {ctx,agent,calls,signal:new AbortController().signal};
}
test('host forwards only validated arguments, real agent and signal to canonical executor',async()=>{
  const f=fixture(); const request={name:'read',arguments:{path:'test'}};
  assert.deepEqual(await executeUiTool(f.ctx,f.agent,request,f.signal,()=>[]),{count:7});
  const input=f.calls[0];
  const block=input.calls[0];
  assert.equal(block.name,'read');
  assert.equal(block.arguments,'{"path":"test"}');
  assert.equal(typeof block.id,'string');
  assert.equal(input.agent,f.agent);assert.equal(input.signal,f.signal);
  assert.notEqual(block.arguments,request.arguments);
  assert.deepEqual(Object.keys(input).sort(),['agent','calls','signal']);
});
test('stale session, cancellation and invalid arguments cannot dispatch',async()=>{
  const f=fixture();const req={name:'read',arguments:{}};
  await assert.rejects(executeUiTool(f.ctx,{session:{id:'other'}},req,f.signal,()=>[]),/live session/);
  await assert.rejects(executeUiTool(f.ctx,f.agent,req,AbortSignal.abort(),()=>[]),/abort/i);
  await assert.rejects(executeUiTool(f.ctx,f.agent,req,f.signal,()=>['missing path']),/Invalid tool arguments/);
  assert.equal(f.calls.length,0);
});
test('unknown tools and policy errors stay errors, not successful data',async()=>{
  const f=fixture({isError:true,error:{message:'Permission denied'}});
  await assert.rejects(executeUiTool(f.ctx,f.agent,{name:'unknown',arguments:{}},f.signal,()=>[]),/Permission denied/);
  assert.equal(f.calls[0].calls[0].name,'unknown');
});
test('wire requests cannot override execution identity, schema, or parent',()=>{
  for(const key of ['agent','parent','signal','schema','callId']) assert.throws(()=>validateToolRequest({name:'read',arguments:{},[key]:'override'}));
  for(const args of [null,[],{x:undefined},{x:NaN},{x:()=>0},JSON.parse('{"__proto__":{}}')]) assert.throws(()=>validateToolRequest({name:'read',arguments:args}));
});
test('client uses authenticated RPC with fixed session identity and cancellation',async()=>{
  let called;const signal=new AbortController().signal;
  const bridge=createToolBridge({connection:{rpc:{async call(...args){called=args;return {ok:true,value:{fresh:true}};}}}},'session-a');
  assert.deepEqual(await bridge('read',{},signal),{fresh:true});
  assert.deepEqual(called,['/api','openuiToolExecution/execute',{args:{agentId:'session-a',request:{name:'read',arguments:{}}}},signal]);
  await assert.rejects(createToolBridge({},'')('read',{}),/session scope/);
  await assert.rejects(createToolBridge({connection:{rpc:{async call(){return {ok:false,error:{message:'Denied'}};}}}},'session-a')('read',{}),/Denied/);
});
test('host registers the exact execution route on the shared API channel',async()=>{
  const f=fixture();
  const routes=[];
  f.ctx.connection={fetch:{register(route){routes.push(route);return async()=>{};}}};
  installToolExecution(f.ctx);
  assert.equal(routes.length,1);
  const route=routes[0];
  assert.equal(route.path,'/api/openuiToolExecution/execute');
  assert.deepEqual(route.methods,['POST']);
  assert.equal(route.requestBody,'buffered');

  const reply=await route.fetch(new Request('http://localhost/api/openuiToolExecution/execute',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({type:'client-request',rpcId:'r1',method:'openuiToolExecution/execute',payload:{args:{agentId:'session-a',request:{name:'read',arguments:{path:'x'}}}}}),
  }));
  assert.equal(reply.status,200);
  const body=await reply.json();
  assert.equal(body.type,'server-response');
  assert.equal(body.rpcId,'r1');
  assert.deepEqual(body.result,{ok:true,value:{count:7}});
  assert.equal(f.calls.length,1);

  const bad=await route.fetch(new Request('http://localhost/api/openuiToolExecution/execute',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({type:'client-request',rpcId:'r2',method:'openuiToolExecution/execute',payload:{args:{agentId:'missing',request:{name:'read',arguments:{}}}}}),
  }));
  const badBody=await bad.json();
  assert.equal(badBody.result.ok,false);
  assert.equal(badBody.result.error.code,'gateway/bad-request');
  assert.deepEqual(badBody.result.error.details,{});
});
