import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import { readFile, mkdtemp, mkdir, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { apply, inject } from '../index.js';
import { mergeBoard, sameValue } from '../lib/sync.js';

const SPEC = { title: 'Chat plan', layout: 'columns', sections: [
  { title: 'Before', notes: [{ text: 'Write the brief', action: true }] },
  { title: 'After', notes: [{ text: 'Ship it' }] },
] };

// Execute the shipped browser factory, exposing internals only in this VM.
// This tests the real bridge, persistence, review and board-selection code;
// React's DOM renderer and the Harness services remain separate live checks.
const original = await readFile(new URL('../client.js', import.meta.url), 'utf8');
const source = original.replace('    return module.exports;', `
    module.exports.test = { $board, $index, $sharing, $toast,
      bridgeTick, shareAll, setBoard, createBoard, switchBoard, removeBoard,
      decideProposal, setChatSharing, takeChatEntry, writeNow, sendToChat,
      handPrompt, SendButton, mergeBoard, sameValue, $models, $draft, fillStarter,
      $workspaces, $workspaceId, $historyLogs, $historyOpen, refreshChatModels,
      selectWhiteboardModel, switchWorkspace, moveBoardToWorkspace, newConversation,
      consumeSessionEvent, loadEarlierHistory, watchSession, retryRun, undo, redo, $cursors, clearAgentCursors, agentCursor, finishCursorTour };
    return module.exports;`);

async function host(persistent) {
  const tools = new Map(), routes = new Map(), effects = [];
  const ctx = {
    tools: { register(t) { tools.set(t.name, t); return () => {}; } },
    connection: { fetch: { register(r) { routes.set(r.path, r.fetch); return () => {}; } } },
    agents: {}, systemPrompt: { section() {} },
    effect(fn) { effects.push(fn()); },
  };
  if (persistent) ctx.storageDomain = {
    async open(spec) {
      assert.equal(spec.name, 'whiteboard');
      return {
        table(name) {
          assert.equal(name, 'values');
          return {
            get(key) { return structuredClone(persistent.get(key)); },
            async put(key, value) { persistent.set(key, structuredClone(spec.tables.values.valueSchema.parse(value))); },
            async delete(key) { return persistent.delete(key); },
          };
        },
        async close() {},
      };
    },
  };
  await apply(ctx);
  const rpc = async (_prefix, method, payload) => {
    const response = await routes.get('/api/' + method)({
      json: async () => ({ type: 'client-request', rpcId: 'bridge', method, payload: structuredClone(payload) }),
    });
    return (await response.json()).result;
  };
  return { tools, rpc, effects, call: async (method, args = {}) => (await rpc('/api', 'whiteboard/' + method, { args })).value };
}

function browser(server, storage = new Map(), native = {}) {
  const timers = new Map();
  let nextTimer = 0, exports;
  const hooks = [];
  const react = {
    createElement: () => null,
    useSyncExternalStore: (_subscribe, get) => get(),
    useEffect: (fn) => hooks.push(fn()),
  };
  const context = vm.createContext({
    crypto: webcrypto, AbortController,
    window: { addEventListener() {}, removeEventListener() {}, __ModuleLoader__: { load({ factory }) { exports = factory((id) => {
      assert.equal(id, 'react'); return react;
    }); } } },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    setTimeout: (fn, ms) => { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => timers.delete(id),
    console,
  });
  vm.runInContext(source, context);
  exports.apply({
    ...native,
    connection: { rpc: { call: (...args) => server.rpc(...args) } },
    locale: { register() {}, bind: () => (key) => key },
    slots: { inject(_name, fn) { fn(); }, register() {} },
    effect() {},
  });
  const api = exports.test;
  return { ...api, storage, timers, async enable() {
    api.$sharing.set(true);
    storage.set('dsh-whiteboard:sharing', 'true');
    await server.call('sharing', { on: true });
    await api.shareAll();
  } };
}

test('actual client receives laid-out boards and delivered cards, including after reload', async () => {
  const server = await host();
  const b = browser(server);
  await b.enable();
  const id = b.$board.get().id;
  assert.equal((await server.tools.get('whiteboard_apply').execute({ target: id, spec: SPEC })).ok, true);
  await b.bridgeTick();
  assert.equal(b.$board.get().name, 'Chat plan');
  const note = b.$board.get().items.find((item) => item.kind === 'note');
  await server.tools.get('whiteboard_deliver').execute({ target: id, noteId: note.id, headline: 'Brief ready', text: 'The finished brief.' });
  await b.bridgeTick();
  assert.equal(b.$board.get().items.find((item) => item.kind === 'result').title, 'Brief ready');
  assert.equal(b.$board.get().items.find((item) => item.id === note.id).status, 'delivered');
  const reloaded = browser(server, b.storage);
  await reloaded.bridgeTick();
  assert.equal(reloaded.$board.get().items.find((item) => item.kind === 'result').text, 'The finished brief.');
});

test('active target follows board switches rather than last content update', async () => {
  const server = await host();
  const b = browser(server);
  await b.enable();
  const first = b.$board.get().id;
  const second = b.createBoard('Recently edited').id;
  await b.shareAll();
  b.switchBoard(first);
  await b.shareAll();
  const result = await server.tools.get('whiteboard_apply').execute({ spec: SPEC });
  assert.equal(result.board, first);
  await b.bridgeTick();
  assert.equal(b.$board.get().name, 'Chat plan');
  b.switchBoard(second);
  assert.equal(b.$board.get().name, 'Recently edited');
});

test('apply proposal stays pending until the actual browser review accepts it', async () => {
  const server = await host();
  const b = browser(server);
  await b.enable();
  const result = await server.tools.get('whiteboard_apply').execute({ proposal: { kind: 'note', text: 'Review me', reason: 'A missing step' } });
  assert.equal(result.ok, true);
  await b.bridgeTick();
  assert.equal(b.$board.get().items.length, 0);
  const proposal = b.$board.get().proposals[0];
  assert.equal(proposal.items[0].state, 'pending');
  b.decideProposal(proposal.id, proposal.items[0].id, true);
  await b.shareAll();
  assert.equal(b.$board.get().items[0].text, 'Review me');
  assert.equal((await server.call('load')).active.proposals[0].items[0].state, 'applied');
});

test('local note edits survive a simultaneous host delivery and stale upload', async () => {
  const server = await host();
  const b = browser(server);
  await b.enable();
  await server.tools.get('whiteboard_apply').execute({ spec: SPEC });
  await b.bridgeTick();
  const note = b.$board.get().items.find((item) => item.kind === 'note');
  b.setBoard({ ...b.$board.get(), items: b.$board.get().items.map((item) => item.id === note.id ? { ...item, text: 'My concurrent edit' } : item) });
  const originalRpc = server.rpc;
  let raced = false;
  server.rpc = async (...args) => {
    if (args[1] === 'whiteboard/sync' && !raced) {
      raced = true;
      await server.tools.get('whiteboard_deliver').execute({ noteId: note.id, headline: 'Done', text: 'Result during upload' });
    }
    return originalRpc(...args);
  };
  await b.shareAll();
  assert.equal(raced, true);
  const board = b.$board.get();
  assert.equal(board.items.find((item) => item.id === note.id).text, 'My concurrent edit');
  assert.equal(board.items.find((item) => item.id === note.id).status, 'delivered');
  assert.equal(board.items.find((item) => item.kind === 'result').text, 'Result during upload');
  assert.equal((await server.call('load')).active.items.find((item) => item.id === note.id).text, 'My concurrent edit');
});

test('inactive board updates persist without switching the visible board', async () => {
  const server = await host();
  const b = browser(server);
  await b.enable();
  const target = b.$board.get().id;
  const visible = b.createBoard('Keep viewing').id;
  await b.shareAll();
  await server.tools.get('whiteboard_apply').execute({ target, spec: SPEC });
  await b.bridgeTick();
  assert.equal(b.$board.get().id, visible);
  b.switchBoard(target);
  assert.equal(b.$board.get().name, 'Chat plan');
});

test('inbox retries are idempotent and created boards open and sync back', async () => {
  const server = await host();
  const b = browser(server);
  await b.enable();
  await server.tools.get('whiteboard_create').execute({ name: SPEC.title, layout: SPEC.layout, sections: SPEC.sections });
  const entry = (await server.call('inbox')).entries[0];
  assert.equal(b.takeChatEntry(entry), 'taken');
  const count = b.$index.get().boards.length;
  assert.equal(b.takeChatEntry(entry), 'taken');
  assert.equal(b.$index.get().boards.length, count);
  assert.equal(b.$board.get().name, SPEC.title);
  await b.bridgeTick();
  assert.equal((await server.call('load')).active.name, SPEC.title);
  assert.equal((await server.call('inbox')).entries.length, 0);
});

test('durable domain survives host replacement; browser reconnect republishes to an empty host', async () => {
  assert.ok(inject.includes('storageDomain'));
  const disk = new Map();
  const first = await host(disk);
  const b = browser(first);
  await b.enable();
  await first.tools.get('whiteboard_apply').execute({ spec: SPEC });
  const second = await host(disk);
  assert.equal((await second.call('load')).backend, 'storageDomain');
  assert.equal((await second.call('load')).active.name, SPEC.title);
  const reloaded = browser(second, b.storage);
  await reloaded.bridgeTick();
  assert.equal(reloaded.$board.get().name, SPEC.title);
  const emptyHost = await host();
  const reconnect = browser(emptyHost, b.storage);
  await reconnect.bridgeTick();
  assert.equal((await emptyHost.call('load')).active.name, SPEC.title);
});

test('deleted local boards are pruned and sharing off blocks all tools by default', async () => {
  const server = await host();
  assert.equal((await server.tools.get('whiteboard_create').execute({ name: SPEC.title, layout: SPEC.layout, sections: SPEC.sections })).ok, false);
  const b = browser(server);
  await b.enable();
  const removed = b.$board.get().id;
  b.createBoard('Survivor');
  await b.shareAll();
  b.removeBoard(removed);
  await b.bridgeTick();
  assert.equal((await server.call('load')).snapshots.some((board) => board.id === removed), false);
  b.setChatSharing(false);
  await b.shareAll();
  assert.equal((await server.call('load')).snapshots.length, 0);
  assert.equal((await server.tools.get('whiteboard_list').execute({})).ok, false);
});

test('an explicit sharing-off from another client is respected', async () => {
  const server = await host();
  const b = browser(server);
  await b.enable();
  await server.call('sharing', { on: false });
  await b.bridgeTick();
  assert.equal(b.$sharing.get(), false);
  assert.equal((await server.call('load')).sharing.on, false);
});

test('a local edit made while an upload awaits its reply remains unsent rather than being lost', async () => {
  const server = await host();
  const b = browser(server);
  await b.enable();
  b.setBoard({ ...b.$board.get(), name: 'First edit' });
  const rpc = server.rpc;
  let changed = false;
  server.rpc = async (...args) => {
    const reply = await rpc(...args);
    if (args[1] === 'whiteboard/sync' && !changed) {
      changed = true;
      b.setBoard({ ...b.$board.get(), name: 'Edit during upload' });
    }
    return reply;
  };
  await b.shareAll();
  assert.equal(b.$board.get().name, 'Edit during upload');
  await b.shareAll();
  assert.equal((await server.call('load')).active.name, 'Edit during upload');
});

test('storage failure is reported, and a failed inbox acknowledgement is safe to retry', async () => {
  const server = await host();
  const b = browser(server);
  await b.enable();
  await server.tools.get('whiteboard_create').execute({ name: SPEC.title, layout: SPEC.layout, sections: SPEC.sections });
  const rpc = server.rpc;
  let failed = false;
  server.rpc = async (...args) => {
    if (args[1] === 'whiteboard/ack' && !failed) { failed = true; throw new Error('Connection interrupted'); }
    return rpc(...args);
  };
  await assert.rejects(b.bridgeTick(), /Connection interrupted/);
  const count = b.$index.get().boards.length;
  await b.bridgeTick();
  assert.equal(b.$index.get().boards.length, count);
  assert.equal((await server.call('inbox')).entries.length, 0);

  await assert.rejects(apply({ storageDomain: { async open() { throw new Error('Disk unavailable'); } } }), /Disk unavailable/);
});

test('browser merge implementation matches its source module', () => {
  const inline = original.slice(original.indexOf('    function sameValue'), original.indexOf('    const baseKey'));
  const canonical = vm.runInNewContext(`(() => { ${inline}; return { mergeBoard, sameValue }; })()`);
  const base = { id: 'b', items: [{ id: 'n', text: 'old', x: 0 }], links: [] };
  const local = { ...base, items: [{ id: 'n', text: 'new', x: 0 }] };
  const remote = { ...base, items: [{ id: 'n', text: 'old', x: 5 }], syncRevision: 'r2' };
  assert.equal(JSON.stringify(canonical.mergeBoard(base, local, remote)), JSON.stringify(mergeBoard(base, local, remote)));
  assert.equal(sameValue(base, structuredClone(base)), true);
});

test('export rejects a junction into a protected home', async () => {
  const server = await host();
  const directory = await mkdtemp(path.join(os.tmpdir(), 'whiteboard-junction-'));
  const previousHome = process.env.DSH_HOME;
  try {
    const protectedHome = path.join(directory, 'protected');
    await mkdir(protectedHome);
    process.env.DSH_HOME = protectedHome;
    await symlink(protectedHome, path.join(directory, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
    const result = await server.rpc('/api', 'whiteboard/export', { args: { path: path.join(directory, 'alias', 'export.md'), text: 'blocked' } });
    assert.equal(result.ok, false);
    assert.match(result.error.message, /never writes files inside/);
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
    // Remove the junction itself before recursively cleaning the test root.
    await rm(path.join(directory, 'alias'), { force: true, recursive: true });
    await rm(directory, { recursive: true, force: true });
  }
});


test('starter prompts only fill the Whiteboard draft and retain the suggested layout', async () => {
  const server = await host();
  const b = browser(server);
  b.fillStarter('Retro for our last sprint');
  assert.equal(b.$draft.get().text, 'Retro for our last sprint');
  assert.equal(b.$draft.get().layout, 'columns');
  assert.equal((b.$board.get().requests || []).length, 0);
  assert.equal(b.$sharing.get(), false);
  assert.equal((await server.call('inbox')).entries.length, 0);
  const reloaded = browser(server, b.storage);
  assert.equal(reloaded.$draft.get().text, 'Retro for our last sprint');
});



function nativeRuntime() {
  const calls = [], logs = new Map(), waiting = new Set(), accepted = new Set();
  const selection = { provider: 'fixture', model: 'model-a' };
  const workspaces = { items: [
    { workspaceId: 'workspace-a', title: 'Product', sessionIds: [] },
    { workspaceId: 'workspace-b', title: 'Research', sessionIds: [] },
  ], state: 'ready' };
  const emit = (id, type, data) => {
    const records = logs.get(id) || [];
    records.push({ type: 'event', event: { seq: records.length, time: Date.now(), type, data } });
    logs.set(id, records); for (const wake of waiting) wake(); waiting.clear();
  };
  const runtime = { calls, workspaces, emit, executions: 0, loseAck: false, onPrompt: null, services: {
    workspaces: { list: { getSnapshot: () => workspaces, subscribe: () => () => {} } },
    uiWorkspace: { openSession(id) { calls.push(['open', id]); } },
    remote: { session: {
      async modelCatalog() { return { ok: true, value: { default: selection, groups: [{ id: 'fixture', name: 'Fixture', models: [{ id: 'model-a', name: 'Model A' }, { id: 'model-b', name: 'Model B' }] }], failures: [] } }; },
      async create(args) { calls.push(['create', args]); workspaces.items.find(item => item.workspaceId === args.workspaceId).sessionIds.push(args.sessionId); return { ok: true, value: { sessionId: args.sessionId } }; },
      async selectModel(args) { calls.push(['model', args]); return { ok: true, value: { selected: args } }; },
      async prompt(args) {
        calls.push(['prompt', args]);
        if (!accepted.has(args.requestId)) {
          accepted.add(args.requestId); runtime.executions += 1;
          if (runtime.onPrompt) await runtime.onPrompt(args);
        }
        if (runtime.loseAck) { runtime.loseAck = false; throw new Error('Transport lost after acceptance'); }
        return { ok: true, value: { accepted: true } };
      },
      async *follow(args, signal) {
        const id = args.address.sessionId;
        const records = logs.get(id) || [];
        let offset = records.length;
        yield { type: 'snapshot', records: [...records], cursor: offset - 1, hasMore: false, projections: { values: {} } };
        while (!signal.aborted) {
          const latest = logs.get(id) || [];
          while (offset < latest.length) yield latest[offset++];
          if (signal.aborted) break;
          await new Promise(resolve => { const wake = () => resolve(); waiting.add(wake); signal.addEventListener('abort', wake, { once: true }); });
        }
      },
      async page() { return { ok: true, value: { records: [], hasMore: false } }; },
    } },
  } };
  return runtime;
}

async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setImmediate(resolve)); }
  assert.fail('Expected state did not settle');
}

test('direct prompt creates a workspace session, selects the model, and submits without a chat handoff', async () => {
  const server = await host(); const native = nativeRuntime();
  const b = browser(server, new Map(), native.services);
  await b.refreshChatModels(); await b.enable();
  assert.equal(await b.sendToChat('A prompt without workspace'), false);
  b.moveBoardToWorkspace('workspace-a');
  b.selectWhiteboardModel(JSON.stringify(['fixture','model-b']));
  b.setBoard({ ...b.$board.get(), name: 'Launch Plan' });
  assert.equal(await b.sendToChat('List the notes in @Launch_Plan'), true);
  assert.deepEqual(native.calls.map(call => call[0]), ['create','model','prompt']);
  assert.equal(native.calls[0][1].workspaceId, 'workspace-a');
  assert.equal(native.calls[1][1].model, 'model-b');
  const submitted = native.calls[2][1];
  assert.equal(submitted.mode, 'queue');
  assert.match(submitted.content[0].text, /Workspace: workspace-a/);
  assert.match(submitted.content[0].text, /@Launch_Plan/);
  assert.equal(b.$board.get().requests[0].status, 'submitted');
  assert.equal(b.$historyOpen.get(), true);
  assert.doesNotMatch(b.$toast.get().text, /Open a chat/);
});

test('durable session events expose prompt/result history and record board changes', async () => {
  const server = await host(); const native = nativeRuntime();
  const b = browser(server, new Map(), native.services);
  await b.refreshChatModels(); await b.enable(); b.moveBoardToWorkspace('workspace-a');
  native.onPrompt = async request => {
    native.emit(request.sessionId, 'turn/start', { turn: 1 });
    native.emit(request.sessionId, 'user/message', { content: request.content, source: { kind: 'user', rpcId: request.requestId } });
    native.emit(request.sessionId, 'request/header', { header: { config: { provider: 'fixture', model: 'model-a' } } });
    await server.tools.get('whiteboard_apply').execute({ target: b.$board.get().id, spec: SPEC });
    native.emit(request.sessionId, 'tool/result', { turn: 1, message: { content: [{ type: 'text', text: 'Whiteboard updated' }] } });
    native.emit(request.sessionId, 'assistant/message', { turn: 1, message: { content: [{ type: 'text', text: 'Plan ready' }] } });
    native.emit(request.sessionId, 'turn/end', { turn: 1, reason: { kind: 'completed' } });
  };
  assert.equal(await b.sendToChat('Build a plan'), true);
  await until(() => b.$board.get().requests[0].status === 'completed' && b.$board.get().requests[0].changes?.length > 0);
  const run = b.$board.get().requests[0];
  assert.ok(run.changes.some(change => change.change === 'added'));
  assert.ok(b.$historyLogs.get()[run.sessionId].records.some(record => record.event.type === 'assistant/message'));
  b.writeNow();
  const reload = browser(server, b.storage, native.services);
  assert.equal(reload.$board.get().requests[0].prompt, 'Build a plan');
  assert.equal(reload.$board.get().requests[0].status, 'completed');
});

test('retry after a lost prompt acknowledgement keeps its request id and executes once', async () => {
  const server = await host(); const native = nativeRuntime();
  const b = browser(server, new Map(), native.services);
  await b.refreshChatModels(); await b.enable(); b.moveBoardToWorkspace('workspace-a');
  native.loseAck = true;
  assert.equal(await b.sendToChat('Only once'), false);
  const run = b.$board.get().requests[0];
  assert.equal(run.status, 'uncertain');
  assert.equal(await b.retryRun(run), true);
  assert.equal(native.executions, 1);
  const prompts = native.calls.filter(call => call[0] === 'prompt');
  assert.equal(prompts[0][1].requestId, prompts[1][1].requestId);
  assert.equal(b.$board.get().requests.length, 1);
});

test('handed notes use short quotes and exact references without embedding the board', async () => {
  const server = await host(); const native = nativeRuntime();
  const b = browser(server, new Map(), native.services);
  await b.refreshChatModels(); await b.enable(); b.moveBoardToWorkspace('workspace-a');
  b.setBoard({ ...b.$board.get(), name: 'Launch', items: [
    { id:'note-one', kind:'note', text:'Write a launch brief '.repeat(60), x:20,y:30,w:196,h:112 },
    { id:'note-two', kind:'note', text:'UNRELATED PRIVATE TEXT', x:400,y:30,w:196,h:112 },
  ] });
  const short = b.handPrompt(b.$board.get().items[0]);
  assert.ok(short.length < 180); assert.match(short, /#note-one/);
  await b.sendToChat(short);
  const text = native.calls.find(call => call[0] === 'prompt')[1].content[0].text;
  assert.ok(text.length < 320); assert.doesNotMatch(text, /UNRELATED PRIVATE TEXT|Whiteboard context|dataPolicy/);
  assert.equal(b.$board.get().requests[0].noteIds[0], 'note-one');
});

test('live activity moves one cursor to exact notes, historical events do not replay animation', async () => {
  const server = await host(); const native = nativeRuntime();
  const b = browser(server, new Map(), native.services);
  await b.refreshChatModels(); await b.enable(); b.moveBoardToWorkspace('workspace-a');
  b.setBoard({ ...b.$board.get(), items:[{id:'n1',kind:'note',text:'One',x:20,y:40,w:196,h:112},{id:'n2',kind:'note',text:'Two',x:500,y:40,w:196,h:112}] });
  await b.sendToChat('Discuss my notes');
  const run = b.$board.get().requests[0];
  b.consumeSessionEvent(run.sessionId,{seq:0,type:'turn/start',data:{turn:1}});
  b.consumeSessionEvent(run.sessionId,{seq:1,type:'user/message',data:{content:[],source:{rpcId:run.id}}});
  b.consumeSessionEvent(run.sessionId,{seq:2,type:'tool/call',data:{turn:1,name:'whiteboard_deliver',arguments:JSON.stringify({noteId:'n2'})}});
  assert.equal(b.$cursors.get().length,1);
  assert.equal(b.$cursors.get()[0].x,647);
  assert.match(b.$cursors.get()[0].label,/deliver/);
  b.clearAgentCursors();
  b.consumeSessionEvent(run.sessionId,{seq:3,type:'tool/call',data:{turn:1,name:'whiteboard_read',arguments:'{}'}},false);
  assert.equal(b.$cursors.get().length,0);
  b.finishCursorTour(run.sessionId,b.$board.get().id,[{id:'n1',after:{kind:'note'}},{id:'n2',after:{kind:'note'}}]);
  assert.match(b.$cursors.get()[0].label,/1 of 2/);
  b.clearAgentCursors(); assert.equal(b.$cursors.get().length,0);
});

test('workspace navigation preserves boards; moving a board starts fresh session continuity', async () => {
  const server = await host(); const native = nativeRuntime();
  const b = browser(server, new Map(), native.services);
  await b.refreshChatModels(); await b.enable();
  b.moveBoardToWorkspace('workspace-a'); const first = b.$board.get().id;
  await b.sendToChat('First request'); const session = b.$board.get().activeSessionId;
  b.switchWorkspace('workspace-b'); const second = b.$board.get().id;
  assert.notEqual(first, second);
  assert.equal(b.$board.get().workspaceId, 'workspace-b');
  b.switchWorkspace('workspace-a'); assert.equal(b.$board.get().id, first);
  b.moveBoardToWorkspace('workspace-b');
  assert.equal(b.$board.get().activeSessionId, null);
  assert.ok(b.$board.get().sessionIds.includes(session));
  assert.equal(b.$board.get().requests[0].workspaceId, 'workspace-a');
});

test('canvas undo and redo preserve workspace ownership and request history', async () => {
  const server = await host(); const native = nativeRuntime();
  const b = browser(server, new Map(), native.services);
  await b.refreshChatModels(); await b.enable(); b.moveBoardToWorkspace('workspace-a');
  b.setBoard({ ...b.$board.get(), name: 'Changed title' });
  await b.sendToChat('List my notes');
  const session = b.$board.get().activeSessionId;
  b.undo();
  assert.equal(b.$board.get().name, 'Untitled board');
  assert.equal(b.$board.get().workspaceId, 'workspace-a');
  assert.equal(b.$board.get().activeSessionId, session);
  assert.equal(b.$board.get().requests.length, 1);
  b.redo();
  assert.equal(b.$board.get().name, 'Changed title');
  assert.equal(b.$board.get().requests.length, 1);
});

test('workspace-scoped @board references reject ambiguous names and return exact note ids', async () => {
  const server = await host(); const b = browser(server);
  await b.enable();
  b.setBoard({ ...b.$board.get(), name: 'Launch Plan', workspaceId: 'workspace-a', workspaceTitle: 'Product' });
  const first = b.$board.get().id; await b.shareAll();
  await server.tools.get('whiteboard_apply').execute({ target: first, spec: { ...SPEC, title: 'Launch Plan' } });
  await b.bridgeTick();
  b.createBoard('Launch Plan', 'workspace-b'); await b.shareAll();
  const ambiguous = await server.tools.get('whiteboard_read').execute({ board: '@Launch_Plan' });
  assert.equal(ambiguous.ok, false);
  const scoped = await server.tools.get('whiteboard_read').execute({ board: '@Launch_Plan', workspaceId: 'workspace-a' });
  assert.equal(scoped.board, first); assert.ok(scoped.notes[0].id);
  const listed = await server.tools.get('whiteboard_list').execute({ workspaceId: 'workspace-a' });
  assert.equal(listed.boards.length, 1); assert.equal(listed.boards[0].reference, '@Launch_Plan');
});

test('sync imports other-workspace boards without deleting them, and only explicit deletions prune', async () => {
  const server = await host(); const a = browser(server); await a.enable();
  a.setBoard({ ...a.$board.get(), workspaceId: 'workspace-a', name: 'Keep across browsers' }); await a.shareAll();
  const id = a.$board.get().id;
  const b = browser(server); await b.enable();
  assert.ok(b.$index.get().boards.some(meta => meta.id === id));
  await server.call('prune', { keep: [] });
  assert.ok((await server.call('load')).snapshots.some(board => board.id === id));
  b.removeBoard(id); await b.shareAll();
  assert.equal((await server.call('load')).snapshots.some(board => board.id === id), false);
});
