// Bipolar transistor: Ebers–Moll transport model with constant β; NPN or PNP. A Darlington
// (TIP120) is two transistors with their two resistors.

import { bjt as bjtEl, resistor } from '../mna.js';
import { BJTS, BJT_DEFAULT } from '../models.js';
import { issue, stress } from './shared.js';

export const bjt = {
  types: ['bjt'],
  kind: 'Q',
  params(part, c) {
    const e = part.def.electrical;
    const known = BJTS[e.part];
    if (!known) c.issues.push(issue('info', 'SIM_DEFAULT_MODEL', { part: part.id, model: 'BJT' }));
    return { model: { ...BJT_DEFAULT, ...(e.polarity && { polarity: e.polarity }), ...known, ...part.raw.model } };
  },
  elements(p, h) {
    const { model } = p;
    if (model.darlington) {
      const { first, second, r1, r2 } = model.darlington;
      const x = h.inner();
      const entry = {};
      entry.first = h.add(bjtEl(h.pin('C'), h.pin('B'), x, { ...first, polarity: model.polarity }));
      entry.second = h.add(bjtEl(h.pin('C'), x, h.pin('E'), { ...second, polarity: model.polarity }));
      entry.r1 = h.add(resistor(h.pin('B'), x, r1));
      entry.r2 = h.add(resistor(x, h.pin('E'), r2));
      return entry;
    }
    return { main: h.add(bjtEl(h.pin('C'), h.pin('B'), h.pin('E'), model)) };
  },
  read(entry, h) {
    const c = entry.pins.find((p) => p.name === 'C').index;
    const b = entry.pins.find((p) => p.name === 'B').index;
    const e = entry.pins.find((p) => p.name === 'E').index;
    let ic;
    let ib;
    if (entry.main) [ic, ib] = entry.main.currents(h.x, h.ctx);
    else {
      const [c1, b1] = entry.first.currents(h.x, h.ctx);
      const [c2] = entry.second.currents(h.x, h.ctx);
      ic = c1 + c2;
      ib = b1 + entry.r1.currents(h.x, h.ctx)[0];
    }
    const vbe = h.volt(b) - h.volt(e);
    const vce = h.volt(c) - h.volt(e);
    const sign = entry.model.polarity === 'pnp' ? -1 : 1;
    const on = sign * vbe > (entry.model.darlington ? 1.0 : 0.5);
    const region = !on ? 'off' : sign * (vbe - vce) > 0.4 ? 'saturation' : 'active';
    return { currents: { C: ic, B: ib, E: -(ic + ib) }, vbe, vce, power: vce * ic + vbe * ib, region, beta: ib ? ic / ib : null };
  },
  // Falstad's transistor is Gummel–Poon: with no Early voltage, roll-off or leakage it is this
  // transport model. A Darlington goes as its two transistors and resistors.
  falstad(d, f) {
    const { model } = d.params;
    const pins = { c: f.pin(d, 'C'), b: f.pin(d, 'B'), e: f.pin(d, 'E') };
    if (!model.darlington) return f.bjt(pins, model, `kit-${d.id}`);
    const { first, second, r1, r2 } = model.darlington;
    const x = f.inner(d.id);
    f.bjt({ ...pins, e: x }, { ...first, polarity: model.polarity }, `kit-${d.id}-1`);
    f.bjt({ ...pins, b: x }, { ...second, polarity: model.polarity }, `kit-${d.id}-2`);
    f.resistor(pins.b, x, r1);
    f.resistor(x, pins.e, r2);
    f.note('falstad.darlington', { part: d.id });
  },
  limits: (entry, r) => [stress('SIM_OVER_POWER', 'power', r.power, entry.model.maxPower, 'W')],
  lines(p, h) {
    const lines = [h.raw(`region.bjt.${p.region}`, h.t(`sim.region.bjt.${p.region}`)), h.raw('vbe', `Vbe: ${h.f(p.vbe, 'V')}`), h.raw('vce', `Vce: ${h.f(p.vce, 'V')}`), h.raw('ib', `Ib: ${h.f(p.currents.B, 'A')}`), h.raw('ic', `Ic: ${h.f(p.currents.C, 'A')}`)];
    if (p.region === 'active' && p.beta) lines.push(h.raw('beta', `β ≈ ${Math.round(p.beta)}`));
    lines.push(h.q('power', h.f(p.power, 'W')));
    return lines;
  },
  tag: (r) => ({ label: 'Ic', value: r.currents.C, key: 'ic' }),
  probe: (r) => ({ key: 'probe.ic', value: Math.abs(r.currents.C) }),
  currentPins: (r) => (r.currents.C >= 0 ? [['C', 1], ['E', -1]] : [['E', 1], ['C', -1]]),
};
