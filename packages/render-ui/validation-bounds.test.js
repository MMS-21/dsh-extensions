import test from 'node:test';import assert from 'node:assert/strict';import {normalizeOpenUi} from './lib/openui-validate.js';
test('persisted OpenUI rejects unknown component',()=>{assert.throws(()=>normalizeOpenUi('root = Stack([DoesNotExist("x")])'),/Invalid OpenUI/);});
test('persisted OpenUI rejects oversized lang',()=>{assert.throws(()=>normalizeOpenUi('x'.repeat(200001)),/Invalid OpenUI/);});
test('persisted OpenUI accepts Query but rejects unsafe keys in its arguments',()=>{assert.equal(normalizeOpenUi('data = Query("x", {}, {})\nroot = Stack([])').view,'openui');assert.throws(()=>normalizeOpenUi('data = Query("x", {constructor:"bad"}, {})\nroot = Stack([])'),/Invalid OpenUI/);});

test('diagnostics identify the affected Card and Stack statements and fields', () => {
  const lang = `root = Stack([introCard, mainRow])
introCard = Card([TextContent("Intro")], "column", "s")
mainRow = Stack([TextContent("Body")], "row", "l", "center", "stretch", true)`;
  assert.throws(() => normalizeOpenUi(lang), error => {
    assert.match(error.message, /introCard → Card: field "\/variant".*got "column"/);
    assert.match(error.message, /introCard → Card: field "\/direction".*got "s"/);
    assert.match(error.message, /mainRow → Stack: field "\/justify".*got "stretch"/);
    return true;
  });
  assert.equal(normalizeOpenUi(lang.replace('"column", "s"', '"card", "column", "s"')
    .replace('"center", "stretch"', '"stretch", "center"')).view, 'openui');
});

test('depth and expanded node limits produce different diagnostics', () => {
  const deep = 'root = ' + 'Stack(['.repeat(24) + 'TextContent("Leaf")' + '])'.repeat(24);
  const wide = 'root = Stack([' + Array(110).fill('section').join(',') + '])\n'
    + 'section = Stack([' + Array(100).fill('TextContent("Item")').join(',') + '])';
  assert.throws(() => normalizeOpenUi(deep), /nesting depth limit exceeded.*maximum 64/);
  assert.throws(() => normalizeOpenUi(wide), /expanded node count limit exceeded.*maximum 40000/);
});

test('repeated Card mistakes do not crowd out other fixes', () => {
  const names = Array.from({length: 8}, (_, index) => 'card' + index);
  const cards = names.map(name => name + ' = Card([TextContent("Item")], "column", "s")');
  const lang = [
    'root = Stack([' + [...names, 'mainRow'].join(',') + '])',
    ...cards,
    'mainRow = Stack([TextContent("Body")], "row", "l", "center", "stretch", true)',
  ].join('\n');
  assert.throws(() => normalizeOpenUi(lang), error => {
    assert.match(error.message, /card0, card1, .*card7 → Card: field "\/variant"/);
    assert.match(error.message, /mainRow → Stack: field "\/justify"/);
    return true;
  });
});

test('normalizes the repeated Stack argument swap before persisting the program', () => {
  const lang = `root = Stack([firstRow, secondRow])
firstRow = Stack([TextContent("one")], "row", "m", "start", "stretch", true)
secondRow = Stack([TextContent("two")], "row", "m", "start", "stretch", true)`;
  const spec = normalizeOpenUi(lang);
  assert.equal(spec.lang, lang.replaceAll('"start", "stretch"', '"stretch", "start"'));
  assert.equal(normalizeOpenUi(spec.lang).lang, spec.lang);
});

test('a Stack repair leaves a matching sequence inside displayed text alone', () => {
  const shown = 'Stack([], "row", "m", "start", "stretch", true)';
  const lang = `root = Stack([TextContent(${JSON.stringify(shown)})], "row", "m", "start", "stretch", true)`;
  const spec = normalizeOpenUi(lang);
  assert.ok(spec.lang.includes(JSON.stringify(shown)));
  assert.ok(spec.lang.endsWith('"stretch", "start", true)'));
});
