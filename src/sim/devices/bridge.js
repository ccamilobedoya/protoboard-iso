// Bridge rectifier (KBP): four diodes, each with its series resistance: AC1 and AC2 up to +,
// − up to each AC pin.

import { resistor, junction } from '../mna.js';
import { BRIDGES } from '../models.js';
import { stress } from './shared.js';

export const bridge = {
  types: ['bridge'],
  kind: 'BR',
  build(part, h) {
    const { e, raw } = h;
    const model = { ...(BRIDGES[e.family] ?? BRIDGES.KBP3), ...raw.model };
    const leg = (a, k) => {
      const mid = h.inner(part.id);
      h.add(resistor(a, mid, model.rs));
      return h.add(junction(mid, k, model));
    };
    return { legs: [leg(h.pin('AC1'), h.pin('+')), leg(h.pin('AC2'), h.pin('+')), leg(h.pin('-'), h.pin('AC1')), leg(h.pin('-'), h.pin('AC2'))], model };
  },
  // Current out of + towards the load, and back in by −; the AC pins carry the rest.
  read(entry, h) {
    const [up1, up2, down1, down2] = entry.legs.map((el) => el.currents(h.x, h.ctx)[0]);
    const v = (name) => h.volt(entry.pins.find((p) => p.name === name).index);
    const current = up1 + up2;
    const vac = v('AC1') - v('AC2');
    const vdc = v('+') - v('-');
    const power = up1 * (v('AC1') - v('+')) + up2 * (v('AC2') - v('+')) + down1 * (v('-') - v('AC1')) + down2 * (v('-') - v('AC2'));
    return { vac, vdc, current, power, currents: { '+': -current, AC1: up1 - down1, AC2: up2 - down2, '-': down1 + down2 } };
  },
  limits: (entry, r) => [stress('SIM_OVER_CURRENT', 'current', Math.abs(r.current), entry.model.maxCurrent, 'A')],
  lines: (p, h) => [h.q('bridge.vac', h.f(p.vac, 'V')), h.q('bridge.vdc', h.f(p.vdc, 'V')), h.q('bridge.current', h.f(p.current, 'A')), h.q('power', h.f(p.power, 'W'))],
  tag: (r) => ({ label: 'I', value: Math.abs(r.current), key: 'bridge.current' }),
};
