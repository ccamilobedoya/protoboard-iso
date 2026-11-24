// Each test written from a reproduction: a run's step, the
// warnings a run keeps, a tune's notes, a supply past what it gives, the flyback advice, a logic input
// over its supply, the chips' drive figures, layout's readings and the small texts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { runCircuit, RUN_STEPS, behaviourOf } from '../src/sim/run.js';
import { autoLayout } from './layout-generous.js';
import { formatLayout } from '../src/layout.js';
import { expandRecipe } from '../src/recipes/index.js';
import { formatIssue, t } from '../src/index.js';
import { formatRun } from '../src/sim/format.js';
import { formatReview } from '../src/review.js';
import { specWithFix } from '../src/fix.js';

const laid = new Map();
const recipe = (name, values) => {
  const key = JSON.stringify([name, values ?? null]);
  if (!laid.has(key)) laid.set(key, autoLayout(expandRecipe(name, values).spec).circuit);
  return laid.get(key);
};
const output = (r, id) => r.outputs.find((o) => o.id === id);
const codes = (r) => r.issues.map((i) => i.code);
const text = (r) => formatRun(r, 'en', { formatIssue });

// ── 1. A run's step lets it finish ───────────────────────────────────────────────────────

// regulator-7805's decoupling capacitors make the page step 100 ps: a run of 1 s was 1.7 million steps
// and stopped at 173 µs. Now its steps are 1 s / 20000 and the run says what it steps over.
test('a run of the 7805 regulator finishes in its length over RUN_STEPS steps and names the time constant it steps over', () => {
  const r = runCircuit(recipe('regulator-7805'), { seconds: 1 });
  assert.ok(r.ok);
  assert.equal(r.run.ran, 1);
  assert.equal(r.run.steps, RUN_STEPS);
  assert.ok(Math.abs(r.run.step - 1 / RUN_STEPS) < 1e-12);
  assert.ok(!codes(r).includes('RUN_BUDGET'), codes(r).join());
  const lines = text(r).split('\n');
  assert.match(lines[0], /1 s in steps of 50 µs \(20000 steps\)/);
  const over = r.issues.filter((i) => /^RUN_STEP_OVER/.test(i.code));
  assert.equal(over.length, 1);
  assert.match(formatIssue(over[0], 'en'), /steps of 50 µs are longer than 2 of the circuit's time constants, the slowest C1's of 33 ns/);
});

// relay-npn with a press used to stall near 0.5 s (steps of 1 µs): the same run now ends, the relay
// following the press.
test('relay-npn pressed for a second in a run of 3 s gets to its end, the relay closed while pressed', () => {
  const r = runCircuit(recipe('relay-npn'), { seconds: 3, stimuli: { press: [{ name: 'S1', at: 0.5, duration: 1 }] } });
  assert.equal(r.run.ran, 3);
  assert.ok(r.run.steps <= RUN_STEPS + 2, String(r.run.steps));
  const [[on, off]] = output(r, 'K1').intervals;
  assert.ok(on > 0.5 && on < 0.52 && Math.abs(off - 1.5) < 0.01, JSON.stringify(output(r, 'K1').intervals));
});

// A 555 with small capacitors: at 10 nF it runs at 1.44 / (21 kΩ · 10 nF) = 6.86 kHz, a period of
// 146 µs, faster than steps of 150 µs. The run measures it again in a shorter run whose step follows
// it, says so, and the figure is the formula's within 3 %.
test('a 555 faster than the run\'s step is measured again in a shorter run, within 3 % of its formula', () => {
  const formula = 1.44 / (21e3 * 10e-9);
  const r = runCircuit(recipe('555-astable', { C1: '10n' }), { seconds: 3 });
  const d1 = output(r, 'D1');
  assert.ok(d1.measured && d1.measured.seconds < 3, JSON.stringify(d1));
  assert.ok(Math.abs(d1.frequency / formula - 1) < 0.03, `${d1.frequency} Hz against ${formula}`);
  assert.match(text(r), /D1 \(LED\): 6\.\d+ kHz, on 51 % of the time \(period 1\d\d µs\), measured in the first \d+ ms in steps of [\d.]+ [nµ]s/);
  // With no shorter run allowed, it gives no figure and says how short a run measures it.
  const bare = runCircuit(recipe('555-astable', { C1: '10n' }), { seconds: 3, remeasure: 0 });
  assert.equal(output(bare, 'D1').frequency, null);
  assert.equal(output(bare, 'D1').fast, true);
  const note = bare.issues.find((i) => i.code === 'RUN_TOO_FAST');
  assert.match(formatIssue(note, 'en'), /D1: changes faster than this run's steps of 150 µs can follow, so the run gives no frequency or duty for it\. A --run of [\d.]+ m?s or shorter/);
  assert.match(text(bare), /D1 \(LED\): changes faster than this run's steps follow; on about 5\d % of the time, no frequency/);
});

// The recipe's own 555 (6.86 Hz) at steps of 150 µs: within 3 % of the formula, and the same as before
// the step changed (6.736 Hz in the page's 22 µs steps).
test('555-astable over 3 s: within 3 % of 1.44 / ((R1 + 2 R2) C1) at the run\'s step', () => {
  const r = runCircuit(recipe('555-astable'), { seconds: 3 });
  const f = output(r, 'D1').frequency;
  assert.ok(Math.abs(f / (1.44 / (21e3 * 10e-6)) - 1) < 0.03, String(f));
  assert.ok(Math.abs(f / 6.736 - 1) < 0.005, String(f));
});

// The Behaviour line is a run of 2 s: the same step, the same figures.
test('layout\'s Behaviour line and a run of the same length give the same figures for a fast 555', () => {
  const c = recipe('555-astable', { C1: '100n' });
  const b = behaviourOf(c);
  const r = runCircuit(c, { seconds: 2 });
  assert.equal(output(b, 'D1').frequency, output(r, 'D1').frequency);
  assert.equal(output(b, 'D1').duty, output(r, 'D1').duty);
});

// A run of the same circuit gets to its end whatever its length: the count of steps does not grow.
test('motor-npn: runs of 0.5, 3 and 30 s take the same count of steps', () => {
  for (const seconds of [0.5, 3, 30]) {
    const r = runCircuit(recipe('motor-npn'), { seconds, budgetMs: 60_000 });
    assert.equal(r.run.ran, seconds);
    assert.equal(r.run.steps, RUN_STEPS, `${seconds} s: ${r.run.steps}`);
  }
});

// ── 2. A warning seen in passing is not a finding ────────────────────────────────────────

// An ESP32 switching four relays through a ULN2003, one at a time each second: K1's coil current rises
// through the band under its pull-in (49.9 mA at 2.6 ms) and it pulls in at 8.25 ms. A run of 0.5 s
// warned that it may not pull in; one of 1.5 s did not. Now neither does, whatever the length.
const RELAYS = {
  parts: [
    { id: 'U1', part: 'ESP32-DEVKIT', program: 'const int pins[4] = {16, 17, 18, 19};\nint k = 0;\nvoid setup() { for (int i = 0; i < 4; i++) { pinMode(pins[i], OUTPUT); digitalWrite(pins[i], LOW); } }\nvoid loop() { digitalWrite(pins[k], HIGH); delay(1000); digitalWrite(pins[k], LOW); k = (k + 1) % 4; }' },
    { id: 'U2', part: 'ULN2003' },
    ...[1, 2, 3, 4].map((k) => ({ id: `K${k}`, part: 'SRD-05VDC-SL-C' })),
  ],
  nets: [
    ...[16, 17, 18, 19].map((p, k) => [`U1.D${p}`, `U2.IN${k + 1}`]),
    ['U1.VIN', 'U2.COM', 'K1.A1', 'K2.A1', 'K3.A1', 'K4.A1'],
    ['U1.GND', 'U2.GND'],
    ...[1, 2, 3, 4].map((k) => [`U2.OUT${k}`, `K${k}.A2`]),
  ],
};
test('a coil whose current passes through the band on its way to pulling in is not under-driven, at any run length', () => {
  const c = autoLayout(RELAYS).circuit;
  const warned = [0.5, 1.5, 2.5].map((seconds) => runCircuit(c, { seconds, budgetMs: 60_000 }).issues.filter((i) => i.severity !== 'info' && !/^RUN_/.test(i.code)).map((i) => `${i.code}:${i.params.part}`).sort());
  assert.ok(!warned[0].some((w) => w.startsWith('SIM_RELAY_UNDERDRIVEN')), warned[0].join());
  assert.deepEqual(warned[1], warned[0]);
  assert.deepEqual(warned[2], warned[0]);
});

// A coil held in the band (47 Ω in series from 5 V: about 42 mA, under its 53.6 mA) is a finding in a
// short run and a long one.
test('a coil held under its pull-in current is under-driven in runs of 0.5 s and 3 s', () => {
  const c = autoLayout({ supplies: [{ id: 'V1', voltage: 5 }], parts: [{ id: 'R1', type: 'resistor', value: '47' }, { id: 'K1', part: 'SRD-05VDC-SL-C' }], nets: [['T+', 'R1.1'], ['R1.2', 'K1.A1'], ['K1.A2', 'T-']] }).circuit;
  for (const seconds of [0.5, 3]) {
    const r = runCircuit(c, { seconds });
    assert.ok(codes(r).includes('SIM_RELAY_UNDERDRIVEN'), `${seconds} s: ${codes(r).join()}`);
  }
});

// ── 6. A logic input over its supply: every pin, the cause and the fix ───────────────────

// A 74HC595 fed 3.3 V and driven by an UNO's 5 V pins: SER and RCLK were flagged, SRCLK (a clock
// pulsed inside shiftOut, never high at a step) was not; no line said the chip is fed less than its
// signals, and there was no fix.
const SHIFT = (extra = []) => ({
  parts: [
    { id: 'U1', part: 'UNO', program: 'int n = 0;\nvoid setup() { pinMode(11, OUTPUT); pinMode(12, OUTPUT); pinMode(8, OUTPUT); }\nvoid loop() { digitalWrite(8, LOW); shiftOut(11, 12, MSBFIRST, n); digitalWrite(8, HIGH); n = (n + 1) % 256; delay(100); }' },
    { id: 'U2', part: '74HC595' },
    { id: 'R1', type: 'resistor', value: '1k' },
    { id: 'D1', type: 'led', color: 'red' },
  ],
  nets: [['U1.3V3', 'U2.VCC'], ['U1.GND', 'U2.GND', 'U2.OE', 'D1.K'], ['U1.D11', 'U2.SER'], ['U1.D12', 'U2.SRCLK'], ['U1.D8', 'U2.RCLK'], ['U2.QA', 'R1.1'], ['R1.2', 'D1.A'], ...extra],
});
test('a 74HC595 on 3.3 V driven at 5 V: SER, RCLK and SRCLK flagged, each saying the chip is fed less than its signals', () => {
  const r = autoLayout(SHIFT([['U1.3V3', 'U2.SRCLR']]));
  const over = r.review.hazards.filter((h) => h.code === 'SIM_IC_PIN_VOLTAGE');
  assert.deepEqual(over.map((h) => h.params.part).sort(), ['U2.RCLK', 'U2.SER', 'U2.SRCLK']);
  for (const h of over) assert.match(formatIssue(h, 'en'), /more than its maximum 3\.8 V: it can be damaged\. The chip is fed 3\.3 V, less than the signal that drives it: feed it from the signal's voltage, or drive it with 3\.3 V signals/);
  assert.match(formatIssue(over.find((h) => h.params.part === 'U2.SRCLK'), 'en'), /with D12 high\.$/);
  assert.match(formatIssue(over[0], 'es'), /El chip se alimenta con 3,3 V, menos que la señal que lo maneja/);
  // No rail at 5 V in the circuit: no computed fix, the sentence says what to do.
  assert.equal(r.review.fix ?? null, null);
});

test('with a 5 V rail in the circuit, the fix feeds the chip from it, and the circuit so changed has no hazard', () => {
  const spec = SHIFT([['U1.5V', 'U2.SRCLR']]);
  const r = autoLayout(spec);
  assert.equal(r.review.fix?.kind, 'resupply', JSON.stringify(r.review.fix));
  assert.deepEqual([r.review.fix.part, r.review.fix.pin, r.review.fix.rail], ['U2', 'VCC', 'U1.5V']);
  assert.match(formatReview(r.review, 'en', { t, formatIssue }), /To fix it: feed U2 from U1\.5V \(4\.99 V, the voltage of the signals that drive it\): move its VCC there; that clears every hazard above\./);
  const fixed = autoLayout(specWithFix(spec, r.review.fix).spec);
  assert.deepEqual(fixed.review.hazards, []);
});

// ── 4. A supply past what it can give ────────────────────────────────────────────────────

// An H-bridge on an UNO's 5V with both transistors of a leg on (each pin drives a PNP of one leg and
// the NPN of the other): 721 mA from USB, past the port's and the UNO's fuse's 500 mA, said nothing.
const SHOOT = {
  parts: [
    { id: 'U1', part: 'UNO', program: 'void setup(){pinMode(8,OUTPUT);pinMode(9,OUTPUT);}\nvoid loop(){digitalWrite(8,HIGH);digitalWrite(9,LOW);delay(500);digitalWrite(8,LOW);digitalWrite(9,HIGH);delay(500);}' },
    { id: 'Q1', part: '2N3906' }, { id: 'Q2', part: '2N3906' }, { id: 'Q3', part: '2N2222A' }, { id: 'Q4', part: '2N2222A' },
    ...[1, 2, 3, 4].map((k) => ({ id: `R${k}`, type: 'resistor', value: '1k' })),
    { id: 'M1', type: 'motor' },
  ],
  nets: [['U1.5V', 'Q1.E', 'Q2.E'], ['U1.GND', 'Q3.E', 'Q4.E'], ['U1.D8', 'R1.1', 'R4.1'], ['R1.2', 'Q1.B'], ['R3.2', 'Q3.B'], ['U1.D9', 'R2.1', 'R3.1'], ['R2.2', 'Q2.B'], ['R4.2', 'Q4.B'], ['Q1.C', 'Q3.C', 'M1.+'], ['Q2.C', 'Q4.C', 'M1.-']],
};
test('a board on USB past its 500 mA: a hazard on its 5V pin saying the fuse opens, and no resistor in the supply as a fix', () => {
  const r = autoLayout(SHOOT);
  const usb = r.review.hazards.find((h) => h.code === 'SIM_OVER_CURRENT' && h.params.part === 'U1.5V');
  assert.ok(usb, JSON.stringify(r.review.hazards.map((h) => h.params.part)));
  assert.match(formatIssue(usb, 'en'), /^warning: U1\.5V gives \d+ mA from USB, more than the 500 mA a USB port gives: the board's 500 mA resettable fuse opens/);
  assert.ok(!(r.review.fix?.kind === 'add-series' && /U1\.5V/.test(r.review.fix.pin)), JSON.stringify(r.review.fix));
});

test('an UNO\'s 3V3 pin past its regulator\'s 150 mA is a hazard; uno-blink and esp32-led get none', () => {
  const r = autoLayout({ parts: [{ id: 'U1', part: 'UNO', program: 'void setup(){}\nvoid loop(){delay(100);}' }, { id: 'R1', type: 'resistor', value: '10' }], nets: [['U1.3V3', 'R1.1'], ['R1.2', 'U1.GND']] });
  const reg = r.review.hazards.find((h) => h.params.part === 'U1.3V3');
  assert.match(formatIssue(reg, 'en'), /U1\.3V3 gives 3\d\d mA, more than the 150 mA its 3\.3 V regulator gives: its regulator overheats/);
  for (const name of ['uno-blink', 'esp32-led']) assert.ok(!autoLayout(expandRecipe(name).spec).review.hazards.length, name);
});

// ── 5. The flyback advice fits the circuit ───────────────────────────────────────────────

// An H-bridge was told to put "a diode across the motor (cathode to the supply side)", which conducts
// when the bridge reverses. A load switched at both ends needs one from each end to each rail.
const flyback = (spec) => autoLayout(spec).review.doubts.filter((d) => d.code === 'COIL_NO_FLYBACK');
test('an H-bridge with no diodes is told four, one from each end to each rail; with the four, nothing', () => {
  const [w] = flyback(SHOOT);
  assert.equal(w.params.variant, 'motorBridge');
  assert.match(formatIssue(w, 'en'), /M1 is driven from both ends \(Q\d, Q\d\).*A diode across the motor would conduct when the bridge reverses; it takes four \(1N4007\): from each end to the \+ rail \(cathode to \+\) and from the − rail to each end \(anode to −\)\./);
  const four = structuredClone(SHOOT);
  four.parts.push(...[1, 2, 3, 4].map((k) => ({ id: `D${k}`, part: '1N4007' })));
  four.nets.push(['M1.+', 'D1.A', 'D3.K'], ['M1.-', 'D2.A', 'D4.K'], ['U1.5V', 'D1.K', 'D2.K'], ['U1.GND', 'D3.A', 'D4.A']);
  assert.deepEqual(flyback(four), []);
  // A load switched at one end keeps the one diode across it.
  const one = flyback({ supplies: [{ id: 'V1', voltage: 9 }], parts: [{ id: 'R1', type: 'resistor', value: '1k' }, { id: 'Q1', part: '2N2222A' }, { id: 'M1', type: 'motor' }], nets: [['T+', 'M1.+', 'R1.1'], ['R1.2', 'Q1.B'], ['M1.-', 'Q1.C'], ['Q1.E', 'T-']] });
  assert.equal(one[0]?.params.variant, 'motor');
  assert.match(formatIssue(one[0], 'en'), /A diode across the motor \(a 1N4007, its cathode to the supply side\)/);
});

// ── 3. Notes of a tune ───────────────────────────────────────────────────────────────────

// Six notes with tone() reported "beeps: 5 · tone 385 Hz": their average, two of them merged. Now each
// note in order with its start and length, in the text and the JSON; the pin's line agrees.
const TUNE = {
  parts: [
    { id: 'U1', part: 'UNO', program: 'int melody[6] = {262, 330, 392, 523, 392, 330};\nint dur[6] = {300, 300, 300, 600, 300, 300};\nvoid setup() { pinMode(2, INPUT_PULLUP); }\nvoid loop() {\n  if (digitalRead(2) == LOW) {\n    for (int i = 0; i < 6; i++) { tone(8, melody[i], dur[i]); delay(dur[i] + 50); }\n    noTone(8);\n  }\n}' },
    { id: 'S1', type: 'button' },
    { id: 'BZ1', type: 'buzzer' },
  ],
  nets: [['U1.D2', 'S1.1'], ['S1.3', 'U1.GND', 'BZ1.2'], ['U1.D8', 'BZ1.1']],
};
test('a tune of six notes is six notes, each its frequency, start and length, in the text and the JSON', () => {
  const r = runCircuit(autoLayout(TUNE).circuit, { seconds: 3, stimuli: { press: [{ name: 'S1', at: 0.1, duration: 0.2 }] } });
  const bz = output(r, 'BZ1');
  assert.deepEqual(bz.notes.map((n) => Math.round(n.frequency)), [262, 330, 392, 523, 392, 330]);
  assert.deepEqual(bz.notes.map((n) => Math.round(n.length * 100) / 100), [0.3, 0.3, 0.3, 0.6, 0.3, 0.3]);
  for (let k = 1; k < 6; k++) assert.ok(bz.notes[k].start > bz.notes[k - 1].start + bz.notes[k - 1].length);
  assert.equal(bz.tone, null);
  const lines = text(r).split('\n');
  assert.ok(lines.some((l) => /BZ1 \(buzzer\): .* · 6 notes: 262 Hz at 10\d ms for 29\d ms, 330 Hz at 45\d ms for 29\d ms, 392 Hz .* 523 Hz at 1\.15 s for 59\d ms/.test(l)), lines.join('\n'));
  // The pin plays the same notes: not "on < 1 %".
  const pin = lines.find((l) => l.includes('U1.D8 (pin)'));
  assert.match(pin, /plays 6 notes, 262 Hz to 523 Hz/);
  assert.doesNotMatch(pin, /< 1 %/);
});

test('a tone of one frequency keeps its one figure', () => {
  const one = structuredClone(TUNE);
  one.parts[0].program = 'void setup() {}\nvoid loop() { tone(8, 440, 200); delay(400); }';
  const r = runCircuit(autoLayout(one).circuit, { seconds: 2 });
  const bz = output(r, 'BZ1');
  assert.ok(Math.abs(bz.tone.frequency - 440) < 5, JSON.stringify(bz.tone));
  assert.match(text(r), /BZ1 \(buzzer\): .*tone 44\d Hz/);
});

// ── 9. What layout prints for a circuit with nothing that lights ─────────────────────────

// A divider's answer said only "supply 5 V": the 3.33 V asked for was not in it.
test('layout\'s Readings line of a divider gives the voltage of its middle net', () => {
  const r = autoLayout({ supplies: [{ id: 'V1', voltage: 5 }], parts: [{ id: 'R1', type: 'resistor', value: '10k' }, { id: 'R2', type: 'resistor', value: '20k' }], nets: [['T+', 'R1.1'], ['R1.2', 'R2.1'], ['R2.2', 'T-']] });
  const line = formatLayout(r, 'en', { t, formatIssue }).split('\n').find((l) => l.startsWith('Readings'));
  assert.equal(line, 'Readings (at rest, a model): supply 5 V · R1.2 = R2.1 3.33 V');
  // A circuit with an LED keeps its loads, no nets.
  const led = formatLayout(autoLayout(expandRecipe('led-resistor').spec), 'en', { t, formatIssue }).split('\n').find((l) => l.startsWith('Readings'));
  assert.doesNotMatch(led, / = /);
});

// ── 10. Small ───────────────────────────────────────────────────────────────────────────

test('a late change is printed as written, and a press that ends after the run is not a warning', () => {
  const c = recipe('uno-button');
  const late = runCircuit(c, { seconds: 0.5, stimuli: { at: [{ time: 0.3 + 0.5, name: 'S1', value: 'on' }] } });
  assert.match(formatIssue(late.issues.find((i) => i.code === 'RUN_EVENT_LATE'), 'en'), /A change at 0\.8 s comes after the run ends \(0\.5 s\)/);
  const held = runCircuit(c, { seconds: 0.5, stimuli: { press: [{ name: 'S1', at: 0.3, duration: 0.5 }] } });
  assert.ok(!codes(held).includes('RUN_EVENT_LATE'), codes(held).join());
});

// An UNO's TX into an ESP32's RX2 at 5 V, with an LM35 on the UNO: the pin's finding is the same at
// rest and in every state, so it names none ("with the environment's temperature at its minimum").
test('a finding that does not depend on a state names none', () => {
  const r = autoLayout({
    parts: [
      { id: 'U1', part: 'UNO', program: 'void setup() { Serial.begin(9600); }\nvoid loop() { int raw = analogRead(A0); Serial.println(raw * 500.0 / 1024.0, 1); delay(1000); }' },
      { id: 'T1', part: 'LM35DZ' },
      { id: 'U2', part: 'ESP32-DEVKIT', program: 'void setup() { Serial.begin(115200); Serial2.begin(9600, SERIAL_8N1, 16, 17); }\nvoid loop() { if (Serial2.available()) { String line = Serial2.readStringUntil(\'\\n\'); Serial.println(line); } }' },
    ],
    nets: [['T1.+VS', 'U1.5V'], ['T1.GND', 'U1.GND', 'U2.GND'], ['T1.VOUT', 'U1.A0'], ['U1.D1', 'U2.RX2']],
  });
  const rx = [...r.review.doubts, ...r.review.hazards].find((d) => d.params.part === 'U2' || d.params.part === 'U2.RX2');
  assert.ok(rx, JSON.stringify(r.review.doubts.map((d) => d.code)));
  assert.doesNotMatch(formatIssue(rx, 'en'), /temperature|at rest\)/);
});

test('--transient says its table is a sample and gives each series\' peak and frequency', () => {
  const r = spawnSync(process.execPath, [new URL('../bin/protoboard-iso.js', import.meta.url).pathname, 'simulate', new URL('../examples/lm386-amplifier.json', import.meta.url).pathname, '--transient', '0.01,5u'], { encoding: 'utf8' });
  const lines = r.stdout.split('\n');
  assert.match(lines[0], /10 ms solved in steps of 5 µs; the table shows 11 of its 401 samples, 25 µs apart \(--json has them all\)\./);
  assert.match(r.stdout, /\nPeaks over the 10 ms \(and the frequency of what repeats\): .*V\(R1\) [\d.]+ V, (9\d\d Hz|1(\.0\d)? kHz)/);
});

test('a run\'s Serial cut in the text says so on its heading and names --json', () => {
  const r = runCircuit(recipe('uno-distance'), { seconds: 3 });
  assert.match(text(r), /\nSerial \(\d+ lines, in order; the first and last 5 here, --json has \d+ of them\):\n/);
});

// ── 7. The CD4017's drive, said as it is ────────────────────────────────────────────────

// chips.md said "about 3 mA at 5 V" and an LED on a CD4017 at 9 V took 9.6 to 11.3 mA with nothing
// said. The catalog's line and the reference now give the kit's own figures at 5, 9 and 12 V.
test('the CD4017\'s figures for an LED straight on an output are the ones the kit computes, at 5, 9 and 12 V', async () => {
  const { simulate } = await import('../src/sim/index.js');
  const { catalogEntry, formatCatalogEntry } = await import('../src/node/catalog.js');
  const { readFileSync } = await import('node:fs');
  const said = { 5: 3.3, 9: 15, 12: 28 };
  for (const [v, mA] of Object.entries(said)) {
    const r = autoLayout({ supplies: [{ id: 'V1', voltage: Number(v) }], parts: [{ id: 'U1', part: 'CD4017' }, { id: 'D1', type: 'led', color: 'red' }], nets: [['T+', 'U1.VDD'], ['T-', 'U1.VSS', 'U1.MR', 'U1.CE', 'U1.CLK', 'D1.K'], ['U1.Q0', 'D1.A']] });
    const got = simulate(r.circuit).parts.D1.current * 1e3;
    assert.ok(Math.abs(got / mA - 1) < 0.1, `${v} V: ${got} mA, said ${mA}`);
  }
  const line = formatCatalogEntry(catalogEntry('CD4017', 'en'), 'en');
  assert.match(line, /about 3\.3 mA at 5 V, 15 mA at 9 V \(over the chip's power: a ⚠\) and 28 mA at 12 V; above 10 V the kit's figure likely overestimates/);
  assert.match(readFileSync(new URL('../plugin-src/references/chips.md', import.meta.url), 'utf8'), /3\.3 mA at 5 V, 15 mA at 9 V \(over the chip's power, a ⚠\) and 28 mA at 12 V/);
});

// ── 8. The LM386 with no loudspeaker, said once; an amplifier that clips, said ──────────

// At gain 200 a 20 mV input drives the LM386 into its rails on 9 V (±3.4 V across the load) with
// nothing said; at gain 20 and 50 mV it is linear.
const LM386 = (amplitude, gain200) => ({
  supplies: [{ id: 'V1', voltage: 9 }, { id: 'G1', kind: 'generator', waveform: 'sine', frequency: 1000, amplitude, offset: 0, positive: 'CIN.-', negative: 'T-' }],
  parts: [{ id: 'U1', part: 'LM386' }, { id: 'CIN', type: 'capacitor', value: '10u' }, { id: 'COUT', type: 'capacitor', kind: 'electrolytic', value: '220u' }, { id: 'RL', type: 'resistor', value: '8' }, ...(gain200 ? [{ id: 'CG', type: 'capacitor', kind: 'electrolytic', value: '10u' }] : [])],
  nets: [['U1.VS', 'T+'], ['U1.GND', 'T-'], ['U1.IN-', 'T-'], ['CIN.+', 'U1.IN+'], ['U1.OUT', 'COUT.+'], ['COUT.-', 'RL.1'], ['RL.2', 'T-'], ...(gain200 ? [['U1.GAIN1', 'CG.+'], ['CG.-', 'U1.GAIN8']] : [])],
});
test('an LM386 clipped against its rails gets one note saying so; a linear one none', async () => {
  const { simulate } = await import('../src/sim/index.js');
  const clipped = simulate(autoLayout(LM386(0.02, true)).circuit, { analysis: 'transient', stop: 0.01, step: 5e-6, start: 'dc' });
  const notes = clipped.issues.filter((i) => i.code === 'SIM_AMP_CLIPPING');
  assert.equal(notes.length, 1, JSON.stringify(clipped.issues.map((i) => i.code)));
  assert.match(formatIssue(notes[0], 'en'), /^note: U1's output is clipped against its rails \d+ % of the time \(it swings from [\d.]+ m?V to [\d.]+ V\): the signal is too large for this gain and supply/);
  const linear = simulate(autoLayout(LM386(0.05, false)).circuit, { analysis: 'transient', stop: 0.01, step: 5e-6, start: 'dc' });
  assert.ok(!linear.issues.some((i) => i.code === 'SIM_AMP_CLIPPING'));
});

test('the kit has no loudspeaker: the same sentence in catalog speaker, the LM386\'s model line and chips.md', async () => {
  const { readFileSync } = await import('node:fs');
  const { unknownText, catalogEntry, formatCatalogEntry } = await import('../src/node/catalog.js');
  const SAID = 'The kit has no loudspeaker: an 8 Ω resistor stands in for it in the simulation; tell the user.';
  assert.ok(unknownText('speaker', 'en').includes(SAID), unknownText('speaker', 'en'));
  assert.ok(formatCatalogEntry(catalogEntry('LM386', 'en'), 'en').includes(SAID));
  const chips = readFileSync(new URL('../plugin-src/references/chips.md', import.meta.url), 'utf8');
  assert.ok(chips.includes(SAID));
  assert.doesNotMatch(chips, /stands for it|ask before/i);
});

// ── 11. The skill says what an assistant had to guess ───────────────────────────────────

test('run-it.md lists every field of the environment at its default, and says how to type to a board', async () => {
  const { readFileSync } = await import('node:fs');
  const { FIELDS } = await import('../src/sim/environment.js');
  const doc = readFileSync(new URL('../plugin-src/references/run-it.md', import.meta.url), 'utf8');
  const part = doc.split('**The environment starts at the kit\'s defaults**')[1].split('```')[0].replace(/\s+/g, ' ');
  for (const [name, f] of Object.entries(FIELDS)) {
    if (f.kind === 'switch') assert.match(part, new RegExp(name === 'beam' ? 'the beam uncut' : `no [a-z, ]*\\b${name}\\b`), name);
    else assert.ok(part.includes(`${name} ${String(f.default)}${f.unit === '°' ? '°' : ` ${f.unit}`}`), `${name} ${f.default} ${f.unit}`);
  }
  assert.doesNotMatch(doc, /<!-- serial-input: /, 'the marked place is filled');
  assert.match(doc, /## Typing to a board[\s\S]*kit simulate circuits\/menu --run 2 --serial 1@0\.5/);
});
