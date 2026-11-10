// An ultrasonic distance module (HC-SR04): a state machine with a clock of its own and a push-pull
// ECHO (models.js ULTRASONIC, docs/en/ultrasonic-sensor.md):
//
//   idle    waiting for TRIG; TRIG held high (2.0 V or more) for 10 µs or longer arms it, and its fall
//           starts the measurement (a shorter pulse is not taken)
//   burst   250 µs: eight 40 kHz cycles leave the T capsule
//   echo    ECHO high for the round trip, 2·d / v (v = 331.3 + 0.606·T m/s), when 2 ≤ d ≤ 400 cm;
//           38 ms when nothing answers (out of range, or the supply under 4.5 V)
//   A TRIG while it measures is ignored. Then idle again.
//
// As the PIR's (pir.js), the machine is a pure function (`sonarAdvance`), the element keeps its memory
// in `state` (carried across a rebuild: a slider elsewhere does not restart a measurement), advances
// it in `accept(x, { h })` and stamps ECHO for the state at the END of the step being solved, so a
// program reads ECHO's edges in the steps that end on them. TRIG is read from the voltages being
// solved: in the step that follows its fall it is already low. `until()` tells the engine when the
// next edge comes, so engine.advance ends a step exactly there and pulseIn measures the round trip
// to the microsecond (docs/en/microcontrollers.md).
//
// The reading: the phase in words, the distance it sees, the echo's width and the distance that
// width means (width / 58 µs per cm), ECHO and TRIG, the supply and its current. Stresses: the supply
// over 5.5 V or reversed, ECHO over 20 mA; note: under 4.5 V.

import { ULTRASONIC as U } from '../models.js';
import { stress, note, q, volt } from './shared.js';

export const OFF = 0;
export const IDLE = 1;
export const BURST = 2;
export const ECHO = 3;
const PHASES = ['off', 'idle', 'burst', 'echo'];
const EPS = 1e-9;

// The speed of sound (m/s) at T °C.
export const soundSpeed = (temperature) => U.speed[0] + U.speed[1] * temperature;
// How long ECHO stays high (s) for what the module sees: the round trip, or no echo.
export function echoWidth({ distance, temperature }, vcc = U.currentAt) {
  if (vcc < U.minSupply || !(distance >= U.range[0] && distance <= U.range[1])) return U.noEcho;
  return (2 * distance) / 100 / soundSpeed(temperature);
}

// The memory after `h` seconds: { phase, clock, width }. `clock`: time in the phase (in idle, how long
// TRIG has been high); `width`: the echo of this measurement, fixed when the burst ends. `trig`: TRIG
// high during the step; `vcc`: the supply; `p`: { distance, temperature }.
export function sonarAdvance({ phase, clock, width }, h, trig, vcc, p) {
  if (vcc < U.minRun) return { phase: OFF, clock: 0, width: 0 };
  if (phase === OFF) [phase, clock] = [IDLE, 0];
  let left = h;
  for (let turn = 0; turn < 4; turn++) {
    if (phase === IDLE) {
      if (trig) return { phase, clock: clock + left, width };
      // TRIG fell at the start of this step: armed, the burst starts there; a short pulse is let go.
      if (clock < U.trigMin - EPS) return { phase, clock: 0, width };
      [phase, clock] = [BURST, 0];
      continue;
    }
    if (phase === BURST) {
      if (clock + left < U.burst - EPS) return { phase, clock: clock + left, width };
      left = Math.max(0, clock + left - U.burst);
      [phase, clock, width] = [ECHO, 0, echoWidth(p, vcc)];
      continue;
    }
    if (clock + left < width - EPS) return { phase, clock: clock + left, width };
    left = Math.max(0, clock + left - width);
    [phase, clock] = [IDLE, 0];
    // What is left of the step: TRIG high in it counts from ECHO's fall.
    if (!trig) return { phase, clock: 0, width };
  }
  return { phase, clock, width };
}

// Seconds to the next edge of the machine (the end of the burst or of the echo), or null. Armed (TRIG
// high for 10 µs), the burst's end counts from now: TRIG falls when the program next writes it.
// Announced once per arming: TRIG held high past the burst's length (a button on it) asks for no
// more landings, and its fall is then seen to a step.
export function sonarUntil({ phase, clock, width }) {
  if (phase === IDLE) return clock >= U.trigMin - EPS && clock < U.trigMin + U.burst ? U.burst : null;
  if (phase === BURST) return Math.max(0, U.burst - clock);
  if (phase === ECHO) return Math.max(0, width - clock);
  return null;
}

function sonarCore({ echo, vcc, gnd, trig }, p) {
  const g = 1 / U.outputResistance;
  const load = (phase) => (phase === BURST || phase === ECHO ? U.workCurrent : U.idleCurrent) / U.currentAt;
  return {
    nodes: [echo, vcc, gnd, trig],
    links: [
      [echo, vcc],
      [echo, gnd],
      [vcc, gnd],
    ],
    phase: IDLE,
    clock: 0,
    width: 0,
    ahead(x, ctx) {
      const supply = volt(x, vcc) - volt(x, gnd);
      return sonarAdvance(this, ctx.h ?? 0, volt(x, trig) - volt(x, gnd) >= U.trigThreshold, supply, p);
    },
    stamp(st, x, ctx) {
      const now = this.ahead(x, ctx).phase;
      // Off, ECHO is high impedance and the module takes nothing.
      if (now === OFF) return false;
      st.conductance(vcc, gnd, load(now));
      st.conductance(echo, now === ECHO ? vcc : gnd, g);
      return false;
    },
    // Into the element at each node, in `nodes` order.
    currents(x, ctx = {}) {
      const now = this.ahead(x, ctx).phase;
      if (now === OFF) return [0, 0, 0, 0];
      const vs = volt(x, vcc) - volt(x, gnd);
      const toVcc = now === ECHO ? g * (volt(x, echo) - volt(x, vcc)) : 0;
      const toGnd = now === ECHO ? 0 : g * (volt(x, echo) - volt(x, gnd));
      const own = load(now) * vs;
      return [toVcc + toGnd, own - toVcc, -own - toGnd, 0];
    },
    accept(x, ctx = {}) {
      Object.assign(this, this.ahead(x, ctx));
    },
    // When its next edge comes: engine.advance ends a step there.
    until() {
      return sonarUntil(this);
    },
    // The page's pace when nothing else keeps time (TRIG from a button): the datasheet's measuring cycle.
    span: () => U.cycle,
  };
}

export const ultrasonic = {
  types: ['ultrasonic-sensor'],
  kind: 'SONAR',
  // A measurement under way survives a slider elsewhere (engine.js carries `state`).
  state: ['phase', 'clock', 'width'],
  senses: ['distance', 'temperature'],
  params(part, c) {
    const e = part.def.electrical;
    const at = (field) => c?.env?.(field) ?? e[field];
    return { part: e.part, distance: at('distance'), temperature: at('temperature') };
  },
  controls: (p) => ({ distance: { min: U.range[0], max: U.range[1], limit: [0, 1000], scale: 'linear', unit: 'cm', step: 1, value: p.distance } }),
  set: (p, field, value) => (field === 'distance' || field === 'temperature' ? { ...p, [field]: value } : null),
  elements(p, h) {
    const [vcc, trig, echo, gnd] = ['VCC', 'TRIG', 'ECHO', 'GND'].map((name) => h.pin(name));
    return { main: h.add(sonarCore({ echo, vcc, gnd, trig }, p)) };
  },
  read(entry, h) {
    const at = (name) => h.volt(entry.pins.find((p) => p.name === name).index);
    const now = entry.main.ahead(h.x, h.ctx ?? {});
    const [iecho, ivcc, ignd] = entry.main.currents(h.x, h.ctx ?? {});
    const vcc = at('VCC') - at('GND');
    const echo = at('ECHO') - at('GND');
    // The echo of the measurement under way, else the one it would give now.
    // Off (under 2.5 V) it measures nothing: no width at all.
    const width = now.phase === OFF ? null : now.phase === ECHO ? now.width : echoWidth(entry, vcc);
    const left = now.phase === BURST ? U.burst - now.clock : now.phase === ECHO ? now.width - now.clock : null;
    return {
      state: PHASES[now.phase],
      left: left == null ? null : Math.max(0, left),
      length: now.phase === BURST ? U.burst : now.phase === ECHO ? now.width : null,
      distance: entry.distance,
      temperature: entry.temperature,
      speed: soundSpeed(entry.temperature),
      inRange: entry.distance >= U.range[0] && entry.distance <= U.range[1],
      width,
      noEcho: width != null && width >= U.noEcho - EPS,
      means: width == null ? null : width / 58e-6,
      vcc,
      vecho: echo,
      vtrig: at('TRIG') - at('GND'),
      current: ivcc,
      echoCurrent: -iecho,
      currents: { VCC: ivcc, TRIG: 0, ECHO: iecho, GND: ignd },
      power: vcc * ivcc + echo * iecho,
    };
  },
  limits(entry, r) {
    // The supply's limit is a warning, not a stress: its usual 5 V would read as near 5.5 V.
    const out = [
      stress('SIM_REVERSE_VOLTAGE', 'reverse', -r.vcc, U.maxReverse, 'V', { param: 'voltage' }),
      stress('SIM_OVER_CURRENT', 'current', Math.abs(r.echoCurrent), U.maxCurrent, 'A'),
    ];
    if (r.vcc > U.maxSupply) out.push(note('warning', 'SIM_IC_SUPPLY', { part: entry.id, voltage: q(r.vcc, 'V'), max: q(U.maxSupply, 'V') }));
    if (r.vcc > 0.5 && r.vcc < U.minSupply) out.push(note('warning', 'SIM_MODULE_LOW_SUPPLY', { part: entry.id, voltage: q(r.vcc, 'V'), min: q(U.minSupply, 'V') }));
    return out;
  },
  lines(p, h) {
    const cm = (v) => `${String(Math.round(v * 10) / 10).replace('.', h.decimal)} cm`;
    return [
      h.raw(`sonar.${p.state}`, h.t(`sim.sonar.${p.state}`, { time: p.left == null ? '' : h.f(p.left, 's') })),
      h.q('sonar.distance', p.inRange ? cm(p.distance) : h.t('sim.sonar.outOfRange', { distance: cm(p.distance) })),
      // Off it measures nothing; under 4.5 V it hears no echo.
      ...(p.width == null ? [] : [h.q('sonar.width', p.noEcho ? h.t('sim.sonar.noEcho', { time: h.f(p.width, 's') }) : `${h.f(p.width, 's')} → ${cm(p.means)}`)]),
      h.q('sonar.speed', `${String(Math.round(p.speed * 10) / 10).replace('.', h.decimal)} m/s · ${String(Math.round(p.temperature * 10) / 10).replace('.', h.decimal)} °C`),
      h.q('sonar.vecho', h.f(p.vecho, 'V')),
      h.q('sonar.vtrig', h.f(p.vtrig, 'V')),
      h.q('sonar.vcc', h.f(p.vcc, 'V')),
      h.q('sonar.own', h.f(p.current, 'A')),
    ];
  },
  tag: (r) => ({ label: 'VCC', value: Math.abs(r.current), key: 'sonar.own' }),
  scope: (r) => ({ v: { label: 'ECHO', value: r.vecho }, i: null }),
};
