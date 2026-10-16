// Linear regulator (78xx, LM317): the output follows its reference, or sits `dropout` below the
// input when there is not enough; the chip takes its own current from IN to GND (or ADJ).

import { regulatorElement } from '../mna.js';
import { REGULATORS } from '../models.js';
import { stress, note, q } from './shared.js';

export const regulator = {
  types: ['regulator'],
  kind: 'REG',
  params(part) {
    const e = part.def.electrical;
    return { model: { ...(e.adjustable ? REGULATORS.LM317 : REGULATORS.fixed), vref: e.adjustable ? e.reference : e.output, ...part.raw.model }, ref: e.adjustable ? 'ADJ' : 'GND' };
  },
  elements: (p, h) => ({ main: h.add(regulatorElement(h.pin('IN'), h.pin(p.ref), h.pin('OUT'), p.model)) }),
  read(entry, h) {
    const [inp, ref, o] = entry.main.nodes;
    const [iin, iref, iout] = entry.main.currents(h.x, h.ctx);
    const vin = h.volt(inp);
    const vout = h.volt(o);
    const u = vin - h.volt(ref);
    const power = (vin - vout) * -iout + (vin - h.volt(ref)) * -iref;
    const regulating = entry.main.shape(u).regulating;
    return { vin, vout, headroom: vin - vout, current: -iout, quiescent: -iref, power, state: regulating ? 'regulating' : 'dropout', currents: { IN: iin, [entry.ref]: iref, OUT: iout } };
  },
  // No hook: Falstad's LM317 is a subcircuit that only its XML format can bring in (the text
  // format needs the state of every transistor inside). The export leaves it out, with a note.
  limits(entry, r) {
    const out = [stress('SIM_REG_HOT', 'power', r.power, entry.model.maxPower, 'W'), stress('SIM_OVER_CURRENT', 'current', r.current, entry.model.maxCurrent, 'A')];
    if (r.state === 'dropout' && r.vin > 0.5) out.push(note('info', 'SIM_REG_DROPOUT', { part: entry.id, vin: q(r.vin, 'V'), vout: q(r.vout, 'V'), dropout: q(entry.model.dropout, 'V') }));
    return out;
  },
  lines: (p, h) => [h.raw(`reg.${p.state}`, h.t(`sim.reg.${p.state}`)), h.q('reg.vin', h.f(p.vin, 'V')), h.q('reg.vout', h.f(p.vout, 'V')), h.q('reg.headroom', h.f(p.headroom, 'V')), h.q('reg.iout', h.f(p.current, 'A')), h.q('reg.quiescent', h.f(p.quiescent, 'A')), h.q('power', h.f(p.power, 'W'))],
  tag: (r) => ({ label: 'Iout', value: Math.abs(r.current), key: 'reg.iout' }),
  scope: (r) => ({ v: { label: 'Vout', value: r.vout }, i: { label: 'Iout', value: r.current } }),
};
