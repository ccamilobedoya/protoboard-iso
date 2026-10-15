// MOSFET: square law with a smooth turn-on, k from Rds(on); n- or p-channel.

import { mosfet as mosfetEl } from '../mna.js';
import { MOSFETS, MOSFET_DEFAULT } from '../models.js';
import { issue, stress } from './shared.js';

export const mosfet = {
  types: ['mosfet'],
  kind: 'M',
  build(part, h) {
    const { e, raw } = h;
    const known = MOSFETS[e.part];
    if (!known) h.issues.push(issue('info', 'SIM_DEFAULT_MODEL', { part: part.id, model: 'MOSFET' }));
    const model = { ...MOSFET_DEFAULT, ...(e.channel && { channel: e.channel }), ...known, ...raw.model };
    return { main: h.add(mosfetEl(h.pin('D'), h.pin('G'), h.pin('S'), model)), model };
  },
  read(entry, h) {
    const [d, g, s] = entry.main.nodes;
    const vgs = h.volt(g) - h.volt(s);
    const vds = h.volt(d) - h.volt(s);
    const id = entry.main.currents(h.x, h.ctx)[0];
    const m = entry.model;
    const sign = m.channel === 'p' ? -1 : 1;
    const vov = sign * vgs - Math.abs(m.vth);
    const region = vov <= 0 ? 'off' : sign * vds < vov ? 'linear' : 'saturation';
    return { currents: { D: id, G: 0, S: -id }, vgs, vds, power: vds * id, region };
  },
  limits: (entry, r) => [stress('SIM_OVER_POWER', 'power', r.power, entry.model.maxPower, 'W')],
  lines: (p, h) => [h.raw(`region.mosfet.${p.region}`, h.t(`sim.region.mosfet.${p.region}`)), h.raw('vgs', `Vgs: ${h.f(p.vgs, 'V')}`), h.raw('vds', `Vds: ${h.f(p.vds, 'V')}`), h.raw('id', `Id: ${h.f(p.currents.D, 'A')}`), h.q('power', h.f(p.power, 'W'))],
  tag: (r) => ({ label: 'Id', value: r.currents.D, key: 'id' }),
  probe: (r) => ({ key: 'probe.id', value: Math.abs(r.currents.D) }),
  currentPins: (r) => (r.currents.D >= 0 ? [['D', 1], ['S', -1]] : [['S', 1], ['D', -1]]),
};
