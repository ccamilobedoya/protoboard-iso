// Linear Hall sensor 49E / SS49E (bare, or on its KY-035 module; docs/en/analog-sensors.md): a
// behavioural source, as the LM35 is, whose output is ratiometric:
//
//   Vout = Vs/2 + 1.4 mV/G · (Vs / 5 V) · field,   held inside [0.95 V, Vs − 0.95 V]
//
// where Vs is the voltage between its supply and ground pins. The output sits behind 50 Ω and the chip
// takes 6 mA from the supply (models.js HALL_LINEAR). It senses the environment's `field` (+ is a south
// pole facing the marked face), unless the part gives its own.
//
// The element is the regulator's (../mna.js regulatorElement: the output held by a branch current that
// comes from the supply, the chip's own current beside it) with a reference that follows the supply and
// the field instead of a constant. The slope is taken numerically: the clamp is rounded over 20 mV so
// the solver never meets a corner.
//
// The reading has the field, the voltage it should give, the output and the supply, the current VOUT
// gives and the chip's own. Stresses: the supply over 8 V or reversed. Notes: the supply under 2.7 V
// (the shared low-supply note), more than 1.5 mA taken from the output.

import { resistor } from '../mna.js';
import { HALL_LINEAR } from '../models.js';
import { stress, note, q, volt, positiveNumbers } from './shared.js';

const ROUND = 0.02; // V: how round the clamp's corners are
const smax = (a, b) => (a + b + Math.sqrt((a - b) ** 2 + ROUND ** 2)) / 2;
const smin = (a, b) => (a + b - Math.sqrt((a - b) ** 2 + ROUND ** 2)) / 2;

// The output for a supply u (volts) and a field (gauss), above ground.
export function hallOutput(m, u, field) {
  // A reversed supply switches the chip off: the output stays at its ground pin (0 V behind 50 Ω).
  u = Math.max(0, u);
  const raw = u / 2 + m.sensitivity * (u / m.reference) * field;
  // Under about 2 V the two margins would cross: they shrink with the supply.
  const margin = Math.min(m.margin, 0.45 * Math.max(0, u));
  return smin(smax(raw, margin), u - margin);
}

// The element: V(out) − V(ref) = hallOutput(V(inp) − V(ref)), the output current from the supply, and
// the chip's own current, quiescent · tanh(u / 0.5 V).
function hallElement(inp, ref, out, field, m) {
  const f = (u) => hallOutput(m, u, field);
  const iq = (u) => m.quiescent * Math.tanh(u / 0.5);
  const giq = (u) => (m.quiescent / 0.5) * (1 - Math.tanh(u / 0.5) ** 2);
  return {
    nodes: [inp, ref, out],
    links: [[out, ref], [inp, ref]],
    branch: null,
    needsRow: true,
    stamp(st, x) {
      const k = this.branch;
      const u = volt(x, inp) - volt(x, ref);
      const e = 1e-6;
      const df = (f(u + e) - f(u - e)) / (2 * e);
      st.add(inp, k, 1);
      st.add(out, k, -1);
      st.add(k, out, 1);
      st.add(k, ref, -1 + df);
      st.add(k, inp, -df);
      st.rhs(k, f(u) - df * u);
      const g = giq(u);
      st.conductance(inp, ref, g);
      st.current(inp, ref, iq(u) - g * u);
      return false;
    },
    currents(x) {
      const io = x[this.branch];
      const quiescent = iq(volt(x, inp) - volt(x, ref));
      return [io + quiescent, -quiescent, -io];
    },
  };
}

export const hallSensor = {
  types: ['hall-sensor'],
  kind: 'HAL',
  senses: ['field'],
  params(part, c) {
    const e = part.def.electrical;
    return { part: e.part, roles: e.roles, field: c?.env?.('field') ?? e.field ?? 0, model: { ...HALL_LINEAR, ...positiveNumbers(part.raw.model) } };
  },
  // ±500 G on the slider, ±10 000 G typed (the datasheet's linear range is about ±650 G).
  controls: (p) => ({ field: { min: -500, max: 500, limit: [-10000, 10000], scale: 'linear', unit: 'G', step: 1, value: p.field } }),
  set: (p, control, value) => (control === 'field' ? { ...p, field: Number(value) } : null),
  elements(p, h) {
    const mid = h.inner();
    const m = p.model;
    const main = h.add(hallElement(h.pin(p.roles.vcc), h.pin(p.roles.gnd), mid, p.field, m));
    const out = h.add(resistor(mid, h.pin(p.roles.out), m.outputResistance));
    return { main, out };
  },
  read(entry, h) {
    const at = (role) => h.volt(entry.pins.find((p) => p.name === entry.roles[role]).index);
    const [iin, ignd] = entry.main.currents(h.x, h.ctx);
    const iout = entry.out.currents(h.x, h.ctx)[0];
    const [vs, vout] = [at('vcc') - at('gnd'), at('out') - at('gnd')];
    const quiescent = -ignd;
    return {
      field: entry.field,
      ideal: hallOutput(entry.model, vs, entry.field),
      vs,
      vout,
      current: iout,
      supply: iin,
      quiescent,
      power: vs * iin - vout * iout,
      state: vs < 0.5 ? 'off' : vs < entry.model.minSupply ? 'low' : 'ok',
      currents: { [entry.roles.vcc]: iin, [entry.roles.out]: -iout, [entry.roles.gnd]: ignd },
    };
  },
  limits(entry, r) {
    const m = entry.model;
    const out = [
      stress('SIM_IC_SUPPLY', 'voltage', r.vs, m.maxSupply, 'V'),
      stress('SIM_REVERSE_VOLTAGE', 'reverse', -r.vs, m.maxReverse, 'V', { param: 'voltage' }),
    ];
    if (r.state === 'low') out.push(note('warning', 'SIM_MODULE_LOW_SUPPLY', { part: entry.id, voltage: q(r.vs, 'V'), min: q(m.minSupply, 'V') }));
    if (Math.abs(r.current) > m.loadNote) out.push(note('info', 'SIM_HALL_LOAD', { part: entry.id, current: q(Math.abs(r.current), 'A'), max: q(m.loadNote, 'A') }));
    return out;
  },
  lines(p, h) {
    const lines = [];
    if (p.state !== 'ok') lines.push(h.raw(`hall.${p.state}`, h.t(`sim.hall.${p.state}`)));
    lines.push(
      h.q('hall.field', `${String(Math.round(p.field * 10) / 10).replace('.', h.decimal)} G · ${h.t(p.field > 0 ? 'sim.hall.south' : p.field < 0 ? 'sim.hall.north' : 'sim.hall.none')}`),
      h.q('hall.vout', h.f(p.vout, 'V')),
      h.q('hall.vs', h.f(p.vs, 'V')),
      h.q('hall.iout', h.f(Math.abs(p.current) < 1e-9 ? 0 : p.current, 'A')),
      h.q('hall.own', h.f(p.quiescent, 'A')),
    );
    return lines;
  },
  // The tag: what it takes from its supply.
  tag: (r) => ({ label: '', value: Math.abs(r.supply), key: 'current' }),
  scope: (r) => ({ v: { label: 'Vout', value: r.vout }, i: null }),
  // An equivalent: a source of the output it gives now behind its output resistance and a resistor across
  // the supply for its own current.
  falstad(d, f) {
    const p = d.params;
    const [vs, out, gnd] = ['vcc', 'out', 'gnd'].map((role) => f.pin(d, p.roles[role]));
    const now = f.reading?.parts?.[d.id];
    const vout = now && now.state !== 'off' ? now.vout + now.current * p.model.outputResistance : hallOutput(p.model, 5, p.field);
    const mid = f.inner(d.id);
    f.voltage(gnd, mid, vout);
    f.resistor(mid, out, p.model.outputResistance);
    f.resistor(vs, gnd, now?.vs > 1 ? Math.min(1e7, now.vs / p.model.quiescent) : 1e3);
    f.note('falstad.hall', { part: d.id, voltage: q(vout, 'V'), field: q(p.field, 'G') });
  },
};
