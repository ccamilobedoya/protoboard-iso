// A small DC motor (Mabuchi RE-140RA), from first principles:
//   V = R·I + L·dI/dt + k·ω        (the armature: its resistance, its inductance, the back-EMF)
//   J·dω/dt = k·I − b·ω − T_load   (the shaft: the torque k·I against friction and a load)
// as MNA elements: a resistor and an inductor in series with an ideal gyrator (../mna.js motorCore)
// whose other side is the shaft as a node of its own, its voltage the speed ω in rad/s: there the
// rotor's inertia J is a capacitor to ground, the friction b a conductance, and the load a brake (a
// torque against the turning, which holds a shaft it is stronger than). Linear but for the brake, so
// the start-up and the speed's time constant come out of the same backward Euler as every other part.
//
// R, k and b come from the datasheet's points (motorConstants; ../models.js MOTORS), J and L are the
// kit's figures. The reading has the speed (rad/s and r/min), the current, the back-EMF, the torque, the
// load and the shaft's angle (the page turns its notch by it). Stresses: the voltage over the top of
// its range, and a stall: held still by its load it draws its stall current for as long as it is held,
// against the current it is meant to run at (its maximum-efficiency current), which heats its winding.
// Starting from rest it passes through ω = 0 too, but then its torque accelerates it: only a shaft
// held at rest by the load counts.

import { resistor, inductor as inductorEl, capacitor, motorCore, brake } from '../mna.js';
import { MOTORS } from '../models.js';
import { stress, q } from './shared.js';

const RPM = 60 / (2 * Math.PI);
const SLIP = 1; // rad/s: how fast a held shaft still creeps under the brake (about 10 r/min)

// The model from the datasheet's points at the nominal voltage V: R = V / I_stall,
// k = (V − R·I_noload) / ω_noload, b = k·I_noload / ω_noload.
export function motorConstants(m) {
  const V = m.nominal;
  const w0 = m.noLoad.rpm / RPM;
  const R = V / m.stall.current;
  const k = (V - R * m.noLoad.current) / w0;
  return { R, k, b: (k * m.noLoad.current) / w0, J: m.inertia, L: m.inductance };
}

// Its steady speed with no load at a voltage, rad/s: k·V / (k² + R·b).
const noLoadSpeed = (c, v) => (c.k * v) / (c.k * c.k + c.R * c.b);

export const motor = {
  types: ['motor'],
  kind: 'MOT',
  params(part) {
    const e = part.def.electrical;
    const model = { ...MOTORS[e.part], ...part.raw.model };
    return { part: e.part, load: e.load, model, ...motorConstants(model) };
  },
  // The load on its shaft, in mN·m, up to a little over the stall torque it has at its nominal voltage.
  controls: (p) => ({ load: { min: 0, max: Math.round(p.k * p.model.stall.current * 1.5e4) / 10, limit: [0, 100], scale: 'linear', unit: 'mN·m', step: 0.05, value: p.load } }),
  set: (p, field, value) => (field === 'load' ? { ...p, load: value } : null),
  elements(p, h) {
    const [m1, m2, w] = [h.inner(), h.inner(), h.inner()];
    h.add(resistor(h.pin('+'), m1, p.R));
    h.add(inductorEl(m1, m2, p.L));
    const core = h.add(motorCore(m2, h.pin('-'), w, p.k));
    const mass = h.add(capacitor(w, -1, p.J));
    const friction = h.add(resistor(w, -1, 1 / p.b));
    const hold = h.add(brake(w, p.load * 1e-3, SLIP));
    return { core, mass, friction, hold, shaft: w };
  },
  read(entry, h) {
    const pin = (name) => entry.pins.find((x) => x.name === name).index;
    const v = h.volt(pin('+')) - h.volt(pin('-'));
    const i = entry.core.currents(h.x)[0];
    const omega = h.volt(entry.shaft);
    const torque = entry.k * i;
    const load = entry.hold.currents(h.x)[0];
    // J·dω/dt: what is left of the torque to speed the shaft up (the inertia's current).
    const accelerating = entry.mass.currents(h.x, h.ctx)[0];
    const free = noLoadSpeed(entry, Math.abs(v));
    const held = Math.abs(torque) > 1e-6 && Math.abs(accelerating) < 0.1 * Math.abs(torque) && Math.abs(omega) < 0.05 * free;
    const state = Math.abs(v) < 0.05 && Math.abs(omega) < SLIP ? 'off' : held ? 'stalled' : Math.abs(accelerating) > 0.1 * Math.abs(torque) && Math.abs(accelerating) > 1e-7 ? 'changing' : 'running';
    return { voltage: v, current: i, power: v * i, omega, rpm: omega * RPM, emf: entry.k * omega, torque, load, output: load * omega, angle: entry.core.angle, state, currents: { '+': i, '-': -i } };
  },
  limits(entry, r) {
    const m = entry.model;
    return [stress('SIM_MOTOR_VOLTAGE', 'voltage', Math.abs(r.voltage), m.range[1], 'V'), stress('SIM_MOTOR_STALL', 'current', r.state === 'stalled' ? Math.abs(r.current) : 0, m.efficient.current, 'A')];
  },
  lines(p, h) {
    const lines = [
      h.raw(`motor.${p.state}`, h.t(`sim.motor.${p.state}`)),
      h.q('motor.speed', `${Math.round(p.rpm)} r/min`),
      h.q('current', h.f(p.current, 'A')),
      h.q('motor.emf', h.f(p.emf, 'V')),
      h.q('voltage', h.f(p.voltage, 'V')),
      h.q('motor.torque', h.f(p.torque, 'N·m')),
    ];
    if (Math.abs(p.load) > 1e-9) lines.push(h.q('motor.load', h.f(Math.abs(p.load), 'N·m')));
    lines.push(h.q('power', h.f(p.power, 'W')));
    return lines;
  },
  tag: (r) => ({ label: '', value: Math.abs(r.current), key: 'current' }),
  scope: (r) => ({ v: { label: 'V', value: r.voltage }, i: { label: 'I', value: r.current } }),
  // An equivalent: its resistance and inductance and a source of the back-EMF it has now (Falstad's
  // own DC motor takes other constants).
  falstad(d, f) {
    const p = d.params;
    const [plus, minus] = ['+', '-'].map((name) => f.pin(d, name));
    const emf = f.reading?.parts?.[d.id]?.emf ?? 0;
    const [m1, m2] = [f.inner(d.id), f.inner(d.id)];
    f.resistor(plus, m1, p.R);
    f.inductor(m1, m2, p.L);
    f.voltage(minus, m2, emf);
    f.note('falstad.motor', { part: d.id, voltage: q(emf, 'V') });
  },
};
