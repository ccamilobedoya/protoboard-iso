// Inductor: the winding resistance in series, then the ideal inductance (a short in DC).

import { resistor as resistorEl, inductor as inductorEl } from '../mna.js';
import { stress, twoTerminal, twoTerminalLines, currentTag } from './shared.js';

export const inductor = {
  types: ['inductor'],
  kind: 'L',
  read: (entry, h) => twoTerminal(entry, entry.main, h),
  lines: twoTerminalLines,
  tag: currentTag,
  build(part, h) {
    const { e } = h;
    const mid = h.inner(part.id);
    h.add(resistorEl(h.at(0), mid, Math.max(e.dcr, 1e-3)));
    return { main: h.add(inductorEl(mid, h.at(1), e.inductance)), maxCurrent: e.maxCurrent };
  },
  limits: (entry, r) => [stress('SIM_OVER_CURRENT', 'current', Math.abs(r.current), entry.maxCurrent, 'A')],
};
