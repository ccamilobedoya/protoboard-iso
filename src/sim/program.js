// A board's program running in the simulation (phase M2 of docs/en/microcontrollers.md): the
// JavaScript sketch.js made from the sketch, with the Arduino functions it calls. It runs between
// time steps, as the 555's latch: each accepted step moves its clock, and it goes on until it
// waits (delay) again; what it writes are pin states, what it reads are the voltages of the step
// before. No imports: the page carries it.
//
//   const runner = createRunner(js, board)
//     board: { family, gpio: [numbers wired], read(gpio) → { volts, vdd } | null, vil, vih,
//              adcBits, adcFull, states: { gpio: { mode, level, pull } } (from io) }
//   runner.advance(seconds) → true when a pin changed      runner.pins: gpio → { mode, level, pull }
//   runner.time, runner.waitingUntil, runner.log (Serial lines), runner.error, runner.notes

const BUDGET = 2000; // loop turns or loop() calls per advance before it lets the step go on
const LOG = 40; // Serial lines kept
const MODE = { INPUT: 0, OUTPUT: 1, INPUT_PULLUP: 2, INPUT_PULLDOWN: 3 };
// Analog pin names: GPIO numbers on each family (Arduino-ESP32 and the UNO's core).
const ANALOG = {
  uno: [14, 15, 16, 17, 18, 19],
  esp32: [36, undefined, undefined, 39, 32, 33],
  esp32c3: [0, 1, 2, 3, 4, 5],
};
const BUILTIN_LED = { uno: 13, esp32: 2, esp32c3: 8 };

export function createRunner(js, board) {
  const pins = {};
  for (const [gpio, s] of Object.entries(board.states ?? {})) pins[gpio] = { ...s };
  const pin = (n) => (pins[n] ??= { mode: 'input', level: 0, pull: null });
  const runner = { read: board.read, pins, time: 0, wait: 0, log: [], line: '', error: null, notes: [], changed: false, waitingUntil: 0 };
  const note = (text) => {
    if (!runner.notes.includes(text)) runner.notes.push(text);
  };
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
  let seed = 1;
  const write = (text) => {
    const parts = (runner.line + text).split('\n');
    runner.line = parts.pop();
    runner.log.push(...parts);
    if (runner.log.length > LOG) runner.log.splice(0, runner.log.length - LOG);
  };
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
      else set(n, { mode: 'input', pull: mode === MODE.INPUT_PULLUP ? 'up' : mode === MODE.INPUT_PULLDOWN ? 'down' : null });
    },
    digitalWrite(n, value) {
      const p = pin(n);
      if (p.mode === 'output') set(n, { level: value ? 1 : 0 });
      // On an AVR, writing HIGH to an input turns its pull-up on (the old way to ask for it).
      else if (board.family === 'uno') set(n, { pull: value ? 'up' : null });
    },
    digitalRead(n) {
      const r = volts(n);
      if (!r) return 0;
      const v = r.volts / r.vdd;
      // Between the thresholds a real pin reads either; here it keeps what it read last.
      lastRead[n] = v < board.vil ? 0 : v > board.vih ? 1 : lastRead[n] ?? 0;
      return lastRead[n];
    },
    analogRead(n) {
      const r = volts(n);
      if (!r) return 0;
      return Math.round(Math.min(1, Math.max(0, r.volts / board.adcFull)) * (2 ** board.adcBits - 1));
    },
    analogWrite(n) {
      note('analogWrite');
    },
    ledcWrite() {
      note('ledcWrite');
    },
    ledcAttach() {},
    ledcAttachPin() {},
    ledcSetup() {},
    tone() {
      note('tone');
    },
    noTone() {},
    millis: () => Math.floor(runner.time * 1e3 + 1e-9),
    micros: () => Math.floor(runner.time * 1e6 + 1e-6),
    abs: Math.abs,
    min: Math.min,
    max: Math.max,
    sqrt: Math.sqrt,
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
  runner.advance = (dt = 0) => {
    runner.changed = false;
    if (runner.error) return false;
    runner.time += dt;
    runner.wait -= dt;
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
      if (r.value > 0) runner.wait += r.value;
      else if (++turns > BUDGET) break;
    }
    runner.waitingUntil = runner.time + Math.max(0, runner.wait);
    return runner.changed;
  };
  return runner;
}
