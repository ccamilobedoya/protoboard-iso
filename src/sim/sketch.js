// An Arduino sketch (the C++ subset a lesson uses) → JavaScript the simulator runs (program.js).
// Phase M2 of docs/en/microcontrollers.md. No dependencies: the page may carry it.
//
//   translateSketch(source) → { js, issues: [{ code, line, name? }] }
//
// What it reads: global variables and constants, #define NAME value, functions (setup, loop and
// one's own), declarations with their types (int, long, float, bool, byte, unsigned …, arrays
// with { … }), if / else, while, do … while, for, switch, break, continue, return, every C
// operator JavaScript shares, casts like (int) x, char literals, number suffixes (1000UL, 1.5f).
// What it changes: every function becomes a generator, so delay() can wait in simulated time:
// delay(ms) → yield seconds; a call to one's own function or to pulseIn → yield* f(…); loops yield 0 at each turn
// so a loop that never waits cannot freeze the page (program.js gives each step a budget).
// Integer variables keep integer division (7 / 2 → 3) where an int is assigned.
// Library objects (libraries.js, docs/en/library-sensors.md): a GLOBAL `DHT dht(2, DHT11);`,
// `Adafruit_BME280 bme;` or `Adafruit_BMP280 bmp;` declares an object of that class, and
// `dht.readTemperature()` calls one of the class's fixed methods; `Wire.begin(…)` starts the bus
// (__wire); `isnan`, `NAN`, `F("text")`.
// Not read: other classes, pointers, templates, function-like macros, libraries other than those
// (an #include is noted; a call to a function nobody defines returns 0 and is noted).
//
// A sketch is external input (CLAUDE.md, "External input") and its JavaScript runs with
// new Function, in Node and in the page, so what comes out can only reach what the runtime gives:
// - every name the sketch writes gets a "$" (C names cannot have one): count → $count, so a sketch
//   cannot name globalThis, process, Function or the runtime's own helpers;
// - the only member access is Serial.<method>; an index is a number (a[__idx(i)]), never a key
//   such as "constructor";
// - a library object is never named in the code: its declaration is __new(<object>, <class>, args)
//   and a call __lib(<object>, <method>, args), three numbers from the translator's own table
//   (libraries.js), so no text of the sketch becomes a member or a key; an object's name must be
//   followed by .<method>( (anything else is refused), and objects are capped (LIMITS.libraryObjects);
// - text in quotes becomes __str[n], from a list at the top ([].concat("…", …)), so no character of a string
//   lands in the code (a "/" before it could otherwise make a regular expression that ends inside
//   it, and the rest of the string would be code); a "/" where a value goes is refused for the same
//   reason;
// - a program longer than LIMITS.sketchChars is not read.
import { LIMITS } from '../limits.js';
const LIBRARY_OBJECTS = LIMITS.libraryObjects;
import { INT_KIND, INT_KIND_MASK, LIBRARY_CLASSES, LIBRARY_CONSTANTS, LIBRARY_INCLUDES, NOT_IN_KIT, SERIAL_PORT_METHODS, SERIAL_WAITING, UPDATE_OPS, isArduinoName } from './libraries.js';

// The integer kind of a declared type (INT_KIND), or 0: a float, a String, a 64-bit integer (kept
// whole, as before), void. A value stored in a variable of a kind is wrapped to it on the board in use.
function kindOfWords(words) {
  const w = new Set(words);
  const unsigned = w.has('unsigned');
  if (w.has('bool') || w.has('boolean')) return INT_KIND.bool;
  if (w.has('float') || w.has('double') || w.has('String') || w.has('void')) return 0;
  if (w.has('uint64_t') || w.has('int64_t') || words.filter((x) => x === 'long').length > 1) return 0;
  const fixed = { uint8_t: 'u8', byte: 'u8', int8_t: 's8', uint16_t: 'u16', word: 'u16', int16_t: 's16', uint32_t: 'u32', int32_t: 's32', size_t: 'uint' };
  for (const [name, kind] of Object.entries(fixed)) if (w.has(name)) return INT_KIND[kind];
  if (w.has('char')) return INT_KIND[unsigned ? 'u8' : 's8'];
  if (w.has('short')) return INT_KIND[unsigned ? 'u16' : 's16'];
  if (w.has('long')) return INT_KIND[unsigned ? 'u32' : 's32'];
  if (w.has('int') || unsigned || w.has('signed')) return INT_KIND[unsigned ? 'uint' : 'int'];
  return 0;
}
// A number literal's kind by its suffix (1000UL is an unsigned long): what it adds to a chain.
const LITERAL_KIND = { u: INT_KIND.uint, ul: INT_KIND.u32, lu: INT_KIND.u32, l: INT_KIND.s32 };
// Runtime functions that return an unsigned long (an arithmetic chain with one wraps at 2^32).
const U32_API = new Set(['millis', 'micros', 'pulseIn', 'pulseInLong']);
// Operators an arithmetic chain is made of (it wraps as a whole: the remainder of + - * << by 2^n is
// the remainder of its parts); any other operator ends one.
const CHAIN_OPS = new Set(['+', '-', '*', '~', '!', '<<']);
// The calls that change their first argument (Arduino's macros: bitSet(x, n) is x |= 1UL << n).
const BIT_ASSIGN = new Map([['bitSet', 11], ['bitClear', 12], ['bitToggle', 13], ['bitWrite', 14]]);

const TYPES = new Set(['void', 'int', 'long', 'short', 'byte', 'bool', 'boolean', 'char', 'float', 'double', 'unsigned', 'signed', 'size_t', 'word', 'String', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t', 'int8_t', 'int16_t', 'int32_t', 'int64_t']);
const QUALIFIERS = new Set(['const', 'static', 'volatile', 'unsigned', 'signed']);
const INTEGER = new Set(['int', 'long', 'short', 'byte', 'char', 'unsigned', 'signed', 'size_t', 'word', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t', 'int8_t', 'int16_t', 'int32_t', 'int64_t']);
// What the runtime gives (program.js); anything else called and not defined is noted.
export const SKETCH_API = ['pinMode', 'digitalWrite', 'digitalRead', 'analogRead', 'analogWrite', 'millis', 'micros', 'abs', 'min', 'max', 'map', 'constrain', 'random', 'randomSeed', 'sqrt', 'log', 'pow', 'sin', 'cos', 'round', 'floor', 'ceil', 'bitRead', 'bitWrite', 'bitSet', 'bitClear', 'bitToggle', 'ledcAttach', 'ledcAttachPin', 'ledcSetup', 'ledcWrite', 'tone', 'noTone', 'pulseIn', 'pulseInLong', 'isnan', 'esp_sleep_enable_timer_wakeup', 'esp_deep_sleep_start', 'digitalPinToInterrupt', 'attachInterrupt', 'detachInterrupt', 'interrupts', 'noInterrupts', 'shiftOut', 'shiftIn'];
// Runtime functions that wait in simulated time (generators, as one's own functions): yield*.
const WAITING_API = new Set(['pulseIn', 'pulseInLong']);
const SKETCH_CONSTANTS = ['HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'INPUT_PULLDOWN', 'LED_BUILTIN', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'PI', 'TWO_PI', 'HALF_PI', 'DEG_TO_RAD', 'RAD_TO_DEG', 'MSBFIRST', 'LSBFIRST', 'DEC', 'HEX', 'OCT', 'BIN', 'SERIAL_8N1', 'SERIAL_8N2', 'SERIAL_8E1', 'SERIAL_8O1', 'RISING', 'FALLING', 'CHANGE', 'ONLOW', 'ONHIGH', 'Serial', ...Object.keys(LIBRARY_CONSTANTS)];
const ASSIGN = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']);
// Runtime functions that return an integer (an int divided by them stays an int).
const INT_API = new Set(['digitalPinToInterrupt', 'digitalRead', 'analogRead', 'millis', 'micros', 'map', 'random', 'constrain', 'abs', 'min', 'max', 'bitRead', 'pulseIn', 'pulseInLong', 'isnan', 'shiftIn']);
// Runtime functions that return a float (Serial.print shows a float with two decimals, as Arduino).
const FLOAT_API = new Set(['sqrt', 'log', 'pow', 'sin', 'cos']);
const FLOAT_TYPES = new Set(['float', 'double']);
// Library classes by name → their number in LIBRARY_CLASSES (a Map: a name is never a key of an object).
const CLASS_BY_NAME = new Map(LIBRARY_CLASSES.map((c, i) => [c.name, i]));
const KEYWORDS = new Set(['if', 'else', 'while', 'do', 'for', 'switch', 'case', 'default', 'break', 'continue', 'return', 'sizeof', 'new', 'delete', 'NULL', 'delay', 'delayMicroseconds', 'Wire', 'F', 'true', 'false']);
// Serial's methods in the runtime; another one is noted and returns 0.
const SERIAL_METHODS = new Set(['begin', 'print', 'println', 'write', 'available', 'read', 'peek', 'flush', 'setTimeout', 'end']);
// Names written as they are; every other name the sketch writes is its own: "$" + name.
const RAW_NAMES = new Set([...SKETCH_CONSTANTS, 'true', 'false']);
const own = (name) => `$${name}`;
const C_ESCAPES = { n: '\n', t: '\t', r: '\r', 0: '\0', a: '\x07', b: '\b', f: '\f', v: '\v' };
// A string literal's text, with C's escapes read.
const unquote = (s) => s.slice(1, -1).replace(/\\(x[0-9a-fA-F]{1,2}|[\s\S])/g, (_, e) => (e[0] === 'x' && e.length > 1 ? String.fromCharCode(parseInt(e.slice(1), 16)) : C_ESCAPES[e] ?? e));

// ── Tokens ──────────────────────────────────────────────────────────────────────────
const PUNCT = ['<<=', '>>=', '...', '->', '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '::', '+', '-', '*', '/', '%', '<', '>', '=', '!', '~', '&', '|', '^', '?', ':', ';', ',', '.', '(', ')', '[', ']', '{', '}'];

function tokenize(source, issues) {
  const out = [];
  let i = 0;
  let line = 1;
  const at = (s) => source.startsWith(s, i);
  while (i < source.length) {
    const c = source[i];
    if (c === '\n') {
      line++;
      i++;
    } else if (/\s/.test(c)) i++;
    else if (at('//')) while (i < source.length && source[i] !== '\n') i++;
    else if (at('/*')) {
      const end = source.indexOf('*/', i + 2);
      const stop = end < 0 ? source.length : end + 2;
      for (; i < stop; i++) if (source[i] === '\n') line++;
    } else if (c === '#') {
      // A preprocessor line, kept whole.
      let end = source.indexOf('\n', i);
      if (end < 0) end = source.length;
      out.push({ t: 'pre', v: source.slice(i, end).trim(), line });
      i = end;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_]\w*/.exec(source.slice(i))[0];
      out.push({ t: 'id', v: m, line });
      i += m.length;
    } else if (/\d/.test(c) || (c === '.' && /\d/.test(source[i + 1]))) {
      const m = /^(0[xX][0-9a-fA-F]+|0[bB][01]+|\d*\.?\d+(?:[eE][+-]?\d+)?)([uUlLfF]*)/.exec(source.slice(i));
      out.push({ t: 'num', v: m[1], suffix: m[2].toLowerCase(), line });
      i += m[0].length;
    } else if (c === '"') {
      let j = i + 1;
      while (j < source.length && source[j] !== '"') j += source[j] === '\\' ? 2 : 1;
      if (j >= source.length) {
        issues.push({ code: 'SIM_PROGRAM_ERROR', line, message: '"' });
        break;
      }
      out.push({ t: 'str', v: source.slice(i, j + 1), value: unquote(source.slice(i, j + 1)), line });
      i = j + 1;
    } else if (c === "'") {
      const m = /^'(\\.|[^'])'/.exec(source.slice(i));
      if (!m) {
        issues.push({ code: 'SIM_PROGRAM_ERROR', line, message: "'" });
        i++;
        continue;
      }
      const ch = m[1].startsWith('\\') ? { n: '\n', t: '\t', r: '\r', 0: '\0', '\\': '\\', "'": "'" }[m[1][1]] ?? m[1][1] : m[1];
      out.push({ t: 'num', v: String(ch.charCodeAt(0)), line, char: true });
      i += m[0].length;
    } else {
      const p = PUNCT.find((s) => at(s));
      if (!p) {
        issues.push({ code: 'SIM_PROGRAM_ERROR', line, message: c });
        i++;
        continue;
      }
      out.push({ t: 'p', v: p, line });
      i += p.length;
    }
  }
  return out;
}

class SketchError extends Error {
  constructor(line, message, code = 'SIM_PROGRAM_ERROR', name = null) {
    super(message);
    this.line = line;
    this.code = code;
    this.name = name;
  }
}

// ── Translation ─────────────────────────────────────────────────────────────────────
// strings: the list of quoted texts, shared with a #define's value (translateSketchExpression).
export function translateSketch(source, { strings = [] } = {}) {
  const issues = [];
  const text = String(source ?? '');
  if (text.length > LIMITS.sketchChars) return { js: null, issues: [{ code: 'SIM_PROGRAM_TOO_LARGE', line: 1, size: text.length, limit: LIMITS.sketchChars }] };
  const tokens = tokenize(text, issues);
  let pos = 0;
  const peek = (k = 0) => tokens[pos + k];
  const is = (v, k = 0) => peek(k)?.v === v && peek(k)?.t !== 'str';
  const line = () => (peek() ?? tokens[tokens.length - 1] ?? { line: 1 }).line;
  const fail = (message) => {
    throw new SketchError(line(), message);
  };
  const expect = (v) => {
    if (!is(v)) fail(`${v}`);
    return tokens[pos++];
  };

  // Names: the functions the sketch defines (their calls become yield*), and each scope's
  // integer variables (assignments to them keep integer division).
  const functions = new Set();
  const intFunctions = new Set();
  const floatFunctions = new Set();
  const charFunctions = new Set(); // functions that return a plain char (print shows its letter)
  const fnKinds = new Map(); // function → the integer kind it returns (INT_KIND), when it has one
  for (let k = 0; k + 2 < tokens.length; k++) {
    if (tokens[k].t === 'id' && TYPES.has(tokens[k].v) && tokens[k + 1].t === 'id' && tokens[k + 2].v === '(') {
      functions.add(tokens[k + 1].v);
      const words = [];
      for (let j = k; j >= 0 && tokens[j].t === 'id' && (TYPES.has(tokens[j].v) || QUALIFIERS.has(tokens[j].v)); j--) words.push(tokens[j].v);
      fnKinds.set(tokens[k + 1].v, kindOfWords(words));
      if (INTEGER.has(tokens[k].v)) intFunctions.add(tokens[k + 1].v);
      if (FLOAT_TYPES.has(tokens[k].v)) floatFunctions.add(tokens[k + 1].v);
      if (tokens[k].v === 'char' && !['unsigned', 'signed'].includes(tokens[k - 1]?.v)) charFunctions.add(tokens[k + 1].v);
    }
  }
  // Whether the term just read is an integer (for division): set by term().
  let termInt = false;
  let exprInt = false; // whether the expression just read has only integer terms
  // Whether the term just read is a float, and whether the expression just read has one (Serial.print
  // shows it with two decimals, as Arduino's print(float) does).
  let termFloat = false;
  let exprFloat = false;
  let typeFloat = false; // the type readType() just read is float or double
  // Whether the term or the expression just read is a plain char ('A', a char variable, (char) x, a
  // function returning char): Serial.print shows it as its letter, as Print::print(char) does. Any
  // arithmetic on it is an int (C's promotion), so only a single term keeps it.
  let termChar = false;
  let exprChar = false;
  let typeChar = false; // the type readType() just read is plain char (not signed or unsigned char)
  // The integer kind readType() just read (INT_KIND, 0 for none), and what the term or expression just
  // read adds to an arithmetic chain (INT_KIND_MASK bits: an unsigned long in it makes it wrap at 2^32).
  let typeKind = 0;
  let termMask = 0;
  let exprMask = 0;
  let exprPure = null; // the expression just read is one x++: its form without the old value
  // Library objects (libraries.js): name → { k: its number, cls: its class's number }. A Map, so a
  // name such as "constructor" is never looked up as a key of an object.
  const objects = new Map();
  let inFunction = false; // a library call waits (yield*): only inside a function's body
  const defineText = new Map(); // #define name → its text (a DHTTYPE that says DHT22)
  const defineLines = new Map(); // #define name → its line
  const missing = new Set();
  // A library the kit does not have (#include <WiFi.h>): its objects (`Servo s;`, `WiFi`) and their
  // calls do nothing and return 0, under the one line the #include gets (SIM_PROGRAM_LIBRARY).
  let unknownLibrary = false;
  const foreign = new Set();
  // A name used and never declared: a real board refuses to compile it (noted once, with its line).
  const undeclared = new Set();
  const declared = (name) => typeOf(name) != null || functions.has(name) || defined.includes(name) || objects.has(name) || foreign.has(name);
  const noteUndeclared = (name, at) => {
    if (undeclared.has(name)) return;
    undeclared.add(name);
    issues.push({ code: 'SIM_PROGRAM_UNDECLARED', line: at, name });
  };
  // A call the runtime does not know: noted once (it returns 0). Its name stays out of the code.
  const noteMissing = (name, at) => {
    if (missing.has(name)) return;
    missing.add(name);
    issues.push({ code: 'SIM_PROGRAM_UNSUPPORTED', line: at, name });
  };
  let returnsInt = false; // the function being read returns an integer type
  let returnKind = 0; // and its kind
  const scopes = [new Map()];
  const isInt = (type) => type === 'int' || type === 'char';
  const typeOf = (name) => {
    for (let s = scopes.length - 1; s >= 0; s--) if (scopes[s].has(name)) return scopes[s].get(name);
    return null;
  };
  // A name declared in the innermost scope, with its integer kind (each scope keeps its own).
  const declare = (name, tag, kind) => {
    const scope = scopes[scopes.length - 1];
    scope.set(name, tag);
    (scope.kinds ??= new Map()).set(name, kind);
  };
  const kindOf = (name) => {
    for (let s = scopes.length - 1; s >= 0; s--) if (scopes[s].has(name)) return scopes[s].kinds?.get(name) ?? 0;
    return 0;
  };
  // A variable whose stores are wrapped (an integer kind) or truncated (a 64-bit integer, as before).
  const integerVar = (name) => Boolean(kindOf(name)) || isInt(typeOf(name));
  // A value stored as the variable's kind: wrapped on the board (__w), or truncated (__int).
  const store = (kind, value) => (kind ? `__w(${value}, ${kind})` : `__int(${value})`);

  const isTypeStart = (k = 0) => {
    const t = peek(k);
    return t?.t === 'id' && (TYPES.has(t.v) || QUALIFIERS.has(t.v));
  };
  // A type: qualifiers and type words ("const unsigned long"); returns whether it is an integer.
  function readType() {
    let integer = false;
    let any = false;
    typeFloat = false;
    const words = [];
    while (peek()?.t === 'id' && (TYPES.has(peek().v) || QUALIFIERS.has(peek().v))) {
      words.push(peek().v);
      if (INTEGER.has(peek().v)) integer = true;
      if (FLOAT_TYPES.has(peek().v)) typeFloat = true;
      if (TYPES.has(peek().v)) any = true;
      pos++;
    }
    if (!any) fail('type');
    typeChar = words.includes('char') && !words.includes('unsigned') && !words.includes('signed');
    typeKind = kindOfWords(words);
    return integer;
  }

  // An expression up to (not including) one of the stop tokens, as JavaScript. A division whose
  // two sides are integers stays integer, as in C: a * b / c → __div((a * b), c); a remainder of two
  // integers is __mod (both warn of a zero divisor).
  // Where an integer variable or element is written (x = v, x += v, x++, ++a[i]): the value stored is
  // wrapped to its kind, as the board stores it (a byte at 255 plus 1 is 0). null when what is ahead
  // is not a write to an integer variable (the expression reads it as before). A write that is a whole
  // statement (x++;) is `pure`: the same without keeping the old value.
  function lvalue(stops) {
    let k = 0;
    const prefix = is('++') || is('--') ? peek().v : null;
    if (prefix) k++;
    const name = peek(k);
    if (name?.t !== 'id' || !integerVar(name.v) || is('(', k + 1)) return null;
    let after = k + 1;
    if (is('[', after)) {
      let depth = 0;
      for (; pos + after < tokens.length; after++) {
        const x = peek(after);
        if (x.t !== 'p') continue;
        if (x.v === '[') depth++;
        else if (x.v === ']' && --depth === 0) break;
      }
      after++;
      if (is('[', after)) return null; // a[i][j]: arrays have one dimension (refused where declared)
    }
    const op = peek(after);
    const assign = !prefix && op?.t === 'p' && ASSIGN.has(op.v);
    const post = !prefix && op?.t === 'p' && (op.v === '++' || op.v === '--');
    if (!prefix && !assign && !post) return null;
    const kind = kindOf(name.v);
    const own_ = own(name.v);
    pos += k + 1;
    let index = null;
    if (is('[')) {
      pos++;
      index = expression([']']);
      expect(']');
    }
    let rhs = '';
    if (assign || post) pos++;
    if (assign) {
      rhs = expression([...stops, ',']);
      if (!rhs.trim()) fail(op.v);
    }
    const sign = (prefix ?? op.v)[0];
    if (index != null) {
      const where = `${own_}, __idx(${index}, ${own_})`;
      if (prefix) return { code: `__upd(${where}, ${UPDATE_OPS.indexOf(`${sign}=`)}, ${kind}, 1)` };
      if (post) return { code: `__upd(${where}, ${UPDATE_OPS.indexOf(`post${op.v}`)}, ${kind})` };
      if (op.v === '=') return { code: `${own_}[__idx(${index}, ${own_})] = ${store(kind, rhs)}` };
      return { code: `__upd(${where}, ${UPDATE_OPS.indexOf(op.v)}, ${kind}, ${rhs})` };
    }
    if (prefix || post) {
      const next = `(${own_} = ${store(kind, `${own_} ${sign} 1`)})`;
      return prefix ? { code: next } : { code: `__post(${own_}, ${next})`, pure: next };
    }
    if (op.v === '=') return { code: `${own_} = ${store(kind, rhs)}` };
    if (op.v === '/=') return { code: `${own_} = ${store(kind, `__div(${own_}, (${rhs}))`)}` };
    if (op.v === '%=') return { code: `${own_} = ${store(kind, `__mod(${own_}, (${rhs}))`)}` };
    return { code: `${own_} = ${store(kind, `${own_} ${op.v.slice(0, -1)} (${rhs})`)}` };
  }

  function expression(stops) {
    const parts = [];
    const ints = []; // per part: an integer term, or null for an operator
    const floats = []; // per part: a float term
    const chars = []; // per part: a plain char term
    const masks = []; // per part: what it adds to an arithmetic chain (INT_KIND_MASK)
    let value = true; // whether a value comes next (and not an operator)
    let pure = null; // a statement that is one x++: its plain form
    while (pos < tokens.length) {
      const t = peek();
      if (t.t === 'p' && (stops.includes(t.v) || [')', ']', '}'].includes(t.v))) break;
      if (value) {
        const write = lvalue(stops);
        if (write) {
          parts.push(write.code);
          ints.push(true);
          floats.push(false);
          chars.push(false);
          masks.push(0);
          if (write.pure) pure = write;
          value = false;
          continue;
        }
      }
      // An index belongs to the value before it: a[i] / 2 divides the element.
      if (t.t === 'p' && t.v === '[' && parts.length && !value) {
        pos++;
        const index = expression([']']);
        expect(']');
        // An array named alone is passed too, so the runtime checks the index against its length
        // (a read or a write outside it is warned; the kit reads 0 and drops the write).
        const base = parts[parts.length - 1];
        parts[parts.length - 1] += /^\$\w+$/.test(base) ? `[__idx(${index}, ${base})]` : `[__idx(${index})]`;
        continue;
      }
      // Where a value goes, a "/" would start a regular expression in JavaScript.
      if (value && t.t === 'p' && (t.v === '/' || t.v === '/=')) fail(t.v);
      // &Wire (an Adafruit begin's bus argument): the one bus there is, a 0 that nothing reads.
      if (value && t.t === 'p' && t.v === '&' && peek(1)?.t === 'id' && peek(1).v === 'Wire' && !is('.', 2)) {
        pos += 2;
        parts.push('0');
        ints.push(true);
        floats.push(false);
        chars.push(false);
        masks.push(0);
        value = false;
        continue;
      }
      const isOp = t.t === 'p' && t.v !== '(';
      // Two values in a row (`2 3`, `x "a"`) are not C; in JavaScript they would not parse.
      if (!isOp && !value && t.v !== '(') fail(t.t === 'str' ? '"' : t.v);
      termInt = false;
      termFloat = false;
      termChar = false;
      termMask = 0;
      parts.push(term());
      ints.push(isOp ? null : termInt);
      floats.push(!isOp && termFloat);
      chars.push(!isOp && termChar);
      masks.push(isOp ? 0 : termMask);
      // After a value an operator comes, except after x++ / x--; after an operator, a value.
      if (!isOp) value = false;
      else if (!(['++', '--'].includes(t.v) && !value)) value = true;
    }
    for (let i = 1; i + 1 < parts.length; i++) {
      if (!['/', '%'].includes(parts[i]) || ints[i] !== null) continue;
      // The left side: the operands joined by * / % before it (they bind as tightly).
      let j = i - 1;
      while (j >= 2 && ['*', '/', '%'].includes(parts[j - 1]) && ints[j - 1] === null) j -= 2;
      const left = parts.slice(j, i);
      const leftInt = left.every((part, k) => (k % 2 ? true : ints[j + k]));
      if (!leftInt || !ints[i + 1]) continue;
      // __div and __mod: C's integer division and remainder, with a division by zero warned (the
      // runtime's, program.js).
      const merged = `${parts[i] === '/' ? '__div' : '__mod'}((${left.join(' ')}), ${parts[i + 1]})`;
      const mask = masks.slice(j, i + 2).reduce((a, b) => a | b, 0);
      parts.splice(j, i + 2 - j, merged);
      ints.splice(j, i + 2 - j, true);
      floats.splice(j, i + 2 - j, false);
      chars.splice(j, i + 2 - j, false);
      masks.splice(j, i + 2 - j, mask);
      i = j;
    }
    // An arithmetic chain of integers with an unsigned one in it (now - start, two unsigned longs)
    // wraps as C's type of the result does on the board: __u(chain, mask), program.js. Signed chains
    // are left as they are (an int that overflows is undefined in C).
    for (let k = 0; k < parts.length; k++) {
      let e = k;
      let mask = 0;
      let integer = true;
      let ops = 0;
      for (; e < parts.length && (ints[e] !== null || CHAIN_OPS.has(parts[e])); e++) {
        if (ints[e] === null) ops++;
        else {
          mask |= masks[e];
          if (!ints[e]) integer = false;
        }
      }
      if (ops && integer && mask & 7 && e - k > 1) {
        parts.splice(k, e - k, `__u((${parts.slice(k, e).join(' ')}), ${mask})`);
        ints.splice(k, e - k, true);
        floats.splice(k, e - k, false);
        chars.splice(k, e - k, false);
        masks.splice(k, e - k, mask);
        e = k + 1;
      }
      k = e;
    }
    exprMask = parts.every((p, k) => ints[k] !== null || CHAIN_OPS.has(p)) ? masks.reduce((a, b) => a | b, 0) : 0;
    exprPure = pure && parts.length === 1 && parts[0] === pure.code ? pure.pure : null;
    exprInt = parts.length > 0 && ints.every((k) => k !== false);
    // A float result: a comparison or a logical operator gives an int (C's 0 or 1); a ternary is float
    // only when one of its branches is.
    const op = (k, ...names) => ints[k] === null && names.includes(parts[k]);
    const ask = parts.findIndex((_, k) => op(k, '?'));
    if (ask >= 0) {
      const colon = parts.findIndex((_, k) => k > ask && op(k, ':'));
      exprFloat = floats.slice(ask + 1, colon < 0 ? undefined : colon).some(Boolean) || (colon >= 0 && floats.slice(colon + 1).some(Boolean));
    } else exprFloat = !parts.some((_, k) => op(k, '==', '!=', '<', '>', '<=', '>=', '&&', '||', '!')) && floats.some(Boolean);
    // A char: one char term alone, or a ternary whose two branches are each one char term.
    const oneChar = (from, to) => to - from === 1 && chars[from];
    if (ask >= 0) {
      const colon = parts.findIndex((_, k) => k > ask && op(k, ':'));
      exprChar = colon >= 0 && oneChar(ask + 1, colon) && oneChar(colon + 1, parts.length);
    } else exprChar = oneChar(0, parts.length);
    return parts.join(' ');
  }
  // One token of an expression, turning calls, casts and C-only words into JavaScript.
  function term() {
    const t = tokens[pos];
    // A cast: (int) x, (float) (a / b).
    if (t.v === '(' && t.t === 'p' && isTypeStart(1)) {
      let k = 1;
      while (peek(k)?.t === 'id' && (TYPES.has(peek(k).v) || QUALIFIERS.has(peek(k).v))) k++;
      if (peek(k)?.v === ')') {
        const integer = tokens.slice(pos + 1, pos + k).some((x) => INTEGER.has(x.v));
        const float = tokens.slice(pos + 1, pos + k).some((x) => FLOAT_TYPES.has(x.v));
        const words = tokens.slice(pos + 1, pos + k).map((x) => x.v);
        const kind = kindOfWords(words);
        pos += k + 1;
        const operand = term();
        termInt = integer || kind === INT_KIND.bool;
        termFloat = float && !integer;
        termChar = words.includes('char') && !words.includes('unsigned') && !words.includes('signed');
        termMask = INT_KIND_MASK[kind];
        return integer || kind ? store(kind, operand) : `(${operand})`;
      }
    }
    // A class's own constant (Adafruit_BME280::MODE_FORCED, an argument of setSampling): 0.
    if (t.t === 'id' && CLASS_BY_NAME.has(t.v) && is('::', 1) && peek(2)?.t === 'id') {
      pos += 3;
      termInt = true;
      return '0';
    }
    // A library class's name only declares an object, at the top level (see the top-level loop).
    if (t.t === 'id' && CLASS_BY_NAME.has(t.v)) throw new SketchError(t.line, t.v);
    // A library object: name.method(…), the method from its class's fixed list, as numbers.
    if (t.t === 'id' && objects.has(t.v)) {
      const object = objects.get(t.v);
      const method = peek(2);
      if (!is('.', 1) || method?.t !== 'id' || !is('(', 3)) throw new SketchError(t.line, t.v);
      if (!inFunction) throw new SketchError(t.line, `${t.v}.${method.v}`);
      pos += 4;
      const args = expression([')']);
      expect(')');
      const cls = LIBRARY_CLASSES[object.cls];
      const m = cls.methods.indexOf(method.v);
      if (m < 0) {
        noteMissing(`${t.v}.${method.v}`, t.line);
        termFloat = false;
        return `__missing(0${args ? `, ${args}` : ''})`;
      }
      termFloat = cls.floats.includes(method.v);
      if (cls.ignored?.includes(method.v) && !missing.has(`${t.v}.${method.v}`)) {
        missing.add(`${t.v}.${method.v}`);
        issues.push({ code: 'SIM_PROGRAM_IGNORED', line: t.line, name: `${t.v}.${method.v}` });
      }
      return `(yield* __lib(${object.k}, ${m}${args ? `, ${args}` : ''}))`;
    }
    // Wire.begin(…): starts the bus (an AVR turns on its pins' pull-ups; an ESP32's two pins say where
    // the bus is): __wire(args). Its other methods are noted.
    if (t.t === 'id' && t.v === 'Wire') {
      const method = peek(2);
      if (!is('.', 1) || method?.t !== 'id' || !is('(', 3)) throw new SketchError(t.line, t.v);
      pos += 4;
      const args = expression([')']);
      expect(')');
      if (method.v !== 'begin') {
        noteMissing(`Wire.${method.v}`, t.line);
        return `__missing(0${args ? `, ${args}` : ''})`;
      }
      return `__wire(${args})`;
    }
    // An object of a library the kit does not have (lcd.print(…), WiFi.begin(…), a chain of them): the
    // arguments are evaluated, the call does nothing and returns 0. No name of it reaches the code.
    if (t.t === 'id' && is('.', 1) && t.v !== 'Serial' && (foreign.has(t.v) || (unknownLibrary && !declared(t.v)))) {
      pos++;
      const args = [];
      while (is('.') && peek(1)?.t === 'id') {
        pos += 2;
        if (is('(')) {
          pos++;
          const a = expression([')']);
          expect(')');
          if (a.trim()) args.push(a);
        }
      }
      termInt = true;
      return `__missing(0${args.length ? `, ${args.join(', ')}` : ''})`;
    }
    // ESP.deepSleep(µs): an ESP32's deep sleep (the runtime's __deepSleep); ESP's other methods are noted.
    if (t.t === 'id' && t.v === 'ESP' && is('.', 1) && peek(2)?.t === 'id' && is('(', 3) && !declared('ESP')) {
      const method = peek(2).v;
      pos += 4;
      const args = expression([')']);
      expect(')');
      if (method === 'deepSleep') return `__deepSleep(${args})`;
      noteMissing(`ESP.${method}`, t.line);
      return `__missing(0${args ? `, ${args}` : ''})`;
    }
    // Serial1.print(…), Serial2.begin(…), and Serial's methods that wait for what arrives
    // (Serial.parseInt()): __serial(<port>, <method>, …), two numbers (SERIAL_PORT_METHODS), a generator.
    const port = t.t === 'id' ? ['Serial', 'Serial1', 'Serial2'].indexOf(t.v) : -1;
    if (port >= 0 && !declared(t.v) && is('.', 1) && peek(2)?.t === 'id' && is('(', 3) && (port > 0 || SERIAL_WAITING.includes(peek(2).v))) {
      const method = peek(2);
      const m = SERIAL_PORT_METHODS.indexOf(method.v);
      if (!inFunction) throw new SketchError(t.line, `${t.v}.${method.v}`);
      pos += 4;
      const first = is(')') ? '' : expression([',', ')']);
      const kind = exprFloat ? 1 : exprChar ? 2 : 0;
      const rest = [];
      while (is(',')) {
        pos++;
        rest.push(expression([',', ')']));
      }
      expect(')');
      termFloat = method.v === 'parseFloat';
      termChar = false;
      termInt = ['available', 'read', 'peek', 'parseInt', 'write'].includes(method.v);
      if (m < 0) {
        noteMissing(`${t.v}.${method.v}`, t.line);
        return `__missing(0${[first, ...rest].filter((a) => a.trim()).map((a) => `, ${a}`).join('')})`;
      }
      // print and println carry what C++ would print, as Serial's do (the digits, then the kind).
      const args = ['print', 'println'].includes(method.v) && first ? [first, rest[0] || 'undefined', String(kind)] : [first, ...rest].filter((a) => a.trim());
      return `(yield* __serial(${port}, ${m}${args.map((a) => `, ${a}`).join('')}))`;
    }
    // Serial1 or Serial2 alone (while (!Serial2)): a port is always ready here.
    if (port > 0 && !declared(t.v) && !is('.', 1)) {
      pos++;
      termInt = true;
      return '1';
    }
    // Serial.println(…): the one object with methods. Any other "." is refused.
    if (t.t === 'id' && t.v === 'Serial' && is('.', 1)) {
      const method = peek(2);
      if (method?.t !== 'id' || !is('(', 3)) throw new SketchError(t.line, '.');
      pos += 4;
      // print and println: a float shows with two decimals (a third argument the runtime reads).
      if (method.v === 'print' || method.v === 'println') {
        const first = is(')') ? '' : expression([',']);
        const float = Boolean(first) && exprFloat;
        const char = Boolean(first) && exprChar;
        let digits = '';
        if (is(',')) {
          pos++;
          digits = expression([')']);
        }
        expect(')');
        termFloat = false;
        termChar = false;
        // The third argument says what C++ would print: 1 a float (digits after the point), 2 a char
        // (its letter; with a second argument, a number in that base, as print(int, base)).
        if (float) return `Serial.${method.v}(${first}, ${digits || 'undefined'}, 1)`;
        if (char) return `Serial.${method.v}(${first}, ${digits || 'undefined'}, 2)`;
        return `Serial.${method.v}(${first}${digits ? `, ${digits}` : ''})`;
      }
      const args = expression([')']);
      expect(')');
      termFloat = false;
      if (SERIAL_METHODS.has(method.v)) return `Serial.${method.v}(${args})`;
      noteMissing(`Serial.${method.v}`, t.line);
      return `__missing(0${args ? `, ${args}` : ''})`;
    }
    // bitSet(x, n), bitClear, bitToggle, bitWrite(x, n, b): Arduino's macros assign to their first
    // argument (x |= 1UL << n), which must be a variable or an array element; anything else is a
    // compiler error on a board, noted, and the call only gives the value it computes.
    if (t.t === 'id' && BIT_ASSIGN.has(t.v) && !functions.has(t.v) && is('(', 1)) {
      const target = peek(2);
      let after = 3;
      if (target?.t === 'id' && typeOf(target.v) != null && is('[', 3)) {
        let depth = 0;
        for (; pos + after < tokens.length; after++) {
          const x = peek(after);
          if (x.t !== 'p') continue;
          if (x.v === '[') depth++;
          else if (x.v === ']' && --depth === 0) break;
        }
        after++;
      }
      if (target?.t === 'id' && typeOf(target.v) != null && is(',', after)) {
        const op = BIT_ASSIGN.get(t.v);
        const kind = kindOf(target.v);
        const name = own(target.v);
        pos += 3;
        let index = null;
        if (is('[')) {
          pos++;
          index = expression([']']);
          expect(']');
        }
        expect(',');
        const args = expression([')']);
        expect(')');
        termInt = true;
        termMask = INT_KIND_MASK[kind];
        if (index != null) return `__upd(${name}, __idx(${index}, ${name}), ${op}, ${kind}, ${args})`;
        const value = `${t.v}(${name}, ${args})`;
        return `(${name} = ${integerVar(target.v) ? store(kind, value) : value})`;
      }
      if (!missing.has(`lvalue ${t.v}`)) {
        missing.add(`lvalue ${t.v}`);
        issues.push({ code: 'SIM_PROGRAM_NOT_LVALUE', line: t.line, name: t.v });
      }
    }
    if (t.t === 'id' && peek(1)?.v === '(') {
      const name = t.v;
      pos += 2;
      const args = expression([')']);
      expect(')');
      termInt = intFunctions.has(name) || INT_API.has(name);
      termFloat = floatFunctions.has(name) || FLOAT_API.has(name) || FLOAT_TYPES.has(name);
      termChar = charFunctions.has(name) || name === 'char';
      termMask = functions.has(name) ? INT_KIND_MASK[fnKinds.get(name) ?? 0] : U32_API.has(name) ? 1 : 0;
      // __ms, __us: the wait in seconds, read as the unsigned number C passes (a negative delay is a
      // very long one, warned).
      if (name === 'delay') return `(yield __ms(${args}))`;
      // F("text"): the text itself (on a board it keeps the string in flash).
      if (name === 'F') {
        if (!args.trim()) throw new SketchError(t.line, 'F()');
        return `(${args})`;
      }
      if (name === 'delayMicroseconds') return `(yield __us(${args}))`;
      if (functions.has(name)) return `(yield* ${own(name)}(${args}))`;
      if (WAITING_API.has(name)) return `(yield* ${name}(${args}))`;
      if (SKETCH_API.includes(name)) return `${name}(${args})`;
      // int(x), byte(x), long(x), float(x): as a cast (word(h, l) and the rest as before).
      if (TYPES.has(name)) {
        const kind = name === 'word' ? 0 : kindOfWords([name]);
        termMask = INT_KIND_MASK[kind];
        if (kind) return store(kind, `(${args})`);
        return INTEGER.has(name) ? `__int(${args})` : `(${args})`;
      }
      noteMissing(name, t.line);
      return `__missing(0${args ? `, ${args}` : ''})`;
    }
    if (t.t === 'p' && t.v === '(') {
      pos++;
      const inner = expression([]);
      expect(')');
      termInt = exprInt;
      termFloat = exprFloat;
      termChar = exprChar;
      termMask = exprMask;
      return `(${inner})`;
    }
    pos++;
    if (t.t === 'str') return `__str[${strings.push(t.value) - 1}]`;
    if (t.t === 'num') {
      termInt = /^(\d+|0[xX][0-9a-fA-F]+|0[bB][01]+)$/.test(t.v);
      termFloat = !/^0[xXbB]/.test(t.v) && /[.eE]/.test(t.v);
      termChar = Boolean(t.char);
      termMask = INT_KIND_MASK[LITERAL_KIND[t.suffix] ?? 0];
      // C's octal (010 is 8): the code is strict, where JavaScript has no such literal.
      if (/^0[0-7]+$/.test(t.v)) return String(Number.parseInt(t.v, 8));
      if (/^0\d+$/.test(t.v)) throw new SketchError(t.line, t.v);
    }
    if (t.t === 'id') termChar = typeOf(t.v) === 'char';
    if (t.t === 'id') termInt = isInt(typeOf(t.v)) || kindOf(t.v) === INT_KIND.bool || ['HIGH', 'LOW', 'LED_BUILTIN', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'].includes(t.v) || defines.has(t.v);
    if (t.t === 'id') termFloat = typeOf(t.v) === 'float' || t.v === 'PI';
    if (t.t === 'id') termMask = INT_KIND_MASK[kindOf(t.v)];
    if (t.t === 'id' && t.v === 'NULL') return '0';
    if (t.t === 'id' && (t.v === 'sizeof' || t.v === 'new' || t.v === 'delete')) throw new SketchError(t.line, t.v);
    if (t.t === 'p' && ['->', '::', '.', '[', '{'].includes(t.v)) throw new SketchError(t.line, t.v);
    if (t.t === 'id' && !RAW_NAMES.has(t.v) && !declared(t.v) && !isArduinoName(t.v)) {
      // With a library the kit does not have, a constant of its own (WL_CONNECTED, POSITIVE) reads 0.
      if (unknownLibrary && /^[A-Z][A-Z0-9_]*$/.test(t.v)) {
        termInt = true;
        return '0';
      }
      noteUndeclared(t.v, t.line);
    }
    if (t.t === 'id') return RAW_NAMES.has(t.v) ? t.v : own(t.v);
    return t.v;
  }

  // A statement or a for's step: an expression, whose writes to integer variables lvalue() wraps; a
  // lone x++ without the old value it would give (nothing reads it).
  const assignment = (stops) => {
    const e = expression(stops);
    return exprPure ?? e;
  };

  // A declaration list after its type: a = 1, b[3] = {1, 2, 3}; → let a = 1, b = [1, 2, 3].
  function declarators(integer, keyword, stops) {
    const out = [];
    const float = typeFloat && !integer;
    const kind = typeKind;
    for (;;) {
      if (peek()?.t !== 'id') fail('name');
      const name = tokens[pos++].v;
      if (objects.has(name)) fail(name);
      declare(name, integer ? (typeChar ? 'char' : 'int') : float ? 'float' : 'num', kind);
      let array = false;
      let size = null;
      while (is('[')) {
        // Arrays have one dimension in the kit (const int C[6][3] is refused with its own line).
        if (array) throw new SketchError(line(), '[', 'SIM_PROGRAM_ARRAY_DIMENSIONS', name);
        pos++;
        size = is(']') ? null : expression([']']);
        expect(']');
        array = true;
      }
      let value = array ? `__array(${size ?? 0})` : '0';
      if (is('=')) {
        pos++;
        if (is('{')) {
          pos++;
          const items = [];
          while (!is('}')) {
            if (pos >= tokens.length) fail('}');
            const item = expression([',', '}']);
            // Each element as the array's kind (byte a[] = {300} holds 44), a text as it is.
            items.push(kind && exprInt ? store(kind, item) : item);
            if (is(',')) pos++;
          }
          expect('}');
          // As long as its size (int a[5] = {1, 2} has five elements, the rest 0), or as its list.
          value = `__array(${size ?? 0}, [${items.join(', ')}])`;
        } else {
          const v = expression([',', ...stops]);
          if (!v.trim()) fail('=');
          value = array ? v : kind ? store(kind, v) : integer ? `__int(${v})` : v;
        }
      }
      out.push(`${own(name)} = ${value}`);
      if (is(',')) {
        pos++;
        continue;
      }
      break;
    }
    return `${keyword} ${out.join(', ')}`;
  }

  // The blocks open now, by the line of their "{": a sketch that ends inside one, or a function
  // defined inside one, has a brace never closed (SIM_PROGRAM_BRACE names where the block opened).
  const open = [];
  const unclosed = () => {
    throw new SketchError(open[open.length - 1] ?? line(), '{', 'SIM_PROGRAM_BRACE');
  };
  function block() {
    open.push(peek()?.line ?? line());
    expect('{');
    scopes.push(new Map());
    const body = [];
    while (!is('}')) {
      if (pos >= tokens.length) unclosed();
      body.push(statement());
    }
    pos++;
    open.pop();
    scopes.pop();
    return `{ ${body.join(' ')} }`;
  }
  // A function's definition where a statement goes (`void blink() {` inside loop()'s braces): the
  // block before it was never closed.
  const definesFunction = () => {
    let k = 0;
    while (peek(k)?.t === 'id' && (TYPES.has(peek(k).v) || QUALIFIERS.has(peek(k).v))) k++;
    if (k === 0 || peek(k)?.t !== 'id' || !is('(', k + 1)) return false;
    let depth = 0;
    for (let j = pos + k + 1; j < tokens.length; j++) {
      if (tokens[j].t !== 'p') continue;
      if (tokens[j].v === '(') depth++;
      else if (tokens[j].v === ')' && --depth === 0) return tokens[j + 1]?.t === 'p' && tokens[j + 1].v === '{';
    }
    return false;
  };
  // A body that may be one statement: always a block in JavaScript, with the loop's turn.
  const loopBody = () => {
    const body = is('{') ? block() : `{ ${statement()} }`;
    return `{ ${body.slice(1, -1)} yield 0; }`;
  };
  // A statement inside a function says its line first (__at: the runtime's warnings and errors name
  // it).
  function statement() {
    const t = peek();
    if (!t) unclosed();
    const body = statementBody();
    return inFunction && body && !body.startsWith('{') ? `__at(${t.line}); ${body}` : body;
  }
  function statementBody() {
    const t = peek();
    if (is('{')) return block();
    if (open.length && isTypeStart() && definesFunction()) unclosed();
    if (t.t === 'pre') {
      pos++;
      return '';
    }
    if (t.t === 'id') {
      // A library object is declared at the top level only (as the libraries' examples do).
      if (CLASS_BY_NAME.has(t.v)) fail(t.v);
      switch (t.v) {
        case 'if': {
          pos++;
          expect('(');
          const cond = expression([]);
          expect(')');
          const then = is('{') ? block() : `{ ${statement()} }`;
          if (is('else')) {
            pos++;
            return `if (${cond}) ${then} else ${is('{') ? block() : `{ ${statement()} }`}`;
          }
          return `if (${cond}) ${then}`;
        }
        case 'while': {
          pos++;
          expect('(');
          const cond = expression([]);
          expect(')');
          return `while (${cond}) ${loopBody()}`;
        }
        case 'do': {
          pos++;
          const body = loopBody();
          expect('while');
          expect('(');
          const cond = expression([]);
          expect(')');
          expect(';');
          return `do ${body} while (${cond});`;
        }
        case 'for': {
          pos++;
          expect('(');
          scopes.push(new Map());
          let init = '';
          if (isTypeStart()) {
            const integer = readType();
            init = declarators(integer, 'let', [';']);
          } else if (!is(';')) init = assignment([';']);
          expect(';');
          const cond = is(';') ? '' : expression([';']);
          expect(';');
          const step = is(')') ? '' : assignment([')']);
          expect(')');
          const body = loopBody();
          scopes.pop();
          return `for (${init}; ${cond}; ${step}) ${body}`;
        }
        case 'switch': {
          pos++;
          expect('(');
          const value = expression([]);
          expect(')');
          open.push(line());
          expect('{');
          const cases = [];
          while (!is('}')) {
            if (pos >= tokens.length) unclosed();
            if (is('case')) {
              pos++;
              const label = expression([':']);
              expect(':');
              cases.push(`case ${label}:`);
            } else if (is('default')) {
              pos++;
              expect(':');
              cases.push('default:');
            } else cases.push(statement());
          }
          pos++;
          open.pop();
          return `switch (${value}) { ${cases.join(' ')} }`;
        }
        case 'break':
        case 'continue':
          pos++;
          expect(';');
          return `${t.v};`;
        case 'return': {
          pos++;
          const value = is(';') ? '' : expression([';']);
          expect(';');
          return `return ${value && (returnsInt || returnKind) ? store(returnKind, value) : value};`;
        }
        default:
          if (isTypeStart()) {
            const integer = readType();
            const decl = declarators(integer, 'let', [';']);
            expect(';');
            return `${decl};`;
          }
      }
    }
    const e = assignment([';']);
    expect(';');
    return `${e};`;
  }

  // A library object's declaration (top level): `DHT dht(2, DHT11);`, `Adafruit_BME280 bme;`. Its name
  // is the translator's to keep (objects): the code gets only its number and its class's number.
  const reserved = (name) => TYPES.has(name) || QUALIFIERS.has(name) || RAW_NAMES.has(name) || KEYWORDS.has(name) || SKETCH_API.includes(name) || CLASS_BY_NAME.has(name) || functions.has(name) || objects.has(name) || scopes[0].has(name) || defined.includes(name);
  function libraryObject() {
    const cls = CLASS_BY_NAME.get(tokens[pos++].v);
    const named = peek();
    if (named?.t !== 'id' || reserved(named.v)) fail(named?.v ?? 'name');
    pos++;
    const args = [];
    if (is('(')) {
      pos++;
      while (!is(')')) {
        const arg = expression([',', ')']);
        if (!arg.trim()) fail('(');
        args.push(arg);
        if (is(',')) pos++;
      }
      expect(')');
    }
    expect(';');
    const [least, most] = LIBRARY_CLASSES[cls].args;
    if (args.length < least || args.length > most) fail(named.v);
    if (objects.size >= LIBRARY_OBJECTS) fail(`${LIBRARY_OBJECTS}+`);
    const k = objects.size;
    objects.set(named.v, { k, cls });
    // A type the library knows and the kit does not have yet (DHT22): noted, its reads give NaN.
    const typeArg = LIBRARY_CLASSES[cls].bus === 'pin' ? args[1]?.trim() : null;
    const typeName = typeArg?.startsWith('$') ? defineText.get(typeArg.slice(1)) : typeArg;
    if (NOT_IN_KIT.includes(typeName)) issues.push({ code: 'SIM_PROGRAM_NOT_IN_KIT', line: named.line, name: typeName });
    return `__new(${k}, ${cls}${args.length ? `, ${args.join(', ')}` : ''});`;
  }

  // Top level: #define, #include, globals and functions.
  const out = [];
  const defined = [];
  const defines = new Set(); // #define names with an integer value
  try {
    while (pos < tokens.length) {
      const t = peek();
      if (t.t === 'pre') {
        pos++;
        const define = /^#\s*define\s+([A-Za-z_]\w*)(\(?)\s*(.*)$/.exec(t.v);
        const include = /^#\s*include\s*[<"]([^>"]+)[>"]/.exec(t.v);
        if (define && define[2]) issues.push({ code: 'SIM_PROGRAM_ERROR', line: t.line, message: `#define ${define[1]}(…)` });
        else if (define) {
          const inner = translateSketchExpression(define[3] || '1', t.line, issues, strings);
          out.push(`const ${own(define[1])} = ${inner};`);
          defined.push(define[1]);
          defineText.set(define[1], define[3].trim());
          defineLines.set(define[1], t.line);
          if (/^-?\d+$/.test(define[3].trim())) defines.add(define[1]);
        } else if (include && !LIBRARY_INCLUDES.some((n) => n.toLowerCase() === include[1].trim().toLowerCase())) {
          issues.push({ code: 'SIM_PROGRAM_LIBRARY', line: t.line, name: include[1] });
          unknownLibrary = true;
        }
        continue;
      }
      // With a library the kit does not have, `LiquidCrystal lcd(12, 11, 5, 4, 3, 2);` or `Servo s;`
      // declares one of its objects: read past (its arguments are not run) and kept as foreign.
      if (unknownLibrary && t.t === 'id' && !isTypeStart() && !CLASS_BY_NAME.has(t.v) && peek(1)?.t === 'id' && !reserved(peek(1).v)) {
        const name = peek(1).v;
        let depth = 0;
        for (; pos < tokens.length; pos++) {
          const v = tokens[pos].t === 'p' ? tokens[pos].v : null;
          if (v === '(' || v === '{') depth++;
          else if (v === ')' || v === '}') depth--;
          else if (v === ';' && depth === 0) break;
        }
        expect(';');
        foreign.add(name);
        continue;
      }
      if (t.t === 'id' && CLASS_BY_NAME.has(t.v)) {
        out.push(libraryObject());
        continue;
      }
      if (!isTypeStart()) fail(t.v);
      const integer = readType();
      if (peek()?.t === 'id' && peek(1)?.v === '(') {
        const name = tokens[pos++].v;
        pos++;
        returnsInt = integer;
        returnKind = typeKind;
        scopes.push(new Map());
        const params = [];
        const wraps = []; // each integer parameter wrapped to its kind as the function starts
        while (!is(')')) {
          if (is('void') && peek(1)?.v === ')') {
            pos++;
            break;
          }
          const isInt = readType();
          let kind = typeKind;
          // A reference or a pointer (an array passed in) is not one value to wrap.
          let ref = null;
          while (is('&') || is('*')) {
            ref ??= peek().v;
            pos++;
          }
          if (ref) kind = 0;
          if (peek()?.t !== 'id') fail('name');
          const p = tokens[pos++].v;
          if (objects.has(p)) fail(p);
          declare(p, isInt ? (typeChar ? 'char' : 'int') : typeFloat ? 'float' : 'num', kind);
          if (kind) wraps.push(`${own(p)} = ${store(kind, own(p))};`);
          params.push(own(p));
          if (is(',')) pos++;
        }
        expect(')');
        if (is(';')) {
          // A prototype.
          pos++;
          scopes.pop();
          continue;
        }
        inFunction = true;
        const body = block();
        out.push(`function* ${own(name)}(${params.join(', ')}) ${wraps.length ? `{ ${wraps.join(' ')} ${body.slice(1)}` : body}`);
        inFunction = false;
        scopes.pop();
      } else {
        const decl = declarators(integer, 'let', [';']);
        // A global's value is computed once, before setup: a call that waits there (delay, pulseIn,
        // one's own function, all generators here) has no time to wait in.
        if (/\(yield[ *]/.test(decl)) fail('a call that waits, outside a function');
        expect(';');
        out.push(`${decl};`);
      }
    }
  } catch (error) {
    // Anything else the reading throws is a line it cannot read, never an exception out of here.
    const known = error instanceof SketchError;
    issues.push({ code: known ? error.code : 'SIM_PROGRAM_ERROR', line: known ? error.line : line(), message: known ? error.message : '?', ...(known && error.name && { name: error.name }) });
    return { js: null, issues };
  }
  // A #define whose text names a library object or class: an object is only name.method(…).
  for (const [name, value] of defineText) {
    const named = value.match(/[A-Za-z_]\w*/g) ?? [];
    if (named.some((n) => objects.has(n) || CLASS_BY_NAME.has(n))) {
      issues.push({ code: 'SIM_PROGRAM_ERROR', line: defineLines.get(name) ?? 1, message: `#define ${name}` });
      return { js: null, issues };
    }
  }
  if (!functions.has('setup') || !functions.has('loop')) issues.push({ code: 'SIM_PROGRAM_NO_LOOP', line: 1 });
  // Strict: an assignment to a name nobody declared throws (it cannot become a global of the page).
  const prelude = `'use strict'; const { ${[...SKETCH_API, ...SKETCH_CONSTANTS, '__int', '__w', '__u', '__post', '__upd', '__missing', '__idx', '__array', '__new', '__lib', '__wire', '__at', '__div', '__mod', '__ms', '__us', '__serial', '__deepSleep'].join(', ')} } = api;\nconst __str = [].concat(${strings.map((s) => JSON.stringify(s)).join(', ')});`;
  const js = `${prelude}\n${out.join('\n')}\nreturn { setup: typeof $setup === 'function' ? $setup : function* () {}, loop: typeof $loop === 'function' ? $loop : function* () {} };`;
  return { js: issues.some((i) => i.code === 'SIM_PROGRAM_ERROR') ? null : js, issues };
}

// The value of a #define: an expression on its own.
function translateSketchExpression(text, line, issues, strings) {
  const r = translateSketch(`float __v = ${text};`, { strings });
  if (!r.js) {
    issues.push({ code: 'SIM_PROGRAM_ERROR', line, message: text });
    return '0';
  }
  return /^let \$__v = (.*);$/m.exec(r.js)?.[1] ?? '0';
}
