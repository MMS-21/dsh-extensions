import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function fixture() {
  let plugin;
  let Body;
  const react = {createElement:(type,props,...children)=>({type,props:props??{},children}),
    useState:value=>[value,()=>{}],useEffect:()=>{},useCallback:fn=>fn};
  vm.runInNewContext(readFileSync(new URL('../client.js',import.meta.url),'utf8'), {
    window:{__ModuleLoader__:{load(definition){plugin=definition.factory(()=>react);}}},
    AbortSignal, setTimeout, clearTimeout,
  });
  plugin.apply({locale:{bind:()=>key=>key,register:()=>()=>{}},
    effect:fn=>fn(),sidebarRightTabs:{register:()=>()=>{}},
    slots:{inject:(_name,fn)=>fn(),register:(options,component)=>{if(options.name==='sidebar.right.pane.tab')Body=component;return()=>{};}}});
  return Body;
}

test('sidebar uses the native session hook and keeps writes disabled before verification', () => {
  const Body=fixture();
  const view=Body({useSession:()=>({id:'native-session'})});
  const all=[];
  function walk(node){if(!node||typeof node!=='object')return;all.push(node);for(const child of node.children??[])Array.isArray(child)?child.forEach(walk):walk(child);}
  walk(view);
  const runButton=all.find(node=>node.type==='button'&&node.children.includes('runPlan'));
  assert.equal(runButton.props.disabled,true);
  assert.ok(all.some(node=>node.children.includes('disconnected')));
  assert.ok(all.some(node=>node.type==='summary'&&node.children.includes('evidence')));
  assert.ok(all.some(node=>node.type==='button'&&node.children.includes('inspect')));
});
