// Resistor, and the parts that are resistors to the simulator: NTC thermistor, photoresistor and
// the coil of a passive buzzer. Their value comes from the part (temperature, light, coil);
// their readings carry `sensor` (what it senses).
// Controls (page sliders): a resistor's value (log, standard E24 values, two decades either
// side); a thermistor's temperature; a photoresistor's light (log).

import { resistor as resistorEl } from '../mna.js';
import { RESISTOR_POWER } from '../models.js';
import { ntcResistance, ldrResistance } from '../../parts/sensors.js';
import { stress, note, twoTerminal, twoTerminalLines, currentTag } from './shared.js';

const resistive = {
  kind: 'R',
  lines: twoTerminalLines,
  tag: currentTag,
  params(part) {
    const e = part.def.electrical;
    const p = { resistance: e.resistance, maxPower: e.maxPower ?? RESISTOR_POWER[String(part.raw.power ?? '1/4').replace(/\s*W$/i, '')] ?? 0.25 };
    if (e.sensor) p.sensor = { ...e.sensor, resistance: e.resistance };
    if (e.buzzer) p.buzzer = true;
    return p;
  },
  elements: (p, h) => ({ main: h.add(resistorEl(h.at(0), h.at(1), p.resistance)) }),
  read(entry, h) {
    const out = twoTerminal(entry, entry.main, h);
    if (entry.sensor) out.sensor = entry.sensor;
    return out;
  },
  limits(entry, r) {
    const out = [];
    if (entry.buzzer && Math.abs(r.current) > 1e-3) out.push(note('info', 'SIM_BUZZER_DC', { part: entry.id, current: { value: Math.abs(r.current), unit: 'A' } }));
    out.push(stress('SIM_OVER_POWER', 'power', r.power, entry.maxPower, 'W'));
    return out;
  },
};
export const resistor = {
  types: ['resistor'],
  ...resistive,
  // The range stays around the value in the circuit file (`nominal`), wherever the slider is.
  controls: (p) => ({ resistance: { min: Math.max(1, (p.nominal ?? p.resistance) / 100), max: Math.min(10e6, (p.nominal ?? p.resistance) * 100), limit: [1e-3, 1e12], scale: 'log', unit: 'Ω', snap: 'E24', value: p.resistance } }),
  set: (p, field, value) => (field === 'resistance' ? { ...p, nominal: p.nominal ?? p.resistance, resistance: value } : null),
};
export const thermistor = {
  types: ['thermistor'],
  ...resistive,
  controls: (p) => ({ temperature: { min: -20, max: 100, limit: [-55, 150], scale: 'linear', unit: '°C', step: 1, value: p.sensor.temperature } }),
  set(p, field, value) {
    if (field !== 'temperature') return null;
    const resistance = ntcResistance(p.sensor, value);
    return { ...p, resistance, sensor: { ...p.sensor, temperature: value, resistance } };
  },
};
export const ldr = {
  types: ['ldr'],
  ...resistive,
  // 0.1 lx (night) to 10 000 lx (daylight in the shade).
  controls: (p) => ({ light: { min: 0.1, max: 10000, limit: [0, 1e6], scale: 'log', unit: 'lx', value: Math.max(0.1, p.sensor.light) } }),
  set(p, field, value) {
    if (field !== 'light') return null;
    const resistance = ldrResistance(p.sensor, value);
    return { ...p, resistance, sensor: { ...p.sensor, light: value, resistance } };
  },
};
export const buzzer = { types: ['buzzer'], ...resistive };
