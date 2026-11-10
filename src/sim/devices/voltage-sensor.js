// Voltage sensor module (30 kΩ / 7.5 kΩ; docs/en/analog-sensors.md): two resistors in series from the
// terminal's VIN to GND with S on their middle, so S = VIN / 5 into a high-impedance reader. The
// board's "−" pin and the terminal's GND are one trace (a milliohm between the two pins), and "+" goes
// nowhere inside. No dynamics and no sensing: the measured voltage is whatever the circuit puts on VIN.
//
// The reading has the input (VIN to GND), S, their ratio and the current the divider takes. Stress: the
// 30 kΩ over 100 mW (a 68 V input). S over a microcontroller's supply is that board's own check
// (SIM_PIN_OVERVOLTAGE, ./mcu.js).

import { resistor } from '../mna.js';
import { VOLTAGE_SENSOR } from '../models.js';
import { stress, q } from './shared.js';

export const voltageSensor = {
  types: ['voltage-sensor'],
  kind: 'VSN',
  params: (part) => ({ part: part.def.electrical.part, model: { ...VOLTAGE_SENSOR, ...part.raw.model } }),
  elements(p, h) {
    const m = p.model;
    return {
      upper: h.add(resistor(h.pin('VIN'), h.pin('S'), m.upper)),
      lower: h.add(resistor(h.pin('S'), h.pin('GND'), m.lower)),
      join: h.add(resistor(h.pin('-'), h.pin('GND'), m.join)),
      // The "+" pin goes nowhere inside: a gigaohm of board leakage keeps it from reading as a floating group.
      idle: h.add(resistor(h.pin('+'), h.pin('GND'), m.leak)),
    };
  },
  read(entry, h) {
    const at = (name) => h.volt(entry.pins.find((p) => p.name === name).index);
    const [vin, vs] = [at('VIN') - at('GND'), at('S') - at('GND')];
    const current = entry.upper.currents(h.x, h.ctx)[0];
    const toS = current - entry.lower.currents(h.x, h.ctx)[0]; // what leaves S into whatever reads it
    const join = entry.join.currents(h.x, h.ctx)[0]; // from "−" into GND
    const idle = entry.idle.currents(h.x, h.ctx)[0];
    const m = entry.model;
    return {
      vin,
      vs,
      ratio: Math.abs(vin) > 0.05 ? vs / vin : m.lower / (m.upper + m.lower),
      current,
      power: current * current * m.upper,
      power30k: current * current * m.upper,
      currents: { VIN: current, S: -toS, '+': idle, '-': join, GND: -current + toS - join - idle },
    };
  },
  limits(entry, r) {
    return [stress('SIM_OVER_POWER', 'power', r.power30k, entry.model.maxPower, 'W')];
  },
  lines(p, h) {
    return [
      h.q('divider.vin', h.f(p.vin, 'V')),
      h.q('divider.vs', h.f(p.vs, 'V')),
      h.q('divider.ratio', `1 : ${String(Math.round((p.ratio > 0 ? 1 / p.ratio : 5) * 100) / 100).replace('.', h.decimal)}`),
      h.q('divider.current', h.f(p.current, 'A')),
    ];
  },
  tag: (r) => ({ label: '', value: Math.abs(r.current), key: 'current' }),
  scope: (r) => ({ v: { label: 'S', value: r.vs }, i: null }),
  falstad(d, f) {
    const m = d.params.model;
    const [vin, s, gnd, minus] = ['VIN', 'S', 'GND', '-'].map((name) => f.pin(d, name));
    f.resistor(vin, s, m.upper);
    f.resistor(s, gnd, m.lower);
    f.resistor(minus, gnd, m.join);
    f.note('falstad.divider', { part: d.id, ratio: q(5, '') });
  },
};
