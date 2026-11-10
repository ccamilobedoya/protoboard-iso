// Rotary encoder EC11 on its KY-040 module (family F7, docs/en/rotary-encoder.md): a knob that gives
// two square waves a quarter of a cycle apart, so a program can tell how far and which way it turned,
// and a push switch on the shaft. The board stands on its five pins in one row of the breadboard.
//
// fields: part ('KY-040', the default), pulses and detents (per revolution; only 20 and 20, the usual
//   module's, are modelled), speed (°/s, how fast the shaft follows the environment's angle; default
//   360), bounce (ms, the contacts' chatter at each change, deterministic; default 0), pressed (the
//   push switch is held down), swPullup (the 10 kΩ from + to SW; some clones omit it; default true),
//   angle (its own target, degrees: wins over the environment's, as in every sensor)
// Pins CLK (channel A), DT (channel B), SW, +, GND as the module prints them.

import { lookupPartNumber } from '../db.js';

// The usual module's: 20 pulses and 20 detents a turn, a brisk human turn of 360 °/s (src/sim/models.js ENCODER).
const USUAL = { pulses: 20, detents: 20, speed: 360, bounce: 0 };

const flag = (v) => v === true || v === 1 || v === '1' || v === 'true';
const bad = (field, v) => ({ error: { code: 'BAD_VALUE', params: { value: `${field} ${v}` } } });

export const rotaryEncoder = {
  type: 'rotary-encoder',
  family: 'sensor',
  pins: ['CLK', 'DT', 'SW', '+', 'GND'],
  resolve(part) {
    const found = part.part === undefined ? { number: 'KY-040', entry: { type: 'rotary-encoder' } } : lookupPartNumber(part.part);
    if (!found || found.entry.type !== 'rotary-encoder') return { error: { code: 'UNKNOWN_PART_NUMBER', params: { number: `${part.part} (KY-040)`, type: 'rotary-encoder' } } };
    // Only the usual 20 pulses and 20 detents: another pair would give a wrong wave, so it is refused.
    for (const field of ['pulses', 'detents']) if (part[field] !== undefined && Number(part[field]) !== USUAL[field]) return bad(field, part[field]);
    const speed = Number(part.speed ?? USUAL.speed);
    if (!(speed > 0 && speed <= 3600)) return bad('speed', part.speed);
    const bounce = Number(part.bounce ?? USUAL.bounce);
    if (!(bounce >= 0 && bounce <= 20)) return bad('bounce', part.bounce);
    const angle = part.angle === undefined ? undefined : Number(part.angle);
    if (angle !== undefined && !(angle >= 0 && angle <= 360)) return bad('angle', part.angle);
    return {
      package: 'encoder-module',
      pinNames: rotaryEncoder.pins,
      params: { part: 'KY-040', print: rotaryEncoder.pins },
      label: { text: 'KY-040' },
      electrical: { kind: 'ENC', part: 'KY-040', pulses: USUAL.pulses, detents: USUAL.detents, speed, bounce: bounce / 1000, pressed: flag(part.pressed), swPullup: part.swPullup === undefined ? true : flag(part.swPullup), angle },
    };
  },
};
