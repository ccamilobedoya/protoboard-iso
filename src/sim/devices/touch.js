// A capacitive touch module (TTP223): an element with a clock of its own and a push-pull output.
// What it does in time (models.js TOUCH, docs/en/timed-sensors.md):
//
//   settling  for 0.5 s after power on the pad is calibrated and the output stays inactive; a finger
//             on the pad then is taken as the baseline (`held`): it counts only once it is lifted
//   idle      a change of `touch` is registered once it has lasted the response time (220 ms, 60 ms
//             in fast mode); a shorter one is not registered at all
//   toggle    each registered touch flips the output; the release does nothing
//
// The output is a CMOS push-pull stage: SIG joined to VCC through 150 Ω when it is high and to GND
// through 75 Ω when it is low, so its high level is the module's own supply. `activeLow` swaps the
// polarity. As the PIR's (pir.js), the machine is a pure function (`touchAdvance`), the element keeps
// its memory in `state` (carried across a rebuild), advances it in `accept(x, { h })` and stamps the
// output for the state at the END of the step being solved. The board's own indicator LED is left
// out: it takes about a milliampere from SIG and would hide the datasheet's levels.
//
// The reading: the state in words (with the time left in the one that counts), SIG, the supply, the
// current SIG gives. Stresses: the supply over 5.5 V, SIG over 10 mA; notes: under 2 V, SIG beyond
// the currents its levels are guaranteed at (4 mA sourced, 8 mA sunk).

import { resistor } from '../mna.js';
import { TOUCH } from '../models.js';
import { stress, note, q, volt } from './shared.js';

export const OFF = 0;
export const SETTLING = 1;
export const HELD = 2;
export const RUN = 3;
const EPS = 1e-9;

export const responseOf = (p) => (p.fast ? TOUCH.fastResponse : TOUCH.response);

// The memory after `h` seconds: { phase, clock, sensed, level }. `sensed`: the touch as registered
// (the input once it has lasted the response time); `level`: a toggle's latch. `p`: { touch, toggle, fast }.
export function touchAdvance(state, h, powered, p) {
  // The latch belongs to the mode it was set in: a control that changed the mode (a new `epoch`) clears it.
  const epoch = p.epoch ?? 0;
  return { ...run(state.epoch === epoch ? state : { ...state, level: 0 }, h, powered, p), epoch };
}

function run({ phase, clock, sensed, level }, h, powered, p) {
  if (!powered) return { phase: OFF, clock: 0, sensed: 0, level: 0 };
  if (phase === OFF) [phase, clock, sensed, level] = [SETTLING, 0, 0, 0];
  const touch = p.touch ? 1 : 0;
  let left = h;
  for (let turn = 0; turn < 4; turn++) {
    if (phase === SETTLING) {
      if (clock + left < TOUCH.settle - EPS) return { phase, clock: clock + left, sensed: 0, level };
      left = Math.max(0, clock + left - TOUCH.settle);
      [phase, clock, sensed] = [touch ? HELD : RUN, 0, 0];
      continue;
    }
    if (phase === HELD) {
      if (touch) return { phase, clock: 0, sensed: 0, level };
      [phase, clock] = [RUN, 0];
      continue;
    }
    if (touch === sensed) return { phase, clock: 0, sensed, level };
    if (clock + left < responseOf(p) - EPS) return { phase, clock: clock + left, sensed, level };
    left = Math.max(0, clock + left - responseOf(p));
    sensed = touch;
    if (sensed && p.toggle) level = 1 - level;
    clock = 0;
  }
  return { phase, clock, sensed, level };
}

// Whether the output is active (touched, or in toggle mode latched on) in that memory.
export const activeOf = (s, p) => Boolean(p.toggle ? s.level : s.sensed);
// The output's logic level: active high, or low with `activeLow`.
export const highOf = (s, p) => activeOf(s, p) !== Boolean(p.activeLow);

function touchCore({ sig, vcc, gnd }, p) {
  const gh = 1 / TOUCH.highResistance;
  const gl = 1 / TOUCH.lowResistance;
  return {
    nodes: [sig, vcc, gnd],
    links: [
      [sig, vcc],
      [sig, gnd],
    ],
    phase: SETTLING,
    clock: 0,
    sensed: 0,
    level: 0,
    // The mode its latch belongs to: a latch left by another mode is not this one's (see touchAdvance).
    epoch: p.epoch ?? 0,
    ahead(x, ctx) {
      return touchAdvance(this, ctx.h ?? 0, volt(x, vcc) - volt(x, gnd) >= TOUCH.minSupply, p);
    },
    stamp(st, x, ctx) {
      const now = this.ahead(x, ctx);
      // Unpowered (off) the output is high impedance, whatever the polarity: it drives nothing and does
      // not feed the module through its own pin.
      if (now.phase === OFF) return false;
      if (highOf(now, p)) st.conductance(sig, vcc, gh);
      else st.conductance(sig, gnd, gl);
      return false;
    },
    // Into the element at each node, in `nodes` order.
    currents(x, ctx = {}) {
      const now = this.ahead(x, ctx);
      const high = highOf(now, p);
      const on = now.phase !== OFF;
      const toVcc = on && high ? gh * (volt(x, sig) - volt(x, vcc)) : 0;
      const toGnd = on && !high ? gl * (volt(x, sig) - volt(x, gnd)) : 0;
      return [toVcc + toGnd, -toVcc, -toGnd];
    },
    accept(x, ctx = {}) {
      Object.assign(this, this.ahead(x, ctx));
    },
    // Settling or counting a response: a twentieth of the response time.
    maxStep() {
      return this.phase === SETTLING || (this.phase === RUN && (this.sensed ? 1 : 0) !== (p.touch ? 1 : 0)) ? responseOf(p) / 20 : null;
    },
    span: () => TOUCH.settle,
  };
}

export const touch = {
  types: ['touch-sensor'],
  kind: 'TCH',
  state: ['phase', 'clock', 'sensed', 'level', 'epoch'],
  senses: ['touch'],
  params(part, c) {
    const e = part.def.electrical;
    const v = c?.env?.('touch');
    return { touch: v === undefined ? e.touch : Boolean(v), toggle: e.mode === 'toggle', activeLow: e.activeLow, fast: e.fast };
  },
  controls: (p) => ({
    touch: { scale: 'toggle', value: Boolean(p.touch), moves: ['page.controls.touch', 'page.controls.release'] },
    toggleMode: { scale: 'toggle', value: Boolean(p.toggle), moves: ['page.controls.touchToggle', 'page.controls.touchMomentary'] },
  }),
  set(p, field, value) {
    if (field === 'touch') return { ...p, touch: Boolean(value) };
    // A new epoch: the latch of the mode that was left is cleared at the next step, however the control moves.
    if (field === 'toggleMode') return { ...p, toggle: Boolean(value), epoch: (p.epoch ?? 0) + 1 };
    return null;
  },
  elements(p, h) {
    const [sig, vcc, gnd] = ['SIG', 'VCC', 'GND'].map((name) => h.pin(name));
    const own = h.add(resistor(vcc, gnd, TOUCH.quiescentAt / (p.fast ? TOUCH.fastQuiescent : TOUCH.quiescent)));
    const main = h.add(touchCore({ sig, vcc, gnd }, p));
    return { own, main };
  },
  read(entry, h) {
    const at = (name) => h.volt(entry.pins.find((p) => p.name === name).index);
    const now = entry.main.ahead(h.x, h.ctx ?? {});
    const [, toVcc, toGnd] = entry.main.currents(h.x, h.ctx);
    const iq = entry.own.currents(h.x, h.ctx)[0];
    const vcc = at('VCC') - at('GND');
    const sig = at('SIG') - at('GND');
    // Into the part at each pin; what SIG gives to its load is the negative of its own.
    const into = toVcc + toGnd;
    const currents = { SIG: into, VCC: iq - toVcc, GND: -(iq + toGnd) };
    const counting = now.phase === RUN && now.sensed !== (entry.touch ? 1 : 0);
    const state = now.phase === OFF ? 'off' : now.phase === SETTLING ? 'settling' : now.phase === HELD ? 'held' : counting ? 'sensing' : activeOf(now, entry) ? 'active' : 'idle';
    const left = now.phase === SETTLING ? Math.max(0, TOUCH.settle - now.clock) : counting ? Math.max(0, responseOf(entry) - now.clock) : null;
    return {
      state,
      left,
      touch: entry.touch,
      toggle: entry.toggle,
      activeLow: entry.activeLow,
      fast: entry.fast,
      vcc,
      vout: sig,
      current: -into,
      quiescent: iq,
      power: vcc * currents.VCC + sig * currents.SIG,
      currents,
    };
  },
  limits(entry, r) {
    const out = [
      stress('SIM_IC_SUPPLY', 'voltage', r.vcc, TOUCH.maxSupply, 'V'),
      stress('SIM_REVERSE_VOLTAGE', 'reverse', -r.vcc, TOUCH.maxReverse, 'V', { param: 'voltage' }),
      stress('SIM_OVER_CURRENT', 'current', Math.abs(r.current), TOUCH.maxCurrent, 'A'),
    ];
    if (r.vcc > 0.5 && r.vcc < TOUCH.minSupply) out.push(note('warning', 'SIM_MODULE_LOW_SUPPLY', { part: entry.id, voltage: q(r.vcc, 'V'), min: q(TOUCH.minSupply, 'V') }));
    // Between the currents its levels are guaranteed at and where the kit warns: only a note.
    if (r.current > TOUCH.sourceSpec || -r.current > TOUCH.sinkSpec) out.push(note('info', 'SIM_TOUCH_OUTPUT_SPEC', { part: entry.id, current: q(Math.abs(r.current), 'A'), max: q(r.current > 0 ? TOUCH.sourceSpec : TOUCH.sinkSpec, 'A') }));
    return out;
  },
  lines(p, h) {
    return [
      h.raw(`touch.${p.state}`, h.t(`sim.touch.${p.state}`, { time: p.left == null ? '' : h.f(p.left, 's') })),
      h.q('touch.input', h.t(p.touch ? 'sim.env.on' : 'sim.env.off')),
      h.q('touch.mode', h.t(`sim.touch.mode.${p.toggle ? 'toggle' : 'momentary'}${p.activeLow ? '.low' : ''}`)),
      h.q('touch.vout', h.f(p.vout, 'V')),
      h.q('touch.isig', h.f(Math.abs(p.current) < 1e-9 ? 0 : p.current, 'A')),
      h.q('touch.vcc', h.f(p.vcc, 'V')),
      h.q('touch.own', h.f(p.quiescent, 'A')),
    ];
  },
  tag: (r) => ({ label: 'SIG', value: Math.abs(r.current), key: 'touch.isig' }),
  scope: (r) => ({ v: { label: 'SIG', value: r.vout }, i: null }),
};
