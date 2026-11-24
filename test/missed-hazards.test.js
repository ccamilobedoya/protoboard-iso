// Hazards and "does not work" the simulator misses (reverse power, a negative source, the environment's
// ends, a relay driven too weakly, a button across joined pins, a fix that stops the part, damage texts).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout } from './layout-generous.js';
import { expandRecipe } from '../src/recipes/index.js';
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

const buttonSpec = (nets) => ({ parts: [{ id: 'S1', type: 'button' }, { id: 'R1', type: 'resistor', value: '330' }, { id: 'D1', type: 'led', color: 'red' }], nets, supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }] });

test('a button wired across joined pins still lays out; the finding is a doubt, never a blocking placement problem', () => {
  const across = autoLayout(buttonSpec([['T+', 'S1.1'], ['S1.2', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'T-']]));
  // Built, and the doubt is told before saying it works: WARNINGS, never CHANGES.
  assert.equal(across.status, 'warnings');
  assert.deepEqual(across.review.blocking, []);
  assert.ok(across.review.doubts.some((d) => d.code === 'BUTTON_PINS_JOINED'));
  assert.deepEqual(across.problems ?? [], []);
  assert.ok(checkHazards(across.circuit).doubts.some((d) => d.code === 'BUTTON_PINS_JOINED' && d.severity === 'warning'));
  assert.ok(checkCircuit(across.circuit).issues.some((i) => i.code === 'BUTTON_PINS_JOINED' && i.severity === 'warning'));
  const one = autoLayout(buttonSpec([['T+', 'S1.1', 'S1.2'], ['S1.3', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'T-']]));
  assert.equal(one.status, 'done');
  assert.ok(!checkHazards(one.circuit).doubts.some((d) => d.code === 'BUTTON_PINS_JOINED'));
  assert.ok(!checkCircuit(one.circuit).issues.some((i) => i.code === 'BUTTON_PINS_JOINED'));
});

test('the button recipes lay out DONE with no BUTTON_PINS_JOINED', () => {
  for (const name of ['button-pullup', 'button-pulldown', 'uno-button']) {
    const r = autoLayout(expandRecipe(name).spec);
    assert.equal(r.status, 'done', name);
    assert.ok(!checkCircuit(r.circuit).issues.some((i) => i.code === 'BUTTON_PINS_JOINED'), name);
  }
});

// ---- wording that does not overstate
const lineOf = (c, code, lang = 'en') => {
  const h = checkHazards(c).hazards.find((x) => x.code === code);
  return h ? formatIssue(h, lang) : null;
};

test('reverse supply on a regulator: "can be destroyed", no rating invented, both pins and the voltage named', () => {
  const c = built({ parts: [bat, { id: 'U1', part: '7805' }], nets: [['BT1.-', 'U1.VIN'], ['BT1.+', 'U1.GND'], ['U1.GND', 'T-']] });
  const en = lineOf(c, 'SIM_REVERSE_VOLTAGE');
  assert.match(en, /IN sits 8\.99 V below its GND, and any reverse voltage on a supply is outside its ratings: in a real circuit it can be destroyed\./);
  assert.doesNotMatch(en, /withstands|500 mV/);
  assert.match(lineOf(c, 'SIM_REVERSE_VOLTAGE', 'es'), /se puede destruir\.$/);
});

test('a capacitor over its rating: ceramic breaks down, electrolytic vents; a slight reverse only degrades', () => {
  const over = (kind) => built({ parts: [bat, { id: 'C1', type: 'capacitor', value: '100n', kind, voltage: 6 }], nets: [['BT1.+', 'C1.+'], ['BT1.-', 'C1.-']] });
  assert.match(lineOf(over('electrolytic'), 'SIM_CAP_OVER_VOLTAGE'), /heats up, vents and can burst/);
  const ceramic = built({ parts: [{ id: 'C1', type: 'capacitor', value: '100n' }], nets: [['T+', 'C1.1'], ['T-', 'C1.2']], supplies: [{ id: 'V1', kind: 'bench', voltage: 90, positive: 'T+', negative: 'T-' }] });
  assert.match(lineOf(ceramic, 'SIM_CAP_OVER_VOLTAGE'), /its dielectric can break down and short\./);
  const slight = built({ parts: [{ id: 'C1', type: 'capacitor', value: '100u', kind: 'electrolytic' }], nets: [['T+', 'C1.-'], ['T-', 'C1.+']], supplies: [{ id: 'V1', kind: 'bench', voltage: 1.5, positive: 'T+', negative: 'T-' }] });
  assert.match(lineOf(slight, 'SIM_CAP_REVERSED'), /degrades and can fail/);
  const hard = built({ parts: [{ id: 'C1', type: 'capacitor', value: '100u', kind: 'electrolytic' }], nets: [['T+', 'C1.-'], ['T-', 'C1.+']], supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }] });
  assert.match(lineOf(hard, 'SIM_CAP_REVERSED'), /vents and can burst/);
});

test('a LED reversed past its rating can burn out; forward over-current burns out', () => {
  const led = (a, k) => built({ parts: [{ id: 'D1', type: 'led', color: 'red' }], nets: [['T+', a], [k, 'T-']], supplies: [{ id: 'V1', kind: 'bench', voltage: 9, positive: 'T+', negative: 'T-' }] });
  assert.match(lineOf(led('D1.K', 'D1.A'), 'SIM_REVERSE_VOLTAGE'), /it can burn out\.$/);
  assert.match(lineOf(led('D1.A', 'D1.K'), 'SIM_OVER_CURRENT'), /it burns out\.$/);
});

test('a relay driven too weakly says it may not pull in; the daylight leak is no drive; the dark is the state reported', () => {
  const day = { ...built(NIGHT('10k')), environment: { light: 300 } };
  const r = checkHazards(day);
  const d = r.doubts.find((x) => x.code === 'SIM_RELAY_UNDERDRIVEN');
  assert.ok(d, JSON.stringify(r.doubts));
  assert.equal(d.when.field, 'light');
  assert.equal(d.when.end, 'min');
  assert.ok(d.params.current.value > 0.04);
  assert.match(formatIssue(d, 'en'), /it may not pull in.*with the environment's light at its minimum\.$/);
  assert.match(formatIssue(d, 'es'), /con luz del ambiente en su mínimo\.$/);
  assert.ok(!simulate(day).issues.some((i) => i.code === 'SIM_RELAY_UNDERDRIVEN'), 'at rest in daylight: a leak, not a drive');
});

test('a circuit that declares no environment still has its sensor visited at both ends', () => {
  const c = built(NIGHT('10k'));
  assert.equal(c.environment, undefined);
  const r = checkHazards(c);
  const d = r.doubts.find((x) => x.code === 'SIM_RELAY_UNDERDRIVEN');
  assert.ok(d, JSON.stringify(r.doubts));
  assert.deepEqual([d.when.field, d.when.end], ['light', 'min']);
  assert.equal(r.states.environment, 1);
  assert.equal(r.states.checked, r.states.total);
  const rest = simulate(c);
  assert.ok(!rest.issues.some((i) => i.code === 'SIM_RELAY_UNDERDRIVEN'), 'the reading at rest is the sensor\'s own value, unchanged');
});
