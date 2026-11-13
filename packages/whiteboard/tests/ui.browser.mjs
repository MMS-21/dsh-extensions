/** Render the real Client with React and its real Host handlers on an isolated
 * loopback test server. Requires react, react-dom, esbuild, playwright-core
 * (or WHITEBOARD_PLAYWRIGHT), and a local Chromium (WHITEBOARD_CHROMIUM).
 * No live profile boards, chat provider, or credentials are used.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { apply } from '../index.js';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const deps = process.env.WHITEBOARD_UI_DEPS || packageRoot;
const require = createRequire(path.join(deps, 'package.json'));
const { build } = require('esbuild');
const { chromium } = await import(process.env.WHITEBOARD_PLAYWRIGHT ? pathToFileURL(process.env.WHITEBOARD_PLAYWRIGHT).href : 'playwright-core');
const output = path.join(packageRoot, 'test-artifacts');
await mkdir(output, { recursive: true });
const tools = new Map(), routes = new Map();
await apply({
  tools: { register(tool) { tools.set(tool.name, tool); return () => {}; } },
  connection: { fetch: { register(route) { routes.set(route.path, route.fetch); return () => {}; } } },
  agents: {}, systemPrompt: { section() {} }, effect() {},
});

const { outputFiles } = await build({
  stdin: { contents: "import * as React from 'react'; import {createRoot} from 'react-dom/client'; window.React=React; window.createRoot=createRoot;", resolveDir: deps },
  bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' },
});
const client = (await readFile(path.join(packageRoot, 'client.js'), 'utf8')).replace('    return module.exports;', `
    module.exports.test = {$board, $sharing, $draft, setBoard, undo, redo, moveBoardToWorkspace, setChatSharing, shareAll};
    return module.exports;`);
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body,#root{margin:0;width:100%;height:100%;font-family:Arial,sans-serif}
body{--dsw-alias-label-primary:#252a3c;--dsw-alias-label-secondary:#565b68;--dsw-alias-bg-layer-1:#f5f3ef;--dsw-alias-bg-layer-2:#fff;--dsw-alias-border-l2:#d1d3d8}
body[data-ds-dark-theme]{color-scheme:dark;--dsw-alias-label-primary:#f0efed;--dsw-alias-label-secondary:#c0bfbc;--dsw-alias-bg-layer-1:#1b1c20;--dsw-alias-bg-layer-2:#28292e;--dsw-alias-border-l2:#515259}
</style></head><body data-ds-dark-theme><div id="root"></div><script>${outputFiles[0].text}</script><script>
let plugin, Panel, dictionaries;
window.__ModuleLoader__={load({factory}){plugin=factory(id=>{if(id!=='react')throw Error(id);return React})}};
${client}
const t=key=>dictionaries?.en?.[key]||key;
const selectionA={provider:'fixture',model:'model-a',reasoningEffort:'high'};
const nativeList={phase:'ready',ids:['chat-a','chat-b'],byId:{
  'chat-a':{id:'chat-a',displayTitle:'Test chat A',projectionValues:{modelSelection:{next:selectionA,lastUsed:selectionA}}},
  'chat-b':{id:'chat-b',displayTitle:'Test chat B',projectionValues:{modelSelection:{next:selectionA,lastUsed:selectionA}}}
}};
window.modelCalls=[]; window.promptCalls=[]; window.createCalls=[];
const logs=new Map(), wakes=new Set();
const emit=(id,type,data)=>{const rows=logs.get(id)||[];rows.push({type:'event',event:{seq:rows.length,time:Date.now(),type,data}});logs.set(id,rows);for(const wake of wakes)wake();wakes.clear()};
const nativeSession={
  async modelCatalog(){return {ok:true,value:{default:selectionA,failures:[],groups:[{id:'fixture',name:'Test provider',models:[{id:'model-a',name:'Fixture Model A'},{id:'model-b',name:'Fixture Model B'}]}]}}},
  async selectModel(args){modelCalls.push(args);return {ok:true,value:{selected:args}}},
  async create(args){createCalls.push(args);return {ok:true,value:{sessionId:args.sessionId}}},
  async prompt(args){promptCalls.push(args);emit(args.sessionId,'turn/start',{turn:promptCalls.length});emit(args.sessionId,'user/message',{content:args.content,source:{rpcId:args.requestId}});
    if(window.holdPrompt)await new Promise(resolve=>window.resumePrompt=resolve);
    const result=await (await fetch('/tool',{method:'POST',body:JSON.stringify({target:wb.$board.get().id,spec:{title:'Launch plan',layout:'columns',sections:[{title:'Next',notes:[{text:'Write the launch brief'}]},{title:'Later',notes:[{text:'Launch it'}]}]}})})).json();if(!result.ok)throw Error(result.error);
    emit(args.sessionId,'assistant/message',{turn:promptCalls.length,message:{content:[{type:'text',text:'Created the launch plan.'}]}});emit(args.sessionId,'turn/end',{turn:promptCalls.length,reason:{kind:'completed'}});return {ok:true,value:{accepted:true}}},
  async *follow(args,signal){const id=args.address.sessionId;let offset=(logs.get(id)||[]).length;yield {type:'snapshot',records:[...(logs.get(id)||[])],cursor:offset-1,hasMore:false,projections:{values:{}}};while(!signal.aborted){const rows=logs.get(id)||[];while(offset<rows.length)yield rows[offset++];if(signal.aborted)break;await new Promise(resolve=>{wakes.add(resolve);signal.addEventListener('abort',resolve,{once:true})})}},
  async page(){return {ok:true,value:{records:[],hasMore:false}}}
};
plugin.apply({
  workspaces:{list:{getSnapshot:()=>({items:[{workspaceId:'product',title:'Product',sessionIds:[]}],state:'ready'}),subscribe:()=>()=>{}}},
  uiWorkspace:{openSession(){}},
  sessions:{list:{getSnapshot:()=>nativeList,subscribe:()=>()=>{}},async refreshProjections(){}},
  remote:{session:nativeSession},
  connection:{rpc:{call:async(_channel,method,payload)=>{
    if(window.failRpc)throw Error('Test connection interrupted');
    return (await (await fetch('/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method,payload})})).json()).result;
  }}},
  locale:{register(_ns,value){dictionaries=value},bind(){return t}},
  slots:{inject(_name,fn){fn()},register(options,component){if(options.name==='main')Panel=component}},effect(){},
});
window.wb=plugin.test;
createRoot(document.getElementById('root')).render(React.createElement(Panel,{t}));
</script></body></html>`;
const server = createServer(async (request, response) => {
  if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
  if (!['/rpc','/tool'].includes(request.url)) { response.writeHead(404).end(); return; }
  let body = '';
  for await (const chunk of request) body += chunk;
  if(request.url==='/tool'){response.setHeader('Content-Type','application/json');response.end(JSON.stringify(await tools.get('whiteboard_apply').execute(JSON.parse(body))));return;}
  const { method, payload } = JSON.parse(body);
  const result = await routes.get('/api/' + method)({ json: async () => ({ type: 'client-request', rpcId: 'ui', method, payload }) });
  response.setHeader('Content-Type', 'application/json'); response.end(await result.text());
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, ...(process.env.WHITEBOARD_CHROMIUM ? { executablePath: process.env.WHITEBOARD_CHROMIUM } : {}) });
const page = await browser.newPage({ viewport: { width: 1000, height: 760 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const prompt = page.getByRole('textbox', { name: 'Whiteboard prompt' });
  await page.getByRole('button', {name:'Plan a product launch in six weeks',exact:true}).click();
  assert.equal(await prompt.inputValue(),'Plan a product launch in six weeks');
  await page.waitForFunction(()=>document.activeElement===document.querySelector('[aria-label="Whiteboard prompt"]'));
  assert.equal(await page.evaluate(()=>promptCalls.length),0);
  assert.equal(await page.locator('.wb-compose .wb-starters').count(),0);
  await page.getByRole('button', {name:'Retro for our last sprint',exact:true}).click();
  assert.equal(await prompt.inputValue(),'Retro for our last sprint');
  assert.equal(await page.locator('.wb-layouts .wb-on').textContent(),'Columns');
  await page.getByRole('button', {name:'Ideas for a team offsite',exact:true}).click();
  assert.equal(await prompt.inputValue(),'Ideas for a team offsite');
  await prompt.fill('');
  const model=page.getByRole('combobox',{name:'Whiteboard model',exact:true});
  await page.waitForFunction(()=>document.querySelector('[aria-label="Whiteboard model"]').value.includes('model-a'));
  assert.equal(await model.isDisabled(),false);
  await page.evaluate(()=>wb.moveBoardToWorkspace('product'));
  await model.selectOption(JSON.stringify(['fixture','model-b']));
  assert.equal(await page.evaluate(()=>modelCalls.length),0);
  assert.equal(await model.inputValue(),JSON.stringify(['fixture','model-b']));
  assert.equal(await model.evaluate(node=>getComputedStyle(node).borderWidth),'0px');
  assert.equal(await model.evaluate(node=>node.parentElement.classList.contains('wb-layouts')),true);
  assert.equal(await page.getByRole('combobox',{name:'Whiteboard destination chat'}).count(),0);
  console.log('PASS: starters outside composer, borderless model on layouts row, workspace selection');
  await prompt.click();
  assert.equal(await prompt.evaluate(node => node === document.activeElement), true);
  await prompt.pressSequentially('Plan a launch, not a note');
  assert.equal(await page.evaluate(() => wb.$board.get().items.length), 0, 'typing N/P/E must not trigger board shortcuts');
  await prompt.press('Shift+Enter');
  await prompt.pressSequentially('Second line');
  const draft = await prompt.inputValue();
  assert.ok(draft.includes('\n'));
  await prompt.press('Enter');
  await page.getByRole('alert').first().waitFor();
  assert.equal(await prompt.inputValue(), draft, 'sharing-off failure preserves draft');
  await page.reload();
  assert.equal(await prompt.inputValue(), draft, 'draft survives reload');

  await page.evaluate(async () => { wb.setChatSharing(true); await wb.shareAll(); });
  await page.evaluate(()=>window.holdPrompt=true);
  await prompt.press('Enter');
  await page.locator('.wb-cursor svg').waitFor();
  await page.emulateMedia({reducedMotion:'no-preference'});
  assert.match(await page.locator('.wb-cursor').evaluate(node=>getComputedStyle(node).transitionDuration),/0.55s/);
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const width of [1000,420]){
    await page.setViewportSize({width,height:760});
    assert.equal(await page.locator('.wb-cursor').evaluate(node=>getComputedStyle(node).transitionDuration),'0s');
    await page.screenshot({path:path.join(output,`agent-working-${width}.png`)});
  }
  await page.setViewportSize({width:1000,height:760});
  await page.evaluate(()=>{window.holdPrompt=false;window.resumePrompt()});
  await page.waitForFunction(() => wb.$board.get().requests[0]?.status==='completed' && wb.$board.get().requests[0]?.changes?.length);
  await page.waitForFunction(()=>!document.querySelector('.wb-cursor'));
  assert.equal(await prompt.inputValue(), '', 'direct submission clears only the sent draft');
  assert.equal((await page.evaluate(()=>createCalls[0])).workspaceId,'product');
  assert.equal((await page.evaluate(()=>modelCalls[0])).model,'model-b');
  assert.equal((await page.evaluate(()=>promptCalls[0])).mode,'queue');
  await page.getByRole('region',{name:'History & changes',exact:true}).waitFor();
  await page.getByRole('button',{name:'Session log',exact:true}).click();
  await page.getByText('Created the launch plan.',{exact:true}).waitFor();
  await page.screenshot({path:path.join(output,'history-1000.png')});
  await page.getByRole('button',{name:'Close history',exact:true}).click();
  await prompt.fill('Keep this on a network error');
  await page.evaluate(() => { window.failRpc = true; });
  await prompt.press('Enter');
  await page.getByRole('alert').first().waitFor();
  assert.equal(await prompt.inputValue(), 'Keep this on a network error');
  await page.evaluate(() => { window.failRpc = false; });
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  console.log('PASS: direct native submission, real Host canvas update, durable history, draft recovery');

  await page.getByRole('button', { name: 'Suggestions', exact: true }).click();
  await page.getByRole('region', { name: 'Suggestions', exact: true }).waitFor();
  assert.equal(await page.getByText('Hermes suggests', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  assert.ok((await page.getByRole('button', { name: 'Settings', exact: true }).locator('path').getAttribute('d')).length > 20);

  // Sparse points expose a missed-crossing bug that endpoint-only erasers have.
  await page.evaluate(() => {
    wb.setBoard({ ...wb.$board.get(), view: { x: 0, y: 0, zoom: 1 }, items: [
      { id: 'ink-test', kind: 'ink', x: 220, y: 180, w: 400, h: 8, points: [[0,0],[400,0]], tone: 'ink', rev: 'r1' },
      { id: 'note-test', kind: 'note', x: 400, y: 120, w: 196, h: 112, text: 'Keep this note', tone: 'butter', rev: 'r2' },
    ], links: [] });
  });
  const canvas = await page.locator('.wb-canvas').boundingBox();
  await page.getByRole('button', { name: /Erase pen strokes/ }).click();
  await page.mouse.move(canvas.x + 350, canvas.y + 145);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 350, canvas.y + 220, { steps: 5 });
  await page.mouse.up();
  await page.waitForFunction(() => !wb.$board.get().items.some(item => item.id === 'ink-test'));
  assert.equal(await page.evaluate(() => wb.$board.get().items.some(item => item.id === 'note-test')), true);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.waitForFunction(() => wb.$board.get().items.some(item => item.id === 'ink-test'));
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.waitForFunction(() => !wb.$board.get().items.some(item => item.id === 'ink-test'));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  console.log('PASS: eraser drag removes strokes, preserves notes, and supports Undo/Redo');

  // Stress both action count and title width before the batched visual check.
  await page.evaluate(() => wb.setBoard({ ...wb.$board.get(), name: 'A very long whiteboard name — خطة إطلاق المنتج '.repeat(4), items: wb.$board.get().items.map(item => item.kind === 'note' ? { ...item, action: true } : item) }));
  for (const width of [1000, 420]) {
    await page.setViewportSize({ width, height: 760 });
    const row=await page.locator('.wb-layouts').evaluate(node=>[...node.children].map(child=>child.getBoundingClientRect().top));
    assert.ok(Math.max(...row)-Math.min(...row)<4,'model must share the shape-button row');
    const bounds = await page.locator('.wb-top button').evaluateAll(nodes => nodes.map(node => {
      const r = node.getBoundingClientRect(); return { title: node.title || node.textContent, x: r.x, right: r.right, w: r.width, h: r.height };
    }));
    assert.ok(bounds.every(r => r.x >= 0 && r.right <= width + 1 && r.w >= 28 && r.h >= 28), JSON.stringify(bounds));
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const menu = await page.locator('.wb-top .wb-menu').boundingBox();
    assert.ok(menu.x >= 0 && menu.x + menu.width <= width + 1);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Suggestions', exact: true }).click();
    const inputRect = await prompt.boundingBox();
    assert.ok(inputRect.width >= 150 && inputRect.x >= 0 && inputRect.x + inputRect.width < width);
    assert.equal(await prompt.evaluate(node => {
      const r = node.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width/2, r.y + r.height/2) === node;
    }), true, 'suggestions must not cover the prompt');
    await page.screenshot({ path: path.join(output, `dark-${width}.png`) });
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
    await page.screenshot({ path: path.join(output, `light-${width}.png`) });
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme',''));
    await page.getByRole('button', { name: 'Close', exact: true }).click();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: 1000px/420px toolbars, real Settings icon, menus, Suggestions, and accessible composer');
  console.log('Screenshots:', output);
} catch(error) { console.error('Fixture state:',await page.evaluate(()=>({board:wb.$board.get(),calls:promptCalls,creates:createCalls,alerts:[...document.querySelectorAll('[role="alert"]')].map(n=>n.textContent)})));console.error('Page errors:',errors);throw error;
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
