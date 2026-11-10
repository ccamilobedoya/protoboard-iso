// Acceptance tests for session S7a (the rotary encoder as the KY-040 module), written from the brief
// (R1 … R12) and the physics notes (§14, rows 82–86, 88, 89) alone, before looking at any implementation.
// Each test carries the brief's item id.
//
// How time is driven: an engine started at the DC point, stepped with advance(h) where h is what the
// engine asks for (engine.stepHint(), re-read before every step) capped at STEP_CAP = 0.25 ms (0.25 ms
// when the engine asks for nothing). CLK and DT are read from the part's own pins at every step. An edge
// is a crossing of 2.5 V between two consecutive samples, timed at the later sample. Times are measured
// from the engine time at which the angle was set.
//
// The module under test is looked up inside each test, so a missing module fails only that test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCircuit, inspectCircuit, renderCircuit, formatIssue } from '../src/index.js';
import { simulate, compile, createEngine } from '../src/sim/index.js';
import { buildCircuit } from '../src/circuit/build.js';
import { PART_TYPES } from '../src/parts/types/index.js';
import { catalogEntry, compactCatalog, formatCompactCatalog } from '../src/node/catalog.js';
import { RECIPES, expandRecipe } from '../src/recipes/index.js';
import { autoLayout } from '../src/layout.js';
import { symbolOf, insideOf } from '../src/parts/symbols.js';
import { t as translate } from '../src/i18n/index.js';
import { tourIssues } from '../src/tour.js';
import { timelineCircuit } from '../scripts/render-frames.js';

const tours = fileURLToPath(new URL('../examples/tours/', import.meta.url));
const STEP_CAP = 0.00025;
const HIGH_LEVEL = 2.5;
const TYPE = 'rotary-encoder';
const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} vs ${expected} (± ${tol})`);
const codes = (issues) => issues.map((i) => i.code);

// ---------------------------------------------------------------- the benches

// A KY-040 standing on f10 … f14 in the order the catalog lists its pins (CLK DT SW + GND). `+` goes
// to the top + rail and GND to the top − rail through wires on the far strip (row j); nothing else
// on CLK, DT or SW. `plus: false` leaves `+` unconnected. `slider` adds an unrelated 1 kΩ resistor
// across the supply (R2) far to the right; `led` adds 5 V → resistor → red LED → CLK (the LED and the
// resistor stand on columns 20 to 28, away from the module's shade).
function bench(own = {}, { environment = { angle: 0 }, plus = true, slider = false, led = null } = {}) {
  const entry = catalogEntry(TYPE);
  assert.ok(entry, `type ${TYPE} is in the catalog`);
  const col = (name) => 10 + entry.pins.indexOf(name);
  return {
    supplies: [{ id: 'V1', voltage: 5 }],
    environment,
    parts: [
      { id: 'U1', type: TYPE, pins: entry.pins.map((_, i) => `f${10 + i}`), ...own },
      ...(plus ? [{ id: 'W1', type: 'wire', color: 'red', pins: [`T+${col('+')}`, `j${col('+')}`] }] : []),
      { id: 'W2', type: 'wire', color: 'black', pins: [`T-${col('GND') - 1}`, `j${col('GND')}`] },
      ...(slider
        ? [
            { id: 'R2', type: 'resistor', value: '1k', pins: ['h34', 'h38'] },
            { id: 'W4', type: 'wire', color: 'red', pins: ['T+34', 'j34'] },
            { id: 'W5', type: 'wire', color: 'black', pins: ['T-39', 'j38'] },
          ]
        : []),
      ...(led
        ? [
            { id: 'W6', type: 'wire', color: 'yellow', pins: [`j${col('CLK')}`, 'j20'] },
            { id: 'D1', type: 'led', color: 'red', pins: { anode: 'g24', cathode: 'g20' } },
            { id: 'R1', type: 'resistor', value: led, pins: ['h24', 'h28'] },
            { id: 'W3', type: 'wire', color: 'red', pins: ['T+28', 'j28'] },
          ]
        : []),
    ],
  };
}

function engineOf(circuit) {
  const compiled = compile(circuit);
  assert.ok(compiled.program, `compiles: ${JSON.stringify(compiled.issues)}`);
  const engine = createEngine(compiled.program);
  assert.ok(engine.start('dc', STEP_CAP), 'starts at the DC point');
  return engine;
}
const stepOf = (engine) => Math.min(engine.stepHint() ?? STEP_CAP, STEP_CAP);

// Plays `sets` ([seconds after the start, id, field, value]) for `seconds`, sampling the encoder's CLK, DT and
// SW pins at every engine step. Returns the samples [{ t, clk, dt, sw }] with t counted from the start of the run.
function run(circuit, { sets = [], seconds, id = 'U1', each } = {}) {
  const engine = engineOf(circuit);
  const t0 = engine.time;
  const todo = [...sets].sort((a, b) => a[0] - b[0]);
  const samples = [];
  for (;;) {
    const now = engine.time - t0;
    while (todo.length && todo[0][0] <= now + 1e-12) {
      const [, who, field, value] = todo.shift();
      assert.ok(engine.set(who, field, value), `set ${who}.${field} = ${value} at ${now}`);
    }
    const pins = engine.read().parts[id].pins;
    samples.push({ t: now, clk: pins.CLK, dt: pins.DT, sw: pins.SW });
    each?.(engine, now);
    if (now >= seconds - 1e-12) break;
    assert.ok(engine.advance(stepOf(engine)), `stalled at t = ${engine.time} s`);
  }
  return { samples, engine };
}
// The edges of a line: [{ t, dir, i }], a crossing of 2.5 V between two consecutive samples, timed at the later one.
function edges(samples, key) {
  const out = [];
  for (let i = 1; i < samples.length; i++) {
    const [a, b] = [samples[i - 1][key] > HIGH_LEVEL, samples[i][key] > HIGH_LEVEL];
    if (a !== b) out.push({ t: samples[i].t, dir: b ? 'rise' : 'fall', i });
  }
  return out;
}
const falls = (list) => list.filter((e) => e.dir === 'fall');
const rises = (list) => list.filter((e) => e.dir === 'rise');
const turn = (from, to, seconds, own = {}, options = {}) => run(bench(own, { environment: { angle: from }, ...options }), { sets: [[0, 'environment', 'angle', to], ...(options.extraSets ?? [])], seconds });

// ---------------------------------------------------------------- R1 · the catalog

test('R1: type rotary-encoder is in the catalog with pins CLK DT SW + GND, in a sensor or control family', () => {
  assert.ok(PART_TYPES[TYPE], `type ${TYPE}`);
  assert.ok(['sensor', 'control'].includes(PART_TYPES[TYPE].family), `family ${PART_TYPES[TYPE].family}`);
  const entry = catalogEntry(TYPE);
  assert.ok(entry, 'a catalog entry');
  assert.deepEqual(entry.pins, ['CLK', 'DT', 'SW', '+', 'GND'], 'the pins as the module prints them');
});

test('R1: the compact catalog lists rotary-encoder under its family, in both languages, and stays within 4600 characters', () => {
  const family = PART_TYPES[TYPE]?.family;
  assert.ok(family, `type ${TYPE}`);
  for (const lang of ['en', 'es']) {
    const text = formatCompactCatalog(compactCatalog(lang), lang);
    if (lang === 'en') assert.ok(text.length <= 4600, `${lang}: ${text.length} characters`); // the budget is the English catalog's (test/catalog.test.js)
    const lines = text.split('\n');
    const start = lines.indexOf(family);
    assert.ok(start >= 0, `${lang}: block ${family}`);
    let end = start + 1;
    while (end < lines.length && lines[end].startsWith('  ')) end++;
    const listed = lines.slice(start + 1, end).map((l) => l.trim().split(':')[0]);
    assert.ok(listed.includes(TYPE), `${lang}: ${TYPE} under ${family} (${listed.join(', ')})`);
  }
});

// ---------------------------------------------------------------- R2 · at rest

test('R2: at rest (+ on 5 V, angle 0) CLK, DT and SW read 5.00 V ± 0.02', () => {
  const { samples } = run(bench(), { seconds: 0.05 });
  for (const s of samples) for (const k of ['clk', 'dt', 'sw']) near(s[k], 5, 0.02, `${k} at ${s.t}`);
});

test('R2: with pressed true SW reads ≤ 0.02 V while CLK and DT stay at 5.00 V ± 0.02', () => {
  const { samples } = run(bench({ pressed: true }), { seconds: 0.05 });
  for (const s of samples) {
    assert.ok(s.sw <= 0.02, `sw ${s.sw} at ${s.t}`);
    near(s.clk, 5, 0.02, 'clk');
    near(s.dt, 5, 0.02, 'dt');
  }
});

test('R2: the pressed control (set on the engine) pulls SW low, and letting go releases it', () => {
  const { samples } = run(bench(), { sets: [[0.02, 'U1', 'pressed', true], [0.06, 'U1', 'pressed', false]], seconds: 0.1 });
  const at = (t) => samples.find((s) => s.t >= t - 1e-12);
  near(at(0.01).sw, 5, 0.02, 'sw before');
  assert.ok(samples.filter((s) => s.t >= 0.03 && s.t <= 0.05).every((s) => s.sw <= 0.02), 'sw low while pressed');
  near(samples.at(-1).sw, 5, 0.02, 'sw after');
});

// ---------------------------------------------------------------- R3 · 0 -> 90, spec rows 82 and 83

test('R3 (row 82): 0 → 90: CLK has exactly 5 falling and 5 rising edges, the falling ones at 6.25 + 50k ms ± 1', () => {
  const { samples } = turn(0, 90, 0.3);
  const clk = edges(samples, 'clk');
  assert.equal(falls(clk).length, 5, `falls: ${JSON.stringify(clk)}`);
  assert.equal(rises(clk).length, 5, `rises: ${JSON.stringify(clk)}`);
  falls(clk).forEach((e, k) => near(e.t * 1000, 6.25 + 50 * k, 1, `CLK fall ${k}`));
});

test('R3 (row 82): 0 → 90: DT falls 12.5 ms ± 1 after each CLK fall, and DT is high at every CLK fall', () => {
  const { samples } = turn(0, 90, 0.3);
  const clk = falls(edges(samples, 'clk'));
  const dt = falls(edges(samples, 'dt'));
  assert.equal(dt.length, 5, `DT falls: ${JSON.stringify(dt)}`);
  clk.forEach((e, k) => {
    near((dt[k].t - e.t) * 1000, 12.5, 1, `DT fall ${k} after CLK fall`);
    assert.ok(samples[e.i].dt > HIGH_LEVEL, `DT high at the CLK fall ${k}: ${samples[e.i].dt} V`);
  });
});

test('R3 (row 82): 0 → 90: both lines are high at 250 ms and after', () => {
  const { samples } = turn(0, 90, 0.3);
  const late = samples.filter((s) => s.t >= 0.25 - 1e-12);
  assert.ok(late.length > 10, 'samples after 250 ms');
  for (const s of late) assert.ok(s.clk > HIGH_LEVEL && s.dt > HIGH_LEVEL, `at ${s.t}: CLK ${s.clk} DT ${s.dt}`);
});

test('R3 (row 83): 0 → 90: CLK rises at 31.25 + 50k ms and DT at 43.75 + 50k ms, ± 1', () => {
  const { samples } = turn(0, 90, 0.3);
  const clk = rises(edges(samples, 'clk'));
  const dt = rises(edges(samples, 'dt'));
  assert.equal(clk.length, 5);
  assert.equal(dt.length, 5);
  clk.forEach((e, k) => near(e.t * 1000, 31.25 + 50 * k, 1, `CLK rise ${k}`));
  dt.forEach((e, k) => near(e.t * 1000, 43.75 + 50 * k, 1, `DT rise ${k}`));
});

// ---------------------------------------------------------------- R4 · 90 -> 0, spec row 84

test('R4 (row 84): 90 → 0: 5 CLK falling edges, DT low at each of them', () => {
  const { samples } = turn(90, 0, 0.3);
  const clk = falls(edges(samples, 'clk'));
  assert.equal(clk.length, 5, JSON.stringify(clk));
  clk.forEach((e, k) => assert.ok(samples[e.i].dt < HIGH_LEVEL, `DT low at CLK fall ${k}: ${samples[e.i].dt} V`));
});

test('R4 (row 84): 90 → 0: DT falls first at 6.25 ms ± 1 (and every 50 ms), CLK falls 12.5 ms ± 1 later', () => {
  const { samples } = turn(90, 0, 0.3);
  const dt = falls(edges(samples, 'dt'));
  const clk = falls(edges(samples, 'clk'));
  assert.equal(dt.length, 5, JSON.stringify(dt));
  dt.forEach((e, k) => near(e.t * 1000, 6.25 + 50 * k, 1, `DT fall ${k}`));
  clk.forEach((e, k) => near((e.t - dt[k].t) * 1000, 12.5, 1, `CLK fall ${k} after DT fall`));
});

// ---------------------------------------------------------------- R5 · 0 -> 180, 270, 355, spec row 85

test('R5 (row 85): 0 → 180 gives 10 clockwise cycles (DT high at each CLK fall) within 0.5 s + 5 ms', () => {
  const { samples } = turn(0, 180, 1);
  const clk = falls(edges(samples, 'clk'));
  assert.equal(clk.length, 10, JSON.stringify(clk));
  assert.ok(clk.at(-1).t <= 0.505, `the last cycle at ${clk.at(-1).t} s`);
  clk.forEach((e, k) => assert.ok(samples[e.i].dt > HIGH_LEVEL, `DT high at CLK fall ${k}`));
});

test('R5 (row 85): 0 → 270 gives 5 counter-clockwise cycles (DT low at each CLK fall)', () => {
  const { samples } = turn(0, 270, 1);
  const clk = falls(edges(samples, 'clk'));
  assert.equal(clk.length, 5, JSON.stringify(clk));
  clk.forEach((e, k) => assert.ok(samples[e.i].dt < HIGH_LEVEL, `DT low at CLK fall ${k}`));
});

test('R5 (row 85): 0 → 355 gives no edge at all in 1 s', () => {
  const { samples } = turn(0, 355, 1);
  assert.deepEqual(edges(samples, 'clk'), [], 'CLK');
  assert.deepEqual(edges(samples, 'dt'), [], 'DT');
});

// ---------------------------------------------------------------- R6 · bounce, spec row 89

test('R6 (row 89): bounce 2 ms on 0 → 90: 30 edges on CLK, the first falling one at 6.25 ms ± 0.5', () => {
  const { samples } = turn(0, 90, 0.3, { bounce: 2 });
  const clk = edges(samples, 'clk');
  assert.equal(clk.length, 30, `edges on CLK: ${clk.length}`);
  near(falls(clk)[0].t * 1000, 6.25, 0.5, 'first falling edge');
});

test('R6 (row 89): without bounce the same move gives 10 edges on CLK (the default is 0)', () => {
  const { samples } = turn(0, 90, 0.3);
  assert.equal(edges(samples, 'clk').length, 10);
});

// ---------------------------------------------------------------- R7 · an unrelated control moves while the shaft turns

test('R7: a control on an unrelated part moved while the shaft turns does not lose or repeat an edge (0 → 90: still 5 CLK falls)', () => {
  const circuit = bench({}, { slider: true });
  const probe = engineOf(circuit);
  assert.ok(probe.controls().some((c) => c.id === 'R2' && c.field === 'resistance'), 'R2 has a resistance control');
  const { samples } = run(circuit, { sets: [[0, 'environment', 'angle', 90], [0.1, 'R2', 'resistance', 470], [0.13, 'R2', 'resistance', 2200]], seconds: 0.3 });
  const clk = edges(samples, 'clk');
  assert.equal(falls(clk).length, 5, JSON.stringify(clk));
  assert.equal(rises(clk).length, 5, JSON.stringify(clk));
  const dt = edges(samples, 'dt');
  assert.equal(falls(dt).length, 5, JSON.stringify(dt));
  assert.equal(rises(dt).length, 5, JSON.stringify(dt));
});

// ---------------------------------------------------------------- R8 · stresses

// While the shaft turns the CLK contact closes: the worst stress ratio of the encoder over a 0 → 90 move.
function worstRatio(resistance) {
  const circuit = bench({}, { led: resistance });
  let worst = 0;
  let closedSeen = false;
  const overCurrent = (engine) => (engine.stresses(engine.read()).U1 ?? []).filter((s) => s.code === 'SIM_OVER_CURRENT');
  run(circuit, {
    sets: [[0, 'environment', 'angle', 90]],
    seconds: 0.1,
    each: (engine) => {
      if (engine.read().parts.U1.pins.CLK < HIGH_LEVEL) closedSeen = true;
      for (const s of overCurrent(engine)) worst = Math.max(worst, s.ratio);
    },
  });
  assert.ok(closedSeen, 'CLK closed at some moment of the move');
  return worst;
}

test('R8: a closed CLK contact feeding a red LED from 5 V through 220 Ω is SIM_OVER_CURRENT', () => {
  assert.ok(worstRatio('220') > 1);
});

test('R8: ... and through 470 Ω there is none', () => {
  assert.ok(worstRatio('470') <= 1);
});

// ---------------------------------------------------------------- R9 · + unconnected

// The encoder with only GND and CLK wired (CLK to D13 of a UNO (the placement of examples/uno-led.json) whose GND shares the rail); `plus` adds the supply.
function floatingBench(plus) {
  const entry = catalogEntry(TYPE);
  const col = (name) => 10 + entry.pins.indexOf(name);
  return {
    supplies: [{ id: 'V1', voltage: 5 }],
    environment: { angle: 0 },
    parts: [
      { id: 'U1', type: TYPE, pins: entry.pins.map((_, i) => `f${10 + i}`) },
      ...(plus ? [{ id: 'W1', type: 'wire', color: 'red', pins: [`T+${col('+')}`, `j${col('+')}`] }] : []),
      { id: 'W2', type: 'wire', color: 'black', pins: [`T-${col('GND') - 1}`, `j${col('GND')}`] },
      { id: 'W3', type: 'wire', color: 'yellow', pins: [`j${col('CLK')}`, 'i20'] },
      { id: 'A1', type: 'module', part: 'UNO', pins: { D13: 'j20', GND: 'T-27' } },
    ],
  };
}

test('R9: + unconnected with CLK wired to a board pin gives SIM_ENCODER_FLOATING', () => {
  const sim = simulate(floatingBench(false));
  assert.ok(codes(sim.issues).includes('SIM_ENCODER_FLOATING'), `issues: ${JSON.stringify(sim.issues)}`);
});

test('R9: with + connected there is no SIM_ENCODER_FLOATING', () => {
  const sim = simulate(floatingBench(true));
  assert.ok(!codes(sim.issues).includes('SIM_ENCODER_FLOATING'), `issues: ${JSON.stringify(sim.issues)}`);
});

test('R9: SIM_ENCODER_FLOATING has a message in both languages', () => {
  for (const lang of ['en', 'es']) {
    const text = formatIssue({ severity: 'info', code: 'SIM_ENCODER_FLOATING', params: { part: 'U1' } }, lang);
    assert.ok(text && !text.includes('SIM_ENCODER_FLOATING') && !text.includes('check.SIM_'), `${lang}: a real message, not the key: ${text}`);
    assert.doesNotMatch(text, /\{\w+\}|undefined/, `${lang}: placeholders filled`);
  }
});

// ---------------------------------------------------------------- recipes

const RECIPE_NAMES = ['encoder-uno', 'encoder-dimmer-uno'];
const why = (r) => [...r.problems, ...r.review.blocking].map((b) => formatIssue(b, 'en')).join('\n') + JSON.stringify(r.check);
const layoutOf = (name) => {
  const { spec, problems } = expandRecipe(name);
  assert.deepEqual(problems, [], `${name}: ${JSON.stringify(problems)}`);
  return autoLayout(spec);
};
const boardOf = (circuit) => circuit.parts.find((p) => p.part === 'UNO');
const encoderOf = (circuit) => circuit.parts.find((p) => p.type === TYPE);
const lastLine = (engine, board) => String(engine.read().parts[board.id].program.serial.at(-1)).trim();
// Plays on from where the engine is for `seconds`, with the same stepping rule as `run`.
function play(engine, seconds) {
  const end = engine.time + seconds;
  while (engine.time < end - 1e-12) assert.ok(engine.advance(stepOf(engine)), `stalled at t = ${engine.time} s`);
}

test('R10: the two recipes exist, in order after the earlier recipes, with a title and a lesson in both languages', () => {
  const names = Object.keys(RECIPES);
  for (const name of RECIPE_NAMES) {
    assert.ok(names.includes(name), `recipe ${name}`);
    for (const lang of ['en', 'es']) {
      assert.ok(RECIPES[name].title?.[lang], `${name}: title ${lang}`);
      assert.ok(RECIPES[name].teaches?.[lang], `${name}: teaches ${lang}`);
    }
  }
  assert.ok(names.indexOf('encoder-uno') < names.indexOf('encoder-dimmer-uno'), 'encoder-uno first');
  assert.ok(names.indexOf('encoder-uno') > names.indexOf('motor-npn'), 'after the earlier recipes');
});

for (const name of RECIPE_NAMES) {
  test(`R10: recipe ${name} carries environment angle 0 with range [0, 360] and a controls entry for angle`, () => {
    const { circuit } = layoutOf(name);
    const angle = circuit.environment?.angle;
    assert.ok(angle !== undefined, 'environment names angle');
    assert.equal(typeof angle === 'object' ? angle.value : angle, 0);
    assert.deepEqual(angle.range, [0, 360], 'range');
    assert.ok(circuit.page?.controls?.some((c) => c.environment === 'angle'), 'a page.controls entry for the field angle');
    assert.ok(encoderOf(circuit), 'a rotary-encoder');
    assert.equal(encoderOf(circuit).part ?? 'KY-040', 'KY-040');
  });
}

test('R10: encoder-uno: after angle 0 → 90 the last Serial line is 5 (a number) within 0.5 s of simulated time', () => {
  const { circuit } = layoutOf('encoder-uno');
  const board = boardOf(circuit);
  assert.ok(board, 'a UNO');
  const engine = engineOf(circuit);
  assert.ok(engine.set('environment', 'angle', 90));
  play(engine, 0.5);
  const line = lastLine(engine, board);
  assert.equal(engine.read().parts[board.id].program.error, null);
  assert.match(line, /^-?\d+$/, `a number: ${line}`);
  assert.equal(Number(line), 5);
});

test('R10: ... then 90 → 36: 2 ... then pressed: 0 (each within 0.5 s of simulated time)', () => {
  const { circuit } = layoutOf('encoder-uno');
  const board = boardOf(circuit);
  const engine = engineOf(circuit);
  assert.ok(engine.set('environment', 'angle', 90));
  play(engine, 0.5);
  assert.equal(Number(lastLine(engine, board)), 5);
  assert.ok(engine.set('environment', 'angle', 36));
  play(engine, 0.5);
  const back = lastLine(engine, board);
  assert.match(back, /^-?\d+$/, `a number: ${back}`);
  assert.equal(Number(back), 2);
  assert.ok(engine.set(encoderOf(circuit).id, 'pressed', true));
  play(engine, 0.5);
  const reset = lastLine(engine, board);
  assert.match(reset, /^-?\d+$/, `a number: ${reset}`);
  assert.equal(Number(reset), 0);
});

// ---------------------------------------------------------------- R11 · the layout bench

for (const name of RECIPE_NAMES) {
  test(`R11: recipe ${name} is DONE in the layout bench and check is clean`, () => {
    const r = layoutOf(name);
    assert.equal(r.status, 'done', why(r));
    assert.deepEqual(r.circuit.spec.recipe, { name });
    const bad = checkCircuit(r.circuit).issues.filter((i) => i.severity === 'error' || i.severity === 'warning');
    assert.deepEqual(codes(bad), [], name);
  });

  test(`R11: recipe ${name} renders in both views, no error, and no part hidden in both views`, () => {
    // Same arbitration as the first night: each part at least half visible in one of the two views
    // (`visible` is a fraction), no error or warning from inspect other than PART_HIDDEN.
    const c = layoutOf(name).circuit;
    const seen = new Map();
    for (const view of ['front', 'back']) {
      const drawn = renderCircuit(c, { view });
      assert.ok(drawn.svg && drawn.svg.length > 1000, `${view}: an image`);
      assert.deepEqual(drawn.issues.filter((i) => i.severity === 'error'), [], `${view}: render issues`);
      const report = inspectCircuit(c, { view });
      const bad = report.problems.filter((p) => (p.severity === 'error' || p.severity === 'warning') && p.code !== 'PART_HIDDEN');
      assert.deepEqual(bad, [], `${view}: inspect problems`);
      const enc = report.parts.find((p) => p.id === encoderOf(c).id);
      assert.ok(enc && enc.visible > 0, `${view}: the encoder is seen`);
      for (const p of report.parts) seen.set(p.id, Math.max(seen.get(p.id) ?? 0, p.visible));
    }
    for (const [id, visible] of seen) assert.ok(visible >= 0.5, `${id} is hidden in both views (${Math.round(visible * 100)} % at best)`);
  });
}

test('R11: encoder-dimmer-uno: the LED average current is higher after 0 → 180 than at 0', () => {
  const { circuit } = layoutOf('encoder-dimmer-uno');
  const led = circuit.parts.find((p) => p.type === 'led');
  assert.ok(led, 'an LED');
  const engine = engineOf(circuit);
  // The mean of |LED current| over 0.2 s of steps (many PWM periods), taken at every engine step.
  const mean = (seconds) => {
    let sum = 0;
    let n = 0;
    const end = engine.time + seconds;
    while (engine.time < end - 1e-12) {
      assert.ok(engine.advance(stepOf(engine)));
      sum += Math.abs(engine.read().parts[led.id].current);
      n++;
    }
    return sum / n;
  };
  play(engine, 0.1);
  const atZero = mean(0.2);
  assert.ok(engine.set('environment', 'angle', 180));
  play(engine, 0.6);
  const after = mean(0.2);
  assert.ok(after > atZero, `average current ${after} A after 0 → 180 against ${atZero} A at 0`);
});

// ---------------------------------------------------------------- R12 · up close and the tour

test('R12: test/pinout.test.js lists rotary-encoder as COMPLETE (with a recipe and a part id)', () => {
  const source = readFileSync(new URL('./pinout.test.js', import.meta.url), 'utf8');
  const complete = source.match(/const COMPLETE = \{(.*)\};/)?.[1] ?? '';
  const where = complete.match(/'rotary-encoder':\s*'([^']+)'/)?.[1];
  assert.ok(where, 'rotary-encoder in COMPLETE');
  const [name, id] = where.split(' ');
  assert.ok(RECIPES[name] || existsSync(fileURLToPath(new URL(`../examples/${name}.json`, import.meta.url))), `${name} is a recipe or an example`);
  assert.ok(id, 'a part id');
});

test('R12: the encoder has everything for its view up close (symbol, mark, inside view, drawer, legend, pin texts in both languages)', () => {
  const figure = readFileSync(new URL('../src/page/client/figure.js', import.meta.url), 'utf8');
  const legends = readFileSync(new URL('../src/page/client/focus-view.js', import.meta.url), 'utf8');
  const both = (key) => ['en', 'es'].every((lang) => translate(lang, key) !== key);
  const circuit = layoutOf('encoder-uno').circuit;
  const p = buildCircuit(circuit).parts.find((x) => x.id === encoderOf(circuit).id);
  assert.equal(p.type, TYPE);
  for (const n of p.pinNames) assert.ok(both(`pin.role.${p.raw?.part}.${n}`) || both(`pin.role.${TYPE}.${n}`), `the text of pin ${n} (pin.role.*) in every language`);
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

test('R12: tour encoder-uno.json validates for its recipe, has Spanish captions, a gauge of angle, sets 0 → 90 → 36 with travel, and lasts 20–30 s', () => {
  const file = join(tours, 'encoder-uno.json');
  assert.ok(existsSync(file), 'examples/tours/encoder-uno.json');
  const timeline = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(timeline.circuit, 'encoder-uno');
  const circuit = timelineCircuit(file, timeline);
  assert.deepEqual(tourIssues({ ...circuit, page: { ...circuit.page, tour: timeline } }), []);
  const steps = timeline.steps;
  const captions = steps.filter((s) => s.do === 'caption');
  assert.ok(captions.length > 0, 'captions');
  for (const s of captions) assert.ok(s.text?.es, `step at ${s.at}: a Spanish caption`);
  assert.ok(steps.some((s) => s.do === 'gauge' && s.environment === 'angle' && s.on === true), 'a gauge on angle');
  const sets = steps.filter((s) => s.do === 'set' && s.environment === 'angle');
  const values = sets.sort((x, y) => x.at - y.at).map((s) => s.value);
  const at90 = values.indexOf(90);
  assert.ok(at90 >= 0 && values[at90 + 1] === 36, `angle goes 90 then 36: ${values}`);
  assert.ok(sets.some((s) => s.value === 90 && s.move === 'travel'), '90 with travel');
  assert.ok(sets.some((s) => s.value === 36 && s.move === 'travel'), '36 with travel');
  const end = Math.max(...steps.map((s) => s.at));
  assert.ok(end >= 20000 && end <= 30000, `the last step at ${end} ms`);
});

// ---------------------------------------------------------------- section 1 (not an R item)

test('§1: a pulses/detents pair other than 20/20 is refused with an error, not a wrong wave', () => {
  const issues = checkCircuit(bench({ pulses: 24, detents: 24 })).issues;
  assert.ok(issues.some((i) => i.severity === 'error'), `issues: ${JSON.stringify(issues)}`);
  assert.deepEqual(checkCircuit(bench({ pulses: 20, detents: 20 })).issues.filter((i) => i.severity === 'error'), []);
});

test('§1: the engine offers the encoder\'s own angle control (step 18) and a pressed control', () => {
  const controls = engineOf(bench()).controls().filter((c) => c.id === 'U1');
  const angle = controls.find((c) => c.field === 'angle');
  assert.ok(angle, `controls: ${JSON.stringify(controls)}`);
  assert.equal(angle.step, 18);
  assert.ok(controls.some((c) => c.field === 'pressed'), 'pressed');
});

test('§1: the part\'s own angle wins over the environment (own angle 90, environment 0: the lines turn)', () => {
  const { samples } = run(bench({ angle: 90 }, { environment: { angle: 0 } }), { sets: [], seconds: 0.3 });
  // At the DC point the shaft is at the target: no edge at all, and the line is at rest.
  assert.deepEqual(edges(samples, 'clk'), []);
  const moved = run(bench({ angle: 0 }, { environment: { angle: 0 } }), { sets: [[0, 'U1', 'angle', 90]], seconds: 0.3 });
  assert.equal(falls(edges(moved.samples, 'clk')).length, 5, 'moving the part\'s own angle turns the shaft');
  const ignored = run(bench({ angle: 0 }, { environment: { angle: 0 } }), { sets: [[0, 'environment', 'angle', 90]], seconds: 0.3 });
  assert.deepEqual(edges(ignored.samples, 'clk'), [], 'the environment is ignored while the part has its own angle');
});

test('§1: the shaft and the card: the card has text in both languages without placeholders left', async () => {
  const { partLines } = await import('../src/sim/format.js');
  const lines = {};
  run(bench(), {
    sets: [[0, 'environment', 'angle', 90]],
    seconds: 0.03,
    each: (engine, now) => {
      if (now >= 0.02 - 1e-12 && !lines.en) for (const lang of ['en', 'es']) lines[lang] = partLines(engine.read().parts.U1, lang).map((l) => l.text).join(' | ');
    },
  });
  assert.ok(lines.en && lines.es && lines.en !== lines.es, JSON.stringify(lines));
  assert.doesNotMatch(lines.en + lines.es, /\{\w+\}|undefined|NaN/);
});
