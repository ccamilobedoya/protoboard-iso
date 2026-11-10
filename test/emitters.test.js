// Emitters (docs/en/environment.md#emitters): a part whose electrical state writes a field of the
// environment, here a KY-008 laser and a photoresistor. The contract: what the sensors see is the
// ambient plus the emitters' share; `beam` blocks the emitted light; the fixed point at the start, after
// a set and in DC; one time step of delay; a loop that does not settle says SIM_ENV_FEEDBACK; an emitter
// without an environment says ENV_EMITTER_ALONE; a circuit without emitters is untouched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, createEngine, simulate } from '../src/sim/index.js';
import { seenValues, emittedShare, isBlocked, FIELDS } from '../src/sim/environment.js';
import { ldrResistance, LDR_PARTS } from '../src/parts/sensors.js';
import { checkCircuit } from '../src/index.js';

const codes = (issues) => issues.map((i) => i.code);
// The laser from the + rail (S) to the − rail, a 10 kΩ over a photoresistor from + to −.
const parts = (reversed) => [
  { id: 'LS1', type: 'laser', pins: reversed ? ['e12', 'e11', 'e10'] : ['e10', 'e11', 'e12'] },
  { id: 'W1', type: 'wire', pins: ['a10', 'T+10'] },
  { id: 'W2', type: 'wire', pins: ['a12', 'T-12'] },
  { id: 'R1', type: 'resistor', value: '10k', pins: ['a20', 'T+19'] },
  { id: 'LDR1', type: 'ldr', pins: ['c20', 'c24'] },
  { id: 'W3', type: 'wire', pins: ['a24', 'T-25'] },
];
const circuit = ({ env, supply = { id: 'V1', kind: 'bench', voltage: 5 }, reversed = false, without = [] } = {}) => ({
  version: 1,
  board: 'bb830',
  ...(env && { environment: env }),
  parts: parts(reversed).filter((p) => !without.includes(p.id)),
  supplies: [{ positive: 'T+', negative: 'T-', ...supply }],
});
// The laser through an NPN whose base an LDR pulls down when it is bright: its own light turns it off.
const feedbackCircuit = {
  version: 1,
  board: 'bb830',
  environment: { light: 50 },
  parts: [
    { id: 'LS1', type: 'laser', pins: ['e10', 'e11', 'e12'] },
    { id: 'W1', type: 'wire', pins: ['a10', 'T+10'] },
    { id: 'Q1', type: 'bjt', part: '2N3904', pins: ['e16', 'e15', 'e14'] },
    { id: 'W4', type: 'wire', pins: ['b12', 'b14'] },
    { id: 'W2', type: 'wire', pins: ['a16', 'T-16'] },
    { id: 'R1', type: 'resistor', value: '10k', pins: ['a15', 'T+18'] },
    { id: 'LDR1', type: 'ldr', pins: ['c15', 'c19'] },
    { id: 'W3', type: 'wire', pins: ['a19', 'T-21'] },
  ],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
};
const engineOf = (c) => createEngine(compile(c).program);
const ldrAt = (light) => ldrResistance(LDR_PARTS.GL5528, light);

test('emitters: seenValues adds the share, clamps it, and beam blocks the emitted light only', () => {
  assert.equal(FIELDS.light.blockedBy, 'beam');
  const e = { light: { total: 1000, parts: { LS1: 1000 } } };
  assert.deepEqual(seenValues({ light: 50, beam: 0 }, e), { light: 1050, beam: 0 });
  assert.deepEqual(seenValues({ light: 50, beam: 1 }, e), { light: 50, beam: 1 });
  assert.equal(seenValues({ light: 999500 }, e).light, 1e6, 'clamped to the field limit');
  assert.equal(seenValues({ light: 50 }, {}).light, 50);
  assert.equal(isBlocked('light', { beam: 1 }), true);
  assert.equal(isBlocked('temperature', { beam: 1 }), false);
  assert.equal(emittedShare('light', e.light, { beam: 0 }), 1000);
  // A switch field: the ambient or any emitter.
  assert.equal(seenValues({ rain: 0 }, { rain: { total: 1, parts: { X: 1 } } }).rain, 1);
  assert.equal(seenValues({ rain: 0 }, { rain: { total: 0, parts: { X: 0 } } }).rain, 0);
});

test('emitters: the fixed point at creation, the share, ambient() and emissions(), the lit photoresistor', () => {
  const e = engineOf(circuit({ env: { light: 50 } }));
  let share = e.emissions().light.total;
  assert.ok(share > 5000, `share ${share}`);
  assert.deepEqual(Object.keys(e.emissions().light.parts), ['LS1']);
  assert.equal(e.emissions().light.blocked, false);
  assert.equal(e.ambient().light, 50);
  assert.ok(Math.abs(e.environment().light - (50 + share)) < 1e-6);
  const light = e.controls().find((c) => c.id === 'environment' && c.field === 'light');
  assert.equal(light.value, 50, 'the slider moves the ambient');
  assert.ok(Math.abs(light.emitted - share) < 1e-6);
  // beam joins the environment with an emitter of light: the toggle that cuts it.
  assert.ok(e.controls().some((c) => c.id === 'environment' && c.field === 'beam'));
  assert.ok(e.start('dc'));
  share = e.emissions().light.total;
  const r = e.read().parts.LDR1;
  assert.ok(Math.abs(r.sensor.resistance - ldrAt(50 + share)) / ldrAt(50 + share) < 1e-6);
  assert.ok(r.sensor.resistance * 10 < ldrAt(50));
  assert.deepEqual(r.env, [{ field: 'light', follows: true, value: e.environment().light }]);
  // The laser's card knows its light reaches the sensors.
  assert.deepEqual(e.read().parts.LS1.emission.light, { value: share, blocked: false, blockedBy: 'beam' });
});

test('emitters: beam blocks the share and back; a set of light moves the ambient only', () => {
  const e = engineOf(circuit({ env: { light: 50 } }));
  assert.ok(e.start('dc'));
  const share = e.emissions().light.total;
  assert.ok(e.set('environment', 'beam', 1));
  assert.equal(e.environment().light, 50);
  assert.ok(Math.abs(e.read().parts.LDR1.sensor.resistance - ldrAt(50)) < 1e-6);
  assert.equal(e.controls().find((c) => c.id === 'environment' && c.field === 'light').emitted, 0);
  assert.equal(e.emissions().light.blocked, true);
  assert.equal(e.read().parts.LS1.emission.light.blocked, true);
  // Back: the share again (each solve measures it anew, so within the fixed point's 1e-3).
  const near = (a, b) => Math.abs(a - b) <= 1e-3 * b;
  assert.ok(e.set('environment', 'beam', 0));
  assert.ok(near(e.environment().light, 50 + share));
  assert.ok(e.set('environment', 'light', 500));
  assert.equal(e.ambient().light, 500);
  assert.ok(near(e.environment().light, 500 + share));
  // Before any start too.
  const f = engineOf(circuit({ env: { light: 50 } }));
  assert.ok(f.set('environment', 'beam', 1));
  assert.equal(f.environment().light, 50);
});

test('emitters: DC simulate solves the fixed point; a control that cuts the laser settles again', () => {
  const r = simulate(circuit({ env: { light: 50 } }));
  assert.ok(r.ok);
  assert.ok(r.parts.LDR1.sensor.light > 5000);
  assert.ok(!codes(r.issues).includes('SIM_ENV_FEEDBACK'));
  const e = engineOf(circuit({ env: { light: 50 } }));
  assert.ok(e.start('dc'));
  assert.ok(e.set('V1', 'voltage', 0));
  assert.equal(e.environment().light, 50);
  assert.equal(e.read().parts.LDR1.sensor.light, 50);
});

test('emitters: what a step emits reaches the sensors one step later', () => {
  // A square wave of 0…5 V at 10 Hz feeds the laser: high for 50 ms, low for 50 ms.
  const e = engineOf(circuit({ env: { light: 50 }, supply: { id: 'G1', kind: 'generator', waveform: 'square', frequency: 10, amplitude: 2.5, offset: 2.5, resistance: 0 } }));
  assert.ok(e.start('dc', 1e-3));
  const seen = [];
  const lit = [];
  for (let k = 0; k < 120; k++) {
    assert.ok(e.step(1e-3));
    lit.push(e.read().parts.LS1.light > 1000);
    seen.push(e.environment().light > 1000);
  }
  // The first step whose laser is dark, and the light the sensors see then and a step later.
  const off = lit.indexOf(false);
  assert.ok(off > 0);
  assert.equal(seen[off], true, 'the step that turns it off still shows the light of the step before');
  assert.equal(seen[off + 1], false);
  assert.equal(e.read().parts.LDR1.sensor.light, e.environment().light);
  const on = lit.indexOf(true, off);
  assert.equal(seen[on], false);
  assert.equal(seen[on + 1], true);
});

test('emitters: a loop through the environment ends with SIM_ENV_FEEDBACK after 8 rounds', () => {
  // The laser through an NPN whose base an LDR pulls down when it is bright: its own light turns it off.
  const c = feedbackCircuit;

  const r = simulate(c);
  assert.ok(r.ok);
  const note = r.issues.find((i) => i.code === 'SIM_ENV_FEEDBACK');
  assert.ok(note);
  assert.deepEqual([note.params.field, note.params.emitters, note.params.sensors, note.params.rounds], ['light', 'LS1', 'LDR1', 8]);
  // Stepping, it flickers: on one step, off the next.
  const e = engineOf(c);
  assert.ok(e.start('dc'));
  const states = Array.from({ length: 6 }, () => (e.step(1e-3), e.read().parts.LS1.light > 0));
  assert.ok(states.includes(true) && states.includes(false));
});

test('emitters: alone without an environment (ENV_EMITTER_ALONE), the sensor keeps its default', () => {
  const r = simulate(circuit());
  assert.ok(codes(r.issues).includes('ENV_EMITTER_ALONE'));
  assert.equal(r.parts.LDR1.sensor.light, 100);
  assert.equal(r.parts.LS1.emission, undefined);
  assert.ok(codes(checkCircuit(circuit()).issues).includes('ENV_EMITTER_ALONE'));
  assert.ok(!codes(checkCircuit(circuit({ env: {} })).issues).includes('ENV_EMITTER_ALONE'));
  const e = engineOf(circuit());
  assert.deepEqual(e.emissions(), {});
  assert.deepEqual(e.environment(), {});
});

test('emitters: a circuit with no emitter has no emissions and no emitted share in its controls', () => {
  const e = engineOf(circuit({ env: { light: 50 }, without: ['LS1', 'W1', 'W2'] }));
  assert.ok(e.start('dc'));
  assert.deepEqual(e.emissions(), {});
  assert.deepEqual(e.environment(), e.ambient());
  for (const c of e.controls()) assert.equal('emitted' in c, false);
  assert.ok(e.set('environment', 'light', 500));
  assert.equal(e.environment().light, 500);
  // The program has no emitter record, and no beam was added to its fields.
  const program = compile(circuit({ env: { light: 50 }, without: ['LS1', 'W1', 'W2'] })).program;
  assert.ok(program.devices.every((d) => !d.emits));
  assert.deepEqual(program.environment.fields, ['light']);
});

test('emitters: the share a control says is what arrives, clamped by the field\'s limit; emissions keep the whole', () => {
  const e = engineOf(circuit({ env: { light: 999999 } }));
  assert.ok(e.start('dc'));
  const light = e.controls().find((c) => c.id === 'environment' && c.field === 'light');
  assert.equal(light.value, 999999);
  assert.ok(Math.abs(light.emitted - 1) < 1e-6, `${light.emitted}`);
  assert.equal(e.environment().light, 1e6);
  assert.ok(e.emissions().light.total > 5000);
  assert.ok(e.set('environment', 'light', 1e6));
  assert.equal(e.controls().find((c) => c.id === 'environment' && c.field === 'light').emitted, 0);
  assert.equal(emittedShare('light', { total: 10, parts: {} }, { light: 1e6 + 5 }), 0, 'never negative');
});

test('emitters: SIM_ENV_FEEDBACK comes with DC before and after a start, and goes once the loop settles', () => {
  const has = (r) => codes(r.issues).includes('SIM_ENV_FEEDBACK');
  const e = engineOf(feedbackCircuit);
  assert.ok(has(e.dc()), 'before a start');
  assert.ok(e.start('dc'));
  assert.ok(has(e.dc()), 'after the start');
  for (let k = 0; k < 4; k++) e.step(1e-3);
  assert.ok(has(e.dc()), 'still a loop while stepping');
  // Cut the supply: nothing lights, the loop settles and the note goes.
  assert.ok(e.set('V1', 'voltage', 0));
  assert.ok(!has(e.dc()));
});

test('emitters: dc() on a started engine is the circuit as the sensors last felt it (no new fixed point)', () => {
  const e = engineOf(circuit({ env: { light: 50 }, supply: { id: 'G1', kind: 'generator', waveform: 'square', frequency: 10, amplitude: 2.5, offset: 2.5, resistance: 0 } }));
  assert.ok(e.start('dc', 1e-3));
  // Step to the first step where the laser is dark: the sensors still feel the light of the step before.
  let k = 0;
  while (e.read().parts.LS1.light > 0 && k++ < 200) e.step(1e-3);
  assert.ok(e.environment().light > 1000);
  const dc = e.dc();
  assert.ok(dc.ok);
  assert.equal(dc.parts.LDR1.sensor.light, e.environment().light);
  assert.equal(e.read().parts.LDR1.sensor.light, e.environment().light, 'dc() changed nothing in the running engine');
});
