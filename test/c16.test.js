// The join of the last three branches (C16), each test from a reproduction: the sketch runner's
// warnings are doubts of the review wherever they are raised, and what each branch left for a file it
// did not own (the MCP tool's serial input, layout's Behaviour line, a print at a run's end, a circuit
// saved with parts left out, the resupply fix applied by layout).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout } from './layout-generous.js';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';
import { autoLayout as layoutAtBudget, formatLayout } from '../src/layout.js';
import { runCircuit } from '../src/sim/run.js';
import { review, formatIssue, t } from '../src/index.js';

// ── 1. Every warning of the sketch runner is a doubt of the review ─────────────────────────────

// An UNO blinking an LED, with a line of its program changed per case.
const blink = (body, head = '') => `${head}\nvoid setup() { Serial.begin(9600); pinMode(13, OUTPUT); ${body} }\nvoid loop() { digitalWrite(13, HIGH); delay(500); digitalWrite(13, LOW); delay(500); }`;
let base = null;
const withProgram = (program) => {
  base ??= autoLayout({ parts: [{ id: 'U1', part: 'UNO', program: blink('') }, { id: 'R1', type: 'resistor', value: '220' }, { id: 'D1', type: 'led', color: 'red' }], nets: [['U1.D13', 'R1.1'], ['R1.2', 'D1.A'], ['D1.K', 'U1.GND']] }).circuit;
  return { ...base, parts: base.parts.map((p) => (p.id === 'U1' ? { ...p, program } : p)) };
};
const PROGRAM_CASES = {
  SIM_PROGRAM_NOT_LVALUE: blink('int x = 1; bitSet(x + 1, 2);'),
  SIM_PROGRAM_REFERENCE: blink('int a = 1; bump(a);', 'void bump(int &x) { x++; }'),
  SIM_PROGRAM_POINTER: blink('int a = 1; int *p = &a;'),
  SIM_PROGRAM_TYPE_DECL: blink('', 'struct P { int x; };'),
  SIM_PROGRAM_STRING_METHOD: blink('String s = "a"; s.reserve(10);'),
  SIM_PROGRAM_MEMBER: blink('int a = 1; a.foo = 2;'),
  SIM_PROGRAM_MACRO: blink('', '#define F(...) 1'),
};
for (const [code, program] of Object.entries(PROGRAM_CASES)) {
  test(`${code} is a doubt of the review, and the verdict is not a plain APPROVED`, () => {
    const r = review(withProgram(program), { lang: 'en' });
    assert.ok(r.doubts.some((d) => d.code === code && d.params.part === 'U1'), JSON.stringify(r.doubts.map((d) => d.code)));
    assert.equal(r.verdict, 'approved-with-warnings');
  });
}

// An UNO's TX to an ESP32's RX2: through 10k/1k the levels never reach it (SIM_SERIAL_LEVELS), a
// 10 kΩ to ground and no TX at all (SIM_SERIAL_NO_TX).
const TX = 'void setup() { Serial.begin(9600); }\nvoid loop() { Serial.println(24.9, 1); delay(1000); }';
const RX = "void setup() { Serial.begin(115200); Serial2.begin(9600, SERIAL_8N1, 16, 17); }\nvoid loop() { if (Serial2.available()) { String line = Serial2.readStringUntil('\\n'); Serial.println(line); } }";
function link(path) {
  const parts = [{ id: 'U1', part: 'UNO', program: TX }, { id: 'U2', part: 'ESP32-DEVKIT', program: RX }, { id: 'R2', type: 'resistor', value: path === 'none' ? '10k' : '1k' }];
  const nets = [['U1.GND', 'U2.GND'], ['U2.RX2', 'R2.1'], ['R2.2', 'U1.GND']];
  if (path !== 'none') {
    parts.push({ id: 'R1', type: 'resistor', value: '10k' });
    nets.push(['U1.D1', 'R1.1'], ['R1.2', 'U2.RX2']);
  }
  return review(autoLayout({ parts, nets }).circuit, { lang: 'en' });
}
for (const [code, path] of [['SIM_SERIAL_LEVELS', 'weak'], ['SIM_SERIAL_NO_TX', 'none']]) {
  test(`${code} is a doubt of the review`, () => {
    const r = link(path);
    assert.ok(r.doubts.some((d) => d.code === code && d.params.part === 'U2'), JSON.stringify(r.doubts.map((d) => d.code)));
    assert.equal(r.verdict, 'approved-with-warnings');
  });
}

// ── 2. What each branch left for a file it did not own ──────────────────────────────────────────

const bin = new URL('../bin/protoboard-iso.js', import.meta.url).pathname;
const kit = (cwd, ...args) => spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });

// The Behaviour line of a sketch that waits for serial input said "D1 off throughout · U1.D8 off
// throughout"; it says the board waits, and how to type to it.
const MENU = "void setup() { Serial.begin(9600); pinMode(8, OUTPUT); Serial.println(\"Type 1\"); }\nvoid loop() { if (Serial.available() > 0) { char c = Serial.read(); if (c == '1') { digitalWrite(8, HIGH); Serial.println(\"LED on\"); } } }";
const menuSpec = { parts: [{ id: 'U1', part: 'UNO', program: MENU }, { id: 'R1', type: 'resistor', value: '220' }, { id: 'D1', type: 'led', color: 'red' }], nets: [['U1.D8', 'R1.1'], ['R1.2', 'D1.A'], ['D1.K', 'U1.GND']] };
test('layout\'s Behaviour line says a board waits for serial input, not that its outputs are off throughout', () => {
  const r = autoLayout(menuSpec);
  const en = formatLayout(r, 'en', { t, formatIssue }).split('\n').find((l) => l.startsWith('Behaviour'));
  assert.match(en, /: U1 waits for serial input \(simulate --run … --serial "text@seconds" types to it\)$/);
  assert.doesNotMatch(en, /off throughout/);
  const es = formatLayout(r, 'es', { t, formatIssue }).split('\n').find((l) => l.startsWith('Comportamiento'));
  assert.match(es, /U1 espera una entrada por serie/);
  // An output that does change still shows beside it: a blink the sketch keeps doing while it waits.
  const blinking = autoLayout({ ...menuSpec, parts: [{ id: 'U1', part: 'UNO', program: MENU.replace('void loop() {', 'void loop() { digitalWrite(8, millis() % 1000 < 500);') }, ...menuSpec.parts.slice(1)] });
  const line = formatLayout(blinking, 'en', { t, formatIssue }).split('\n').find((l) => l.startsWith('Behaviour'));
  assert.match(line, /U1 waits for serial input .* · D1 1 Hz, on 50 % of the time/);
});

// A print at a run's last instant was lost: the engine accepts a step at the start of the next one,
// and a run never took the step after its last.
test('a print exactly at the end of a run is in the run: every 500 ms in 1 s prints at 0, 0.5 and 1 s', () => {
  const program = 'void setup() { Serial.begin(9600); pinMode(13, OUTPUT); }\nvoid loop() { Serial.println(millis()); delay(500); }';
  const c = withProgram(program);
  const one = runCircuit(c, { seconds: 1 });
  assert.deepEqual(one.serial.lines.map((l) => l.text), ['0', '500', '1000']);
  assert.deepEqual(one.serial.lines.map((l) => Math.round(l.t * 1000) / 1000), [0, 0.5, 1]);
  assert.deepEqual(runCircuit(c, { seconds: 0.5 }).serial.lines.map((l) => l.text), ['0', '500']);
  // A run that ends between two prints has the ones before its end only.
  assert.deepEqual(runCircuit(c, { seconds: 1.25 }).serial.lines.map((l) => l.text), ['0', '500', '1000']);
});

// A circuit saved with parts left out (a layout stopped at its budget): simulate and review said
// nothing of them, so a run or an APPROVED read as the whole circuit's.
test('simulate and review on a circuit saved with parts left out name them on their first line', () => {
  // A layout that left R2 and R3 out saves them, as asked and without holes, in spec.unplaced (as
  // test/layout-hard.test.js shows at a small budget): the same circuit, written so here, whatever
  // the machine's clock.
  const whole = layoutAtBudget({ parts: [{ id: 'R1', type: 'resistor', value: '1k' }, { id: 'R2', type: 'resistor', value: '1k' }, { id: 'R3', type: 'resistor', value: '1k' }], nets: [['T+', 'R1.1'], ['R1.2', 'R2.1'], ['R2.2', 'R3.1'], ['R3.2', 'T-']], supplies: [{ id: 'V1', voltage: 5 }] }).circuit;
  const left = ['R2', 'R3'];
  const r = { circuit: { ...whole, parts: whole.parts.filter((p) => !left.includes(p.id)), spec: { ...whole.spec, unplaced: left.map((id) => ({ id, type: 'resistor', value: '1k' })) } } };
  const dir = tempDir('pb-c16-unplaced-');
  mkdirSync(join(dir, 'c'));
  writeFileSync(join(dir, 'c', 'circuit.json'), JSON.stringify(r.circuit));
  const first = t('en', 'spec.unplaced', { parts: left.join(', ') });
  for (const args of [['simulate', 'c'], ['simulate', 'c', '--run', '0.1'], ['review', 'c']]) {
    const out = kit(dir, ...args);
    assert.equal(out.stdout.split('\n')[0], first, args.join(' '));
  }
  assert.equal(kit(dir, 'review', 'c', '--lang', 'es').stdout.split('\n')[0], t('es', 'spec.unplaced', { parts: left.join(', ') }));
  assert.deepEqual(JSON.parse(kit(dir, 'review', 'c', '--json').stdout).unplaced, left);
  // The schema takes the field: check says nothing about it.
  assert.doesNotMatch(kit(dir, 'check', 'c/circuit.json').stdout, /unplaced/);
});

// layout --fix on a 74HC595 fed 3.3 V and driven by an UNO printed "Applied the fix: U2 = ? in
// series with {with}."; it says the chip is fed from the 5 V rail, and the circuit has no hazard.
test('layout --fix applies the resupply fix, says so, and ends with no hazard', () => {
  const dir = tempDir('pb-c16-resupply-');
  const spec = {
    parts: [
      { id: 'U1', part: 'UNO', program: 'int n = 0;\nvoid setup() { pinMode(11, OUTPUT); pinMode(12, OUTPUT); pinMode(8, OUTPUT); }\nvoid loop() { digitalWrite(8, LOW); shiftOut(11, 12, MSBFIRST, n); digitalWrite(8, HIGH); n = (n + 1) % 256; delay(100); }' },
      { id: 'U2', part: '74HC595' },
      { id: 'R1', type: 'resistor', value: '1k' },
      { id: 'D1', type: 'led', color: 'red' },
    ],
    nets: [['U1.3V3', 'U2.VCC'], ['U1.GND', 'U2.GND', 'U2.OE', 'D1.K'], ['U1.D11', 'U2.SER'], ['U1.D12', 'U2.SRCLK'], ['U1.D8', 'U2.RCLK'], ['U2.QA', 'R1.1'], ['R1.2', 'D1.A'], ['U1.5V', 'U2.SRCLR']],
  };
  writeFileSync(join(dir, 'shift.json'), JSON.stringify(spec));
  const made = kit(dir, 'layout', 'shift', 'shift.json');
  assert.match(made.stdout, /To fix it: feed U2 from U1\.5V/);
  const fixed = kit(dir, 'layout', 'shift', '--fix');
  assert.match(fixed.stdout, /^Applied the fix: U2 fed from U1\.5V \(its VCC moved there\)\.$/m);
  assert.doesNotMatch(fixed.stdout, /\{with\}|= \?/);
  assert.match(fixed.stdout, /^STATUS: DONE/m);
  const r = JSON.parse(kit(dir, 'review', 'shift', '--json').stdout);
  assert.deepEqual(r.hazards, []);
  assert.match(t('es', 'layout.fixApplied.resupply', { part: 'U2', rail: 'U1.5V', pin: 'VCC' }), /U2/);
});

// ── 3. What the skill says the three branches changed, as the kit prints it ────────────────────

const skillFile = (f) => readFileSync(new URL(`../plugin-src/${f}`, import.meta.url), 'utf8');

test('the skill points at --serial and at parts left off the board, inside its size', () => {
  const skill = skillFile('SKILL.md');
  assert.match(skill, /`--serial 1@0\.5` types to a board/);
  assert.match(skill, /A part that "found no place" is off the board: say so\./);
  assert.match(t('en', 'check.LAYOUT_PART_FAILED', { part: 'R4' }), /^R4 found no place/);
  // operations.md's lines are the kit's: the first line of review on such a circuit, the arrow.
  const ops = skillFile('references/operations.md');
  assert.match(ops, /`Not on the board: R4, R5\. …`/);
  assert.ok(t('en', 'spec.unplaced', { parts: 'R4, R5' }).startsWith('Not on the board: R4, R5. '));
  assert.match(t('en', 'layout.next.board', {}), /^→ next /);
  // The rule moved out of SKILL.md is in chips.md.
  assert.match(skillFile('references/chips.md'), /A logic input switches at about half the chip's supply/);
});

test('beyond-the-kit.md: the asks it names say what it quotes', () => {
  const text = skillFile('references/beyond-the-kit.md').replace(/\s+/g, ' ');
  const say = (name) => kit(tempDir('pb-c16-ask-'), 'catalog', name).stdout;
  assert.match(say('keypad'), /Nearest it has: push buttons \(type button\), one per key, each on a board's pin\./);
  assert.ok(text.includes('"Nearest it has: push buttons (type button), one per key, each on a board\'s pin."'));
  for (const name of ['28BYJ-48', 'OLED', 'joystick', 'HC-05', 'ESP8266']) assert.match(say(name), /Nearest it has: /, name);
  for (const name of ['SD card', 'DS3231', 'HX711']) assert.match(say(name), /Nothing near: /, name);
});
