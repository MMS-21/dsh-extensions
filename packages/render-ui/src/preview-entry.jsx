import React from 'react';
import {createRoot} from 'react-dom/client';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';
import * as jsxRuntime from 'react/jsx-runtime';
let plugin;
const shared={'react':React,'react-dom':ReactDOM,'react-dom/client':ReactDOMClient,'react/jsx-runtime':jsxRuntime};
window.__ModuleLoader__={load(def){plugin=def.factory(name=>{if(!(name in shared))throw Error('Unexpected host dependency '+name);return shared[name];});}};
import {customExamples} from './openui-examples.js';
import {createToolBridge} from './tool-bridge.js';
import {analyticsExample} from './analytics-fixture.js';
const executionTest=new URLSearchParams(location.search).has('execution');
const liveLang=`$city = "Cairo"
data = Query("test_lookup", {city:$city}, {label:"Loading data"})
saved = Mutation("test_save", {city:$city})
blocked = Mutation("unknown_operation", {})
root = Stack([TextContent(data.label), Button("Refresh data", Action([@Run(data)])), Button("Switch location", Action([@Set($city, "Tokyo")])), TextContent(saved.status), saved.status == "success" ? TextContent(saved.data.message) : null, saved.status == "error" ? TextContent(saved.error) : null, Button("Save location", Action([@Run(saved)])), Button("Denied operation", Action([@Run(blocked)])), blocked.status == "error" ? TextContent(blocked.error) : null])`;
const liveDashboardLang=`root = Dashboard([header, section])
header = DashboardHeader("Live session", "auto-refresh every 2s")
stats = Query("session_stats", {}, {context:{window:0, usedTokens:0, percent:0}, tokens:{uncachedInput:0, cacheRead:0, cacheWrite:0, output:0}, activity:{turns:0, steps:0}, history:[0, 0, 0, 0, 0, 0, 0, 0]}, 2)
section = Section([row1, row2])
row1 = CardRow([c1, c2, c3])
c1 = SmallCard("Context used", stats.context.percent + "%")
c2 = SmallCard("Output tokens", "" + stats.tokens.output)
c3 = SmallCard("Steps", "" + (stats.activity == null ? 0 : stats.activity.steps))
row2 = CardRow([chartCard])
chartCard = MediumCard([chartHeader, chart])
chartHeader = DashboardCardHeader("Output tokens over refreshes")
chart = LineChart(["1", "2", "3", "4", "5", "6", "7", "8"], [Series("output", stats.history)])`;
let reads=0;
let statCalls=0;
const testBridge=createToolBridge({connection:{rpc:{async call(channel, endpoint, payload, signal) {
  window.__dshTest.toolCalls.push({channel,endpoint,payload:payload.args});
  await new Promise(resolve=>setTimeout(resolve,80));
  if(signal?.aborted)throw new Error('Aborted');
  const {name,arguments:args}=payload.args.request;
  if(name==='test_lookup')return {ok:true,value:{label:args.city+' reading '+(++reads)}};
  if(name==='test_save')return {ok:true,value:{message:'Saved '+args.city}};
  if(name==='session_stats') {
    statCalls++;
    const used = 12000 + statCalls * 137;
    return {ok:true,value:{
      model:'preview-model',
      workingDirectory:'C:\\preview',
      context:{window:200000, usedTokens:used, percent:Math.min(100, Math.round(used / 200000 * 100)), pressureTokens:used, projectedTokens:used},
      breakdown:{systemTokens:4000, toolsTokens:3000, messageTokens:5000},
      tokens:{uncachedInput:8000, cacheRead:4000, cacheWrite:0, output:120 + statCalls},
      activity:{turns:1, steps:statCalls, llmMs:0, toolMs:0, ttftMs:0, ttftSteps:0, decodeMs:0, decodeTokens:0},
      history:Array.from({length:8}, (_, i) => Math.max(0, 120 + (statCalls - i))),
      asOfSeq:statCalls,
    }};
  }
  return {ok:false,error:{message:'UNKNOWN_TOOL: operation unavailable'}};
}}}},'preview-session');
window.__dshTest={requests:[],errors:[],toolCalls:[]};window.addEventListener('error',e=>window.__dshTest.errors.push(e.message));
const examples = ['root = Stack([Card([CardHeader("Full OpenUI library", "Charts, forms and safe agent requests"), Tabs([TabItem("chart", "Chart", [BarChart(["Unit", "Integration"], [Series("Passed", [12, 8])])]), TabItem("request", "Request", [Form("review", Buttons([Button("Ask agent", @ToAssistant("Inspect the selected branch"))]), [FormControl("Branch", Input("branch", "main"))])])])])])', ...customExamples];
const script=document.createElement('script');script.src='./lib/client.js';script.onerror=()=>window.__dshTest.errors.push('Failed to load actual plugin bundle');script.onload=()=>{
  let Receipt;
  const registrations = {};
  const sidebar = { tabDef: undefined, opened: [], bodies: [] };
  let onOpenResource;
  window.__dshSidebar = sidebar;
  const syncProbe = () => {
    const node = document.getElementById('sidebar-probe');
    if (!node) return;
    node.dataset.tabId = sidebar.tabDef ? sidebar.tabDef.id : '';
    node.dataset.tabKind = sidebar.tabDef ? sidebar.tabDef.kind : '';
    node.dataset.tabPatterns = sidebar.tabDef ? JSON.stringify(sidebar.tabDef.patterns) : '';
    node.dataset.opened = sidebar.opened.join(',');
  };
  plugin.apply({
    slots: {
      inject(_name, install) { install(); },
      register(options, component) {
        registrations[`${options.name}:${options.key ?? options.id ?? ''}`] = component;
        if (options.name === 'tool.call.toolview') Receipt = component;
        if (options.name === 'sidebar.right.pane.tab') sidebar.bodies.push(component);
      },
    },
    uiConversation: { events: { register() {} } },
    effect() {},
    locale: { register() {}, bind() { return key => key; } },
    sidebarRightTabs: { register(def) { sidebar.tabDef = def; syncProbe(); return () => {}; } },
    sidebarRight: { openResource(id) { sidebar.opened.push(id); syncProbe(); onOpenResource?.(id); } },
  });
  const RenderUi=plugin.__render;
  if(new URLSearchParams(location.search).has('obsidian')) {
    const fallback=new URLSearchParams(location.search).has('draft');
    const stream=new URLSearchParams(location.search).has('stream');
    const lang=fallback?analyticsExample.replace('data, "review_pr", "overview", 760, true','data, null, "overview", 760, true'):analyticsExample;
    const bridge=async(name,args)=>{window.__dshTest.toolCalls.push({name,args});if(name==='review_pr')return {answer:'The change restores keyboard focus when the PR panel closes.'};throw Error('Unknown tool');};
    createRoot(document.getElementById('root')).render(stream ? <Receipt phase="preparing" block={{args:{lang}}}/> : <RenderUi spec={{view:'openui',title:'Engineering dashboard',lang}} toolBridge={bridge} actionBridge={async text=>window.__dshTest.requests.push(text)}/>);
    return;
  }
  if (new URLSearchParams(location.search).has('recommendation-cards')) {
    const lang = `root = Stack([RecommendationCards([park, museum])])
park = Recommendation("Al-Azhar Park", "Old Cairo", "Open skyline at dusk", "http://127.0.0.1:18765/icon.svg", "Park photo", "https://example.org/park", "Cairo Tower", "A higher city view")
museum = Recommendation("Egyptian Museum", "Tahrir", "A focused history visit")`;
    const clickable = new URLSearchParams(location.search).has('composer');
    function Fixture() {
      const [draft, setDraft] = React.useState('');
      const composer = React.useRef(null);
      const stage = clickable ? async text => {
        setDraft(previous => previous ? previous + '\n\n' + text : text);
        composer.current.focus();
      } : undefined;
      const source = clickable ? lang.replace('root = Stack([RecommendationCards([park, museum])])',
        'root = Stack([RecommendationCards([park, museum]), Button("Existing follow-up", @ToAssistant("Compare both places"))])') : lang;
      return <>
        <RenderUi spec={{view:'openui', lang:source}} actionBridge={stage} />
        {clickable && <textarea ref={composer} aria-label="Chat composer" value={draft} onChange={event => setDraft(event.target.value)} />}
      </>;
    }
    createRoot(document.getElementById('root')).render(<Fixture />);
    return;
  }
  if (new URLSearchParams(location.search).has('overview-grid')) {
    const lang = `root = Stack([Card([CardHeader("Best windows to be out"), OverviewCardBlock([morning, midday, afternoon, evening], "grid", true)])])
morning = OverviewCardItem("morning", IconText(Icon("sun"), "soft", "m", "Morning", "09:00–11:00"), MetricIndicatorInline("18–22°C", "Clear, light breeze"))
midday = OverviewCardItem("midday", IconText(Icon("cloud-sun"), "soft", "m", "Midday", "11:00–15:00"), MetricIndicatorInline("22–24°C", "Warmest, breeziest"))
afternoon = OverviewCardItem("afternoon", IconText(Icon("wind"), "soft", "m", "Late afternoon", "15:00–18:00"), MetricIndicatorInline("21–24°C", "Wind easing"))
evening = OverviewCardItem("evening", IconText(Icon("moon"), "soft", "m", "Evening", "19:00–21:00"), MetricIndicatorInline("18–20°C", "Calm, clear"))`;
    createRoot(document.getElementById('root')).render(<RenderUi spec={{view:'openui', lang}} />);
    return;
  }
  if (new URLSearchParams(location.search).has('sidebar-stream')) {
    const Inline = registrations['conversation.chat.node:local-render-ui-inline'];
    const Pane = registrations['sidebar.right.pane.tab:render-ui'];
    const sessionId = 'stream-chat';
    const previewLang = title => 'root = Stack([' + [title, ...Array.from({length:28}, (_, index) => 'Row ' + (index + 1))]
      .map(text => 'TextContent(' + JSON.stringify(text) + ')').join(',') + '])';
    const spec = {view:'openui', title:'Live draft', placement:'artifact',
      lang:previewLang('Validated result')};
    function Fixture() {
      const [contentId, setContentId] = React.useState('');
      const [phase, setPhase] = React.useState(0);
      onOpenResource = setContentId;
      return <>
        <button type="button" onClick={() => setPhase(phase + 1)}>Advance stream</button>
        {phase < 3 ? <Receipt sessionId={sessionId} callId="draft" phase="preparing" block={{args:{
          placement:spec.placement, title:spec.title,
          lang:phase === 0 ? '' : previewLang('Partial ' + phase),
        }}} /> : <Inline sessionId={sessionId} node={{data:{spec,callId:'draft',time:Date.now()}}} />}
        {contentId && <div style={{display:'flex', flexDirection:'column', height:260, width:340, overflow:'hidden'}}>
          <Pane useTabInfo={() => ({tab:{contentId}})} sessionId={sessionId} />
        </div>}
      </>;
    }
    createRoot(document.getElementById('root')).render(<Fixture />);
    return;
  }
  if (new URLSearchParams(location.search).has('mini-app')) {
    const Inline = registrations['conversation.chat.node:local-render-ui-inline'];
    const Pane = registrations['sidebar.right.pane.tab:render-ui'];
    const Library = registrations['main:render-ui'];
    const spec = {view:'mini-app', title:'Research methods explorer', placement:'artifact', selectionKeys:['weight'],
      snapshot:{id:'research-fixture',data:{observations:[2,8]}}, miniApp:{
        html:`<h2>Compare estimates</h2>
<label>Weight on second value <input name="weight" type="number" min="0" max="1" step="0.1" value="0.5"></label>
<p>Equal weighting: <output data-output="equal"></output></p>
<p>Custom weighting: <output data-output="custom"></output></p>
<p>Network: <output data-output="network"></output></p>
<img src="/probe"><script>document.body.textContent="unsafe"</script>`,
        css:'@import url("http://127.0.0.1:18765/probe"); output { font-weight: 650; }',
        code:`async function calculate(inputs,data) {
  const [a,b] = data.observations;
  if (inputs.weight === 1) { for (;;) {} }
  let network = "available";
  try { await fetch("http://127.0.0.1:18765/probe", {mode:"no-cors"}); } catch { network = "blocked"; }
  return {equal:(a+b)/2, custom:(a*(1-inputs.weight)+b*inputs.weight).toFixed(1), network};
}`,
      }};
    function Fixture() {
      const [contentId, setContentId] = React.useState('');
      const [library, setLibrary] = React.useState(false);
      onOpenResource = setContentId;
      return <>
        <button type="button" onClick={() => setLibrary(true)}>Show saved views</button>
        {library ? <Library /> : <>
          <Inline node={{data:{spec,callId:'research',time:0}}} sessionId="research-chat" />
          {contentId && <Pane useTabInfo={() => ({tab:{contentId}})} sessionId="research-chat" />}
        </>}
      </>;
    }
    createRoot(document.getElementById('root')).render(<Fixture />);
    return;
  }
  if (new URLSearchParams(location.search).has('artifacts')) {
    const Inline = registrations['conversation.chat.node:local-render-ui-inline'];
    const Pane = registrations['sidebar.right.pane.tab:render-ui'];
    const Library = registrations['main:render-ui'];
    const spec = {view:'openui', title:'Methods explorer', snapshot:{id:'fixture', data:{values:[5, 10]}},
      selectionKeys:['index'], lang:`$index = 0
data = Query("ui_snapshot", {}, {values:[0, 0]})
root = Stack([TextContent("Inline explanation"), TextContent("Estimate: " + data.values[$index]), BarChart(["Estimate"], [Series("Result", [$index == 0 ? @First(data.values) : data.values[1]])]), Button("Double estimate", @Set($index, 1))])`};
    const revisionRef = new URLSearchParams(location.search).get('revision');
    const revision = revisionRef && {
      view:'openui', title:'Methods explorer', placement:'artifact', revisionOf:JSON.parse(revisionRef),
      lang:spec.lang.replace('TextContent("Inline explanation")', 'TextContent("Method B comparison")'),
    };
    const hasResources = new URLSearchParams(location.search).has('chat-resources');
    const resourceEvents = hasResources ? [
      {event:{type:'deliverables/presented', time:1001, data:{files:[{path:'sales.csv'}, {path:'trend.svg'}]}}},
      {event:{type:'assistant/message', time:1002, data:{message:{content:[
        {type:'text', text:'[Project docs](https://example.org/project)'},
      ]}}}},
    ] : [];
    const workspaceFiles = hasResources ? {
      readBytes: async () => ({ok:true, value:{data:new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="blue"/></svg>',
      )}}),
    } : undefined;
    const sessions = new URLSearchParams(location.search).has('chat-history') || hasResources ? {
      refresh: async () => {},
      list: {getSnapshot: () => ({ids:['origin'], byId:{origin:{displayTitle:'Source conversation', updatedAt:1}}})},
      retain: () => ({
        release() {},
        ready: Promise.resolve({
          session: {getSnapshot: () => ({openState:'open', hasMore:false})},
          eventSource: {getSnapshot: () => ({entries:[{event:{
            type:'tool/result', time:1000,
            data:{message:{source:{callId:'inline'}}, meta:{tool:'render_ui', version:1, spec}},
          }}, ...resourceEvents]})},
        }),
      }),
    } : undefined;
    function Fixture() {
      const [contentId, setContentId] = React.useState('');
      const [library, setLibrary] = React.useState(false);
      onOpenResource = setContentId;
      return <>
        <button type="button" onClick={() => setLibrary(true)}>Show saved views</button>
        {library ? <div className="fixture-center-column" style={{display:'flex', flexDirection:'column', overflow:'hidden', height:'calc(100vh - 48px)'}}><Library sessions={sessions}
          workspaceFiles={workspaceFiles} openFile={hasResources ? item => setContentId(item.address) : undefined} />
          {hasResources && contentId && <output>{contentId}</output>}
        </div> : revision ? <>
          <Inline node={{data:{spec:revision,callId:'revised',time:0}}} sessionId="another-chat" />
          {contentId && <Pane useTabInfo={() => ({tab:{contentId}})} sessionId="another-chat" />}
        </> : <>
          <p>Introductory prose</p>
          <Inline node={{data:{spec,callId:'inline'}}} sessionId="origin" />
          <p>Follow-up prose</p>
          <Inline node={{data:{spec:{view:'openui', title:'Separate draft', placement:'artifact', lang:'root = Stack([])'},callId:'draft',time:0}}} sessionId="origin" />
          {contentId && <Pane useTabInfo={() => ({tab:{contentId}})} sessionId="origin" />}
        </>}
      </>;
    }
    createRoot(document.getElementById('root')).render(<Fixture />);
    return;
  }
  if(executionTest) {
    createRoot(document.getElementById('root')).render(<><RenderUi spec={{view:'openui',lang:liveLang,title:'Reactive execution test'}} toolBridge={testBridge}/><RenderUi spec={{view:'openui',lang:'root = Stack([TextContent("No session execution")])'}}/><Receipt phase="preparing" block={{args:{lang:'q = Query("must_not_run", {}, {label:"Preview only"})\nroot = Stack([TextContent(q.label)])'}}}/></>);
    return;
  }
  // Recovery fixture: a deliberately malformed program plus a repair workflow.
  if(new URLSearchParams(location.search).has('recovery')) {
    createRoot(document.getElementById('root')).render(<RenderUi spec={{view:'openui',title:'Broken presentation',lang:'root = Stack([TextContent("ok"), MissingWidget("x")])'}} actionBridge={async text=>window.__dshTest.requests.push(text)}/>);
    return;
  }
  // Live dashboard fixture: a session_stats Query on a 2s refresh interval.
  if(new URLSearchParams(location.search).has('dashboard')) {
    createRoot(document.getElementById('root')).render(<RenderUi spec={{view:'openui',library:'dashboard',title:'Live session',lang:liveDashboardLang}} toolBridge={testBridge}/>);
    return;
  }
  // Right-sidebar fixture: the inline node plus the registered tab type.
  if(new URLSearchParams(location.search).has('sidebar')) {
    const Inline = registrations['conversation.chat.node:local-render-ui-inline'];
    createRoot(document.getElementById('root')).render(<>
      <div id="sidebar-probe" data-tab-id={sidebar.tabDef ? sidebar.tabDef.id : ''} data-tab-kind={sidebar.tabDef ? sidebar.tabDef.kind : ''} data-opened={sidebar.opened.join(',')} />
      <Inline node={{data:{spec:{view:'openui',title:'Sidebar probe',lang:'root = Stack([TextContent("rendered in the right sidebar")])'},callId:'call-sidebar-1'}}} sessionId="preview-session"/>
    </>);
    return;
  }
  // Status-line fixture: render the dock strip with a mock projection seat.
  if(new URLSearchParams(location.search).has('status')) {
    const StatusLine = plugin.__statusLine;
    const useProjection = (key) => ({
      contextPressure:{pressureTokens:90000, projectedTokens:120000, contextWindow:200000},
      tokenUsage:{uncachedInputTokens:70000, cacheReadTokens:50000, cacheWriteTokens:0, outputTokens:12000},
      sessionStats:{turns:4, steps:11, llmMs:92000, toolMs:8000, ttftMs:300, ttftSteps:3, decodeMs:91000, decodeTokens:11000},
      workingDirectory:'C:\\example-workspace',
    })[key];
    createRoot(document.getElementById('root')).render(<main style={{maxWidth:1000,margin:'24px auto',padding:16}}><StatusLine useProjection={useProjection} t={undefined}/></main>);
    return;
  }
  createRoot(document.getElementById('root')).render(<main style={{maxWidth:1000,margin:'24px auto',display:'grid',gap:24}}>{examples.map((lang,i)=><RenderUi key={i} spec={{view:'openui',libraryVersion:'dsh-openui-1',title:'OpenUI integration · '+i,lang}} actionBridge={async text=>window.__dshTest.requests.push(text)}/>)}</main>);
};document.head.append(script);
