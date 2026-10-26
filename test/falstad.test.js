// The kit against Falstad's CircuitJS, and the export itself (src/sim/falstad.js).
//
// Comparison: each case in test/falstad/cases/ against what Falstad gave for its exact export
// (test/falstad/refs/, written by scripts/falstad.js): the DC operating point, or for the cases
// with a signal generator the transient from t = 0, sample by sample with Falstad's step. Offline: a case without a reference, or
// whose reference was run on another export (the exporter or a model changed), is skipped and
// says so; run it again in Falstad (scripts/falstad.js snippet, then save).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { caseNames, readCase, readRef, exportCase } from './falstad/cases.js';
import { simulate } from '../src/sim/index.js';
import { compile } from '../src/sim/compile.js';
import { createEngine } from '../src/sim/engine.js';
import { toFalstad } from '../src/sim/falstad.js';
import { escapeName } from '../src/sim/falstad-layout.js';

// Where the two simulators may differ, and why. Every other case must agree within 1 µV.
const EXACT = 1e-6;
const ALLOWED = {
  'mosfet-saturation': [0.08, "Falstad's text format has no channel-length modulation (λ = 0.01 /V here)"],
  'pot-zener': [0.08, "Falstad's Zener breakdown has another knee (both pass 5 mA at the same voltage)"],
  'rectifier-half-wave': [0.003, "Newton's tolerance at the diode: each simulator stops iterating at a slightly different point (1 mV of 10 V)"],
};

for (const name of caseNames()) {
  const ref = readRef(name);
  const { text } = exportCase(name);
  const skip = !ref ? 'no reference yet: run it in Falstad (scripts/falstad.js)' : ref.text !== text ? 'stale reference: the export changed, run it again in Falstad' : false;
  test(`falstad: ${name}`, { skip }, () => {
    assert.ok(ref.settled, 'Falstad had not settled');
    const [tolerance, why] = ALLOWED[name] ?? [EXACT, 'same models'];
    if (ref.times) {
      // A transient: the kit with Falstad's step, from t = 0, sample by sample.
      const kit = simulate(readCase(name), { analysis: 'transient', start: 'zero', stop: ref.times.at(-1), step: ref.step, points: 1e6 });
      assert.ok(kit.ok);
      for (const [node, values] of Object.entries(ref.nodes)) {
        values.forEach((v, i) => {
          const k = Math.round(ref.times[i] / ref.step);
          const diff = Math.abs(kit.nodes[node][k] - v);
          assert.ok(diff <= tolerance + EXACT * Math.abs(v), `${node} at ${ref.times[i]} s: kit ${kit.nodes[node][k]} V, Falstad ${v} V (${why})`);
        });
      }
      return;
    }
    const kit = simulate(readCase(name), { analysis: 'dc' });
    assert.ok(kit.ok);
    for (const [node, v] of Object.entries(ref.nodes)) {
      const diff = Math.abs(kit.nodes[node] - v);
      assert.ok(diff <= tolerance + EXACT * Math.abs(v), `${node}: kit ${kit.nodes[node]} V, Falstad ${v} V (${why})`);
    }
  });
}

const examples = readdirSync(new URL('../examples/', import.meta.url)).filter((f) => f.endsWith('.json'));
const exportExample = (file, options) => {
  const { program } = compile(JSON.parse(readFileSync(new URL(`../examples/${file}`, import.meta.url), 'utf8')));
  return program && toFalstad(program, { timeConstants: createEngine(program).timeConstants(), ...options });
};

test('falstad export: every example that simulates exports, labels escaped', () => {
  for (const file of examples) {
    const out = exportExample(file);
    if (!out) continue;
    assert.match(out.text, /^\$ 1 /, file);
    assert.ok(out.url.startsWith('https://www.falstad.com/circuit/circuitjs.html?cct='), file);
    assert.ok(!/ T\+$/m.test(out.text), `${file}: a label with a bare +`);
  }
  assert.equal(escapeName('T+ a b'), 'T\\p\\sa\\sb');
});

test('falstad export: equivalents and parts left out are noted', () => {
  const codes = (file) => exportExample(file).notes.map((n) => `${n.code}:${n.params.part ?? n.params.supply}`);
  assert.deepEqual(codes('led-resistor.json'), []);
  assert.deepEqual(codes('rectifier.json'), ['falstad.bridge:BR1']);
  const more = codes('more-parts.json');
  for (const c of ['falstad.battery:BT1', 'falstad.zener:D1', 'falstad.sensor:RT1', 'falstad.sensor:LDR1', 'falstad.buzzer:BZ1', 'falstad.missing:U1', 'falstad.missing:U2']) assert.ok(more.includes(c), c);
  assert.ok(!more.some((c) => c.endsWith(':J1')), 'header pins say nothing');
});

test('falstad export: exact keeps the small resistances, otherwise jumpers join their nets', () => {
  const plain = exportExample('led-resistor.json').text;
  const exact = exportExample('led-resistor.json', { exact: true }).text;
  assert.doesNotMatch(plain, / 0\.05$/m);
  assert.doesNotMatch(plain, / 10:f-j$/m, 'the jumper W1 makes 10:f-j part of T-');
  assert.match(exact, /^r \d+ \d+ \d+ \d+ 0 0\.05$/m);
});

// Elements by their first token, with their coordinates.
const elements = (text) => text.trim().split('\n').map((l) => l.split(' ')).filter((t) => /^[a-z]$|^\d+$/.test(t[0]) && t.length > 5).map((t) => ({ code: t[0], x1: +t[1], y1: +t[2], x2: +t[3], y2: +t[4], rest: t.slice(5) }));
const labelY = (els, name) => els.find((e) => e.code === '207' && e.rest[1] === name).y1;

test('falstad layout: a schematic, nets as rows by voltage, series parts in one column', () => {
  const els = elements(exportExample('led-resistor.json').text);
  const [v] = els.filter((e) => e.code === 'v');
  const [r] = els.filter((e) => e.code === 'r');
  const [led] = els.filter((e) => e.code === '162');
  assert.ok(labelY(els, 'T\\p') < labelY(els, '9:f-j') && labelY(els, '9:f-j') < labelY(els, 'T-'), 'highest voltage on top');
  assert.ok(v.x1 < r.x1, 'the supply first, on the left');
  assert.equal(r.x1, led.x1, 'R1 and D1 in series share a column');
  assert.equal(r.y2, led.y1, 'end to end');
  assert.ok(els.filter((e) => e.code === 'w').every((w) => w.x1 === w.x2 || w.y1 === w.y2), 'wires run straight');
  assert.equal(els.filter((e) => e.code === 'g').length, 1);
});

test('falstad layout: no wire of a row crosses an element in the transistor case', () => {
  const { program } = compile(readCase('bjt-active'));
  const els = elements(toFalstad(program).text);
  const rows = els.filter((e) => e.code === 'w' && e.y1 === e.y2);
  const upright = els.filter((e) => e.code !== 'w' && e.code !== '207' && e.code !== 'g' && e.x1 === e.x2);
  for (const w of rows) for (const e of upright) {
    const crosses = e.x1 > Math.min(w.x1, w.x2) && e.x1 < Math.max(w.x1, w.x2) && w.y1 > Math.min(e.y1, e.y2) && w.y1 < Math.max(e.y1, e.y2);
    assert.ok(!crosses, `${e.code} at x ${e.x1} crosses the row at y ${w.y1}`);
  }
});

test('falstad export: a current limit acting now is noted', () => {
  const circuit = JSON.parse(readFileSync(new URL('../examples/led-resistor.json', import.meta.url), 'utf8'));
  circuit.supplies[0].currentLimit = 0.001;
  const { program } = compile(circuit);
  const engine = createEngine(program);
  engine.start('dc');
  const out = toFalstad(program, { reading: engine.read() });
  assert.deepEqual(out.notes.map((n) => n.code), ['falstad.currentLimit']);
});
