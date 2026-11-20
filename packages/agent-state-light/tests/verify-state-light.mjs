// Verify the agent-state-light client module loads, registers, and renders
// each state with the real React 18 runtime from the Desktop profile.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const React = require('react');
const ReactDOMServer = require('react-dom/server');

const clientPath = new URL('../client.js', import.meta.url);
const code = fs.readFileSync(clientPath, 'utf8');

// --- mock browser environment -------------------------------------------------
const styleNodes = [];
const captured = {};
const windowMock = {
  __ModuleLoader__: {
    load(def) { captured.id = def.id; captured.factory = def.factory; },
  },
};
const documentMock = {
  getElementById: (id) => styleNodes.find((n) => n.id === id) ?? null,
  createElement: (tag) => ({ tag, id: '', textContent: '', remove() { const i = styleNodes.indexOf(this); if (i >= 0) styleNodes.splice(i, 1); } }),
  head: { appendChild(node) { styleNodes.push(node); } },
};
globalThis.window = windowMock;
globalThis.document = documentMock;

vm.runInThisContext(code, { filename: 'client.js' });

if (captured.id !== '@local/agent-state-light') throw new Error(`unexpected module id ${captured.id}`);
const plugin = captured.factory((id) => {
  if (id === 'react') return React;
  throw new Error(`unexpected require: ${id}`);
});

// --- mock client context ------------------------------------------------------
const registrations = [];
let localeRegistration = null;
const ctx = {
  effect(fn) { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {}; },
  locale: {
    register(ns, dicts) { localeRegistration = { ns, dicts }; return () => {}; },
  },
  slots: {
    inject(key, fn) { return fn(); },
    register(spec, component) { registrations.push({ spec, component }); return () => {}; },
  },
};
plugin.apply(ctx);

if (localeRegistration?.ns !== 'agent-state-light') throw new Error('locale namespace not registered');
if (!localeRegistration.dicts.en || !localeRegistration.dicts.zh) throw new Error('baseline dictionaries missing');
if (registrations.length !== 1) throw new Error(`expected 1 dock registration, got ${registrations.length}`);
const { spec, component } = registrations[0];
console.log('slot spec:', JSON.stringify(spec));
if (spec.name !== 'conversation.composer.dock') throw new Error('wrong slot name');
if (spec.id !== 'agent-state-light') throw new Error('wrong entry id');
if (spec.locale !== 'agent-state-light') throw new Error('wrong locale namespace');
if (styleNodes.length !== 1 || !styleNodes[0].textContent.includes('asl_root')) throw new Error('styles not injected');

// --- render each state --------------------------------------------------------
const t = (key) => key;
function render({ session, status, input }) {
  const props = {
    useSession: (selector) => selector(session),
    useSessionStatus: (selector) => selector(status),
    useInput: (selector) => selector(input),
    t,
    sessionId: 's1',
  };
  return ReactDOMServer.renderToString(React.createElement(component, props));
}

const cases = [
  ['working', { running: true, removed: false, openState: 'ready', openError: null, lastAgentError: null, promptError: null }, new Map([['s1', {}]]), { phase: 'plain' }, 'working'],
  ['waiting', { running: false, removed: false, openState: 'ready', openError: null, lastAgentError: null, promptError: null }, new Map([['s1', { pendingInteraction: { kind: 'approval' } }]]), { phase: 'plain' }, 'waiting'],
  ['ready', { running: false, removed: false, openState: 'ready', openError: null, lastAgentError: null, promptError: null }, new Map([['s1', {}]]), { phase: 'plain' }, 'ready'],
  ['error-lastAgentError', { running: false, removed: false, openState: 'ready', openError: null, lastAgentError: new Error('boom'), promptError: null }, new Map([['s1', {}]]), { phase: 'plain' }, 'error'],
  ['error-openState', { running: false, removed: false, openState: 'error', openError: new Error('boom'), lastAgentError: null, promptError: null }, new Map([['s1', {}]]), { phase: 'plain' }, 'error'],
  ['removed', { running: false, removed: true, openState: 'ready', openError: null, lastAgentError: null, promptError: null }, new Map([['s1', {}]]), { phase: 'plain' }, 'error'],
  ['sending-in-flight', { running: false, removed: false, openState: 'ready', openError: null, lastAgentError: null, promptError: null }, new Map([['s1', {}]]), { phase: 'sending' }, 'working'],
  ['pending-wins-over-running', { running: true, removed: false, openState: 'ready', openError: null, lastAgentError: null, promptError: null }, new Map([['s1', { pendingInteraction: { kind: 'question' } }]]), { phase: 'plain' }, 'waiting'],
];

let failures = 0;
for (const [name, session, status, input, expected] of cases) {
  const html = render({ session, status, input });
  const ok = html.includes(`data-agent-state="${expected}"`) && html.includes('asl_dot') && html.includes('asl_label');
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} -> ${expected} :: ${html.slice(0, 180)}`);
}

// Locale dictionaries must carry the same keys in both baseline locales.
const enKeys = Object.keys(localeRegistration.dicts.en).sort();
const zhKeys = Object.keys(localeRegistration.dicts.zh).sort();
if (JSON.stringify(enKeys) !== JSON.stringify(zhKeys)) {
  failures++;
  console.log('FAIL dictionary key mismatch', enKeys, zhKeys);
} else {
  console.log('PASS dictionaries aligned:', enKeys.length, 'keys');
}

console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
