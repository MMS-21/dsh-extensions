import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('tools-only plugin does not load a client or register any sidebar surface',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 assert.equal(pkg.dsh.client,undefined);
 let plugin;vm.runInNewContext(readFileSync(new URL('../client.js',import.meta.url),'utf8'),{window:{__ModuleLoader__:{load(value){plugin=value.factory();}}}});
 plugin.apply(new Proxy({},{get(){throw Error('No client services may be accessed');}}));
 assert.equal(pkg.files.some(x=>x.startsWith('previews/')),false);
});
