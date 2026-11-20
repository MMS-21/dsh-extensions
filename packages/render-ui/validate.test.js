import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpec } from './lib/validate.js';
import { apply } from './lib/index.js';

const VALID = 'root = Stack([TextContent("Hello")])';
const VALID_DASHBOARD = 'root = Dashboard([header, section])\nheader = DashboardHeader("Support desk")\nsection = Section([row])\nrow = CardRow([card])\ncard = SmallCard("Open tickets", "338", {direction:"up", value:9})';

test('lang is required and unknown argument fields are rejected', () => {
  for (const args of [null, [], { title: 'x' }, { extra: true }, { lang: '', title: 'x' }, { lang: 3 }, Object.create({ lang: VALID }), JSON.parse('{"__proto__":{}}')]) {
    assert.throws(() => normalizeSpec(args), TypeError);
  }
  assert.throws(() => normalizeSpec({ lang: 'x'.repeat(200001) }), /Invalid OpenUI/);
  assert.throws(() => normalizeSpec({ lang: VALID, title: 'x'.repeat(201) }), /Invalid OpenUI/);
});

test('valid OpenUI Lang normalizes to the openui presentation envelope', () => {
  const spec = normalizeSpec({ lang: VALID, title: 'Demo' });
  assert.equal(spec.view, 'openui');
  assert.equal(spec.format, 'openui-lang');
  assert.equal(spec.libraryVersion, 'dsh-openui-1');
  assert.equal(spec.lang, VALID);
  assert.equal(spec.title, 'Demo');
  assert.deepEqual(normalizeSpec({ lang: VALID }), { view: 'openui', format: 'openui-lang', libraryVersion: 'dsh-openui-1', lang: VALID });
});

test('dashboard library validates its own grammar and tags the spec', () => {
  const spec = normalizeSpec({ lang: VALID_DASHBOARD, title: 'Support desk', library: 'dashboard' });
  assert.equal(spec.view, 'openui');
  assert.equal(spec.format, 'openui-lang');
  assert.equal(spec.library, 'dashboard');
  assert.equal(spec.libraryVersion, 'dsh-openui-dashboard-1');
  assert.equal(spec.lang, VALID_DASHBOARD);
  assert.equal(spec.title, 'Support desk');
});

test('library selection is bounded and each library rejects the other root', () => {
  for (const library of ['other', 3, null]) {
    assert.throws(() => normalizeSpec({ lang: VALID, library }), /Invalid UI spec|Invalid OpenUI/);
  }
  assert.throws(() => normalizeSpec({ lang: VALID_DASHBOARD }), /Invalid OpenUI/);
  assert.throws(() => normalizeSpec({ lang: VALID, library: 'dashboard' }), /Invalid OpenUI/);
});

test('malformed and unresolved OpenUI cannot become persisted presentation metadata', () => {
  for (const lang of ['', '  ', 'root = DoesNotExist("x")', 'root = Stack([missing])', 'root = Stack([', 'root = TextContent()']) {
    assert.throws(() => normalizeSpec({ lang }), /Invalid OpenUI/);
  }
});

test('tool requires lang and persists validated presentation spec', async () => {
  const tools = new Map();
  apply({ plugin() {}, tools: { register(definition) { tools.set(definition.name, definition); } } });
  const tool = tools.get('render_ui');
  assert.ok(tool.parameters.properties.lang);
  assert.ok(tool.parameters.properties.miniApp);
  assert.equal(tool.parameters.properties.spec, undefined);
  assert.match(tool.description, /OpenUI Lang/);
  await assert.rejects(tool.execute({}), TypeError);
  await assert.rejects(tool.execute({ lang: 'root = Stack([' }), TypeError);
  const args = { lang: VALID, title: 'Host smoke' };
  const value = await tool.execute(args);
  assert.equal(typeof value, 'string');
  assert.deepEqual(tool.output.presentationMeta(args, value), { tool: 'render_ui', version: 1, spec: normalizeSpec(args) });
  assert.deepEqual(tool.output.render(args, value), [{ type: 'text', text: value }]);
});

test('session_stats reads one consistent projection cut for the calling agent', async () => {
  const tools = new Map();
  const session = { id: 's1', seq: 9 };
  const values = {
    contextPressure: { pressureTokens: 9_000, projectedTokens: 12_000, contextWindow: 200_000 },
    contextBreakdown: { systemTokens: 4_000, toolsTokens: 3_000, messageTokens: 5_000 },
    tokenUsage: { uncachedInputTokens: 7_000, cacheReadTokens: 2_000, cacheWriteTokens: 1_000, outputTokens: 500 },
    sessionStats: { turns: 3, steps: 8, llmMs: 1_000, toolMs: 500, ttftMs: 200, ttftSteps: 2, decodeMs: 800, decodeTokens: 400 },
    workingDirectory: 'C:\\repo',
  };
  const snapshot = (s, keys) => {
    assert.equal(s, session);
    assert.deepEqual(keys, ['contextPressure', 'contextBreakdown', 'tokenUsage', 'sessionStats', 'workingDirectory']);
    return { asOfSeq: 9, values };
  };
  apply({
    plugin() {},
    sessionProjections: { snapshot },
    tools: { register(definition) { tools.set(definition.name, definition); } },
  });
  const tool = tools.get('session_stats');
  assert.match(tool.description, /LIVE statistics/);
  const stats = await tool.execute({}, { agent: { options: { model: 'test-model' }, session } });
  assert.equal(stats.model, 'test-model');
  assert.equal(stats.workingDirectory, 'C:\\repo');
  assert.equal(stats.context.window, 200_000);
  assert.equal(stats.context.usedTokens, 12_000);
  assert.equal(stats.context.percent, 6);
  assert.deepEqual(stats.tokens, { uncachedInput: 7_000, cacheRead: 2_000, cacheWrite: 1_000, output: 500 });
  assert.equal(stats.activity.turns, 3);
  assert.equal(stats.activity.steps, 8);
  assert.equal(stats.asOfSeq, 9);
  // A call without a session fails loud rather than inventing numbers.
  await assert.rejects(tool.execute({}, {}), TypeError);
  // A composition without the projection registry also fails loud.
  const bare = new Map();
  apply({ plugin() {}, tools: { register(definition) { bare.set(definition.name, definition); } } });
  await assert.rejects(bare.get('session_stats').execute({}, { agent: { session } }), TypeError);
});

test('legacy and v2 dashboards retain separate persisted grammar', () => {
  const v2 = 'root = Dashboard([section])\nsection = Section("Dashboard v2 fixture", [])';
  assert.equal(normalizeSpec({lang: v2, library: 'dashboard-v2'}).library, 'dashboard-v2');
  assert.equal(normalizeSpec({lang: VALID_DASHBOARD, library: 'dashboard'}).library, 'dashboard');
  assert.throws(() => normalizeSpec({lang: VALID_DASHBOARD, library: 'dashboard-v2'}), /Unknown component/);
});
