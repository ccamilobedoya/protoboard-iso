// Acceptance tests for session S3 (timed digital sensors: the PIR module and the TTP223 touch
// module), written from the brief and the physics notes alone, before looking at any implementation.
// Each test carries the brief's item (C1 … C10) or the spec row it comes from.
//
// Time is driven the way test/engine.test.js, test/live.test.js and test/environment-acceptance.test.js
// do: an engine started at the DC point, stepped with advance(h), the inputs (`motion`, `touch`) moved
// at the given instants with engine.set('environment', field, value), the OUT pin read across a 10 kΩ
// load to ground. h = 10 ms everywhere (the brief: timers resolve to ≥ 10 ms steps).
//
// The module under test is imported inside each test where a missing module should fail only that test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCircuit, inspectCircuit, renderCircuit } from '../src/index.js';
import { simulate, compile, createEngine } from '../src/sim/index.js';
import { partLines } from '../src/sim/format.js';
import { buildCircuit } from '../src/circuit/build.js';
import { PART_TYPES } from '../src/parts/types/index.js';
import { catalogEntry, compactCatalog, formatCompactCatalog } from '../src/node/catalog.js';
import { RECIPES, expandRecipe } from '../src/recipes/index.js';
import { autoLayout } from '../src/layout.js';
import { symbolOf, insideOf } from '../src/parts/symbols.js';
import { t as translate } from '../src/i18n/index.js';
import { tourIssues } from '../src/tour.js';
import { timelineCircuit } from '../scripts/render-frames.js';
import { formatIssue } from '../src/index.js';

const tours = fileURLToPath(new URL('../examples/tours/', import.meta.url));
const H = 0.01;
const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} vs ${expected} (± ${tol})`);
const codes = (issues) => issues.map((i) => i.code);

// ---------------------------------------------------------------- the bench

// One sensor module standing on f10 f11 f12 in the order of its pins as the catalog lists them. The
// wires go to the far strip (row j), away from the body of a module that stands tall and wide over its
// pins (checked with the AMS1117 standing in the same holes), and the load sits well to the side:
// VCC to the top + rail, GND to the top − rail, the output pin to a wire that ends at `load` ohms to
// ground (or, with `pullup`, to the supply). `slider` adds an unrelated 1 kΩ resistor across the
// supply (R2), which has a control of its own.
function bench(type, own = {}, { volts = 5, environment, load = '10k', pullup = false, slider = false } = {}) {
  const entry = catalogEntry(type);
  assert.ok(entry, `type ${type} is in the catalog`);
  const pins = entry.pins;
  const col = (name) => 10 + pins.indexOf(name);
  const outName = pins.find((n) => ['OUT', 'SIG', 'I/O'].includes(n));
  assert.ok(outName && pins.includes('VCC') && pins.includes('GND') && pins.length === 3, `${type}: pins ${pins.join(' ')}`);
  return {
    supplies: [{ id: 'V1', voltage: volts }],
    ...(environment && { environment }),
    parts: [
      { id: 'U1', type, pins: pins.map((_, i) => `f${10 + i}`), ...own },
      { id: 'W1', type: 'wire', color: 'red', pins: [`T+${col('VCC')}`, `j${col('VCC')}`] },
      { id: 'W2', type: 'wire', color: 'black', pins: [`T-${col('GND')}`, `j${col('GND')}`] },
      { id: 'W6', type: 'wire', color: 'yellow', pins: [`j${col(outName)}`, 'j24'] },
      { id: 'R1', type: 'resistor', value: load, pins: ['h24', 'h28'] },
      { id: 'W3', type: 'wire', color: pullup ? 'red' : 'black', pins: [pullup ? 'T+28' : 'T-28', 'j28'] },
      ...(slider
        ? [
            { id: 'R2', type: 'resistor', value: '1k', pins: ['h34', 'h38'] },
            { id: 'W4', type: 'wire', color: 'red', pins: ['T+34', 'j34'] },
            { id: 'W5', type: 'wire', color: 'black', pins: ['T-39', 'j38'] },
          ]
        : []),
    ],
  };
}
const pir = (own = {}, options = {}) => bench('pir-sensor', { warmup: 0, ...own }, { environment: { motion: 0 }, ...options });
const touch = (own = {}, options = {}) => bench('touch-sensor', own, { volts: 3.3, environment: { touch: 0 }, ...options });

// Plays `sets` ([t, id, field, value]) and reports the load's voltage at each instant in `at`.
// Returns { at: { t: volts }, trace: [[t, volts]], engine }.
function play(circuit, { sets = [], at = [], trace = false, each } = {}) {
  const compiled = compile(circuit);
  assert.ok(compiled.program, `compiles: ${JSON.stringify(compiled.issues)}`);
  const engine = createEngine(compiled.program);
  assert.ok(engine.start('dc', H), 'starts at the DC point');
  const todo = [...sets].sort((a, b) => a[0] - b[0]);
  const want = [...at].sort((a, b) => a - b);
  const got = {};
  const series = [];
  const volts = () => engine.read().parts.R1.voltage;
  for (;;) {
    const now = engine.time;
    while (todo.length && todo[0][0] <= now + 1e-9) {
      const [, id, field, value] = todo.shift();
      assert.ok(engine.set(id, field, value), `set ${id}.${field} = ${value} at ${now}`);
    }
    while (want.length && want[0] <= now + 1e-9) got[want.shift()] = volts();
    if (trace) series.push([engine.time, volts()]);
    each?.(engine, now);
    if (!want.length && !todo.length) break;
    assert.ok(engine.advance(H), `stalled at t = ${engine.time} s`);
  }
  return { at: got, trace: series, engine };
}
const isHigh = (v) => v > 3.3 * 0.5;

// ---------------------------------------------------------------- C1 · the catalog

test('C1: both types are in the catalog with their pins, family sensor', () => {
  const pirType = PART_TYPES['pir-sensor'];
  const touchType = PART_TYPES['touch-sensor'];
  assert.ok(pirType, 'type pir-sensor');
  assert.ok(touchType, 'type touch-sensor');
  assert.equal(pirType.family, 'sensor');
  assert.equal(touchType.family, 'sensor');
  const p = catalogEntry('pir-sensor');
  const q = catalogEntry('touch-sensor');
  assert.ok(p && q, 'both have a catalog entry');
  assert.deepEqual(p.pins, ['VCC', 'OUT', 'GND'], 'the HC-SR501 as printed');
  assert.equal(q.pins.length, 3);
  assert.ok(q.pins.includes('VCC') && q.pins.includes('GND'));
  assert.ok(q.pins.includes('SIG') || q.pins.includes('I/O'), `the signal pin is SIG or I/O: ${q.pins.join(' ')}`);
});

test('C1: the compact catalog lists both under the family sensor, in both languages', () => {
  for (const lang of ['en', 'es']) {
    const lines = formatCompactCatalog(compactCatalog(lang), lang).split('\n');
    const start = lines.indexOf('sensor');
    assert.ok(start >= 0, `${lang}: block sensor`);
    let end = start + 1;
    while (end < lines.length && lines[end].startsWith('  ')) end++;
    const listed = lines.slice(start + 1, end).map((l) => l.trim().split(':')[0]);
    assert.ok(listed.includes('pir-sensor'), `${lang}: pir-sensor under sensor (${listed.join(', ')})`);
    assert.ok(listed.includes('touch-sensor'), `${lang}: touch-sensor under sensor`);
  }
});

// ---------------------------------------------------------------- C2 · both views

// The render check uses the recipe's own laid-out circuit (the orchestrator's arbitration: a hand bench
// puts the wires behind a tall standing module, which hides them in the front view; `layout` places
// them so they are seen, as a lesson circuit would).
for (const [type, recipe, circuit] of [['pir-sensor', 'pir-lamp', () => pir()], ['touch-sensor', 'touch-toggle-led', () => touch()]]) {
  test(`C2: ${type} renders in both views and inspect reports no error or warning`, () => {
    // Arbitration (orchestrator): a tall standing module shades what sits behind it in one of the two
    // views, which `inspect` reports as PART_HIDDEN; a learner flips the board. So: no error in either
    // view, and no part left hidden in BOTH views (each part at least half visible in one of them; `visible` is a fraction).
    // Keeping parts out of a tall module's shade is a pending improvement of `layout` (roadmap).
    const c = layoutOf(recipe).circuit;
    const seen = new Map();
    for (const view of ['front', 'back']) {
      const drawn = renderCircuit(c, { view });
      assert.ok(drawn.svg && drawn.svg.length > 1000, `${view}: an image`);
      assert.deepEqual(drawn.issues.filter((i) => i.severity === 'error'), [], `${view}: render issues`);
      const report = inspectCircuit(c, { view });
      const id = c.parts.find((p) => p.type === type).id;
      const u1 = report.parts.find((p) => p.id === id);
      assert.ok(u1, `${view}: ${id} in the report`);
      assert.ok(u1.visible > 0, `${view}: U1 is seen`);
      assert.equal(u1.pins.length, 3);
      const bad = report.problems.filter((p) => (p.severity === 'error' || p.severity === 'warning') && p.code !== 'PART_HIDDEN');
      assert.deepEqual(bad, [], `${view}: inspect problems`);
      for (const p of report.parts) seen.set(p.id, Math.max(seen.get(p.id) ?? 0, p.visible));
    }
    for (const [id, visible] of seen) assert.ok(visible >= 0.5, `${id} is hidden in both views (${Math.round(visible * 100)} % at best)`);
  });

  test(`C2: ${type} checks clean (no error, no warning) on the bench`, () => {
    const bad = checkCircuit(circuit()).issues.filter((i) => i.severity === 'error' || i.severity === 'warning');
    assert.deepEqual(codes(bad), []);
  });
}

// ---------------------------------------------------------------- C3 · the PIR, retriggerable

test('C3: PIR, warmup 0, mode H, delay 5: OUT low at rest; high 1 s after a motion; still high at 5.5 s; low by 6.5 s', () => {
  const sets = [[1, 'environment', 'motion', 1], [1.5, 'environment', 'motion', 0]];
  const { at } = play(pir({ mode: 'H', delay: 5 }), { sets, at: [0, 0.5, 2, 5.5, 6.5] });
  near(at[0], 0, 0.05, 'OUT at t = 0');
  near(at[0.5], 0, 0.05, 'OUT at rest at 0.5 s');
  near(at[2], 3.3, 0.2, 'OUT at 2 s (3.3 V behind its resistance, 10 kΩ load)');
  near(at[5.5], 3.3, 0.2, 'OUT still high at 5.5 s');
  near(at[6.5], 0, 0.2, 'OUT low again by 6.5 s');
});

test('C3: PIR does not re-trigger during the 2.5 s blocking (motion 1 at 7 s: still low at 7.5 s)', () => {
  const sets = [[1, 'environment', 'motion', 1], [1.5, 'environment', 'motion', 0], [7, 'environment', 'motion', 1]];
  const { at } = play(pir({ mode: 'H', delay: 5 }), { sets, at: [6.5, 7.5] });
  near(at[6.5], 0, 0.2, 'low by 6.5 s');
  near(at[7.5], 0, 0.2, 'blocked at 7.5 s');
});

test('C3 (spec §9 row 34): PIR motion 1 s long: OUT from the moment of motion until 5 s after the last motion, ± 0.1 s', () => {
  const sets = [[40, 'environment', 'motion', 1], [41, 'environment', 'motion', 0]];
  const { trace } = play(pir({ mode: 'H', delay: 5 }), { sets, at: [50], trace: true });
  const rise = trace.find(([, v]) => isHigh(v))?.[0];
  const fall = trace.find(([time, v]) => time > 41 && !isHigh(v))?.[0];
  near(rise, 40, 0.1, 'OUT rises');
  near(fall, 46, 0.1, 'OUT falls');
});

test('C3 (spec §9 row 35): H mode, a second motion at 43 s resets the timer: OUT high from 40 s to 49 s, ± 0.1 s', () => {
  const sets = [[40, 'environment', 'motion', 1], [41, 'environment', 'motion', 0], [43, 'environment', 'motion', 1], [44, 'environment', 'motion', 0]];
  const { trace } = play(pir({ mode: 'H', delay: 5 }), { sets, at: [55], trace: true });
  near(trace.find(([, v]) => isHigh(v))?.[0], 40, 0.1, 'rise');
  near(trace.find(([time, v]) => time > 44 && !isHigh(v))?.[0], 49, 0.1, 'fall');
});

test('C3 (spec §9 row 36): L mode, the same stimulus: OUT high from 40 s to 45 s, the 43 s motion ignored', () => {
  const sets = [[40, 'environment', 'motion', 1], [41, 'environment', 'motion', 0], [43, 'environment', 'motion', 1], [44, 'environment', 'motion', 0]];
  const { trace } = play(pir({ mode: 'L', delay: 5 }), { sets, at: [55], trace: true });
  near(trace.find(([, v]) => isHigh(v))?.[0], 40, 0.1, 'rise');
  near(trace.find(([time, v]) => time > 41 && !isHigh(v))?.[0], 45, 0.1, 'fall');
});

test('C3 (spec §9 row 38): PIR OUT loaded with 3.3 kΩ reads 2.87 V (3.3 V behind 500 Ω), ± 0.1 V', () => {
  const sets = [[1, 'environment', 'motion', 1]];
  const { at } = play(pir({ delay: 5 }, { load: '3.3k' }), { sets, at: [2] });
  near(at[2], 2.87, 0.1, 'OUT with 3.3 kΩ');
});

test('C3 (spec §9 row 39): PIR idle at 5 V draws about 65 µA from the supply, ± 15 µA', () => {
  const { engine } = play(pir({}, { load: '10k' }), { at: [1] });
  near(Math.abs(engine.read().supplies.V1.current), 65e-6, 15e-6, 'supply current');
});

// ---------------------------------------------------------------- C4 · mode L with motion held

test('C4: mode L with motion held at 1: OUT cycles (high ≈ Tx, low ≈ 2.5 s); a fall and a rise within 20 s', () => {
  const sets = [[1, 'environment', 'motion', 1]];
  const { trace } = play(pir({ mode: 'L', delay: 5 }), { sets, at: [20], trace: true });
  const edges = [];
  for (let k = 1; k < trace.length; k++) {
    const [a, b] = [isHigh(trace[k - 1][1]), isHigh(trace[k][1])];
    if (a !== b) edges.push([trace[k][0], b ? 'rise' : 'fall']);
  }
  assert.deepEqual(edges.slice(0, 3).map((e) => e[1]), ['rise', 'fall', 'rise'], `edges: ${JSON.stringify(edges)}`);
  // The times: spec §9 row 37 (± 0.1 s): high 5 s, low 2.5 s.
  near(edges[1][0] - edges[0][0], 5, 0.1, 'high lasts Tx');
  near(edges[2][0] - edges[1][0], 2.5, 0.1, 'low lasts 2.5 s');
});

// ---------------------------------------------------------------- C5 · warm-up

test('C5: PIR with the default warm-up (30 s) gives no output for a motion at 10 s', () => {
  const sets = [[10, 'environment', 'motion', 1]];
  const { at } = play(bench('pir-sensor', { delay: 5 }, { environment: { motion: 0 } }), { sets, at: [0, 5, 10.5, 15, 29] });
  for (const [time, v] of Object.entries(at)) near(v, 0, 0.05, `OUT at ${time} s`);
});

test('C5 (spec §9 row 33): ... and with the motion still 1, OUT rises at 30 s, ± 0.1 s', () => {
  const sets = [[10, 'environment', 'motion', 1]];
  const { at } = play(bench('pir-sensor', { delay: 5 }, { environment: { motion: 0 } }), { sets, at: [29.9, 30.2] });
  near(at[29.9], 0, 0.05, 'still low at 29.9 s');
  near(at[30.2], 3.3, 0.2, 'high at 30.2 s');
});

test('C5: warmup 0 skips the wait (the motion at 1 s is seen)', () => {
  const sets = [[1, 'environment', 'motion', 1]];
  const { at } = play(pir({ delay: 5 }), { sets, at: [2] });
  near(at[2], 3.3, 0.2, 'no warm-up with warmup 0');
});

// ---------------------------------------------------------------- C6 · the engine carries the device state

test('C6: a slider on an unrelated resistor at 3 s (OUT high) does not reset the PIR: high at 3.5 s, low by 6.5 s', () => {
  const circuit = pir({ mode: 'H', delay: 5 }, { slider: true });
  const sets = [[1, 'environment', 'motion', 1], [1.5, 'environment', 'motion', 0], [3, 'R2', 'resistance', 470]];
  const { at, engine } = play(circuit, { sets, at: [2.9, 3.5, 6.5] });
  assert.ok(engine.controls().some((c) => c.id === 'R2' && c.field === 'resistance'), 'R2 has a resistance control');
  near(at[2.9], 3.3, 0.2, 'high before the slider');
  near(at[3.5], 3.3, 0.2, 'still high after the slider (not reset to idle)');
  near(at[6.5], 0, 0.2, 'low by 6.5 s: the timer was not restarted either');
});

test('C6: the warm-up clock survives a slider too (default warm-up, motion held, slider at 20 s: OUT high by 31 s)', () => {
  const circuit = bench('pir-sensor', { delay: 5 }, { environment: { motion: 0 }, slider: true });
  const sets = [[5, 'environment', 'motion', 1], [20, 'R2', 'resistance', 470]];
  const { at } = play(circuit, { sets, at: [29.5, 31] });
  near(at[29.5], 0, 0.05, 'still warming up at 29.5 s');
  near(at[31], 3.3, 0.2, 'out of warm-up at 30 s counted from power on, not from the slider');
});

test('C6: the engine step hint of a PIR never asks for steps finer than 10 ms', () => {
  const { engine } = play(pir({ delay: 5 }), { sets: [[1, 'environment', 'motion', 1]], at: [2] });
  const hint = engine.stepHint();
  assert.ok(hint === null || hint >= 0.01 - 1e-12, `stepHint ${hint}`);
});

// ---------------------------------------------------------------- C7 · the touch module

test('C7: TTP223 momentary: OUT follows touch within 0.3 s (touch at 1 s, released at 3 s)', () => {
  const sets = [[1, 'environment', 'touch', 1], [3, 'environment', 'touch', 0]];
  const { at } = play(touch({ mode: 'momentary' }), { sets, at: [0.9, 1.3, 2.9, 3.3] });
  assert.ok(at[0.9] < 0.3, `low before the touch: ${at[0.9]}`);
  assert.ok(at[1.3] > 3.3 * 0.8, `high 0.3 s after the touch: ${at[1.3]}`);
  assert.ok(at[2.9] > 3.3 * 0.8, `still high while touched: ${at[2.9]}`);
  assert.ok(at[3.3] < 0.3, `low 0.3 s after the release: ${at[3.3]}`);
});

test('C7: momentary is the default mode and active high', () => {
  const sets = [[1, 'environment', 'touch', 1]];
  const { at } = play(touch(), { sets, at: [0.9, 1.5] });
  assert.ok(at[0.9] < 0.3 && at[1.5] > 3.3 * 0.8, `${at[0.9]} → ${at[1.5]}`);
});

test('C7: TTP223 toggle: each touch flips the output; two touches return to the start', () => {
  const sets = [[1, 'environment', 'touch', 1], [1.5, 'environment', 'touch', 0], [3, 'environment', 'touch', 1], [3.5, 'environment', 'touch', 0], [5, 'environment', 'touch', 1], [5.5, 'environment', 'touch', 0]];
  const { at } = play(touch({ mode: 'toggle' }), { sets, at: [0.9, 2.5, 4.5, 6.5] });
  assert.ok(at[0.9] < 0.3, `start low: ${at[0.9]}`);
  assert.ok(at[2.5] > 3.3 * 0.8, `high after touch 1: ${at[2.5]}`);
  assert.ok(at[4.5] < 0.3, `low after touch 2 (back to the start): ${at[4.5]}`);
  assert.ok(at[6.5] > 3.3 * 0.8, `high after touch 3: ${at[6.5]}`);
});

test('C7: toggle holds its level when the finger is released (the release does nothing)', () => {
  const sets = [[1, 'environment', 'touch', 1], [1.5, 'environment', 'touch', 0]];
  const { at } = play(touch({ mode: 'toggle' }), { sets, at: [1.4, 1.9, 4] });
  assert.ok(at[1.9] > 3.3 * 0.8 && at[4] > 3.3 * 0.8, `${at[1.9]}, ${at[4]}`);
});

test('C7: the first 0.5 s after power ignore touch (momentary: a touch from 0.1 to 0.4 s never shows)', () => {
  const sets = [[0.1, 'environment', 'touch', 1], [0.4, 'environment', 'touch', 0]];
  const { trace } = play(touch({ mode: 'momentary' }), { sets, at: [1.5], trace: true });
  const peak = Math.max(...trace.map(([, v]) => v));
  assert.ok(peak < 0.3, `OUT never rose: peak ${peak}`);
});

test('C7: the first 0.5 s ignore touch in toggle mode too (no flip), and a touch afterwards works', () => {
  const sets = [[0.1, 'environment', 'touch', 1], [0.4, 'environment', 'touch', 0], [1, 'environment', 'touch', 1], [1.5, 'environment', 'touch', 0]];
  const { at } = play(touch({ mode: 'toggle' }), { sets, at: [0.9, 2.5] });
  assert.ok(at[0.9] < 0.3, `no flip from the early touch: ${at[0.9]}`);
  assert.ok(at[2.5] > 3.3 * 0.8, `the touch at 1 s flips it: ${at[2.5]}`);
});

test('C7: a touch after the first 0.5 s is taken (momentary, touch at 0.6 s)', () => {
  const sets = [[0.6, 'environment', 'touch', 1]];
  const { at } = play(touch(), { sets, at: [1.0] });
  assert.ok(at[1.0] > 3.3 * 0.8, `${at[1.0]}`);
});

// ---------------------------------------------------------------- C8 · stresses

const stresses = (engine) => Object.values(engine.stresses(engine.read())).flat();

test('C8: PIR supply at 24 V is a stress (and 5 V is not)', () => {
  const ok = play(pir(), { sets: [[1, 'environment', 'motion', 1]], at: [2] });
  assert.deepEqual(stresses(ok.engine).filter((s) => s.ratio > 1), [], '5 V: nothing exceeded');
  const high = play(pir({}, { volts: 24 }), { sets: [[1, 'environment', 'motion', 1]], at: [2] });
  const over = stresses(high.engine).filter((s) => s.ratio > 1);
  assert.ok(over.length > 0, `24 V: something exceeded, got ${JSON.stringify(stresses(high.engine))}`);
  // Spec §3.1: over 20 V is SIM_IC_SUPPLY.
  const sim = simulate(pir({}, { volts: 24 }));
  assert.ok(codes(sim.issues).includes('SIM_IC_SUPPLY'), `issues: ${JSON.stringify(sim.issues)}`);
});

test('C8: PIR OUT loaded with 100 Ω is an over-current (and 10 kΩ is not)', () => {
  const light = play(pir(), { sets: [[1, 'environment', 'motion', 1]], at: [2] });
  assert.deepEqual(stresses(light.engine).filter((s) => s.ratio > 1), [], '10 kΩ: nothing exceeded');
  const heavy = play(pir({}, { load: '100' }), { sets: [[1, 'environment', 'motion', 1]], at: [2] });
  const over = stresses(heavy.engine).filter((s) => s.ratio > 1);
  assert.ok(over.some((s) => s.quantity === 'current'), `100 Ω: ${JSON.stringify(stresses(heavy.engine))}`);
});

test('C8 (spec §3.1): a PIR on less than 4.5 V says so with SIM_MODULE_LOW_SUPPLY', () => {
  const sim = simulate(pir({}, { volts: 3 }));
  assert.ok(codes(sim.issues).includes('SIM_MODULE_LOW_SUPPLY'), `issues: ${JSON.stringify(sim.issues)}`);
  const fine = simulate(pir({}, { volts: 5 }));
  assert.ok(!codes(fine.issues).includes('SIM_MODULE_LOW_SUPPLY'));
});

// ---------------------------------------------------------------- the cards

test('cards: the PIR card says the phase and a time in words, in both languages, and it changes with the phase', () => {
  const circuit = bench('pir-sensor', { delay: 5 }, { environment: { motion: 0 } });
  const lines = {};
  const { engine } = play(circuit, {
    sets: [[40, 'environment', 'motion', 1]],
    at: [5, 41],
    each: (e, now) => {
      for (const t of [5, 41]) if (Math.abs(now - t) < 1e-9) for (const lang of ['en', 'es']) lines[`${lang}${t}`] = partLines(e.read().parts.U1, lang).map((l) => l.text).join(' | ');
    },
  });
  assert.ok(engine);
  for (const lang of ['en', 'es']) {
    const [warm, high] = [lines[`${lang}5`], lines[`${lang}41`]];
    assert.ok(warm && high, `${lang}: lines`);
    assert.notEqual(warm, high, `${lang}: the phase shows`);
    assert.doesNotMatch(warm + high, /\{\w+\}|undefined|NaN/, `${lang}: placeholders filled`);
    assert.match(warm, /\d/, `${lang}: warm-up shows a number of seconds`);
    assert.match(high, /\d/, `${lang}: high shows the time left`);
  }
  assert.notEqual(lines.en5, lines.es5, 'translated');
});

test('cards: the touch card has text in both languages and says the mode/state', () => {
  const lines = {};
  play(touch({ mode: 'toggle' }), {
    sets: [[1, 'environment', 'touch', 1]],
    at: [2],
    each: (e, now) => {
      if (Math.abs(now - 2) < 1e-9) for (const lang of ['en', 'es']) lines[lang] = partLines(e.read().parts.U1, lang).map((l) => l.text).join(' | ');
    },
  });
  assert.ok(lines.en && lines.es && lines.en !== lines.es);
  assert.doesNotMatch(lines.en + lines.es, /\{\w+\}|undefined|NaN/);
});

// ---------------------------------------------------------------- C9 · recipes

const RECIPE_NAMES = ['pir-lamp', 'pir-uno', 'touch-toggle-led', 'touch-uno'];
const why = (r) => [...r.problems, ...r.review.blocking].map((b) => formatIssue(b, 'en')).join('\n') + JSON.stringify(r.check);
const layoutOf = (name) => {
  const { spec, problems } = expandRecipe(name);
  assert.deepEqual(problems, [], `${name}: ${JSON.stringify(problems)}`);
  return autoLayout(spec);
};

test('C9: the four recipes exist, together and in order after the earlier recipes, with a title and a lesson in both languages', () => {
  // Arbitration (orchestrator): later sessions append their own recipes after these, so "at the end"
  // became "contiguous, in this order, after the recipes that existed before S3".
  const names = Object.keys(RECIPES);
  for (const name of RECIPE_NAMES) assert.ok(names.includes(name), `recipe ${name}`);
  const first = names.indexOf(RECIPE_NAMES[0]);
  assert.ok(first > names.indexOf('motor-npn'), 'after the recipes that existed before');
  assert.deepEqual(names.slice(first, first + 4), RECIPE_NAMES, 'contiguous, in this order');
  for (const name of RECIPE_NAMES) for (const lang of ['en', 'es']) {
    assert.ok(RECIPES[name].title?.[lang], `${name}: title ${lang}`);
    assert.ok(RECIPES[name].teaches?.[lang], `${name}: teaches ${lang}`);
  }
});

for (const name of RECIPE_NAMES) {
  test(`C9: recipe ${name} is DONE, clean, and simulates without stressing a part`, () => {
    const r = layoutOf(name);
    assert.equal(r.status, 'done', why(r));
    assert.deepEqual(r.circuit.spec.recipe, { name });
    const bad = checkCircuit(r.circuit).issues.filter((i) => i.severity === 'error' || i.severity === 'warning');
    assert.deepEqual(codes(bad), [], name);
    const s = simulate(r.circuit);
    assert.ok(s.ok, `${name}: ${JSON.stringify(s.issues)}`);
    const over = Object.entries(s.parts).flatMap(([id, p]) => (p.stress ?? []).filter((x) => x.level !== 'fine').map((x) => `${id} ${x.quantity} ${x.level}`));
    assert.deepEqual(over, [], name);
  });

  test(`C9: recipe ${name} carries an environment and a controls panel for its input`, () => {
    const { circuit } = layoutOf(name);
    const field = name.startsWith('pir') ? 'motion' : 'touch';
    assert.ok(circuit.environment && typeof circuit.environment === 'object', 'environment');
    assert.ok(field in circuit.environment, `environment names ${field}`);
    const controls = circuit.page?.controls;
    assert.ok(Array.isArray(controls) && controls.length > 0, 'page.controls');
    assert.ok(controls.some((c) => c.environment === field), `a control for the environment field ${field}`);
  });
}

test('C9: pir-lamp and pir-uno use the PIR; the lamp is a PIR → NPN → LED on 5 V', () => {
  for (const name of ['pir-lamp', 'pir-uno']) assert.ok(layoutOf(name).circuit.parts.some((p) => p.type === 'pir-sensor'), name);
  const lamp = layoutOf('pir-lamp').circuit;
  assert.ok(lamp.parts.some((p) => p.type === 'bjt'), 'an NPN');
  assert.ok(lamp.parts.some((p) => p.type === 'led'), 'an LED');
  assert.equal(lamp.supplies[0].voltage, 5);
});

test('C9: touch-toggle-led is a TTP223 in toggle mode, on 3.3 V, with an LED directly from its I/O pin through a resistor', () => {
  const circuit = layoutOf('touch-toggle-led').circuit;
  const sensor = circuit.parts.find((p) => p.type === 'touch-sensor');
  assert.ok(sensor, 'a touch-sensor');
  assert.equal(sensor.mode, 'toggle');
  assert.ok(circuit.parts.some((p) => p.type === 'led'));
  // 3.3 V from a bench supply or from an AMS1117 module.
  const bench33 = circuit.supplies.some((s) => Math.abs(s.voltage - 3.3) < 1e-9);
  const regulated = circuit.parts.some((p) => p.type === 'regulator' && /AMS1117/i.test(p.part ?? ''));
  assert.ok(bench33 || regulated, '3.3 V');
});

test('C9: pir-uno and touch-uno programs print what the brief says (MOTION with millis; TOUCH / RELEASE)', () => {
  const programOf = (name) => layoutOf(name).circuit.parts.find((p) => p.part === 'UNO')?.program ?? '';
  const motion = programOf('pir-uno');
  assert.match(motion, /MOTION/);
  assert.match(motion, /millis\s*\(/);
  const tch = programOf('touch-uno');
  assert.match(tch, /TOUCH/);
  assert.match(tch, /RELEASE/);
});

test('C9: pir-lamp reacts: the lamp is off at rest and on after a motion (within 40 s of simulated time)', () => {
  const { circuit } = layoutOf('pir-lamp');
  const led = circuit.parts.find((p) => p.type === 'led').id;
  const engine = createEngine(compile(circuit).program);
  assert.ok(engine.start('dc', H));
  const current = () => Math.abs(engine.read().parts[led].current);
  for (let k = 0; k < 200; k++) assert.ok(engine.advance(H));
  assert.ok(current() < 1e-4, `lamp off at rest: ${current()} A`);
  assert.ok(engine.set('environment', 'motion', 1));
  let lit = false;
  while (engine.time < 40) {
    assert.ok(engine.advance(H));
    if (current() > 1e-3) lit = true;
  }
  assert.ok(lit, 'the lamp lit within 40 s of a motion');
});

test('C9: touch-toggle-led: a touch lights the LED, a second one puts it out, and the I/O pin stays within 4 mA', () => {
  const { circuit } = layoutOf('touch-toggle-led');
  const led = circuit.parts.find((p) => p.type === 'led').id;
  const engine = createEngine(compile(circuit).program);
  assert.ok(engine.start('dc', H));
  const current = () => Math.abs(engine.read().parts[led].current);
  const until = (t) => {
    while (engine.time < t - 1e-9) assert.ok(engine.advance(H));
  };
  let peak = 0;
  const watch = (t) => {
    while (engine.time < t - 1e-9) {
      assert.ok(engine.advance(H));
      peak = Math.max(peak, current());
    }
  };
  until(1);
  assert.ok(current() < 1e-4, `off at rest: ${current()}`);
  assert.ok(engine.set('environment', 'touch', 1));
  watch(1.5);
  assert.ok(engine.set('environment', 'touch', 0));
  watch(2.5);
  assert.ok(current() > 5e-4, `lit after one touch: ${current()} A`);
  assert.ok(peak <= 4e-3, `the LED is fed from the I/O pin: ${peak} A is over its 4 mA source spec`);
  assert.ok(engine.set('environment', 'touch', 1));
  watch(3.5);
  assert.ok(engine.set('environment', 'touch', 0));
  watch(4.5);
  assert.ok(current() < 1e-4, `out after the second touch: ${current()} A`);
});

// ---------------------------------------------------------------- C10 · up close, catalog budget, tours

const lookFor = { 'pir-sensor': () => pir(), 'touch-sensor': () => touch() };

for (const type of ['pir-sensor', 'touch-sensor']) {
  test(`C10: ${type} has everything for its view up close (symbol, mark, inside view, drawer, legend, pin texts in both languages)`, () => {
    const figure = readFileSync(new URL('../src/page/client/figure.js', import.meta.url), 'utf8');
    const legends = readFileSync(new URL('../src/page/client/focus-view.js', import.meta.url), 'utf8');
    const both = (key) => ['en', 'es'].every((lang) => translate(lang, key) !== key);
    const p = buildCircuit(lookFor[type]()).parts.find((x) => x.id === 'U1');
    assert.equal(p.type, type);
    for (const n of p.pinNames) assert.ok(both(`pin.role.${p.raw?.part}.${n}`) || both(`pin.role.${type}.${n}`), `the text of pin ${n} (pin.role.*) in every language`);
    const symbol = symbolOf(p);
    assert.ok(symbol, 'a symbol');
    for (const n of p.pinNames) assert.ok(symbol.ids?.[n] && symbol.pins[n], `the symbol's terminal and letter for pin ${n}`);
    assert.ok(p.built?.mark, "the package's orientation mark");
    const inside = insideOf(p);
    assert.ok(inside, 'an inside view');
    assert.match(figure, new RegExp(`\\n  ${inside.kind}\\(g, r, data`), 'its drawer in figure.js INSIDE');
    const legend = legends.match(new RegExp(`\\n  ${inside.kind}: \\[(.*)\\],`))?.[1];
    assert.ok(legend, 'its legend in focus-view.js LEGENDS');
    for (const [, key] of legend.matchAll(/\['[a-z]*', '([a-z]+)'\]/g)) assert.ok(both(`page.tour.legend.${inside.kind}.${key}`), `legend line ${key} in every language`);
  });
}

test('C10: the compact catalog stays within 4600 characters', () => {
  const text = formatCompactCatalog(compactCatalog('en'), 'en');
  assert.ok(text.length <= 4600, `${text.length} characters`);
});

for (const [name, field] of [['pir-lamp', 'motion'], ['touch-toggle-led', 'touch']]) {
  test(`C10: tour ${name}.json exists, plays its recipe without an issue, is in Spanish and ends within 30 s`, () => {
    const file = join(tours, `${name}.json`);
    assert.ok(existsSync(file), `examples/tours/${name}.json`);
    const timeline = JSON.parse(readFileSync(file, 'utf8'));
    const circuit = timelineCircuit(file, timeline);
    assert.deepEqual(tourIssues({ ...circuit, page: { ...circuit.page, tour: timeline } }), [], name);
    const steps = timeline.steps;
    const captions = steps.filter((s) => s.do === 'caption');
    assert.ok(captions.length > 0, 'captions');
    for (const s of captions) assert.ok(s.text?.es && s.text?.en, `step at ${s.at}: es and en captions`);
    assert.ok(Math.max(...steps.map((s) => s.at)) <= 30000, 'no step after 30 s');
    assert.ok(steps.some((s) => s.do === 'gauge' && s.environment === field && s.on === true), `a gauge on ${field}`);
    const sets = steps.filter((s) => s.do === 'set' && s.environment === field);
    assert.ok(sets.some((s) => s.value === 1 || s.value === true), `${field} set on`);
    assert.ok(sets.some((s) => s.value === 0 || s.value === false), `${field} set off`);
  });
}
