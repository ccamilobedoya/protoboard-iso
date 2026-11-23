// Hand-written circuits that did not go well before the release (docs/en/layout.md, "Hard cases"):
// each spec is one an assistant sent on a clean clone (test/fixtures/layout-hard/), without its
// program. They take seconds each: the largest budget (test/layout-generous.js), so the test
// measures what the search finds, not the machine.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatLayout, specFromCircuit, autoLayout as layoutWithDefaults } from '../src/layout.js';
import { autoLayout } from './layout-generous.js';
import { formatIssue, t } from '../src/index.js';

const spec = (name) => JSON.parse(readFileSync(new URL(`fixtures/layout-hard/${name}.json`, import.meta.url), 'utf8'));
const text = (r, lang = 'en') => formatLayout(r, lang, { t, formatIssue });
const partsOf = (r) => r.circuit.parts.filter((p) => p.type !== 'wire').map((p) => p.id).sort();

// Four relays on the outputs of one ULN2003, driven by an ESP32 DevKit: their bodies lie on the table
// along the front edge, each where the mean of its two leads is, so the second and the third landed
// on the first and "found no place" (the kit's two suggestions, each relay listed first, did not help).
for (const name of ['esp32-four-relays', 'esp32-four-relays-first']) {
  test(`hard cases: ${name} lays out every part, the relays side by side along the edge`, () => {
    const s = spec(name);
    const r = autoLayout(s);
    assert.notEqual(r.status, 'changes', text(r));
    assert.ok(r.check.ok, 'every net asked for, nothing shorted');
    assert.deepEqual(partsOf(r), s.parts.map((p) => p.id).sort(), 'no part left out');
    assert.equal(r.problems.filter((p) => p.code === 'LAYOUT_PART_FAILED').length, 0);
    assert.equal(r.circuit.spec.unplaced, undefined, 'nothing to say about parts left out');
  });
}

// The order that works is one the search finds itself (inAnyOrder): each order of the nets gets one
// try before any is searched whole, and the one with the best start is searched first; a part with
// many signal pins (a display, a shift register) gives an order of its own, from it.
test('hard cases: an UNO, a 7-segment display and a button end without CHANGES in few placements', () => {
  const r = autoLayout(spec('uno-seven-segment-d10-button'));
  assert.notEqual(r.status, 'changes', text(r));
  assert.ok(r.check.ok);
  // Counted in placements tried, not seconds: 67 146 before (the order given searched whole, then
  // both orders of the nets, then a trial); about 11 600 with the display's order searched first.
  assert.ok(r.tried.placements < 20000, `${r.tried.placements} placements`);
});

test('hard cases: an UNO, two 74HC595 and sixteen LEDs on the double board end without CHANGES', () => {
  const r = autoLayout(spec('uno-two-595-sixteen-leds-double'));
  assert.notEqual(r.status, 'changes', text(r));
  assert.ok(r.check.ok);
  assert.equal(r.review.blocking.length, 0);
});

// A circuit saved with parts left out says which: its spec keeps them (`unplaced`), so simulate and
// review can say so on every later answer, and a layout again on it tries them again.
test('hard cases: a circuit saved with parts left out keeps them in its spec, and layout again asks for them', () => {
  const parts = Array.from({ length: 12 }, (_, i) => ({ id: `R${i + 1}`, type: 'resistor', value: '1k' }));
  const nets = parts.slice(1).map((p, i) => [`R${i + 1}.2`, `${p.id}.1`]);
  // A budget of a few placements (counted in work, so the same on every machine) leaves most out.
  const r = layoutWithDefaults({ parts, nets }, { budget: 0.001 });
  assert.equal(r.status, 'changes');
  const placed = new Set(partsOf(r));
  const left = parts.map((p) => p.id).filter((id) => !placed.has(id));
  assert.ok(left.length > 0, 'the budget left parts out');
  assert.deepEqual(r.circuit.spec.unplaced.map((p) => p.id), left);
  assert.ok(r.circuit.spec.unplaced.every((p) => p.type === 'resistor' && p.value === '1k' && p.pins === undefined), 'each as it was asked, without holes');
  assert.deepEqual(specFromCircuit(r.circuit).parts.map((p) => p.id).sort(), parts.map((p) => p.id).sort(), 'layout again asks for every part');
  // One placed by hand since is no longer said to be missing.
  const first = left[0];
  const byHand = { ...r.circuit, parts: [...r.circuit.parts, { id: first, type: 'resistor', value: '1k', pins: ['a60', 'a64'] }] };
  assert.equal(specFromCircuit(byHand).parts.filter((p) => p.id === first).length, 1);
});

test('hard cases: the line that says which parts are not on the board, in both languages', () => {
  assert.match(t('en', 'spec.unplaced', { parts: 'K2, K3' }), /^Not on the board: K2, K3\..*not the whole circuit/);
  assert.match(t('es', 'spec.unplaced', { parts: 'K2, K3' }), /^No están en la protoboard: K2, K3\..*no es el circuito completo/);
});

// The budget's answer: every ✖ still says the change the kit would try next, and a change offered is
// never one the kit already tried (it tries the next changes itself while the budget lasts).
test('hard cases: an answer stopped at its budget offers on each item a change the kit did not try', () => {
  const s = JSON.parse(readFileSync(new URL('fixtures/layout-trials/uno-595-leds.json', import.meta.url), 'utf8'));
  const r = layoutWithDefaults({ ...s, board: 'bb830' }, { budget: 1 });
  assert.equal(r.status, 'changes');
  const items = [...r.problems.filter((p) => p.code !== 'LAYOUT_BUDGET'), ...r.review.blocking, ...r.check.missing];
  assert.ok(items.length > 0);
  for (const b of items) assert.ok(b.next, JSON.stringify(b));
  const firsts = (r.changesTried ?? []).filter((c) => c.kind === 'first').map((c) => c.parts.split(', ')[0]);
  for (const b of items) if (b.next.kind === 'first') assert.ok(!firsts.includes(b.next.parts), `${b.next.parts} was tried first already`);
  if (r.changesTried?.length) assert.match(text(r), /Before this answer the kit also tried/);
});
