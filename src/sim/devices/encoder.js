// A rotary encoder (ALPS EC11) on its KY-040 module, driven by the environment's `angle`
// (docs/en/rotary-encoder.md). The field is the TARGET: the knob rests at a detent, so the target is
// snapped to the nearest one, and the shaft (kept in the element's carried state) follows it at the
// part's `speed` by the shortest arc. Each of the two contacts, CLK (channel A) and DT (channel B), is
// closed to ground for half a cycle, B a quarter cycle behind A when turning clockwise (increasing
// angle). With 20 pulses and 20 detents a detent is one full cycle, 18°:
//
//   position in the cycle   0 … 0.125   0.125 … 0.375   0.375 … 0.625   0.625 … 0.875   0.875 … 1
//   CLK (A) closed             no            yes             yes             no              no
//   DT  (B) closed             no            no              yes             yes             no
//
// The machine is the pure functions below, tested on the worked numbers of the sheet (every edge at
// 2.25° + 4.5° · k, so 6.25 ms + 12.5 ms · k at 360°/s). The element keeps `shaft` and the two `age`s
// (seconds since each contact last changed, for the optional bounce) and, as the timed sensors do,
// stamps the state it will have at the END of the step being solved (`ahead`), so an edge is read in
// the step that ends on it. While the shaft moves the element asks the engine for short steps
// (`maxStep`), and for nothing when it is still.

import { resistor } from '../mna.js';
import { ENCODER } from '../models.js';
import { stress, note, volt } from './shared.js';

const EDGES = [0.125, 0.375, 0.625, 0.875]; // in cycles: A closes, B closes, A opens, B opens
export const QUIET = 1e9; // an age that is over: no change in memory

// The target: the angle snapped to the nearest detent (ties round up), in [0, 360).
export function snapTarget(angle, detents) {
  const pitch = 360 / detents;
  const k = Math.floor(angle / pitch + 0.5);
  return (((k % detents) + detents) % detents) * pitch;
}

// The signed distance from the shaft to the target by the shortest arc, degrees in (-180, 180]; an
// exact half turn goes clockwise (positive).
export function shortestArc(shaft, target) {
  const d = ((((target - shaft + 180) % 360) + 360) % 360) - 180;
  return d <= -180 + 1e-9 ? 180 : d;
}

// Is a contact closed at `u` cycles (the shaft's angle over the pitch)? A is closed from 1/8 to 5/8 of
// a cycle, B from 3/8 to 7/8; half open at the start, as the edges are counted in `advance`.
export function closedAt(u, channel) {
  const f = u - Math.floor(u);
  const [from, to] = channel === 'a' ? [EDGES[0], EDGES[2]] : [EDGES[1], EDGES[3]];
  return f >= from && f < to;
}

// The state after `h` seconds. s: { shaft (°, in [0, 360)), ageA, ageB (s since the contact last
// changed) }; p: { target (°), speed (°/s), pitch (°) }. With no `h` (a DC solve) the shaft is at the
// target, at rest.
export function advance(s, h, p) {
  if (!(h > 0)) return { shaft: p.target, ageA: QUIET, ageB: QUIET };
  const delta = shortestArc(s.shaft, p.target);
  const travel = Math.min(Math.abs(delta), p.speed * h);
  const arrived = travel >= Math.abs(delta) - 1e-12;
  const move = Math.sign(delta) * (arrived ? Math.abs(delta) : travel);
  const next = { shaft: arrived ? p.target : (((s.shaft + move) % 360) + 360) % 360, ageA: s.ageA + h, ageB: s.ageB + h };
  if (move === 0) return next;
  // The contacts that changed, and when: the last edge of each one crossed during the step.
  const u0 = s.shaft / p.pitch;
  const u1 = u0 + move / p.pitch;
  const [lo, hi] = [Math.min(u0, u1), Math.max(u0, u1)];
  const first = Math.floor((lo - EDGES[0]) / 0.25) + 1;
  const last = Math.floor((hi - EDGES[0]) / 0.25);
  const crossed = { a: null, b: null };
  for (let j = first; j <= last; j++) {
    const at = EDGES[0] + 0.25 * j;
    const t = (Math.abs(at - u0) * p.pitch) / p.speed;
    const channel = j % 2 === 0 ? 'a' : 'b';
    if (crossed[channel] === null || t > crossed[channel]) crossed[channel] = t;
  }
  for (const channel of ['a', 'b']) {
    if (closedAt(u0, channel) === closedAt(u1, channel)) continue;
    next[channel === 'a' ? 'ageA' : 'ageB'] = h - (crossed[channel] ?? h);
  }
  return next;
}

// What the two contacts show: closed (to ground) or open. With `bounce` (seconds) each change gives
// three edges: the new level for the first third of it, the old one for the second, the new again.
export function contacts(s, p) {
  const u = s.shaft / p.pitch;
  const shown = (channel, age) => {
    const level = closedAt(u, channel);
    if (!(p.bounce > 0) || age >= p.bounce) return level;
    return age < p.bounce / 3 ? level : age < (2 * p.bounce) / 3 ? !level : level;
  };
  return { a: shown('a', s.ageA), b: shown('b', s.ageB) };
}

// Which way the shaft is turning now: 1 clockwise, -1 counter-clockwise, 0 still.
export function direction(s, p) {
  const d = shortestArc(s.shaft, p.target);
  return Math.abs(d) > 1e-9 ? Math.sign(d) : 0;
}

// The click the shaft is nearest to (0 … detents - 1).
export const clickOf = (shaft, detents) => (((Math.round(shaft / (360 / detents)) % detents) + detents) % detents);

// The step the element needs: short while the shaft moves or a contact is still bouncing, none at rest.
export function neededStep(s, p) {
  const moving = Math.abs(shortestArc(s.shaft, p.target)) > 1e-9;
  const bouncing = p.bounce > 0 && (s.ageA < p.bounce || s.ageB < p.bounce);
  if (!moving && !bouncing) return null;
  const quarter = p.pitch / 4 / p.speed;
  return Math.min(quarter / ENCODER.stepsPerQuarter, p.bounce > 0 ? p.bounce / 20 : Infinity);
}

// The two contacts, CLK and DT each to GND: a small resistance while closed, nothing while open. They
// stamp the state at the END of the step being solved (`ahead`), and the shaft and the ages are the
// memory the engine carries across a control's change (`state` in the device).
function coreElement({ clk, dt, gnd }, m) {
  const g = 1 / ENCODER.contact;
  return {
    nodes: [clk, dt, gnd],
    links: [[clk, gnd], [dt, gnd]],
    shaft: m.target,
    ageA: QUIET,
    ageB: QUIET,
    ahead(x, ctx = {}) {
      return advance(this, ctx.h, m);
    },
    closed(x, ctx) {
      return contacts(this.ahead(x, ctx), m);
    },
    stamp(st, x, ctx = {}) {
      const c = this.closed(x, ctx);
      if (c.a) st.conductance(clk, gnd, g);
      if (c.b) st.conductance(dt, gnd, g);
      return false;
    },
    // Into the element at each node, in `nodes` order.
    currents(x, ctx = {}) {
      const c = this.closed(x, ctx);
      const ia = c.a ? g * (volt(x, clk) - volt(x, gnd)) : 0;
      const ib = c.b ? g * (volt(x, dt) - volt(x, gnd)) : 0;
      return [ia, ib, -(ia + ib)];
    },
    accept(x, ctx = {}) {
      Object.assign(this, this.ahead(x, ctx));
    },
    maxStep() {
      return neededStep(this, m);
    },
    // The time between two edges: the shortest that matters (the page steps in real time by it).
    span: () => m.pitch / 4 / m.speed,
  };
}

export const encoder = {
  types: ['rotary-encoder'],
  kind: 'ENC',
  // The shaft and the ages survive a slider elsewhere (engine.js carries `state`).
  state: ['shaft', 'ageA', 'ageB'],
  senses: ['angle'],
  params(part, c) {
    const e = part.def.electrical;
    const names = part.pinNames;
    const alone = (name) => (c.members?.[part.holes[names.indexOf(name)]?.node] ?? []).every((id) => id === part.id);
    const env = c?.env?.('angle');
    return {
      angle: env === undefined ? (e.angle ?? 0) : env,
      detents: e.detents,
      pulses: e.pulses,
      speed: e.speed,
      bounce: e.bounce,
      pressed: e.pressed,
      swPullup: e.swPullup,
      // The pull-ups hang from `+`: with it wired nowhere the outputs float.
      unfed: alone('+') && !(alone('CLK') && alone('DT')),
    };
  },
  controls: (p) => ({
    angle: { min: 0, max: 360, limit: [0, 360], scale: 'linear', unit: '°', step: 360 / p.detents, value: p.angle },
    pressed: { scale: 'momentary', value: Boolean(p.pressed) },
  }),
  set(p, field, value) {
    if (field === 'angle') return { ...p, angle: Number(value) };
    if (field === 'pressed') return { ...p, pressed: Boolean(value) };
    return null;
  },
  sense: (p, field, value) => (field === 'angle' ? { ...p, angle: Number(value) } : null),
  elements(p, h) {
    const [clk, dt, sw, plus, gnd] = ['CLK', 'DT', 'SW', '+', 'GND'].map((name) => h.pin(name));
    const pitch = 360 / p.detents;
    const m = { target: snapTarget(p.angle, p.detents), speed: p.speed, pitch, bounce: p.bounce };
    const pullups = [clk, dt, ...(p.swPullup ? [sw] : [])].map((node) => ({ node, el: h.add(resistor(plus, node, ENCODER.pullup)) }));
    const main = h.add(coreElement({ clk, dt, gnd }, m));
    const press = p.pressed ? h.add(resistor(sw, gnd, ENCODER.contact)) : null;
    return { main, pullups, press, motion: m };
  },
  read(entry, h) {
    const at = (name) => h.volt(entry.pins.find((x) => x.name === name).index);
    const now = entry.main.ahead(h.x, h.ctx ?? {});
    const shown = contacts(now, entry.motion);
    const [ia, ib] = entry.main.currents(h.x, h.ctx ?? {});
    const isw = entry.press ? entry.press.currents(h.x, h.ctx)[0] : 0;
    const pull = { CLK: 0, DT: 0, SW: 0 };
    const names = { [entry.pins.find((x) => x.name === 'CLK').index]: 'CLK', [entry.pins.find((x) => x.name === 'DT').index]: 'DT', [entry.pins.find((x) => x.name === 'SW').index]: 'SW' };
    for (const { node, el } of entry.pullups) pull[names[node]] = el.currents(h.x, h.ctx)[0];
    const gnd = at('GND');
    const plus = at('+') - gnd;
    return {
      shaft: now.shaft,
      target: entry.motion.target,
      click: clickOf(now.shaft, entry.detents),
      detents: entry.detents,
      direction: direction(now, entry.motion),
      closed: { CLK: shown.a, DT: shown.b, SW: Boolean(entry.pressed) },
      vclk: at('CLK') - gnd,
      vdt: at('DT') - gnd,
      vsw: at('SW') - gnd,
      vplus: plus,
      // The current each contact carries to GND, and what each pull-up gives it.
      contacts: { CLK: ia, DT: ib, SW: isw },
      current: Math.max(Math.abs(ia), Math.abs(ib), Math.abs(isw)),
      pressed: entry.pressed,
      angle: entry.angle,
      unfed: entry.unfed,
      currents: { CLK: ia - pull.CLK, DT: ib - pull.DT, SW: isw - pull.SW, '+': pull.CLK + pull.DT + pull.SW, GND: -(ia + ib + isw) },
      power: plus * (pull.CLK + pull.DT + pull.SW),
    };
  },
  limits(entry, r) {
    const out = [
      stress('SIM_OVER_CURRENT', 'current', r.current, ENCODER.maxCurrent, 'A'),
      stress('SIM_SWITCH_VOLTAGE', 'voltage', Math.max(Math.abs(r.vclk), Math.abs(r.vdt), Math.abs(r.vsw)), ENCODER.maxVoltage, 'V'),
    ];
    if (r.unfed) out.push(note('info', 'SIM_ENCODER_FLOATING', { part: entry.id }));
    return out;
  },
  lines(p, h) {
    const word = (open, v) => `${h.t(open ? 'sim.encoder.open' : 'sim.encoder.closed')} · ${h.f(v, 'V')}`;
    return [
      h.raw(`encoder.${p.direction > 0 ? 'cw' : p.direction < 0 ? 'ccw' : 'still'}`, h.t(`sim.encoder.${p.direction > 0 ? 'cw' : p.direction < 0 ? 'ccw' : 'still'}`)),
      h.q('encoder.shaft', h.t('sim.encoder.shaft', { angle: String(Math.round(p.shaft * 10) / 10).replace('.', h.decimal), click: p.click, detents: p.detents })),
      h.q('encoder.clk', word(!p.closed.CLK, p.vclk)),
      h.q('encoder.dt', word(!p.closed.DT, p.vdt)),
      h.q('encoder.sw', `${h.t(p.pressed ? 'sim.encoder.pressed' : 'sim.encoder.released')} · ${h.f(p.vsw, 'V')}`),
      h.q('encoder.plus', h.f(p.vplus, 'V')),
    ];
  },
  tag: (r) => ({ label: '', value: r.current, key: 'current' }),
  scope: (r) => ({ v: { label: 'CLK', value: r.vclk }, i: null }),
};
