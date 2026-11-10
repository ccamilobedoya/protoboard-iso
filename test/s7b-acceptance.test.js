// Acceptance tests for session S7b (emitters: a part that writes a field of the shared environment,
// and the KY-008 laser), written from the brief alone (sections 1, 2, 3 and the acceptance list E1 … E12),
// before looking at any implementation.
//
// The contract in short: a device may `emit` into a level field (here `light`); what a sensor sees is the
// ambient value plus what the emitters add, clamped to the field's limit; the environment's `beam` (a
// switch, 1 = something in the way) blocks the emitted share but not the ambient light. The engine says
// `environment()` (seen), `ambient()`, `emissions()` and its controls carry `emitted`.
//
// The laser: KY-008, pins S + − in the order the module prints them, the middle one not connected. The
// supply goes to S (positive) and − (ground). Brief numbers: Vf 2.2 V in series with 100 Ω, so
// 28 mA at 5 V; P = 0.5 W/A · max(0, I − 22 mA) (3 mW at 5 V); it adds K · P lx with K = 3.33e6 lx/W
// (10 000 lx at 5 V).
//
// Names the brief does not fix, assumed here (each one is listed in the report):
//   - the laser's reading carries its optical power, in watts, as `parts.<id>.opticalPower`;
//   - the laser's pins are 'S', '+' and '−' (U+2212 minus sign, as the brief prints it);
//   - `set('environment', 'beam', …)` needs `beam` declared in the circuit's `environment`, as any field
//     (a field the circuit does not have makes `set` return false), so the beam benches declare it;
//   - an emitter that adds nothing shows as `emissions()` without `light` or with a total of 0.
//
// Time is driven as in the other acceptance files: an engine started at the DC point, stepped with
// advance(h), inputs moved with engine.set.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkCircuit, inspectCircuit, formatIssue } from '../src/index.js';
import { simulate, compile, createEngine } from '../src/sim/index.js';
import { buildCircuit } from '../src/circuit/build.js';
import { PART_TYPES } from '../src/parts/types/index.js';
import { catalogEntry, compactCatalog, formatCompactCatalog } from '../src/node/catalog.js';
import { RECIPES, expandRecipe } from '../src/recipes/index.js';
import { autoLayout } from '../src/layout.js';
import { symbolOf, insideOf } from '../src/parts/symbols.js';
import { t as translate } from '../src/i18n/index.js';
import { tourIssues } from '../src/tour.js';
import { timelineCircuit } from '../scripts/render-frames.js';
import { ldrResistance, LDR_PARTS } from '../src/parts/sensors.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const tours = fileURLToPath(new URL('../examples/tours/', import.meta.url));
const GL5528 = LDR_PARTS.GL5528;
const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} vs ${expected} (± ${tol})`);
const within = (actual, expected, rel, what) => near(actual, expected, Math.abs(expected) * rel, what);
const codes = (issues) => issues.map((i) => i.code);
const loadEnv = () => import('../src/sim/environment.js');

// ---------------------------------------------------------------- the benches

// The laser stands on f10 f11 f12 (S, +, −); its wires go to the far strip (row j), away from the tall
// standing module. Forward: S to the + rail (5 V), − to the − rail. Reversed: the other way round.
// The photoresistor divider is far to the side (columns 30 … 32): 5 V, LDR1 (GL5528), then 10 kΩ to ground.
function laserBench({ volts = 5, reversed = false, environment, divider = true } = {}) {
  const [hot, cold] = reversed ? ['T-', 'T+'] : ['T+', 'T-'];
  return {
    supplies: [{ id: 'V1', voltage: volts }],
    ...(environment && { environment }),
    parts: [
      { id: 'LS1', type: 'laser', part: 'KY-008', pins: ['f10', 'f11', 'f12'] },
      { id: 'W1', type: 'wire', color: reversed ? 'black' : 'red', pins: [`${hot}10`, 'j10'] },
      { id: 'W2', type: 'wire', color: reversed ? 'red' : 'black', pins: [`${cold}12`, 'j12'] },
      ...(divider
        ? [
            { id: 'W3', type: 'wire', color: 'red', pins: ['T+30', 'a30'] },
            { id: 'LDR1', type: 'ldr', part: 'GL5528', pins: ['e30', 'e31'] },
            { id: 'R1', type: 'resistor', value: '10k', pins: ['a31', 'T-31'] },
          ]
        : []),
    ],
  };
}
// The same divider with no laser at all.
const dividerOnly = (environment) => {
  const c = laserBench({ environment });
  return { ...c, parts: c.parts.filter((p) => !['LS1', 'W1', 'W2'].includes(p.id)) };
};
const engineOf = (circuit, h = 1e-3) => {
  const e = createEngine(compile(circuit).program);
  assert.ok(e.start('dc', h), 'the engine starts');
  return e;
};
const run = (circuit) => {
  const r = simulate(circuit);
  assert.ok(r.ok, `simulation ran: ${JSON.stringify(r.issues)}`);
  return r;
};
const ldrR = (e) => e.read().parts.LDR1.sensor.resistance;
const share = (e) => e.emissions().light.parts.LS1;
const AMBIENT = { light: 50, beam: 0 };

// ---------------------------------------------------------------- E1 · the type, the catalog

test('E1 · type laser is in the catalog with pins S, +, −', () => {
  assert.ok(PART_TYPES.laser, 'PART_TYPES.laser');
  const entry = catalogEntry('laser');
  assert.ok(entry, 'catalogEntry("laser")');
  assert.equal(entry.kind, 'type');
  assert.deepEqual(entry.pins, ['S', '+', '−']);
  const listed = Array.isArray(entry.parts) ? entry.parts : Object.keys(entry.parts ?? {});
  assert.ok(listed.includes('KY-008'), `KY-008 is listed: ${listed}`);
});

test('E1 · the family is the one LEDs have, or sensor', () => {
  assert.ok([PART_TYPES.led.family, 'sensor'].includes(PART_TYPES.laser.family), `family ${PART_TYPES.laser.family}`);
});

test('E1 · the compact catalog stays within 4600 characters', () => {
  const text = formatCompactCatalog(compactCatalog('en'), 'en');
  assert.ok(text.length <= 4600, `${text.length} characters`);
});

// ---------------------------------------------------------------- E2 · the laser alone

test('E2 · KY-008 on 5 V: 28 mA ± 4, optical power 3 mW ± 0.6, adds 10 000 lx ± 20 %', () => {
  const circuit = laserBench({ environment: { light: 50 }, divider: false });
  const r = run(circuit);
  near(r.parts.LS1.current, 0.028, 0.004, 'current');
  near(r.parts.LS1.opticalPower, 0.003, 0.0006, 'optical power (W)');
  const e = engineOf(circuit);
  within(share(e), 10000, 0.2, 'what it adds to light');
  within(e.emissions().light.total, 10000, 0.2, 'the total of the light emissions');
});

test('E2 · KY-008 on 6 V: 38 mA ± 4, no over-current yet', () => {
  const r = run(laserBench({ volts: 6, environment: { light: 50 }, divider: false }));
  near(r.parts.LS1.current, 0.038, 0.004, 'current');
  assert.ok(!codes(r.issues).includes('SIM_OVER_CURRENT'), `issues: ${codes(r.issues)}`);
});

test('E2 · KY-008 on 7.5 V: SIM_OVER_CURRENT', () => {
  const r = run(laserBench({ volts: 7.5, environment: { light: 50 }, divider: false }));
  assert.ok(codes(r.issues).includes('SIM_OVER_CURRENT'), `issues: ${codes(r.issues)}`);
});

test('E2 · KY-008 reversed on 5 V: SIM_REVERSE_VOLTAGE and it adds 0', () => {
  const circuit = laserBench({ reversed: true, environment: { light: 50 }, divider: false });
  const r = run(circuit);
  assert.ok(codes(r.issues).includes('SIM_REVERSE_VOLTAGE'), `issues: ${codes(r.issues)}`);
  const added = engineOf(circuit).emissions().light?.total ?? 0;
  assert.equal(added, 0, 'adds nothing');
});

test('E2 · under its threshold the laser adds nothing: 3 V gives 8 mA ± 4 and no optical power (P = 0.5 W/A · max(0, I − 22 mA))', () => {
  const circuit = laserBench({ volts: 3, environment: { light: 50 }, divider: false });
  const r = run(circuit);
  near(r.parts.LS1.current, 0.008, 0.004, 'current');
  assert.equal(r.parts.LS1.opticalPower, 0, 'no optical power');
  assert.equal(engineOf(circuit).emissions().light?.total ?? 0, 0, 'adds nothing');
});

// ---------------------------------------------------------------- E3 · the sensor sees ambient + the laser's share

test('E3 · seen light = ambient + the laser\'s share; ambient stays 50; the photoresistor is 10× lower than at 50 lx', () => {
  const e = engineOf(laserBench({ environment: { light: 50 } }));
  assert.equal(e.ambient().light, 50);
  assert.ok(e.emissions().light.total > 5000, `emissions total ${e.emissions().light.total}`);
  assert.equal(e.emissions().light.total, share(e), 'the total is the one part\'s');
  within(e.environment().light, 50 + share(e), 0.01, 'seen light');
  const dark = ldrResistance(GL5528, 50);
  assert.ok(ldrR(e) < dark / 10, `lit ${ldrR(e)} Ω vs ${dark} Ω at 50 lx`);
});

test('E3 · the photoresistor\'s resistance is the one of the seen light', () => {
  const e = engineOf(laserBench({ environment: { light: 50 } }));
  within(ldrR(e), ldrResistance(GL5528, e.environment().light), 1e-6, 'resistance at the seen light');
});

test('E3 · the slider\'s control keeps the ambient as its value and gains `emitted`', () => {
  const e = engineOf(laserBench({ environment: { light: 50 } }));
  const light = e.controls().find((c) => c.id === 'environment' && c.field === 'light');
  assert.equal(light.value, 50);
  within(light.emitted, share(e), 1e-6, 'emitted');
});

test('E3 · the seen value is clamped to the field\'s limit (1 000 000 lx)', async () => {
  const { FIELDS } = await loadEnv();
  const e = engineOf(laserBench({ environment: { light: FIELDS.light.limit[1] - 100 } }));
  assert.equal(e.environment().light, FIELDS.light.limit[1]);
});

// ---------------------------------------------------------------- E4 · beam blocks the emitted share

test('E4 · the registry says light is blocked by beam', async () => {
  const { FIELDS } = await loadEnv();
  assert.equal(FIELDS.light.blockedBy, 'beam');
});

test('E4 · beam 1: seen light = 50 ± 0.5 and the photoresistor is back at its 50 lx resistance; beam 0: the share is back', () => {
  const e = engineOf(laserBench({ environment: AMBIENT }));
  const lit = ldrR(e);
  assert.ok(e.set('environment', 'beam', 1));
  near(e.environment().light, 50, 0.5, 'seen light with the beam cut');
  assert.ok(ldrR(e) >= ldrResistance(GL5528, 50.5) && ldrR(e) <= ldrResistance(GL5528, 49.5), `resistance ${ldrR(e)} Ω at the seen light`);
  assert.equal(e.ambient().light, 50);
  const light = e.controls().find((c) => c.id === 'environment' && c.field === 'light');
  assert.equal(light.emitted, 0, 'what reaches the sensors is nothing');
  assert.ok(e.set('environment', 'beam', 0));
  within(e.environment().light, 50 + share(e), 0.01, 'seen light with the beam free');
  within(ldrR(e), lit, 1e-6, 'resistance back to the lit one');
});

// ---------------------------------------------------------------- E5 · the slider moves the ambient only

test('E5 · set light 500 moves the ambient only: seen = 500 + share', () => {
  const e = engineOf(laserBench({ environment: AMBIENT }));
  assert.ok(e.set('environment', 'light', 500));
  assert.equal(e.ambient().light, 500);
  within(e.environment().light, 500 + share(e), 0.01, 'seen light');
  assert.equal(e.controls().find((c) => c.id === 'environment' && c.field === 'light').value, 500);
});

// ---------------------------------------------------------------- E6 · no environment, no effect

test('E6 · the same circuit without `environment`: the photoresistor keeps its own default', () => {
  const lit = engineOf(laserBench());
  const bare = engineOf(dividerOnly());
  within(ldrR(lit), ldrR(bare), 1e-9, 'resistance with and without the laser');
});

test('E6 · ... and check carries ENV_EMITTER_ALONE, an info, in both languages', () => {
  const issues = checkCircuit(laserBench()).issues.filter((i) => i.code === 'ENV_EMITTER_ALONE');
  assert.equal(issues.length, 1, `check: ${codes(checkCircuit(laserBench()).issues)}`);
  assert.equal(issues[0].severity, 'info');
  const [en, es] = [formatIssue(issues[0], 'en'), formatIssue(issues[0], 'es')];
  assert.notEqual(en, es);
  assert.doesNotMatch(en + es, /\{\w+\}|undefined|NaN/);
  assert.match(en, /environment/i);
});

test('E6 · ... and so does the simulation; with an environment, neither does', () => {
  assert.ok(codes(run(laserBench()).issues).includes('ENV_EMITTER_ALONE'));
  assert.ok(!codes(checkCircuit(laserBench({ environment: { light: 50 } })).issues).includes('ENV_EMITTER_ALONE'));
  assert.ok(!codes(run(laserBench({ environment: { light: 50 } })).issues).includes('ENV_EMITTER_ALONE'));
});

// ---------------------------------------------------------------- E7 · DC

test('E7 · DC simulate() of the E3 circuit gives the lit photoresistor', () => {
  const r = run(laserBench({ environment: { light: 50 } }));
  const dark = ldrResistance(GL5528, 50);
  assert.ok(r.parts.LDR1.sensor.resistance < dark / 10, `${r.parts.LDR1.sensor.resistance} Ω vs ${dark} Ω at 50 lx`);
  assert.ok(!codes(r.issues).includes('SIM_ENV_FEEDBACK'), 'no loop, no note');
});

// ---------------------------------------------------------------- E8 · feedback

// A lamp that turns itself off. The laser (S on 5 V) is switched on its low side by an NPN: the laser's −
// goes to the collector. An LDR-LM393 module watches the light; its DO is an open collector with a pull-up,
// and DO goes LOW when the light is above the trimmer's point (about 18 lx at 0.5). DO feeds the base
// through 1 kΩ: in the dark (5 lx) DO is HIGH, the transistor conducts and the laser lights; in the
// laser's light DO goes LOW, the transistor turns OFF and the laser goes out. So the laser's own light
// turns it off, and there is no steady state.
const feedbackBench = () => ({
  supplies: [{ id: 'V1', voltage: 5 }],
  environment: { light: 5 },
  parts: [
    { id: 'LS1', type: 'laser', part: 'KY-008', pins: ['f10', 'f11', 'f12'] },
    { id: 'W1', type: 'wire', color: 'red', pins: ['T+10', 'j10'] },
    { id: 'W2', type: 'wire', color: 'orange', pins: ['j12', 'j40'] },
    { id: 'U1', type: 'sensor-module', part: 'LDR-LM393', threshold: 0.5, pins: ['f20', 'f21', 'f22'] },
    { id: 'W3', type: 'wire', color: 'black', pins: ['T-21', 'j21'] },
    { id: 'W4', type: 'wire', color: 'red', pins: ['T+22', 'j22'] },
    { id: 'W5', type: 'wire', color: 'yellow', pins: ['j20', 'j34'] },
    { id: 'R1', type: 'resistor', value: '1k', pins: ['h34', 'h38'] },
    { id: 'W7', type: 'wire', color: 'green', pins: ['j38', 'j41'] },
    { id: 'Q1', type: 'bjt', part: '2N2222A', pins: { C: 'h40', B: 'h41', E: 'h42' } },
    { id: 'W6', type: 'wire', color: 'black', pins: ['j42', 'T-42'] },
  ],
});

test('E8 · a laser that turns itself off ends with SIM_ENV_FEEDBACK and does not hang', { timeout: 20000 }, () => {
  const r = run(feedbackBench());
  assert.ok(codes(r.issues).includes('SIM_ENV_FEEDBACK'), `issues: ${codes(r.issues)}`);
  const note = r.issues.find((i) => i.code === 'SIM_ENV_FEEDBACK');
  const [en, es] = [formatIssue(note, 'en'), formatIssue(note, 'es')];
  assert.notEqual(en, es);
  assert.doesNotMatch(en + es, /\{\w+\}|undefined|NaN/);
  const e = engineOf(feedbackBench());
  assert.ok(e.advance(1e-3), 'a step runs on');
});

// ---------------------------------------------------------------- E9 · time stepping with a UNO pin

const layoutOf = (name) => {
  const { spec, problems } = expandRecipe(name);
  assert.deepEqual(problems, [], `${name}: ${JSON.stringify(problems)}`);
  return autoLayout(spec);
};

test('E9 · laser-uno: the seen light is high while the pin is high and back at the ambient within two steps of the pin going low', { timeout: 120000 }, () => {
  const { circuit } = layoutOf('laser-uno');
  const laser = circuit.parts.find((p) => p.type === 'laser').id;
  const e = engineOf(circuit, 2e-3);
  const ambient = e.ambient().light;
  // The pin is read as the laser's current in the same step: high above 10 mA, low under 1 mA.
  const trace = [];
  for (let k = 0; k < 2500; k++) {
    assert.ok(e.advance(2e-3));
    trace.push([e.read().parts[laser].current, e.environment().light]);
  }
  let rises = 0;
  let falls = 0;
  let high = false;
  let highSince = 0;
  for (let k = 0; k < trace.length; k++) {
    const [i, seen] = trace[k];
    if (!high && i > 0.01) {
      high = true;
      highSince = k;
      rises++;
    } else if (high && i < 0.001) {
      high = false;
      falls++;
      const [, later] = trace[Math.min(k + 2, trace.length - 1)];
      within(later, ambient, 0.01, `seen light two steps after the pin fell at step ${k}`);
    }
    if (high && k >= highSince + 2) assert.ok(seen > 5000, `seen light ${seen} lx while high (step ${k})`);
  }
  assert.ok(rises >= 1 && falls >= 1, `the pin goes high and low within 5 s (${rises} rises, ${falls} falls)`);
});

// ---------------------------------------------------------------- E10 · no regression

test('E10 · node scripts/golden.js exits 0 (no --write)', { timeout: 120000 }, () => {
  execFileSync(process.execPath, ['scripts/golden.js'], { cwd: root, stdio: 'pipe' });
});

test('E10 · a circuit with no emitter: emissions() is {} and no control carries `emitted`', () => {
  const e = engineOf(dividerOnly({ light: 50, temperature: 25 }));
  assert.deepEqual(e.emissions(), {});
  const controls = e.controls().filter((c) => c.id === 'environment');
  assert.ok(controls.length > 0);
  for (const c of controls) assert.ok(!('emitted' in c), `${c.field} carries emitted`);
  assert.equal(e.environment().light, 50);
  assert.equal(e.ambient().light, 50);
});

// ---------------------------------------------------------------- E11 · the two recipes

for (const name of ['laser-tripwire', 'laser-uno']) {
  test(`E11 · recipe ${name} is DONE, check clean, with an environment and page controls, nothing hidden in both views`, () => {
    assert.ok(RECIPES[name], `${name} is in RECIPES`);
    for (const lang of ['en', 'es']) {
      assert.ok(RECIPES[name].title?.[lang], `${name}: title ${lang}`);
      assert.ok(RECIPES[name].teaches?.[lang], `${name}: teaches ${lang}`);
    }
    const r = layoutOf(name);
    assert.equal(r.status, 'done', JSON.stringify(r.problems) + JSON.stringify(r.check));
    assert.deepEqual(r.problems, []);
    assert.equal(r.check.ok, true, JSON.stringify(r.check));
    const bad = checkCircuit(r.circuit).issues.filter((i) => i.severity === 'error' || i.severity === 'warning');
    assert.deepEqual(codes(bad), [], name);
    assert.ok(r.circuit.parts.some((p) => p.type === 'laser' && p.part === 'KY-008'), 'a KY-008');
    assert.ok(r.circuit.environment && Object.keys(r.circuit.environment).length > 0, 'environment declared');
    assert.ok(Array.isArray(r.circuit.page?.controls) && r.circuit.page.controls.length > 0, 'page.controls declared');
    // A tall standing module shades what sits behind it in one view: no part may be left hidden in both
    // (each is at least half visible in one of them).
    const best = new Map();
    for (const view of ['front', 'back']) for (const p of inspectCircuit(r.circuit, { view }).parts) best.set(p.id, Math.max(best.get(p.id) ?? 0, p.visible));
    const both = [...best].filter(([, visible]) => visible < 0.5).map(([id]) => id);
    assert.deepEqual(both, [], 'parts hidden in both views');
  });
}

test('E11 · laser-tripwire declares light and beam, with both on the page', () => {
  const { circuit } = layoutOf('laser-tripwire');
  assert.equal(circuit.environment.light, 50);
  assert.ok('beam' in circuit.environment);
  const fields = circuit.page.controls.map((c) => c.environment);
  assert.ok(fields.includes('light') && fields.includes('beam'), `controls: ${JSON.stringify(circuit.page.controls)}`);
  assert.ok(circuit.parts.some((p) => p.part === 'LDR-LM393'), 'an LDR-LM393 module');
});

test('E11 · laser-tripwire: the LED is off with the beam free and on with beam = 1', () => {
  const { circuit } = layoutOf('laser-tripwire');
  const led = circuit.parts.find((p) => p.type === 'led').id;
  const e = engineOf(circuit);
  const steps = (n) => { for (let k = 0; k < n; k++) assert.ok(e.advance(1e-3)); };
  steps(20);
  assert.ok(Math.abs(e.read().parts[led].current) < 1e-4, `free: LED current ${e.read().parts[led].current} A`);
  assert.ok(e.set('environment', 'beam', 1));
  steps(20);
  assert.ok(e.read().parts[led].current > 1e-3, `cut: LED current ${e.read().parts[led].current} A`);
  assert.ok(e.set('environment', 'beam', 0));
  steps(20);
  assert.ok(Math.abs(e.read().parts[led].current) < 1e-4, `free again: LED current ${e.read().parts[led].current} A`);
});

test('E11 · laser-uno carries a sketch that prints the reading', () => {
  const { circuit } = layoutOf('laser-uno');
  const uno = circuit.parts.find((p) => p.part === 'UNO');
  assert.ok(uno?.program?.includes('Serial.println'), 'prints');
  assert.ok(uno.program.includes('analogRead'), 'reads the sensor');
  // The three-pin LDR-LM393 board has no analog output: a photoresistor divider on A0 is as good.
  assert.ok(circuit.parts.some((p) => p.part === 'LDR-LM393' || p.type === 'ldr'), 'a light sensor');
});

// ---------------------------------------------------------------- E12 · pinout and the tour

test('E12 · the laser has everything for its view up close (symbol, mark, inside view, drawer, legend, pin texts in both languages)', () => {
  const figure = readFileSync(join(root, 'src/page/client/figure.js'), 'utf8');
  const legends = readFileSync(join(root, 'src/page/client/focus-view.js'), 'utf8');
  const both = (key) => ['en', 'es'].every((lang) => translate(lang, key) !== key);
  const p = buildCircuit(layoutOf('laser-tripwire').circuit).parts.find((x) => x.type === 'laser');
  assert.ok(p, 'a laser in the recipe');
  for (const n of p.pinNames) assert.ok(both(`pin.role.${p.raw?.part}.${n}`) || both('pin.role.laser.' + n), `the text of pin ${n} (pin.role.*) in every language`);
  const symbol = symbolOf(p);
  assert.ok(symbol, 'a symbol');
  for (const n of p.pinNames) assert.ok(symbol.ids?.[n] && symbol.pins[n], `the symbol's terminal and letter for pin ${n}`);
  assert.ok(p.built?.mark, "the package's orientation mark");
  const inside = insideOf(p);
  assert.ok(inside, 'an inside view');
  assert.match(figure, new RegExp(`\\n  ${inside.kind}\\(g, r, data`), 'its drawer in figure.js INSIDE');
  const legend = legends.match(new RegExp(`\\n  ${inside.kind}: \\[(.*)\\],`))?.[1];
  assert.ok(legend, 'its legend in focus-view.js LEGENDS');
  for (const [, key] of legend.matchAll(/\['[a-z]*', '([a-z]+)'\]/g)) assert.ok(both(`page.tour.legend.${inside.kind}.${key}`), `legend line ${key} in every language`);
});

test('E12 · tour laser-tripwire.json validates, in Spanish, 20 to 30 s, a gauge of light, the beam set on and off twice', () => {
  const file = join(tours, 'laser-tripwire.json');
  assert.ok(existsSync(file), 'examples/tours/laser-tripwire.json');
  const timeline = JSON.parse(readFileSync(file, 'utf8'));
  const circuit = timelineCircuit(file, timeline);
  assert.deepEqual(tourIssues({ ...circuit, page: { ...circuit.page, tour: timeline } }), []);
  const steps = timeline.steps;
  const captions = steps.filter((s) => s.do === 'caption');
  assert.ok(captions.length > 0, 'captions');
  for (const s of captions) assert.ok(s.text?.es, `step at ${s.at}: a Spanish caption`);
  const last = Math.max(...steps.map((s) => s.at));
  assert.ok(last >= 20000 && last <= 30000, `last step at ${last} ms`);
  assert.ok(steps.some((s) => s.do === 'gauge' && s.environment === 'light' && s.on === true), 'a gauge on light');
  const sets = steps.filter((s) => s.do === 'set' && s.environment === 'beam');
  assert.ok(sets.filter((s) => s.value === 1 || s.value === true).length >= 2, 'beam set on twice');
  assert.ok(sets.filter((s) => s.value === 0 || s.value === false).length >= 2, 'beam set off twice');
});
