// Simulator: from a circuit file to node voltages and part currents.
//
//   simulate(circuit, { analysis: 'dc' })                                   → operating point
//   simulate(circuit, { analysis: 'transient', stop, step, start, points })  → time series
//
// Power comes from the circuit's `supplies` (a bench supply on the rails, or a battery that is
// not drawn) and from every `battery` part (drawn beside the board, see src/parts/batteries.js).
// Both become the same thing: an ideal voltage source behind an internal resistance.
// Every result is a **model**: ideal strips, typical part values (models.js).
// Parts the simulator does not know yet (integrated circuits) are left unconnected and reported.
//
// Two steps: compile.js turns the circuit into a program (plain JSON, Node only), engine.js runs
// it (no dependencies: the page bundles it, see docs/en/live-simulation.md).

import { compile } from './compile.js';
import { createEngine } from './engine.js';

export { compile, createEngine };

export function simulate(circuit, options = {}) {
  const { analysis = 'dc' } = options;
  const compiled = compile(circuit);
  if (compiled.fatal) return { analysis, model: true, ok: false, issues: compiled.issues };
  const engine = createEngine(compiled.program);
  return analysis === 'transient' ? engine.transient(options) : engine.dc();
}
