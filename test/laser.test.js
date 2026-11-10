// The KY-008 laser module (docs/en/environment.md#the-ky-008-laser): its type and pins, its current
// and optical power against the hand calculation (an LED of 2.2 V at 25 mA behind 100 Ω, lasing above
// 22 mA at 0.5 W/A), what it adds to the light, and its stresses and notes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulate, compile, createEngine } from '../src/sim/index.js';
import { checkCircuit, inspectCircuit } from '../src/index.js';
import { expandRecipe } from '../src/recipes/index.js';
import { autoLayout } from '../src/layout.js';
import { tourIssues, loadTour } from '../src/tour.js';
import { renderPage } from '../src/page.js';
import { installClock } from './clock.js';
import { PART_TYPES } from '../src/parts/types/index.js';
import { buildCircuit } from '../src/circuit/build.js';
import { LASER, opticalPower, addedLight } from '../src/sim/devices/laser.js';
import { partLines } from '../src/sim/format.js';

const codes = (issues) => issues.map((i) => i.code);
// The laser between the rails of a bench supply at `volts` (S on +, or reversed).
const circuit = (volts, { reversed = false, env = { light: 50 } } = {}) => ({
  version: 1,
  board: 'bb830',
  ...(env && { environment: env }),
  parts: [
    { id: 'LS1', type: 'laser', pins: reversed ? ['e12', 'e11', 'e10'] : ['e10', 'e11', 'e12'] },
    { id: 'W1', type: 'wire', pins: ['a10', 'T+10'] },
    { id: 'W2', type: 'wire', pins: ['a12', 'T-12'] },
  ],
  supplies: [{ id: 'V1', kind: 'bench', voltage: volts, positive: 'T+', negative: 'T-' }],
});
const laserAt = (volts, options) => {
  const r = simulate(circuit(volts, options));
  assert.ok(r.ok);
  return { p: r.parts.LS1, issues: codes(r.issues) };
};
// The hand calculation: I from V = R·I + Vf(I), Vf following the diode's equation through 2.2 V at 25 mA.
const expected = (volts) => {
  let i = 0.02;
  for (let k = 0; k < 60; k++) i = (volts - (LASER.vf + LASER.n * 0.025852 * Math.log(i / LASER.at) + LASER.rs * (i - LASER.at))) / LASER.series;
  return i;
};

test('laser: the type, its pins S + − and the KY-008 by default', () => {
  assert.equal(PART_TYPES.laser.family, 'led');
  assert.deepEqual(PART_TYPES.laser.pins, ['S', '+', '−']);
  const [part] = buildCircuit({ parts: [{ id: 'LS1', type: 'laser', pins: ['a10', 'a11', 'a12'] }] }).parts;
  assert.equal(part.def.electrical.part, 'KY-008');
  assert.equal(part.def.package, 'laser-module');
  // A pin written with a hyphen is the − pin.
  const wired = buildCircuit({ parts: [{ id: 'LS1', type: 'laser', pins: { S: 'a10', '+': 'a11', '-': 'a12' } }] });
  assert.deepEqual(wired.issues.filter((i) => i.severity === 'error'), []);
});

test('laser: at 5 V about 28 mA, 3 mW and 10 000 lx; at 6 V 38 mA and no over-current; 7.5 V over-current', () => {
  const five = laserAt(5);
  assert.ok(Math.abs(five.p.current - expected(5)) < 2e-4, `${five.p.current} against ${expected(5)}`);
  assert.ok(Math.abs(five.p.current - 0.028) < 0.002);
  assert.ok(Math.abs(five.p.opticalPower - 0.003) < 3e-4);
  assert.ok(Math.abs(five.p.light - 1e4) < 500);
  assert.equal(five.p.state, 'lasing');
  assert.deepEqual(five.issues, []);
  const six = laserAt(6);
  assert.ok(Math.abs(six.p.current - 0.038) < 0.002);
  assert.ok(!six.issues.includes('SIM_OVER_CURRENT'));
  assert.ok(six.issues.includes('SIM_LASER_POWER'), 'over 5 mW: past its class');
  assert.ok(laserAt(7.5).issues.includes('SIM_OVER_CURRENT'));
});

test('laser: reversed at 5 V it adds nothing and says SIM_REVERSE_VOLTAGE', () => {
  const r = laserAt(5, { reversed: true });
  assert.ok(Math.abs(r.p.current) < 1e-6);
  assert.equal(r.p.light, 0);
  assert.equal(r.p.state, 'reversed');
  assert.ok(r.issues.includes('SIM_REVERSE_VOLTAGE'));
});

test('laser: under its threshold it glows (SIM_LASER_DIM) and adds nothing; off at 0 V', () => {
  const dim = laserAt(3.5);
  assert.ok(dim.p.current > LASER.glow && dim.p.current < LASER.threshold);
  assert.equal(dim.p.light, 0);
  assert.equal(dim.p.state, 'dim');
  assert.ok(dim.issues.includes('SIM_LASER_DIM'));
  assert.equal(laserAt(0).p.state, 'off');
  assert.equal(opticalPower(0.022), 0);
  assert.ok(Math.abs(addedLight(0.025) - 3.333e6 * 0.5 * 0.003) < 1e-6);
});

test('laser: its card says what it adds, that it is blocked, or that no environment receives it', () => {
  const lines = (r, lang = 'en') => partLines(r, lang).map((l) => l.text);
  const lit = simulate(circuit(5)).parts.LS1;
  assert.match(lines(lit)[0], /^adds 9\.\d klx to the light$/);
  assert.match(lines(lit, 'es')[0], /^agrega 9,\d klx a la luz$/);
  assert.ok(lines(lit).some((t) => /Middle pin \(\+\): not connected/.test(t)));
  const blocked = simulate(circuit(5, { env: { light: 50, beam: true } })).parts.LS1;
  assert.equal(lines(blocked)[0], 'blocked (beam): its light reaches no sensor');
  const alone = simulate(circuit(5, { env: null })).parts.LS1;
  assert.match(lines(alone)[0], /no environment/);
  assert.equal(lines(simulate(circuit(3.5)).parts.LS1)[0], 'below its threshold: no beam (a dim glow)');
});

// ---------------------------------------------------------------- the two recipes and the tour

const layoutOf = (name) => {
  const { spec, problems } = expandRecipe(name);
  assert.deepEqual(problems, []);
  return autoLayout(spec);
};
const laidOut = new Map();
const circuitOf = (name) => {
  if (!laidOut.has(name)) laidOut.set(name, layoutOf(name));
  return laidOut.get(name);
};

for (const name of ['laser-tripwire', 'laser-uno']) {
  test(`${name}: DONE, check clean, every part at least half seen in one of the two views`, () => {
    const r = circuitOf(name);
    assert.equal(r.status, 'done', JSON.stringify(r.review.blocking));
    const bad = checkCircuit(r.circuit).issues.filter((i) => i.severity === 'error' || i.severity === 'warning');
    assert.deepEqual(codes(bad), []);
    const seen = new Map();
    for (const view of ['front', 'back']) {
      const report = inspectCircuit(r.circuit, { view });
      assert.deepEqual(report.problems.filter((p) => (p.severity === 'error' || p.severity === 'warning') && p.code !== 'PART_HIDDEN'), [], view);
      for (const p of report.parts) seen.set(p.id, Math.max(seen.get(p.id) ?? 0, p.visible));
    }
    for (const [id, visible] of seen) assert.ok(visible >= 0.5, `${id}: ${Math.round(visible * 100)} % at best`);
    const sim = simulate(r.circuit);
    assert.ok(sim.ok);
    assert.ok(Object.values(sim.parts).every((p) => (p.stress ?? []).every((s) => s.level === 'fine')), 'nothing stressed');
  });
}

test('laser-tripwire: the LED is off while the beam reaches the module, on while it is cut', () => {
  const e = createEngine(compile(circuitOf('laser-tripwire').circuit).program);
  assert.ok(e.start('dc'));
  assert.ok(e.read().parts.D1.current < 1e-4);
  assert.ok(e.read().parts.U1.vout < 0.5, 'DO low in the beam');
  assert.ok(e.set('environment', 'beam', true));
  assert.equal(e.environment().light, 50);
  assert.ok(e.read().parts.D1.current > 5e-3);
  assert.ok(e.set('environment', 'beam', false));
  assert.ok(e.read().parts.D1.current < 1e-4);
});

test('laser-uno: the light the sensors see follows the pin within a step; the Serial monitor prints both', () => {
  const e = createEngine(compile(circuitOf('laser-uno').circuit).program);
  assert.ok(e.start('dc', 1e-3));
  const samples = [];
  for (let k = 0; k < 2100; k++) {
    assert.ok(e.advance(1e-3));
    samples.push([e.read().parts.LS1.light > 0, e.environment().light > 1000]);
  }
  // Every step after the first: what the sensors see is what the laser gave one step before.
  for (let k = 1; k < samples.length; k++) assert.equal(samples[k][1], samples[k - 1][0], `step ${k}`);
  assert.ok(samples.filter(([lit]) => lit).length > 900 && samples.filter(([lit]) => !lit).length > 900);
  const serial = e.read().parts.U1.program.serial;
  assert.ok(serial.some((l) => /^on {2}A0=\d+/.test(l)) && serial.some((l) => /^off A0=\d+/.test(l)));
  const value = (prefix) => Number(serial.find((l) => l.startsWith(prefix)).split('=')[1]);
  assert.ok(value('on') > value('off') + 200, serial.join(' | '));
});

test('laser-tripwire tour: validates, 20–30 s, Spanish captions, a gauge of light and beam cut twice', () => {
  const raw = JSON.parse(readFileSync(new URL('../examples/tours/laser-tripwire.json', import.meta.url), 'utf8'));
  const circuit = { ...circuitOf('laser-tripwire').circuit };
  circuit.page = { ...circuit.page, tour: raw };
  assert.deepEqual(tourIssues(circuit), []);
  assert.ok(loadTour(circuit, 'es').tour);
  const end = Math.max(...raw.steps.map((s) => s.at + (s.ms ?? 0)));
  assert.ok(end >= 20000 && end <= 30000, `${end} ms`);
  assert.ok(raw.steps.some((s) => s.do === 'gauge' && s.environment === 'light' && s.on));
  assert.equal(raw.steps.filter((s) => s.do === 'set' && s.environment === 'beam' && s.value === true).length, 2);
  assert.equal(raw.steps.filter((s) => s.do === 'set' && s.environment === 'beam' && s.value === false).length, 2);
  assert.ok(raw.steps.filter((s) => s.do === 'caption').every((s) => s.text?.es));
});

// ---------------------------------------------------------------- the page (jsdom)

async function loadPage(html) {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    return null;
  }
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://page.test/laser.html' });
  const { window } = dom;
  const rect = () => ({ left: 0, top: 0, right: 800, bottom: 500, width: 800, height: 500 });
  window.document.querySelector('main').getBoundingClientRect = rect;
  for (const svg of window.document.querySelectorAll('svg')) svg.getBoundingClientRect = rect;
  window.testClock = installClock(window);
  window.eval(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  return window;
}

test('page: the light row says the laser\'s share, the slider stays on the ambient, beam blocks it', async (t) => {
  const c = circuitOf('laser-tripwire').circuit;
  const window = await loadPage(renderPage(c, { lang: 'es' }).html);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const rows = [...doc.querySelectorAll('.side .environment .env-row')];
  const row = (field) => rows.find((r) => r.querySelector('.control').dataset.field === field);
  const light = row('light');
  assert.match(light.querySelector('output').textContent, /^50 lx \+ 9,\d klx de LS1$/);
  // The indicator shows what the sensors see; the slider the ambient.
  assert.match(light.querySelector('svg.gauge > text').textContent, /^9,\d klx$/);
  const live = window.protoboardLive;
  assert.equal(live.engine.ambient().light, 50);
  // Cut the beam: the row says it is blocked, the indicator falls to the room's light, the LED lights.
  row('beam').querySelector('button').click();
  assert.equal(light.querySelector('output').textContent, '50 lx · LS1 bloqueado (haz)');
  assert.equal(light.querySelector('svg.gauge > text').textContent, '50 lx');
  assert.ok(live.reading.parts.D1.current > 5e-3);
});
