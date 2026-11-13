import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const code = readFileSync(new URL('./lib/inline-node.js.txt', import.meta.url), 'utf8');
function fixture() {
  let definition, entry, renderer;
  const ctx = {
    uiConversation: { events: { register(value) { definition = value; } } },
    slots: {
      inject(name, install) { assert.equal(name, 'conversation.chat.node'); install(); },
      register(options, component) { entry = options; renderer = component; return () => {}; },
    },
  };
  const RenderUi = () => null;
  vm.runInNewContext(`${code}\nregisterInlineNode(ctx, RenderUi);`, {
    ctx, RenderUi, React: { createElement(component, props) { return { component, props }; } },
  });
  return { definition, entry, renderer, RenderUi };
}
const spec = { view: 'openui', format: 'openui-lang', libraryVersion: 'dsh-openui-1', lang: 'root = Stack([])' };
const event = (overrides = {}) => ({ type: 'tool/result', seq: 42, data: {
  turn: 1, step: 2, message: { source: { callId: 'call-1' }, content: [] },
  meta: { tool: 'render_ui', version: 1, spec }, ...overrides,
} });
test('result-only inline definition preserves engine identity and exemption', () => {
  const { definition, entry, renderer, RenderUi } = fixture();
  const result = event();
  const matched = definition.match['tool/result'](result);
  assert.equal(matched.role, 'start');
  assert.equal(matched.id, 'call-1');
  assert.equal(matched.exclusive, undefined);
  const match = { event: result, location: { kind: 'unresolved' } };
  const state = definition.start({}, match);
  const node = definition.buildViewNode({ state, key: 'engine-key', id: matched.id, start: match, matches: [match] });
  assert.equal(node.key, 'engine-key');
  assert.equal(node.anchorSeq, 42);
  assert.equal(node.groupTree, 'turn');
  assert.equal(node.visibility, 'visible');
  assert.equal(node.target, 'chat');
  assert.equal(entry.key, node.kind);
  const rendered = renderer({ node });
  assert.equal(rendered.component, RenderUi);
  assert.equal(rendered.props.spec, result.data.meta.spec);
});
test('errors, unmarked metadata, unsupported metadata versions and non-OpenUI views are ignored', () => {
  const { definition } = fixture();
  for (const overrides of [
    { message: { isError: true, source: { callId: 'call-1' } } },
    { error: { code: 'failed' } }, { meta: undefined }, { meta: null },
    { meta: { spec } },
    { meta: { tool: 'other', version: 1, spec } },
    { meta: { tool: 'render_ui', version: 2, spec } },
    { meta: { tool: 'render_ui', version: 1, spec: null } },
    { meta: { tool: 'render_ui', version: 1, spec: { view: 'custom', blocks: [] } } },
    { meta: { tool: 'render_ui', version: 1, spec: { view: 'sales', rows: [] } } },
    { meta: { tool: 'render_ui', version: 1, spec: { view: 'openui' } } },
  ]) assert.equal(definition.match['tool/result'](event(overrides)), null);
});
