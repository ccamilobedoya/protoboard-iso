// LM393 sensor modules (family F3; docs/en/sensor-modules.md): one board, its sensing element per part
// number (src/parts/sensors.js SENSOR_MODULES). The board, as traced from reseller teardowns:
//
//   VCC ─┬─ 1 kΩ ─ power LED ─ GND
//        ├─ Rf 10 kΩ ─┬─ AO ─ element ─ GND        the element on the low side (the first option of
//        │            └─ LM393 IN+                   the spec; `side: 'high'` in the model flips a
//        ├─ trimmer (threshold) ─ Vref ─ LM393 IN−    resistive or switch element to the top)
//        ├─ 10 kΩ pull-up ─ DO ─ LM393 open collector to GND
//        └─ 1 kΩ ─ DO LED ─ DO                       lit while DO is low
//
// so DO is low exactly while AO is under Vref = threshold · VCC: "detected" (wet, damp, light, a beam,
// white or near, a magnet, an obstacle) pulls AO down. The comparator is the kit's LM393 open collector
// (../mna.js comparatorStage: 60 Ω on, 20 mA), the trimmer two resistors, the LEDs a flat Vf behind
// their resistors. Everything follows VCC (ratiometric), so DO hardly depends on the supply; only the
// optical ones' LED current and the Hall chip's thresholds do not scale.
//
// Elements: a resistance (rain comb, soil fork, photoresistor); a phototransistor fed by the module's
// own IR LED (slot, line follower, obstacle: Ic from ../../parts/sensors.js moduleLight, times the LED's
// current against 25 mA, saturating near 0.2 V); an A3144 Hall switch, a latch kept in `closed` (an
// element key the engine carries across a control's change, as a relay's armature); the SW-420's
// spring contact, closed at rest and chattering while shaken: a deterministic pattern from a seed
// (the part's id unless it gives one), kept in `runner` (carried too; its `fastest()` asks the page for
// short steps while it chatters). Spec choices left open there: the element on the low side, the DO
// LED wired as on the other boards (so the SW-420's is lit at rest; `active: 'high'` says DO high is
// its detection), the Hall chip a switch (not the linear 49E).
//
// The KY-037's electret capsule (the ENVELOPE form of docs/en/sensor-modules.md): AO is the DC bias,
// VCC/2 through the element's 10 kΩ, and the sound's AC peak (6.3 mV rms at 94 dB) is not on AO but in
// the comparator: DO is low while the peak takes AO under Vref, i.e. while Vpk > Vbias − Vref. A source
// of the peak between the trimmer's Vref and the comparator's input does it; the card shows the peak.
//
// Readings: the stimulus, the element (Ω, or its current), AO, Vref, DO (also as `vout`, what a
// timeline's value step reads) and its state, the sink current
// into DO, the supply current, the IR LED's current. Stresses: VCC reversed,
// DO sinking over 20 mA, an IR LED over 60 mA, the Hall output over 25 mA. Notes: VCC over the board's 5.5 V (a warning, so 5 V does not read as near its
// limit), a supply under the LM393's 2 V (the Hall chip's 4.5 V), DC through a wet comb or the soil (the electrodes corrode). A
// module on 5 V wired to a 3.3 V board's pin drives it with VCC through DO (or AO): the board's own
// check (SIM_PIN_OVERVOLTAGE, ./mcu.js) says so.

import { resistor, comparatorStage, partSource } from '../mna.js';
import { OPAMPS, GMIN } from '../models.js';
import { SENSOR_MODULES, MODULE_BOARD, moduleResistance, moduleLight, electretPeak } from '../../parts/sensors.js';
import { stress, note, q } from './shared.js';

const volt = (x, i) => (i >= 0 ? x[i] : 0);
// A smooth max(0, v): s · ln(1 + e^(v/s)), and its slope.
const softplus = (v, s) => (v / s > 40 ? v : s * Math.log1p(Math.exp(v / s)));
const softSlope = (v, s) => 1 / (1 + Math.exp(-v / s));
const LED_KNEE = 0.05; // V: how round an LED's flat Vf is

// An LED with its series resistor as one element, a to b: i = max(0, V − Vf) / R, rounded at the knee.
function ledElement(a, b, r, vf) {
  return {
    nodes: [a, b],
    links: [[a, b]],
    stamp(st, x) {
      const v = volt(x, a) - volt(x, b);
      const i = softplus(v - vf, LED_KNEE) / r;
      const g = softSlope(v - vf, LED_KNEE) / r + GMIN;
      st.device(this.nodes, [i, -i], [[g, -g], [-g, g]], [volt(x, a), volt(x, b)]);
      return false;
    },
    currents(x) {
      const i = softplus(volt(x, a) - volt(x, b) - vf, LED_KNEE) / r;
      return [i, -i];
    },
  };
}
const irCurrent = (m, v) => softplus(v - m.irVf, LED_KNEE) / m.irSeries;

// A phototransistor from c to e lit by the module's IR LED (on vcc–gnd): Ic = (k · IF + dark) · f(Vce),
// f a saturation knee [A]: 1 from about 0.3 V up, half at 0.22 V and 0 at 0 V, so a transistor asked for
// more than its collector resistor can pass settles near 0.2 V (spec 1.7). Newton is held to steps of
// 0.15 V below 1 V (the knee is steep), as a junction's voltage is (`vd`, kept between iterations).
const KNEE = { at: 0.22, width: 0.025, zero: 0.02 };
const logistic = (u) => 1 / (1 + Math.exp(-u));
function photoElement(c, e, vcc, k, dark, m) {
  const sat = (v) => Math.tanh(v / KNEE.zero) * logistic((v - KNEE.at) / KNEE.width);
  const satSlope = (v) => {
    const t = Math.tanh(v / KNEE.zero);
    const l = logistic((v - KNEE.at) / KNEE.width);
    return ((1 - t * t) / KNEE.zero) * l + (t * l * (1 - l)) / KNEE.width;
  };
  const source = (x) => k * irCurrent(m, volt(x, vcc) - volt(x, e)) + dark;
  return {
    nodes: [c, e, vcc],
    links: [[c, e]],
    vd: 0,
    stamp(st, x) {
      const v = [volt(x, c), volt(x, e), volt(x, vcc)];
      const want = v[0] - v[1];
      let vce = want;
      let limited = false;
      if ((want < 1 || this.vd < 1) && Math.abs(want - this.vd) > 0.15) {
        vce = this.vd + Math.sign(want - this.vd) * 0.15;
        limited = true;
      }
      this.vd = vce;
      const u = v[2] - v[1];
      const ic = source(x);
      const i = ic * sat(vce);
      const dc = ic * satSlope(vce) + GMIN; // ∂i/∂V(c)
      const dv = (k * softSlope(u - m.irVf, LED_KNEE) * sat(vce)) / m.irSeries; // ∂i/∂V(vcc)
      // Linearised at the limited Vce (its own c voltage), the others as they are.
      st.device(this.nodes, [i, -i, 0], [[dc, -dc - dv, dv], [-dc, dc + dv, -dv], [0, 0, 0]], [v[1] + vce, v[1], v[2]]);
      return limited;
    },
    currents(x) {
      const i = source(x) * sat(volt(x, c) - volt(x, e));
      return [i, -i, 0];
    },
    // What it would conduct now, saturation aside: the light it receives, as a current.
    available: (x) => source(x),
  };
}

// The A3144's open-collector output, out to gnd: on, a saturated NPN (vsat + rsat · I); off, open. Its
// state is a latch with hysteresis on the field (on at BOP, off at BRP, kept between), in `closed`.
function hallElement(out, gnd, field, m) {
  const knee = 0.005;
  return {
    nodes: [out, gnd],
    links: [[out, gnd]],
    closed: field >= m.bop,
    sync() {
      if (field >= m.bop) this.closed = true;
      else if (field <= m.brp) this.closed = false;
    },
    stamp(st, x) {
      this.sync();
      const v = volt(x, out) - volt(x, gnd);
      const i = this.closed ? softplus(v - m.vsat, knee) / m.rsat : 0;
      const g = (this.closed ? softSlope(v - m.vsat, knee) / m.rsat : 0) + GMIN;
      st.device(this.nodes, [i, -i], [[g, -g], [-g, g]], [volt(x, out), volt(x, gnd)]);
      return false;
    },
    currents(x) {
      const i = this.closed ? softplus(volt(x, out) - volt(x, gnd) - m.vsat, knee) / m.rsat : 0;
      return [i, -i];
    },
    accept() {
      this.sync();
    },
  };
}

// A number from 0 to 1 for cell k of a seed (an integer hash: the same seed, the same pattern).
function unit(seed, k) {
  let h = (seed ^ Math.imul(k + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

// The SW-420's contact, a to b: 10 Ω closed, open while it chatters. While shaken it runs cells of
// period · (1 ± jitter), open for the first `open` share of each, the first one opening at the instant
// the shaking starts; once it stops, the cell in progress and one more, then it settles closed. The
// pattern lives in `runner` (the engine carries it across a change), advanced by the accepted steps.
function contactElement(a, b, shaken, seed, m) {
  const g = 1 / m.contact;
  const gOpen = 1e-8; // 100 MΩ: the node is never left floating
  const cell = (k) => m.period * (1 + m.jitter * (2 * unit(seed, k) - 1));
  return {
    nodes: [a, b],
    links: [[a, b]],
    runner: {
      phase: shaken ? 'burst' : 'idle', // idle | burst | ring (settling)
      t: 0, // s into the present cell
      cell: 0,
      left: 0, // cells still to run once the shaking stopped
      // The step the page needs while it chatters: the shortest open time, 2 ms (a twentieth of it).
      fastest() {
        return this.phase === 'idle' ? 0 : m.open * m.period * (1 - m.jitter);
      },
    },
    sync() {
      const r = this.runner;
      if (shaken && r.phase !== 'burst') Object.assign(r, { phase: 'burst', t: 0, cell: 0 });
      else if (!shaken && r.phase === 'burst') Object.assign(r, { phase: 'ring', left: 1 });
    },
    open() {
      const r = this.runner;
      return r.phase !== 'idle' && r.t < m.open * cell(r.cell);
    },
    stamp(st) {
      this.sync();
      st.conductance(a, b, this.open() ? gOpen : g);
      return false;
    },
    currents(x) {
      const i = (volt(x, a) - volt(x, b)) * (this.open() ? gOpen : g);
      return [i, -i];
    },
    accept(x, ctx = {}) {
      this.sync();
      const r = this.runner;
      if (!(ctx.h > 0) || r.phase === 'idle') return;
      r.t += ctx.h;
      while (r.phase !== 'idle' && r.t >= cell(r.cell) - 1e-12) {
        r.t -= cell(r.cell);
        r.cell++;
        if (r.phase === 'ring' && r.left-- <= 0) Object.assign(r, { phase: 'idle', t: 0 });
      }
    },
  };
}

// A part's seed for its chatter: FNV-1a of its id.
function seedOf(id) {
  let h = 0x811c9dc5;
  for (const ch of String(id)) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
  return h;
}

// Numbers only from the circuit's `model` (it travels to the page as JSON).
const numbers = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => typeof v === 'number' || typeof v === 'string'));
const OPTICAL = ['slot', 'reflective', 'obstacle'];
const RESISTIVE = ['comb', 'probe', 'ldr', 'electret'];
// The control of each stimulus on the part: its own name, and its slider.
const CONTROL = {
  rain: ['wetness', { min: 0, max: 1, limit: [0, 1], scale: 'linear', unit: '', percent: true, step: 0.01 }],
  moisture: ['moisture', { min: 0, max: 100, limit: [0, 100], scale: 'linear', unit: '%', step: 1 }],
  light: ['light', { min: 0.1, max: 10000, limit: [0, 1e6], scale: 'log', unit: 'lx' }],
  beam: ['beam', { scale: 'toggle' }],
  reflectance: ['reflectance', { min: 0, max: 100, limit: [0, 100], scale: 'linear', unit: '%', step: 1 }],
  distance: ['distance', { min: 0, max: 40, limit: [0, 1000], scale: 'linear', unit: 'cm', step: 0.05 }],
  field: ['field', { min: -500, max: 500, limit: [-10000, 10000], scale: 'linear', unit: 'G', step: 1 }],
  vibration: ['vibration', { scale: 'toggle' }],
  sound: ['sound', { min: 30, max: 110, limit: [0, 140], scale: 'linear', unit: 'dB', step: 1 }],
};
// A TCRT5000 sees 0 to 3 cm; an FC-51 up to about 40 cm.
const DISTANCE = { reflective: { max: 3 }, obstacle: { min: 1, max: 40, step: 0.5 } };
const fieldOf = (control) => Object.keys(CONTROL).find((f) => CONTROL[f][0] === control);

export const sensorModule = {
  types: ['sensor-module'],
  kind: 'SNS',
  // Each part number senses some of these (its record lists the ones it asked about).
  senses: ['rain', 'moisture', 'light', 'beam', 'reflectance', 'distance', 'field', 'vibration', 'angle', 'sound'],
  ownField: { rain: 'wetness' },
  params(part, c) {
    const e = part.def.electrical;
    const v = SENSOR_MODULES[e.part];
    const model = { ...MODULE_BOARD, rTrim: v.trim, ...v.model, ...(e.transmittance !== undefined && { transmittance: e.transmittance }), ...(e.slots !== undefined && { slots: e.slots, duty: e.duty ?? 0.5 }), ...numbers(part.raw.model) };
    const stim = {};
    for (const field of v.senses) {
      const env = c?.env?.(field);
      stim[field] = env === undefined ? e.stim[field] : env;
    }
    // An encoder disc turns with the environment's angle (or the part's own).
    if (model.slots > 0) stim.angle = c?.env?.('angle') ?? Number(part.raw.angle ?? 0);
    const names = part.pinNames;
    return { part: e.part, element: v.element, names, doPin: v.do ?? 'DO', active: v.active ?? 'low', threshold: e.threshold, stim, seed: e.seed ?? seedOf(part.id), model };
  },
  controls(p) {
    // The KY-037's trimmer is set within millivolts of the bias: a finer slider.
    const out = { threshold: { min: 0, max: 1, limit: [0, 1], scale: 'linear', unit: '', percent: true, step: p.element === 'electret' ? 0.0005 : 0.005, value: p.threshold } };
    for (const field of Object.keys(p.stim)) {
      if (!CONTROL[field]) continue;
      const [name, shape] = CONTROL[field];
      const value = p.stim[field];
      // A toggle is true or false; the light's log slider starts at 0.1 lx; distance's range by sensor.
      if (shape.scale === 'toggle') out[name] = { ...shape, value: Boolean(value) };
      else out[name] = { ...shape, ...(field === 'distance' && DISTANCE[p.element]), value: field === 'light' ? Math.max(0.1, value) : value };
    }
    return out;
  },
  set(p, control, value) {
    if (control === 'threshold') return { ...p, threshold: Math.min(1, Math.max(0, Number(value))) };
    const field = fieldOf(control);
    if (!field || !(field in p.stim)) return null;
    return { ...p, stim: { ...p.stim, [field]: CONTROL[field][1].scale === 'toggle' ? Number(Boolean(value)) : Number(value) } };
  },
  sense(p, field, value) {
    if (!(field in p.stim)) return null;
    return { ...p, stim: { ...p.stim, [field]: Number(value) } };
  },
  elements(p, h) {
    const m = p.model;
    const has = (name) => p.names.includes(name);
    const vcc = h.pin('VCC');
    const gnd = h.pin('GND');
    const out = h.pin(p.doPin);
    const ao = has('AO') ? h.pin('AO') : h.inner();
    const vref = h.inner();
    // The electret's envelope: DO low while its AC peak takes AO under Vref, so the comparator's reference
    // is the trimmer's Vref raised by the peak (a source between the two; the input draws nothing).
    const electret = p.element === 'electret';
    const refIn = electret ? h.inner() : vref;
    const lm = { ...OPAMPS.LM393 };
    const els = {
      power: h.add(ledElement(vcc, gnd, m.rLed, m.ledVf)),
      doLed: h.add(ledElement(vcc, out, m.rLed, m.ledVf)),
      pullup: h.add(resistor(vcc, out, m.rPullup)),
      upper: h.add(resistor(vcc, vref, Math.max(m.rTrim * (1 - p.threshold), 1e-3))),
      lower: h.add(resistor(vref, gnd, Math.max(m.rTrim * p.threshold, 1e-3))),
      own: h.add(resistor(vcc, gnd, lm.quiescentAt / lm.quiescent)),
      comparator: h.add(comparatorStage({ p: ao, n: refIn, out, vee: gnd }, lm)),
    };
    if (electret) els.shift = h.add(partSource(refIn, vref, electretPeak(m, p.stim.sound)));
    const high = m.side === 'high' && (RESISTIVE.includes(p.element) || p.element === 'vibration');
    els.fixed = h.add(high ? resistor(ao, gnd, m.rFixed) : resistor(vcc, ao, m.rFixed));
    const [top, bottom] = high ? [vcc, ao] : [ao, gnd];
    if (RESISTIVE.includes(p.element)) els.sensor = h.add(resistor(top, bottom, moduleResistance(p.element, m, p.stim)));
    else if (OPTICAL.includes(p.element)) {
      els.ir = h.add(ledElement(vcc, gnd, m.irSeries, m.irVf));
      els.sensor = h.add(photoElement(ao, gnd, vcc, moduleLight(p.element, m, p.stim) / m.irRef, p.element === 'slot' ? m.dark : 0, m));
    } else if (p.element === 'hall') {
      els.chip = h.add(resistor(vcc, gnd, 5 / m.own));
      els.sensor = h.add(hallElement(ao, gnd, p.stim.field, m));
    } else els.sensor = h.add(contactElement(top, bottom, Boolean(p.stim.vibration), p.seed, m));
    return { ...els, nodes: { vcc, gnd, out, ao, vref } };
  },
  read(entry, h) {
    const m = entry.model;
    const x = h.x;
    const n = entry.nodes;
    const v = (i) => h.volt(i) - h.volt(n.gnd);
    const i0 = (el) => (el ? el.currents(x, h.ctx)[0] : 0);
    const [vcc, ao, vref, vdo] = [v(n.vcc), v(n.ao), v(n.vref), v(n.out)];
    const sink = i0(entry.comparator);
    const low = entry.comparator.on(x);
    const ir = i0(entry.ir);
    const through = i0(entry.sensor); // from its first node to its second
    const fixed = i0(entry.fixed);
    const topSide = entry.fixed.nodes[0] !== n.vcc; // a resistive or switch element on the high side
    // Into the module at each pin (Kirchhoff: they add up to zero).
    const supply = i0(entry.power) + i0(entry.doLed) + i0(entry.pullup) + i0(entry.upper) + i0(entry.own) + ir + i0(entry.chip) + (topSide ? through : fixed);
    const currents = { VCC: supply, [entry.doPin]: sink - i0(entry.doLed) - i0(entry.pullup) };
    // What leaves AO into the circuit: the divider's current that the element does not take.
    if (entry.names.includes('AO')) currents.AO = topSide ? fixed - through : through - fixed;
    currents.GND = -Object.values(currents).reduce((s, c) => s + c, 0);
    let value;
    if (entry.element === 'electret') value = { resistance: moduleResistance(entry.element, m, entry.stim), peak: electretPeak(m, entry.stim.sound) };
    else if (RESISTIVE.includes(entry.element)) value = { resistance: moduleResistance(entry.element, m, entry.stim) };
    else if (OPTICAL.includes(entry.element)) value = { current: through, light: entry.sensor.available(x) };
    else if (entry.element === 'hall') value = { on: Boolean(entry.sensor.closed), current: through };
    else value = { open: entry.sensor.open() };
    const detected = entry.active === 'high' ? !low : low;
    return { part: entry.part, element: entry.element, ...(value.peak !== undefined && { peak: value.peak }), stim: { ...entry.stim }, threshold: entry.threshold, value, vcc, ao, vref, vdo, vout: vdo, low, detected, active: entry.active, sink, supply, ir, currents, current: supply };
  },
  limits(entry, r) {
    const m = entry.model;
    const out = [
      stress('SIM_REVERSE_VOLTAGE', 'reverse', -r.vcc, m.maxReverse, 'V', { param: 'voltage' }),
      stress('SIM_OVER_CURRENT', 'current', Math.abs(r.sink), OPAMPS.LM393.maxCurrent, 'A', { pin: entry.doPin }),
    ];
    if (OPTICAL.includes(entry.element)) out.push(stress('SIM_OVER_CURRENT', 'current', r.ir, m.irMax, 'A', { pin: 'IR' }));
    if (entry.element === 'hall') out.push(stress('SIM_OVER_CURRENT', 'current', Math.abs(r.value.current), m.maxOutput, 'A', { pin: 'A3144' }));
    // Over the board's 5.5 V rating: a warning, not a stress (5 V is its usual supply, not "near").
    if (r.vcc > m.maxSupply) out.push(note('warning', 'SIM_IC_SUPPLY', { part: entry.id, voltage: q(r.vcc, 'V'), max: q(m.maxSupply, 'V') }));
    const min = m.minSupply;
    if (r.vcc > 0.5 && r.vcc < min) out.push(note('warning', 'SIM_MODULE_LOW_SUPPLY', { part: entry.id, voltage: q(r.vcc, 'V'), min: q(min, 'V') }));
    const wet = entry.element === 'comb' ? entry.stim.rain > 0.2 : entry.element === 'probe' ? entry.stim.moisture > 0 : false;
    if (wet && r.vcc > 0.5) out.push(note('info', 'SIM_MODULE_CORROSION', { part: entry.id }));
    return out;
  },
  lines(p, h) {
    const lines = [];
    const field = Object.keys(p.stim).find((f) => f !== 'angle');
    for (const f of Object.keys(p.stim)) lines.push(h.q(`sensor-module.${f}`, stimText(f, p.stim[f], h)));
    const e = p.value;
    if (e.peak !== undefined) lines.push(h.q('sensor-module.peak', h.f(e.peak, 'V')));
    else if (e.resistance !== undefined) lines.push(h.q('sensor-module.resistance', h.f(e.resistance, 'Ω')));
    else if (e.light !== undefined) lines.push(h.q('sensor-module.photo', h.f(Math.abs(e.current) < 1e-9 ? 0 : e.current, 'A')));
    else if (e.on !== undefined) lines.push(h.q('sensor-module.hall', h.t(e.on ? 'sim.sensor-module.hall.on' : 'sim.sensor-module.hall.off')));
    else lines.push(h.q('sensor-module.contact', h.t(e.open ? 'sim.sensor-module.contact.open' : 'sim.sensor-module.contact.closed')));
    lines.push(
      h.q('sensor-module.ao', h.f(p.ao, 'V')),
      h.q('sensor-module.vref', h.f(p.vref, 'V')),
      h.q('sensor-module.do', `${h.t(p.low ? 'sim.sensor-module.low' : 'sim.sensor-module.high')} · ${h.f(p.vdo, 'V')}`),
      h.raw(p.detected ? 'sensor-module.detected' : 'sensor-module.idle', h.t(`sim.sensor-module.${field}.${p.detected ? 'detected' : 'idle'}`)),
      h.q('sensor-module.sink', h.f(Math.abs(p.sink) < 1e-9 ? 0 : p.sink, 'A')),
      h.q('sensor-module.supply', h.f(p.supply, 'A')),
    );
    if (p.ir) lines.push(h.q('sensor-module.ir', h.f(p.ir, 'A')));
    return lines;
  },
  // The tag: what it takes from its supply.
  tag: (r) => ({ label: '', value: Math.abs(r.supply), key: 'sensor-module.supply' }),
  scope: (r) => ({ v: { label: 'DO', value: r.vdo }, i: null }),
  // An equivalent: the board's resistors, the element at its resistance now (a current one as V/I),
  // the LEDs left out, and the comparator's output as a switch where it is now (Falstad's comparator
  // has no open collector).
  falstad(d, f) {
    const p = d.params;
    const m = p.model;
    const now = f.reading?.parts?.[d.id];
    const [vcc, gnd, out] = ['VCC', 'GND', p.doPin].map((name) => f.pin(d, name));
    const ao = p.names.includes('AO') ? f.pin(d, 'AO') : f.inner(d.id);
    const vref = f.inner(d.id);
    f.resistor(vcc, ao, m.rFixed);
    const r = RESISTIVE.includes(p.element) ? moduleResistance(p.element, m, p.stim) : now && Math.abs(now.value?.current ?? 0) > 1e-9 ? Math.max(1, now.ao / now.value.current) : 1e9;
    f.resistor(ao, gnd, r);
    f.resistor(vcc, vref, Math.max(m.rTrim * (1 - p.threshold), 1e-3));
    f.resistor(vref, gnd, Math.max(m.rTrim * p.threshold, 1e-3));
    f.resistor(vcc, out, m.rPullup);
    f.toggle(out, gnd, Boolean(now?.low));
    f.note('falstad.sensor-module', { part: d.id, resistance: q(r, 'Ω') });
  },
};

// A stimulus as the card writes it.
function stimText(field, value, h) {
  if (field === 'rain') return `${Math.round(value * 100)} %`;
  if (field === 'beam') return h.t(value ? 'sim.sensor-module.beam.blocked' : 'sim.sensor-module.beam.clear');
  if (field === 'vibration') return h.t(value ? 'sim.sensor-module.vibration.on' : 'sim.sensor-module.vibration.off');
  const unit = { moisture: '%', light: 'lx', reflectance: '%', distance: 'cm', field: 'G', angle: '°', sound: 'dB' }[field];
  const n = field === 'light' ? Number(value.toPrecision(value < 1 ? 1 : value < 100 ? 2 : 3)) : Math.round(value * 100) / 100;
  return `${String(n).replace('.', h.decimal)} ${unit}`;
}
