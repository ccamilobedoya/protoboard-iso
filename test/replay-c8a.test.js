// What a replay of first-time requests still found in the simulator and the checks (2026-11): each
// case is written from its reproduction, through the CLI as a child process or the public exports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';
import { formatLayout } from '../src/layout.js';
import { autoLayout } from './layout-generous.js';
import { formatIssue, t } from '../src/index.js';
import { UNSIMULATED } from './unsimulated-part.js';
import { specWithFix } from '../src/fix.js';
import { checkHazards, simulate } from '../src/sim/index.js';

const root = new URL('../', import.meta.url).pathname;
const bin = join(root, 'bin/protoboard-iso.js');
const cli = (args) => spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });

// A sketch named by file beside circuit.json, with a sensor that reads the world (an LDR): the
// environment's ends are states of the hazard check, compiled again, and they must keep the folder.
const BLINK = (pin) => `void setup() { pinMode(${pin}, OUTPUT); }\nvoid loop() { digitalWrite(${pin}, HIGH); delay(200); digitalWrite(${pin}, LOW); delay(200); }\n`;
const BOARDS = {
  uno: { part: 'ARDUINO-UNO', pin: 'D13', number: 13, power: '5V', analog: 'A0' },
  esp32: { part: 'ESP32-DEVKIT', pin: 'D23', number: 23, power: '3V3', analog: 'D34' },
};

for (const [name, b] of Object.entries(BOARDS)) {
  test(`a ${name}'s program file beside circuit.json is found by layout, review and simulate --run`, () => {
    const dir = tempDir(`c8a-ino-${name}-`);
    const target = join(dir, 'circuits', 'w');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'blink.ino'), BLINK(b.number));
    const spec = {
      parts: [{ id: 'U1', part: b.part, program: 'blink.ino' }, { id: 'D1', type: 'led', color: 'red' }, { id: 'R1', type: 'resistor', value: '220' }, { id: 'LDR1', part: 'GL5528' }, { id: 'R2', type: 'resistor', value: '10k' }],
      nets: [[`U1.${b.pin}`, 'R1.1'], ['R1.2', 'D1.A'], ['D1.K', 'U1.GND', 'R2.2'], [`U1.${b.power}`, 'LDR1.1'], ['LDR1.2', 'R2.1', `U1.${b.analog}`]],
    };
    writeFileSync(join(dir, 'spec.json'), JSON.stringify(spec));
    const laid = cli(['layout', target, join(dir, 'spec.json')]);
    assert.equal(laid.status, 0, laid.stdout + laid.stderr);
    assert.doesNotMatch(laid.stdout, /was not found/);
    assert.match(laid.stdout, /^Behaviour.*D1 2\.5 Hz/m);
    const reviewed = cli(['review', target]);
    assert.doesNotMatch(reviewed.stdout, /was not found/);
    const run = cli(['simulate', target, '--run', '1']);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /D1 \(LED\): 2\.5 Hz/);
  });
}

// ---- 2. An output that never comes on is a doubt (SIM_OUTPUT_NEVER_ON)

const neverOn = (r) => r.review.doubts.filter((d) => d.code === 'SIM_OUTPUT_NEVER_ON');

test('a relay fed straight from a sensor module\'s output never pulls in, nor the pump behind it', () => {
  const r = autoLayout({
    supplies: [{ voltage: 5, positive: 'T+', negative: 'T-' }],
    parts: [{ id: 'M1', part: 'YL-69' }, { id: 'K1', part: 'SRD-05VDC-SL-C' }, { id: 'P1', type: 'motor', part: 'RE-140RA-12240' }],
    nets: [['T+', 'M1.VCC', 'K1.COM'], ['T-', 'M1.GND', 'K1.A2', 'P1.-'], ['M1.DO', 'K1.A1'], ['K1.NO', 'P1.+']],
  });
  assert.equal(r.status, 'warnings');
  const lines = neverOn(r).map((d) => formatIssue(d, 'en'));
  assert.ok(lines.some((l) => /^warning: K1 never pulls in: .*Its coil gets at most 3\.\d+ mA and needs 53\.6 mA/.test(l)), lines.join('\n'));
  assert.ok(lines.some((l) => /^warning: P1 never comes on/.test(l)), lines.join('\n'));
  // Said once, not also as driven but not pulled in.
  assert.ok(!r.review.doubts.some((d) => d.code === 'SIM_RELAY_UNDERDRIVEN'));
});

test('a joule thief of two uncoupled inductors leaves its LED dark: a doubt, not DONE', () => {
  const r = autoLayout({
    parts: [{ id: 'BT1', type: 'battery', format: 'AA', cells: 1 }, { id: 'R1', type: 'resistor', value: '1k' }, { id: 'Q1', part: '2N3904' }, { id: 'L1', type: 'inductor', value: '100u' }, { id: 'L2', type: 'inductor', value: '100u' }, { id: 'D1', type: 'led', color: 'white' }],
    nets: [['BT1.+', 'L1.1', 'L2.1'], ['L1.2', 'Q1.C', 'D1.A'], ['D1.K', 'BT1.-'], ['L2.2', 'R1.1'], ['R1.2', 'Q1.B'], ['Q1.E', 'BT1.-']],
  });
  assert.equal(r.status, 'warnings');
  assert.match(formatIssue(neverOn(r)[0], 'en'), /^warning: D1 never comes on: the kit found no state in which it does/);
  assert.match(formatIssue(neverOn(r)[0], 'es'), /^aviso: D1 nunca se enciende/);
});

// C10b: LEDs that hang from a chip not simulated are not called dead; the chip's own doubt names them.
// Since C11 every chip is simulated: the part with no model is the tests' own (test/unsimulated-part.js).
test('LEDs behind a chip that is not simulated are named by its doubt, not called never on', () => {
  const r = autoLayout({
    supplies: [{ voltage: 5, positive: 'T+', negative: 'T-' }],
    parts: [{ id: 'U1', part: UNSIMULATED }, { id: 'R1', type: 'resistor', value: '330' }, { id: 'D1', type: 'led', color: 'red' }, { id: 'R2', type: 'resistor', value: '330' }, { id: 'D2', type: 'led', color: 'green' }],
    nets: [['T+', 'U1.VCC'], ['T-', 'U1.GND', 'D1.K', 'D2.K'], ['U1.OUT', 'R1.1'], ['R1.2', 'D1.A'], ['U1.IN', 'R2.1'], ['R2.2', 'D2.A']],
  });
  assert.equal(r.status, 'warnings');
  assert.deepEqual(neverOn(r), []);
  const chip = r.review.doubts.find((d) => d.code === 'SIM_PART_NOT_SIMULATED');
  assert.match(formatIssue(chip, 'en'), /the kit cannot tell what U1 does, nor what D1, D2 do, which depend on it/);
});

test('no example gets SIM_OUTPUT_NEVER_ON (the recipes: test/hazards.test.js)', () => {
  const dir = join(root, 'examples');
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const c = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    const found = checkHazards(c).doubts.filter((d) => d.code === 'SIM_OUTPUT_NEVER_ON');
    assert.deepEqual(found.map((d) => formatIssue(d, 'en')), [], name);
  }
});

// ---- 3. A pin over its voltage is seen when it happens, not only at rest

const ECHO = (board, power) => ({
  parts: [{ id: 'U1', part: board, program: 'void setup(){pinMode(5,OUTPUT);pinMode(18,INPUT);Serial.begin(115200);}\nvoid loop(){digitalWrite(5,LOW);delayMicroseconds(2);digitalWrite(5,HIGH);delayMicroseconds(10);digitalWrite(5,LOW);long us=pulseIn(18,HIGH,30000);Serial.println(us/58);delay(200);}' }, { id: 'S1', part: 'HC-SR04' }],
  nets: [[`U1.${power}`, 'S1.VCC'], ['U1.GND', 'S1.GND'], ['U1.D5', 'S1.TRIG'], ['U1.D18', 'S1.ECHO']],
});

test('an HC-SR04 ECHO straight on an ESP32 pin: over its voltage during the echo, with the moment', () => {
  const r = autoLayout(ECHO('ESP32-DEVKIT', 'VIN'));
  const d = r.review.doubts.find((x) => x.code === 'SIM_PIN_OVERVOLTAGE');
  assert.ok(d, JSON.stringify(r.review.doubts));
  assert.equal(d.params.pin, 'D18');
  assert.ok(d.params.voltage.value > 3.6 && d.params.time.value > 0);
  assert.match(formatIssue(d, 'en'), /^warning: U1: D18 reaches 4\.\d+ V at .+ of the kit's run, outside 0…3\.3 V/);
  // At rest ECHO is low: the DC point alone says nothing.
  assert.ok(!simulate(r.circuit).issues.some((i) => i.code === 'SIM_PIN_OVERVOLTAGE'));
});

// ---- 4. A coil switched with no flyback diode is a doubt (COIL_NO_FLYBACK)

const PUMP = (diode) => ({
  supplies: [{ voltage: 5, positive: 'T+', negative: 'T-' }],
  parts: [{ id: 'M1', part: 'YL-69' }, { id: 'R1', type: 'resistor', value: '1k' }, { id: 'Q1', part: '2N2222A' }, { id: 'K1', part: 'SRD-05VDC-SL-C' }, { id: 'P1', type: 'motor', part: 'RE-140RA-12240' }, ...(diode ? [{ id: 'D1', part: '1N4007' }] : [])],
  nets: [['T+', 'M1.VCC', 'K1.A1', 'K1.COM', ...(diode ? ['D1.K'] : [])], ['T-', 'M1.GND', 'Q1.E', 'P1.-'], ['M1.DO', 'R1.1'], ['R1.2', 'Q1.B'], ['Q1.C', 'K1.A2', ...(diode ? ['D1.A'] : [])], ['K1.NO', 'P1.+']],
});

test('a relay coil switched by a transistor with no diode across it: a doubt naming both; with the diode, none', () => {
  const bare = autoLayout(PUMP(false));
  assert.equal(bare.status, 'warnings');
  const d = bare.review.doubts.filter((x) => x.code === 'COIL_NO_FLYBACK');
  assert.equal(d.length, 1, JSON.stringify(bare.review.doubts));
  assert.match(formatIssue(d[0], 'en'), /^warning: K1's coil is switched by Q1 with no diode across it: when Q1 turns off.*Q1 can be damaged\. A diode across the coil/);
  assert.ok(!bare.review.blocking.length, 'a doubt never blocks');
  const guarded = autoLayout(PUMP(true));
  assert.ok(guarded.circuit.parts.some((p) => p.id === 'D1'));
  assert.ok(!guarded.review.doubts.some((x) => x.code === 'COIL_NO_FLYBACK'));
});

test('a motor on a plain switch or straight on a battery has no switch to damage', () => {
  const sw = autoLayout({ parts: [{ id: 'S1', type: 'slide-switch' }, { id: 'M1', type: 'motor' }], nets: [['T+', 'S1.COM'], ['S1.1', 'M1.+'], ['M1.-', 'T-']], supplies: [{ id: 'V1', voltage: 3, positive: 'T+', negative: 'T-' }] });
  assert.notEqual(sw.status, 'changes', JSON.stringify(sw.problems));
  assert.ok(!sw.review.doubts.some((x) => x.code === 'COIL_NO_FLYBACK'), JSON.stringify(sw.review.doubts));
  const bat = autoLayout({ parts: [{ id: 'M1', type: 'motor' }], nets: [['T+', 'M1.+'], ['M1.-', 'T-']], supplies: [{ id: 'V1', voltage: 3, positive: 'T+', negative: 'T-' }] });
  assert.notEqual(bat.status, 'changes', JSON.stringify(bat.problems));
  assert.ok(!bat.review.doubts.some((x) => x.code === 'COIL_NO_FLYBACK'));
});

// ---- 5. The fix of a part that is in backwards is to turn it round

test('a buzzer wired backwards: the fix turns it round, never a series resistor', () => {
  const spec = {
    parts: [{ id: 'BT1', type: 'battery', format: 'AA', cells: 3 }, { id: 'SW1', type: 'button' }, { id: 'BZ1', part: 'TMB12A05' }],
    nets: [['BT1.+', 'SW1.1'], ['SW1.3', 'BZ1.2'], ['BZ1.1', 'BT1.-']],
  };
  const r = autoLayout(spec);
  assert.ok(r.review.hazards.some((h) => h.code === 'SIM_REVERSE_VOLTAGE'), JSON.stringify(r.review.hazards));
  assert.equal(r.review.fix?.kind, 'swap', JSON.stringify(r.review.fix));
  const text = formatLayout(r, 'en', { t, formatIssue });
  assert.match(text, /To fix it: turn BZ1 round/);
  assert.doesNotMatch(text, /resistor in series with BZ1/);
  // Applied, the spec has its two leads exchanged, and the hazard is gone.
  const fixed = autoLayout(specWithFix(spec, r.review.fix).spec);
  assert.deepEqual(fixed.review.hazards, []);
});

test('a regulator fed backwards by its battery: the fix swaps the battery\'s leads', () => {
  const r = autoLayout({ parts: [{ id: 'BT1', type: 'battery', format: '9V' }, { id: 'U1', part: 'L7805' }, { id: 'C1', type: 'capacitor', value: '100n' }], nets: [['BT1.-', 'U1.IN'], ['BT1.+', 'U1.GND', 'C1.2'], ['U1.OUT', 'C1.1']] });
  assert.ok(r.review.hazards.some((h) => h.code === 'SIM_REVERSE_VOLTAGE'), JSON.stringify(r.review.hazards));
  assert.deepEqual(r.review.fix, { kind: 'swap-supply', supply: 'BT1' });
  assert.match(formatLayout(r, 'es', { t, formatIssue }), /Para arreglarlo: intercambia los cables de BT1/);
});

// ---- 6. Say what is needed, not what to change

test('the underdriven relay says what the coil gets and needs, and no prescription', () => {
  const i = { severity: 'warning', code: 'SIM_RELAY_UNDERDRIVEN', params: { part: 'K1', current: { value: 0.03, unit: 'A' }, needs: { value: 0.0536, unit: 'A' }, release: { value: 0.0054, unit: 'A' } } };
  for (const lang of ['en', 'es']) assert.doesNotMatch(formatIssue(i, lang), /base resistor|resistencia de base|driver/);
  assert.match(formatIssue(i, 'en'), /K1: its coil carries 30 mA.*from 53\.6 mA.*does not deliver the current it needs\.$/);
});

// ---- 7. A negative supply shows its sign

test('a supply written at -5 V reads as written, and the answer says which rail is the positive one', () => {
  const r = autoLayout({ supplies: [{ id: 'V1', voltage: -5, positive: 'T+', negative: 'T-' }], parts: [{ id: 'R1', type: 'resistor', value: '1k' }, { id: 'D1', type: 'led', color: 'red' }], nets: [['T-', 'R1.1'], ['R1.2', 'D1.A'], ['D1.K', 'T+']] });
  const lines = formatLayout(r, 'en', { t, formatIssue }).split('\n');
  assert.equal(lines.filter((l) => /written with a negative voltage/.test(l)).length, 1);
  assert.ok(lines.includes('Note: V1 is written with a negative voltage (-5 V), so the rail named T+ is the lower one: T- is the positive rail in fact.'), lines.join('\n'));
  assert.ok(lines.some((l) => /^Readings .*supply -5 V/.test(l)));
  const sim = simulate(r.circuit);
  assert.equal(sim.supplies.V1.voltage < 0, true);
  assert.ok(sim.parts.D1.current > 1e-3, 'the LED, wired for it, is lit');
});

// ---- 11. Loose ends

test('simulate --run on a board fed by USB alone prints no empty Supplies heading', () => {
  const dir = tempDir('c8a-usb-');
  assert.equal(cli(['layout', join(dir, 'c'), '--recipe', 'uno-blink']).status, 0);
  const run = cli(['simulate', join(dir, 'c'), '--run', '0.5']);
  assert.equal(run.status, 0, run.stderr);
  const lines = run.stdout.split('\n');
  const at = lines.indexOf('Supplies:');
  assert.ok(at < 0 || /^\s+\S/.test(lines[at + 1] ?? '') && !/^Nodes/.test(lines[at + 1]), run.stdout);
  assert.ok(!lines.some((l, k) => l === 'Supplies:' && /^Nodes/.test(lines[k + 1] ?? '')));
});

// ---- 9. Two figures for one thing agree, or one of them says "about"

test('an op-amp oscillator: the Behaviour line and simulate --run give the same frequency', () => {
  const dir = tempDir('c8a-osc-');
  writeFileSync(join(dir, 'osc.json'), JSON.stringify({
    parts: [{ id: 'BT1', type: 'battery', format: '9V' }, { id: 'U1', part: 'LM358' }, { id: 'R1', type: 'resistor', value: '10k' }, { id: 'R2', type: 'resistor', value: '10k' }, { id: 'R3', type: 'resistor', value: '10k' }, { id: 'R4', type: 'resistor', value: '10k' }, { id: 'C1', type: 'capacitor', value: '68n' }],
    nets: [['BT1.+', 'U1.VCC', 'R1.1'], ['BT1.-', 'U1.GND', 'R2.2', 'C1.2'], ['R1.2', 'R2.1', 'U1.IN1+', 'R3.1'], ['R3.2', 'U1.OUT1', 'R4.1'], ['R4.2', 'U1.IN1-', 'C1.1']],
  }));
  const laid = cli(['layout', join(dir, 'c'), join(dir, 'osc.json')]);
  const line = laid.stdout.split('\n').find((l) => l.startsWith('Behaviour'));
  const run = cli(['simulate', join(dir, 'c'), '--run', '2']);
  const fromLine = /U1\.OUT1 (?:about )?([\d.]+ kHz)/.exec(line)?.[1];
  const fromRun = /U1\.OUT1 \(op-amp output\): ([\d.]+ kHz)/.exec(run.stdout)?.[1];
  assert.ok(fromLine && fromRun, `${line}\n${run.stdout}`);
  assert.equal(fromLine, fromRun);
});

test('a pin overloaded under the half-rail line is reported by what the program writes, with its output resistance', () => {
  const dir = tempDir('c8a-pin-');
  const leds = Array.from({ length: 12 }, (_, k) => ({ id: `D${k + 1}`, type: 'led', color: 'red' }));
  writeFileSync(join(dir, 's.json'), JSON.stringify({
    parts: [{ id: 'U1', part: 'UNO', program: 'void setup(){pinMode(13,OUTPUT);digitalWrite(13,HIGH);}\nvoid loop(){delay(1000);}' }, ...leds],
    nets: [['U1.D13', ...leds.map((d) => `${d.id}.A`)], ['U1.GND', ...leds.map((d) => `${d.id}.K`)]],
  }));
  cli(['layout', join(dir, 'c'), join(dir, 's.json')]);
  const run = cli(['simulate', join(dir, 'c'), '--run', '0.5']);
  assert.match(run.stdout, /U1\.D13 \(pin\): on the whole time/, run.stdout);
  assert.match(run.stdout, /D13 output HIGH [\d.]+ m?V [\d.]+ mA \(through its 40 Ω output resistance\)/, run.stdout);
});

test('--transient says the step it solved and the spacing of the samples it printed', () => {
  const r = cli(['simulate', join(root, 'examples/battery-regulator.json'), '--transient', '0.05,1e-6']);
  assert.match(r.stdout.split('\n')[0], /50 ms solved in steps of 1 µs; 401 samples printed, 125 µs apart\./);
});

// ---- 8. Damage is checked in the states a program really reaches

const HBRIDGE = (loop) => ({
  parts: [{ id: 'U1', part: 'UNO', program: `void setup(){for(int p=2;p<=5;p++){pinMode(p,OUTPUT);}digitalWrite(2,HIGH);digitalWrite(3,HIGH);}\nvoid loop(){${loop}}` }, { id: 'M1', type: 'motor' }, { id: 'Q1', part: '2N2907A' }, { id: 'Q2', part: '2N2907A' }, { id: 'Q3', part: '2N2222A' }, { id: 'Q4', part: '2N2222A' }, ...[1, 2, 3, 4].map((k) => ({ id: `R${k}`, type: 'resistor', value: '1k' }))],
  supplies: [{ id: 'V1', voltage: 5 }],
  nets: [['T+', 'Q1.E', 'Q2.E'], ['Q1.C', 'Q3.C', 'M1.+'], ['Q2.C', 'Q4.C', 'M1.-'], ['Q3.E', 'Q4.E', 'U1.GND', 'T-'], ['U1.D2', 'R1.1'], ['R1.2', 'Q1.B'], ['U1.D3', 'R2.1'], ['R2.2', 'Q2.B'], ['U1.D4', 'R3.1'], ['R3.2', 'Q3.B'], ['U1.D5', 'R4.1'], ['R4.2', 'Q4.B']],
});

test('an H-bridge driven by its sketch: no shoot-through from a pin the sketch never raises alone', () => {
  const good = autoLayout(HBRIDGE('digitalWrite(3,HIGH);digitalWrite(4,LOW);digitalWrite(2,LOW);digitalWrite(5,HIGH);delay(500);digitalWrite(5,LOW);digitalWrite(2,HIGH);digitalWrite(3,LOW);digitalWrite(4,HIGH);delay(500);'));
  assert.deepEqual(good.review.hazards.map((h) => formatIssue(h, 'en')), []);
  assert.doesNotMatch(formatLayout(good, 'en', { t, formatIssue }), /combinations of program outputs/);
  // A sketch that turns on both transistors of one leg: both are named, in the states it reaches.
  const bad = autoLayout(HBRIDGE('digitalWrite(2,LOW);digitalWrite(4,HIGH);delay(500);digitalWrite(4,LOW);digitalWrite(2,HIGH);delay(500);'));
  const burnt = new Set(bad.review.hazards.map((h) => h.params.part));
  assert.ok(burnt.has('Q1') || burnt.has('Q3'), JSON.stringify(bad.review.hazards));
});
