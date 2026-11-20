// Verify the session-delete client bundle: registrations, menu resolution,
// dialog render, and the RPC payload it sends.
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const require = createRequire(import.meta.url);
const React = require('react');
const ReactDOMServer = require('react-dom/server');

const clientPath = new URL('../client.js', import.meta.url);
const captured = {};
const documentMock = {
  getElementById: () => null,
  createElement: () => ({id: '', textContent: '', remove() {}}),
  head: {appendChild() {}},
};
globalThis.window = {__ModuleLoader__: {load(def) { captured.id = def.id; captured.factory = def.factory; }}};
globalThis.document = documentMock;
vm.runInThisContext(fs.readFileSync(clientPath, 'utf8'), {filename: 'client.js'});

if (captured.id !== '@local/session-delete') throw new Error(`unexpected module id ${captured.id}`);
const plugin = captured.factory((id) => {
  if (id === 'react') return React;
  throw new Error(`unexpected require: ${id}`);
});

const registrations = {locale: null, overlay: [], menu: null, rpc: null, refreshed: 0};
const ctx = {
  effect(fn) { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {}; },
  locale: {
    register(ns, dicts) { registrations.locale = {ns, dicts}; return () => {}; },
    bind(ns) { return (key) => `${ns}:${key}`; },
  },
  slots: {
    inject(key, fn) { return fn(); },
    register(spec, component) { registrations.overlay.push({spec, component}); return () => {}; },
  },
  contextMenus: {
    register(spec) { registrations.menu = spec; return () => {}; },
  },
  remoteAccess: {
    source: () => ({getSnapshot: () => true}),
  },
  connection: {
    rpc: {
      call(path, method, payload) {
        registrations.rpc = {path, method, payload};
        return Promise.resolve({ok: true, value: {sessionId: payload.sessionId}});
      },
    },
  },
  sessions: {
    refresh() { registrations.refreshed += 1; },
  },
};
plugin.apply(ctx);

let failures = 0;
async function check(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.log(`FAIL ${name}: ${error.message}`); }
}
const assert = (await import('node:assert/strict')).default;

await check('registers the locale with both baseline dictionaries', () => {
  assert.equal(registrations.locale.ns, 'session-delete');
  assert.ok(registrations.locale.dicts.en);
  assert.ok(registrations.locale.dicts.zh);
  assert.deepEqual(Object.keys(registrations.locale.dicts.en).sort(), Object.keys(registrations.locale.dicts.zh).sort());
});

await check('registers the confirmation dialog on shell.overlay', () => {
  assert.equal(registrations.overlay.length, 1);
  const {spec, component} = registrations.overlay[0];
  assert.equal(spec.name, 'shell.overlay');
  assert.equal(spec.id, 'session-delete.confirm');
  assert.equal(typeof component, 'function');
  const injected = spec.inject();
  assert.equal(typeof injected.useDeleteRequest, 'function');
  assert.equal(typeof injected.settleDelete, 'function');
  assert.equal(typeof injected.deleteSession, 'function');
});

await check('registers the session row menu item after archive', () => {
  assert.ok(registrations.menu);
  assert.equal(registrations.menu.id, 'session.delete');
  assert.equal(registrations.menu.target, 'session');
  assert.equal(registrations.menu.order, 700);
});

await check('menu item resolves with a label and a run handler', () => {
  const items = registrations.menu.resolve({sessionId: 'session-1', displayTitle: 'My session'});
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'delete');
  assert.equal(items[0].label, 'session-delete:menu.deleteSession');
  assert.deepEqual(items[0].icon, {key: 'workspace.delete'});
  assert.equal(typeof items[0].run, 'function');
});

await check('run opens the confirmation dialog', () => {
  const items = registrations.menu.resolve({sessionId: 'session-1', displayTitle: 'My session'});
  items[0].run();
  const {component} = registrations.overlay[0];
  const injected = registrations.overlay[0].spec.inject();
  const html = ReactDOMServer.renderToString(React.createElement(component, {...injected, t: (key) => `session-delete:${key}`}));
  assert.ok(html.includes('session-delete:dialog.title'));
  assert.ok(html.includes('session-delete:dialog.message'));
  assert.ok(html.includes('session-delete:dialog.confirm'));
  assert.ok(html.includes('session-delete:dialog.cancel'));
  assert.ok(html.includes('My session'));
});

await check('confirming calls the delete route with the session id', async () => {
  const injected = registrations.overlay[0].spec.inject();
  await injected.deleteSession('session-1');
  assert.deepEqual(registrations.rpc, {path: '/api', method: 'sessionDelete', payload: {sessionId: 'session-1'}});
  assert.equal(registrations.refreshed, 1);
});

console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
