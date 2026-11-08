// Modules that react in time: the HC-SR501 PIR motion sensor and the TTP223 capacitive touch sensor.
// Both stand in the breadboard on three pins and read the environment (`motion`, `touch`); what they
// do in time (a delay, a warm-up, a response, a toggle) is their device's state machine
// (src/sim/devices/pir.js and touch.js, docs/en/timed-sensors.md).
//
// The defaults are the real modules' with the trimmers and jumpers as they leave the factory; their
// numbers are in src/sim/models.js (PIR, TOUCH). Kept here only as the limits a circuit may ask for.

const PIR_DELAY = [0.3, 600]; // s: the trimmer's 3 s to 5 min, and less for an example that must not wait
const flag = (v) => v === true || v === 1 || v === '1' || v === 'true';

// fields: delay (s, default 5: the trimmer Tx), sensitivity (0…1, default 0.5: informative, the
//         model has no range), mode ('H' repeats while there is motion, default; 'L' ignores it
//         while OUT is high), warmup (s, default 30; 0 skips the warm-up), motion (true: its own
//         value of the field `motion`, instead of following the environment)
// Pins VCC, OUT, GND as the module prints them, left to right with its back toward you.
export const pirSensor = {
  type: 'pir-sensor',
  family: 'sensor',
  pins: ['VCC', 'OUT', 'GND'],
  resolve(part) {
    const delay = Number(part.delay ?? 5);
    if (!(delay >= PIR_DELAY[0] && delay <= PIR_DELAY[1])) return { error: { code: 'BAD_VALUE', params: { value: `delay ${part.delay}` } } };
    const sensitivity = Number(part.sensitivity ?? 0.5);
    if (!(sensitivity >= 0 && sensitivity <= 1)) return { error: { code: 'BAD_VALUE', params: { value: `sensitivity ${part.sensitivity}` } } };
    const mode = String(part.mode ?? 'H').toUpperCase();
    if (mode !== 'H' && mode !== 'L') return { error: { code: 'UNKNOWN_KIND', params: { kind: String(part.mode), options: 'H, L' } } };
    const warmup = Number(part.warmup ?? 30);
    if (!(warmup >= 0 && warmup <= 120)) return { error: { code: 'BAD_VALUE', params: { value: `warmup ${part.warmup}` } } };
    return {
      package: 'pir-module',
      pinNames: pirSensor.pins,
      params: {},
      label: { text: 'HC-SR501' },
      electrical: { kind: 'PIR', part: 'HC-SR501', delay, sensitivity, mode, warmup, motion: flag(part.motion) },
    };
  },
};

// fields: mode ('momentary', default: SIG follows the touch; 'toggle': each touch flips it),
//         activeLow (true: SIG is low while touched, or while a toggle is on; default false),
//         fast (true: the 60 ms mode instead of the 220 ms low-power one; default false),
//         touch (true: its own value of the field `touch`, instead of following the environment)
// Pins SIG (printed I/O), VCC, GND as the module prints them, left to right with its pad toward you.
export const touchSensor = {
  type: 'touch-sensor',
  family: 'sensor',
  pins: ['SIG', 'VCC', 'GND'],
  resolve(part) {
    const mode = String(part.mode ?? 'momentary').toLowerCase();
    if (mode !== 'momentary' && mode !== 'toggle') return { error: { code: 'UNKNOWN_KIND', params: { kind: String(part.mode), options: 'momentary, toggle' } } };
    return {
      package: 'touch-module',
      pinNames: touchSensor.pins,
      params: {},
      label: { text: 'TTP223' },
      electrical: { kind: 'TCH', part: 'TTP223', mode, activeLow: flag(part.activeLow), fast: flag(part.fast), touch: flag(part.touch) },
    };
  },
};
