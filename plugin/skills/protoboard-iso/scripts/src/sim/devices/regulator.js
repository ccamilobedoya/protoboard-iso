// Linear regulator (78xx, LM317, AMS1117): the output follows its reference, or sits `dropout`
// below the input when there is not enough; the chip takes its own current from IN to GND (or
// ADJ). A module (AMS1117) also has its power LED and resistor from OUT to GND, inside it: its
// current is part of what the module draws, not of what it delivers.

import { regulatorElement, resistor, junction } from '../mna.js';
import { REGULATORS, ledModel } from '../models.js';
import { stress, note, q } from './shared.js';

export const regulator = {
  types: ['regulator'],
  kind: 'REG',
  params(part) {
    const e = part.def.electrical;
    const base = e.adjustable ? REGULATORS.LM317 : REGULATORS[e.family] ?? REGULATORS.fixed;
    const out = { model: { ...base, vref: e.adjustable ? e.reference : e.output, ...part.raw.model }, ref: e.adjustable ? 'ADJ' : 'GND' };
    if (e.family) out.module = true;
    if (e.led) out.led = { resistance: e.led.resistance, model: ledModel(e.led.color) };
    return out;
  },
  elements(p, h) {
    const entry = { main: h.add(regulatorElement(h.pin('IN'), h.pin(p.ref), h.pin('OUT'), p.model)) };
    if (p.led) {
      const mid = h.inner();
      h.add(resistor(h.pin('OUT'), mid, p.led.resistance));
      entry.ledEl = h.add(junction(mid, h.pin(p.ref), p.led.model));
    }
    return entry;
  },
  read(entry, h) {
    const [inp, ref, o] = entry.main.nodes;
    const [iin, iref, iout] = entry.main.currents(h.x, h.ctx);
    const vin = h.volt(inp);
    const vout = h.volt(o);
    const u = vin - h.volt(ref);
    const power = (vin - vout) * -iout + (vin - h.volt(ref)) * -iref;
    const regulating = entry.main.shape(u).regulating;
    const out = { vin, vout, headroom: vin - vout, across: u, current: -iout, quiescent: -iref, power, state: regulating ? 'regulating' : 'dropout', currents: { IN: iin, [entry.ref]: iref, OUT: iout } };
    if (entry.ledEl) {
      // The LED's current leaves the chip through OUT but stays in the module: it comes back
      // through GND. At the pins, OUT gives only what the load takes.
      const iled = entry.ledEl.currents(h.x, h.ctx)[0];
      out.led = { current: iled, brightness: Math.max(0, iled) / entry.led.model.ratedCurrent };
      out.current -= iled;
      out.quiescent += iled;
      out.currents = { IN: iin, [entry.ref]: iref - iled, OUT: iout + iled };
    }
    return out;
  },
  // Falstad's LM317 is a subcircuit that only its XML format can bring in (the text format
  // needs the state of every transistor inside), so every regulator goes as an equivalent: an
  // ideal source of the output from the reference node (GND, or ADJ) to OUT, and a resistor on
  // IN sized from the quiescent current so the input net is not left floating. In dropout (the
  // reading says so) the source is the input less the dropout.
  falstad(d, f) {
    const p = d.params;
    const [inp, out, ref] = ['IN', 'OUT', p.ref].map((name) => f.pin(d, name));
    const now = f.reading?.parts?.[d.id];
    const across = now?.across > 1 ? now.across : null;
    const vout = now?.state === 'dropout' && across ? Math.max(0, across - p.model.dropout) : p.model.vref;
    f.voltage(ref, out, vout);
    f.resistor(inp, ref, across ? Math.min(1e6, Math.max(100, across / p.model.quiescent)) : 10e3);
    if (p.led) {
      const mid = f.inner(d.id);
      f.resistor(out, mid, p.led.resistance);
      f.diode('d', mid, ref, `kit-${d.id}`, p.led.model);
    }
    f.note('falstad.regulator', { part: d.id, voltage: { value: vout, unit: 'V' } });
  },
  limits(entry, r) {
    const out = [stress(entry.module ? 'SIM_REG_HOT_MODULE' : 'SIM_REG_HOT', 'power', r.power, entry.model.maxPower, 'W'), stress('SIM_OVER_CURRENT', 'current', r.current, entry.model.maxCurrent, 'A')];
    if (entry.model.maxInput) out.push(stress('SIM_REG_INPUT', 'voltage', r.across, entry.model.maxInput, 'V'));
    // A module wired backwards: its datasheet warns it shorts the supply.
    if (entry.module && r.across < -0.5) out.push(note('warning', 'SIM_REG_REVERSED', { part: entry.id, vin: q(r.across, 'V') }));
    else if (r.state === 'dropout' && r.vin > 0.5) out.push(note('info', 'SIM_REG_DROPOUT', { part: entry.id, vin: q(r.vin, 'V'), vout: q(r.vout, 'V'), dropout: q(entry.model.dropout, 'V') }));
    return out;
  },
  lines(p, h) {
    const lines = [h.raw(`reg.${p.state}`, h.t(`sim.reg.${p.state}`)), h.q('reg.vin', h.f(p.vin, 'V')), h.q('reg.vout', h.f(p.vout, 'V')), h.q('reg.headroom', h.f(p.headroom, 'V')), h.q('reg.iout', h.f(p.current, 'A')), h.q('reg.quiescent', h.f(p.quiescent, 'A'))];
    if (p.led) lines.push(h.q('reg.led', h.t('sim.reg.led', { current: h.f(p.led.current, 'A'), percent: Math.round(p.led.brightness * 100) })));
    lines.push(h.q('power', h.f(p.power, 'W')));
    return lines;
  },
  tag: (r) => ({ label: 'Iout', value: Math.abs(r.current), key: 'reg.iout' }),
  scope: (r) => ({ v: { label: 'Vout', value: r.vout }, i: { label: 'Iout', value: r.current } }),
};
