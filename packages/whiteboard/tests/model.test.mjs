/**
 * Model tests for the DeepSeek Harness Whiteboard port.
 *
 * These mirror the guarantees the Hermes original pinned in
 * tests/board.test.mjs: cleaning a model spec, laying out without overlaps,
 * receipts that take back, and the text exports. Run with:
 *
 *   node tests/model.test.mjs
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TABLE_HEAD,
  applyProposalItem,
  boardMarkdown,
  boardTable,
  chatProposal,
  cleanSources,
  lastJsonObject,
  layoutSpec,
  makeNote,
  parseBoardSpec,
  parseRunReply,
  sectionsOf,
  sharedBoardCopy,
  takeBackReceipt,
  takeBackState,
  toDelimited,
  boardTable as table,
} from '../lib/model.js';

const SPEC = {
  layout: 'route',
  title: 'Spring bake sale',
  sections: [
    { label: 'Day 1', sticker: 'flag', title: 'Kickoff', notes: [{ text: 'Lock the flavour' }, { action: true, text: 'Compare three bakery suppliers' }] },
    { sticker: 'coins', title: 'Pricing', notes: ['Price the box'] },
    { sticker: 'nope', title: 'Ship it', notes: [] },
    { title: '' },
  ],
};

test('a model board is cleaned to what the page can draw', () => {
  const spec = parseBoardSpec(SPEC);
  assert.equal(spec.layout, 'route');
  assert.equal(spec.title, 'Spring bake sale');
  assert.equal(spec.sections.length, 3);
  assert.equal(spec.sections[1].notes[0].text, 'Price the box');
  assert.equal(spec.sections[0].notes[1].action, true);
  assert.equal(spec.sections[2].sticker, undefined);
  assert.equal(parseBoardSpec({ ...SPEC, layout: 'spiral' }).layout, 'columns');
  assert.equal(parseBoardSpec(SPEC, 'map').layout, 'map');
  assert.equal(parseBoardSpec({ sections: [{ title: 'Only one' }] }), null);
  assert.equal(parseBoardSpec(null), null);
});

test('a route lays waypoints along a road without overlapping cards', () => {
  const { items, links } = layoutSpec(parseBoardSpec(SPEC), { x: 0, y: 0 });
  const stops = items.filter((item) => item.kind === 'waypoint');
  const notes = items.filter((item) => item.kind === 'note');
  assert.equal(stops.length, 3);
  assert.equal(links.length, 2);
  assert.deepEqual(links.map((link) => [link.from, link.to]), [[stops[0].id, stops[1].id], [stops[1].id, stops[2].id]]);
  assert.equal(notes.length, 3);
  assert.ok(notes.every((note) => stops.some((stop) => stop.id === note.frame)));
  assert.equal(items[0].kind, 'text');
  assert.ok(items[0].y < Math.min(...stops.map((stop) => stop.y)));
  for (const a of [...stops, ...notes]) {
    for (const b of [...stops, ...notes]) {
      if (a !== b) assert.equal(overlaps(a, b), false, `${a.title || a.text} overlaps ${b.title || b.text}`);
    }
  }
});

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

test('columns put each section in its own frame, and a map grows around a hub', () => {
  const columns = layoutSpec(parseBoardSpec(SPEC, 'columns'), { x: 0, y: 0 });
  const frames = columns.items.filter((item) => item.kind === 'frame');
  assert.equal(frames.length, 3);
  assert.ok(frames[0].x + frames[0].w < frames[1].x);
  for (const note of columns.items.filter((item) => item.kind === 'note')) {
    const frame = frames.find((entry) => entry.id === note.frame);
    assert.ok(note.x >= frame.x && note.x + note.w <= frame.x + frame.w && note.y >= frame.y && note.y + note.h <= frame.y + frame.h);
  }
  const map = layoutSpec(parseBoardSpec(SPEC, 'map'), { x: 0, y: 0 });
  const hub = map.items.find((item) => item.kind === 'hub');
  assert.equal(hub.title, 'Spring bake sale');
  assert.equal(map.links.length, 3);
  assert.ok(map.links.every((link) => link.kind === 'branch' && link.from === hub.id));
  assert.equal(map.items.some((item) => item.kind === 'text'), false);
});

test('the last JSON object wins over prose and earlier JSON', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(lastJsonObject('Sure {"a": 1} then {"sections": []}', (value) => 'sections' in value))), { sections: [] });
  assert.equal(lastJsonObject('no json here'), null);
  assert.equal(lastJsonObject('```json\n{"x": 2}\n```').x, 2);
});

test('grouping notes moves them into a new frame, and the receipt takes it back', () => {
  const a = makeNote({ id: 'a', text: 'Signup email lands in spam', x: 0, y: 0 });
  const b = makeNote({ id: 'b', text: 'Trial ends with no warning', x: 600, y: 400 });
  const c = makeNote({ id: 'c', text: 'Launch post did well', x: 1200, y: 0 });
  const board = { id: 'b1', items: [a, b, c], links: [] };
  const outcome = applyProposalItem(board, { kind: 'group', noteIds: ['a', 'b', 'zz'], title: 'Onboarding' });
  const frame = outcome.board.items.find((item) => item.kind === 'frame');
  const moved = outcome.board.items.filter((item) => item.frame === frame.id);
  assert.equal(frame.title, 'Onboarding');
  assert.equal(moved.length, 2);
  assert.equal(outcome.board.items.find((item) => item.id === 'c').x, 1200);
  assert.equal(takeBackState(outcome.board, outcome.receipt).ok, true);
  const back = takeBackReceipt(outcome.board, outcome.receipt);
  assert.equal(back.items.some((item) => item.kind === 'frame'), false);
  assert.equal(back.items.find((item) => item.id === 'b').x, 600);
  assert.equal(back.items.find((item) => item.id === 'b').frame, undefined);
  assert.match(applyProposalItem(board, { kind: 'group', noteIds: ['a', 'gone'], title: 'X' }).error, /gone/);
});

test('Markdown and the shared copy follow sections in reading order', () => {
  const { items, links } = layoutSpec(parseBoardSpec(SPEC), { x: 0, y: 0 });
  const action = items.find((item) => item.action);
  const result = { for: action.id, h: 150, id: 'd1', kind: 'result', sources: ['https://x.example'], text: '- Alpha bakery', title: 'Three suppliers', w: 300, x: 0, y: 0 };
  const board = { id: 'b1', name: 'Spring bake sale', items: [...items, makeNote({ id: 'loose', owner: 'Dev', text: 'Ask about permits', x: 5000, y: 0 }), result], links };
  const md = boardMarkdown(board);
  assert.match(md, /^# Spring bake sale/);
  assert.ok(md.indexOf('## Day 1: Kickoff') < md.indexOf('## Stop 2: Pricing'));
  assert.match(md, /- \[ \] Compare three bakery suppliers/);
  assert.match(md, /Hermes delivered: Three suppliers/);
  assert.match(md, /Source: https:\/\/x.example/);
  assert.match(md, /## Notes\n\n- Ask about permits \(Dev\)/);
  const copy = sharedBoardCopy(board);
  assert.deepEqual(copy.sections.map((section) => section.title), ['Kickoff', 'Pricing', 'Ship it']);
  assert.equal(copy.notes.find((note) => note.id === action.id).section, 'Kickoff');
  assert.match(copy.notes.find((note) => note.id === action.id).result, /Three suppliers/);
});

test('a chat proposal becomes review items, never direct edits', () => {
  const proposal = chatProposal({
    actions: [{ owner: 'Mia', reason: 'Deadline', text: 'Book the venue' }],
    groups: [{ notes: ['a', 'b'], reason: 'Same', title: 'Logistics' }, { notes: ['a'], title: 'Too small' }],
    notes: [{ reason: 'Missing', section: 'Pricing', text: 'Add a tip jar' }, { text: '' }],
    summary: 'Tidy up',
  });
  assert.equal(proposal.from, 'chat');
  assert.deepEqual(proposal.items.map((item) => item.kind), ['note', 'group', 'action']);
  assert.ok(proposal.items.every((item) => item.state === 'pending'));
  assert.equal(chatProposal({ notes: [] }), null);
});

test('a delivered result is read back from JSON, or kept whole when the model forgot it', () => {
  const parsed = parseRunReply('Done.\n{"headline": "Three suppliers", "result": "- A\\n- B", "sources": ["https://a.example/x", "nope"]}');
  assert.equal(parsed.headline, 'Three suppliers');
  assert.equal(parsed.text, '- A\n- B');
  assert.deepEqual([...parsed.sources], ['https://a.example/x']);
  const loose = parseRunReply('## Draft email\nHello team');
  assert.equal(loose.headline, 'Draft email');
  assert.match(loose.text, /Hello team/);
  assert.equal(parseRunReply('   '), null);
});

test('the board as a table follows section order and quotes CSV safely', () => {
  const { items, links } = layoutSpec(parseBoardSpec(SPEC), { x: 0, y: 0 });
  const action = items.find((item) => item.action);
  const board = { id: 'b1', name: 'Spring bake sale', items: [...items, { for: action.id, h: 1, id: 'd', kind: 'result', sources: ['https://a.example', 'https://b.example'], title: 'Three, "good" ones', w: 1, x: 0, y: 0 }], links };
  const rows = table(board);
  assert.deepEqual([...rows[0]], TABLE_HEAD);
  assert.deepEqual(rows.slice(1).map((row) => row[0]), ['Kickoff', 'Kickoff', 'Pricing']);
  assert.deepEqual(rows.find((row) => row[2] === 'action').slice(5), ['delivered', 'Three, "good" ones', 'https://a.example https://b.example']);
  assert.match(toDelimited(rows, ','), /"Three, ""good"" ones"/);
  assert.equal(toDelimited([['a\tb', 'c\nd']], '\t'), 'a b\tc d');
});

test('cleanSources keeps only absolute http(s) URLs, deduped and bounded', () => {
  assert.deepEqual(cleanSources(['https://a.example', 'nope', 'https://a.example', 'http://b.example']), ['https://a.example', 'http://b.example']);
  assert.equal(cleanSources(['https://a.example', 'https://b.example', 'https://c.example', 'https://d.example', 'https://e.example', 'https://f.example', 'https://g.example']).length, 6);
});
