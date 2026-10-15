// Golden cases for the simulator: what `simulate()` and its text say today for every example
// (and a few variants that reach the other code paths: current limit, a pressed button,
// transients). Stage 3 rewrites the simulator's insides (device modules, compiled program,
// engine); these numbers must not move while it does. They are not a reference for the
// models (test/sim.test.js and test/sources.test.js are): only "nothing changed".
//
//   node scripts/golden.js --write   → test/fixtures/sim-golden.json (after an intended change)

import { readFileSync, readdirSync } from 'node:fs';
import { simulate } from '../../src/sim/index.js';
import { formatSimulation, partLines } from '../../src/sim/format.js';
import { formatIssue } from '../../src/index.js';

const EXAMPLES = new URL('../../examples/', import.meta.url);
const example = (name) => JSON.parse(readFileSync(new URL(name, EXAMPLES), 'utf8'));
const hasSource = (c) => Array.isArray(c.supplies) || (c.parts ?? []).some((p) => p.type === 'battery');
const bench = (voltage, extra = {}) => [{ id: 'V1', voltage, ...extra }];

export function goldenCases() {
  const cases = [];
  for (const name of readdirSync(EXAMPLES).filter((f) => f.endsWith('.json')).sort()) {
    const circuit = example(name);
    // Examples drawn without a source get a 5 V bench supply on the top rails.
    cases.push({ name, circuit: hasSource(circuit) ? circuit : { ...circuit, supplies: bench(5) } });
  }
  const led = example('led-resistor.json');
  cases.push({ name: 'led-resistor, current limit 5 mA (CC)', circuit: { ...led, supplies: bench(5, { currentLimit: 0.005 }) } });
  cases.push({ name: 'led-resistor, 12 V battery supply', circuit: { ...led, supplies: [{ id: 'B1', kind: 'battery', voltage: 12 }] } });
  const controls = example('controls-and-ics.json');
  cases.push({
    name: 'controls-and-ics, buttons pressed, pot at 0.2',
    circuit: { ...controls, supplies: bench(9), parts: controls.parts.map((p) => (p.type === 'button' ? { ...p, pressed: true } : p.type === 'potentiometer' ? { ...p, position: 0.2 } : p)) },
  });
  const more = example('more-parts.json');
  cases.push({ name: 'more-parts, warm and dark', circuit: { ...more, parts: more.parts.map((p) => (p.type === 'thermistor' ? { ...p, temperature: 60 } : p.type === 'ldr' ? { ...p, light: 1 } : p)) } });
  // Transients: capacitors (regulator, rectifier) and an inductor (more-parts).
  cases.push({ name: 'battery-regulator, transient', circuit: example('battery-regulator.json'), options: { analysis: 'transient', stop: 0.05, step: 1e-4, points: 40 } });
  cases.push({ name: 'rectifier, transient', circuit: example('rectifier.json'), options: { analysis: 'transient', stop: 0.2, step: 5e-4, points: 40 } });
  cases.push({ name: 'more-parts, transient', circuit: more, options: { analysis: 'transient', stop: 0.01, step: 1e-5, points: 40 } });
  cases.push({ name: 'battery-regulator, transient from DC', circuit: example('battery-regulator.json'), options: { analysis: 'transient', stop: 0.01, step: 1e-4, start: 'dc', points: 20 } });
  return cases;
}

// One case → plain JSON: the result, its text in English and Spanish, and each part's card lines.
export function computeGolden({ circuit, options = {} }) {
  const result = simulate(circuit, options);
  const out = { result };
  if (options.analysis !== 'transient') {
    out.text = Object.fromEntries(['en', 'es'].map((lang) => [lang, formatSimulation(result, lang, { formatIssue, netLabels: circuit.netLabels })]));
    if (result.ok) out.lines = Object.fromEntries(['en', 'es'].map((lang) => [lang, Object.fromEntries(Object.entries(result.parts).map(([id, p]) => [id, partLines(p, lang)]))]));
  }
  return JSON.parse(JSON.stringify(out));
}

export function computeAll() {
  return Object.fromEntries(goldenCases().map((c) => [c.name, computeGolden(c)]));
}
