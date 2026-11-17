// The HC-SR04 ultrasonic distance module (family F5, docs/en/ultrasonic-sensor.md): it stands on its
// four pins and reads the environment's `distance` (and `temperature`, which sets the speed of sound);
// what it does in time (the trigger, the burst, the echo) is its device's state machine
// (src/sim/devices/ultrasonic.js).
//
// fields: part ('HC-SR04', the default and today the only one), distance (cm, its own value of the
//         field: it then does not follow the environment), temperature (°C, likewise; default 20)
// Pins VCC, TRIG, ECHO, GND as the module prints them, left to right with its capsules toward you.

import { lookupPartNumber } from '../db.js';

const bad = (field, v) => ({ error: { code: 'BAD_VALUE', params: { value: `${field} ${v}` } } });

export const ultrasonicSensor = {
  type: 'ultrasonic-sensor',
  family: 'sensor',
  pins: ['VCC', 'TRIG', 'ECHO', 'GND'],
  resolve(part) {
    const found = lookupPartNumber(part.part ?? 'HC-SR04');
    if (!found || found.entry.type !== 'ultrasonic-sensor') return { error: { code: 'UNKNOWN_PART_NUMBER', params: { number: String(part.part), type: 'ultrasonic-sensor' } } };
    const distance = Number(part.distance ?? 50);
    if (!(distance >= 0 && distance <= 1000)) return bad('distance', part.distance);
    const temperature = Number(part.temperature ?? 20);
    if (!(temperature >= -55 && temperature <= 150)) return bad('temperature', part.temperature);
    return {
      package: found.entry.package,
      pinNames: found.entry.pins,
      params: {},
      label: { text: found.number },
      electrical: { kind: 'SONAR', part: found.number, distance, temperature },
    };
  },
};
