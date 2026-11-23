// The join of the last three branches (C16), each test from a reproduction: the sketch runner's
// warnings are doubts of the review wherever they are raised, and what each branch left for a file it
// did not own (the MCP tool's serial input, layout's Behaviour line, a print at a run's end, a circuit
// saved with parts left out, the resupply fix applied by layout).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout } from './layout-generous.js';
import { review } from '../src/index.js';

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
