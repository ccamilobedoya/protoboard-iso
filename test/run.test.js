// What a circuit does over time, from the command line (simulate --run, src/sim/run.js), and the
// op-amp relaxation oscillator that used to stop at its first switch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';
import { simulate, checkHazards } from '../src/sim/index.js';
import { runCircuit, parseStimuli, stimuliFromArgs } from '../src/sim/run.js';
import { autoLayout, formatLayout } from '../src/layout.js';
import { expandRecipe } from '../src/recipes/index.js';
import { review, formatReview } from '../src/review.js';
import { formatIssue, t } from '../src/index.js';
import { LIMITS } from '../src/limits.js';

const root = new URL('..', import.meta.url).pathname;
const bin = join(root, 'bin', 'protoboard-iso.js');
const cli = (args) => spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
const codes = (issues) => issues.map((i) => i.code);
// Each recipe laid out once.
const laid = new Map();
const recipe = (name, values) => {
  const key = JSON.stringify([name, values ?? null]);
  if (!laid.has(key)) laid.set(key, autoLayout(expandRecipe(name, values).spec).circuit);
  return laid.get(key);
};
const run = (circuit, seconds, given = {}) => {
  const { stimuli, errors } = parseStimuli(given);
  assert.deepEqual(errors, []);
  return runCircuit(circuit, { seconds, stimuli });
};
const output = (r, id) => r.outputs.find((o) => o.id === id);
// The time an output is on inside [from, to].
const onBetween = (o, from, to) => o.intervals.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, to) - Math.max(a, from)), 0);

// An LM358 relaxation oscillator on 9 V: R3/R4 make a mid-supply of 4.5 V behind 500 Ω, R2 and R1
// the Schmitt trigger's divider, R5 and C1 the timing.
const OSCILLATOR = {
  supplies: [{ id: 'V1', kind: 'bench', voltage: 9, positive: 'T+', negative: 'T-' }],
  parts: [
    { id: 'U1', part: 'LM358' },
    { id: 'R1', type: 'resistor', value: '10k' },
    { id: 'R2', type: 'resistor', value: '10k' },
    { id: 'R3', type: 'resistor', value: '1k' },
    { id: 'R4', type: 'resistor', value: '1k' },
    { id: 'R5', type: 'resistor', value: '47k' },
    { id: 'C1', type: 'capacitor', value: '10n' },
  ],
  nets: [
    ['T+', 'U1.VCC', 'R3.1'],
    ['T-', 'U1.GND', 'R4.2', 'C1.2'],
    ['R3.2', 'R4.1', 'R2.2'],
    ['R2.1', 'R1.1', 'U1.IN1+'],
    ['R1.2', 'U1.OUT1', 'R5.1'],
    ['R5.2', 'C1.1', 'U1.IN1-'],
  ],
};
let oscillator = null;
const oscillatorCircuit = () => (oscillator ??= autoLayout(OSCILLATOR).circuit);

// Rising crossings of a series through a level, interpolated between samples.
function risings(times, values, level) {
  const out = [];
  for (let k = 1; k < values.length; k++) {
    const [a, b] = [values[k - 1], values[k]];
    if (a < level && b >= level) out.push(times[k - 1] + ((level - a) / (b - a)) * (times[k] - times[k - 1]));
  }
  return out;
}

test('op-amp relaxation oscillator: the transient goes past its first switch and oscillates near the formula', () => {
  const r = simulate(oscillatorCircuit(), { analysis: 'transient', stop: 0.01, step: 5e-6, points: 5000 });
  assert.ok(r.ok, JSON.stringify(r.issues));
  // The output: the node that swings from near 0 V to near the top rail (7.5 V on 9 V).
  const node = Object.keys(r.nodes).find((n) => r.nodes[n] && Math.max(...r.nodes[n]) > 7 && Math.min(...r.nodes[n].slice(1000)) < 0.5);
  assert.ok(node, 'a node swings rail to rail');
  const ups = risings(r.times, r.nodes[node], 3.75).slice(2);
  assert.ok(ups.length >= 4, `${ups.length} periods`);
  const period = (ups.at(-1) - ups[0]) / (ups.length - 1);
  // Textbook, rails ideal and symmetric: T = 2·R5·C1·ln((1 + β) / (1 − β)), β = R2 / (R1 + R2) = 1/2.
  const formula = 1 / (2 * 47e3 * 10e-9 * Math.log(3));
  assert.ok(Math.abs(1 / period - formula) / formula < 0.1, `${(1 / period).toFixed(0)} Hz against ${formula.toFixed(0)} Hz`);
});

test('uno-blink: D1 and the pin toggle at the sketch\'s 500 ms + 500 ms, 1 Hz, half the time on', () => {
  const r = run(recipe('uno-blink'), 4);
  assert.ok(r.ok, JSON.stringify(r.issues));
  for (const id of ['D1', 'U1.D13']) {
    const o = output(r, id);
    assert.ok(o, id);
    assert.ok(Math.abs(o.frequency - 1) < 0.01, `${id} ${o.frequency} Hz`);
    assert.ok(Math.abs(o.duty - 0.5) < 0.01, `${id} duty ${o.duty}`);
    assert.ok(Math.abs(o.onShare - 0.5) < 0.01);
  }
  assert.equal(output(r, 'U1.D13').kind, 'pin');
  assert.equal(output(r, 'D1').kind, 'led');
  assert.equal(r.run.seconds, 4);
  assert.equal(r.serial.count, 0);
});

test('uno-button: off without a press; pressed at 0.3 s for 0.4 s, on for 0.4 s', () => {
  const circuit = recipe('uno-button');
  const still = run(circuit, 1);
  assert.equal(output(still, 'D1').onShare, 0);
  assert.equal(output(still, 'D1').changes, 0);
  const pressed = run(circuit, 1, { press: ['S1@0.3+0.4'] });
  const d1 = output(pressed, 'D1');
  assert.equal(d1.intervals.length, 1);
  const [on, off] = d1.intervals[0];
  assert.ok(Math.abs(on - 0.3) < 0.02 && Math.abs(off - on - 0.4) < 0.02, JSON.stringify(d1.intervals));
});

test('distance-alarm-uno: lit at 10 cm, dark at 50 cm; the program prints the distance', () => {
  const circuit = recipe('distance-alarm-uno');
  const near = run(circuit, 1, { env: ['distance=10'] });
  assert.ok(onBetween(output(near, 'D1'), 0.5, 1) > 0.25);
  assert.ok(near.serial.count >= 9 && near.serial.lines.every((l) => l.text === '10'), JSON.stringify(near.serial.lines.slice(0, 3)));
  assert.ok(near.serial.lines.every((l, k, all) => k === 0 || l.t > all[k - 1].t), 'in order, with their time');
  const far = run(circuit, 1, { env: ['distance=50'] });
  assert.equal(onBetween(output(far, 'D1'), 0.5, 1), 0);
  // The TRIG pin: a 10 µs pulse each loop, about every 100 ms.
  assert.ok(Math.abs(output(far, 'U1.D9').period - 0.1) < 0.005);
});

test('555-astable: the LED blinks at 1.44 / ((R1 + 2·R2)·C1) within 5 %', () => {
  const r = run(recipe('555-astable'), 1);
  const formula = 1.44 / ((1e3 + 2 * 10e3) * 10e-6);
  const d1 = output(r, 'D1');
  assert.ok(Math.abs(d1.frequency - formula) / formula < 0.05, `${d1.frequency} Hz, formula ${formula} Hz`);
});

test('ldr-night-light: lit after it gets dark at 0.5 s, not before', () => {
  const r = run(recipe('ldr-night-light'), 1, { at: ['0.5:light=0.1'] });
  const d1 = output(r, 'D1');
  assert.equal(onBetween(d1, 0, 0.5), 0);
  assert.ok(onBetween(d1, 0.5, 1) > 0.45, JSON.stringify(d1.intervals));
});

test('--set: a potentiometer\'s position and a sensor\'s own field for the run', () => {
  // uno-pot-pwm: RV1's wiper on A0; position 0.8 reads 205 (its 0 end is pin 1, on 5 V), PWM 51/255.
  const pot = recipe('uno-pot-pwm');
  for (const [position, reading] of [[0.8, 205], [0.2, 818]]) {
    const r = run(pot, 1, { set: [`RV1=${position}`] });
    const values = r.serial.lines.map((l) => Number(l.text));
    assert.ok(values.length >= 4 && values.every((v) => Math.abs(v - reading) <= 2), `${position}: ${values}`);
    const d9 = output(r, 'U1.D9');
    assert.ok(Math.abs(d9.duty - Math.floor(reading / 4) / 255) < 0.03, `duty ${d9.duty}`);
    assert.ok(Math.abs(d9.frequency - 490) < 5, `${d9.frequency} Hz`);
  }
  // lm35-uno: U2's own temperature (a field of the part, not of the environment).
  const warm = run(recipe('lm35-uno'), 1, { set: ['U2=40'] });
  assert.ok(warm.serial.lines.every((l) => Math.abs(Number.parseFloat(l.text) - 40) < 0.6), JSON.stringify(warm.serial.lines));
  // potentiometer-led, no program: the wiper at its two ends.
  const led = recipe('potentiometer-led');
  const ends = [0, 1].map((position) => output(run(led, 0.2, { set: [`RV1.position=${position}`] }), 'D1').onShare);
  assert.deepEqual(ends.map((x) => Math.round(x)).sort(), [0, 1], `the LED is on at one end only: ${ends}`);
});

test('--env on a sensor with a value of its own: it follows the field, and the run says so', () => {
  const r = run(recipe('lm35-uno'), 1, { env: ['temperature=30'] });
  assert.ok(r.serial.lines.every((l) => Math.abs(Number.parseFloat(l.text) - 30) < 0.6), JSON.stringify(r.serial.lines));
  assert.ok(codes(r.issues).includes('RUN_ENV_ATTACHED'));
  assert.ok(codes(run(recipe('uno-blink'), 0.1, { env: ['light=50'] }).issues).includes('RUN_ENV_UNUSED'));
});

test('stimuli that name nothing, or a value out of range, are input errors with one line each', () => {
  const circuit = recipe('uno-button');
  const refused = (given, code) => {
    const { stimuli, errors } = parseStimuli(given);
    const r = errors.length ? { errors } : runCircuit(circuit, { seconds: 0.1, stimuli });
    assert.ok(r.errors?.length, JSON.stringify(given));
    assert.equal(r.errors[0].code, code, JSON.stringify(r.errors));
    return formatIssue(r.errors[0], 'en');
  };
  assert.match(refused({ env: ['nonsense=1'] }, 'ENV_UNKNOWN_FIELD'), /"nonsense"/);
  assert.match(refused({ env: ['light=0'] }, 'RUN_ENV_RANGE'), /light.*0\.1 … 10000 lx/);
  assert.match(refused({ set: ['X9=1'] }, 'RUN_UNKNOWN_CONTROL'), /X9/);
  assert.match(refused({ set: ['S1=maybe'] }, 'RUN_BAD_VALUE'), /on \/ off/);
  assert.match(refused({ set: ['R1=-5'] }, 'RUN_BAD_VALUE'), /R1\.resistance/);
  assert.match(refused({ press: ['S1@0.3'] }, 'RUN_BAD_STIMULUS'), /SW1@0\.5\+0\.2/);
  assert.match(refused({ press: ['R1@0.1+0.1'] }, 'RUN_NOT_A_BUTTON'), /R1/);
  assert.match(refused({ at: ['soon:light=1'] }, 'RUN_BAD_STIMULUS'), /--at/);
  assert.match(refused({ set: ['S1.colour=1'] }, 'RUN_UNKNOWN_FIELD'), /pressed/);
  for (const seconds of [0, -1, Number.NaN, 'x']) assert.equal(runCircuit(circuit, { seconds }).errors[0].code, 'RUN_BAD_TIME');
  for (const lang of ['en', 'es']) assert.doesNotMatch(t(lang, 'check.RUN_ENV_RANGE'), /^check\./);
});

test('bounded: a run past the cap is capped and says so; a sketch that never lets time pass ends with the stuck warning', () => {
  const blink = recipe('uno-blink');
  const capped = runCircuit(blink, { seconds: 1e5, budgetMs: 300 });
  assert.ok(codes(capped.issues).includes('RUN_CAPPED'));
  assert.ok(capped.run.seconds <= LIMITS.runSeconds);
  const stuck = recipe('uno-blink', { U1: 'void setup(){} void loop(){ while(1){} }' });
  const began = Date.now();
  const r = runCircuit(stuck, { seconds: 5 });
  assert.ok(Date.now() - began < 20000);
  assert.ok(codes(r.issues).includes('SIM_PROGRAM_STUCK'), JSON.stringify(codes(r.issues)));
  // The machine's budget: a run that would take longer ends where it got to, and says so.
  const slow = runCircuit(recipe('555-astable'), { seconds: 50, budgetMs: 200 });
  assert.ok(codes(slow.issues).includes('RUN_BUDGET'));
  assert.ok(slow.run.seconds < 50);
});

test('a long Serial story keeps its first and last lines and the true count', () => {
  const chatty = recipe('uno-blink', { U1: 'int n = 0;\nvoid setup(){ Serial.begin(9600); }\nvoid loop(){ Serial.println(n); n++; delay(1); }' });
  const r = runCircuit(chatty, { seconds: 1 });
  assert.ok(r.serial.count > 900, `${r.serial.count}`);
  assert.equal(r.serial.lines.length, LIMITS.runSerialLines);
  assert.equal(r.serial.lines[0].text, '0');
  assert.equal(Number(r.serial.lines.at(-1).text), r.serial.count - 1);
  assert.ok(r.serial.lines.at(-1).t > 0.99);
});

test('MCP arguments take the same shapes as the command line', () => {
  const a = stimuliFromArgs({ environment: { distance: 10 }, set: { RV1: 0.8 }, press: [{ part: 'S1', at: 0.5, duration: 0.2 }], at: [{ time: 1, field: 'light', value: 0.5 }] });
  const b = parseStimuli({ env: ['distance=10'], set: ['RV1=0.8'], press: ['S1@0.5+0.2'], at: ['1:light=0.5'] });
  assert.deepEqual(a, b);
});

test('the op-amp oscillator over time: its output toggles near the formula, also in layout\'s answer', () => {
  const r = runCircuit(oscillatorCircuit(), { seconds: 0.05 });
  const out = output(r, 'U1.OUT1');
  const formula = 1 / (2 * 47e3 * 10e-9 * Math.log(3));
  assert.ok(Math.abs(out.frequency - formula) / formula < 0.1, `${out.frequency} Hz`);
  const answer = formatLayout(autoLayout(OSCILLATOR), 'en', { t, formatIssue });
  // Its line names the frequency, or (on a machine busy enough to pass the bound) says it was not measured.
  assert.match(answer, /\nBehaviour, first 2 s(?: \(simulated, a model\): U1\.OUT1 \d+ Hz, on \d+ % of the time|: not measured, the run took more than 800 ms of the machine's time \(simulate --run 2 measures it\)\.)\n/);
});

test('layout\'s answer: a frequency for uno-blink, no behaviour line for led-resistor; both DONE', () => {
  const blink = formatLayout(autoLayout(expandRecipe('uno-blink').spec), 'en', { t, formatIssue });
  assert.match(blink, /\nBehaviour, first 2 s \(simulated, a model\): D1 1 Hz, on 50 % of the time/);
  assert.match(blink, /\nSTATUS: DONE/);
  const led = formatLayout(autoLayout(expandRecipe('led-resistor').spec), 'es', { t, formatIssue });
  assert.doesNotMatch(led, /Hz|Comportamiento/);
  assert.match(led, /\nSTATUS: DONE/);
  const es = formatLayout(autoLayout(expandRecipe('uno-blink').spec), 'es', { t, formatIssue });
  assert.match(es, /\nComportamiento, primeros 2 s \(simulado, un modelo\): D1 1 Hz, encendido el 50 % del tiempo/);
});

test('Checked: a sensor visited at both ends of its field says which field', () => {
  const circuit = recipe('ldr-night-light');
  assert.ok(checkHazards(circuit).states.environment > 0);
  const en = formatReview(review(circuit, { lang: 'en' }), 'en', { t, formatIssue });
  assert.match(en, /Checked: at rest, light at both ends/);
  const es = formatReview(review(circuit, { lang: 'es' }), 'es', { t, formatIssue });
  assert.match(es, /Revisado: en reposo, luz en sus dos extremos/);
});

// ── The command line ──────────────────────────────────────────────────────────────────

test('simulate --run on the command line: the JSON shape, the text, nothing saved, errors exit 1', () => {
  const dir = tempDir('pbi-run-');
  const target = join(dir, 'alarm');
  const made = cli(['layout', target, '--recipe', 'distance-alarm-uno']);
  assert.equal(made.status, 0, made.stdout);
  const before = readFileSync(join(target, 'circuit.json'));
  const history = existsSync(join(target, 'history.jsonl')) ? readFileSync(join(target, 'history.jsonl')) : null;
  const r = cli(['simulate', target, '--run', '1', '--env', 'distance=10', '--json']);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  for (const key of ['ok', 'run', 'serial', 'outputs', 'readings', 'issues']) assert.ok(key in out, key);
  assert.equal(out.run.seconds, 1);
  const d1 = out.outputs.find((o) => o.id === 'D1');
  for (const key of ['kind', 'onShare', 'changes', 'frequency', 'period', 'duty', 'intervals']) assert.ok(key in d1, key);
  assert.ok(out.readings.parts.D1.current > 5e-3);
  const text = cli(['simulate', target, '--run', '1', '--env', 'distance=10', '--at', '0.5:distance=50']);
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /^Run from switch-on/);
  assert.match(text.stdout, /\nSerial \(10 lines, in order\):\n/);
  assert.match(text.stdout, /\n {2}D1 \(LED\): on 5\d % of the time · changes: 2 \(on /);
  assert.match(text.stdout, /\nReadings at 1 s:\n/);
  assert.deepEqual(readFileSync(join(target, 'circuit.json')), before, 'the circuit is the same, byte for byte');
  assert.deepEqual(existsSync(join(target, 'history.jsonl')) ? readFileSync(join(target, 'history.jsonl')) : null, history);
  const bad = cli(['simulate', target, '--run', '1', '--env', 'nonsense=1']);
  assert.equal(bad.status, 1);
  assert.equal(bad.stderr.trim().split('\n').length, 1);
  assert.match(bad.stderr, /nonsense/);
  assert.equal(cli(['simulate', target, '--run', '1', '--transient', '1']).status, 1);
  assert.equal(cli(['simulate', target, '--transient', '1', '--press', 'U2@0+1']).status, 1);
  // --transient runs the program as the page does, and says where --run is.
  const tr = cli(['simulate', target, '--transient', '1,0.01', '--env', 'distance=10', '--json']);
  const series = JSON.parse(tr.stdout);
  assert.ok(Math.max(...series.parts.D1.current) > 5e-3, 'the LED lit in the transient');
  assert.match(cli(['simulate', target, '--transient', '1,0.01']).stdout, /simulate <target> --run <seconds>/);
});

test('simulate without a program or an oscillator says what it said before (first line, last line, count)', () => {
  const dir = tempDir('pbi-run-');
  // Recorded before --run existed: [first line, last line, number of lines].
  const recorded = {
    'led-resistor': ['DC operating point — a model, not a measurement (11 Newton iterations).', '  W1     -491 µV    -9.81 mA   4.81 µW', 12],
    divider: ['DC operating point — a model, not a measurement (2 Newton iterations).', '  W2     22.5 µV    450 µA     10.1 nW', 14],
    'npn-switch': ['DC operating point — a model, not a measurement (16 Newton iterations).', '  W5     25.9 pV    518 pA     0 W', 28],
  };
  for (const [name, [first, last, count]] of Object.entries(recorded)) {
    const target = join(dir, name);
    assert.equal(cli(['layout', target, '--recipe', name]).status, 0);
    const lines = cli(['simulate', target]).stdout.trimEnd().split('\n');
    assert.equal(lines[0], first, name);
    assert.equal(lines.at(-1), last, name);
    assert.equal(lines.length, count, name);
  }
});
