// Capacitor: a memory of its voltage between time steps (transient); open in DC.
// Electrolytic (polarised) ones warn when reversed.

import { capacitor as capacitorEl } from '../mna.js';
import { CERAMIC_VOLTAGE, REVERSE_LIMITS } from '../models.js';
import { stress, twoTerminal, twoTerminalLines, currentTag } from './shared.js';

export const capacitor = {
  types: ['capacitor'],
  kind: 'C',
  limitFields: (p) => (p.polarised ? ['voltage'] : []), // a ceramic one's rating is the kit's, not a field
  read: (entry, h) => twoTerminal(entry, entry.main, h),
  lines: twoTerminalLines,
  tag: currentTag,
  params(part) {
    const e = part.def.electrical;
    return { capacitance: e.capacitance, polarised: Boolean(e.polarised), maxVoltage: e.voltage ?? CERAMIC_VOLTAGE };
  },
  elements: (p, h) => ({ main: h.add(capacitorEl(h.at(0), h.at(1), p.capacitance)) }),
  falstad: (d, f) => f.capacitor(d.pins[0].node, d.pins[1].node, d.params.capacitance),
  limits(entry, r) {
    const out = [];
    if (entry.polarised) out.push(stress('SIM_CAP_REVERSED', 'reverse', -r.voltage, REVERSE_LIMITS.capacitor, 'V', { param: 'voltage', reportMax: false }));
    out.push(stress('SIM_CAP_OVER_VOLTAGE', 'voltage', Math.abs(r.voltage), entry.maxVoltage, 'V'));
    return out;
  },
};
