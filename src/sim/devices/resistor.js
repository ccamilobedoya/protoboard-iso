// Resistor, and the parts that are resistors to the simulator: NTC thermistor, photoresistor and
// the coil of a passive buzzer. Their value comes from the part (temperature, light, coil);
// their readings carry `sensor` (what it senses).

import { resistor as resistorEl } from '../mna.js';
import { RESISTOR_POWER } from '../models.js';
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
export const resistor = { types: ['resistor'], ...resistive };
export const thermistor = { types: ['thermistor'], ...resistive };
export const ldr = { types: ['ldr'], ...resistive };
export const buzzer = { types: ['buzzer'], ...resistive };
