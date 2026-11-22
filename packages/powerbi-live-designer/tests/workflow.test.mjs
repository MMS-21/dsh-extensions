import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {TaskStore,DESIGN_SKILLS} from '../task-store.mjs';
import {Workflow} from '../workflow.mjs';
function fixture(t){
  const dir=mkdtempSync(join(tmpdir(),'pbi-workflow-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const store=new TaskStore(dir);const calls=[];let approved=false,applied=false,reloaded=false,refreshed=false,dirty=false;
  const change={id:'a'.repeat(32),digest:'b'.repeat(64)};const processing={id:'c'.repeat(32),digest:'d'.repeat(64)};
  const image=join(dir,'page.png');writeFileSync(image,'fixture, not a real screenshot');const sha256=createHash('sha256').update(readFileSync(image)).digest('hex');
  const adapter={authorize:async()=>{approved=true;return {...change,status:'approved',approval:{digest:change.digest,source:'task-workflow'}};},normalize:x=>x.toLowerCase(),prepare:async input=>({project:input.project,capabilities:{desktop:true},connection:{serviceUrl:'http://127.0.0.1:1234'}}),bind:async()=>{},inspect:async()=>({model:{tables:[]}}),plan:async()=>({planId:'p'}),stage:async()=>({...change}),validate:async()=>({status:'validated'}),get:async()=>({...change,status:applied?'applied':approved?'approved':'validated',approval:approved?{digest:change.digest,source:'native-user-command'}:null,reloadOutcome:reloaded?'succeeded':null}),apply:async()=>{calls.push('apply');applied=true;return {status:'applied'};},reload:async()=>{calls.push('reload');reloaded=true;return {reloadOutcome:'succeeded'};},stageRefresh:async()=>{calls.push('stage_refresh');return processing;},getRefresh:async()=>({status:refreshed?'verified':'ready',postCanvasVerification:{verified:refreshed}}),refresh:async()=>{calls.push('refresh');refreshed=true;return {status:'verified',postCanvasVerification:{verified:true}};},query:async()=>{calls.push('query');return {passed:true};},capture:async()=>{calls.push('capture');return {rendererAcknowledged:true,path:image,sha256};},readiness:async()=>({checks:{desktopAccessible:true,unsavedChanges:dirty}}),snapshot:async()=> 'snapshot'};
  const engine=new Workflow(store,adapter);const input={project:'C:\\Reports\\Any.pbip',intent:'Compare operational measures'};
  const draft={plan:{},changes:{summary:'Layout',files:[]},pages:['pageA'],acceptance:['The actual business metric reconciles'],checks:[{query:'EVALUATE ROW("n",1)',expected:1}],refresh:{tables:['Fact'],checks:[],sourceFiles:[],sourceSummary:'fixture'}};
  return {store,adapter,engine,input,draft,calls,change,sha256,image,approve:()=>approved=true,dirty:x=>dirty=x};
}
test('context survives a new engine and preserves all user design skills',async t=>{const f=fixture(t);await f.engine.prepare('one',f.input);const engine=new Workflow(f.store,f.adapter);assert.equal(engine.status('one').task.intent,f.input.intent);assert.deepEqual(engine.status('one').task.designSkills,[...DESIGN_SKILLS]);assert.equal(engine.status('two').task,null);});
test('corrupt context fails closed rather than resetting task history',async t=>{const f=fixture(t);await f.engine.prepare('one',f.input);writeFileSync(f.store.paths('one').context,'{"version":1}');assert.throws(()=>f.store.read('one'),/integrity/);});
test('validated drafts execute without any sidebar approval',async t=>{const f=fixture(t);await f.engine.prepare('one',f.input);await f.engine.draft('one',f.draft);assert.equal(f.engine.status('one').task.phase,'ready_to_execute');await f.engine.execute('one');assert.deepEqual(f.calls,['apply','reload','stage_refresh','refresh','query','capture']);});
test('restart after acknowledged processing never reimports or reloads model definitions',async t=>{const f=fixture(t);await f.engine.prepare('one',f.input);await f.engine.draft('one',f.draft);f.approve();const capture=f.adapter.capture;f.adapter.capture=async()=>{throw Error('capture interrupted');};await assert.rejects(f.engine.execute('one'),/capture interrupted/);f.adapter.capture=capture;await new Workflow(f.store,f.adapter).execute('one');assert.equal(f.calls.filter(x=>x==='refresh').length,1);assert.equal(f.calls.filter(x=>x==='reload').length,1);});
test('lost refresh acknowledgment reconciles backend evidence without another import',async t=>{const f=fixture(t);await f.engine.prepare('one',f.input);await f.engine.draft('one',f.draft);f.approve();const run=f.adapter.refresh;f.adapter.refresh=async()=>{await run();throw Error('timeout after commit');};await assert.rejects(f.engine.execute('one'),/timeout/);assert.equal(f.engine.status('one').task.steps.refresh.outcome,'unknown');await f.engine.execute('one');assert.equal(f.calls.filter(x=>x==='refresh').length,1);});
test('unknown refresh without backend completion is never replayed',async t=>{const f=fixture(t);await f.engine.prepare('one',f.input);await f.engine.draft('one',f.draft);f.approve();let calls=0;f.adapter.refresh=async()=>{calls++;throw Error('timeout');};await assert.rejects(f.engine.execute('one'));await assert.rejects(f.engine.execute('one'),/reconciliation/);assert.equal(calls,1);});
test('saved state and exact image review are required before completion',async t=>{const f=fixture(t);await f.engine.prepare('one',f.input);await f.engine.draft('one',f.draft);f.approve();await f.engine.execute('one');await assert.rejects(f.engine.finish('one',[]),/Every affected page/);const reviews=[{page:'pageA',sha256:f.sha256,passed:true,notes:'Fixture only: this tests the review gate, not live appearance.'}];f.dirty(true);assert.equal((await f.engine.finish('one',reviews)).task.phase,'awaiting_save');f.dirty(false);assert.equal((await f.engine.finish('one',reviews)).task.phase,'verified');});
test('changed screenshot or project invalidates evidence',async t=>{const f=fixture(t);await f.engine.prepare('one',f.input);await f.engine.draft('one',f.draft);f.approve();await f.engine.execute('one');f.adapter.snapshot=async()=> 'changed';await assert.rejects(f.engine.finish('one',[{page:'pageA',sha256:f.sha256,passed:true,notes:'review'}]),/Definitions changed/);});
test('concurrent executors cannot dispatch duplicate operations',async t=>{const f=fixture(t);let release;const held=f.store.exclusive('one',()=>new Promise(yes=>release=yes));await assert.rejects(f.store.exclusive('one',async()=>{}),/active or was interrupted/);release();await held;});
test('model edits require analytical checks and correction retains prior history',async t=>{const f=fixture(t);await f.engine.prepare('one',f.input);await assert.rejects(f.engine.draft('one',{...f.draft,checks:[],changes:{files:[{path:'X.SemanticModel/definition/model.tmdl'}]}}),/bounded numerical/);await f.engine.draft('one',f.draft);await assert.rejects(f.engine.draft('one',f.draft),/revisionOf/);await f.engine.draft('one',{...f.draft,revisionOf:f.change.digest});assert.equal(f.engine.status('one').task.history.length,1);});

test('data-only workflow skips design and does not repeat an acknowledged refresh',async t=>{const f=fixture(t);await f.engine.prepare('one',f.input);let count=0;f.adapter.refreshData=async()=>{count++;return {ok:true,completed:['Fact'],observations:[{table:'Fact',rowCount:10}]};};await f.engine.refreshData('one',['Fact']);await f.engine.refreshData('one',['Fact']);assert.equal(count,1);assert.equal(f.engine.status('one').task.phase,'data_refreshed');await assert.rejects(f.engine.refreshData('one',['Other']),/scope changed/);});

test('automatic save follows visual review and reconciles an unknown save without repeating it',async t=>{
  const f=fixture(t);await f.engine.prepare('one',f.input);const task=f.store.read('one');task.capabilities.automaticSave=true;f.store.write('one',task);await f.engine.draft('one',f.draft);f.approve();await f.engine.execute('one');f.dirty(true);
  let writes=0;f.adapter.save=async()=>{writes++;f.dirty(false);throw Error('ack lost');};
  const reviews=[{page:'pageA',sha256:f.sha256,passed:true,notes:'Fixture review'}];
  await assert.rejects(f.engine.finish('one',reviews),/ack lost/);
  assert.equal((await f.engine.finish('one',reviews)).task.phase,'verified');assert.equal(writes,1);assert.equal(f.store.read('one').steps.save.outcome,'succeeded');
});

test('lost task authorization acknowledgment reconciles without another dispatch',async t=>{
 const f=fixture(t);await f.engine.prepare('one',f.input);await f.engine.draft('one',f.draft);
 const authorize=f.adapter.authorize;let count=0;f.adapter.authorize=async value=>{count++;await authorize(value);throw Error('ack lost');};
 await assert.rejects(f.engine.execute('one'),/ack lost/);
 await f.engine.execute('one');assert.equal(count,1);assert.equal(f.calls.filter(x=>x==='apply').length,1);
});
