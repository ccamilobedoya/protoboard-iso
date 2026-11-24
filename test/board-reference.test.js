// A board on USB is a source of its own: the side of a circuit it powers, kept apart from the other
// supplies (the output side of an optocoupler read by an UNO, isolated from a 12 V side), is measured
// from the board's GND and is not floating. It was "no DC path to the supply" and ended WARNINGS on
// a correct isolated design.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout } from './layout-generous.js';
import { simulate } from '../src/sim/index.js';

const d2 = (r) => r.parts.A1.pins.find((p) => p.name === 'D2').voltage;
const SKETCH = 'void setup() {\n  Serial.begin(9600);\n  pinMode(2, INPUT_PULLUP);\n}\n\nvoid loop() {\n  Serial.println(digitalRead(2));\n  delay(100);\n}';
const spec = (pressed) => ({
  supplies: [{ id: 'V1', voltage: 12, positive: 'S1.1', negative: 'U1.K' }],
  parts: [{ id: 'S1', type: 'button', ...(pressed && { pressed: true }) }, { id: 'R1', type: 'resistor', value: '1k' }, { id: 'U1', part: 'PC817' }, { id: 'A1', part: 'UNO', program: SKETCH }],
  nets: [['S1.3', 'R1.1'], ['R1.2', 'U1.A'], ['U1.C', 'A1.D2'], ['U1.E', 'A1.GND']],
});

test('an UNO reading a PC817 on its own side: DONE, not floating, its pin pulled low when the far side lights the LED', () => {
  const r = autoLayout(spec(false));
  assert.equal(r.status, 'done', JSON.stringify(r.review.doubts.map((d) => d.code)));
  const rest = simulate(r.circuit);
  assert.ok(!rest.issues.some((i) => i.code === 'SIM_FLOATING'), JSON.stringify(rest.issues.map((i) => i.code)));
  assert.ok(rest.issues.some((i) => i.code === 'SIM_SEPARATE_CIRCUIT' && i.params.supply === 'A1' && i.params.variant === 'board'));
  assert.ok(d2(rest) > 4.5, `D2 at rest: ${d2(rest)}`);
  const lit = simulate(autoLayout(spec(true)).circuit);
  assert.ok(d2(lit) < 0.3, `D2 with the button pressed: ${d2(lit)}`);
});
