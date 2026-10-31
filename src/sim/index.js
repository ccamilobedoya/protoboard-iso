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
import { lookupModule } from '../parts/modules.js';


export { compile, createEngine };

export function simulate(circuit, options = {}) {
  const { analysis = 'dc' } = options;
  const compiled = compile(circuit);
  if (compiled.fatal) return { analysis, model: true, ok: false, issues: compiled.issues };
  const engine = createEngine(compiled.program);
  return analysis === 'transient' ? engine.transient(options) : engine.dc();
}

// What `check` says about the controls panel (page.controls): each entry must name a part or a
// supply and one of its controls (engine.controls()), with a range inside what makes sense.
// What the page runs of the simulation. By default, whenever it can (a circuit with a source:
// supplies, a battery part or a microcontroller board on USB), everything: the results always on (the tapped part's values, its
// oscilloscope, limits, lit LEDs) and the current layer offered in the bar, not pressed. Each can
// be turned off on its own (`page.results: false`, `page.flow: false`), or both with
// `page.simulation: false` (a value the learner must predict first).
export function pageSimulation(circuit) {
  const page = circuit?.page ?? {};
  if (page.simulation === false) return { results: false, flow: false };
  const usbBoard = (p) => p?.type === 'module' && p.usb !== false && Boolean(lookupModule(p.part)?.module.gpio);
  const hasSource = Boolean(circuit?.supplies?.length) || (circuit?.parts ?? []).some((p) => p?.type === 'battery' || usbBoard(p));
  // page.flow: a boolean, or { style } (the layer offered, drawn in that style; src/sim/paths.js).
  const flow = page.flow != null && typeof page.flow === 'object' ? hasSource : page.flow;
  return { results: page.results ?? hasSource, flow: flow ?? hasSource };
}

export function pageControlIssues(circuit) {
  const list = circuit?.page?.controls;
  if (!Array.isArray(list) || !list.length) return [];
  const warn = (code, params = {}) => ({ severity: 'warning', code, params });
  const out = [];
  const live = pageSimulation(circuit);
  if (!live.results && !live.flow) out.push(warn('PAGE_CONTROLS_NOT_LIVE'));
  const compiled = compile(circuit);
  if (compiled.fatal) return [...out, warn('PAGE_CONTROLS_NO_SIM')];
  const controls = createEngine(compiled.program).controls();
  list.forEach((c, i) => {
    const id = c?.part ?? c?.supply;
    if (!id || (c.part != null && c.supply != null)) return out.push(warn('PAGE_CONTROL_TARGET', { index: i + 1 }));
    const own = controls.filter((x) => x.id === id);
    const found = own.find((x) => x.field === c.field);
    if (!found) return out.push(warn('PAGE_CONTROL_UNKNOWN', { target: id, field: String(c.field), options: own.map((x) => x.field).join(', ') || '—' }));
    if (found.scale === 'momentary' || found.scale === 'toggle') return;
    const [lo, hi] = found.limit ?? [found.min, found.max];
    const min = c.min ?? found.min;
    const max = c.max ?? found.max;
    const scale = c.scale ?? found.scale;
    if (!(min < max) || min < lo || max > hi || (scale === 'log' && !(min > 0))) out.push(warn('PAGE_CONTROL_RANGE', { target: id, field: c.field, min: String(min), max: String(max), lo: String(lo), hi: String(hi) }));
  });
  return out;
}
