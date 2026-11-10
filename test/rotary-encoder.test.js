// Rotary encoder (docs/en/rotary-encoder.md): the shaft follower and the quadrature table against the
// worked numbers of the timing table in docs/en/rotary-encoder.md, 20 pulses and 20 detents at 360 °/s: a cycle is 50 ms, an edge every
// 12.5 ms, the first (CLK falling) at 6.25 ms.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout } from '../src/layout.js';
import { compile, createEngine, simulate } from '../src/sim/index.js';
import { expandRecipe } from '../src/recipes/index.js';
import { resolvePart } from '../src/parts/resolve.js';
import { snapTarget, shortestArc, advance, contacts, closedAt, neededStep, QUIET } from '../src/sim/devices/encoder.js';

const PITCH = 18;
const base = { speed: 360, pitch: PITCH, bounce: 0 };
const near = (a, b, tolerance, what) => assert.ok(Math.abs(a - b) <= tolerance, `${what}: ${a} against ${b}`);

// Runs a move from `from` to `to` in steps of h and returns the edges: [time (ms), channel, closed].
function edges(from, to, { h = 1e-4, bounce = 0, seconds = 1 } = {}) {
  const p = { ...base, bounce, target: snapTarget(to, 20) };
  let s = { shaft: snapTarget(from, 20), ageA: QUIET, ageB: QUIET };
  let was = contacts(s, p);
  const out = [];
  for (let k = 1; k * h <= seconds + 1e-12; k++) {
    s = advance(s, h, p);
    const now = contacts(s, p);
    for (const c of ['a', 'b']) if (now[c] !== was[c]) out.push([k * h * 1000, c, now[c]]);
    was = now;
  }
  return { out, s };
}
const falls = (list, c) => list.filter(([, ch, closed]) => ch === c && closed).map(([t]) => t);
const rises = (list, c) => list.filter(([, ch, closed]) => ch === c && !closed).map(([t]) => t);

test('encoder: the target snaps to the nearest detent, ties up, and wraps', () => {
  assert.equal(snapTarget(0, 20), 0);
  assert.equal(snapTarget(90, 20), 90);
  assert.equal(snapTarget(8.9, 20), 0);
  assert.equal(snapTarget(9, 20), 18);
  assert.equal(snapTarget(355, 20), 0);
  assert.equal(snapTarget(360, 20), 0);
  assert.equal(snapTarget(36, 20), 36);
});

test('encoder: the shortest arc; an exact half turn goes clockwise', () => {
  assert.equal(shortestArc(0, 90), 90);
  assert.equal(shortestArc(90, 0), -90);
  assert.equal(shortestArc(0, 270), -90);
  assert.equal(shortestArc(0, 180), 180);
  assert.equal(shortestArc(180, 0), 180);
  assert.equal(shortestArc(350, 10), 20);
});

test('encoder: the quadrature table (clockwise: CLK first, DT a quarter cycle later)', () => {
  const at = (deg) => ({ a: closedAt(deg / PITCH, 'a'), b: closedAt(deg / PITCH, 'b') });
  assert.deepEqual(at(0), { a: false, b: false });
  assert.deepEqual(at(1), { a: false, b: false });
  assert.deepEqual(at(3), { a: true, b: false });
  assert.deepEqual(at(9), { a: true, b: true });
  assert.deepEqual(at(13), { a: false, b: true });
  assert.deepEqual(at(17), { a: false, b: false });
  assert.deepEqual(at(18 + 3), { a: true, b: false }, 'the next cycle repeats');
});

test('encoder: 0 to 90 at 360 deg/s gives the table\'s edges, clockwise', () => {
  const { out, s } = edges(0, 90);
  const clk = falls(out, 'a');
  assert.equal(clk.length, 5);
  clk.forEach((t, k) => near(t, 6.25 + 50 * k, 0.11, `CLK fall ${k}`));
  const dt = falls(out, 'b');
  assert.equal(dt.length, 5);
  dt.forEach((t, k) => near(t, 18.75 + 50 * k, 0.11, `DT fall ${k}`));
  rises(out, 'a').forEach((t, k) => near(t, 31.25 + 50 * k, 0.11, `CLK rise ${k}`));
  rises(out, 'b').forEach((t, k) => near(t, 43.75 + 50 * k, 0.11, `DT rise ${k}`));
  assert.equal(rises(out, 'a').length, 5);
  assert.equal(rises(out, 'b').length, 5);
  assert.equal(out.length, 20);
  // At each CLK fall DT is high (open): no DT fall before the CLK one.
  clk.forEach((t, k) => assert.ok(dt[k] > t));
  assert.equal(s.shaft, 90);
  assert.deepEqual(contacts(s, { ...base, target: 90 }), { a: false, b: false });
});

test('encoder: 90 to 0 turns the other way: DT first, CLK 12.5 ms later', () => {
  const { out } = edges(90, 0);
  const dt = falls(out, 'b');
  const clk = falls(out, 'a');
  assert.equal(dt.length, 5);
  dt.forEach((t, k) => near(t, 6.25 + 50 * k, 0.11, `DT fall ${k}`));
  clk.forEach((t, k) => near(t, 18.75 + 50 * k, 0.11, `CLK fall ${k}`));
  clk.forEach((t, k) => assert.ok(dt[k] < t, 'DT is already low at each CLK fall'));
});

test('encoder: 0 to 180 is ten clockwise cycles in half a second; 0 to 270 five the other way; 0 to 355 none', () => {
  const half = edges(0, 180);
  assert.equal(falls(half.out, 'a').length, 10);
  assert.ok(half.out.at(-1)[0] <= 505);
  half.out.filter(([, c, closed]) => c === 'a' && closed).forEach(([t]) => assert.ok(falls(half.out, 'b').some((d) => d > t && d < t + 15)));
  const back = edges(0, 270);
  const dt = falls(back.out, 'b');
  assert.equal(dt.length, 5);
  assert.ok(falls(back.out, 'a').every((t, k) => t > dt[k]));
  assert.equal(edges(0, 355).out.length, 0);
});

test('encoder: bounce 2 ms gives 30 edges on CLK, the first fall still at 6.25 ms', () => {
  const { out } = edges(0, 90, { bounce: 0.002, h: 5e-5 });
  const clk = out.filter(([, c]) => c === 'a');
  assert.equal(clk.length, 30);
  near(clk[0][0], 6.25, 0.1, 'first CLK edge');
  assert.equal(clk[0][2], true);
  // Each transition: new, old, new at 0, b/3 and 2b/3.
  near(clk[1][0] - clk[0][0], 2 / 3, 0.1, 'third of the bounce');
  near(clk[2][0] - clk[0][0], 4 / 3, 0.1, 'two thirds');
  assert.deepEqual(clk.slice(0, 3).map((e) => e[2]), [true, false, true]);
});

test('encoder: a step as long as the move still lands on the target; DC puts it there', () => {
  const p = { ...base, target: 90 };
  assert.equal(advance({ shaft: 0, ageA: QUIET, ageB: QUIET }, 1, p).shaft, 90);
  assert.equal(advance({ shaft: 0, ageA: QUIET, ageB: QUIET }, undefined, p).shaft, 90);
  // Many small steps equal one long one at the end of the move.
  let s = { shaft: 350, ageA: QUIET, ageB: QUIET };
  for (let k = 0; k < 400; k++) s = advance(s, 1e-3, { ...base, target: 18 });
  assert.equal(s.shaft, 18);
});

test('encoder: the element asks for short steps while it moves and for none at rest', () => {
  const p = { ...base, target: 90 };
  assert.equal(neededStep({ shaft: 90, ageA: QUIET, ageB: QUIET }, p), null);
  near(neededStep({ shaft: 0, ageA: QUIET, ageB: QUIET }, p), 5e-4, 1e-12, 'a twenty-fifth of 12.5 ms');
  near(neededStep({ shaft: 0, ageA: QUIET, ageB: QUIET }, { ...p, bounce: 0.002 }), 1e-4, 1e-12, 'a twentieth of the bounce');
  assert.ok(neededStep({ shaft: 90, ageA: 0.001, ageB: QUIET }, { ...p, bounce: 0.002 }) > 0, 'still bouncing at rest');
});

// ── In the engine ──────────────────────────────────────────────────────────────────

// A KY-040 on 5 V, its `+` and GND wired, and what `extra` adds (parts, nets) around it.
function bench(part = {}, extra = {}) {
  const spec = {
    parts: [{ id: 'U1', type: 'rotary-encoder', ...part }, ...(extra.parts ?? [])],
    nets: [['T+', 'U1.+'], ['U1.GND', 'T-'], ...(extra.nets ?? [])],
    supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
    environment: { angle: 0 },
  };
  const r = autoLayout(spec);
  assert.equal(r.status, 'done', JSON.stringify(r.problems));
  return createEngine(compile(r.circuit).program);
}

// Steps of h from the moment of `move(engine)`: the edges of CLK and DT as [ms, channel, level high],
// sampled at each step as the sketch's pin would see them.
function run(engine, move, { h = 5e-4, seconds = 0.3, during } = {}) {
  assert.ok(engine.start('dc', h));
  move(engine);
  const t0 = engine.time;
  const out = [];
  let was = { clk: true, dt: true };
  for (let k = 0; k < Math.round(seconds / h); k++) {
    assert.ok(engine.advance(h));
    if (during) during(engine, k);
    const r = engine.read().parts.U1;
    const now = { clk: r.vclk > 2.5, dt: r.vdt > 2.5 };
    for (const c of ['clk', 'dt']) if (now[c] !== was[c]) out.push([(engine.time - t0) * 1000, c, now[c]]);
    was = now;
  }
  return { out, end: engine.read().parts.U1 };
}
const fall = (out, c) => out.filter(([, ch, high]) => ch === c && !high);

test('encoder in the engine: at rest every line is the supply; pressed, SW is ground', () => {
  const e = bench();
  assert.ok(e.start('dc', 1e-3));
  const r = e.read().parts.U1;
  for (const v of [r.vclk, r.vdt, r.vsw]) near(v, 5, 0.02, 'at rest');
  assert.equal(e.stepHint(), null);
  const p = bench({ pressed: true });
  assert.ok(p.start('dc', 1e-3));
  assert.ok(p.read().parts.U1.vsw <= 0.02);
});

test('encoder in the engine: 0 to 90 gives five clockwise cycles within a millisecond of the table', () => {
  const { out, end } = run(bench(), (e) => e.set('environment', 'angle', 90));
  const clk = fall(out, 'clk');
  assert.equal(clk.length, 5);
  assert.equal(out.filter(([, c, high]) => c === 'clk' && high).length, 5);
  clk.forEach(([t], k) => near(t, 6.25 + 50 * k, 1, `CLK fall ${k}`));
  const dt = fall(out, 'dt');
  dt.forEach(([t], k) => near(t - clk[k][0], 12.5, 1, `DT ${k} after CLK`));
  assert.ok(end.vclk > 4.9 && end.vdt > 4.9);
  assert.equal(end.direction, 0);
});

test('encoder in the engine: 90 to 0, 0 to 180, 0 to 270, 0 to 355', () => {
  // Back from 90: the environment starts at 90 and goes to 0.
  const spec = (angle) => ({ parts: [{ id: 'U1', type: 'rotary-encoder' }], nets: [['T+', 'U1.+'], ['U1.GND', 'T-']], supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }], environment: { angle } });
  const r90 = autoLayout(spec(90));
  assert.equal(r90.status, 'done');
  const back = run(createEngine(compile(r90.circuit).program), (e) => e.set('environment', 'angle', 0));
  const dtBack = fall(back.out, 'dt');
  const clkBack = fall(back.out, 'clk');
  assert.equal(clkBack.length, 5);
  assert.equal(dtBack.length, 5);
  dtBack.forEach(([t], k) => near(t, 6.25 + 50 * k, 1, `DT fall ${k}`));
  clkBack.forEach(([t], k) => assert.ok(dtBack[k][0] < t, 'DT is already low at each CLK fall'));
  // A part with its own angle does not follow the environment: nothing moves.
  assert.equal(run(bench({ angle: 90 }), (e) => e.set('environment', 'angle', 0)).out.length, 0);
  const turn = (to, from = 0, seconds = 1) => {
    const b = bench();
    return run(b, (x) => {
      x.set('environment', 'angle', from);
      x.set('environment', 'angle', to);
    }, { seconds });
  };
  assert.equal(fall(turn(180).out, 'clk').length, 10);
  const ccw = turn(270).out;
  assert.equal(fall(ccw, 'clk').length, 5);
  assert.ok(fall(ccw, 'dt')[0][0] < fall(ccw, 'clk')[0][0], 'DT leads counter-clockwise');
  assert.equal(turn(355).out.length, 0);
});

test('encoder in the engine: a control on another part, moved while the shaft turns, loses and repeats no edge', () => {
  const extra = { parts: [{ id: 'RV1', type: 'potentiometer', value: '10k' }], nets: [['T+', 'RV1.1'], ['RV1.3', 'T-']] };
  const { out } = run(bench({}, extra), (e) => e.set('environment', 'angle', 90), { during: (e, k) => { if (k % 40 === 0) e.set('RV1', 'position', (k / 40) % 2 ? 0.3 : 0.7); } });
  const clk = fall(out, 'clk');
  assert.equal(clk.length, 5);
  clk.forEach(([t], k) => near(t, 6.25 + 50 * k, 1, `CLK fall ${k}`));
});

test('encoder in the engine: bounce 2 ms gives 30 edges on CLK, the first fall at 6.25 ms', () => {
  const { out } = run(bench({ bounce: 2 }), (e) => e.set('environment', 'angle', 90), { h: 1e-4 });
  const clk = out.filter(([, c]) => c === 'clk');
  assert.equal(clk.length, 30);
  near(clk[0][0], 6.25, 0.5, 'first edge');
  assert.equal(clk[0][2], false);
});

test('encoder in the engine: a closed contact feeding an LED is a stress over 10 mA, not through 470 ohms', () => {
  const led = (r) => ({ parts: [{ id: 'R1', type: 'resistor', value: r }, { id: 'D1', type: 'led', color: 'red' }], nets: [['T+', 'R1.1'], ['R1.2', 'D1.A'], ['D1.K', 'U1.CLK']] });
  const stressed = (r) => {
    const e = bench({}, led(r));
    let worst = 0;
    run(e, (x) => x.set('environment', 'angle', 90), { during: (x) => { worst = Math.max(worst, x.read().parts.U1.current); }, seconds: 0.05 });
    return worst;
  };
  // The kit's red LED drops about 1.8 V: (5 - 1.8) / 220 is over the 10 mA the contacts are rated for.
  near(stressed('220'), 14.5e-3, 1e-3, '220 ohm');
  near(stressed('470'), 6.8e-3, 1e-3, '470 ohm');
  const mid = (r) => {
    const e = bench({}, led(r));
    assert.ok(e.start('dc', 5e-4));
    e.set('environment', 'angle', 90);
    for (let k = 0; k < 30; k++) e.advance(5e-4);
    const reading = e.read();
    return Object.values(e.stresses(reading).U1 ?? []).filter((s) => s.code === 'SIM_OVER_CURRENT' && s.ratio > 1);
  };
  assert.equal(mid('220').length, 1);
  assert.equal(mid('470').length, 0);
});

test('encoder in the engine: + unconnected with CLK on a board is the note SIM_ENCODER_FLOATING', () => {
  const spec = {
    parts: [{ id: 'U1', type: 'rotary-encoder' }, { id: 'B1', part: 'UNO' }],
    nets: [['U1.GND', 'B1.GND'], ['U1.CLK', 'B1.D2']],
  };
  const r = autoLayout(spec);
  assert.equal(r.status, 'done', JSON.stringify(r.problems));
  const result = simulate(r.circuit, { analysis: 'dc' });
  assert.ok(result.issues.some((i) => i.code === 'SIM_ENCODER_FLOATING'), JSON.stringify(result.issues.map((i) => i.code)));
  const wired = autoLayout({ parts: spec.parts, nets: [...spec.nets, ['U1.+', 'B1.5V']] });
  assert.ok(!simulate(wired.circuit, { analysis: 'dc' }).issues.some((i) => i.code === 'SIM_ENCODER_FLOATING'));
});

test('encoder: the part resolves with KY-040 and refuses another pulses/detents pair', () => {
  assert.equal(resolvePart({ id: 'U1', type: 'rotary-encoder' }).part.type, 'rotary-encoder');
  assert.equal(resolvePart({ id: 'U1', part: 'KY-040' }).part.type, 'rotary-encoder');
  const r = autoLayout({ parts: [{ id: 'U1', type: 'rotary-encoder', pulses: 30, detents: 30 }], nets: [] });
  assert.ok(JSON.stringify(r).includes('BAD_VALUE'), JSON.stringify(r.problems));
});

test('encoder: the card never writes 360 for a shaft a hair under it', () => {
  const e = bench({ angle: 359.97 });
  assert.ok(e.start('dc', 1e-3));
  assert.equal(e.read().parts.U1.shaftShown, 0);
});

test('encoder-dimmer-uno: the count stops at 0, so 5 clicks back and one forward light the LED', () => {
  const circuit = autoLayout(expandRecipe('encoder-dimmer-uno').spec).circuit;
  const e = createEngine(compile(circuit).program);
  assert.ok(e.start('dc', 1e-3));
  const go = (secs) => { const t0 = e.time; while (e.time - t0 < secs - 1e-9) assert.ok(e.advance(Math.min(1e-3, e.stepHint() ?? 1e-3))); };
  e.set('environment', 'angle', 270); // 270 is 5 clicks counter-clockwise from 0
  go(0.5);
  assert.equal(e.read().parts.U1.program.serial.at(-1) ?? '0', '0');
  e.set('environment', 'angle', 288);
  go(0.5);
  const clicks = e.read().parts.U1.program.serial.at(-1);
  assert.equal(clicks, '1');
  let lit = 0;
  for (let k = 0; k < 400; k++) { e.advance(1e-3); lit = Math.max(lit, e.read().parts.D1.brightness ?? 0); }
  assert.ok(lit > 0.01, `the LED lights: ${lit}`);
});

// With + connected nowhere the note is raised whatever the pin does, and its text is true for both: a pin set as
// INPUT reads a fixed 0 (nothing drives the line), one set as INPUT_PULLUP reads a clean 1 through its own pull-up.
test('encoder: SIM_ENCODER_FLOATING is true for INPUT and for INPUT_PULLUP', async () => {
  const { formatIssue } = await import('../src/index.js');
  for (const [mode, level] of [['INPUT', 0], ['INPUT_PULLUP', 1]]) {
    const program = `void setup(){Serial.begin(9600);pinMode(2,${mode});} void loop(){Serial.println(digitalRead(2));delay(50);}`;
    const r = autoLayout({ parts: [{ id: 'U1', type: 'rotary-encoder' }, { id: 'B1', part: 'UNO', program }], nets: [['U1.GND', 'B1.GND'], ['U1.CLK', 'B1.D2']] });
    assert.equal(r.status, 'done', JSON.stringify(r.problems));
    const issue = simulate(r.circuit, { analysis: 'dc' }).issues.find((i) => i.code === 'SIM_ENCODER_FLOATING');
    assert.ok(issue, `${mode}: the note is raised`);
    const e = createEngine(compile(r.circuit).program);
    assert.ok(e.start('dc', 1e-3));
    for (let t = 0; t < 0.3; t += 1e-3) assert.ok(e.advance(1e-3));
    const serial = e.read().parts.B1.program.serial;
    assert.equal(String(serial[serial.length - 1]).trim(), String(level), `${mode} reads ${level}`);
    for (const lang of ['en', 'es']) {
      const text = formatIssue(issue, lang);
      assert.ok(text.includes('INPUT_PULLUP') && text.includes('INPUT'), `${lang}: ${text}`);
    }
  }
});

test('encoder-dimmer-uno: analogWrite never gets more than 255 (20 clicks at the step the sketch writes)', () => {
  const sketch = expandRecipe('encoder-dimmer-uno').spec.parts.find((p) => p.id === 'U1').program;
  const step = Number(/analogWrite\(LED_PIN, count \* (\d+)\)/.exec(sketch)?.[1]);
  const top = Number(/constrain\(count, 0, (\d+)\)/.exec(sketch)?.[1]);
  assert.ok(step > 0 && top > 0, 'the sketch writes count times a step');
  assert.ok(step * top <= 255, `${top} clicks · ${step} = ${step * top}`);
});
