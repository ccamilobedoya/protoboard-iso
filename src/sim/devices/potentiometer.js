// Potentiometer (and trimmer): two resistors, from pin 1 to the wiper and from the wiper to pin 3.
// Control: the position of the wiper (0 at pin 1, 1 at pin 3).

import { resistor as resistorEl } from '../mna.js';

export const potentiometer = {
  types: ['potentiometer'],
  kind: 'POT',
  params(part) {
    const e = part.def.electrical;
    return { resistance: e.resistance, position: e.position };
  },
  controls: (p) => ({ position: { min: 0, max: 1, scale: 'linear', unit: '', percent: true, value: p.position } }),
  set: (p, field, value) => (field === 'position' ? { ...p, position: value } : null),
  elements(p, h) {
    const r1 = Math.max(p.resistance * p.position, 1e-3);
    const r2 = Math.max(p.resistance * (1 - p.position), 1e-3);
    return { upper: h.add(resistorEl(h.pin('1'), h.pin('W'), r1)), lower: h.add(resistorEl(h.pin('W'), h.pin('3'), r2)) };
  },
  read(entry, h) {
    const i1 = entry.upper.currents(h.x, h.ctx)[0];
    const i2 = entry.lower.currents(h.x, h.ctx)[0];
    const v1 = h.volt(entry.upper.nodes[0]) - h.volt(entry.upper.nodes[1]);
    const v2 = h.volt(entry.lower.nodes[0]) - h.volt(entry.lower.nodes[1]);
    return { currents: { '1': i1, W: i2 - i1, '3': -i2 }, power: v1 * i1 + v2 * i2 };
  },
  lines: (p, h) => [h.raw('pot.current', `I(1): ${h.f(p.currents['1'], 'A')}`), h.raw('pot.current', `I(W): ${h.f(p.currents.W, 'A')}`), h.raw('pot.current', `I(3): ${h.f(p.currents['3'], 'A')}`), h.q('power', h.f(p.power, 'W'))],
  tag: (r) => ({ label: 'I', value: Math.max(Math.abs(r.currents['1']), Math.abs(r.currents['3'])), key: 'pot.current' }),
  probe: () => ({ key: 'probe.pot' }),
};
