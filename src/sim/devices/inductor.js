// Inductor: the winding resistance in series, then the ideal inductance (a short in DC).

import { resistor as resistorEl, inductor as inductorEl } from '../mna.js';
import { stress, twoTerminal, twoTerminalLines, currentTag } from './shared.js';

export const inductor = {
  types: ['inductor'],
  kind: 'L',
  read: (entry, h) => twoTerminal(entry, entry.main, h),
  lines: twoTerminalLines,
  tag: currentTag,
  params(part) {
    const e = part.def.electrical;
    return { inductance: e.inductance, dcr: e.dcr, maxCurrent: e.maxCurrent };
  },
  elements(p, h) {
    const mid = h.inner();
    h.add(resistorEl(h.at(0), mid, Math.max(p.dcr, 1e-3)));
    return { main: h.add(inductorEl(mid, h.at(1), p.inductance)) };
  },
  limits: (entry, r) => [stress('SIM_OVER_CURRENT', 'current', Math.abs(r.current), entry.maxCurrent, 'A')],
};
