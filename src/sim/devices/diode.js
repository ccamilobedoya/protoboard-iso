// Diodes, Zener diodes and LEDs: a Shockley junction with its series resistance; a Zener also
// breaks down in reverse at Vz. Models per part number (diodes), per Vz (Zener), per colour (LEDs).

import { resistor, junction } from '../mna.js';
import { DIODES, VT, ledModel, zenerModel } from '../models.js';
import { issue, stress, twoTerminal, twoTerminalLines, currentTag } from './shared.js';

const junctionDevice = {
  params(part, c) {
    const e = part.def.electrical;
    const raw = part.raw;
    const model = e.kind === 'LED' ? ledModel(e.color, raw.model) : e.zener ? zenerModel(e.vz, raw.model) : { ...(DIODES[e.part] ?? DIODES['1N4148']), ...raw.model };
    if (e.kind === 'D' && !e.zener && !DIODES[e.part]) c.issues.push(issue('info', 'SIM_DEFAULT_MODEL', { part: part.id, model: '1N4148' }));
    return e.kind === 'LED' ? { model, color: e.color } : { model };
  },
  elements(p, h) {
    const mid = p.model.rs > 0 ? h.inner() : h.at(0);
    if (p.model.rs > 0) h.add(resistor(h.at(0), mid, p.model.rs));
    return { main: h.add(junction(mid, h.at(1), p.model)) };
  },
  lines: twoTerminalLines,
  tag: currentTag,
  falstad(d, f) {
    const { model, color } = d.params;
    const [a, k] = [d.pins[0].node, d.pins[1].node];
    const name = `kit-${d.id}`;
    if (d.kind === 'LED') return f.diode(162, a, k, name, model, [...(LED_RGB[color] ?? LED_RGB.red), model.ratedCurrent]);
    if (!model.vz) return f.diode('d', a, k, name, model);
    // Falstad's breakdown has the steepness of an ideal junction and passes 5 mA at its
    // voltage: set where this model passes 5 mA (series resistance apart). The knee differs.
    f.diode('z', a, k, name, { ...model, bv: model.bv + model.nbv * VT * Math.log(5e-3 / model.ibv) });
    f.note('falstad.zener', { part: d.id });
  },
};

// LED colours for Falstad's drawing (red, green, blue from 0 to 1).
const LED_RGB = { red: [1, 0, 0], orange: [1, 0.5, 0], yellow: [1, 1, 0], green: [0, 1, 0], blue: [0, 0.4, 1], white: [1, 1, 1] };

export const diode = {
  types: ['diode', 'zener'],
  kind: 'D',
  ...junctionDevice,
  read: (entry, h) => twoTerminal(entry, entry.main, h),
  limits(entry, r) {
    const out = [];
    if (entry.model.vz) out.push(stress('SIM_OVER_POWER', 'power', Math.abs(r.power), entry.model.maxPower, 'W'));
    out.push(stress('SIM_OVER_CURRENT', 'current', r.current, entry.model.maxCurrent, 'A'));
    return out;
  },
};

export const led = {
  types: ['led'],
  kind: 'LED',
  ...junctionDevice,
  read(entry, h) {
    const out = twoTerminal(entry, entry.main, h);
    out.brightness = Math.max(0, out.current) / entry.model.ratedCurrent;
    return out;
  },
  limits: (entry, r) => [
    stress('SIM_OVER_CURRENT', 'current', r.current, entry.model.maxCurrent, 'A'),
    stress('SIM_REVERSE_VOLTAGE', 'reverse', -r.voltage, entry.model.maxReverse, 'V', { param: 'voltage' }),
  ],
};
