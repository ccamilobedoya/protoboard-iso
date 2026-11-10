// LM393 sensor modules (family F3, docs/en/sensor-modules.md): one small board with a comparator, its
// trimmer and two LEDs, and a sensing element that differs per part number (src/parts/sensors.js
// SENSOR_MODULES): rain MH-RD, soil YL-69, light LDR-LM393, optical slot SLOT-IR, line follower
// TCRT5000-M, Hall KY-024, vibration SW-420-M, obstacle FC-51, sound KY-037. It stands on its pins in one row.
//
// fields: part (one of the nine, required); threshold (0…1, the trimmer: Vref = threshold · VCC,
//   default 0.5; the KY-037's 0.497, Vref 15 mV under its bias at 5 V); the part's own value for what it senses, which wins over the circuit's environment
//   (docs/en/environment.md): wetness (MH-RD, 0…1 of the comb wet), moisture (YL-69, %), light
//   (LDR-LM393, lx), beam (SLOT-IR, true = blocked), reflectance (TCRT5000-M, FC-51, % of white
//   paper's), distance (TCRT5000-M, FC-51, cm), field (KY-024, G, + = south pole), vibration
//   (SW-420-M, true = shaken), sound (KY-037, dB SPL); SLOT-IR also transmittance (0…1, what the beam keeps through it, default
//   1), slots and duty (an encoder disc on the environment's angle); SW-420-M also seed (its chatter's
//   pattern, default from its id).

import { lookupPartNumber } from '../db.js';
import { SENSOR_MODULES } from '../sensors.js';

// What a part follows when neither it nor the environment says: the environment's own defaults.
const DEFAULTS = { rain: 0, moisture: 30, light: 300, beam: 0, reflectance: 80, distance: 50, field: 0, vibration: 0, sound: 40 };
// Each stimulus: its own name on the part, and the range it may take.
const OWN = { rain: ['wetness', 0, 1], moisture: ['moisture', 0, 100], light: ['light', 0, 1e6], beam: ['beam', 0, 1], reflectance: ['reflectance', 0, 100], distance: ['distance', 0, 1000], field: ['field', -10000, 10000], vibration: ['vibration', 0, 1], sound: ['sound', 0, 140] };
const NAMES = Object.keys(SENSOR_MODULES);

const number = (v) => (typeof v === 'boolean' ? Number(v) : Number(v));
const bad = (field, v) => ({ error: { code: 'BAD_VALUE', params: { value: `${field} ${v}` } } });

export const sensorModule = {
  type: 'sensor-module',
  family: 'sensor',
  pins: null, // from the part number
  resolve(part) {
    const found = lookupPartNumber(part.part);
    if (!found || found.entry.type !== 'sensor-module') return { error: { code: 'UNKNOWN_PART_NUMBER', params: { number: `${part.part} (${NAMES.join(', ')})`, type: 'sensor-module' } } };
    const m = SENSOR_MODULES[found.number];
    const threshold = number(part.threshold ?? m.threshold ?? 0.5);
    if (!(threshold >= 0 && threshold <= 1)) return bad('threshold', part.threshold);
    const stim = {};
    for (const field of m.senses) {
      const [name, lo, hi] = OWN[field];
      const v = part[name] === undefined ? DEFAULTS[field] : number(part[name]);
      if (!(v >= lo && v <= hi)) return bad(name, part[name]);
      stim[field] = v;
    }
    const extra = {};
    for (const [name, lo, hi] of [['transmittance', 0, 1], ['slots', 1, 360], ['duty', 0, 1], ['seed', 0, 2 ** 32]]) {
      if (part[name] === undefined) continue;
      const v = number(part[name]);
      if (!(v >= lo && v <= hi)) return bad(name, part[name]);
      extra[name] = v;
    }
    return {
      package: found.entry.package,
      pinNames: found.entry.pins,
      params: { part: found.number, glyph: m.glyph, print: m.print ?? found.entry.pins },
      label: { text: found.number },
      electrical: { kind: 'SNS', part: found.number, threshold, stim, ...extra },
    };
  },
};
