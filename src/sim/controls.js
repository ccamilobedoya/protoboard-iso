// Controls: the values a learner may change while the simulation runs (stage 3, phase 5), and
// the stress levels the page shows. No imports outside parts/batteries.js, so the page bundles it.
//
// A control is { field, min, max, scale, unit, value, limit?, step?, snap?, percent? }:
//   min, max the slider's default range (page.controls may choose another one inside `limit`)
//   limit    [lo, hi] what the value may be at all (default [min, max])
//   scale    'log' (resistance, light), 'linear' (voltage, temperature, position, charge) or
//            'momentary' (a push button: true while held)
//   snap     'E24': a log slider stops at standard resistor values
//   percent  shown as a percentage (0…1 → 0…100 %)
// Each device says its own (devices/*: `controls(params)` and `set(params, field, value)`);
// supplies are here. The engine gathers both (engine.controls(), engine.set()).

import { batteryModel, cellVoltage } from '../parts/batteries.js';

export const BENCH_MAX = 30; // volts: a common bench supply (0–30 V)

// What a supply lets you change: a bench supply its voltage; a battery its charge (unless its
// voltage was measured: then the charge says nothing about it); a signal generator its frequency
// and amplitude.
export function supplyControls(s) {
  if (s.generator) {
    const g = s.generator;
    return {
      frequency: { min: 0.1, max: Math.max(10000, g.frequency), limit: [1e-3, 1e6], scale: 'log', unit: 'Hz', value: g.frequency },
      amplitude: { min: 0, max: Math.max(10, g.amplitude), limit: [0, 1000], scale: 'linear', unit: 'V', step: 0.1, value: g.amplitude },
    };
  }
  if (s.battery) {
    if (s.battery.measured) return {};
    return { charge: { min: 0, max: 1, scale: 'linear', unit: '', percent: true, value: s.battery.charge ?? chargeFor(s.battery) } };
  }
  return { voltage: { min: 0, max: Math.max(BENCH_MAX, s.voltage), limit: [0, 1000], scale: 'linear', unit: 'V', step: 0.1, value: s.voltage } };
}

// A new value for a supply (it is changed in place). False if the field is not one of its controls.
export function setSupply(s, field, value) {
  if (s.generator) {
    if (field !== 'frequency' && field !== 'amplitude') return false;
    if (field === 'frequency' && !(value > 0)) return false;
    s.generator = { ...s.generator, [field]: value };
    return true;
  }
  if (field === 'voltage' && !s.battery) {
    s.voltage = value;
    return true;
  }
  if (field === 'charge' && s.battery && !s.battery.measured) {
    const b = s.battery;
    const model = batteryModel({ format: b.format, chemistry: b.chemistry, cells: b.cells, charge: value, capacity: b.capacity * 1000 });
    if (model.error) return false;
    s.battery = model;
    s.voltage = model.emf;
    s.internalResistance = model.resistance;
    return true;
  }
  return false;
}

// A battery with no charge given sits at its nominal voltage: the charge that gives it.
function chargeFor(b) {
  const perCell = b.nominal / b.series;
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2;
    if (cellVoltage(b.chemistry, mid) < perCell) lo = mid;
    else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 100) / 100;
}

// Slider positions are integers 0…SLIDER; these map them to values and back.
export const SLIDER = 1000;
export function fromSlider(c, k) {
  const u = Math.min(1, Math.max(0, k / SLIDER));
  let v = c.scale === 'log' ? c.min * (c.max / c.min) ** u : c.min + (c.max - c.min) * u;
  if (c.snap === 'E24') v = snapE24(v);
  else if (c.step) v = Math.round(v / c.step) * c.step;
  return Math.min(c.max, Math.max(c.min, v));
}
export function toSlider(c, v) {
  const u = c.scale === 'log' ? Math.log(v / c.min) / Math.log(c.max / c.min) : (v - c.min) / (c.max - c.min);
  return Math.round(Math.min(1, Math.max(0, u)) * SLIDER);
}

// Standard resistor values (E24, 5 %): the nearest one on a log scale.
const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1, 10];
export function snapE24(v) {
  if (!(v > 0)) return v;
  const decade = 10 ** Math.floor(Math.log10(v));
  const m = v / decade;
  let best = E24[0];
  for (const e of E24) if (Math.abs(Math.log(e / m)) < Math.abs(Math.log(best / m))) best = e;
  return Number((best * decade).toPrecision(2));
}

// Stress levels (docs/en/live-simulation.md): fine under 80 %, near the limit up to 100 %,
// exceeded above.
export const NEAR = 0.8;
export function stressLevel(ratio) {
  if (!(ratio > NEAR)) return 'fine';
  return ratio > 1 ? 'exceeded' : 'near';
}
