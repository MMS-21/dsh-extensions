import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {TYPERT} from '../typert.host.js';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('package has native bundle, exact compatibility, no lifecycle scripts or runtime dependencies',()=>{
 const p=JSON.parse(read('package.json'));assert.equal(p.engines.dsh,'0.2.2-rc.5');assert.equal(p.dsh.bundle.patch,'./cordis.patch.yml');
 assert.equal(p.dependencies,undefined);assert.deepEqual(Object.keys(p.scripts),['test']);
 for(const f of [...p.files,...Object.values(p.exports)])assert.ok(existsSync(new URL('../'+f,import.meta.url)),f);
});
test('rail client queries the matching read-only remote and disposes its stylesheet',async()=>{
 let registration,removed=false,cleanup,slot,props;
 vm.runInNewContext(read('client.js'),{window:{__ModuleLoader__:{load:mod=>{registration=mod;}}},document:{createElement:()=>({remove(){removed=true;}}),head:{appendChild(){}}}});
 assert.equal(registration.id,'dsh-codex-oauth-safe');const mod=registration.factory(name=>{assert.equal(name,'react');return {createElement(){}};});
 let descriptor;const snapshot={status:'unavailable',windows:[],fetchedAt:123};
 mod.apply({remote:{$mount:d=>{descriptor=d;return Promise.resolve();}},get:()=>({query:async()=>({ok:true,value:snapshot})}),effect:fn=>{cleanup=fn();},slots:{inject:(name,fn)=>{assert.equal(name,'sidebar.footer.action');fn();},register:options=>{slot=options;props=options.inject();}}});
 assert.equal(descriptor.descriptors[0].id,TYPERT.invocations[0].id);assert.equal(TYPERT.invocations.length,1);
 assert.equal(TYPERT.invocations[0].method,'query');assert.equal(slot.id,'safe-codex-quota-rail');assert.deepEqual(await props.query(),snapshot);cleanup();assert.ok(removed);
});
