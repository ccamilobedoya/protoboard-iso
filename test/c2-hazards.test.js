// Hazards and "does not work" the simulator misses (reverse power, a negative source, the environment's
// ends, a relay driven too weakly, a button across joined pins, a fix that stops the part, damage texts).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout } from '../src/layout.js';
import { checkHazards, simulate } from '../src/sim/index.js';
import { hazardFix } from '../src/fix.js';
import { checkCircuit, formatIssue } from '../src/index.js';
import { formatSimulation } from '../src/sim/format.js';

const built = (spec) => autoLayout(spec).circuit;
const codes = (r) => r.hazards.map((h) => `${h.code} ${h.params.part}`);
const bat = { id: 'BT1', type: 'battery', format: '9V' };

test('a battery reversed into a 7805 is a reverse-voltage hazard; the right way round is not', () => {
  const wrong = built({ parts: [bat, { id: 'U1', part: '7805' }], nets: [['BT1.-', 'U1.VIN'], ['BT1.+', 'U1.GND'], ['U1.GND', 'T-']] });
  assert.ok(codes(checkHazards(wrong)).includes('SIM_REVERSE_VOLTAGE U1'));
  const right = built({ parts: [bat, { id: 'U1', part: '7805' }], nets: [['BT1.+', 'U1.VIN'], ['BT1.-', 'U1.GND'], ['U1.GND', 'T-']] });
  assert.ok(!codes(checkHazards(right)).some((c) => c.startsWith('SIM_REVERSE_VOLTAGE')));
});

test('an electrolytic reversed across 9 V is a hazard, the right way round is not', () => {
  const spec = (a, b) => ({ parts: [bat, { id: 'C1', type: 'capacitor', value: '100u', kind: 'electrolytic' }], nets: [['BT1.+', a], ['BT1.-', b]] });
  assert.ok(codes(checkHazards(built(spec('C1.-', 'C1.+')))).some((c) => c.startsWith('SIM_CAP_REVERSED')));
  assert.equal(checkHazards(built(spec('C1.+', 'C1.-'))).hazards.length, 0);
});

test('a bench supply of -9 V is a supply: the LED wired to conduct lights', () => {
  const c = built({ parts: [{ id: 'R1', type: 'resistor', value: '330' }, { id: 'D1', type: 'led', color: 'red' }], nets: [['T+', 'D1.K'], ['D1.A', 'R1.1'], ['R1.2', 'T-']], supplies: [{ id: 'V1', kind: 'bench', voltage: -9, positive: 'T+', negative: 'T-' }] });
  const r = simulate(c);
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.parts.D1.current - 0.0215) < 0.002, `${r.parts.D1.current}`);
});

const NIGHT = (base) => ({
  parts: [{ id: 'R1', type: 'resistor', value: '10k' }, { id: 'LDR1', type: 'ldr', part: 'GL5528' }, { id: 'R2', type: 'resistor', value: base }, { id: 'Q1', part: '2N2222A' }, { id: 'K1', type: 'relay' }, { id: 'D1', part: '1N4007' }, { id: 'R3', type: 'resistor', value: '330' }, { id: 'D2', type: 'led', color: 'red' }],
  nets: [['T+', 'R1.1', 'K1.A1', 'D1.K', 'K1.COM'], ['R1.2', 'LDR1.1', 'R2.1'], ['R2.2', 'Q1.B'], ['K1.A2', 'D1.A', 'Q1.C'], ['LDR1.2', 'Q1.E', 'T-'], ['K1.NO', 'R3.1'], ['R3.2', 'D2.A'], ['D2.K', 'T-']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
});

test('the relay night light: driven but not pulled in is said, in the dark; 1 k bases pull it in', () => {
  const dark = (base) => ({ ...built(NIGHT(base)), environment: { light: 0 } });
  const weak = checkHazards(dark('10k'));
  assert.ok(weak.doubts.some((d) => d.code === 'SIM_RELAY_UNDERDRIVEN'), JSON.stringify(weak.doubts));
  assert.ok(simulate(dark('10k')).issues.some((i) => i.code === 'SIM_RELAY_UNDERDRIVEN'));
  assert.ok(weak.states.environment >= 1);
  const strong = simulate(dark('1k'));
  assert.ok(!strong.issues.some((i) => i.code === 'SIM_RELAY_UNDERDRIVEN'));
  assert.equal(strong.parts.K1.closed, true);
});

test('a button with different nets on two joined pins is BUTTON_PINS_JOINED; wired across, it is not', () => {
  const circuit = (pins) => ({ parts: [{ id: 'S1', type: 'button', pins }, { id: 'R1', type: 'resistor', value: '1k', pins: ['i2', 'i8'] }, { id: 'R2', type: 'resistor', value: '1k', pins: ['j4', 'j9'] }] });
  const has = (c) => checkCircuit(c).issues.some((i) => i.code === 'BUTTON_PINS_JOINED');
  assert.equal(has(circuit(['f2', 'f4', 'e2', 'e4'])), true);
  const across = { parts: [{ id: 'S1', type: 'button', pins: ['f2', 'f4', 'e2', 'e4'] }, { id: 'R1', type: 'resistor', value: '1k', pins: ['i2', 'i8'] }, { id: 'R2', type: 'resistor', value: '1k', pins: ['a2', 'a9'] }] };
  assert.equal(has(across), false);
});

test('a motor rated to 3 V on 5 V has no computed fix; an LED on 9 V keeps its resistor, with the clause', () => {
  const motor = built({ parts: [{ id: 'M1', type: 'motor', part: 'RE-140RA-2270' }], nets: [['T+', 'M1.+'], ['M1.-', 'T-']], supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }] });
  const m = checkHazards(motor);
  assert.ok(m.hazards.length);
  assert.equal(hazardFix(motor, m.hazards).fix, null);
  const led = built({ parts: [{ id: 'D1', type: 'led', color: 'red' }], nets: [['T+', 'D1.A'], ['D1.K', 'T-']], supplies: [{ id: 'V1', kind: 'bench', voltage: 9, positive: 'T+', negative: 'T-' }] });
  const l = checkHazards(led);
  const fix = hazardFix(led, l.hazards).fix;
  assert.ok(fix.value >= 330 && fix.value <= 390, `${fix.value}`);
  assert.match(formatIssue(l.hazards[0], 'en'), /: it burns out\.$/);
  assert.match(formatIssue(l.hazards[0], 'es'), /: se quema\.$/);
  const shown = formatSimulation(simulate(led), 'en', { formatIssue });
  assert.match(shown, /brightness over its maximum/);
  assert.doesNotMatch(shown, /\d{4} %/);
});
