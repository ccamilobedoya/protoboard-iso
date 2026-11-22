// PC817 optocoupler: an infrared LED from A to K and a phototransistor from C to E, joined only by
// light. The LED is the kit's junction; the light becomes a current into the transistor's base
// (an inner node), CTR·I_F / (β + 1), so the collector takes CTR times the LED's current while the
// load lets it and saturates when it does not (Ebers–Moll, ../mna.js bjt). The coupling element has
// no DC link between the two sides: each keeps its own ground (engine.js gives a second supply's
// island its own reference, and anchors one with no supply in DC).
//
// The numbers, from the Sharp PC817 datasheet (absolute maximum ratings and electro-optical
// characteristics at 25 °C):
//   led            [fitted]: Is 1.7 pA, n 2, so that VF is 1.2 V at 20 mA (datasheet typical; max 1.4 V)
//   ctr 1.7        the plain part's CTR is 50 % to 600 % at IF 5 mA, VCE 5 V; the kit takes 170 %, the
//                  middle of that range on the logarithmic scale its ranks are spread over (√(50·600));
//                  real parts vary several times over (ranks A to D)
//   bf 100         [assumed]: the phototransistor's own gain (the datasheet gives only the CTR)
//   br 0.05        [fitted]: VCE(sat) 0.11 V at IF 20 mA, IC 1 mA (datasheet typical 0.1 V, max 0.2 V)
//   maxForward 50 mA, maxReverse 6 V, maxInputPower 70 mW         the LED's absolute maximum ratings
//   maxCollector 50 mA, maxVce 35 V (VCEO), maxVec 6 V (VECO), maxOutputPower 150 mW   the transistor's
//   maxPower 200 mW                                                total power dissipation
// Not modelled: switching speed (rise and fall of a few µs), the CTR's change with IF and with
// temperature, the dark current, the isolation voltage.

import { junction, bjt } from '../mna.js';
import { VT } from '../models.js';
import { stress } from './shared.js';

export const PC817 = {
  led: { is: 1.7e-12, n: 2 },
  ctr: 1.7,
  transistor: { polarity: 'npn', is: 1e-14, bf: 100, br: 0.05 },
  maxForward: 0.05, maxReverse: 6, maxInputPower: 0.07,
  maxCollector: 0.05, maxVce: 35, maxVec: 6, maxOutputPower: 0.15, maxPower: 0.2,
};

// The light: a current from C into the base, k·I_LED, with the LED's current at the voltage its
// junction element just limited to (it stamps first). No links: nothing conducts between the sides.
function lightCoupling(led, a, k, c, b, gain, { is, n }) {
  const vt = n * VT;
  const diode = (v) => {
    const e = Math.exp(Math.min(v / vt, 300));
    return { i: is * (e - 1), g: (is * e) / vt };
  };
  return {
    nodes: [c, b, a, k],
    links: [],
    stamp(st, x) {
      const at = (i) => (i >= 0 ? x[i] : 0);
      const vd = led.vd;
      const { i, g } = diode(vd);
      const gg = gain * g;
      st.device([c, b, a, k], [gain * i, -gain * i, 0, 0], [[0, 0, gg, -gg], [0, 0, -gg, gg], [0, 0, 0, 0], [0, 0, 0, 0]], [at(c), at(b), at(k) + vd, at(k)]);
      return false;
    },
    currents(x) {
      const at = (i) => (i >= 0 ? x[i] : 0);
      const i = gain * diode(at(a) - at(k)).i;
      return [i, -i, 0, 0];
    },
  };
}

export const optocoupler = {
  types: ['ic'],
  kind: 'OPT',
  modelText: 'optocoupler',
  accepts: (part) => part.def.electrical?.part === 'PC817',
  params(part) {
    return { model: { ...PC817, ...part.raw.model } };
  },
  elements(p, h) {
    const m = p.model;
    const [a, k, c, e] = ['A', 'K', 'C', 'E'].map((name) => h.pin(name));
    const b = h.inner();
    const led = h.add(junction(a, k, m.led));
    const transistor = h.add(bjt(c, b, e, m.transistor));
    const light = h.add(lightCoupling(led, a, k, c, b, m.ctr / (m.transistor.bf + 1), m.led));
    return { led, transistor, light };
  },
  read(entry, h) {
    const pin = (name) => entry.pins.find((x) => x.name === name).index;
    const vf = h.volt(pin('A')) - h.volt(pin('K'));
    const vce = h.volt(pin('C')) - h.volt(pin('E'));
    const [iled] = entry.led.currents(h.x);
    const [ic, ib] = entry.transistor.currents(h.x);
    const [iph] = entry.light.currents(h.x);
    const collector = ic + iph; // into C: the transistor's own and the light's, which goes on to its base
    const emitter = -(ic + ib); // into E (negative: it leaves there); the base takes only the light's
    const inputPower = vf * iled;
    const outputPower = vce * collector;
    const lit = iled > 1e-4;
    const state = !lit ? 'dark' : vce < 0.4 && collector > 1e-6 ? 'saturated' : 'active';
    return {
      state,
      input: { voltage: vf, current: iled, power: inputPower },
      output: { voltage: vce, current: collector, power: outputPower },
      ctr: entry.model.ctr,
      current: collector,
      vce,
      power: inputPower + outputPower,
      currents: { A: iled, K: -iled, C: collector, E: emitter },
    };
  },
  limits(entry, r) {
    const m = entry.model;
    return [
      stress('SIM_OVER_CURRENT', 'current', r.input.current, m.maxForward, 'A', { of: 'led' }),
      stress('SIM_REVERSE_VOLTAGE', 'reverse', -r.input.voltage, m.maxReverse, 'V', { param: 'voltage', of: 'led', extra: { effect: 'canBurn' } }),
      stress('SIM_OVER_POWER', 'power', r.input.power, m.maxInputPower, 'W', { of: 'led' }),
      stress('SIM_OVER_CURRENT', 'current', r.output.current, m.maxCollector, 'A', { of: 'output' }),
      stress('SIM_IC_PIN_VOLTAGE', 'voltage', r.output.voltage, m.maxVce, 'V', { of: 'output' }),
      stress('SIM_REVERSE_VOLTAGE', 'reverse', -r.output.voltage, m.maxVec, 'V', { param: 'voltage', of: 'output', extra: { effect: 'damaged' } }),
      stress('SIM_OVER_POWER', 'power', r.output.power, m.maxOutputPower, 'W', { of: 'output' }),
      stress('SIM_OVER_POWER', 'power', r.power, m.maxPower, 'W'),
    ];
  },
  lines(p, h) {
    return [
      h.raw(`opto.${p.state}`, h.t(`sim.opto.${p.state}`)),
      h.q('opto.led', `${h.f(p.input.voltage, 'V')} · ${h.f(Math.abs(p.input.current) < 1e-9 ? 0 : p.input.current, 'A')}`),
      h.q('opto.output', `${h.f(p.output.voltage, 'V')} · ${h.f(Math.abs(p.output.current) < 1e-9 ? 0 : p.output.current, 'A')}`),
      h.q('opto.ctr', `${Math.round(p.ctr * 100)} %`),
      h.q('power', h.f(p.power, 'W')),
    ];
  },
  tag: (r) => ({ label: 'Ic', value: Math.abs(r.current), key: 'opto.ic' }),
  scope: (r) => ({ v: { label: 'Vce', value: r.vce }, i: { label: 'Ic', value: r.current } }),
  currentPins: () => [['C', 1], ['E', -1]],
};
