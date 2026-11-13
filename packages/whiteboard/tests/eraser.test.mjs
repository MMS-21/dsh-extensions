import assert from 'node:assert/strict';
import test from 'node:test';
import { pointSegmentDistance2, segmentsNear, strokeHitsEraser } from '../lib/eraser.js';

test('eraser sweep hits the middle of a sparse stroke and respects its board position', () => {
  const stroke = { kind: 'ink', x: 200, y: 100, points: [[0, 0], [300, 0]] };
  assert.equal(strokeHitsEraser(stroke, { x: 350, y: 50 }, { x: 350, y: 150 }, 10), true);
  assert.equal(strokeHitsEraser(stroke, { x: 50, y: 50 }, { x: 50, y: 150 }, 10), false);
});

test('eraser tap hits near a stroke, but leaves distant strokes and other objects alone', () => {
  const point = { x: 30, y: 48 };
  assert.equal(strokeHitsEraser({ kind: 'ink', x: 0, y: 40, points: [[0, 0], [100, 0]] }, point, point, 10), true);
  assert.equal(strokeHitsEraser({ kind: 'ink', x: 0, y: 40, points: [[0, 0], [100, 0]] }, point, point, 4), false);
  assert.equal(strokeHitsEraser({ kind: 'note', x: 0, y: 0, points: [[30, 48]] }, point, point, 100), false);
});

test('segment geometry handles zero-length strokes and collinear nonoverlapping lines', () => {
  assert.equal(pointSegmentDistance2({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 }), 25);
  assert.equal(segmentsNear({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }, 1), false);
});
