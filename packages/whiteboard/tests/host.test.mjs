/**
 * Host integration tests for the DeepSeek Harness Whiteboard port.
 *
 * Runs the real `apply(ctx)` against a mocked Cordis context: tools are
 * captured by name, `/api/whiteboard/*` routes are captured by path, and the
 * storage seat is absent so the store uses its process-local Map backend.
 * No DeepSeek Harness process is required.
 *
 *   node tests/host.test.mjs
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { apply } from '../index.js';

function mockCtx() {
  const tools = new Map();
  const routes = new Map();
  const effects = [];
  const ctx = {
    tools: {
      register(definition) {
        tools.set(definition.name, definition);
        return () => tools.delete(definition.name);
      },
    },
    connection: {
      fetch: {
        register({ path: routePath, fetch }) {
          routes.set(routePath, fetch);
          return () => routes.delete(routePath);
        },
      },
    },
    agents: { get() { return undefined; } },
    systemPrompt: { section() {} },
    effect(disposer) {
      effects.push(disposer);
      return disposer;
    },
  };
  return { ctx, tools, routes, effects };
}

async function callRoute(routes, routePath, args) {
  const handler = routes.get(routePath);
  assert.ok(handler, `route ${routePath} is registered`);
  const response = await handler({
    json: async () => ({ type: 'client-request', rpcId: 'test', method: routePath.replace('/api/', ''), payload: { args: routePath.endsWith('/sync') ? { ...args, index: args.index || { activeId: args.board?.id } } : args } }),
  });
  return response.json();
}

const SPEC = {
  title: 'Launch plan',
  layout: 'route',
  sections: [
    { title: 'Kickoff', label: 'Week 1', notes: [{ text: 'Lock the message', action: true }, { text: 'Book the venue' }] },
    { title: 'Launch', label: 'Week 4', notes: [{ text: 'Send the announcement', action: true }] },
  ],
};

test('the host registers its tools and routes', async () => {
  const { ctx, tools, routes } = mockCtx();
  await apply(ctx);
  for (const name of ['whiteboard_list', 'whiteboard_read', 'whiteboard_propose', 'whiteboard_create', 'whiteboard_apply', 'whiteboard_deliver']) {
    assert.ok(tools.has(name), `${name} is registered`);
  }
  for (const route of ['/api/whiteboard/load', '/api/whiteboard/sync', '/api/whiteboard/inbox', '/api/whiteboard/ack', '/api/whiteboard/sharing', '/api/whiteboard/export', '/api/whiteboard/agent']) {
    assert.ok(routes.has(route), `${route} is registered`);
  }
});

test('sharing off blocks the tools and turning it on shares the board', async () => {
  const { ctx, tools, routes } = mockCtx();
  await apply(ctx);

  const off = await callRoute(routes, '/api/whiteboard/sharing', { on: false });
  assert.equal(off.result.ok, true);
  const blocked = await tools.get('whiteboard_list').execute({}, {});
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /Chat access is off/);

  const on = await callRoute(routes, '/api/whiteboard/sharing', { on: true });
  assert.equal(on.result.value.sharing.on, true);
  const listed = await tools.get('whiteboard_list').execute({}, {});
  assert.equal(listed.ok, false);
  assert.match(listed.error, /No boards are visible yet/);
});

test('a chat-created board waits in the inbox and is acknowledged', async () => {
  const { ctx, tools, routes } = mockCtx();
  await apply(ctx);
  await callRoute(routes, '/api/whiteboard/sharing', { on: true });

  const created = await tools.get('whiteboard_create').execute({
    name: 'Lisbon trip',
    layout: 'route',
    sections: [
      { title: 'Fly in', label: 'Day 1', sticker: 'rocket', notes: [{ text: 'Book the flight', action: true }, 'Pack light'] },
      { title: 'Old town', sticker: 'unknown', notes: [{ text: ' ' }] },
    ],
  }, {});
  assert.equal(created.ok, true);
  assert.equal(created.sections, 2);

  const inbox = await callRoute(routes, '/api/whiteboard/inbox', {});
  assert.equal(inbox.result.value.entries.length, 1);
  const [entry] = inbox.result.value.entries;
  assert.equal(entry.kind, 'board');
  assert.equal(entry.layout, 'route');
  assert.equal(entry.sections[0].notes[0].text, 'Book the flight');
  assert.equal(entry.sections[1].sticker, null);
  assert.equal(entry.sections[1].notes.length, 0);

  const acked = await callRoute(routes, '/api/whiteboard/ack', { id: entry.id });
  assert.equal(acked.result.value.removed, true);
  const after = await callRoute(routes, '/api/whiteboard/inbox', {});
  assert.equal(after.result.value.entries.length, 0);
});

test('a proposal validates everything and sends nothing on a problem', async () => {
  const { ctx, tools, routes } = mockCtx();
  await apply(ctx);
  await callRoute(routes, '/api/whiteboard/sharing', { on: true });
  await callRoute(routes, '/api/whiteboard/sync', { board: { id: 'b1', name: 'Launch plan', items: [], links: [], proposals: [], receipts: [], updatedAt: Date.now() } });
  await tools.get('whiteboard_apply').execute({ spec: SPEC }, {});

  const read = await tools.get('whiteboard_read').execute({ board: 'Launch plan' }, {});
  assert.equal(read.ok, true);
  const [firstNote, secondNote] = read.notes;

  const bad = await tools.get('whiteboard_propose').execute({
    board: 'Launch plan',
    summary: 'Tidy',
    groups: [{ title: 'Money', notes: [secondNote.id, 'n9'], reason: 'Same' }],
  }, {});
  assert.equal(bad.ok, false);
  assert.match(JSON.stringify(bad), /n9/);

  const ok = await tools.get('whiteboard_propose').execute({
    board: 'Launch plan',
    summary: 'Tidy up',
    notes: [{ text: 'Add a tip jar', section: 'launch', sticker: 'coins', reason: 'Missing' }],
    groups: [{ title: 'Highlights', notes: [firstNote.id, secondNote.id], reason: 'Both are numbers' }],
    actions: [{ text: 'Refund the double charge', owner: 'Maya', reason: 'Customer hurt' }],
  }, {});
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.sent, { notes: 1, groups: 1, actions: 1 });
  const inbox = await callRoute(routes, '/api/whiteboard/inbox', {});
  assert.equal(inbox.result.value.entries.length, 1);
});

test('a board is laid out, read back, and delivered against', async () => {
  const { ctx, tools, routes } = mockCtx();
  await apply(ctx);
  await callRoute(routes, '/api/whiteboard/sharing', { on: true });
  await callRoute(routes, '/api/whiteboard/sync', { board: { id: 'b1', name: 'Launch plan', items: [], links: [], proposals: [], receipts: [], updatedAt: Date.now() } });

  const applied = await tools.get('whiteboard_apply').execute({ spec: SPEC }, {});
  assert.equal(applied.ok, true);

  const listed = await tools.get('whiteboard_list').execute({}, {});
  assert.equal(listed.boards.length, 1);
  assert.equal(listed.boards[0].name, 'Launch plan');
  assert.deepEqual(listed.boards[0].sections, ['Kickoff', 'Launch']);

  const read = await tools.get('whiteboard_read').execute({ board: 'launch plan' }, {});
  assert.equal(read.ok, true);
  assert.equal(read.notes.length, 3);
  assert.match(read.note, /not instructions/);

  const action = read.notes.find((note) => note.action);
  const delivered = await tools.get('whiteboard_deliver').execute({
    noteId: action.id,
    headline: 'Message locked',
    text: 'The launch message is ready to send.',
    sources: ['https://example.com/brand'],
  }, {});
  assert.equal(delivered.ok, true);

  const after = await tools.get('whiteboard_read').execute({ board: 'Launch plan' }, {});
  const done = after.notes.find((note) => note.id === action.id);
  assert.match(done.result, /Message locked/);
});

test('the export writer refuses unsafe paths and writes only .md/.csv', async () => {
  const { ctx, routes } = mockCtx();
  await apply(ctx);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'whiteboard-export-'));
  try {
    const target = path.join(directory, 'plan.md');
    const written = await callRoute(routes, '/api/whiteboard/export', { path: target, text: '# Plan\n' });
    assert.equal(written.result.ok, true);
    assert.equal(await readFile(target, 'utf8'), '# Plan\n');

    const script = await callRoute(routes, '/api/whiteboard/export', { path: path.join(directory, 'run.sh'), text: 'x' });
    assert.equal(script.result.ok, false);
    assert.match(script.result.error.message, /\.md and \.csv/);

    const relative = await callRoute(routes, '/api/whiteboard/export', { path: 'plan.md', text: 'x' });
    assert.equal(relative.result.ok, false);

    const missing = await callRoute(routes, '/api/whiteboard/export', { path: path.join(directory, 'missing', 'a.md'), text: 'x' });
    assert.equal(missing.result.ok, false);
    assert.match(missing.result.error.message, /folder does not exist/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('the agent route requires a live session', async () => {
  const { ctx, routes } = mockCtx();
  await apply(ctx);
  const answer = await callRoute(routes, '/api/whiteboard/agent', { sessionId: 'missing', prompt: 'Lay it out' });
  assert.equal(answer.result.ok, false);
  assert.match(answer.result.error.message, /live DeepSeek Harness session/);
});
