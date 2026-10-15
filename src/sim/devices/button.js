// Push button (6×6 tactile): each pair of legs is one metal piece (a wire); pressed, the
// contact joins the two pairs.

import { resistor as resistorEl } from '../mna.js';
import { WIRE_RESISTANCE } from '../models.js';
import { currentTag } from './shared.js';

const BUTTON_CONTACT = 0.1; // closed tactile switch, ohms (datasheets: ≤ 100 mΩ)

export const button = {
  types: ['button'],
  kind: 'SW',
  params(part) {
    const e = part.def.electrical;
    return { poles: e.poles, contact: [e.poles[0][0], e.poles[1][0]], pressed: e.pressed };
  },
  elements(p, h) {
    const entry = { poles: p.poles.map(([a, b]) => ({ a, b, el: h.add(resistorEl(h.pin(a), h.pin(b), WIRE_RESISTANCE)) })) };
    if (p.pressed) entry.main = h.add(resistorEl(h.pin(p.contact[0]), h.pin(p.contact[1]), BUTTON_CONTACT));
    return entry;
  },
  read: (entry, h) => ({ pressed: entry.pressed, current: entry.main ? entry.main.currents(h.x, h.ctx)[0] : 0 }),
  pinCurrents(entry, out, h) {
    const result = Object.fromEntries(entry.pins.map((p) => [p.name, 0]));
    for (const { a, b, el } of entry.poles) {
      const i = el.currents(h.x, h.ctx)[0];
      result[a] += i;
      result[b] -= i;
    }
    if (entry.main) {
      const i = entry.main.currents(h.x, h.ctx)[0];
      result[entry.contact[0]] += i;
      result[entry.contact[1]] -= i;
    }
    return result;
  },
  lines: (p, h) => [h.q('state', h.t(p.pressed ? 'state.pressed' : 'state.released')), h.q('current', h.f(p.current, 'A'))],
  tag: currentTag,
  probe: (r) => ({ key: 'probe.switch', value: Math.abs(r.current) }),
};
