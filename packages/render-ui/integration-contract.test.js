import test from 'node:test';
import assert from 'node:assert/strict';
import {createLegacyExports} from './src/legacy-client.js';
function fixture(){
  const registrations=new Map();const options=new Map();let definition, siteDefinition, Site;
  const React={Component:class{},useMemo(fn){return fn();},useEffect(fn){fn();},createElement(type,props,...children){return {type,props,children};}};
  const OpenUiView=()=>null;
  const DashboardView=()=>null;
  const RenderUiIcon=()=>null;
  const RenderUiPanel=()=>null;
  const bridges=[];const dictionaries=[];const sidebarOpened=[];const drafts=new Map();
  const plugin=createLegacyExports({
    OpenUiView,
    DashboardView,
    createToolBridge(ctx,id){return 'tools:'+id;},
    createActionBridge(ctx,id){bridges.push(id);return 'bridge:'+id;},
    RenderUiIcon,
    RenderUiPanel,
    PANEL_ID:'render-ui',
    PANEL_NS:'render-ui.panel',
    PANEL_DICTIONARIES:{en:{panel:'Render UI'},zh:{panel:'渲染 UI'}},
    registerPresentation(spec, title, key, sessionId){ return 'dsh-resource://render-ui/' + sessionId + '/' + key; },
    presentationAddress(sessionId, key){return 'dsh-resource://render-ui/' + sessionId + '/' + key;},
    hasPresentation(_session, key){return drafts.has(key);},
    updatePresentationDraft(_session, key, spec){const first = !drafts.has(key); drafts.set(key, spec); return first;},
  },()=>React);
  const ctx={
    slots:{inject(_name,install){install();},register(option,component){
      if (option.key === 'local-render-ui-site-delivery') Site = component;
      else { registrations.set(option.name,component); options.set(option.name,option); }
    }},
    uiConversation:{events:{register(value){if (value.kind === 'local-render-ui-inline') definition=value; else siteDefinition=value;}}},
    locale:{register(ns,dicts){dictionaries.push({ns,dicts});return ()=>{};},bind(ns){return key=>ns+':'+key;}},
    sidebarRight:{openResource(id){sidebarOpened.push(id);}},
    effect(effect){return effect();},
  };
  plugin.apply(ctx);
  return {plugin,definition,siteDefinition,Site,registrations,options,dictionaries,bridges,sidebarOpened,drafts,OpenUiView,DashboardView,RenderUiIcon,RenderUiPanel};
}
test('actual inline projection preserves OpenUI metadata and session action scope',()=>{
  const f=fixture();const spec={view:'openui',format:'openui-lang',libraryVersion:'dsh-openui-1',lang:'root = Stack([])'};
  const event={seq:55,data:{message:{source:{callId:'call-openui'}},meta:{tool:'render_ui',version:1,spec}}};
  assert.equal(f.definition.match['tool/result'](event).id,'call-openui');
  const match={event};const state=f.definition.start({},match);
  const node=f.definition.buildViewNode({state,key:'view-key',id:'call-openui',start:match,matches:[match]});
  assert.equal(node.groupTree,'turn');assert.equal(node.data.spec,spec);
  const Inline=f.registrations.get('conversation.chat.node');
  const rendered=Inline({node,sessionId:'session-verified'});
  const card=rendered.children[0];
  assert.equal(card.props.toolBridge,'tools:session-verified');
  assert.equal(card.props.actionBridge,'bridge:session-verified');assert.deepEqual(f.bridges,['session-verified']);
  const boundary=card.type(card.props);assert.equal(boundary.children[0].type,f.OpenUiView);assert.equal(boundary.children[0].props.spec,spec);
  // The card carries an explicit "Open in sidebar" action beside the view.
  const actionRow=rendered.children[1];
  assert.equal(actionRow.children[0].type,'button');
  assert.equal(actionRow.children[0].children[0],'Open in sidebar');
});
test('stream preview uses bounded PartialArguments and never gains an action bridge',()=>{
  const f=fixture();let observed;
  const Receipt=f.registrations.get('tool.call.toolview');
  const preview=Receipt({phase:'preparing',block:{args:{textPrefix(key,max){observed={key,max};return 'root = Stack([';}}}});
  assert.deepEqual(observed,{key:'lang',max:200000});
  const view=preview.children[0];assert.equal(view.type,f.OpenUiView);assert.equal(view.props.isStreaming,true);assert.equal(view.props.actionBridge,undefined);
  assert.deepEqual(f.bridges,[]);
});
test('failed results do not expose an OpenUI result or streaming preview',()=>{
  const f=fixture();const Receipt=f.registrations.get('tool.call.toolview');
  const rendered=Receipt({phase:'result',block:{isError:true,args:{lang:'root = Stack([])'}}});
  assert.notEqual(rendered.type,f.OpenUiView);assert.match(rendered.children.join(' '),/failed/);
  assert.equal(f.definition.match['tool/result']({data:{message:{isError:true,source:{callId:'bad'}},meta:{tool:'render_ui',version:1,spec:{view:'openui'}}}}),null);
});

test('sidebar entry registers one panellist row and the matching main panel',()=>{
  const f=fixture();
  assert.equal(f.registrations.get('sidebar.panellist'),f.RenderUiIcon);
  assert.equal(f.registrations.get('main'),f.RenderUiPanel);
  assert.equal(f.options.get('sidebar.panellist').id,'render-ui');
  assert.equal(f.options.get('sidebar.panellist').order,20);
  assert.equal(f.options.get('main').key,'render-ui');
  assert.deepEqual(f.dictionaries,[{ns:'render-ui.panel',dicts:{en:{panel:'Render UI'},zh:{panel:'渲染 UI'}}}]);
});

test('dashboard specs render through the dashboard view',()=>{
  const f=fixture();
  const spec={view:'openui',format:'openui-lang',library:'dashboard',libraryVersion:'dsh-openui-dashboard-1',lang:'root = Dashboard([])'};
  const Inline=f.registrations.get('conversation.chat.node');
  const rendered=Inline({node:{data:{spec}},sessionId:'s'});
  const boundary=rendered.children[0].type(rendered.children[0].props);
  assert.equal(boundary.children[0].type,f.DashboardView);
  assert.equal(boundary.children[0].props.spec,spec);
});

test('dashboard streaming preview uses the dashboard view',()=>{
  const f=fixture();
  const Receipt=f.registrations.get('tool.call.toolview');
  const preview=Receipt({phase:'preparing',block:{args:{lang:'root = Dashboard([',library:'dashboard'}}});
  const view=preview.children[0];
  assert.equal(view.type,f.DashboardView);
  assert.equal(view.props.spec.library,'dashboard');
  assert.equal(view.props.isStreaming,true);
});

test('only a fresh explicit artifact auto-opens, with no second renderer in the chat', () => {
  const f = fixture();
  const Inline = f.registrations.get('conversation.chat.node');
  const spec = {view:'openui', lang:'root = Stack([])', title:'Methods explorer', placement:'artifact'};
  const render = time => Inline({node:{data:{spec, callId:'call-1', time}}, sessionId:'session-1'});
  const replayed = render(Date.now() - 60_000);
  assert.deepEqual(f.sidebarOpened, []);
  assert.equal(replayed.children[0].type, 'strong');
  assert.equal(replayed.children[1].children[0].children[0], 'Open artifact');
  render(Date.now());
  assert.deepEqual(f.sidebarOpened, ['dsh-resource://render-ui/session-1/call-1']);
  assert.deepEqual(f.bridges, []);
});

test('a streaming sidebar draft opens once and its result does not reopen it', () => {
  const f = fixture();
  const Receipt = f.registrations.get('tool.call.toolview');
  const Inline = f.registrations.get('conversation.chat.node');
  const sessionId = 'session';
  const callId = 'stream';
  const args = {placement:'artifact', lang:'root = Stack(['};
  Receipt({sessionId, callId, phase:'preparing', block:{args}});
  Receipt({sessionId, callId, phase:'preparing', block:{args:{...args, lang:'root = Stack([])'}}});
  Inline({sessionId, node:{data:{callId, time:Date.now(), spec:{...f.drafts.get(callId), placement:'artifact'}}}});
  assert.equal(f.drafts.get(callId).lang, 'root = Stack([])');
  assert.deepEqual(f.sidebarOpened, ['dsh-resource://render-ui/session/stream']);
  assert.deepEqual(f.bridges, []);
});

test('a fresh HTML delivery opens the entry page once per turn', () => {
  const f = fixture();
  const event = {seq:42, time:Date.now(), data:{turn:1, files:[{path:'site/about.html'}, {path:'site/index.html'}]}};
  const match = f.siteDefinition.match['deliverables/presented'](event);
  assert.equal(match.role, 'start');
  const state = f.siteDefinition.start({}, {event});
  const node = f.siteDefinition.buildViewNode({state});
  f.Site({node, sessionId:'site-session'});
  f.Site({node, sessionId:'site-session'});
  f.Site({node:{data:{...state, turn:2, time:Date.now()-60_000}}, sessionId:'site-session'});
  assert.deepEqual(f.sidebarOpened, ['dsh-resource://file/session/site-session/site/index.html']);
});
