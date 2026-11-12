// Acceptance tests for the analog modules (the 49E linear Hall sensor, the voltage sensor module, the
// KY-037 sound module, the active buzzer), written from their contract (groups B1-B10) and from the
// physics reference checks alone, before looking at any implementation. Every tolerance is the contract's.
//
// Names the contract does not fix are resolved the way the family does, never by guessing one spelling:
//   * pin names and their order come from the catalog (catalogEntry(type).parts[part].pins, or .pins);
//     a pin is classified by role (output / plus / minus / ...) from its printed name or synonym;
//   * a part's pins are read from its reading (`parts[id].pins[name]`, absolute node volts).
// Hand benches put the module in row e from column 10 (one column per pin), its supply wires on row a
// to the rails, and nothing else near it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { simulate, compile, createEngine } from '../src/sim/index.js';
import { inspectCircuit, checkCircuit } from '../src/index.js';
import { PART_TYPES } from '../src/parts/types/index.js';
import { catalogEntry, compactCatalog, formatCompactCatalog } from '../src/node/catalog.js';
import { RECIPES, expandRecipe, resolveRecipe } from '../src/recipes/index.js';
import { autoLayout } from '../src/layout.js';
import { tourIssues, loadTour } from '../src/tour.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} vs ${expected} (± ${tol})`);
const codes = (issues) => issues.map((i) => i.code);

// ---------------------------------------------------------------- pins by role

const PLUS = /^(\+|VCC|VS|\+VS|VDD|5V)$/i;
const MINUS = /^(-|−|G|GND|VSS)$/i;
const OUTPUT = /^(S|OUT|SIG|VOUT|AO|A0)$/i;
const pinsOf = (type, part) => {
  const entry = catalogEntry(type);
  assert.ok(entry, `catalogEntry("${type}")`);
  // No part number given: the type's default part, the first of its list.
  const pins = entry.parts && !Array.isArray(entry.parts) ? (entry.parts[part] ?? Object.values(entry.parts)[0])?.pins : entry.pins;
  assert.ok(Array.isArray(pins) && pins.length > 0, `${type} ${part}: pins in the catalog (${JSON.stringify(pins)})`);
  return pins;
};
const named = (pins, re, what) => {
  const found = pins.filter((p) => re.test(p));
  assert.ok(found.length >= 1, `${what}: a pin like ${re} among ${pins.join(' ')}`);
  return found;
};

// One module in row e from column 10; plus pin(s) to the top + rail, minus pin(s) to the top - rail,
// both through row a; the other pins are left alone for the caller. Returns { circuit, pins, id }.
function bench(type, part, { id = 'M1', volts = 5, own = {}, environment, extra = [] } = {}) {
  const pins = pinsOf(type, part);
  const col = (n) => 10 + pins.indexOf(n);
  const plus = named(pins, PLUS, `${type} ${part}`)[0];
  const minus = named(pins, MINUS, `${type} ${part}`)[0];
  const circuit = {
    supplies: [{ id: 'V1', voltage: volts }],
    ...(environment && { environment }),
    parts: [
      { id, type, ...(part && { part }), pins: pins.map((_, i) => `e${10 + i}`), ...own },
      { id: 'W1', type: 'wire', color: 'red', pins: [`T+${col(plus)}`, `a${col(plus)}`] },
      { id: 'W2', type: 'wire', color: 'black', pins: [`T-${col(minus)}`, `a${col(minus)}`] },
      ...extra,
    ],
  };
  return { circuit, pins, id, col };
}
const run = (circuit) => {
  const r = simulate(circuit);
  assert.ok(r.ok, `simulation ran: ${JSON.stringify(r.issues)}`);
  return r;
};
const volt = (r, id, pin) => {
  const v = r.parts[id]?.pins?.[pin];
  assert.equal(typeof v, 'number', `${id}: a voltage for pin ${pin} in ${JSON.stringify(r.parts[id]?.pins)}`);
  return v;
};
const outOf = (type, part, opts) => {
  const b = bench(type, part, opts);
  const out = named(b.pins, OUTPUT, `${type} ${part}`)[0];
  const r = run(b.circuit);
  return { r, out: volt(r, b.id, out), b, outName: out };
};

// ---------------------------------------------------------------- B1 · the catalog

test('B1 · hall-sensor and voltage-sensor are types of the family sensor', () => {
  for (const type of ['hall-sensor', 'voltage-sensor']) {
    assert.ok(PART_TYPES[type], `type ${type}`);
    assert.equal(PART_TYPES[type].family, 'sensor', `${type}: family`);
    assert.ok(catalogEntry(type), `${type}: a catalog entry`);
  }
});

const listedParts = (type) => {
  const entry = catalogEntry(type);
  assert.ok(entry, `catalogEntry("${type}")`);
  const parts = entry.parts ?? [];
  return Array.isArray(parts) ? parts : Object.keys(parts);
};

test('B1 · KY-037 is a part number of sensor-module; TMB12A05 of buzzer; KY-035, 49E of hall-sensor; VOLT-25V of voltage-sensor', () => {
  assert.ok(listedParts('sensor-module').includes('KY-037'), `sensor-module: ${listedParts('sensor-module')}`);
  assert.ok(listedParts('buzzer').includes('TMB12A05'), `buzzer: ${listedParts('buzzer')}`);
  for (const p of ['KY-035', '49E']) assert.ok(listedParts('hall-sensor').includes(p), `hall-sensor: ${listedParts('hall-sensor')}`);
  assert.ok(listedParts('voltage-sensor').includes('VOLT-25V'), `voltage-sensor: ${listedParts('voltage-sensor')}`);
});

test('B1 · the compact catalog lists both new types under sensor in both languages and stays within 4600 characters', () => {
  for (const lang of ['en', 'es']) {
    const text = formatCompactCatalog(compactCatalog(lang), lang);
    if (lang === 'en') assert.ok(text.length <= 4600, `${lang}: ${text.length} characters`); // the budget is the English catalog's
    const lines = text.split('\n');
    const start = lines.indexOf('sensor');
    assert.ok(start >= 0, `${lang}: block sensor`);
    let end = start + 1;
    while (end < lines.length && lines[end].startsWith('  ')) end++;
    const listed = lines.slice(start + 1, end).map((l) => l.trim().split(':')[0]);
    for (const type of ['hall-sensor', 'voltage-sensor']) assert.ok(listed.includes(type), `${lang}: ${type} under sensor (${listed.join(', ')})`);
  }
});

// ---------------------------------------------------------------- B2 · the KY-035 transfer curve (reference checks 45-47)

for (const part of ['KY-035', '49E']) {
  for (const [field, volts, expected, tol] of [
    [0, 5, 2.5, 0.03],
    [100, 5, 2.64, 0.03],
    [-100, 5, 2.36, 0.03],
    [100, 3.3, 1.742, 0.03],
    [1500, 5, 4.05, 0.1],
  ]) {
    test(`B2 · ${part} at ${volts} V, no load, environment field ${field} G → ${expected} V ± ${tol}`, () => {
      const { out } = outOf('hall-sensor', part, { volts, environment: { field } });
      near(out, expected, tol, `${part} output`);
    });
  }
}

test('B2 · KY-035 is the default part number of hall-sensor (no part given behaves as KY-035)', () => {
  const b = bench('hall-sensor', undefined, { environment: { field: 100 } });
  const out = named(b.pins, OUTPUT, 'hall-sensor')[0];
  const r = run(b.circuit);
  near(volt(r, b.id, out), 2.64, 0.03, 'default part at +100 G');
});

test('B2 · the environment\'s field moves the output; the part\'s own field wins over it', () => {
  const low = outOf('hall-sensor', 'KY-035', { environment: { field: 100 } }).out;
  const high = outOf('hall-sensor', 'KY-035', { environment: { field: -100 } }).out;
  assert.ok(low > high + 0.2, `+100 G ${low} V against -100 G ${high} V`);
  // the part's own field: +100 G on the part against -100 G in the environment, and the other way round
  near(outOf('hall-sensor', 'KY-035', { environment: { field: -100 }, own: { field: 100 } }).out, 2.64, 0.03, 'own +100 G beats environment -100 G');
  near(outOf('hall-sensor', 'KY-035', { environment: { field: 100 }, own: { field: -100 } }).out, 2.36, 0.03, 'own -100 G beats environment +100 G');
});

// ---------------------------------------------------------------- B3 · limits of the Hall sensor

test('B3 · supply 9 V on a KY-035: SIM_IC_SUPPLY; 5 V does not say it', () => {
  const over = outOf('hall-sensor', 'KY-035', { volts: 9, environment: { field: 0 } });
  assert.ok(codes(over.r.issues).includes('SIM_IC_SUPPLY'), JSON.stringify(over.r.issues));
  const fine = outOf('hall-sensor', 'KY-035', { volts: 5, environment: { field: 0 } });
  assert.ok(!codes(fine.r.issues).includes('SIM_IC_SUPPLY'), JSON.stringify(fine.r.issues));
});

test('B3 · supply 2 V on a KY-035: a low-supply note; 5 V has none', () => {
  const low = outOf('hall-sensor', 'KY-035', { volts: 2, environment: { field: 0 } });
  assert.ok(codes(low.r.issues).some((c) => /LOW_SUPPLY/.test(c)), JSON.stringify(low.r.issues));
  const fine = outOf('hall-sensor', 'KY-035', { volts: 5, environment: { field: 0 } });
  assert.ok(!codes(fine.r.issues).some((c) => /LOW_SUPPLY/.test(c)), JSON.stringify(fine.r.issues));
});

// ---------------------------------------------------------------- B4 · the voltage sensor module (reference checks 48, 49)

// The module is laid out from nets, so that the wires can go to its input terminal wherever the part
// keeps it (two more breadboard pins, or a terminal off the board). The terminal is VIN and GND, the
// breadboard side S, + and -.
const voltageSpec = (vin, extraParts = [], extraNets = []) => {
  const pins = pinsOf('voltage-sensor', 'VOLT-25V');
  const term = pins.filter((p) => /^(VIN|VCC)$/i.test(p));
  assert.ok(term.length === 1, `an input terminal pin VIN (or VCC) among ${pins.join(' ')}`);
  const gnds = pins.filter((p) => /^GND$/i.test(p));
  assert.ok(gnds.length >= 1, `a GND pin among ${pins.join(' ')}`);
  const out = named(pins, OUTPUT, 'voltage-sensor')[0];
  const minus = pins.filter((p) => /^(-|−)$/.test(p));
  return {
    spec: {
      board: 'auto',
      parts: [{ id: 'VM1', type: 'voltage-sensor', part: 'VOLT-25V' }, ...extraParts],
      nets: [['T+', `VM1.${term[0]}`], ['T-', ...gnds.map((g) => `VM1.${g}`), ...minus.map((m) => `VM1.${m}`)], ...extraNets],
      supplies: [{ id: 'V1', kind: 'bench', voltage: vin, positive: 'T+', negative: 'T-' }],
    },
    out,
  };
};

test('B4 · voltage sensor, 12 V in: S is 2.40 V ± 0.5 %, the input current 0.32 mA ± 0.02 (the supply\'s current)', () => {
  const { spec, out } = voltageSpec(12);
  const laid = autoLayout(spec);
  assert.ok(laid.circuit, `laid out: ${JSON.stringify(laid.problems)}`);
  const r = run(laid.circuit);
  near(volt(r, 'VM1', out), 2.4, 2.4 * 0.005, 'S');
  near(Math.abs(r.supplies.V1.current), 0.32e-3, 0.02e-3, 'input current');
});

test('B4 · voltage sensor, 25 V in, S on a 3.3 V board\'s pin: the board\'s over-voltage issue', () => {
  const { spec, out } = voltageSpec(25, [{ id: 'U1', part: 'ESP32-DEVKIT', io: { D34: 'input' } }], [['VM1.' + 'S', 'U1.D34'], ['T-', 'U1.GND']]);
  // the S pin is the one the module calls its output
  spec.nets[2][0] = `VM1.${out}`;
  const laid = autoLayout(spec);
  assert.ok(laid.circuit, `laid out: ${JSON.stringify(laid.problems)}`);
  const r = run(laid.circuit);
  assert.ok(codes(r.issues).includes('SIM_PIN_OVERVOLTAGE'), JSON.stringify(r.issues));
});

test('B4 · voltage sensor, 25 V in: 30 kΩ dissipates far less than 100 mW, so no SIM_OVER_POWER', () => {
  const { spec } = voltageSpec(25);
  const r = run(autoLayout(spec).circuit);
  assert.ok(!codes(r.issues).includes('SIM_OVER_POWER'), JSON.stringify(r.issues));
});

// ---------------------------------------------------------------- B5 · KY-037 (reference checks 50, 51)

// The module with a 10 kΩ pull-up from DO to the + rail, as the family's benches do (the board has its own).
function sound(db, { volts = 5, own = {}, via = 'environment' } = {}) {
  const pins = pinsOf('sensor-module', 'KY-037');
  const doName = pins.find((p) => /^(DO|D0)$/i.test(p));
  assert.ok(doName, `KY-037 has a DO pin: ${pins.join(' ')}`);
  const aoName = pins.find((p) => /^(AO|A0)$/i.test(p));
  assert.ok(aoName, `KY-037 has an AO pin: ${pins.join(' ')}`);
  const b = bench('sensor-module', 'KY-037', {
    volts,
    ...(via === 'environment' ? { environment: { sound: db } } : { own: { sound: db, ...own } }),
    extra: [],
  });
  b.circuit.parts.push({ id: 'R1', type: 'resistor', value: '10k', pins: [`a${b.col(doName)}`, `T+${b.col(doName)}`] });
  const r = run(b.circuit);
  return { r, ao: volt(r, 'M1', aoName), do: volt(r, 'M1', doName), reading: r.parts.M1 };
}

test('B5 · KY-037 at 5 V, sound 94 dB: AO is the bias, 2.5 V ± 0.1', () => {
  near(sound(94).ao, 2.5, 0.1, 'AO');
});

test('B5 · KY-037 at 5 V, sound 94 dB: the reading\'s AC peak is 8.9 mV ± 10 %', () => {
  const { reading } = sound(94);
  const keys = Object.keys(reading).filter((k) => /peak|amplitude|^ac/i.test(k) && typeof reading[k] === 'number');
  assert.ok(keys.length >= 1, `a numeric reading key with peak / amplitude / ac in its name; keys: ${Object.keys(reading).join(', ')}`);
  near(reading[keys[0]], 8.9e-3, 8.9e-3 * 0.1, `reading.${keys[0]}`);
});

test('B5 · KY-037, default trimmer, 70 dB: DO stays high (at least 4.5 V with its pull-up)', () => {
  assert.ok(sound(70).do >= 4.5, `DO ${sound(70).do}`);
});

test('B5 · KY-037, default trimmer, 105 dB: DO goes low (at most 0.4 V)', () => {
  assert.ok(sound(105).do <= 0.4, `DO ${sound(105).do}`);
});

test('B5 · KY-037: the part\'s own sound beats the environment\'s', () => {
  const pins = pinsOf('sensor-module', 'KY-037');
  const doName = pins.find((p) => /^(DO|D0)$/i.test(p));
  const b = bench('sensor-module', 'KY-037', { environment: { sound: 40 }, own: { sound: 105 } });
  b.circuit.parts.push({ id: 'R1', type: 'resistor', value: '10k', pins: [`a${b.col(doName)}`, `T+${b.col(doName)}`] });
  assert.ok(volt(run(b.circuit), 'M1', doName) <= 0.4, 'DO low from its own 105 dB with 40 dB around');
});

// ---------------------------------------------------------------- B6 · the active buzzer

const BUZZER_AT = ['h37', 'h40'];
function buzzer(part, { volts = 5, reversed = false } = {}) {
  const [p1, p2] = BUZZER_AT;
  const plus = reversed ? 'T-' : 'T+';
  const minus = reversed ? 'T+' : 'T-';
  return run({
    supplies: [{ id: 'V1', voltage: volts }],
    parts: [
      { id: 'BZ1', type: 'buzzer', ...(part && { part }), pins: [p1, p2] },
      { id: 'W1', type: 'wire', color: 'red', pins: [`${plus}37`, 'j37'] },
      { id: 'W2', type: 'wire', color: 'black', pins: [`${minus}40`, 'j40'] },
    ],
  });
}

test('B6 · active buzzer on 5 V: 30 mA ± 5, the reading says it sounds, no SIM_BUZZER_DC', () => {
  const r = buzzer('TMB12A05');
  near(Math.abs(r.parts.BZ1.current), 0.03, 0.005, 'current');
  assert.equal(r.parts.BZ1.sounding, true, `reading: ${JSON.stringify(r.parts.BZ1)}`);
  assert.ok(!codes(r.issues).includes('SIM_BUZZER_DC'), JSON.stringify(r.issues));
});

test('B6 · active buzzer on 1 V: under 1 mA and silent', () => {
  const r = buzzer('TMB12A05', { volts: 1 });
  assert.ok(Math.abs(r.parts.BZ1.current) < 1e-3, `current ${r.parts.BZ1.current}`);
  assert.ok(!r.parts.BZ1.sounding, `reading: ${JSON.stringify(r.parts.BZ1)}`);
});

test('B6 · active buzzer reversed on 5 V: silent and a SIM_REVERSE_VOLTAGE note', () => {
  const r = buzzer('TMB12A05', { reversed: true });
  assert.ok(!r.parts.BZ1.sounding, `reading: ${JSON.stringify(r.parts.BZ1)}`);
  assert.ok(codes(r.issues).includes('SIM_REVERSE_VOLTAGE'), JSON.stringify(r.issues));
});

test('B6 · the passive default buzzer on 5 V DC still gives SIM_BUZZER_DC', () => {
  const r = buzzer(undefined);
  assert.ok(codes(r.issues).includes('SIM_BUZZER_DC'), JSON.stringify(r.issues));
});

// ---------------------------------------------------------------- B7 · the recipes

const NEW_RECIPES = ['hall-linear-uno', 'voltage-sensor-uno', 'clap-switch'];
const SWITCHED = ['rain-alarm', 'obstacle-buzzer'];
const laid = (name) => {
  const { spec, problems } = expandRecipe(name);
  assert.deepEqual(problems, [], `${name}: ${JSON.stringify(problems)}`);
  return autoLayout(spec);
};
const hiddenBoth = (circuit) => {
  const sets = ['front', 'back'].map((view) => {
    const report = inspectCircuit(circuit, { view });
    return new Set(report.problems.filter((p) => p.code === 'PART_HIDDEN' && (p.severity === 'warning' || p.severity === 'error')).map((p) => p.params.part));
  });
  return [...sets[0]].filter((id) => sets[1].has(id));
};

for (const name of [...NEW_RECIPES, ...SWITCHED]) {
  test(`B7 · recipe ${name}: in RECIPES, DONE in the layout bench, check clean, nothing hidden in both views`, () => {
    assert.ok(RECIPES[name], `${name} is in RECIPES`);
    const r = laid(name);
    assert.equal(r.status, 'done', JSON.stringify(r.problems) + JSON.stringify(r.check));
    assert.equal(r.check.ok, true, JSON.stringify(r.check));
    assert.deepEqual(r.check.missing, []);
    assert.deepEqual(r.check.shorted, []);
    assert.deepEqual(r.review.blocking, []);
    const bad = checkCircuit(r.circuit).issues.filter((i) => i.severity === 'error' || i.severity === 'warning');
    assert.deepEqual(codes(bad), [], 'check');
    assert.deepEqual(hiddenBoth(r.circuit), [], 'parts hidden (warning or worse) in both views');
    assert.ok(simulate(r.circuit).ok, 'it simulates');
  });
}

for (const name of NEW_RECIPES) {
  test(`B7 · recipe ${name}: declares an environment and page controls`, () => {
    const c = laid(name).circuit;
    // The voltage sensor senses no field of the environment: its recipe needs only its page controls.
    if (name !== 'voltage-sensor-uno') assert.ok(c.environment && Object.keys(c.environment).length > 0, 'environment declared');
    assert.ok(Array.isArray(c.page?.controls) && c.page.controls.length > 0, 'page.controls declared');
  });
}

test('B7 · the recipes with DC-driven buzzers (rain-alarm, obstacle-buzzer) use the active buzzer and no longer say SIM_BUZZER_DC', () => {
  for (const name of SWITCHED) {
    const c = laid(name).circuit;
    const buzzers = c.parts.filter((p) => p.type === 'buzzer');
    assert.ok(buzzers.length >= 1 && buzzers.every((p) => p.part === 'TMB12A05'), `${name}: buzzers ${JSON.stringify(buzzers)}`);
  }
});

test('B7 · hall-linear-uno\'s page declares the environment field with a range of -500 … 500', () => {
  const c = laid('hall-linear-uno').circuit;
  const control = c.page.controls.find((x) => x.environment === 'field');
  assert.ok(control, `a control of the field: ${JSON.stringify(c.page.controls)}`);
  // The range may be the circuit's (environment.field.range), which the page's control follows, or the control's own.
  const range = control.range ?? (control.min !== undefined ? [control.min, control.max] : c.environment.field.range);
  assert.deepEqual(range, [-500, 500]);
});

test('B7 · clap-switch\'s page declares the environment sound with a range of 30 … 110', () => {
  const c = laid('clap-switch').circuit;
  const control = c.page.controls.find((x) => x.environment === 'sound');
  assert.ok(control, `a control of sound: ${JSON.stringify(c.page.controls)}`);
  assert.deepEqual(control.range ?? (control.min !== undefined ? [control.min, control.max] : c.environment.sound.range), [30, 110]);
});

// clap-switch: a clap toggles the LED once; a second clap toggles it back. The LED is the external
// LED part of the recipe; "on" is more than 1 mA through it.
const H = 0.01;
const engineOf = (circuit) => {
  const compiled = compile(circuit);
  assert.ok(compiled.program, `compiles: ${JSON.stringify(compiled.issues)}`);
  const e = createEngine(compiled.program);
  assert.ok(e.start('dc', H), 'starts at the DC point');
  return e;
};
const play = (e, seconds) => {
  const until = e.time + seconds - 1e-9;
  while (e.time < until) assert.ok(e.advance(H), `stalled at ${e.time} s`);
};

test('B7 · clap-switch: sound 40 → 105 → 40 toggles the LED once (current before ≠ after); a second clap toggles it back', () => {
  const c = laid('clap-switch').circuit;
  const leds = c.parts.filter((p) => p.type === 'led');
  assert.equal(leds.length, 1, `exactly one external LED, found ${leds.map((p) => p.id)}`);
  const e = engineOf(c);
  const on = () => Math.abs(e.read().parts[leds[0].id].current) > 1e-3;
  assert.ok(e.set('environment', 'sound', 40));
  play(e, 1);
  const before = on();
  assert.ok(e.set('environment', 'sound', 105));
  play(e, 1);
  assert.ok(e.set('environment', 'sound', 40));
  play(e, 1);
  const after = on();
  assert.notEqual(after, before, `LED before ${before}, after one clap ${after}`);
  assert.ok(e.set('environment', 'sound', 105));
  play(e, 1);
  assert.ok(e.set('environment', 'sound', 40));
  play(e, 1);
  assert.equal(on(), before, 'a second clap toggles it back');
});

// ---------------------------------------------------------------- B8 · hall-linear-uno prints the field

test('B8 · hall-linear-uno prints a value within ± 15 G of the environment\'s field for 0, +200 and -200 G', () => {
  const c = laid('hall-linear-uno').circuit;
  const board = c.parts.find((p) => p.part === 'UNO');
  assert.ok(board, 'an Arduino UNO');
  for (const field of [0, 200, -200]) {
    const e = engineOf(c);
    play(e, 0.2); // setup() measures the zero first, with no magnet near
    assert.ok(e.set('environment', 'field', field), `set field ${field}`);
    play(e, 3);
    const { serial, error } = e.read().parts[board.id].program;
    assert.equal(error, null);
    const last = String(serial[serial.length - 1] ?? '');
    const m = /-?\d+(?:\.\d+)?/.exec(last);
    assert.ok(m, `a number on the last Serial line: ${JSON.stringify(serial)}`);
    near(Number(m[0]), field, 15, `printed value for ${field} G`);
  }
});

// ---------------------------------------------------------------- B9 · pinout COMPLETE, the tour

test('B9 · test/pinout.test.js lists hall-sensor and voltage-sensor as COMPLETE, with a recipe or example that holds one', () => {
  const source = readFileSync(`${root}test/pinout.test.js`, 'utf8');
  for (const type of ['hall-sensor', 'voltage-sensor']) {
    const entry = source.match(new RegExp(`const COMPLETE = \\{[^}]*'${type}': '([^']+)'`));
    assert.ok(entry, `COMPLETE has a ${type} entry`);
    const [name, id] = entry[1].split(' ');
    assert.ok(RECIPES[name] || existsSync(`${root}examples/${name}.json`), `${name} is a recipe or an example`);
    const circuit = RECIPES[name] ? laid(name).circuit : JSON.parse(readFileSync(`${root}examples/${name}.json`, 'utf8'));
    assert.equal(circuit.parts.find((p) => p.id === id)?.type, type, `${entry[1]} is a ${type}`);
    assert.ok(!new RegExp(`const PENDING = \\{[^}]*'${type}'`).test(source), `${type} is not in PENDING`);
  }
});

test('B9 · examples/tours/clap-switch.json validates on the clap-switch recipe, 20–30 s, Spanish captions, a gauge of sound, sound set to 105 twice', () => {
  const file = `${root}examples/tours/clap-switch.json`;
  assert.ok(existsSync(file), 'clap-switch.json exists');
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const circuit = { ...laid('clap-switch').circuit };
  circuit.page = { ...circuit.page, tour: raw };
  assert.deepEqual(tourIssues(circuit), [], 'no issue');
  assert.ok(loadTour(circuit, 'es').tour, 'it plays');
  const end = Math.max(...raw.steps.map((s) => s.at + (s.ms ?? 0)));
  assert.ok(end >= 20000 && end <= 30000, `the last step ends at ${end} ms`);
  const captions = raw.steps.filter((s) => s.do === 'caption');
  assert.ok(captions.length > 0 && captions.every((s) => typeof s.text?.es === 'string' && s.text.es.length > 0), 'every caption in Spanish');
  assert.ok(raw.steps.some((s) => s.do === 'gauge' && s.environment === 'sound' && s.on === true), 'a gauge of sound');
  const sets = raw.steps.filter((s) => s.do === 'set' && s.environment === 'sound').sort((a, b) => a.at - b.at).map((s) => s.value);
  assert.equal(sets.filter((v) => v === 105).length, 2, `sound set to 105 twice: ${sets}`);
  assert.ok(sets.filter((v) => v === 40).length >= 2, `and back to 40: ${sets}`);
});

// ---------------------------------------------------------------- B10 · resolveRecipe hands out copies

test('B10 · resolveRecipe({ recipe: "soil-led" }) twice: the environment and the page are not shared; mutating one leaves the other and the recipe intact', () => {
  const a = resolveRecipe({ recipe: 'soil-led' });
  const b = resolveRecipe({ recipe: 'soil-led' });
  assert.deepEqual(a.problems, []);
  assert.ok(a.spec.environment && a.spec.page, 'soil-led has an environment and a page');
  assert.notEqual(a.spec.environment, b.spec.environment, 'environment objects differ');
  assert.notEqual(a.spec.page, b.spec.page, 'page objects differ');
  assert.notEqual(a.spec.page.controls, b.spec.page.controls, 'the controls arrays differ');
  const wasEnv = structuredClone(b.spec.environment);
  const wasPage = structuredClone(b.spec.page);
  a.spec.environment.__changed = 1;
  a.spec.page.controls.push({ environment: 'rain' });
  Object.assign(a.spec.page.controls[0], { __changed: 1 });
  assert.deepEqual(b.spec.environment, wasEnv, 'the other environment');
  assert.deepEqual(b.spec.page, wasPage, 'the other page');
  const c = resolveRecipe({ recipe: 'soil-led' });
  assert.deepEqual(c.spec.environment, wasEnv, 'the recipe itself');
  assert.deepEqual(c.spec.page, wasPage, 'the recipe page');
});
