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
// delay(ms) → yield seconds; a call to one's own function → yield* f(…); loops yield 0 at each turn
// so a loop that never waits cannot freeze the page (program.js gives each step a budget).
// Integer variables keep integer division (7 / 2 → 3) where an int is assigned.
// Not read: classes, pointers, templates, function-like macros, libraries other than Arduino's
// own (an #include is noted; a call to a function nobody defines returns 0 and is noted).
//
// A sketch is external input (CLAUDE.md, "External input") and its JavaScript runs with
// new Function, in Node and in the page, so what comes out can only reach what the runtime gives:
// - every name the sketch writes gets a "$" (C names cannot have one): count → $count, so a sketch
//   cannot name globalThis, process, Function or the runtime's own helpers;
// - the only member access is Serial.<method>; an index is a number (a[__idx(i)]), never a key
//   such as "constructor";
// - text in quotes becomes __str[n], from a JSON list at the top, so no character of a string
//   lands in the code (a "/" before it could otherwise make a regular expression that ends inside
//   it, and the rest of the string would be code); a "/" where a value goes is refused for the same
//   reason;
// - a program longer than LIMITS.sketchChars is not read.
import { LIMITS } from '../limits.js';

const TYPES = new Set(['void', 'int', 'long', 'short', 'byte', 'bool', 'boolean', 'char', 'float', 'double', 'unsigned', 'signed', 'size_t', 'word', 'String', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t', 'int8_t', 'int16_t', 'int32_t', 'int64_t']);
const QUALIFIERS = new Set(['const', 'static', 'volatile', 'unsigned', 'signed']);
const INTEGER = new Set(['int', 'long', 'short', 'byte', 'char', 'unsigned', 'signed', 'size_t', 'word', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t', 'int8_t', 'int16_t', 'int32_t', 'int64_t']);
// What the runtime gives (program.js); anything else called and not defined is noted.
export const SKETCH_API = ['pinMode', 'digitalWrite', 'digitalRead', 'analogRead', 'analogWrite', 'millis', 'micros', 'abs', 'min', 'max', 'map', 'constrain', 'random', 'randomSeed', 'sqrt', 'pow', 'sin', 'cos', 'round', 'floor', 'ceil', 'bitRead', 'bitWrite', 'bitSet', 'bitClear', 'ledcAttach', 'ledcAttachPin', 'ledcSetup', 'ledcWrite', 'tone', 'noTone'];
const SKETCH_CONSTANTS = ['HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'INPUT_PULLDOWN', 'LED_BUILTIN', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'PI', 'Serial'];
const ASSIGN = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']);
// Runtime functions that return an integer (an int divided by them stays an int).
const INT_API = new Set(['digitalRead', 'analogRead', 'millis', 'micros', 'map', 'random', 'constrain', 'abs', 'min', 'max', 'bitRead']);
// Serial's methods in the runtime; another one is noted and returns 0.
const SERIAL_METHODS = new Set(['begin', 'print', 'println', 'available', 'read']);
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
      out.push({ t: 'num', v: m[1], line });
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
      out.push({ t: 'num', v: String(ch.charCodeAt(0)), line });
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
  constructor(line, message) {
    super(message);
    this.line = line;
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
  for (let k = 0; k + 2 < tokens.length; k++) {
    if (tokens[k].t === 'id' && TYPES.has(tokens[k].v) && tokens[k + 1].t === 'id' && tokens[k + 2].v === '(') {
      functions.add(tokens[k + 1].v);
      if (INTEGER.has(tokens[k].v)) intFunctions.add(tokens[k + 1].v);
    }
  }
  // Whether the term just read is an integer (for division): set by term().
  let termInt = false;
  let exprInt = false; // whether the expression just read has only integer terms
  const missing = new Set();
  let returnsInt = false; // the function being read returns an integer type
  const scopes = [new Map()];
  const typeOf = (name) => {
    for (let s = scopes.length - 1; s >= 0; s--) if (scopes[s].has(name)) return scopes[s].get(name);
    return null;
  };

  const isTypeStart = (k = 0) => {
    const t = peek(k);
    return t?.t === 'id' && (TYPES.has(t.v) || QUALIFIERS.has(t.v));
  };
  // A type: qualifiers and type words ("const unsigned long"); returns whether it is an integer.
  function readType() {
    let integer = false;
    let any = false;
    while (peek()?.t === 'id' && (TYPES.has(peek().v) || QUALIFIERS.has(peek().v))) {
      if (INTEGER.has(peek().v)) integer = true;
      if (TYPES.has(peek().v)) any = true;
      pos++;
    }
    if (!any) fail('type');
    return integer;
  }

  // An expression up to (not including) one of the stop tokens, as JavaScript. A division whose
  // two sides are integers stays integer, as in C: a * b / c → __int((a * b) / c).
  function expression(stops) {
    const parts = [];
    const ints = []; // per part: an integer term, or null for an operator
    let value = true; // whether a value comes next (and not an operator)
    while (pos < tokens.length) {
      const t = peek();
      if (t.t === 'p' && (stops.includes(t.v) || [')', ']', '}'].includes(t.v))) break;
      // An index belongs to the value before it: a[i] / 2 divides the element.
      if (t.t === 'p' && t.v === '[' && parts.length && !value) {
        pos++;
        const index = expression([']']);
        expect(']');
        parts[parts.length - 1] += `[__idx(${index})]`;
        continue;
      }
      // Where a value goes, a "/" would start a regular expression in JavaScript.
      if (value && t.t === 'p' && (t.v === '/' || t.v === '/=')) fail(t.v);
      const isOp = t.t === 'p' && t.v !== '(';
      termInt = false;
      parts.push(term());
      ints.push(isOp ? null : termInt);
      // After a value an operator comes, except after x++ / x--; after an operator, a value.
      if (!isOp) value = false;
      else if (!(['++', '--'].includes(t.v) && !value)) value = true;
    }
    for (let i = 1; i + 1 < parts.length; i++) {
      if (parts[i] !== '/' || ints[i] !== null) continue;
      // The left side: the operands joined by * / % before it (they bind as tightly).
      let j = i - 1;
      while (j >= 2 && ['*', '/', '%'].includes(parts[j - 1]) && ints[j - 1] === null) j -= 2;
      const left = parts.slice(j, i);
      const leftInt = left.every((part, k) => (k % 2 ? true : ints[j + k]));
      if (!leftInt || !ints[i + 1]) continue;
      const merged = `__int((${left.join(' ')}) / ${parts[i + 1]})`;
      parts.splice(j, i + 2 - j, merged);
      ints.splice(j, i + 2 - j, true);
      i = j;
    }
    exprInt = parts.length > 0 && ints.every((k) => k !== false);
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
        pos += k + 1;
        const operand = term();
        termInt = integer;
        return integer ? `__int(${operand})` : `(${operand})`;
      }
    }
    // Serial.println(…): the one object with methods. Any other "." is refused.
    if (t.t === 'id' && t.v === 'Serial' && is('.', 1)) {
      const method = peek(2);
      if (method?.t !== 'id' || !is('(', 3)) throw new SketchError(t.line, '.');
      pos += 4;
      const args = expression([')']);
      expect(')');
      if (SERIAL_METHODS.has(method.v)) return `Serial.${method.v}(${args})`;
      const name = `Serial.${method.v}`;
      if (!missing.has(name)) {
        missing.add(name);
        issues.push({ code: 'SIM_PROGRAM_UNSUPPORTED', line: t.line, name });
      }
      return `__missing(${JSON.stringify(name)}, ${args || 'undefined'})`;
    }
    if (t.t === 'id' && peek(1)?.v === '(') {
      const name = t.v;
      pos += 2;
      const args = expression([')']);
      expect(')');
      termInt = intFunctions.has(name) || INT_API.has(name);
      if (name === 'delay') return `(yield ((${args}) / 1e3))`;
      if (name === 'delayMicroseconds') return `(yield ((${args}) / 1e6))`;
      if (functions.has(name)) return `(yield* ${own(name)}(${args}))`;
      if (SKETCH_API.includes(name)) return `${name}(${args})`;
      if (TYPES.has(name)) return INTEGER.has(name) ? `__int(${args})` : `(${args})`; // int(x), float(x)
      if (!missing.has(name)) {
        missing.add(name);
        issues.push({ code: 'SIM_PROGRAM_UNSUPPORTED', line: t.line, name });
      }
      return `__missing(${JSON.stringify(name)}, ${args || 'undefined'})`;
    }
    if (t.t === 'p' && t.v === '(') {
      pos++;
      const inner = expression([]);
      expect(')');
      termInt = exprInt;
      return `(${inner})`;
    }
    pos++;
    if (t.t === 'str') return `__str[${strings.push(t.value) - 1}]`;
    if (t.t === 'num') termInt = /^(\d+|0[xX][0-9a-fA-F]+|0[bB][01]+)$/.test(t.v);
    if (t.t === 'id') termInt = typeOf(t.v) === 'int' || ['HIGH', 'LOW', 'LED_BUILTIN', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'].includes(t.v) || defines.has(t.v);
    if (t.t === 'id' && t.v === 'NULL') return '0';
    if (t.t === 'id' && (t.v === 'sizeof' || t.v === 'new' || t.v === 'delete')) throw new SketchError(t.line, t.v);
    if (t.t === 'p' && ['->', '::', '.', '[', '{'].includes(t.v)) throw new SketchError(t.line, t.v);
    if (t.t === 'id') return RAW_NAMES.has(t.v) ? t.v : own(t.v);
    return t.v;
  }

  // Assignments: name op value, with integer division kept for integer variables.
  function assignment(stops) {
    const start = pos;
    if (peek()?.t === 'id' && peek(1)?.t === 'p' && ASSIGN.has(peek(1).v) && typeOf(peek().v) === 'int') {
      const name = own(tokens[pos++].v);
      const op = tokens[pos++].v;
      const value = expression(stops);
      if (op === '=' ) return `${name} = __int(${value})`;
      if (op === '/=' || op === '*=' || op === '+=' || op === '-=') return `${name} = __int(${name} ${op[0]} (${value}))`;
      return `${name} ${op} ${value}`;
    }
    pos = start;
    return expression(stops);
  }

  // A declaration list after its type: a = 1, b[3] = {1, 2, 3}; → let a = 1, b = [1, 2, 3].
  function declarators(integer, keyword, stops) {
    const out = [];
    for (;;) {
      if (peek()?.t !== 'id') fail('name');
      const name = tokens[pos++].v;
      scopes[scopes.length - 1].set(name, integer ? 'int' : 'num');
      let array = false;
      let size = null;
      while (is('[')) {
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
            items.push(expression([',', '}']));
            if (is(',')) pos++;
          }
          expect('}');
          value = `[${items.join(', ')}]`;
        } else {
          const v = expression([',', ...stops]);
          if (!v.trim()) fail('=');
          value = integer && !array ? `__int(${v})` : v;
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

  function block() {
    expect('{');
    scopes.push(new Map());
    const body = [];
    while (!is('}')) {
      if (pos >= tokens.length) fail('}');
      body.push(statement());
    }
    pos++;
    scopes.pop();
    return `{ ${body.join(' ')} }`;
  }
  // A body that may be one statement: always a block in JavaScript, with the loop's turn.
  const loopBody = () => {
    const body = is('{') ? block() : `{ ${statement()} }`;
    return `{ ${body.slice(1, -1)} yield 0; }`;
  };
  function statement() {
    const t = peek();
    if (is('{')) return block();
    if (t.t === 'pre') {
      pos++;
      return '';
    }
    if (t.t === 'id') {
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
          expect('{');
          const cases = [];
          while (!is('}')) {
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
          return `return ${value && returnsInt ? `__int(${value})` : value};`;
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
          if (/^-?\d+$/.test(define[3].trim())) defines.add(define[1]);
        } else if (include && !/^Arduino\.h$/i.test(include[1])) issues.push({ code: 'SIM_PROGRAM_LIBRARY', line: t.line, name: include[1] });
        continue;
      }
      if (!isTypeStart()) fail(t.v);
      const integer = readType();
      if (peek()?.t === 'id' && peek(1)?.v === '(') {
        const name = tokens[pos++].v;
        pos++;
        returnsInt = integer;
        scopes.push(new Map());
        const params = [];
        while (!is(')')) {
          if (is('void') && peek(1)?.v === ')') {
            pos++;
            break;
          }
          const isInt = readType();
          while (is('&') || is('*')) pos++;
          if (peek()?.t !== 'id') fail('name');
          const p = tokens[pos++].v;
          scopes[scopes.length - 1].set(p, isInt ? 'int' : 'num');
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
        out.push(`function* ${own(name)}(${params.join(', ')}) ${block()}`);
        scopes.pop();
      } else {
        const decl = declarators(integer, 'let', [';']);
        expect(';');
        out.push(`${decl};`);
      }
    }
  } catch (error) {
    if (!(error instanceof SketchError)) throw error;
    issues.push({ code: 'SIM_PROGRAM_ERROR', line: error.line, message: error.message });
    return { js: null, issues };
  }
  if (!functions.has('setup') || !functions.has('loop')) issues.push({ code: 'SIM_PROGRAM_NO_LOOP', line: 1 });
  const prelude = `const { ${[...SKETCH_API, ...SKETCH_CONSTANTS, '__int', '__missing', '__idx', '__array'].join(', ')} } = api;\nconst __str = ${JSON.stringify(strings)};`;
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
