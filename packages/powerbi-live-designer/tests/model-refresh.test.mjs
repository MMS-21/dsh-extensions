import assert from 'node:assert/strict';
import test from 'node:test';
import {inspect as actualInspect,run as actualRun,mutationAcknowledged} from '../model-refresh.mjs';
function mock({ambiguous=false,missing=false,count=3,failRefresh=false,hash='model Model\n table Fixture'}={}) {
 const calls=[];const api={calls,call:async(name,{request:r})=>{
  calls.push({name,...r}); let data;
  if(r.operation==='ListLocalInstances')data=Array.from({length:ambiguous?2:1},()=>({parentProcessName:'PBIDesktop',parentWindowTitle:'fixture',port:1234,processId:5,startTime:'fixed'}));
  else if(r.operation==='Connect')data='explicit-connection';
  else if(name==='database_operations')data=[{id:'db1'}];
  else if(r.operation==='List')data=missing?[]:[{name:'Fixture'}];
  else if(r.operation==='ExportTMDL')return {content:[{type:'resource',resource:{text:hash}}]};
  else if(r.operation==='RefreshWithXMLA'){if(failRefresh)throw new Error('timeout');data={};}
  else if(r.operation==='Execute')data={rows:[{'[__dsh_rows]':count}],isTruncated:false};
  else throw new Error('Unexpected request');
  return {content:[{type:'text',text:JSON.stringify({data})}]};
 }};return api;
}
const resolver=async(project,instances)=>{if(instances.length!==1)throw new Error('ambiguous');return instances[0];};
const inspect=(api,project,tables)=>actualInspect(api,project,tables,resolver);
const run=(api,input,emit)=>actualRun(api,input,emit,resolver);
const base={project:'fixture.pbip',tables:['Fixture'],checks:[{table:'Fixture',minRows:3,maxRows:3}]};
test('inspection never writes and rejects ambiguous or missing targets',async()=>{
 for(const option of [{ambiguous:true},{missing:true}])await assert.rejects(inspect(mock(option),base.project,base.tables));
 const api=mock();await inspect(api,base.project,base.tables);assert.ok(!api.calls.some(x=>x.operation.startsWith('Refresh')));
});
test('exact table refresh with explicit connection and row-count evidence',async()=>{
 const api=mock();const target=(await inspect(api,base.project,base.tables)).target;const events=[];
 const result=await run(api,{...base,operation:'refresh',target},e=>events.push(e));
 assert.equal(result.verified,true);assert.equal(result.observations[0].rowCount,3);
 const refresh=api.calls.find(x=>x.operation==='RefreshWithXMLA');assert.deepEqual(refresh.references,[{name:'Fixture'}]);assert.equal(refresh.refreshType,'Full');assert.equal(refresh.connectionName,'explicit-connection');
 assert.deepEqual(events.map(x=>x.event),['ready','dispatch','refreshed']);
});
test('changed model refuses writes; failed checks do not imply refresh rollback',async()=>{
 const target=(await inspect(mock(),base.project,base.tables)).target;
 const changed=mock({hash:'different'});await assert.rejects(run(changed,{...base,operation:'refresh',target},()=>{}),/changed/);assert.ok(!changed.calls.some(x=>x.operation==='RefreshWithXMLA'));
 const api=mock({count:2});const result=await run(api,{...base,operation:'refresh',target},()=>{});assert.equal(result.modelDataRefreshed,true);assert.equal(result.verified,false);assert.equal(result.runtimeRollbackAvailable,false);
});
test('journal acknowledgment must finish before write dispatch',async()=>{
 const api=mock();const target=(await inspect(api,base.project,base.tables)).target;
 await assert.rejects(run(api,{...base,operation:'refresh',target},async e=>{if(e.event==='dispatch')throw new Error('disk full');}),/disk full/);
 assert.ok(!api.calls.some(x=>x.operation==='RefreshWithXMLA'));
});
test('refresh failure never automatically repeats a write',async()=>{
 const api=mock({failRefresh:true});const target=(await inspect(api,base.project,base.tables)).target;
 await assert.rejects(run(api,{...base,operation:'refresh',target},()=>{}));assert.equal(api.calls.filter(x=>x.operation==='RefreshWithXMLA').length,1);
});

test('synchronous refresh accepts the real empty-content success contract',async()=>{
 const api=mock();const original=api.call;
 api.call=async(name,args)=>{const result=await original(name,args);return args.request.operation==='RefreshWithXMLA'?{content:[],isError:false}:result;};
 const target=(await inspect(api,base.project,base.tables)).target;
 const result=await run(api,{...base,operation:'refresh',target},()=>{});
 assert.equal(result.verified,true);
 assert.doesNotThrow(()=>mutationAcknowledged({content:[],isError:false}));
 assert.throws(()=>mutationAcknowledged({content:[],isError:true}));
 assert.throws(()=>mutationAcknowledged({content:[]}));
});

test('post-redraw verification reads rows without reprocessing or rejecting refresh-generated metadata',async()=>{
 const target=(await inspect(mock(),base.project,base.tables)).target;
 const api=mock({hash:'metadata after processing'});
 const result=await run(api,{...base,operation:'verify',target},()=>{});
 assert.equal(result.verified,true);assert.equal(result.modelDataRefreshed,false);assert.equal(result.modelFingerprintChanged,true);
 assert.ok(!api.calls.some(x=>x.operation==='RefreshWithXMLA'));
});
