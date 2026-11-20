// Verify the session-delete host logic against a real temporary session tree.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const plugin = await import(new URL('../index.js', import.meta.url).href);
const {deleteSession} = plugin;

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'session-delete-test-'));
const projectKey = '--test-workspace--';

async function makeSession(id) {
  const dir = path.join(root, projectKey, id);
  await fs.mkdir(dir, {recursive: true});
  const logPath = path.join(dir, 'session.v4.jsonl.zstd');
  await fs.writeFile(logPath, 'fake log');
  return {id, dir, logPath};
}

const aaaa = await makeSession('session-aaaa');
const bbbb = await makeSession('session-bbbb');
await makeSession('session-child');

const calls = {detachedSessions: [], detachedAgents: [], unarchived: [], unpinned: []};
const live = new Map();
const running = new Map();

const ctx = {
  sessionPersistence: {
    list: async () => [
      {header: {id: 'session-aaaa'}, location: {kind: 'jsonl', path: aaaa.logPath}},
      {header: {id: 'session-child', parentSession: 'session-aaaa'}, location: {kind: 'jsonl', path: path.join(root, projectKey, 'session-child', 'session.v4.jsonl.zstd')}},
      {header: {id: 'session-bbbb'}, location: {kind: 'jsonl', path: bbbb.logPath}},
    ],
  },
  sessions: {
    store: live,
    get: (id) => (live.has(id) ? {id} : undefined),
    detachEntered: (entry) => { calls.detachedSessions.push(entry.id); live.delete(entry.id); },
  },
  agents: {
    store: running,
    get: (id) => (running.has(id) ? {status: 'running'} : undefined),
    detachEntered: (entry) => { calls.detachedAgents.push(entry.id); running.delete(entry.id); },
  },
  workspaceRegistry: {
    list: () => [{sessionIds: ['session-aaaa', 'session-bbbb'], detachSession: async (id) => { calls.detached.push(id); }}],
    unarchiveSession: async (id) => { calls.unarchived.push(id); },
    unpinSession: async (id) => { calls.unpinned.push(id); },
  },
};
calls.detached = [];

let failures = 0;
async function check(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.log(`FAIL ${name}: ${error.message}`); }
}

await check('refuses an unknown session', async () => {
  await assert.rejects(() => deleteSession(ctx, 'session-missing'), /not found/);
});

await check('refuses a running session', async () => {
  running.set('session-bbbb', {id: 'session-bbbb'});
  await assert.rejects(() => deleteSession(ctx, 'session-bbbb'), /running/);
  running.delete('session-bbbb');
});

await check('refuses a session with children', async () => {
  await assert.rejects(() => deleteSession(ctx, 'session-aaaa'), /child session/);
});

await check('preserves the log when live-session detach fails', async () => {
  live.set('session-bbbb', {id: 'session-bbbb'});
  const detach = ctx.sessions.detachEntered;
  ctx.sessions.detachEntered = () => { throw new Error('busy writer'); };
  await assert.rejects(() => deleteSession(ctx, 'session-bbbb'), /preserved/);
  await fs.stat(bbbb.logPath);
  ctx.sessions.detachEntered = detach;
  live.delete('session-bbbb');
});

await check('detaches and deletes a live idle session', async () => {
  live.set('session-bbbb', {id: 'session-bbbb'});
  const result = await deleteSession(ctx, 'session-bbbb');
  assert.deepEqual(result, {sessionId: 'session-bbbb'});
  await assert.rejects(() => fs.stat(bbbb.dir), /ENOENT/);
  assert.deepEqual(calls.detachedSessions, ['session-bbbb']);
  assert.deepEqual(calls.detached, ['session-bbbb']);
  assert.deepEqual(calls.unarchived, ['session-bbbb']);
  assert.deepEqual(calls.unpinned, ['session-bbbb']);
  live.delete('session-bbbb');
});

await check('deletes a cold stored session', async () => {
  ctx.sessionPersistence.list = async () => [
    {header: {id: 'session-aaaa'}, location: {kind: 'jsonl', path: aaaa.logPath}},
  ];
  const result = await deleteSession(ctx, 'session-aaaa');
  assert.deepEqual(result, {sessionId: 'session-aaaa'});
  await assert.rejects(() => fs.stat(aaaa.dir), /ENOENT/);
});

await fs.rm(root, {recursive: true, force: true});
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
