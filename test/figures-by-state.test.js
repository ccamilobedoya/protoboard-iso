// What a replay left partial (2026-11): a buzzer's beeps and its tone apart, a passive buzzer on a
// steady current is silent, the motor on a pin names the state of each figure, a board's output
// resistance in its catalog entry, a supply written negative shown as written by its control, and a
// part wired to nothing in a circuit with a source has no hazard. Through the CLI as a child process
// and the public exports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';
import { formatLayout } from '../src/layout.js';
import { autoLayout } from './layout-generous.js';
import { formatIssue, t } from '../src/index.js';
import { compile, createEngine } from '../src/sim/index.js';
// Its runs take under a second of a free machine: the default machine-time budget.
import { runCircuit } from '../src/sim/run.js';

const root = new URL('../', import.meta.url).pathname;
const bin = join(root, 'bin/protoboard-iso.js');
const cli = (args) => spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });

// ---- A buzzer that beeps: the beeps and the tone, apart

const BEEP = 'void setup() { pinMode(8, OUTPUT); }\nvoid loop() { tone(8, 2000); delay(100); noTone(8); delay(400); }\n';
const beeper = () => {
  const dir = tempDir('c9-beep-');
  const target = join(dir, 'bz');
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'beep.ino'), BEEP);
  writeFileSync(join(dir, 'spec.json'), JSON.stringify({ parts: [{ id: 'U1', part: 'UNO', program: 'beep.ino' }, { id: 'BZ1', type: 'buzzer' }], nets: [['U1.D8', 'BZ1.1'], ['BZ1.2', 'U1.GND']] }));
  return { dir, target };
};

test('a passive buzzer that beeps: simulate --run says the beeps and the tone apart, in text and in --json', () => {
  const { dir, target } = beeper();
  const laid = cli(['layout', target, join(dir, 'spec.json')]);
  assert.equal(laid.status, 0, laid.stderr);
  assert.match(laid.stdout, /^Behaviour.*BZ1 beeps 2 Hz, sounding 20 % of the time, tone 2 kHz/m);
  const run = cli(['simulate', target, '--run', '2']);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^ {2}BZ1 \(buzzer\): beeps 2 Hz \(every 500 ms\), sounding 20 % of the time · beeps: 4 · tone 2 kHz$/m);
  assert.doesNotMatch(run.stdout, /BZ1 \(buzzer\): 2 kHz, on 50 %/);
  const es = cli(['simulate', target, '--run', '2', '--lang', 'es']);
  assert.match(es.stdout, /BZ1 \(zumbador\): pita 2 Hz \(cada 500 ms\), sonando el 20 % del tiempo · pitidos: 4 · tono 2 kHz/);
  const json = JSON.parse(cli(['simulate', target, '--run', '2', '--json']).stdout);
  const bz = json.outputs.find((o) => o.id === 'BZ1');
  // The fields that were there keep their meaning: the current's (each cycle of the tone).
  assert.ok(Math.abs(bz.frequency - 2000) < 1, bz.frequency);
  assert.ok(Math.abs(bz.onShare - 0.1) < 0.01, bz.onShare);
  // Added: when it is heard, and the tone.
  assert.equal(bz.sound.starts, 4);
  assert.ok(Math.abs(bz.sound.onShare - 0.2) < 0.01, bz.sound.onShare);
  assert.ok(Math.abs(bz.sound.frequency - 2) < 0.01, bz.sound.frequency);
  assert.ok(Math.abs(bz.tone.frequency - 2000) < 2, bz.tone.frequency);
});

// ---- A passive buzzer on a steady current only clicks; an active one sounds

test('a passive buzzer on steady DC is silent (a ⚠ that it never sounds); an active buzzer on DC sounds', () => {
  const passive = autoLayout({ parts: [{ id: 'BT1', type: 'battery', format: 'AA', cells: 4 }, { id: 'R1', type: 'resistor', value: '220' }, { id: 'BZ1', type: 'buzzer' }], nets: [['BT1.+', 'R1.1'], ['R1.2', 'BZ1.1'], ['BZ1.2', 'BT1.-']] });
  const never = passive.review.doubts.find((d) => d.code === 'SIM_OUTPUT_NEVER_ON');
  assert.equal(never?.params.variant, 'passive', JSON.stringify(passive.review.doubts));
  assert.match(formatLayout(passive, 'en', { t, formatIssue }), /⚠ warning: BZ1 never sounds: a passive buzzer sounds only with a current that changes/);
  const run = runCircuit(passive.circuit, { seconds: 0.5 });
  const bz = run.outputs.find((o) => o.id === 'BZ1');
  assert.ok(bz.onShare > 0.9, 'its current flows');
  assert.equal(bz.sound.onShare, 0, 'and it is not heard');
  const active = autoLayout({ parts: [{ id: 'BT1', type: 'battery', format: 'AA', cells: 3 }, { id: 'BZ1', part: 'TMB12A05' }], nets: [['BT1.+', 'BZ1.1'], ['BZ1.2', 'BT1.-']] });
  assert.ok(!active.review.doubts.some((d) => d.code === 'SIM_OUTPUT_NEVER_ON'), JSON.stringify(active.review.doubts));
  const on = runCircuit(active.circuit, { seconds: 0.5 }).outputs.find((o) => o.id === 'BZ1');
  assert.ok(on.onShare > 0.9 && !on.sound, JSON.stringify(on));
});

// ---- The motor on a pin: each figure names its state

test('a motor straight on a UNO pin: layout names the state of its figure, and a run names when its strongest came', () => {
  const dir = tempDir('c9-motor-');
  const target = join(dir, 'm');
  const program = 'void setup(){pinMode(9,OUTPUT);} void loop(){digitalWrite(9,HIGH);delay(1000);digitalWrite(9,LOW);delay(1000);}';
  writeFileSync(join(dir, 'spec.json'), JSON.stringify({ parts: [{ id: 'U1', part: 'UNO', program }, { id: 'M1', type: 'motor' }], nets: [['U1.D9', 'M1.+'], ['M1.-', 'U1.GND']] }));
  const laid = cli(['layout', target, join(dir, 'spec.json')]);
  assert.equal(laid.status, 0, laid.stderr);
  const steady = /U1\.D9 carries ([\d.]+) mA, more than its maximum 40 mA: the pin can be damaged, with D9 high, as the program first sets it\./.exec(laid.stdout);
  assert.ok(steady, laid.stdout);
  // The DC point is the same state: the same number.
  const dc = cli(['simulate', target]);
  assert.match(dc.stdout, new RegExp(`D9 output HIGH [\\d.]+ V ${steady[1].replace('.', '\\.')} mA`));
  // A run's figure is its strongest, at a time, with the pin's level then.
  const run = cli(['simulate', target, '--run', '2']);
  assert.match(run.stdout, /U1\.D9 carries [\d.]+ mA, more than its maximum 40 mA: the pin can be damaged, at its strongest in the run, at [\d.]+ m?s, with D9 (high|low)\./);
});

// ---- A board's output resistance in its catalog entry

test('catalog UNO and ESP32 say the output resistance the simulator uses, with its source or "assumed"', () => {
  const uno = cli(['catalog', 'UNO']);
  assert.match(uno.stdout, /output pins \(the simulator's model\): each is 5 V or 0 V behind 40 Ω \(from the ATmega328P datasheet: 4\.2 V out at 20 mA from 5 V\)/);
  assert.match(cli(['catalog', 'ESP32-C3-SUPERMINI']).stdout, /behind 17 Ω \(assumed/);
  assert.match(cli(['catalog', 'UNO', '--lang', 'es']).stdout, /pines de salida \(el modelo del simulador\): cada uno es 5 V o 0 V detrás de 40 Ω/);
  assert.deepEqual(JSON.parse(cli(['catalog', 'UNO', '--json']).stdout).pinOutput, { voltage: 5, resistance: 40, source: 'from the ATmega328P datasheet: 4.2 V out at 20 mA from 5 V' });
});

// ---- A supply written negative: its control shows what was written

test('the control of a supply written at -5 V shows -5 V and sets it as written', () => {
  const r = autoLayout({ supplies: [{ id: 'V1', voltage: -5, positive: 'T+', negative: 'T-' }], parts: [{ id: 'R1', type: 'resistor', value: '1k' }, { id: 'D1', type: 'led', color: 'red' }], nets: [['T-', 'R1.1'], ['R1.2', 'D1.A'], ['D1.K', 'T+']] });
  const engine = createEngine(compile(r.circuit).program);
  const control = engine.controls().find((c) => c.id === 'V1' && c.field === 'voltage');
  assert.equal(control.value, -5);
  assert.ok(control.min < 0 && control.max === 0, JSON.stringify(control));
  assert.ok(engine.set('V1', 'voltage', -9));
  const dc = engine.dc();
  assert.ok(Math.abs(dc.supplies.V1.voltage + 9) < 1e-9, String(dc.supplies.V1.voltage));
  assert.ok(dc.parts.D1.current > 1e-3, 'the LED is still lit, fed the same way round');
  // A positive value is outside what was written: held at its end (0 V), as any control is held in its limit.
  engine.set('V1', 'voltage', 9);
  assert.ok(engine.dc().supplies.V1.voltage <= 0);
});

// ---- A part wired to nothing has no hazard

test('an LED added by operations on empty strips, in a circuit with a source, has no hazard and no doubt; one lead on a strip of its own is a doubt, not a hazard', () => {
  const dir = tempDir('c9-loose-');
  const base = join(dir, 'base');
  assert.equal(cli(['layout', base, '--recipe', 'led-resistor']).status, 0);
  const cases = [
    { name: 'loose', pins: { A: 'a20', K: 'a22' }, doubt: false },
    { name: 'half', pins: { A: 'j22', K: 'T+21' }, doubt: true },
  ];
  for (const c of cases) {
    const target = join(dir, c.name);
    cpSync(base, target, { recursive: true });
    const ops = [{ op: 'add', part: { id: 'D2', type: 'led', color: 'green', pins: c.pins } }];
    const applied = cli(['apply', target, '--ops', JSON.stringify(ops)]);
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
    const review = JSON.parse(cli(['review', target, '--json']).stdout);
    assert.deepEqual(review.hazards, [], `${c.name}: ${JSON.stringify(review.hazards)}`);
    assert.equal(review.doubts.some((d) => String(d.params.part).split(', ').includes('D2')), c.doubt, `${c.name}: ${JSON.stringify(review.doubts)}`);
  }
});
