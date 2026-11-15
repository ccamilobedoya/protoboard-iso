// A PIR motion module (HC-SR501, BISS0001): an element with a clock of its own. Its output is 3.3 V
// behind 500 Ω while it is HIGH and 0 V otherwise; what makes it HIGH is a small state machine
// (models.js PIR, docs/en/timed-sensors.md):
//
//   warm-up  OUT low and motion ignored for `warmup` seconds after VCC reaches 4.5 V
//   idle     OUT low; motion starts HIGH at once
//   high     OUT high for `delay` seconds (Tx); in repeat mode (jumper H) motion during it starts the
//            time again, in single mode (L) it is ignored
//   block    OUT low for 2.5 s whatever the motion does; then idle again, which goes HIGH at once if
//            motion is still on: single mode with motion held pulses Tx on, 2.5 s off, for ever
//
// The machine is `pirAdvance`, a pure function of (phase, clock, h). The element keeps `phase` and
// `clock` (the engine carries them over a rebuild: `state`), advances them in `accept(x, { h })` as
// the other memories do, and stamps the output for the phase it will be in at the END of the step
// being solved (`ahead`), so a fall is read at the step that ends on it, not one later. The inputs,
// motion and the jumper, are values of the part: a slider rebuilds the element, never the clock.
//
// The reading: the phase, the time left in it, OUT's voltage and the current it gives, the supply
// and the module's own 65 µA. Stresses: the supply over 20 V, OUT over 2 mA; notes: the supply under
// 4.5 V (it does not start), the warm-up.

import { resistor } from '../mna.js';
import { PIR } from '../models.js';
import { stress, note, q, volt } from './shared.js';

export const OFF = 0;
export const WARMUP = 1;
export const IDLE = 2;
export const HIGH = 3;
export const BLOCK = 4;
export const PHASES = ['off', 'warmup', 'idle', 'high', 'block'];
const EPS = 1e-9;
const MAX_TURNS = 10000;

// The phase and clock after `h` seconds, from { phase, clock }. `p`: { warmup, delay, mode, motion }.
// A phase ends when its clock reaches its length; the time left over goes to the next one.
export function pirAdvance({ phase, clock }, h, powered, p) {
  if (!powered) return { phase: OFF, clock: 0 };
  if (phase === OFF) {
    phase = p.warmup > 0 ? WARMUP : IDLE;
    clock = 0;
  }
  let left = h;
  // A phase ends and the next begins with what is left of the step, however many it spans (single mode
  // with motion held goes round once every Tx + 2.5 s). The turns are bounded only so that a step of
  // years cannot hold the page; past the bound the time that is left is counted in the phase it is in.
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (phase === IDLE) {
      if (!p.motion) return { phase, clock: 0 };
      phase = HIGH;
      clock = 0;
      continue;
    }
    if (phase === HIGH && p.mode === 'H' && p.motion) return { phase, clock: 0 };
    const length = phase === WARMUP ? p.warmup : phase === HIGH ? p.delay : PIR.blocking;
    if (clock + left < length - EPS) return { phase, clock: clock + left };
    left = Math.max(0, clock + left - length);
    clock = 0;
    phase = phase === WARMUP ? IDLE : phase === HIGH ? BLOCK : IDLE;
  }
  return { phase, clock: clock + left };
}

// The seconds left in the phase it is in, or null when it is waiting for motion (or off).
export function timeLeft({ phase, clock }, p) {
  if (phase === WARMUP) return Math.max(0, p.warmup - clock);
  if (phase === HIGH) return Math.max(0, p.delay - clock);
  if (phase === BLOCK) return Math.max(0, PIR.blocking - clock);
  return null;
}

// The element: OUT as a Thevenin source behind its resistance (3.3 V above GND while HIGH).
function pirCore({ vcc, out, gnd }, p) {
  const g = 1 / PIR.outputResistance;
  return {
    nodes: [vcc, out, gnd],
    links: [[out, gnd]],
    phase: p.warmup > 0 ? WARMUP : IDLE,
    clock: 0,
    // Powered or not is read from the voltages being solved, never remembered: a supply changed by a
    // control rebuilds the element, and what it remembered would outlive the supply.
    ahead(x, ctx) {
      return pirAdvance(this, ctx.h ?? 0, volt(x, vcc) - volt(x, gnd) >= PIR.minSupply, p);
    },
    stamp(st, x, ctx) {
      // Unpowered (off) the output is high impedance: it drives nothing, and a pull-up outside wins.
      const now = this.ahead(x, ctx).phase;
      if (now === OFF) return false;
      st.conductance(out, gnd, g);
      if (now === HIGH) st.current(gnd, out, g * PIR.logic);
      return false;
    },
    // Into the element at each node, in `nodes` order.
    currents(x, ctx = {}) {
      const now = this.ahead(x, ctx).phase;
      const i = now === OFF ? 0 : g * (volt(x, out) - volt(x, gnd) - (now === HIGH ? PIR.logic : 0));
      return [0, i, -i];
    },
    accept(x, ctx = {}) {
      Object.assign(this, this.ahead(x, ctx));
    },
    // A phase with a timer is stepped finely (10 ms); waiting for motion needs no more than the page's.
    maxStep() {
      return (this.phase === IDLE || this.phase === OFF) && !p.motion ? null : 0.01;
    },
    // Real time for the page's pace: the shortest time that matters.
    span: () => Math.min(p.delay, PIR.blocking),
  };
}

export const pir = {
  types: ['pir-sensor'],
  kind: 'PIR',
  // The phase and the clock survive a slider (engine.js carries `state`).
  state: ['phase', 'clock'],
  senses: ['motion'],
  params(part, c) {
    const e = part.def.electrical;
    const v = c?.env?.('motion');
    return { delay: e.delay, sensitivity: e.sensitivity, mode: e.mode, warmup: e.warmup, motion: v === undefined ? e.motion : Boolean(v) };
  },
  controls: (p) => ({
    motion: { scale: 'toggle', value: Boolean(p.motion) },
    retrigger: { scale: 'toggle', value: p.mode === 'H', moves: ['page.controls.pirRepeat', 'page.controls.pirSingle'] },
    delay: { min: PIR.sliderRange[0], max: PIR.sliderRange[1], limit: PIR.delayRange, scale: 'log', unit: 's', value: p.delay },
  }),
  set(p, field, value) {
    if (field === 'motion') return { ...p, motion: Boolean(value) };
    if (field === 'retrigger') return { ...p, mode: value ? 'H' : 'L' };
    if (field === 'delay') return { ...p, delay: value };
    return null;
  },
  elements(p, h) {
    const [vcc, out, gnd] = ['VCC', 'OUT', 'GND'].map((name) => h.pin(name));
    const own = h.add(resistor(vcc, gnd, PIR.quiescentAt / PIR.quiescent));
    const main = h.add(pirCore({ vcc, out, gnd }, p));
    return { own, main };
  },
  read(entry, h) {
    const at = (name) => h.volt(entry.pins.find((p) => p.name === name).index);
    const now = entry.main.ahead(h.x, h.ctx ?? {});
    const [, iout] = entry.main.currents(h.x, h.ctx);
    const iq = entry.own.currents(h.x, h.ctx)[0];
    const vcc = at('VCC') - at('GND');
    const currents = { VCC: iq, OUT: iout, GND: -(iq + iout) };
    return {
      state: PHASES[now.phase],
      left: timeLeft(now, entry),
      // How long the phase it is in lasts, for the bar that drains.
      length: now.phase === WARMUP ? entry.warmup : now.phase === HIGH ? entry.delay : PIR.blocking,
      motion: entry.motion,
      mode: entry.mode,
      delay: entry.delay,
      vcc,
      vout: at('OUT') - at('GND'),
      current: -iout,
      quiescent: iq,
      // Each pin's voltage over GND times the current into it (they add to zero, so the level of GND does not matter).
      power: vcc * iq + (at('OUT') - at('GND')) * iout,
      currents,
    };
  },
  limits(entry, r) {
    const out = [
      stress('SIM_IC_SUPPLY', 'voltage', r.vcc, PIR.maxSupply, 'V'),
      stress('SIM_REVERSE_VOLTAGE', 'reverse', -r.vcc, PIR.maxReverse, 'V', { param: 'voltage' }),
      stress('SIM_OVER_CURRENT', 'current', Math.abs(r.current), PIR.maxCurrent, 'A'),
    ];
    if (r.vcc > 0.5 && r.vcc < PIR.minSupply) out.push(note('warning', 'SIM_MODULE_LOW_SUPPLY', { part: entry.id, voltage: q(r.vcc, 'V'), min: q(PIR.minSupply, 'V') }));
    if (r.state === 'warmup') out.push(note('info', 'SIM_PIR_WARMUP', { part: entry.id, time: q(r.left, 's') }));
    return out;
  },
  lines(p, h) {
    const lines = [h.raw(`pir.${p.state}`, h.t(`sim.pir.${p.state}`, { time: p.left == null ? '' : h.f(p.left, 's') }))];
    lines.push(
      h.q('pir.motion', h.t(p.motion ? 'sim.env.on' : 'sim.env.off')),
      h.q('pir.jumper', h.t(`sim.pir.mode.${p.mode}`)),
      h.q('pir.delay', h.f(p.delay, 's')),
      h.q('pir.vout', h.f(p.vout, 'V')),
      // Under a nanoampere it is the solver's leakage, not a current the output gives.
      h.q('pir.iout', h.f(Math.abs(p.current) < 1e-9 ? 0 : p.current, 'A')),
      h.q('pir.vcc', h.f(p.vcc, 'V')),
      h.q('pir.own', h.f(p.quiescent, 'A')),
    );
    return lines;
  },
  tag: (r) => ({ label: 'OUT', value: Math.abs(r.current), key: 'pir.iout' }),
  scope: (r) => ({ v: { label: 'OUT', value: r.vout }, i: null }),
};
