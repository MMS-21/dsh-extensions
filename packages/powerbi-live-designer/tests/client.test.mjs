import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function fixture({mounted, fetchTask = async () => ({task:null})} = {}) {
  let plugin;
  let Body;
  let tab;
  let shortcut;
  let opened;
  let poll;
  let cursor = 0;
  const state = [];
  const effects = [];
  const react = {createElement:(type,props,...children)=>({type,props:props??{},children}),
    useState(value){
      const index=cursor++;
      if (!(index in state)) state[index]=value;
      return [state[index],next=>{state[index]=next;}];
    },useEffect:fn=>effects.push(fn),useCallback:fn=>fn};
  vm.runInNewContext(readFileSync(new URL('../client.js',import.meta.url),'utf8'), {
    window:{__ModuleLoader__:{load(definition){plugin=definition.factory(()=>react);}}},
    AbortSignal, AbortController,
    fetch:async (_url, request)=>({ok:true,json:()=>fetchTask(JSON.parse(request.body))}),
    setTimeout:fn=>{poll=fn;}, clearTimeout:()=>{},
  });
  plugin.apply({locale:{bind:()=>key=>key,register:()=>()=>{}},
    effect:fn=>fn(),sidebarRightTabs:{register:value=>{tab=value;return()=>{};}},
    shortcuts:{register:value=>{shortcut=value;return()=>{};}},
    sidebarRight:{mounted:mounted && {getSnapshot:mounted},openTabIn:(sessionId,kind)=>{
      assert.equal(kind,tab.kind);
      opened={sessionId,kind};
    },commandTarget:element=>element,openTabFromTarget:(kind,target)=>{
      assert.equal(kind,tab.kind);
      opened={kind,target};
    }},
    slots:{inject:(_name,fn)=>fn(),register:(options,component)=>{if(options.name==='sidebar.right.pane.tab')Body=component;return()=>{};}}});
  return {Body:props=>{cursor=0;return Body(props);}, effects, tab, shortcut, getOpened:()=>opened, poll:()=>poll()};
}

test('a task opens the designer only for the chat still on screen', async () => {
  let active='session-1';
  const {tab,getOpened,poll}=fixture({mounted:()=>active,fetchTask:async ({sessionId})=>{
    if (sessionId==='session-1') active='session-2';
    return {task:{startedAt:'task-start'}};
  }});
  await poll();
  assert.equal(getOpened(),undefined);
  await poll();
  assert.deepEqual(getOpened(),{sessionId:'session-2',kind:tab.kind});
});

test('the right sidebar launcher opens Power BI in the active session', () => {
  const {tab, shortcut, getOpened}=fixture();
  assert.equal(tab.guide[0].commandId,shortcut.id);
  assert.equal(shortcut.resolve({}).status,'blocked');
  const target={sessionId:'native-session'};
  const action=shortcut.resolve({target});
  assert.equal(action.status,'handled');
  action.run();
  assert.deepEqual(getOpened(),{kind:tab.kind,target});
});

test('sidebar shows setup first, then reveals tools for the confirmed project', async () => {
  const {Body,effects}=fixture({fetchTask:async ()=>({task:{project:'C:\\BI\\Sales.pbip'}})});
  function render() {
    const all=[];
    function walk(node){if(!node||typeof node!=='object')return;all.push(node);for(const child of node.children??[])Array.isArray(child)?child.forEach(walk):walk(child);}
    walk(Body({sessionId:'native-session'}));
    return all;
  }
  const button=(view,label)=>view.find(node=>node.type==='button'&&node.children.includes(label));
  const designer=render();
  const designerFrame=designer.find(node=>node.type==='iframe');
  assert.match(designerFrame.props.src,/powerbi_live_designer_v6_reference\.html$/);
  assert.equal(designerFrame.props.sandbox,'allow-scripts');
  button(designer,'Agent Performance v6').props.onClick();
  const performance=render();
  assert.match(performance.find(node=>node.type==='iframe').props.src,/agent_performance_v6_reference\.html$/);
  button(performance,'Live report controls').props.onClick();
  const setup=render();
  assert.ok(setup.some(node=>node.children.includes('Start with a saved Power BI project')));
  assert.equal(button(setup,'Refresh data'),undefined);
  assert.equal(setup.some(node=>node.type==='input'),false);
  const stop=effects[0]();
  await new Promise(resolve=>setImmediate(resolve));
  const overview=render();
  assert.equal(button(overview,'Overview').props['aria-current'],'page');
  assert.ok(overview.some(node=>node.children.includes('C:\\BI\\Sales.pbip')));
  assert.ok(overview.some(node=>node.children.includes('Development status')));
  assert.equal(overview.some(node=>node.children.includes('Agent Performance')),false);
  assert.equal(overview.some(node=>node.type==='input'),false);
  button(overview,'Refresh data').props.onClick();
  const refresh=render();
  assert.equal(button(refresh,'Refresh data').props['aria-current'],'page');
  assert.ok(button(refresh,'Connect to open report'));
  assert.equal(button(refresh,'runPlan'),undefined);
  button(refresh,'Change review').props.onClick();
  const review=render();
  assert.ok(button(review,'Review pending changes'));
  assert.equal(button(review,'Refresh selected tables'),undefined);
  button(review,'Semantic model').props.onClick();
  const model=render();
  assert.ok(button(model,'inspect'));
  button(model,'Operation journal').props.onClick();
  assert.ok(render().some(node=>node.type==='summary'&&node.children.includes('Agent Performance')));
  stop();
});
