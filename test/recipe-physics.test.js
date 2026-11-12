// The sensor recipes against the simulator and the datasheet limits, one test each:
// the encoder sketches against the contacts' bounce, the supplies' ranges against the parts' limits, the
// BMP280's bus voltage, the touch module's output level, and the figures the recipes' texts quote. Every
// number here was measured with the simulator; the datasheet limits they are compared with are named where used.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout } from '../src/layout.js';
import { compile, createEngine, simulate } from '../src/sim/index.js';
import { RECIPES, expandRecipe } from '../src/recipes/index.js';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b} ± ${tol}`);

function open(name, values = {}, edit) {
  const { spec, problems } = expandRecipe(name, values);
  assert.deepEqual(problems, [], name);
  const r = autoLayout(spec);
  assert.equal(r.status, 'done', name);
  if (edit) edit(r.circuit);
  const e = createEngine(compile(r.circuit).program);
  assert.ok(e.start('dc'));
  return { e, circuit: r.circuit, read: (env = {}) => { for (const [k, v] of Object.entries(env)) assert.ok(e.set('environment', k, v)); return e.read(); } };
}
const play = (e, seconds, cap = 0.00025) => {
  const end = e.time + seconds;
  while (e.time < end - 1e-12) assert.ok(e.advance(Math.min(e.stepHint() ?? cap, cap)));
};
const serialOf = (e) => e.read().parts.U1.program.serial.map((l) => String(l).trim());

// ── 1 · the encoder sketches count exactly with every bounce the control allows ──────────────────────────

// Five clicks clockwise, five back, five clockwise, five back (90° is five clicks), at `speed` °/s. The
// serial buffer keeps the last dozen lines, so each move's five lines are read when it ends: every one of
// them must be the next count, none repeated or skipped.
function clicks(name, bounce, speed) {
  const o = open(name, { U2: { bounce, speed } });
  const moves = [];
  for (const angle of [90, 0, 90, 0]) {
    assert.ok(o.e.set('environment', 'angle', angle));
    play(o.e, 90 / speed + 0.2);
    moves.push(serialOf(o.e).slice(-5).join(' '));
  }
  return moves;
}
const upDown = ['1 2 3 4 5', '4 3 2 1 0', '1 2 3 4 5', '4 3 2 1 0'];

test('encoder-uno: the count is exact with the bounce from 0 to 5 ms, at 360 and at 800 degrees a second', () => {
  for (const bounce of [0, 1, 2, 3, 4, 5]) {
    for (const speed of [360, 800]) assert.deepEqual(clicks('encoder-uno', bounce, speed), upDown, `bounce ${bounce} ms at ${speed} °/s`);
  }
});

test('encoder-dimmer-uno: the same filter, the count held between 0 and 20 (the lines it prints are the count)', () => {
  for (const bounce of [0, 2, 5]) {
    for (const speed of [360, 800]) assert.deepEqual(clicks('encoder-dimmer-uno', bounce, speed), upDown, `bounce ${bounce} ms at ${speed} °/s`);
  }
});

test('the encoder recipes ship with 2 ms of bounce, the pull-ups of the chip on CLK, DT and SW, and a millis() filter', () => {
  for (const name of ['encoder-uno', 'encoder-dimmer-uno']) {
    const recipe = RECIPES[name];
    assert.equal(recipe.parts.find((p) => p.id === 'U2').bounce, 2, name);
    const sketch = recipe.parts.find((p) => p.id === 'U1').program;
    for (const pin of ['CLK_PIN', 'DT_PIN', 'SW_PIN']) assert.match(sketch, new RegExp(`pinMode\\(${pin}, INPUT_PULLUP\\)`), `${name} ${pin}`);
    assert.match(sketch, /millis\(\) - lastChange >= DEBOUNCE_MS/, name);
    assert.match(sketch, /DEBOUNCE_MS = 8/, name);
  }
});

// ── 2 to 4 · supplies and resistors against the limits of the LED and the LM393 ───────────────────────────
// Limits: the LED 20 mA; R3 a quarter of a watt; the LM393's output, the 20 mA the model stops it at (the
// sheet guarantees 6 mA at 1.5 V out, more typically, which the finding's own figures are stated against).

test('ldr-comparator: V1 stops at 12 V and R3 is 1 kΩ; LED under 10 mA, R3 under a quarter watt, output sink under 12 mA', () => {
  assert.equal(RECIPES['ldr-comparator'].values.V1.max, 12);
  assert.ok(expandRecipe('ldr-comparator', { V1: 13 }).problems.length, '13 V is refused');
  assert.equal(RECIPES['ldr-comparator'].parts.find((p) => p.id === 'R3').value, '1k');
  for (const v of [3, 12]) {
    for (const position of [0.1, 0.5, 0.9]) {
      const o = open('ldr-comparator', { V1: { voltage: v }, RV1: { position } });
      const p = o.read({ light: 0.1 }).parts;
      assert.ok(p.D1.current <= 0.01, `LED ${p.D1.current} A at ${v} V`);
      assert.ok(p.R3.power < 0.25, `R3 ${p.R3.power} W at ${v} V`);
      assert.ok(p.U1.currents.OUT1 <= 0.012, `sink ${p.U1.currents.OUT1} A at ${v} V`);
      assert.ok(p.D1.current >= 1e-3, `the LED still lights at ${v} V: ${p.D1.current} A`);
      assert.ok(!(p.U1.stress ?? []).some((x) => x.level === 'exceeded'), `LM393 not exceeded at ${v} V`);
    }
  }
});

test('ldr-night-light: V1 stops at 9 V and R3 is 560 Ω; LED under 20 mA, R3 under a quarter watt, and bright at 3 and 5 V', () => {
  assert.equal(RECIPES['ldr-night-light'].values.V1.max, 9);
  assert.ok(expandRecipe('ldr-night-light', { V1: 12 }).problems.length, '12 V is refused');
  assert.equal(RECIPES['ldr-night-light'].parts.find((p) => p.id === 'R3').value, '560');
  for (const v of [3, 5, 9]) {
    const p = open('ldr-night-light', { V1: { voltage: v } }).read({ light: 0.1 }).parts;
    assert.ok(p.D1.current <= 0.02, `LED ${p.D1.current} A at ${v} V`);
    assert.ok(p.R3.power < 0.25, `R3 ${p.R3.power} W at ${v} V`);
    assert.ok(p.D1.current >= 2e-3, `the LED shines at ${v} V: ${p.D1.current} A`);
  }
});

test('lm35-comparator: R3 is 1 kΩ, the cold output sinks under 6 mA and the lit LED still has over 3 mA', () => {
  assert.equal(RECIPES['lm35-comparator'].parts.find((p) => p.id === 'R3').value, '1k');
  const o = open('lm35-comparator');
  const cold = o.read({ temperature: 25 }).parts;
  assert.ok(cold.U1.currents.OUT1 < 0.006, `sink ${cold.U1.currents.OUT1} A`);
  assert.ok(cold.D1.current < 0.5e-3);
  const hot = o.read({ temperature: 60 }).parts;
  assert.ok(hot.D1.current > 3e-3, `lit LED ${hot.D1.current} A`);
});

// ── 5 · ntc-follower: the lesson is honest over the whole range of its controls ──────────────────────────

test('ntc-follower: V1 from 9 to 12 V, the temperature control ends at 65 °C and the follower copies the divider all the way', () => {
  const r = RECIPES['ntc-follower'];
  assert.deepEqual([r.values.V1.min, r.values.V1.max], [9, 12]);
  const control = r.page.controls.find((c) => c.environment === 'temperature');
  assert.equal(control.max, 65);
  for (const v of [9, 12]) {
    const o = open('ntc-follower', { V1: { voltage: v } });
    for (const T of [control.min, 0, 25, 65]) {
      const p = o.read({ temperature: T }).parts;
      const divider = p.U1.pins['IN1+'];
      near(p.U1.vout, divider, 0.02 * divider, `${v} V, ${T} °C`);
    }
  }
  // What the control no longer reaches: at 9 V the output stops short of the divider past about 70 °C.
  const o = open('ntc-follower');
  const hot = o.read({ temperature: 100 }).parts;
  assert.ok(hot.U1.pins['IN1+'] - hot.U1.vout > 0.5, 'clipped at 100 °C');
  // The thermistor's own heating, in the model's terms: its power stays under 4 mW over the controls.
  for (const v of [9, 12]) for (const T of [-20, 25, 65]) assert.ok(open('ntc-follower', { V1: { voltage: v } }).read({ temperature: T }).parts.TH1.power < 0.004);
});

// ── 6 · uno-bmp280-altitude: Wire's pull-ups are turned off, the bus idles at the module's 3.3 V ─────────

test('uno-bmp280-altitude: after begin() SDA and SCL idle at 3.3 V (not 3.68 V), no over-VDDIO note, the altitude prints', () => {
  const o = open('uno-bmp280-altitude');
  play(o.e, 2.5, 0.001);
  const parts = o.e.read().parts;
  near(parts.U2.pins.SDA, 3.3, 0.05, 'SDA');
  near(parts.U2.pins.SCL, 3.3, 0.05, 'SCL');
  assert.equal(parts.U1.program.error, null);
  assert.ok(parts.U1.program.serial.length >= 2 && /^alt: -?\d/.test(parts.U1.program.serial.at(-1)), parts.U1.program.serial.join());
  // (A static solve, `simulate`, still shows the first 0.1 s of begin() with Wire's pull-ups on, so it says
  // SIM_PIN_OVER_VDDIO; the running engine has them off once setup() ends.)
  assert.ok(simulate(o.circuit).issues.every((i) => i.code === 'SIM_PIN_OVER_VDDIO'), 'nothing else');
  const text = JSON.stringify(RECIPES['uno-bmp280-altitude']);
  assert.ok(!/on the bench|como en el banco/.test(text));
  assert.match(RECIPES['uno-bmp280-altitude'].parts[0].program, /digitalWrite\(A4, LOW\);\s*digitalWrite\(A5, LOW\);/);
});

// ── 7 · touch-uno: the module on the UNO's 5 V, its output clears the UNO's VIH with room ─────────────────

test('touch-uno: powered from the 5 V pin; SIG reads over 4.5 V touched and the sketch prints TOUCH then RELEASE', () => {
  const nets = RECIPES['touch-uno'].nets.flat();
  assert.ok(nets.includes('U1.5V') && !nets.includes('U1.3V3'));
  const o = open('touch-uno');
  play(o.e, 1, 0.001);
  o.read({ touch: true });
  play(o.e, 0.6, 0.001);
  const touched = o.e.read().parts;
  assert.ok(touched.U2.pins.SIG > 4.5, `SIG ${touched.U2.pins.SIG} V`);
  o.read({ touch: false });
  play(o.e, 0.6, 0.001);
  assert.deepEqual(serialOf(o.e), ['TOUCH', 'RELEASE']);
});

// ── 8 · the figures the texts quote are the measured ones ────────────────────────────────────────────────

test('touch-toggle-led: with 330 Ω the model gives 3.45 mA (not 4.5), with the default 470 Ω 2.7 mA', () => {
  for (const [r, mA] of [['330', 3.45], ['470', 2.7]]) {
    const o = open('touch-toggle-led', { R1: r });
    play(o.e, 1, 0.001);
    o.read({ touch: true });
    play(o.e, 1, 0.001);
    near(o.e.read().parts.D1.current * 1e3, mA, 0.1, `${r} Ω`);
  }
  const text = JSON.stringify(RECIPES['touch-toggle-led']);
  assert.ok(/2\.7 mA in the simulation/.test(text));
});

test('laser-tripwire: with the beam cut it trips under about 410 lx and not over it (the text said 300)', () => {
  const o = open('laser-tripwire');
  assert.ok(o.read({ light: 400, beam: true }).parts.U1.pins.DO > 2.5, '400 lx trips');
  assert.ok(o.read({ light: 420, beam: true }).parts.U1.pins.DO < 1, '420 lx does not');
  assert.ok(!/near 300 lx/.test(JSON.stringify(RECIPES['laser-tripwire'])));
});

test('laser-uno: the laser takes about 28 mA through the transistor, and its text gives the verifiable reason', () => {
  const o = open('laser-uno');
  play(o.e, 0.1, 0.001);
  near(o.e.read().parts.LS1.current * 1e3, 27.0, 0.3, 'laser mA through the transistor');
  near(open('laser-tripwire').read().parts.LS1.current * 1e3, 27.9, 0.3, 'laser mA from the supply, the "about 28 mA" of the texts');
  const text = JSON.stringify(RECIPES['laser-uno']);
  assert.match(text, /28 mA/);
  assert.match(text, /20 mA/);
  assert.ok(!/22 mA|40 Ω/.test(text), 'no model-only figures quoted as facts');
});

test('uno-dht11 and voltage-sensor-uno: the 2 s is the library\'s, the divider leaves 1/5 at the pin', () => {
  assert.match(JSON.stringify(RECIPES['uno-dht11']), /library/);
  assert.match(JSON.stringify(RECIPES['uno-dht11']), /one a second|1 s/);
  const sketch = RECIPES['voltage-sensor-uno'].parts.find((p) => p.id === 'U1').program;
  assert.ok(!/takes 4\/5/.test(sketch) && /carries 1\/5/.test(sketch));
});

test('model figures in the texts: 18 lx, 4 / 9 / 28 cm, 160 / 105 G are what the model gives, and are said to depend on the part', () => {
  const light = open('light-switch-module');
  let flip = null;
  for (let l = 1; l <= 60 && flip === null; l += 0.5) if (light.read({ light: l }).parts.U1.pins.DO < 2.5) flip = l;
  near(flip, 18, 1, 'light switch lx');
  for (const [threshold, cm] of [[0.25, 4.25], [0.5, 8.75], [0.9, 28.25]]) {
    const o = open('obstacle-buzzer', { U1: { threshold } });
    let at = null;
    for (let d = 40; d >= 2 && at === null; d -= 0.25) if ((o.read({ distance: d }).parts.BZ1.current ?? 0) > 0.005) at = d;
    near(at, cm, 0.3, `obstacle ${threshold}`);
  }
  const hall = open('hall-counter-uno');
  let up = null;
  for (let g = 0; g <= 300 && up === null; g++) if (hall.read({ field: g }).parts.U2.pins.DO < 2.5) up = g;
  near(up, 160, 1, 'Hall on');
  let down = null;
  for (let g = 300; g >= 0 && down === null; g--) if (hall.read({ field: g }).parts.U2.pins.DO > 2.5) down = g;
  near(down, 105, 1, 'Hall off');
  for (const name of ['light-switch-module', 'obstacle-buzzer', 'hall-counter-uno']) assert.match(JSON.stringify(RECIPES[name].teaches), /real|varía|differ/i, name);
});

test('hall-linear-uno: the sketch measures the zero at start-up, so a field present then is taken away', () => {
  const o = open('hall-linear-uno', {}, (c) => { c.environment.field = typeof c.environment.field === 'object' ? { ...c.environment.field, value: 100 } : 100; });
  play(o.e, 1.2, 0.001);
  near(Number(serialOf(o.e).at(-1)), 0, 5, 'taken as the zero');
  o.read({ field: 200 });
  play(o.e, 1.2, 0.001);
  near(Number(serialOf(o.e).at(-1)), 100, 15, '200 G is 100 G over the zero it started with');
});

// ── clap-switch does not depend on DO's polarity or on the pulse being long ─────────────────────────────

// The recipe's circuit, and the same with an inverter (a 2N3904 with a 10 kΩ pull-up) between DO and D2:
// DO's levels reach the UNO swapped, as on a board whose DO rises with the sound.
function clapCircuit(inverted) {
  const { spec } = expandRecipe('clap-switch');
  if (inverted) {
    spec.parts.push({ id: 'Q1', part: '2N3904' }, { id: 'R2', type: 'resistor', value: '10k' }, { id: 'R3', type: 'resistor', value: '10k' });
    spec.nets = spec.nets.filter((n) => !(n.includes('U2.DO') && n.includes('U1.D2')));
    spec.nets.push(['U2.DO', 'R2.1'], ['R2.2', 'Q1.B'], ['Q1.C', 'R3.1', 'U1.D2']);
    spec.nets.find((n) => n.includes('U1.5V')).push('R3.2');
    spec.nets.find((n) => n.includes('U2.GND')).push('Q1.E');
  }
  const r = autoLayout(spec);
  // (The bench with the inverter may leave a part hidden in the drawing: only its electrical circuit matters here.)
  assert.ok(r.circuit, 'a circuit');
  const e = createEngine(compile(r.circuit).program);
  assert.ok(e.start('dc'));
  return e;
}

// Plays `seconds` with the engine's step capped at `cap`, so a pulse shorter than the usual cap is not skipped.
const lit = (e) => e.read().parts.D1.current > 3e-3;
function clap(e, ms) {
  const step = Math.min(0.0005, ms / 1000);
  assert.ok(e.set('environment', 'sound', 105));
  play(e, ms / 1000, step);
  assert.ok(e.set('environment', 'sound', 40));
  play(e, 0.4, 0.0005);
}

test('clap-switch: one clap is one change of the LED, with DO falling or rising, for pulses of 0.2, 3, 60 and 500 ms', () => {
  for (const inverted of [false, true]) {
    for (const ms of [0.2, 3, 60, 500]) {
      const e = clapCircuit(inverted);
      play(e, 0.4, 0.0005);
      assert.equal(lit(e), false, 'off in a quiet room');
      for (const expected of [true, false]) {
        clap(e, ms);
        assert.equal(lit(e), expected, `inverted ${inverted}, pulse ${ms} ms`);
      }
    }
  }
});

test('clap-switch: a sustained noise of 1 s is one change, and a short noise while it starts does not swap the rest level', () => {
  for (const inverted of [false, true]) {
    const e = clapCircuit(inverted);
    play(e, 0.4, 0.0005);
    clap(e, 1000);
    assert.equal(lit(e), true, `inverted ${inverted}: one change for the long noise`);
    // A 20 ms noise during setup(), whose 100 readings take about 100 ms: the majority is still the rest level.
    const f = clapCircuit(inverted);
    assert.ok(f.set('environment', 'sound', 105));
    play(f, 0.02, 0.0005);
    assert.ok(f.set('environment', 'sound', 40));
    play(f, 0.5, 0.0005);
    assert.equal(lit(f), false, `inverted ${inverted}: nothing lit after a start with noise`);
    clap(f, 60);
    assert.equal(lit(f), true, `inverted ${inverted}: a clap is a clap`);
  }
});

test('clap-switch: the sketch takes the rest level from many readings and has no delay in loop', () => {
  const sketch = RECIPES['clap-switch'].parts.find((p) => p.id === 'U1').program;
  assert.match(sketch, /SAMPLES = 100/);
  assert.match(sketch, /rest = \(highs \* 2 >= SAMPLES\)/);
  assert.match(sketch, /millis\(\) - lastClap >= QUIET_MS/);
  assert.ok(!/delay\([^)]*\);\s*\n\}\s*$/.test(sketch.split('void loop()')[1]) && !/delay\(/.test(sketch.split('void loop()')[1]));
});

// ── room between the parts: clearance ─────────────────────────────────────────────────────────────────

test('recipes with a wider clearance lay out, are APPROVED, and hide no part in both views (laser-uno stays at 2: 3, 4 and 5 fail on LS1)', async () => {
  const { review } = await import('../src/review.js');
  const { inspectCircuit } = await import('../src/index.js');
  const wanted = { 'laser-tripwire': 5, 'pir-lamp': 3, 'touch-toggle-led': 3, 'light-switch-module': 3, 'obstacle-buzzer': 3, 'ldr-comparator': 5, 'lm35-comparator': 5, 'laser-uno': 2 };
  for (const [name, clearance] of Object.entries(wanted)) {
    assert.equal(expandRecipe(name).spec.clearance, clearance, name);
    const r = autoLayout(expandRecipe(name).spec);
    assert.equal(r.status, 'done', name);
    assert.equal(review(r.circuit).verdict, 'approved', name);
    const best = new Map();
    for (const view of ['front', 'back']) for (const p of inspectCircuit(r.circuit, { view }).parts) best.set(p.id, Math.max(best.get(p.id) ?? 0, p.visible));
    for (const [id, visible] of best) if (!/^W/.test(id)) assert.ok(visible >= 0.5, `${name} ${id} ${Math.round(visible * 100)} %`);
  }
});

// ── HC-SR501: the shortest delay is the trimmer's minimum, about 2.5 s ─────────────────────────────────

test('pir-sensor: the delay cannot go under 2.5 s; the recipes\' control starts there and pir-uno says what a real module does at power-up', () => {
  const ok = autoLayout({ parts: [{ id: 'U1', type: 'pir-sensor', delay: 2.5 }], nets: [['T+', 'U1.VCC'], ['U1.GND', 'T-']], supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }] });
  assert.ok(ok.circuit, '2.5 s is accepted');
  assert.ok(simulate(ok.circuit).ok);
  const bad = autoLayout({ parts: [{ id: 'U1', type: 'pir-sensor', delay: 2.4 }], nets: [['T+', 'U1.VCC'], ['U1.GND', 'T-']], supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }] });
  const issues = JSON.stringify(bad.problems ?? []) + JSON.stringify(bad.check ?? '') + JSON.stringify(bad.circuit ? simulate(bad.circuit).issues : '');
  assert.match(issues, /BAD_VALUE/, '2.4 s is refused');
  assert.equal(RECIPES['pir-lamp'].values.U1.min, 2.5);
  assert.equal(RECIPES['pir-uno'].values.U2.min, 2.5);
  assert.match(RECIPES['pir-uno'].teaches.en, /minute to warm up/);
  assert.match(RECIPES['pir-uno'].teaches.es, /minuto de calentamiento/);
});
