// LM386 audio power amplifier, as a learner sees it at its pins. Its gain is set the way the
// datasheet explains: the input voltage, IN+ − IN−, appears across the emitter resistors of its
// input pair (150 Ω and, between pins 1 and 8, 1.35 kΩ), and the current through them flows through
// the two 15 kΩ feedback resistors to the output, so
//   gain = 2 · 15 kΩ / (150 Ω + 1.35 kΩ ∥ Z(pins 1–8)):  20 with pins 1 and 8 open, 200 with a
//   capacitor between them (at audio frequencies), in between with a resistor in series with it.
// The model builds that loop: a source forces V(IN+) − V(IN−) across 150 Ω in series with the real
// 1.35 kΩ between GAIN1 and GAIN8 (with whatever the circuit puts across them), and the output is
// half the supply plus 30 kΩ times that loop's current, clipped smoothly (a hard clip stalls Newton
// in a transient) about `swing` from each rail, behind its output resistance and a soft current limit.
// The inputs are 50 kΩ to GND; BYPASS sits at half the supply through the chip's own resistors.
//
// The numbers, from the Texas Instruments LM386 datasheet (SNAS545):
//   rin 50 kΩ                  input resistance (electrical characteristics)
//   r150 150 Ω, r18 1.35 kΩ,
//   rf 15 kΩ                   the schematic's resistors and the gain formula of its application notes
//   quiescent 4 mA             quiescent current, VS 6 V, no input (typical; max 8 mA); the kit
//                              keeps it from about 1 V up (quiescentKnee [assumed])
//   minSupply 4 V, maxSupply 12 V   operating supply of the LM386N-1 (the -4 takes 5 V to 18 V)
//   maxAbsolute 15 V           absolute maximum supply voltage (LM386N-1, -3)
//   maxInput 0.4 V             absolute maximum input voltage, ±0.4 V
//   maxPower 1.25 W            absolute maximum package dissipation, LM386N (DIP-8)
//   swing 1 V                  [assumed]: the datasheet gives output power (700 mW into 8 Ω at 9 V,
//                              THD 10 %), not a swing; 1 V from each rail with rout gives that power
//   rout 0.25 Ω                [assumed]: the same, see swing
//   currentLimit 1 A           [assumed]: the datasheet gives no short-circuit current; a stage of
//                              this size limits near an ampere, so a short reads as overheating
//   bypass 15 kΩ + 15 kΩ       [assumed]: BYPASS at half the supply, as in the schematic
//   g1 to GND 1 MΩ             [assumed]: what fixes the gain pins' DC level (no current flows there)
//   clip 0.2 V                 [assumed]: how wide the bend into each rail is (smooth for Newton)
// Not modelled: bandwidth (300 kHz) and slew rate, distortion, noise, the bass-boost feedback from
// pin 1 to pin 5, supply rejection, temperature.

import { resistor } from '../mna.js';
import { REVERSE_LIMITS } from '../models.js';
import { stress, note, q, reverseSupply } from './shared.js';

export const LM386 = {
  rin: 50e3, r150: 150, r18: 1350, rf: 15e3, quiescent: 4e-3, quiescentKnee: 1,
  minSupply: 4, maxSupply: 12, maxAbsolute: 15, maxInput: 0.4, maxPower: 1.25,
  swing: 1, rout: 0.25, currentLimit: 1, bypass: 15e3, tie: 1e6, clip: 0.2,
};

const at = (x, i) => (i >= 0 ? x[i] : 0);
const softplus = (z) => (z > 40 ? z : z < -40 ? 0 : Math.log1p(Math.exp(z)));
const logistic = (z) => 1 / (1 + Math.exp(-Math.max(-300, Math.min(300, z))));
const SPLIT = 1e-6;

// V(a) − V(g1) = V(p) − V(n): the input voltage forced across the gain resistors' loop.
function inputLoop(a, g1, p, n) {
  return {
    nodes: [a, g1, p, n],
    links: [[a, g1]],
    branch: null,
    needsRow: true,
    stamp(st) {
      const k = this.branch;
      st.add(a, k, 1);
      st.add(g1, k, -1);
      st.add(k, a, 1);
      st.add(k, g1, -1);
      st.add(k, p, -1);
      st.add(k, n, 1);
      return false;
    },
    currents(x) {
      return [x[this.branch], -x[this.branch], 0, 0];
    },
  };
}

// The output: V(o) − V(gnd) = clip(S/2 + gain·(V(a) − V(g8))), S the supply, gain = 2·rf / r150 (the
// loop's current times 2·rf); its current from vs while it sources, into gnd while it sinks.
function outputStage({ a, g8, vs, gnd, o }, m) {
  const gain = (2 * m.rf) / m.r150;
  const w = m.clip;
  const evaluate = (vd, S) => {
    const lo = m.swing;
    const top = S - m.swing;
    const hi = Math.max(top, lo);
    const follows = top > lo ? 1 : 0;
    const u = S / 2 + gain * vd;
    const f = lo + w * softplus((u - lo) / w) - w * softplus((u - hi) / w);
    const sLo = logistic((u - lo) / w);
    const sHi = logistic((u - hi) / w);
    return { f, du: sLo - sHi, dS: (sLo - sHi) / 2 + sHi * follows, u, lo, hi };
  };
  const source = (i) => (i + Math.hypot(i, SPLIT)) / 2; // the part of i drawn from vs
  return {
    nodes: [a, g8, vs, gnd, o],
    links: [
      [o, gnd],
      [o, vs],
    ],
    branch: null,
    needsRow: true,
    shape: (x) => evaluate(at(x, a) - at(x, g8), at(x, vs) - at(x, gnd)),
    stamp(st, x) {
      const k = this.branch;
      const S = at(x, vs) - at(x, gnd);
      const vd = at(x, a) - at(x, g8);
      const { f, du, dS } = evaluate(vd, S);
      // Row k, linear around (vd, S): V(o) − V(gnd) − [f + du·gain·(vd' − vd) + dS·(S' − S)] = 0.
      const J = [
        [o, 1],
        [gnd, -1 + dS],
        [vs, -dS],
        [a, -gain * du],
        [g8, gain * du],
      ];
      for (const [node, j] of J) st.add(k, node, j);
      st.rhs(k, f - du * gain * vd - dS * S);
      const i0 = x[k] ?? 0;
      const s0 = source(i0);
      const ds = (1 + i0 / Math.hypot(i0, SPLIT)) / 2;
      st.add(o, k, -1);
      st.add(vs, k, ds);
      st.rhs(vs, -(s0 - ds * i0));
      st.add(gnd, k, 1 - ds);
      st.rhs(gnd, s0 - ds * i0);
      return false;
    },
    currents(x) {
      const i = x[this.branch];
      return [0, 0, source(i), i - source(i), -i];
    },
  };
}

// The output resistance with a soft current limit: i = I·tanh(v / (I·R)).
function limitedResistor(p, n, r, limit) {
  const evaluate = (v) => {
    const th = Math.tanh(v / (limit * r));
    return { i: limit * th, g: (1 - th * th) / r };
  };
  return {
    nodes: [p, n],
    links: [[p, n]],
    stamp(st, x) {
      const v = at(x, p) - at(x, n);
      const { i, g } = evaluate(v);
      st.conductance(p, n, g);
      st.current(p, n, i - g * v);
      return false;
    },
    currents(x) {
      const { i } = evaluate(at(x, p) - at(x, n));
      return [i, -i];
    },
  };
}

const PINS = ['GAIN1', 'IN-', 'IN+', 'GND', 'OUT', 'VS', 'BYPASS', 'GAIN8'];

export const lm386 = {
  types: ['ic'],
  kind: 'AMP',
  modelText: 'lm386',
  accepts: (part) => part.def.electrical?.part === 'LM386',
  params(part) {
    return { model: { ...LM386, ...part.raw.model } };
  },
  elements(p, h) {
    const m = p.model;
    const n = Object.fromEntries(PINS.map((name) => [name, h.pin(name)]));
    const a = h.inner();
    const o = h.inner();
    const own = [
      h.add(resistor(n['IN+'], n.GND, m.rin)),
      h.add(resistor(n['IN-'], n.GND, m.rin)),
      h.add(resistor(n.GAIN1, n.GAIN8, m.r18)),
      h.add(resistor(n.GAIN8, a, m.r150)),
      h.add(resistor(n.GAIN1, n.GND, m.tie)),
      h.add(inputLoop(a, n.GAIN1, n['IN+'], n['IN-'])),
      // Its own current: about 4 mA from a volt up, whatever the supply (the datasheet's curve is flat).
      h.add(limitedResistor(n.VS, n.GND, m.quiescentKnee / m.quiescent, m.quiescent)),
      h.add(resistor(n.VS, n.BYPASS, m.bypass)),
      h.add(resistor(n.BYPASS, n.GND, m.bypass)),
    ];
    const stage = h.add(outputStage({ a, g8: n.GAIN8, vs: n.VS, gnd: n.GND, o }, m));
    const out = h.add(limitedResistor(o, n.OUT, m.rout, m.currentLimit));
    return { elements: [...own, stage, out], stage, out };
  },
  read(entry, h) {
    const index = Object.fromEntries(entry.pins.map((x) => [x.name, x.index]));
    // Each pin's current into the chip: what its elements take from that node.
    const byNode = new Map();
    for (const el of entry.elements) el.currents(h.x).forEach((i, k) => byNode.set(el.nodes[k], (byNode.get(el.nodes[k]) ?? 0) + i));
    const currents = Object.fromEntries(entry.pins.map((x) => [x.name, 0]));
    const seen = new Set();
    for (const x of entry.pins) {
      if (seen.has(x.index)) continue; // two pins on one strip: the strip's current goes to the first
      seen.add(x.index);
      currents[x.name] = byNode.get(x.index) ?? 0;
    }
    const v = (name) => h.volt(index[name]) - h.volt(index.GND);
    const power = entry.pins.reduce((sum, x) => sum + h.volt(x.index) * currents[x.name], 0);
    const { u, lo, hi } = entry.stage.shape(h.x);
    const state = u > hi + entry.model.clip ? 'clipHigh' : u < lo - entry.model.clip ? 'clipLow' : 'linear';
    return { state, supply: v('VS'), vout: v('OUT'), vplus: v('IN+'), vminus: v('IN-'), current: -currents.OUT, power, currents };
  },
  limits(entry, r) {
    const m = entry.model;
    const out = [
      stress('SIM_IC_SUPPLY', 'voltage', r.supply, m.maxAbsolute, 'V'),
      stress('SIM_IC_PIN_VOLTAGE', 'voltage', Math.abs(r.vplus), m.maxInput, 'V', { pin: 'IN+', of: 'input' }),
      stress('SIM_IC_PIN_VOLTAGE', 'voltage', Math.abs(r.vminus), m.maxInput, 'V', { pin: 'IN-', of: 'input' }),
      stress('SIM_OVER_POWER', 'power', r.power, m.maxPower, 'W'),
      reverseSupply(-r.supply, REVERSE_LIMITS.ic, 'VS', 'GND'),
    ];
    // Outside its operating range (and not off, nor reversed): it is not guaranteed to work.
    if (r.supply > 0.5 && (r.supply < m.minSupply || (r.supply > m.maxSupply && r.supply <= m.maxAbsolute))) out.push(note('warning', 'SIM_IC_SUPPLY_RANGE', { part: entry.id, voltage: q(r.supply, 'V'), min: q(m.minSupply, 'V'), max: q(m.maxSupply, 'V') }));
    return out;
  },
  lines(p, h) {
    return [
      h.raw(`amp.${p.state}`, h.t(`sim.amp.${p.state}`)),
      h.q('amp.supply', h.f(p.supply, 'V')),
      h.q('amp.vplus', h.f(p.vplus, 'V')),
      h.q('amp.vout', h.f(p.vout, 'V')),
      h.q('amp.iout', h.f(p.current, 'A')),
      h.q('power', h.f(p.power, 'W')),
    ];
  },
  tag: (r) => ({ label: 'Iout', value: Math.abs(r.current), key: 'amp.iout' }),
  scope: (r) => ({ v: { label: 'Vout', value: r.vout }, i: { label: 'Iout', value: r.current } }),
};
