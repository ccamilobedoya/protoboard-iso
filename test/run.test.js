// What a circuit does over time, from the command line (simulate --run, src/sim/run.js), and the
// op-amp relaxation oscillator that used to stop at its first switch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../src/sim/index.js';
import { autoLayout } from '../src/layout.js';

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
