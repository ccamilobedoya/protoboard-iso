// A board's program running in the simulation (phase M2 of docs/en/microcontrollers.md): the
// JavaScript sketch.js made from the sketch, with the Arduino functions it calls. It runs between
// time steps, as the 555's latch: each accepted step moves its clock, and it goes on until it
// waits (delay) again; what it writes are pin states, what it reads are the voltages of the step
// before. No imports: the page carries it.
//
//   const runner = createRunner(js, board)
//     board: { family, gpio: [numbers wired], read(gpio) → { volts, vdd } | null, vil, vih,
//              adcBits, adcFull, states: { gpio: { mode, level, pull } } (from io) }
//   runner.advance(seconds) → true when a pin changed
//   runner.pins: gpio → { mode, level, pull, pwm: { freq, duty } | null }: a pin with pwm switches
//     in time (the board sets its level at each step from runner.time: levelAt)
//   runner.fastest() → the shortest PWM or tone period now (seconds), or null
//   runner.until() → seconds until it wants to run again (a delay ending, or pulseIn looking at its
//     pin until its timeout), or null; the engine ends a step there (engine.advance's landings), so
//     delayMicroseconds(10) is a pulse of 10 µs and pulseIn measures from the steps that end on edges
//   runner.time, runner.waitingUntil, runner.log (Serial lines), runner.error, runner.notes
//
// pulseIn(pin, value[, timeout µs]) is a generator the sketch calls with yield* (sketch.js): it
// waits in simulated time, looking at its pin at the end of every step (it yields LOOK: "run me at
// the next step"), and measures the pulse between the steps that saw it start and end. Exact when
// what drives the pin says when its edges come (a timed sensor's `until()`), to a step otherwise.
// The wait is bounded by the timeout, clamped to PULSE_IN_MAX (src/limits.js, pulseInMicros).

const BUDGET = 2000; // loop turns or loop() calls per advance before it lets the step go on
const LOG = 40; // Serial lines kept
const LINE_MAX = 1000; // characters kept of one Serial line
const ARRAY_MAX = 100_000; // elements of one array (an ESP32 has 320 KB of RAM)
const MODE = { INPUT: 0, OUTPUT: 1, INPUT_PULLUP: 2, INPUT_PULLDOWN: 3 };
// Analog pin names: GPIO numbers on each family (Arduino-ESP32 and the UNO's core).
const ANALOG = {
  uno: [14, 15, 16, 17, 18, 19],
  esp32: [36, undefined, undefined, 39, 32, 33],
  esp32c3: [0, 1, 2, 3, 4, 5],
};
const BUILTIN_LED = { uno: 13, esp32: 2, esp32c3: 8 };
// analogWrite: the UNO's PWM pins and their frequencies (timer 0 on 5 and 6 runs twice as fast);
// on an ESP32 (Arduino core 3) any output pin, 1 kHz, 8 bits.
const UNO_PWM = { 3: 490, 5: 980, 6: 980, 9: 490, 10: 490, 11: 490 };
const ESP_PWM = 1000;
export const PULSE_IN_MAX = 3_000_000; // µs: the longest pulseIn timeout (Arduino's default is 1 000 000)
const PULSE_IN_DEFAULT = 1_000_000;
// What pulseIn yields to look at its pin again at the end of the next step. An object of the
// runtime's own: a sketch's delay() can only yield numbers.
const LOOK = Object.freeze({ look: true });

// A PWM pin's level at time t: high for the first `duty` of each period.
export const levelAt = (pwm, t) => (pwm.duty >= 1 ? 1 : pwm.duty <= 0 ? 0 : (t * pwm.freq) % 1 < pwm.duty ? 1 : 0);

export function createRunner(js, board) {
  const pins = {};
  for (const [gpio, s] of Object.entries(board.states ?? {})) pins[gpio] = { ...s };
  const pin = (n) => (pins[n] ??= { mode: 'input', level: 0, pull: null, pwm: null });
  const runner = { read: board.read, pins, time: 0, wait: 0, log: [], line: '', error: null, notes: [], changed: false, waitingUntil: 0, looking: null };
  const set = (n, values) => {
    const p = pin(n);
    for (const [k, v] of Object.entries(values)) {
      if (p[k] !== v) {
        p[k] = v;
        runner.changed = true;
      }
    }
  };
  // Read through runner.read: a rebuilt circuit (a control changed) hands the runner its own.
  const volts = (n) => runner.read(n);
  const lastRead = {};
  const ledc = { pins: {}, channels: {} };
  const tones = {}; // pin → time its tone ends
  // A duty of 0 or 1 is a plain level, no wave to step through.
  const pwmOf = (freq, duty) => (duty <= 0 ? { level: 0, pwm: null } : duty >= 1 ? { level: 1, pwm: null } : { pwm: { freq, duty } });
  runner.fastest = () => {
    const periods = Object.values(pins).filter((p) => p.pwm && p.mode === 'output').map((p) => 1 / p.pwm.freq);
    return periods.length ? Math.min(...periods) : null;
  };
  let seed = 1;
  const write = (text) => {
    const parts = (runner.line + text).split('\n').map((p) => p.slice(0, LINE_MAX));
    runner.line = parts.pop();
    runner.log.push(...parts);
    if (runner.log.length > LOG) runner.log.splice(0, runner.log.length - LOG);
  };
  // A pin's logic level with the board's thresholds; between them a real pin reads either: here it
  // keeps what it read last.
  const digital = (n) => {
    const r = volts(n);
    if (!r) return 0;
    const v = r.volts / r.vdd;
    lastRead[n] = v < board.vil ? 0 : v > board.vih ? 1 : lastRead[n] ?? 0;
    return lastRead[n];
  };
  // pulseIn's wait: the width of the next pulse at `value` on pin n, in µs, or 0 when the timeout
  // (µs, from the call) passes first. As Arduino's: a pulse already under way is let go first.
  function* pulse(n, value, timeout) {
    const level = value ? 1 : 0;
    let limit = Number(timeout);
    if (!(limit >= 0 && limit <= PULSE_IN_MAX)) limit = PULSE_IN_MAX; // not a number, negative (unsigned in C: huge), or over the cap
    if (limit === 0) return 0; // nothing to wait for (a busy loop of these costs no more than a turn)
    const deadline = runner.time + limit / 1e6;
    const until = function* (want) {
      while (digital(n) !== want) {
        if (runner.time >= deadline - 1e-12) return false;
        runner.looking = deadline;
        yield LOOK;
      }
      return true;
    };
    if (!(yield* until(1 - level))) return 0;
    if (!(yield* until(level))) return 0;
    const start = runner.time;
    if (!(yield* until(1 - level))) return 0;
    return Math.round((runner.time - start) * 1e6);
  }
  const show = (v, digits) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(digits ?? 2)) : String(v));
  const analog = ANALOG[board.family] ?? [];
  const api = {
    HIGH: 1,
    LOW: 0,
    ...MODE,
    LED_BUILTIN: BUILTIN_LED[board.family] ?? 13,
    A0: analog[0], A1: analog[1], A2: analog[2], A3: analog[3], A4: analog[4], A5: analog[5],
    PI: Math.PI,
    pinMode(n, mode) {
      if (mode === MODE.OUTPUT) set(n, { mode: 'output', pull: null });
      else set(n, { mode: 'input', pull: mode === MODE.INPUT_PULLUP ? 'up' : mode === MODE.INPUT_PULLDOWN ? 'down' : null, pwm: null });
    },
    digitalWrite(n, value) {
      const p = pin(n);
      if (p.mode === 'output') set(n, { level: value ? 1 : 0, pwm: null });
      // On an AVR, writing HIGH to an input turns its pull-up on (the old way to ask for it).
      else if (board.family === 'uno') set(n, { pull: value ? 'up' : null });
    },
    digitalRead: (n) => digital(n),
    *pulseIn(n, value, timeout = PULSE_IN_DEFAULT) {
      return yield* pulse(n, value, timeout);
    },
    // The same on Arduino's cores (it counts with micros() instead of cycles).
    *pulseInLong(n, value, timeout = PULSE_IN_DEFAULT) {
      return yield* pulse(n, value, timeout);
    },
    analogRead(n) {
      const r = volts(n);
      if (!r) return 0;
      return Math.round(Math.min(1, Math.max(0, r.volts / board.adcFull)) * (2 ** board.adcBits - 1));
    },
    // PWM, 8 bits: 0 is LOW, 255 HIGH, in between a square wave. On an UNO only its PWM pins;
    // any other reads it as digitalWrite (128 and up is HIGH), as the core does.
    analogWrite(n, value) {
      const v = Math.min(255, Math.max(0, Math.round(value)));
      const freq = board.family === 'uno' ? UNO_PWM[n] : ESP_PWM;
      if (!freq) return set(n, { mode: 'output', level: v >= 128 ? 1 : 0, pwm: null, pull: null });
      set(n, { mode: 'output', pull: null, ...pwmOf(freq, v / 255) });
    },
    // ESP32 LEDC: core 3 attaches a pin (ledcAttach(pin, freq, bits), ledcWrite(pin, duty)); core 2
    // sets a channel up and attaches pins to it (ledcSetup(ch, freq, bits), ledcAttachPin(pin, ch),
    // ledcWrite(ch, duty)).
    ledcAttach(n, freq, bits) {
      ledc.pins[n] = { freq, bits };
      set(n, { mode: 'output', pull: null });
      return true;
    },
    ledcSetup(ch, freq, bits) {
      ledc.channels[ch] = { freq, bits, pins: ledc.channels[ch]?.pins ?? [] };
      return freq;
    },
    ledcAttachPin(n, ch) {
      (ledc.channels[ch] ??= { freq: 5000, bits: 8, pins: [] }).pins.push(n);
      set(n, { mode: 'output', pull: null });
    },
    ledcWrite(target, duty) {
      const one = (n, freq, bits) => set(n, { mode: 'output', ...pwmOf(freq, duty / (2 ** bits - 1)) });
      if (ledc.pins[target]) one(target, ledc.pins[target].freq, ledc.pins[target].bits);
      else for (const n of ledc.channels[target]?.pins ?? []) one(n, ledc.channels[target].freq, ledc.channels[target].bits);
    },
    // A square wave at freq Hz, half the time high; for `ms` milliseconds when given.
    tone(n, freq, ms) {
      set(n, { mode: 'output', pull: null, ...pwmOf(freq, 0.5) });
      tones[n] = ms > 0 ? runner.time + ms / 1e3 : Infinity;
    },
    noTone(n) {
      delete tones[n];
      set(n, { level: 0, pwm: null });
    },
    millis: () => Math.floor(runner.time * 1e3 + 1e-9),
    micros: () => Math.floor(runner.time * 1e6 + 1e-6),
    abs: Math.abs,
    min: Math.min,
    max: Math.max,
    sqrt: Math.sqrt,
    log: Math.log,
    pow: Math.pow,
    sin: Math.sin,
    cos: Math.cos,
    round: Math.round,
    floor: Math.floor,
    ceil: Math.ceil,
    map: (x, a, b, c, d) => Math.trunc(((x - a) * (d - c)) / (b - a) + c),
    constrain: (x, a, b) => Math.min(b, Math.max(a, x)),
    randomSeed: (s) => {
      seed = Math.abs(Math.trunc(s)) || 1;
    },
    random(a, b) {
      // A fixed sequence (a linear congruential generator): the same run every time.
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const [lo, hi] = b === undefined ? [0, a] : [a, b];
      return lo + (seed % Math.max(1, hi - lo));
    },
    bitRead: (x, b) => (x >> b) & 1,
    bitSet: (x, b) => x | (1 << b),
    bitClear: (x, b) => x & ~(1 << b),
    bitWrite: (x, b, v) => (v ? x | (1 << b) : x & ~(1 << b)),
    Serial: {
      begin() {},
      print: (v, d) => write(show(v, d)),
      println: (v = '', d) => write(`${show(v, d)}\n`),
      available: () => 0,
      read: () => -1,
    },
    __int: (x) => (Number.isFinite(x) ? Math.trunc(x) : 0),
    __missing: () => 0,
    // An index is always a whole number, so a[i] can never name a property ("constructor").
    __idx: (i) => (Number.isFinite(Number(i)) ? Math.trunc(Number(i)) : 0),
    // int a[n]: n capped, so a sketch cannot take the machine's memory.
    __array: (n) => new Array(Math.min(ARRAY_MAX, Math.max(0, Math.trunc(Number(n)) || 0))).fill(0),
  };
  let program;
  try {
    // eslint-disable-next-line no-new-func
    program = new Function('api', js)(api);
  } catch (e) {
    runner.error = String(e.message ?? e);
    return runner;
  }
  let gen = program.setup();
  runner.until = () => {
    if (runner.error) return null;
    if (runner.looking != null) return Math.max(0, runner.looking - runner.time);
    return runner.wait > 1e-12 ? runner.wait : null;
  };
  runner.advance = (dt = 0) => {
    runner.changed = false;
    if (runner.error) return false;
    runner.time += dt;
    // A pulseIn looking at its pin goes on now, whatever the step was; a delay counts the step down.
    if (runner.looking != null) runner.wait = 0;
    else runner.wait -= dt;
    runner.looking = null;
    for (const [n, end] of Object.entries(tones)) if (runner.time >= end) api.noTone(Number(n));
    let turns = 0;
    while (runner.wait <= 1e-12) {
      let r;
      try {
        r = gen.next();
      } catch (e) {
        runner.error = String(e.message ?? e);
        break;
      }
      if (r.done) {
        gen = program.loop();
        if (++turns > BUDGET) break;
        continue;
      }
      // pulseIn: nothing new to see before the next step (runner.looking holds its timeout).
      if (r.value === LOOK) break;
      if (r.value > 0) runner.wait += r.value;
      else if (++turns > BUDGET) break;
    }
    // Until its delay ends, or until pulseIn's timeout while it looks at its pin.
    runner.waitingUntil = runner.looking ?? runner.time + Math.max(0, runner.wait);
    return runner.changed;
  };
  return runner;
}
