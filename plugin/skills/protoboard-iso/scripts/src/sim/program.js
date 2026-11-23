// A board's program running in the simulation (phase M2 of docs/en/microcontrollers.md): the
// JavaScript sketch.js made from the sketch, with the Arduino functions it calls. It runs between
// time steps, as the 555's latch: each accepted step moves its clock, and it goes on until it
// waits (delay) again; what it writes are pin states, what it reads are the voltages of the step
// before. It imports only the import-free table of libraries: the page carries it.
//
//   const runner = createRunner(js, board)
//     board: { family, gpio: [numbers wired], read(gpio) → { volts, vdd } | null, vil, vih,
//              adcBits, adcFull, adcRef ('vdd': the full scale is the rail read() gives), states: { gpio: { mode, level, pull } } (from io),
//              ask(request) → the answer of the library sensor wired for it, or null (devices/mcu.js),
//              i2c: { sda, scl } its family's default I2C GPIOs }
//   runner.advance(seconds) → true when a pin changed
//   runner.pins: gpio → { mode, level, pull, pwm: { freq, duty } | null }: a pin with pwm switches
//     in time (the board sets its level at each step from runner.time: levelAt)
//   runner.fastest() → the shortest PWM or tone period now (seconds), or null
//   runner.until() → seconds until it wants to run again (a delay ending, or pulseIn looking at its
//     pin until its timeout), or null; the engine ends a step there (engine.advance's landings), so
//     delayMicroseconds(10) is a pulse of 10 µs and pulseIn measures from the steps that end on edges
//   runner.onSet(gpio): optional, set by the board; called after each change of a pin's state, in
//     the program's order (a clocked chip hears every edge, devices/logic.js)
//   runner.time, runner.waitingUntil, runner.log (Serial lines), runner.error, runner.notes
//   runner.stamps (the time each line of log was ended), runner.printed (lines ended since setup)
//   runner.stuck: the program has taken STUCK_TURNS turns of a loop inside one call (setup() or one
//     loop()) without it returning and without time passing for it (a wait, a full serial buffer),
//     over any number of steps: a loop that never ends (`void loop() { while (1) {} }`) or does that
//     much work at once; a loop() that returns without a delay is not stuck, nor a long loop that ends
//
// pulseIn(pin, value[, timeout µs]) is a generator the sketch calls with yield* (sketch.js): it
// waits in simulated time, looking at its pin at the end of every step (it yields LOOK: "run me at
// the next step"), and measures the pulse between the steps that saw it start and end. Exact when
// what drives the pin says when its edges come (a timed sensor's `until()`), to a step otherwise.
// The wait is bounded by the timeout, clamped to PULSE_IN_MAX (src/limits.js, pulseInMicros).
//
// Library objects (libraries.js, docs/en/library-sensors.md): __new(k, c, …args) makes object k of
// class c; __lib(k, m, …args) runs method m of object k (a generator, called with yield*: a real DHT
// read waits 25 ms, a BME/BMP begin() 100 ms). k, c and m are numbers the translator wrote; each is
// checked against the runtime's own arrays. A method asks board.ask({ cls, method, pin | address, … })
// and the sensor's device answers (it holds the truth: its power, its cache, the environment).

import { INT_KIND, STRING_METHODS, LIBRARY_CLASSES, LIBRARY_CONSTANTS, I2C_DEFAULT_ADDRESS, SERIAL_PORT_METHODS, SERIAL_WAITING, heatIndex, altitudeOf, seaLevelOf, isArduinoName } from './libraries.js';

const BUDGET = 2000; // loop turns or loop() calls per advance before it lets the step go on
// Turns of a loop the program may take without letting time pass (no wait, no Serial output) before
// the kit says so (`stuck`, SIM_PROGRAM_STUCK, whose text names this count): counted across steps, so a
// long loop that ends is not stuck. At t = 0 (settle) one advance may take them all, so the start
// tells a loop that ends from one that does not.
export const STUCK_TURNS = 200_000;
// A serial port sends ten bits a character at the rate Serial.begin gave; the program waits only when
// its transmit buffer is full (an AVR's 64 bytes, an ESP32's 128-byte FIFO), as print() does on a board.
const TX_BUFFER = { uno: 64 };
// Each family's serial ports by number (0 Serial, 1 Serial1, 2 Serial2) and their default GPIOs: begin
// makes TX an output that idles high (a UART's stop level), as on a board, so what that pin feeds sees
// the board's rail (a UNO's 5 V into a 3.3 V input). null: a port with no pin by default (the
// ESP32-C3's Serial is its USB port; Serial1's pins are the ones its begin(baud, config, rx, tx) names).
// An UNO has one port: Serial1 there is a name a real UNO does not compile.
const SERIAL_PORTS = { uno: [{ tx: 1, rx: 0 }], esp32: [{ tx: 1, rx: 3 }, null, { tx: 17, rx: 16 }], esp32c3: [null, null] };
const BOARD_NAMES = { uno: 'an UNO', esp32: 'an ESP32', esp32c3: 'an ESP32-C3' };
// How many serial ports a family has (Serial, Serial1, Serial2): a run types only to one it has.
export const serialPortCount = (family) => (SERIAL_PORTS[family] ?? [null]).length;
const STREAM_TIMEOUT = 1000; // ms: a Stream's default (parseInt, readStringUntil)
const POLL = 0.001; // s between two looks of a read that waits for a byte
const SENT_MAX = 4096; // bytes a port keeps of what it sent, for the board on the other end (devices/mcu.js)
// What esp_deep_sleep_start() throws through the sketch (the runtime's own object): the program stops
// and starts again from setup() when its timer wakes it.
const SLEEP = Object.freeze({ sleep: true });
const TX_BUFFER_DEFAULT = 128;
const LOG = 40; // Serial lines kept
const LINE_MAX = 1000; // characters kept of one Serial line
const ARRAY_MAX = 100_000; // elements of one array (an ESP32 has 320 KB of RAM)
const MODE = { INPUT: 0, OUTPUT: 1, INPUT_PULLUP: 2, INPUT_PULLDOWN: 3 };
// A name the sketch uses that nobody defines: JavaScript says "$NAME is not defined" ($ is the
// translator's prefix, sketch.js); the error says, by its name, that a real board would not compile
// it, or, for a name of Arduino's the kit lacks (RISING), that the kit's subset does not know it. The
// line is the statement's that ran last (__at).
const errorText = (e, line) => {
  const text = String(e?.message ?? e).replace(/^\$([A-Za-z_]\w*) is not defined$/, (_, name) => (isArduinoName(name) ? `${name} is not a name the kit's Arduino subset knows` : `${name} is not declared: a real board would not compile this sketch`));
  return line ? `${text} (line ${line})` : text;
};
const WARNINGS_MAX = 16; // distinct runtime warnings a runner keeps (each once: its code, line and pin)
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
const DHT_READ = 0.025; // s a real DHT read holds the sketch (the library's 20 ms start and the 40 bits)
const DHT_INTERVAL = 2000; // ms: the library's MIN_INTERVAL (a read sooner returns the last one)
const I2C_BEGIN = 0.1; // s an Adafruit BME280/BMP280 begin() takes (its delay(100))
// DHT.h's sensor types by number, for a note.
const DHT_TYPES = { 12: 'DHT12', 21: 'DHT21', 22: 'DHT22' };
const OBJECTS_MAX = 64; // library objects at most (the translator caps them lower: LIMITS.libraryObjects)

// Integers as a board stores them (INT_KIND, libraries.js): ToInt32 inside the operators truncates
// and wraps, and gives 0 for NaN and the infinities (a float out of range is undefined in C).
const WRAP_TO = {
  u8: (v) => v & 0xff,
  s8: (v) => (v << 24) >> 24,
  u16: (v) => v & 0xffff,
  s16: (v) => (v << 16) >> 16,
  u32: (v) => v >>> 0,
  s32: (v) => v | 0,
  // C's bool: anything not zero is 1 (NaN too).
  bool: (v) => (!v && !Number.isNaN(v) ? 0 : 1),
};
// Each kind's wrap on a family: `int` and `unsigned int` have 16 bits on an AVR (the UNO), 32 elsewhere.
const wrapsOf = (family) => {
  const avr = family === 'uno';
  const out = [];
  for (const [name, k] of Object.entries(INT_KIND)) out[k] = name === 'int' ? WRAP_TO[avr ? 's16' : 's32'] : name === 'uint' ? WRAP_TO[avr ? 'u16' : 'u32'] : WRAP_TO[name];
  return out;
};
// An arithmetic chain's wrap by its mask (sketch.js; INT_KIND_MASK: 1 unsigned long, 2 unsigned int,
// 4 uint16_t, 8 long), as C's usual conversions type it: an unsigned long makes it one; on an AVR an
// unsigned int (or a uint16_t, which is one there) makes it 16 bits unless a long holds it; on an
// ESP32 an unsigned int is 32 bits and a uint16_t is promoted to a (signed) int.
const chainsOf = (family) => {
  const avr = family === 'uno';
  return Array.from({ length: 16 }, (_, m) => {
    if (m & 1) return WRAP_TO.u32;
    if (avr) return m & 6 && !(m & 8) ? WRAP_TO.u16 : null;
    return m & 2 ? WRAP_TO.u32 : null;
  });
};
const U32 = 4294967296;

// A PWM pin's level at time t: high for the first `duty` of each period.
export const levelAt = (pwm, t) => (pwm.duty >= 1 ? 1 : pwm.duty <= 0 ? 0 : (t * pwm.freq) % 1 < pwm.duty ? 1 : 0);

export function createRunner(js, board) {
  // Maps by pin with no prototype: a pin named "__proto__" by a sketch is a key, never Object's.
  const pins = Object.create(null);
  for (const [gpio, s] of Object.entries(board.states ?? {})) pins[gpio] = { ...s };
  const pin = (n) => (pins[n] ??= { mode: 'input', level: 0, pull: null, pwm: null });
  const runner = { read: board.read, ask: board.ask ?? null, pins, time: 0, wait: 0, log: [], stamps: [], printed: 0, line: '', error: null, notes: [], warnings: [], sleeping: null, changed: false, waitingUntil: 0, looking: null, stuck: false };
  // The line of the statement running now (the translator's __at), for what the runtime warns of.
  let at = 0;
  // A mistake a real board would show (a pin it does not have, a division by zero…): kept in
  // runner.warnings ({ code, line, … }), once per pin for a pin's (its first line) and once per line
  // otherwise, which the board's limits turn into warnings (devices/mcu.js); the program goes on as the
  // board would.
  const keyOf = (w) => (w.pin != null ? `${w.code} pin ${w.pin}` : `${w.code} line ${w.line}`);
  const warn = (code, params = {}) => {
    const w = { code, line: at, ...params };
    if (runner.warnings.length >= WARNINGS_MAX || runner.warnings.some((x) => keyOf(x) === keyOf(w))) return;
    runner.warnings.push(w);
  };
  // The board's GPIO numbers (devices/mcu.js gives them): a call with a number not among them is warned
  // and does nothing, as on a board that has no such pin. Without the list every number is taken.
  const known = board.pins ? new Set(board.pins) : null;
  const has = (n, fn) => {
    if (!known || known.has(n)) return true;
    warn('SIM_PROGRAM_PIN_UNKNOWN', { pin: Number.isFinite(Number(n)) ? Number(n) : String(n), name: fn });
    return false;
  };
  // runner.onSet(n), when the board gives one, hears every change of a pin at once, in order: a chip
  // clocked by it (devices/logic.js) sees each edge of a shiftOut, which takes no simulated time.
  const set = (n, values) => {
    const p = pin(n);
    let moved = false;
    for (const [k, v] of Object.entries(values)) {
      if (p[k] !== v) {
        p[k] = v;
        runner.changed = true;
        moved = true;
      }
    }
    if (moved) runner.onSet?.(n);
  };
  // Read through runner.read: a rebuilt circuit (a control changed) hands the runner its own.
  const volts = (n) => runner.read(n);
  const lastRead = Object.create(null);
  const ledc = { pins: Object.create(null), channels: Object.create(null) };
  const tones = Object.create(null); // pin → time its tone ends
  // A duty of 0 or 1 is a plain level, no wave to step through.
  const pwmOf = (freq, duty) => (duty <= 0 ? { level: 0, pwm: null } : duty >= 1 ? { level: 1, pwm: null } : { pwm: { freq, duty } });
  runner.fastest = () => {
    const periods = Object.values(pins).filter((p) => p.pwm && p.mode === 'output').map((p) => 1 / p.pwm.freq);
    return periods.length ? Math.min(...periods) : null;
  };
  let seed = 1;
  // The serial ports (Serial, Serial1, Serial2): each one's rate (0: never begun, printing costs no
  // time), when its transmit buffer will be empty, its pins, what it has sent (each byte with the time
  // it is through, `sent`, which a board on the other end of its TX reads) and what has arrived
  // (`inbox`). `owed`: the time the program owes for a full buffer (it waits that long at its next turn).
  const portsOf = SERIAL_PORTS[board.family] ?? [null];
  const ports = portsOf.map((pins) => ({ baud: 0, txFreeAt: 0, line: '', tx: pins?.tx ?? null, rx: pins?.rx ?? null, sent: [], count: 0, inbox: [], heard: new WeakMap(), timeout: STREAM_TIMEOUT }));
  runner.ports = ports;
  // What a run types to the board (simulate --run … --serial "1@0.5"): [{ port, text, time }], each
  // text delivered to its port at its time, a character every ten bits at the port's rate (after the
  // port is begun: a text typed before reaches it as begin() starts it).
  const typed = (Array.isArray(board.typed) ? board.typed : [])
    .filter((x) => Number.isInteger(x?.port) && ports[x.port] && Number.isFinite(Number(x.time)) && typeof x.text === 'string')
    .map((x) => ({ port: x.port, text: x.text.slice(0, SENT_MAX), time: Number(x.time), done: false }));
  for (const x of typed) ports[x.port].typed = true;
  const deliver = () => {
    for (const x of typed) {
      const port = ports[x.port];
      if (x.done || x.time > runner.time + 1e-12 || !(port.baud > 0)) continue;
      const each = 10 / port.baud;
      const from = Math.max(x.time, port.begunAt ?? 0);
      for (let k = 0; k < x.text.length; k++) port.inbox.push({ byte: x.text.charCodeAt(k) & 0xff, at: from + (k + 1) * each });
      if (port.inbox.length > SENT_MAX) port.inbox.splice(0, port.inbox.length - SENT_MAX);
      x.done = true;
    }
  };
  // What a board on the other end of a port's RX sent (devices/mcu.js links them by their nets): the
  // bytes past the last one this port took from that sender, at the times they are through; nothing
  // when the two rates differ (a real board reads garbage), warned once.
  runner.hear = (k, peer) => {
    const port = ports[k];
    if (!port || !(port.baud > 0) || !peer || !(peer.baud > 0)) return;
    const last = port.heard.get(peer) ?? 0;
    if (peer.count <= last) return;
    port.heard.set(peer, peer.count);
    if (Math.abs(peer.baud - port.baud) > port.baud * 0.03) {
      warn('SIM_PROGRAM_BAUD_MISMATCH', { pin: port.rx, port: k === 0 ? 'Serial' : `Serial${k}`, baud: port.baud, peer: peer.baud });
      return;
    }
    const fresh = peer.sent.slice(Math.max(0, peer.sent.length - (peer.count - last)));
    port.inbox.push(...fresh.map((b) => ({ byte: b.byte, at: b.at })));
    if (port.inbox.length > SENT_MAX) port.inbox.splice(0, port.inbox.length - SENT_MAX);
  };
  let owed = 0;
  const transmit = (port, text) => {
    if (!(port.baud > 0) || !text) return;
    const each = 10 / port.baud;
    const now = runner.time + owed;
    const start = Math.max(now, port.txFreeAt);
    for (let k = 0; k < text.length; k++) port.sent.push({ byte: text.charCodeAt(k) & 0xff, at: start + (k + 1) * each });
    port.count += text.length;
    if (port.sent.length > SENT_MAX) port.sent.splice(0, port.sent.length - SENT_MAX);
    port.txFreeAt = start + text.length * each;
    const full = port.txFreeAt - (TX_BUFFER[board.family] ?? TX_BUFFER_DEFAULT) * each - now;
    if (full > 0) owed += full;
  };
  // What a port prints: on the wire (`wire`: println ends a line with "\r\n" on a board), and in the
  // log: Serial's lines as they are, another port's labelled ("Serial2: got 5"), each port with its own
  // partial line.
  const write = (text, k = 0, wire = text) => {
    const port = ports[k];
    const start = runner.time + owed; // the line's time: when it starts out
    transmit(port, wire);
    const partial = k === 0 ? runner.line : port.line;
    // A "\r" (println's, or one received and printed again) moves nothing in the log: a terminal's
    // carriage return; the wire keeps it.
    const parts = (partial + text.replaceAll('\r', '')).split('\n').map((p) => p.slice(0, LINE_MAX));
    if (k === 0) runner.line = parts.pop();
    else port.line = parts.pop();
    if (k > 0) for (let j = 0; j < parts.length; j++) parts[j] = `Serial${k}: ${parts[j]}`;
    runner.log.push(...parts);
    for (const _ of parts) runner.stamps.push(start);
    runner.printed += parts.length;
    if (runner.log.length > LOG) {
      runner.log.splice(0, runner.log.length - LOG);
      runner.stamps.splice(0, runner.stamps.length - LOG);
    }
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
  // A value as Serial.print writes it (Print.cpp): a float with two decimals (or `digits`), NaN as
  // "nan" and an infinity as "inf" (the AVR core's words), a bool as 1 or 0, a char (kind 2, from the
  // translator) as its letter, an integer in the base its second argument gives (DEC, HEX, OCT, BIN;
  // a negative one in another base as its 32 bits, as print(long, base) does).
  const show = (v, digits, kind) => {
    if (typeof v === 'boolean') return v ? '1' : '0';
    if (Array.isArray(v)) return cText(v);
    if (typeof v !== 'number') return String(v);
    if (Number.isNaN(v)) return 'nan';
    if (!Number.isFinite(v)) return v > 0 ? 'inf' : '-inf';
    if (kind === 2 && digits === undefined) return letter(v);
    if (Number.isInteger(v) && kind !== 1) {
      const base = Number.isInteger(digits) && digits >= 2 && digits <= 36 ? digits : 10;
      return base === 10 ? String(v) : (v >>> 0).toString(base).toUpperCase();
    }
    return v.toFixed(Math.min(20, Math.max(0, Number.isFinite(digits) ? Math.trunc(digits) : 2)));
  };
  // One byte as the character it is (Serial.write(65), a char printed): its low eight bits.
  const letter = (v) => String.fromCharCode(Math.trunc(Number(v)) & 0xff);
  // A char array as C reads it: its characters up to the first 0 (an untouched buffer is empty).
  const cText = (a) => {
    let out = '';
    for (const c of a) {
      if (typeof c === 'string') return out + c;
      if (!c) break;
      out += letter(c);
      if (out.length >= LINE_MAX) break;
    }
    return out;
  };
  const textOf = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? cText(v) : show(v));
  // sprintf's conversions (%d %i %u %ld %lu %x %X %c %s %% with flags - 0 + and a width): an int has
  // the board's size, as the call reads it; an AVR's sprintf has no %f (it writes "?"), an ESP32's does.
  const FORMAT = /%([-0+ ]*)(\d*)(?:\.(\d+))?(hh|h|ll|l)?([diuxXcsfFeEgG%])/g;
  const formatted = (fmt, args) => {
    let k = 0;
    return textOf(fmt).replace(FORMAT, (_, flags, width, precision, size, conv) => {
      if (conv === '%') return '%';
      const v = args[k++];
      const long = size === 'l' || size === 'll';
      let out;
      if (conv === 'd' || conv === 'i') out = String((long ? WRAP_TO.s32 : WRAPS[INT_KIND.int])(v));
      else if (conv === 'u' || conv === 'x' || conv === 'X') {
        const n = (long ? WRAP_TO.u32 : WRAPS[INT_KIND.uint])(v);
        out = conv === 'u' ? String(n) : conv === 'x' ? n.toString(16) : n.toString(16).toUpperCase();
      } else if (conv === 'c') out = letter(v);
      else if (conv === 's') out = textOf(v ?? '');
      else if (board.family === 'uno') out = '?';
      else {
        const p = precision === undefined ? 6 : Math.min(20, Number(precision));
        const n = Number(v);
        out = /[fF]/.test(conv) ? n.toFixed(p) : /[eE]/.test(conv) ? n.toExponential(p) : String(Number(n.toPrecision(Math.max(1, p))));
      }
      if (conv === 's' && precision !== undefined) out = out.slice(0, Number(precision));
      if (flags.includes('+') && /[di]/.test(conv) && !out.startsWith('-')) out = `+${out}`;
      const w = Math.min(LINE_MAX, Number(width) || 0);
      if (out.length < w) {
        if (flags.includes('-')) out = out.padEnd(w);
        else if (flags.includes('0') && /[diuxX]/.test(conv)) out = /^[-+]/.test(out) ? out[0] + out.slice(1).padStart(w - 1, '0') : out.padStart(w, '0');
        else out = out.padStart(w);
      }
      return out;
    });
  };
  const analog = ANALOG[board.family] ?? [];
  const WRAPS = wrapsOf(board.family);
  const CHAINS = chainsOf(board.family);
  const api = {
    HIGH: 1,
    LOW: 0,
    ...MODE,
    LED_BUILTIN: BUILTIN_LED[board.family] ?? 13,
    A0: analog[0], A1: analog[1], A2: analog[2], A3: analog[3], A4: analog[4], A5: analog[5],
    PI: Math.PI,
    TWO_PI: 2 * Math.PI,
    HALF_PI: Math.PI / 2,
    DEG_TO_RAD: Math.PI / 180,
    RAD_TO_DEG: 180 / Math.PI,
    MSBFIRST: 1,
    LSBFIRST: 0,
    // A serial port's frame (begin's second argument): the kit sends 8N1's ten bits whatever it says.
    // attachInterrupt's modes, by the AVR core's numbers (LOW is 0, so HIGH reads as CHANGE there, as on
    // an UNO); ONLOW and ONHIGH are the ESP32's level modes.
    CHANGE: 1,
    FALLING: 2,
    RISING: 3,
    ONLOW: 4,
    ONHIGH: 5,
    SERIAL_8N1: 0x06,
    SERIAL_8N2: 0x0e,
    SERIAL_8E1: 0x26,
    SERIAL_8O1: 0x36,
    DEC: 10,
    HEX: 16,
    OCT: 8,
    BIN: 2,
    // shiftOut and shiftIn are plain digitalWrite / digitalRead sequences, as the Arduino core's: eight
    // bits, the clock high then low for each (no time passes between them in the kit).
    shiftOut(data, clock, order, value) {
      for (let k = 0; k < 8; k++) {
        api.digitalWrite(data, order === 0 ? (value >> k) & 1 : (value >> (7 - k)) & 1);
        api.digitalWrite(clock, 1);
        api.digitalWrite(clock, 0);
      }
    },
    shiftIn(data, clock, order) {
      let value = 0;
      for (let k = 0; k < 8; k++) {
        api.digitalWrite(clock, 1);
        if (api.digitalRead(data)) value |= 1 << (order === 0 ? k : 7 - k);
        api.digitalWrite(clock, 0);
      }
      return value;
    },
    pinMode(n, mode) {
      if (!has(n, 'pinMode')) return;
      if (mode === MODE.OUTPUT) set(n, { mode: 'output', pull: null });
      else set(n, { mode: 'input', pull: mode === MODE.INPUT_PULLUP ? 'up' : mode === MODE.INPUT_PULLDOWN ? 'down' : null, pwm: null });
    },
    digitalWrite(n, value) {
      if (!has(n, 'digitalWrite')) return;
      const p = pin(n);
      if (p.mode === 'output') set(n, { level: value ? 1 : 0, pwm: null });
      else {
        // HIGH to a pin never set as an output: on an AVR it turns the pull-up on (the pin sources a
        // fraction of a milliampere through it), on an ESP32 nothing changes. Said once, with the line.
        if (value) warn('SIM_PROGRAM_NOT_OUTPUT', { pin: n });
        if (board.family === 'uno') set(n, { pull: value ? 'up' : null });
      }
    },
    digitalRead: (n) => (has(n, 'digitalRead') ? digital(n) : 0),
    *pulseIn(n, value, timeout = PULSE_IN_DEFAULT) {
      return yield* pulse(n, value, timeout);
    },
    // The same on Arduino's cores (it counts with micros() instead of cycles).
    *pulseInLong(n, value, timeout = PULSE_IN_DEFAULT) {
      return yield* pulse(n, value, timeout);
    },
    analogRead(n) {
      // On an UNO analogRead(0) … analogRead(5) are the channels A0 … A5, as the core reads them.
      if (board.family === 'uno' && n >= 0 && n <= 5 && Number.isInteger(n)) n += 14;
      if (!has(n, 'analogRead')) return 0;
      const r = volts(n);
      if (!r) return 0;
      // Full scale: the board's own rail (an AVR's AVcc) or its fixed reference.
      const full = board.adcRef === 'vdd' && r.vdd > 0 ? r.vdd : board.adcFull;
      return Math.round(Math.min(1, Math.max(0, r.volts / full)) * (2 ** board.adcBits - 1));
    },
    // PWM, 8 bits: 0 is LOW, 255 HIGH, in between a square wave. On an UNO only its PWM pins;
    // any other reads it as digitalWrite (128 and up is HIGH), as the core does.
    analogWrite(n, value) {
      if (!has(n, 'analogWrite')) return;
      const v = Math.min(255, Math.max(0, Math.round(value)));
      const freq = board.family === 'uno' ? UNO_PWM[n] : ESP_PWM;
      if (!freq) {
        // A pin with no PWM: the core writes it HIGH from 128 and LOW below, said once.
        warn('SIM_PROGRAM_NO_PWM', { pin: n, value: v });
        return set(n, { mode: 'output', level: v >= 128 ? 1 : 0, pwm: null, pull: null });
      }
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
      if (!has(n, 'tone')) return;
      set(n, { mode: 'output', pull: null, ...pwmOf(freq, 0.5) });
      tones[n] = ms > 0 ? runner.time + ms / 1e3 : Infinity;
    },
    noTone(n) {
      delete tones[n];
      set(n, { level: 0, pwm: null });
    },
    // Since the board started (or woke from deep sleep, which restarts it); unsigned longs, which wrap
    // to 0 at 2^32 (millis after 49.7 days, micros after 71.6 minutes).
    millis: () => Math.floor((runner.time - boot) * 1e3 + 1e-9) % U32,
    micros: () => Math.floor((runner.time - boot) * 1e6 + 1e-6) % U32,
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
    bitToggle: (x, b) => x ^ (1 << b),
    Serial: portApi(0),
    // Serial1 / Serial2 and the methods that wait: port k's method m (SERIAL_PORT_METHODS), numbers the
    // translator wrote, checked here; a port the board does not have stops the program, as a real
    // board would not compile it.
    *__serial(k, m, ...args) {
      const name = SERIAL_PORT_METHODS[m];
      if (!Number.isInteger(k) || k < 0 || k > 2 || !Number.isInteger(m) || !name) return 0;
      if (!ports[k]) throw new Error(`Serial${k} is not declared on ${BOARD_NAMES[board.family] ?? 'this board'}: a real board would not compile this sketch (it has ${ports.length === 1 ? 'one serial port, Serial' : `Serial to Serial${ports.length - 1}`})`);
      const methods = apis[k];
      return SERIAL_WAITING.includes(name) ? yield* methods[name](...args) : methods[name](...args);
    },
    // A comparison is a bool, which C++ turns into 1 or 0 (int pressed = digitalRead(2) == LOW).
    __int: (x) => (typeof x === 'boolean' ? Number(x) : Number.isFinite(x) ? Math.trunc(x) : 0),
    // A value stored in a variable of an integer kind (k, a number the translator wrote), as the board
    // stores it; an arithmetic chain with an unsigned type in it (mask, the same), as the board computes it.
    __w: (v, k) => (WRAPS[k] ?? api.__int)(v),
    __u: (v, mask) => {
      const wrap = CHAINS[mask];
      return wrap ? wrap(v) : v;
    },
    // x++ in an expression: the value before (the second argument has stored the new one).
    __post: (old) => old,
    // An array element changed in place (UPDATE_OPS by number: a[i] += v, a[i]++, bitSet(a[i], n)):
    // its index computed once, the new value wrapped to the array's kind; x++ gives the old value.
    __upd(array, i, op, k, a, b) {
      if (!Array.isArray(array) || !Number.isInteger(i) || i < 0 || i >= array.length) return 0;
      const old = array[i];
      let v;
      switch (op) {
        case 0: v = a; break;
        case 1: v = old + a; break;
        case 2: v = old - a; break;
        case 3: v = old * a; break;
        case 4: v = api.__div(old, a); break;
        case 5: v = api.__mod(old, a); break;
        case 6: v = old & a; break;
        case 7: v = old | a; break;
        case 8: v = old ^ a; break;
        case 9: v = old << a; break;
        case 10: v = old >> a; break;
        case 11: v = api.bitSet(old, a); break;
        case 12: v = api.bitClear(old, a); break;
        case 13: v = api.bitToggle(old, a); break;
        case 14: v = api.bitWrite(old, a, b); break;
        case 15: v = old + 1; break;
        case 16: v = old - 1; break;
        default: return 0;
      }
      array[i] = api.__w(v, k);
      return op >= 15 ? old : array[i];
    },
    // A String's method m (STRING_METHODS) on its text; a char or a float the translator passes already
    // as text (__tostr). In-place methods give the new text (the translator stores it).
    __strm(m, value, a, b) {
      const s = textOf(value);
      // indexOf, lastIndexOf and replace take a char where a number is given (C++ picks that overload).
      const one = (v) => (typeof v === 'number' && ['indexOf', 'lastIndexOf', 'replace'].includes(STRING_METHODS[m]) ? letter(v) : textOf(v));
      const x = a === undefined ? '' : one(a);
      switch (STRING_METHODS[m]) {
        case 'length': return s.length;
        case 'charAt': return s.charCodeAt(Math.trunc(Number(a))) || 0;
        case 'indexOf': return s.indexOf(x, b === undefined ? 0 : Number(b));
        case 'lastIndexOf': return s.lastIndexOf(x, b === undefined ? Number.POSITIVE_INFINITY : Number(b));
        case 'substring': return s.substring(Number(a), b === undefined ? undefined : Number(b));
        case 'toInt': return Number.parseInt(s, 10) | 0;
        case 'toFloat':
        case 'toDouble': return Number.parseFloat(s) || 0;
        case 'equals': return s === x ? 1 : 0;
        case 'equalsIgnoreCase': return s.toLowerCase() === x.toLowerCase() ? 1 : 0;
        case 'startsWith': return s.startsWith(x) ? 1 : 0;
        case 'endsWith': return s.endsWith(x) ? 1 : 0;
        case 'compareTo': return s < x ? -1 : s > x ? 1 : 0;
        case 'c_str': return s;
        case 'trim': return s.trim();
        case 'toUpperCase': return s.toUpperCase();
        case 'toLowerCase': return s.toLowerCase();
        case 'concat': return (s + x).slice(0, ARRAY_MAX);
        case 'replace': return s.split(x).join(b === undefined ? '' : one(b)).slice(0, ARRAY_MAX);
        case 'remove': return s.slice(0, Number(a)) + (b === undefined ? '' : s.slice(Number(a) + Number(b)));
        case 'isEmpty': return s.length ? 0 : 1;
        default: return 0;
      }
    },
    // String(x[, base or decimals]): the text Serial.print writes of it (kind 1 a float, 2 a char).
    __tostr: (v, digits, kind) => show(v, digits, kind),
    // sprintf / snprintf: n the buffer's size (-1 for sprintf), the text cut to n - 1 characters.
    __fmt(n, fmt, ...args) {
      const out = formatted(fmt, args).slice(0, ARRAY_MAX);
      return Number(n) >= 0 ? out.slice(0, Math.max(0, Number(n) - 1)) : out;
    },
    __missing: () => 0,
    // An index is always a whole number, so a[i] can never name a property ("constructor").
    // With the array (the translator passes one named alone), an index outside its elements is warned
    // and goes to a spare slot past them, set to 0: a read gives 0 and a write is dropped (a real board
    // reads or overwrites whatever memory is there).
    __idx(i, array) {
      const k = Number.isFinite(Number(i)) ? Math.trunc(Number(i)) : 0;
      const size = array ? sizes.get(array) : undefined;
      if (size === undefined || (k >= 0 && k < size)) return k;
      warn('SIM_PROGRAM_OUT_OF_BOUNDS', { index: k, size });
      array[size] = 0;
      return size;
    },
    // int a[n]: n capped, so a sketch cannot take the machine's memory.
    // int a[5] = {1, 2}: as long as its size (the rest 0, or "" in a list of texts) or as its list,
    // capped; one spare slot past its elements takes what an index outside them reads or writes.
    __array(n, items = []) {
      const size = Math.min(ARRAY_MAX, Math.max(Math.max(0, Math.trunc(Number(n)) || 0), items.length));
      const fill = items.length && items.every((x) => typeof x === 'string') ? '' : 0;
      const array = [...items.slice(0, size), ...new Array(Math.max(0, size - items.length)).fill(fill), 0];
      sizes.set(array, size);
      return array;
    },
    __at: (n) => {
      at = n;
    },
    // Interrupts: an UNO has two, on D2 and D3 (numbers 0 and 1; NOT_AN_INTERRUPT, -1, for any other
    // pin), an ESP32 one on every GPIO (its number is the pin's). The handler (one of the sketch's own
    // functions) runs when its pin's level crosses as its mode says, at the step that sees it, between
    // two statements of the main program; LOW and ONLOW run it at every step the pin is low.
    digitalPinToInterrupt(n) {
      asked = Number(n);
      if (board.family === 'uno') return n === 2 ? 0 : n === 3 ? 1 : -1;
      return Number.isInteger(n) && (!known || known.has(n)) ? n : -1;
    },
    attachInterrupt(k, handler, mode) {
      const pinOf = board.family === 'uno' ? { 0: 2, 1: 3 }[k] : Number.isInteger(k) && k >= 0 && (!known || known.has(k)) ? k : undefined;
      if (pinOf === undefined) {
        warn('SIM_PROGRAM_NO_INTERRUPT', { pin: Number.isInteger(asked) && asked >= 0 ? asked : Number(k), variant: board.family });
        return;
      }
      if (typeof handler !== 'function') return;
      interruptsOn[pinOf] = { handler, mode: Number(mode), last: digital(pinOf), pending: false };
    },
    detachInterrupt(k) {
      const pinOf = board.family === 'uno' ? { 0: 2, 1: 3 }[k] : k;
      if (pinOf != null) delete interruptsOn[pinOf];
    },
    noInterrupts() {
      held = true;
    },
    interrupts() {
      held = false;
      runPending();
    },
    // ESP32 deep sleep: the timer to wake by (µs), then sleep: the program stops, its pins go back to
    // inputs, and after that time it starts again from setup() with its globals as at power-up. With
    // no timer it sleeps to the end. An UNO has neither name: a real one would not compile them.
    esp_sleep_enable_timer_wakeup(us) {
      espOnly('esp_sleep_enable_timer_wakeup');
      const v = Number(us);
      wakeAfter = Number.isFinite(v) && v >= 0 ? v / 1e6 : null;
      return 0;
    },
    esp_deep_sleep_start() {
      espOnly('esp_deep_sleep_start');
      throw SLEEP;
    },
    __deepSleep(us) {
      espOnly('ESP.deepSleep');
      const v = Number(us);
      wakeAfter = Number.isFinite(v) && v > 0 ? v / 1e6 : null;
      throw SLEEP;
    },
    // C's integer division and remainder. By zero: on an ESP32 (its Xtensa core) the chip stops with
    // an exception and restarts, so the program stops here; elsewhere the kit gives 0 and goes on (a
    // real board's result is undefined). Warned with the line either way.
    __div: (a, b) => (Number(b) === 0 ? byZero() : api.__int(Number(a) / Number(b))),
    __mod: (a, b) => (Number(b) === 0 ? byZero() : api.__int(Number(a) % Number(b))),
    // delay(ms) and delayMicroseconds(µs) take unsigned numbers: a negative one is a very long wait
    // (delay(-1) is 4 294 967 295 ms, about 49.7 days; delayMicroseconds(-1) 65 535 µs on an UNO,
    // whose argument has 16 bits). Warned; the run shows it as a wait.
    __ms: (ms) => unsigned(ms, 32, 'delay') / 1e3,
    __us: (us) => unsigned(us, board.family === 'uno' ? 16 : 32, 'delayMicroseconds') / 1e6,
    ...LIBRARY_CONSTANTS,
    isnan: (x) => Number.isNaN(Number(x)),
    __wire: (sda, scl) => startWire(sda, scl),
    // A library object: k and c are numbers the translator chose, checked here all the same.
    __new(k, c, ...args) {
      if (!Number.isInteger(k) || k < 0 || k >= OBJECTS_MAX || !Number.isInteger(c) || !LIBRARY_CLASSES[c]) return;
      objects[k] = { cls: c, args: args.map(Number), begun: null, last: null };
      // A DHT of a type the kit does not have (whatever names it: DHT22, 22, a constant): the board's
      // card says so (runner.notes), and its reads give NaN.
      if (LIBRARY_CLASSES[c].bus === 'pin') {
        const type = Number(args[1]);
        if (type !== LIBRARY_CONSTANTS.DHT11) {
          const name = DHT_TYPES[type] ?? `DHT (type ${Number.isFinite(type) ? type : '?'})`;
          if (!runner.notes.includes(name)) runner.notes.push(name);
        }
      }
    },
    // One of its methods: a generator (some of them wait), m its number in the class's list.
    *__lib(k, m, ...args) {
      const o = Number.isInteger(k) && k >= 0 && k < OBJECTS_MAX ? objects[k] : undefined;
      const run = o && Number.isInteger(m) && m >= 0 ? METHODS[o.cls][m] : undefined;
      if (typeof run !== 'function') return 0;
      // A method that waits is a generator (a real DHT read, begin()); the others return at once.
      return WAITS.has(run) ? yield* run(o, ...args) : run(o, ...args);
    },
  };
  // A port's methods, as Stream and Print have them: begin(baud[, config, rx, tx]) takes its pins (TX an
  // output, high); what arrives is read by the time each byte is through.
  function portApi(k) {
    const port = ports[k];
    // Whether the program reads this port (a board whose RX pin gets nothing is told so, devices/mcu.js).
    const arrived = () => {
      port.reads = true;
      return port.inbox.filter((b) => b.at <= runner.time + 1e-12);
    };
    const take = () => {
      port.reads = true;
      const i = port.inbox.findIndex((b) => b.at <= runner.time + 1e-12);
      return i < 0 ? -1 : port.inbox.splice(i, 1)[0].byte;
    };
    // The next byte within the timeout, or -1 (Stream's timedRead / timedPeek).
    function* timed(keep) {
      const deadline = runner.time + port.timeout / 1e3;
      for (;;) {
        const first = arrived()[0];
        if (first) return keep ? first.byte : take();
        if (runner.time >= deadline - 1e-12) return -1;
        yield POLL;
      }
    }
    const digit = (c, float) => (c >= 48 && c <= 57) || c === 45 || (float && c === 46);
    function* parse(float) {
      let c = yield* timed(true);
      while (c >= 0 && !digit(c, float)) {
        take();
        c = yield* timed(true);
      }
      if (c < 0) return 0;
      let text = '';
      while (c >= 0 && digit(c, float) && !(c === 45 && text)) {
        text += String.fromCharCode(take());
        c = yield* timed(true);
      }
      const v = float ? Number.parseFloat(text) : Number.parseInt(text, 10);
      return Number.isFinite(v) ? v : 0;
    }
    return {
      begin(rate, config, rx, tx) {
        const r = Number(rate);
        port.baud = Number.isFinite(r) && r > 0 ? r : 0;
        port.begunAt = runner.time;
        if (Number.isInteger(Number(rx)) && Number(rx) >= 0) port.rx = Number(rx);
        if (Number.isInteger(Number(tx)) && Number(tx) >= 0) port.tx = Number(tx);
        if (port.tx != null) set(port.tx, { mode: 'output', level: 1, pull: null, pwm: null });
      },
      print: (v, d, kind) => write(show(v, d, kind), k),
      println: (v = '', d, kind) => write(`${show(v, d, kind)}\n`, k, `${show(v, d, kind)}\r\n`),
      // write(byte) sends that byte (65 is "A"); write("text") the text. It returns the bytes written.
      write(v) {
        const text = typeof v === 'string' ? v : letter(v);
        write(text, k);
        return text.length;
      },
      available: () => arrived().length,
      read: () => take(),
      peek: () => arrived()[0]?.byte ?? -1,
      flush() {
        owed = Math.max(owed, port.txFreeAt - runner.time);
      },
      setTimeout(ms) {
        const v = Number(ms);
        port.timeout = Number.isFinite(v) && v >= 0 ? Math.min(v, 60_000) : STREAM_TIMEOUT;
      },
      end() {
        port.baud = 0;
      },
      parseInt: () => parse(false),
      parseFloat: () => parse(true),
      *readStringUntil(end) {
        const stop = typeof end === 'string' ? end.charCodeAt(0) : Math.trunc(Number(end));
        let text = '';
        for (;;) {
          const c = yield* timed(false);
          if (c < 0 || c === stop) return text;
          if (text.length < LINE_MAX) text += String.fromCharCode(c);
        }
      },
      *readString() {
        let text = '';
        for (;;) {
          const c = yield* timed(false);
          if (c < 0) return text;
          if (text.length < LINE_MAX) text += String.fromCharCode(c);
        }
      },
    };
  }
  const apis = ports.map((_, k) => (k === 0 ? api.Serial : portApi(k)));
  // Interrupts attached, by pin: { handler, mode, last level, pending }; `held` while noInterrupts().
  const interruptsOn = Object.create(null);
  let held = false;
  let asked = null; // the pin digitalPinToInterrupt was last asked about (the warning names it)
  const ISR_TURNS = 2000; // turns of a handler's loops at most (a handler is meant to be short)
  const runHandler = (handler) => {
    const it = handler();
    if (!it || typeof it.next !== 'function') return;
    // A delay() inside a handler does not wait (on a board it does not work there either).
    for (let k = 0; k < ISR_TURNS && !it.next().done; k++);
  };
  const runPending = () => {
    if (held) return;
    for (const one of Object.values(interruptsOn)) {
      if (!one.pending) continue;
      one.pending = false;
      runHandler(one.handler);
    }
  };
  // At each step: each attached pin's level against the one it had, its handler run when it crossed.
  const watchInterrupts = () => {
    for (const [n, one] of Object.entries(interruptsOn)) {
      const level = digital(Number(n));
      const crossed = level !== one.last;
      const m = one.mode;
      if ((m === 1 && crossed) || (m === 3 && crossed && level === 1) || (m === 2 && crossed && level === 0) || ((m === 0 || m === 4) && level === 0) || (m === 5 && level === 1)) one.pending = true;
      one.last = level;
    }
    runPending();
  };
  let wakeAfter = null; // s: the timer esp_sleep_enable_timer_wakeup set
  let boot = 0; // s: when the program last started (power-up, or a wake from deep sleep)
  const espOnly = (name) => {
    if (board.family !== 'esp32' && board.family !== 'esp32c3') throw new Error(`${name} is not declared on ${BOARD_NAMES[board.family] ?? 'this board'}: a real board would not compile this sketch (deep sleep is an ESP32's)`);
  };
  // Into deep sleep: every pin an input with nothing on (tones, PWM and the ports stop), and the time
  // to wake, or none (runner.sleeping: { until: s | null }).
  const sleep = () => {
    for (const n of Object.keys(pins)) set(n, { mode: 'input', level: 0, pull: null, pwm: null });
    for (const n of Object.keys(tones)) delete tones[n];
    for (const n of Object.keys(interruptsOn)) delete interruptsOn[n];
    held = false;
    for (const port of ports) Object.assign(port, { baud: 0, txFreeAt: 0, line: '', inbox: [] });
    owed = 0;
    runner.sleeping = { until: wakeAfter == null ? null : runner.time + wakeAfter };
    runner.wait = wakeAfter == null ? Number.POSITIVE_INFINITY : wakeAfter;
    wakeAfter = null;
  };
  const sizes = new WeakMap(); // array → its number of elements (__array)
  const byZero = () => {
    warn('SIM_PROGRAM_DIVIDE_ZERO', { variant: board.family === 'esp32' ? 'esp32' : 'other' });
    if (board.family === 'esp32') throw new Error('integer division by zero: an ESP32 stops with an exception here and restarts');
    return 0;
  };
  const unsigned = (x, bits, name) => {
    const v = Math.trunc(Number(x));
    if (!Number.isFinite(v)) return 0;
    if (v >= 0) return v;
    const wrapped = bits === 16 ? v & 0xffff : v >>> 0;
    warn('SIM_PROGRAM_DELAY_NEGATIVE', { name, value: v, wrapped, variant: name });
    return wrapped;
  };
  // ── Library objects ──
  const objects = [];
  const millisNow = () => Math.floor(runner.time * 1e3 + 1e-9);
  // The I2C bus: the family's default pins, or the two an ESP32's Wire.begin(sda, scl) named.
  let bus = board.i2c ?? null;
  const ask = (request) => (typeof runner.ask === 'function' ? runner.ask({ ...request, bus, now: millisNow() }) : null);
  // Wire starting (Wire.begin(), or a library's begin()): on an AVR, twi_init writes SDA and SCL high,
  // which turns on their pins' pull-ups (as INPUT_PULLUP); on an ESP32, Wire.begin(sda, scl) moves the bus.
  const startWire = (sda, scl) => {
    if (board.family === 'uno') {
      for (const n of [bus?.sda, bus?.scl]) if (n != null && pin(n).mode === 'input') set(n, { pull: 'up' });
    } else if (Number.isInteger(Number(sda)) && Number.isInteger(Number(scl)) && Number(sda) >= 0 && Number(scl) >= 0) bus = { sda: Number(sda), scl: Number(scl) };
  };
  // A DHT read: the sensor on the object's pin answers and keeps the library's 2 s cache itself; with
  // nothing there the library still times out every 2 s (its own cache, here on the object).
  function* dhtRead(o, force) {
    const [gpio, type] = o.args;
    if (type !== LIBRARY_CONSTANTS.DHT11) return null; // DHT22 is not in the kit yet: NaN
    // The library drives its pin itself (low for the start signal, then an input with pull-up): a pin
    // the sketch left as an output is the library's for the read, so the line idles high again.
    const taken = gpio != null && pin(gpio).mode === 'output';
    if (taken) api.pinMode(gpio, MODE.INPUT_PULLUP);
    const answer = ask({ cls: 'DHT', method: 'read', pin: gpio, force: Boolean(force), released: taken });
    let real = answer?.real;
    if (!answer) {
      const now = millisNow();
      real = Boolean(force) || o.last == null || now - o.last >= DHT_INTERVAL;
      if (real) o.last = now;
    }
    if (real) {
      api.pinMode(gpio, MODE.INPUT_PULLUP); // the library leaves its pin so after each read
      yield DHT_READ;
    }
    return answer?.ok ? answer : null;
  }
  // A BME280 / BMP280 read: only after a begin() that found the chip, and while it still answers.
  const i2cRead = (o) => (o.begun ? ask({ cls: LIBRARY_CLASSES[o.cls].name, method: 'read', address: o.begun.address, chip: o.begun.chip }) : null);
  const ok = (a) => (a?.ok ? a : null);
  function* i2cBegin(o, address = I2C_DEFAULT_ADDRESS, chip) {
    const want = { address: Math.trunc(Number(address)), chip: chip == null ? LIBRARY_CLASSES[o.cls].chip : Math.trunc(Number(chip)) };
    startWire();
    const answer = ask({ cls: LIBRARY_CLASSES[o.cls].name, method: 'begin', ...want });
    o.begun = answer?.ok ? want : null;
    yield I2C_BEGIN;
    return Boolean(answer?.ok);
  }
  const i2cMethods = (humidity) => [
    // begin(address = 0x77[, chip id]): the BME280's second argument is a bus (&Wire), the BMP280's a chip id.
    function* (o, address, second) {
      return yield* i2cBegin(o, address, humidity ? undefined : second);
    },
    (o) => ok(i2cRead(o))?.temperature ?? Number.NaN,
    (o) => ok(i2cRead(o))?.pressure ?? Number.NaN,
    ...(humidity ? [(o) => ok(i2cRead(o))?.humidity ?? Number.NaN] : []),
    (o, sea = 1013.25) => {
      const a = ok(i2cRead(o));
      return a ? altitudeOf(a.pressure / 100, Number(sea)) : Number.NaN;
    },
    // setSampling(…): the kit's readings do not depend on it (noted when translated).
    () => 0,
    // sensorID(): the chip id begin() read (0 before a begin that found it).
    (o) => o.begun?.chip ?? 0,
    // takeForcedMeasurement(): true while the chip answers (the kit measures all the time).
    (o) => Boolean(ok(i2cRead(o))),
    // seaLevelForAltitude(altitude m, pressure hPa)
    (o, metres, hPa) => seaLevelOf(Number(metres), Number(hPa)),
  ];
  // Each class's methods in the order of LIBRARY_CLASSES[c].methods (the numbers the translator wrote).
  const METHODS = [
    [
      // begin(): the library sets its pin as an input with pull-up and lets the next read be a real one.
      (o) => {
        api.pinMode(o.args[0], MODE.INPUT_PULLUP);
        ask({ cls: 'DHT', method: 'begin', pin: o.args[0] });
        o.last = null;
      },
      // readTemperature(fahrenheit = false, force = false)
      function* (o, fahrenheit = false, force = false) {
        const a = yield* dhtRead(o, force);
        if (!a) return Number.NaN;
        return fahrenheit ? a.temperature * 1.8 + 32 : a.temperature;
      },
      // readHumidity(force = false)
      function* (o, force = false) {
        return (yield* dhtRead(o, force))?.humidity ?? Number.NaN;
      },
      // computeHeatIndex(temperature, humidity, isFahrenheit = true)
      (o, temperature, humidity, isFahrenheit = true) => heatIndex(Number(temperature), Number(humidity), Boolean(isFahrenheit)),
      // convertCtoF(c), convertFtoC(f), as DHT.cpp (its 0.55555 back to °C).
      (o, c) => Number(c) * 1.8 + 32,
      (o, f) => (Number(f) - 32) * 0.55555,
    ],
    i2cMethods(true),
    i2cMethods(false),
  ];
  // The methods that wait (generators): the reads of a DHT and both begin()s.
  const WAITS = new Set([METHODS[0][1], METHODS[0][2], METHODS[1][0], METHODS[2][0]]);
  let program;
  try {
    // eslint-disable-next-line no-new-func
    program = new Function('api', js)(api);
  } catch (e) {
    runner.error = errorText(e, at);
    return runner;
  }
  let gen = program.setup();
  // Turns of a loop since time last passed for the program (a wait, a full serial buffer, pulseIn),
  // across steps; a loop() that returns starts the count again.
  let spins = 0;
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
    // A step past the delay's end (or a program that waits for nothing: a loop() with no delay) leaves
    // no debt: the program goes on from now, and its next delay lasts all it says. A debt carried on
    // would eat the next waits (a loop() that ran for 0.5 s without waiting made a delay(300) last 0 ms).
    if (runner.looking != null) runner.wait = 0;
    else runner.wait = Math.max(0, runner.wait - dt);
    runner.looking = null;
    for (const [n, end] of Object.entries(tones)) if (runner.time >= end) api.noTone(Number(n));
    deliver();
    try {
      watchInterrupts();
    } catch (e) {
      if (e === SLEEP) sleep();
      else runner.error = errorText(e, at);
      return runner.changed;
    }
    let turns = 0;
    // At t = 0 a loop inside one call may take every turn it gets before it is said stuck (settle).
    const budget = dt > 0 ? BUDGET : STUCK_TURNS;
    while (runner.wait <= 1e-12) {
      // Awake again after deep sleep: from setup(), its globals as at power-up.
      if (runner.sleeping) {
        runner.sleeping = null;
        runner.wakes = (runner.wakes ?? 0) + 1;
        boot = runner.time;
        try {
          program = new Function('api', js)(api);
        } catch (e) {
          runner.error = errorText(e, at);
          break;
        }
        gen = program.setup();
        spins = 0;
      }
      let r;
      try {
        r = gen.next();
      } catch (e) {
        if (e === SLEEP) {
          sleep();
          break;
        }
        runner.error = errorText(e, at);
        break;
      }
      // What it printed takes time once its buffer is full: it waits that long.
      if (owed > 0) {
        runner.wait += owed;
        owed = 0;
        spins = 0;
      }
      if (r.done) {
        gen = program.loop();
        spins = 0;
        // A loop() that returns is never stuck: the start gives it the plain budget.
        if (++turns > BUDGET) break;
        continue;
      }
      // pulseIn: nothing new to see before the next step (runner.looking holds its timeout).
      if (r.value === LOOK) {
        spins = 0;
        break;
      }
      if (r.value > 0) {
        runner.wait += r.value;
        spins = 0;
      } else {
        spins++;
        if (++turns > budget) break;
      }
    }
    runner.stuck = spins >= STUCK_TURNS;
    // Until its delay ends, or until pulseIn's timeout while it looks at its pin.
    runner.waitingUntil = runner.looking ?? runner.time + Math.max(0, runner.wait);
    return runner.changed;
  };
  return runner;
}
