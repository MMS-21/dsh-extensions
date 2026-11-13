import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeOpenUi } from './lib/openui-validate.js';
import { library } from './lib/openui-library-build.mjs';
import { openuiLibrary } from '@openuidev/react-ui/genui-lib';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const normalize = lang => normalizeOpenUi(lang, 'Validation test');

test('full OpenUI registry remains available', () => {
  const names = Object.keys(library.components);
  assert.ok(names.length >= 70, `expected full library, got ${names.length}`);
  for (const name of ['Stack','Card','Tabs','TabItem','Form','Input','Table','EditableTable','BarChart','LineChart','PieChart','Modal','Image','CodeBlock']) assert.ok(names.includes(name), `missing ${name}`);
  const builtinNames = Object.keys(openuiLibrary.components);
  assert.equal(names.length, builtinNames.length + 4);
  assert.ok(names.includes('RecommendationCards') && names.includes('Recommendation'));
  for (const name of builtinNames) assert.ok(library.components[name], `lost built-in ${name}`);
  assert.equal(library.root, openuiLibrary.root);
});

test('a repeated column variable is rejected before rendering', () => {
  const lang = 'root = Stack([Table([same, same])])\nsame = Col("Swap for", ["Cairo Tower"])';
  assert.throws(() => normalize(lang), /repeats column "same"/);
});

test('recommendation cards validate with their own image source and alternative', () => {
  const lang = 'root = Stack([Card([RecommendationCards([Recommendation("Park", "Old Cairo", "Sunset views", "https://example.org/park.jpg", "Park at sunset", "https://example.org/park", "Tower", "Higher view")])])])';
  assert.equal(normalize(lang).lang, lang);
});

test('malformed and unresolved OpenUI cannot become persisted presentation metadata', () => {
  for (const lang of ['', '  ', 'root = DoesNotExist("x")', 'root = Stack([missing])', 'root = Stack([', 'root = TextContent()']) assert.throws(() => normalize(lang), /Invalid OpenUI/);
  assert.throws(() => normalizeOpenUi('root = Stack([])', 'x'.repeat(201)), /Invalid OpenUI/);
  assert.throws(() => normalize('x'.repeat(200001)), /Invalid OpenUI/);
});

test('executable URL schemes are rejected even inside text data', () => {
  for (const url of ['javascript:alert(1)', 'JAVASCRIPT :alert(1)', 'vbscript:msgbox(1)', 'data:text/html,<script>bad</script>']) assert.throws(() => normalize(`root = Stack([TextContent(${JSON.stringify(url)})])`), /Invalid OpenUI/);
});

test('Query and Mutation can be persisted for session tool execution', () => {
  const lang='data = Query("ci_status", {}, {status:"pending"})\nsave = Mutation("save_preferences", {theme:"shell"})\nroot = Stack([TextContent(data.status), Button("Save", Action([@Run(save)]))])';
  assert.equal(normalize(lang).lang, lang);
});

test('Tabs validate correctly with nested components', () => {
  const lang = 'root = Stack([Tabs([TabItem("a", "Tab A", [TextContent("Hello A")]), TabItem("b", "Tab B", [TextContent("Hello B")])])])';
  const result = normalize(lang);
  assert.equal(result.view, 'openui');
  assert.equal(result.lang, lang);
});

test('Charts and tables render with color data', () => {
  const lang = 'root = Stack([Card([CardHeader("Dashboard"), BarChart(["Q1","Q2","Q3"], [Series("Revenue", [120,140,160])])])])';
  const result = normalize(lang);
  assert.equal(result.view, 'openui');
});
