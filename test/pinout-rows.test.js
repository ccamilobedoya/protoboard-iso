// The rows of a part's pins while the camera moves: one arrangement, so they do not jump.
import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutRows } from '../src/page/client/pinout.js';

const FREE = { x0: 60, x1: 1020, y1: 1700 };
const PINS = [{ text: 'E · emisor · común a las dos' }, { text: 'B · base · la corriente pequeña' }, { text: 'C · colector · la carga' }];
// Three pins around the middle of a 1080 px frame, the camera pushing in step by step.
const tipsAt = (zoom) => [-40, 0, 40].map((dx) => ({ x: 540 + dx * zoom, y: 1100 + 30 * zoom }));
const shape = (r) => r.rows.map((row) => [row.side, row.text]);

test('choosing on every frame changes the arrangement somewhere along a push (what the held rows prevent)', () => {
  const seen = new Set();
  for (let z = 1; z <= 12; z += 0.02) {
    const r = layoutRows(PINS, tipsAt(z), FREE, 1);
    seen.add(JSON.stringify([shape(r), r.size]));
  }
  assert.ok(seen.size > 1);
});

test('held rows keep each pin on its side, its text and the size for the whole push', () => {
  // A slow push: about a fifth more zoom, as a video's hook does.
  const first = layoutRows(PINS, tipsAt(3), FREE, 1);
  assert.ok(first.held);
  for (let z = 3; z <= 3.6; z += 0.005) {
    const r = layoutRows(PINS, tipsAt(z), FREE, 1, false, first.held);
    assert.deepEqual(shape(r), shape(first));
    assert.equal(r.size, first.size);
  }
});

test('held rows still follow the tips: the leaders move with the camera', () => {
  const first = layoutRows(PINS, tipsAt(1), FREE, 1);
  const later = layoutRows(PINS, tipsAt(2), FREE, 1, false, first.held);
  assert.deepEqual(later.rows[0].tip, tipsAt(2)[0]);
  assert.notEqual(later.rows[0].x, first.rows[0].x);
});

test('a part up close in the page is not held: the learner zooms it', () => {
  assert.equal(layoutRows(PINS, tipsAt(1), FREE, 1, true).held, undefined);
});

test('a move too large for the held rows chooses again: nothing runs over a leader', () => {
  const first = layoutRows(PINS, tipsAt(1), FREE, 1);
  // The whole part thrown to the left edge: the rows of the left column have no room left.
  const moved = tipsAt(1).map((p) => ({ x: p.x - 440, y: p.y }));
  const r = layoutRows(PINS, moved, FREE, 1, false, first.held);
  assert.notEqual(r.held, first.held);
});

test('a timeline may ask for three caption lines: a lower circuit and oscilloscope, and the frame rule follows', async () => {
  const { frameProblems } = await import('../scripts/stage-shots.js');
  const m = { captionLines: 3, chrome: [], sizes: {} };
  assert.deepEqual(frameProblems('vertical', m, { captionLines: 3 }), []);
  assert.match(frameProblems('vertical', m).join(' '), /takes 3 lines/);
});
