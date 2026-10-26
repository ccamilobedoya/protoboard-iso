// NE555 timer: a behavioural model (models.js, TIMERS) of what a learner sees at the pins. The
// internal divider (three 5 kΩ from VCC to GND, CTRL at the top tap) and the chip's own current
// are resistors; the comparators, the latch, the output stage and the discharge transistor are
// one element (mna.js, timerCore) whose latch changes between time steps. Other ICs stay
// unsupported: `accepts` takes only parts whose model says they are a timer.

import { resistor, timerCore } from '../mna.js';
import { TIMERS } from '../models.js';
import { stress } from './shared.js';

const PINS = ['GND', 'TRIG', 'OUT', 'RESET', 'CTRL', 'THR', 'DIS', 'VCC'];

export const timer = {
  types: ['ic'],
  kind: 'TMR',
  accepts: (part) => part.def.electrical?.function === 'timer',
  params(part) {
    return { model: { ...TIMERS.NE555, ...part.raw.model } };
  },
  elements(p, h) {
    const n = Object.fromEntries(PINS.map((name) => [name.toLowerCase(), h.pin(name)]));
    const mid = h.inner();
    const m = p.model;
    return {
      top: h.add(resistor(n.vcc, n.ctrl, m.divider)),
      middle: h.add(resistor(n.ctrl, mid, m.divider)),
      bottom: h.add(resistor(mid, n.gnd, m.divider)),
      own: h.add(resistor(n.vcc, n.gnd, m.quiescentResistance)),
      core: h.add(timerCore(n, m)),
    };
  },
  read(entry, h) {
    const pin = (name) => entry.pins.find((p) => p.name === name).index;
    const v = (name) => h.volt(pin(name)) - h.volt(pin('GND'));
    const c = entry.core.currents(h.x, h.ctx); // gnd, trig, out, reset, ctrl, thr, dis, vcc
    const [top] = entry.top.currents(h.x);
    const [middle] = entry.middle.currents(h.x);
    const [bottom] = entry.bottom.currents(h.x);
    const [own] = entry.own.currents(h.x);
    const currents = { GND: c[0] - bottom - own, TRIG: 0, OUT: c[2], RESET: 0, CTRL: middle - top, THR: 0, DIS: c[6], VCC: c[7] + top + own };
    // What the chip turns into heat: the sum of each pin's voltage times the current into it.
    const power = PINS.reduce((sum, name) => sum + h.volt(pin(name)) * currents[name], 0);
    return { state: entry.core.q ? 'high' : 'low', vcc: v('VCC'), vout: v('OUT'), vthr: v('THR'), vtrig: v('TRIG'), vctrl: v('CTRL'), current: -currents.OUT, supply: currents.VCC, power, currents };
  },
  limits(entry, r) {
    const m = entry.model;
    return [stress('SIM_IC_SUPPLY', 'voltage', r.vcc, m.maxSupply, 'V'), stress('SIM_OVER_CURRENT', 'current', Math.abs(r.current), m.maxCurrent, 'A'), stress('SIM_OVER_POWER', 'power', r.power, m.maxPower, 'W')];
  },
  lines(p, h) {
    return [
      h.raw(`timer.${p.state}`, h.t(`sim.timer.${p.state}`)),
      h.q('timer.vout', h.f(p.vout, 'V')),
      h.q('timer.vthr', h.f(p.vthr, 'V')),
      h.q('timer.vtrig', h.f(p.vtrig, 'V')),
      h.q('timer.vctrl', h.f(p.vctrl, 'V')),
      h.q('timer.iout', h.f(p.current, 'A')),
      h.q('timer.supply', h.f(p.supply, 'A')),
      h.q('power', h.f(p.power, 'W')),
    ];
  },
  tag: (r) => ({ label: 'Iout', value: Math.abs(r.current), key: 'timer.iout' }),
  scope: (r) => ({ v: { label: 'Vout', value: r.vout }, i: { label: 'Iout', value: r.current } }),
};
