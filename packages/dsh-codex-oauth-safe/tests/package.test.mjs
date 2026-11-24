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
test('client registers matching read-only remote and handles result wrapper',()=>{
 let registration;vm.runInNewContext(read('client.js'),{window:{__ModuleLoader__:{load:mod=>{registration=mod;}}}});
 assert.equal(registration.id,'dsh-codex-oauth-safe');const mod=registration.factory(name=>{assert.equal(name,'react');return {createElement(){}};});
 let descriptor;mod.apply({remote:{$mount:d=>{descriptor=d;return Promise.resolve();}},inject(){}});
 assert.equal(descriptor.descriptors[0].id,TYPERT.invocations[0].id);assert.equal(TYPERT.invocations.length,1);
 assert.equal(TYPERT.invocations[0].method,'query');assert.ok(read('client.js').includes('result.ok!==true'));assert.ok(read('client.js').includes("provider==='openai-codex'"));
});
