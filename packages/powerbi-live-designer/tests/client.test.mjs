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
    },useEffect:fn=>effects.push(fn),useRef:()=>({current:null})};
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

test('the sidebar offers native review before the v6 document is ready', () => {
  const {Body}=fixture();
  const pane=Body({sessionId:'native-session'});
  const review=pane.children[0];
  assert.equal(review.type,'section');
  assert.ok(review.children.some(child=>child?.type==='button'&&child.children.includes('Review pending changes')));
  assert.equal(pane.children.some(child=>child?.type==='iframe'),false);
  assert.equal(Body({}).type,'p');
});
