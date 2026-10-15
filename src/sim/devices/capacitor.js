// Capacitor: a memory of its voltage between time steps (transient); open in DC.
// Electrolytic (polarised) ones warn when reversed.

import { capacitor as capacitorEl } from '../mna.js';
import { CERAMIC_VOLTAGE } from '../models.js';
import { stress, twoTerminal, twoTerminalLines, currentTag } from './shared.js';

export const capacitor = {
  types: ['capacitor'],
  kind: 'C',
  read: (entry, h) => twoTerminal(entry, entry.main, h),
  lines: twoTerminalLines,
  tag: currentTag,
  build(part, h) {
    const { e } = h;
    return { main: h.add(capacitorEl(h.at(0), h.at(1), e.capacitance)), polarised: Boolean(e.polarised), maxVoltage: e.voltage ?? CERAMIC_VOLTAGE };
  },
  limits(entry, r) {
    const out = [];
    if (entry.polarised) out.push(stress('SIM_CAP_REVERSED', 'reverse', -r.voltage, 0.5, 'V', { param: 'voltage', reportMax: false }));
    out.push(stress('SIM_CAP_OVER_VOLTAGE', 'voltage', Math.abs(r.voltage), entry.maxVoltage, 'V'));
    return out;
  },
};
