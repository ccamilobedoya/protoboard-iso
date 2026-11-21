// What layout tries before it answers CHANGES (src/layout.js, withTrials): the orders the nets give
// again from its best try, the larger board when a development board covers a part, and the tallest
// or widest parts first. The three specs are what assistants sent on a clean clone and got CHANGES
// for, each solved by hand with one of those trials (test/fixtures/layout-trials/).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { autoLayout, formatLayout } from '../src/layout.js';
import { formatIssue, t } from '../src/index.js';

const spec = (name) => JSON.parse(readFileSync(new URL(`fixtures/layout-trials/${name}.json`, import.meta.url), 'utf8'));
const text = (r, lang = 'en') => formatLayout(r, lang, { t, formatIssue });
// These take tens of seconds each on a loaded machine: a budget well above that, so the test
// measures what the trials find, not the machine (the default budget is BUDGET_SECONDS).
const BUDGET = 150;
const runs = new Map();
const laid = (name) => runs.get(name) ?? runs.set(name, autoLayout(spec(name), { budget: BUDGET })).get(name);
const TRIED = ['LAYOUT_ORDER_FROM_NETS', 'LAYOUT_TRIED_DOUBLE', 'LAYOUT_TRIED_DOUBLE_ORDER', 'LAYOUT_TRIED_TALLEST', 'LAYOUT_TRIED_WIDEST'];

test('trials: an UNO covering half of a 74HC595 ends on the double board, saying why, nothing electrical changed', () => {
  const r = autoLayout(spec('uno-595-leds'), { budget: BUDGET });
  assert.notEqual(r.status, 'changes', text(r));
  assert.ok(r.check.ok, 'every net asked for, nothing shorted');
  assert.equal(r.review.blocking.length, 0);
  assert.equal(r.circuit.board, 'double');
  const notes = r.notes.filter((n) => TRIED.includes(n.code));
  assert.equal(notes.length, 1, 'one note says what was changed from the spec as written');
  assert.match(notes[0].code, /^LAYOUT_TRIED_DOUBLE/);
  assert.equal(notes[0].params.board, 'U1');
  assert.equal(notes[0].params.part, 'U2');
  assert.match(text(r), /double board .*because U1 covered U2/);
  assert.match(text(r, 'es'), /protoboard doble .*porque U1 tapaba a U2/);
  assert.equal(r.circuit.parts.filter((p) => p.type !== 'wire').length, 18, 'no part added or taken away');
});

test('trials: a jumper hidden under an ultrasonic module and a seven-segment counter end without CHANGES on one board', () => {
  for (const name of ['uno-ultrasonic-leds', 'uno-seven-segment-button']) {
    const r = laid(name);
    assert.notEqual(r.status, 'changes', `${name}\n${text(r)}`);
    assert.ok(r.check.ok, name);
    assert.equal(r.circuit.board, 'auto', `${name}: an order was enough, the board stays as written`);
    assert.equal(r.notes.filter((n) => TRIED.includes(n.code)).length, 1, `${name}: one note says what changed`);
    assert.doesNotMatch(text(r), /next the kit would try/);
  }
});

test('trials: the same spec gives the same circuit', () => {
  const b = autoLayout(spec('uno-ultrasonic-leds'), { budget: BUDGET });
  assert.deepEqual(laid('uno-ultrasonic-leds').circuit.parts, b.circuit.parts);
});

test('trials: a CHANGES answer follows each ✖ with the spec change the kit would try next', () => {
  // A budget of one second: the search stops after its first try, before any trial, so the next
  // one is the first trial left (the double board: U1 covers parts on one board).
  const r = autoLayout(spec('uno-595-leds'), { budget: 1 });
  assert.equal(r.status, 'changes');
  assert.ok(r.review.blocking.length > 0);
  for (const b of r.review.blocking) assert.deepEqual(b.next, { kind: 'board', board: 'double' });
  const lines = text(r).split('\n');
  const review = lines.findIndex((l) => l.startsWith('Review (lesson): CHANGES'));
  for (let i = review + 1; lines[i]?.startsWith('  ✖'); i += 2) assert.match(lines[i + 1], /^ {6}→ next the kit would try: add "board": "double" to the spec\.$/);
  assert.match(text(r, 'es'), /→ lo siguiente que probaría el kit: agregar "board": "double"/);
});

test('trials: a spec that names its board keeps it: the next try is an order, never another board', () => {
  const r = autoLayout({ ...spec('uno-595-leds'), board: 'bb830' }, { budget: 1 });
  assert.equal(r.circuit.board, 'bb830');
  assert.ok(r.review.blocking.length > 0);
  for (const b of r.review.blocking) assert.equal(b.next?.kind, 'first', JSON.stringify(b));
  assert.match(text(r), /→ next the kit would try: list [\w, ]+ first in "parts"\./);
});
