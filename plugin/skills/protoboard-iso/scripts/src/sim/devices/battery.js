// A battery drawn beside the board. It is a source (see supplies in ../index.js: an ideal emf
// behind its internal resistance); the device reads it and says what a learner should know.
// Its warnings come after every other part's (`source`).

import { issue, stress, note, q } from './shared.js';

export const battery = {
  types: ['battery'],
  kind: 'BAT',
  source: true,
  params(part, c) {
    if (!part.def.electrical.on) c.issues.push(issue('info', 'SIM_BATTERY_OFF', { part: part.id }));
    return {};
  },
  // The battery is one of the supplies (see ../index.js); its reading comes from there.
  elements: (p, h) => ({ supply: h.supplies.find((s) => s.part === h.id) }),
  // current: delivered out of + (negative while something charges it).
  read(entry, h) {
    const s = entry.supply;
    const r = h.supplyReading(s);
    const b = s.battery;
    const runtime = r.current > 1e-6 ? b.capacity / r.current : null; // hours
    return { voltage: r.voltage, current: r.current, power: r.power, emf: s.off ? null : b.emf, drop: s.off ? 0 : r.current * b.resistance, runtime, charge: b.charge, on: !s.off, currents: { '+': -r.current, '-': r.current } };
  },
  limits(entry, r) {
    if (entry.supply.off) return [];
    const b = entry.supply.battery;
    const out = [];
    // A short: what is outside the battery is less than half an ohm (bare wires).
    if (r.current > 0.1 && r.voltage / r.current < 0.5) out.push(note('warning', 'SIM_SHORT_CIRCUIT', { supply: entry.id, current: q(r.current, 'A') }));
    else out.push(stress('SIM_OVER_CURRENT', 'current', r.current, b.maxCurrent, 'A'));
    if (r.current < -1e-3) out.push(note(b.rechargeable ? 'info' : 'warning', b.rechargeable ? 'SIM_BATTERY_CHARGING' : 'SIM_BATTERY_REVERSE', { part: entry.id, current: q(-r.current, 'A') }));
    return out;
  },
  lines(p, h) {
    const lines = [];
    if (!p.on) lines.push(h.raw('battery.off', h.t('sim.battery.off')));
    else {
      lines.push(h.q('battery.emf', h.f(p.emf, 'V')), h.q('battery.voltage', h.f(p.voltage, 'V')), h.q('battery.drop', h.f(p.drop, 'V')), h.q('battery.current', h.f(p.current, 'A')), h.q('battery.power', h.f(p.power, 'W')));
      if (p.runtime != null) lines.push(h.q('battery.runtime', h.runtime(p.runtime)));
    }
    if (p.charge != null) lines.push(h.q('battery.charge', `${Math.round(p.charge * 100)} %`));
    return lines;
  },
  tag: (r) => ({ label: '', value: Math.abs(r.current), key: 'battery.current' }),
};
