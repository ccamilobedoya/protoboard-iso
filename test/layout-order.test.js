// The layout must not depend on the order the parts are listed in (docs/en/layout.md, "Any order"):
// the order given is tried first, and when it leaves something to fix, the orders the nets give.
// Property: for a sample of recipes (the largest among them), each shuffled with a seeded generator
// several times, every layout ends DONE. A recipe that cannot be made order-independent yet is
// named below with the reason, never left out in silence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { autoLayout, signalOrders, specFromCircuit } from '../src/layout.js';
import { RECIPES, expandRecipe } from '../src/recipes/index.js';

// A small linear congruential generator: the same shuffles on every run and machine.
function seeded(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}
function shuffled(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const SAMPLE = ['uno-seven-segment', '555-astable', 'relay-npn', 'ldr-comparator', 'mosfet-switch', 'opamp-comparator', 'lm393-comparator', 'laser-uno', 'laser-tripwire', 'uno-rgb-led', 'encoder-dimmer-uno', 'npn-switch', 'uno-pot-pwm', 'regulator-7805'];
const SHUFFLES = 3;
// Recipes whose shuffled orders do not all end DONE yet, and why.
const KNOWN = {
  'esp32-distance':
    'on the double board, only the orders with the divider (R1, R2) before the DevKit and the sensor after it end DONE: with the DevKit placed first, a jumper ends up behind the sensor module in the back view, in the order given and in every order the nets give',
};

test('the sample holds at least ten recipes, the largest among them', () => {
  assert.ok(SAMPLE.length >= 10);
  const size = (name) => expandRecipe(name).spec.parts.length;
  const largest = Math.max(...Object.keys(RECIPES).filter((n) => !KNOWN[n]).map(size));
  assert.ok(SAMPLE.some((n) => size(n) === largest), `a recipe with ${largest} parts`);
  for (const name of [...SAMPLE, ...Object.keys(KNOWN)]) assert.ok(RECIPES[name], name);
});

for (const name of SAMPLE) {
  test(`${name}: DONE in ${SHUFFLES} shuffled orders of its parts`, () => {
    const spec = expandRecipe(name).spec;
    const random = seeded([...name].reduce((h, c) => Math.imul(h, 31) + c.charCodeAt(0), 7));
    for (let k = 0; k < SHUFFLES; k++) {
      const parts = shuffled(spec.parts, random);
      const r = autoLayout({ ...spec, parts });
      assert.equal(r.status, 'done', `${parts.map((p) => p.id).join(', ')}: ${r.status} ${JSON.stringify(r.problems.map((p) => p.code))} ${JSON.stringify(r.review.blocking.map((b) => b.code))}`);
    }
  });
}

for (const [name, why] of Object.entries(KNOWN)) {
  test(`${name}: known to depend on the order (${why}); in its own order it ends DONE`, () => {
    assert.equal(autoLayout(expandRecipe(name).spec).status, 'done');
  });
}

test('the orders the nets give do not depend on the order the parts were listed in', () => {
  const spec = expandRecipe('uno-seven-segment').spec;
  const ids = (s) => signalOrders(s).map((o) => o.parts.map((p) => p.id).join(' '));
  const random = seeded(1);
  for (let k = 0; k < 3; k++) assert.deepEqual(ids({ ...spec, parts: shuffled(spec.parts, random) }), ids(spec));
  // Sources first, then each resistor; the display after them, fed by all.
  assert.equal(ids(spec)[0], 'U1 R1 R2 R3 R4 R5 R6 R7 DS1');
});

// The measured case: the buzzer straight on D10 with a 200 Ω resistor put in series, R3 appended at
// the end of the parts or listed before BZ1, as a new circuit and on the circuit already placed.
test('a resistor added in series ends DONE in either order, new or on the circuit already placed, which keeps the holes that still fit', () => {
  const buzzer = JSON.parse(readFileSync(new URL('fixtures/kit-first/buzzer-on-pin.json', import.meta.url), 'utf8'));
  const nets = buzzer.nets.flatMap((n) => (n[0] === 'U1.D10' ? [['U1.D10', 'R3.1'], ['R3.2', 'BZ1.1']] : [n]));
  const R3 = { id: 'R3', type: 'resistor', value: '200' };
  const at = buzzer.parts.findIndex((p) => p.id === 'BZ1');
  const orders = { appended: [...buzzer.parts, R3], before: [...buzzer.parts.slice(0, at), R3, ...buzzer.parts.slice(at)] };
  const built = autoLayout(buzzer);
  assert.equal(built.status, 'warnings');
  for (const [how, parts] of Object.entries(orders)) {
    assert.equal(autoLayout({ ...buzzer, parts, nets }).status, 'done', `new, ${how}`);
    const again = autoLayout(specFromCircuit(built.circuit, { parts, nets }), { previous: built.circuit });
    assert.equal(again.status, 'done', `existing, ${how}`);
    const holes = (c, id) => JSON.stringify(c.parts.find((p) => p.id === id).pins);
    for (const id of ['U1', 'R1', 'D1']) assert.equal(holes(again.circuit, id), holes(built.circuit, id), `${how}: ${id} keeps its holes`);
  }
});
