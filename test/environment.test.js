// The environment (sensors, S0; docs/en/environment.md): the registry, programs, a learner's pause
// and resume, which part follows a field and which keeps its own value, its controls, what check
// says, the engine that moves the parts with it, the page's panel and indicators, and a timeline's
// set and gauge (jsdom).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FIELDS, programValue, createEnvironment, environmentControls, environmentIssues, envText, cleanEnvironment, MAX_POINTS } from '../src/sim/environment.js';
import { compile, createEngine, simulate } from '../src/sim/index.js';
import { paceOf } from '../src/sim/pace.js';
import { ldrResistance, ntcResistance, LDR_PARTS } from '../src/parts/sensors.js';
import { checkCircuit } from '../src/index.js';
import { renderPage } from '../src/page.js';
import { loadTour, tourIssues } from '../src/tour.js';
import { CIRCUIT_FOLDER } from '../src/beside.js';
import { LIMITS } from '../src/limits.js';
import { applyOps } from '../src/ops.js';
import { linesFor } from '../src/sim/lines.js';
import { installClock } from './clock.js';

const examples = fileURLToPath(new URL('../examples/', import.meta.url));
const example = (name) => Object.defineProperty(JSON.parse(readFileSync(`${examples}${name}`, 'utf8')), CIRCUIT_FOLDER, { value: examples });
const codes = (issues) => issues.map((i) => i.code);
const close = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-12);
const engineOf = (circuit) => {
  const e = createEngine(compile(circuit).program);
  assert.ok(e.start('dc'));
  return e;
};
const GL5528 = LDR_PARTS.GL5528;

// 5 V, an LDR under 10 kΩ (a divider) and a tilt switch in series with 1 kΩ; the environment is given.
const sensors = (environment, own = {}) => ({
  supplies: [{ id: 'V1', voltage: 5 }],
  ...(environment !== undefined && { environment }),
  parts: [
    { id: 'R1', type: 'resistor', value: '10k', pins: ['T+3', 'a3'] },
    { id: 'L1', type: 'ldr', pins: ['b3', 'T-6'], ...own.L1 },
    { id: 'S1', type: 'tilt-switch', pins: ['e10', 'e12'], ...own.S1 },
    { id: 'W1', type: 'wire', color: 'red', pins: ['T+10', 'a10'] },
    { id: 'R2', type: 'resistor', value: '1k', pins: ['a12', 'T-12'] },
  ],
});

test('environment: the registry has every field, each on one line, with its range, scale and default', () => {
  const expected = { light: 300, temperature: 25, humidity: 50, moisture: 30, water: 0, rain: 0, distance: 50, field: 0, motion: 0, touch: 0, vibration: 0, sound: 40, tilt: 0, angle: 0 };
  assert.deepEqual(Object.fromEntries(Object.entries(FIELDS).map(([k, f]) => [k, f.default])), expected);
  for (const [name, f] of Object.entries(FIELDS)) {
    for (const key of ['unit', 'min', 'max', 'limit', 'scale', 'default', 'kind']) assert.ok(key in f, `${name}.${key}`);
    assert.ok(['log', 'linear'].includes(f.scale), name);
    assert.ok(['level', 'switch'].includes(f.kind), name);
    assert.ok(f.limit[0] <= f.min && f.min < f.max && f.max <= f.limit[1], `${name}: the slider inside its limit`);
    assert.ok(f.default >= f.limit[0] && f.default <= f.limit[1], name);
  }
  assert.deepEqual([FIELDS.light.min, FIELDS.light.max, FIELDS.light.scale, FIELDS.light.unit], [0.1, 10000, 'log', 'lx']);
  assert.deepEqual([FIELDS.temperature.min, FIELDS.temperature.max, FIELDS.temperature.limit, FIELDS.temperature.step], [-20, 100, [-55, 150], 1]);
  assert.deepEqual(['rain', 'motion', 'touch', 'vibration', 'tilt'].filter((k) => FIELDS[k].kind === 'switch'), ['rain', 'motion', 'touch', 'vibration', 'tilt']);
  // One line each in the module, so a new magnitude is one line.
  const source = readFileSync(new URL('../src/sim/environment.js', import.meta.url), 'utf8');
  for (const name of Object.keys(FIELDS)) assert.match(source, new RegExp(`^  ${name}: \\{.*\\},$`, 'm'), name);
  assert.equal(LIMITS.envPoints, MAX_POINTS);
});

test('environment: programs, each against its own formula', () => {
  const toggle = { kind: 'toggle', high: 1000, low: 2, on: 3, off: 1 };
  assert.deepEqual([0, 2.9, 3, 3.9, 4, 7.5].map((t) => programValue(toggle, t)), [1000, 1000, 2, 2, 1000, 2]);
  const sine = { kind: 'cycle', shape: 'sine', period: 8, min: 5, max: 2000 };
  for (const t of [0, 1, 2.5, 6, 9.3]) assert.ok(close(programValue(sine, t), 1002.5 + 997.5 * Math.sin((2 * Math.PI * t) / 8)), `sine at ${t}`);
  assert.ok(close(programValue({ ...sine, shape: undefined }, 2), 2000), 'sine by default');
  const square = { kind: 'cycle', shape: 'square', period: 2, min: 0, max: 10 };
  assert.deepEqual([0, 0.99, 1, 1.5, 2].map((t) => programValue(square, t)), [10, 10, 0, 0, 10]);
  const tri = { kind: 'cycle', shape: 'triangle', period: 4, min: 0, max: 8 };
  assert.deepEqual([0, 1, 2, 3, 4].map((t) => programValue(tri, t)), [0, 4, 8, 4, 0]);
  const ramp = { kind: 'ramp', from: 25, to: 60, seconds: 7 };
  assert.deepEqual([-1, 0, 3.5, 7, 100].map((t) => programValue(ramp, t)), [25, 25, 42.5, 60, 60]);
  assert.equal(programValue({ kind: 'ramp', from: 1, to: 9, seconds: 0 }, 0), 9, 'a ramp of no time is already there');
  const keys = { kind: 'keyframes', points: [[1, 10], [3, 30], [3, 50], [5, 0]] };
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map((t) => programValue(keys, t)), [10, 10, 20, 30, 25, 0, 0]);
  assert.deepEqual([6, 7].map((t) => programValue({ ...keys, loop: true }, t)), [10, 20], 'a loop starts again after the last');
  assert.ok(Number.isNaN(programValue({ kind: 'keyframes', points: [] }, 1)));
  assert.ok(Number.isNaN(programValue({ kind: 'nope' }, 1)));
  assert.equal(programValue({ kind: 'toggle', high: 4, low: 0, on: 0, off: 0 }, 3), 4);
});

test('environment: a set pauses a program, resume starts it again from its beginning, rewind goes back to t = 0', () => {
  const env = createEnvironment({ light: { program: { kind: 'ramp', from: 10, to: 110, seconds: 10 } }, temperature: 40, rain: true }, ['distance', 'nope']);
  assert.deepEqual(env.fields(), ['light', 'temperature', 'rain', 'distance'], 'named, then the extra known ones');
  assert.deepEqual(env.values(), { light: 10, temperature: 40, rain: 1, distance: 50 });
  assert.equal(env.at(5).light, 60);
  assert.ok(env.programmed('light') && !env.paused('light'));
  assert.deepEqual(env.spans(), [10]);
  assert.ok(env.set('light', 33));
  assert.ok(env.paused('light'));
  assert.deepEqual(env.spans(), [], 'a paused program does not move the pace');
  assert.equal(env.at(8).light, 33, 'paused');
  assert.ok(env.resume('light'));
  assert.equal(env.value('light'), 10, 'from its beginning');
  assert.equal(env.at(13).light, 60, 'five seconds after the resume');
  assert.equal(env.resume('temperature'), false, 'nothing to resume');
  assert.equal(env.rewind().light, 10);
  assert.equal(env.at(5).light, 60);
  // Clamped to the limit; a switch is 0 or 1; an unknown field or a value that is not a number is refused.
  assert.ok(env.set('temperature', 900));
  assert.equal(env.value('temperature'), 150);
  assert.ok(env.set('rain', 0.3));
  assert.equal(env.value('rain'), 1);
  assert.equal(env.set('nope', 1), false);
  assert.equal(env.set('temperature', 'hot'), false);
  assert.ok(env.set('angle', 90), 'a field the circuit did not name joins');
  assert.equal(env.value('angle'), 90);
  assert.equal(env.value('sound'), 40, 'a field not there reads its default');
  // The spec as the simulation takes it.
  assert.deepEqual(cleanEnvironment({ light: -5, nope: 1, temperature: { value: 30, program: { kind: 'bad' } }, water: { program: { kind: 'ramp', from: 2, to: 4, seconds: 1 } } }), { light: { value: 0 }, temperature: { value: 30 }, water: { value: 2, program: { kind: 'ramp', from: 2, to: 4, seconds: 1 } } });
  assert.deepEqual(cleanEnvironment([1]), {});
});

test('environment: its controls are shaped like a device\'s, with the id "environment"', () => {
  const env = createEnvironment({ light: 300, tilt: 1, sound: { program: { kind: 'toggle', high: 90, low: 40, on: 1, off: 1 } } });
  const controls = environmentControls(env);
  assert.deepEqual(controls.map((c) => [c.id, c.field, c.scale]), [['environment', 'light', 'log'], ['environment', 'tilt', 'toggle'], ['environment', 'sound', 'linear']]);
  assert.deepEqual(controls[0], { id: 'environment', field: 'light', min: 0.1, max: 10000, limit: [0, 1e6], unit: 'lx', kind: 'level', scale: 'log', value: 300 });
  assert.equal(controls[1].value, true);
  assert.deepEqual([controls[2].programmed, controls[2].paused, controls[2].step], [true, false, 1]);
  assert.deepEqual(environmentControls(null), []);
  // The page's words for a value.
  assert.deepEqual([0.1, 5.04, 48.4, 300, 2500, 0].map((v) => envText('light', v, ',')), ['0,1 lx', '5 lx', '48 lx', '300 lx', '2,5 klx', '0 lx']);
  assert.equal(envText('temperature', 24.6), '25 °C');
  assert.equal(envText('angle', 90), '90°');
  assert.equal(envText('tilt', 1), null);
  assert.equal(envText('nope', 1), null);
});

test('environment: check names unknown fields, values out of range and programs that cannot run', () => {
  assert.deepEqual(environmentIssues({}), []);
  assert.deepEqual(codes(environmentIssues({ environment: [] })), ['ENV_SHAPE']);
  const issues = environmentIssues({
    environment: {
      lux: 3,
      light: 2e6,
      temperature: { value: 20, program: { kind: 'ramp', from: 20, to: 400, seconds: 3 } },
      sound: { program: { kind: 'cycle', period: 0, min: 1, max: 2 } },
      water: { level: 3 },
      angle: 'x',
      distance: { program: { kind: 'keyframes', points: Array.from({ length: MAX_POINTS + 1 }, (_, k) => [k, 10]) } },
      humidity: { program: { kind: 'keyframes', points: [[2, 10], [1, 20]] } },
      moisture: { program: { kind: 'toggle', high: 1, low: 0, on: -1, off: 2 } },
      field: { program: 'sine' },
      motion: true,
    },
  });
  assert.deepEqual(codes(issues), ['ENV_UNKNOWN_FIELD', 'ENV_OUT_OF_RANGE', 'ENV_OUT_OF_RANGE', 'ENV_BAD_PROGRAM', 'ENV_SHAPE', 'ENV_SHAPE', 'ENV_TOO_LARGE', 'ENV_BAD_PROGRAM', 'ENV_BAD_PROGRAM', 'ENV_BAD_PROGRAM']);
  assert.ok(issues.every((i) => i.severity === 'error'));
  assert.equal(issues[0].params.field, 'lux');
  // check reports them with the circuit's other issues, and the circuit still simulates (clamped).
  const circuit = sensors({ light: 2e6, lux: 1 });
  const found = codes(checkCircuit(circuit).issues);
  assert.ok(found.includes('ENV_UNKNOWN_FIELD') && found.includes('ENV_OUT_OF_RANGE'), found.join(' '));
  assert.ok(simulate(circuit).ok);
  // page.controls may name a field of the environment.
  const page = (controls) => codes(checkCircuit({ ...sensors({ light: 300 }), page: { controls } }).issues).filter((c) => c.startsWith('PAGE_') || c.startsWith('ENV_'));
  assert.deepEqual(page([{ environment: 'light' }, { environment: 'tilt' }, { environment: 'light', min: 1, max: 1000 }]), []);
  assert.deepEqual(page([{ environment: 'lux' }]), ['ENV_UNKNOWN_FIELD']);
  assert.deepEqual(page([{ environment: 'light', min: 0, max: 100 }]), ['PAGE_CONTROL_RANGE'], 'a log range from 0');
  assert.deepEqual(page([{ environment: 'light', field: 'light' }]), ['PAGE_CONTROL_TARGET']);
  assert.deepEqual(page([{ environment: 'light', part: 'L1' }]), ['PAGE_CONTROL_TARGET']);
  // An operation may set it, as the other fields of the circuit.
  const r = applyOps(sensors(), [{ op: 'circuit', environment: { light: 5 } }]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.circuit.environment, { light: 5 });
});

test('environment: a sensor follows the field unless it has a value of its own', () => {
  // No environment: nothing in the program changes (the golden file holds every example).
  const plain = compile(sensors()).program;
  assert.equal(plain.environment, undefined);
  assert.ok(plain.devices.every((d) => !d.senses && !d.follows));
  assert.equal(simulate(sensors()).parts.L1.env, undefined);
  // With one: the LDR follows light, the tilt switch tilt (its own name for it is `tilted`).
  const program = compile(sensors({ light: 50 })).program;
  assert.deepEqual(program.environment, { spec: { light: { value: 50 } }, fields: ['light', 'tilt'] });
  const L1 = program.devices.find((d) => d.id === 'L1');
  assert.deepEqual([L1.senses, L1.follows, L1.env], [['light'], ['light'], { light: 50 }]);
  assert.ok(close(L1.params.resistance, ldrResistance(GL5528, 50)));
  assert.equal(program.devices.find((d) => d.id === 'R1').senses, undefined, 'a resistor senses nothing');
  // A value on the part wins: it senses light, and does not follow it.
  const own = compile(sensors({ light: 50, tilt: 1 }, { L1: { light: 2 }, S1: { tilted: false } })).program;
  const L1own = own.devices.find((d) => d.id === 'L1');
  assert.deepEqual([L1own.senses, L1own.follows], [['light'], undefined]);
  assert.ok(close(L1own.params.resistance, ldrResistance(GL5528, 2)));
  assert.equal(own.devices.find((d) => d.id === 'S1').params.on, false, 'its own `tilted` wins over tilt 1');
  assert.deepEqual(own.environment.fields, ['light', 'tilt'], 'the named fields stay');
  // The card says which: a line of its own, after the device's.
  const r = simulate(sensors({ light: 50 }, { S1: { tilted: true } }));
  assert.deepEqual(r.parts.L1.env, [{ field: 'light', follows: true, value: 50 }]);
  assert.deepEqual(r.parts.S1.env, [{ field: 'tilt', follows: false }]);
  const t = (key, p = {}) => `${key}${JSON.stringify(p)}`;
  assert.equal(linesFor(r.parts.L1, { t, decimal: '.' }).at(-1).text, 'sim.env.follows{"field":"sim.env.field.light{}","value":"50 lx"}');
  assert.equal(linesFor(r.parts.S1, { t, decimal: '.' }).at(-1).text, 'sim.env.own{"field":"sim.env.field.tilt{}"}');
  assert.equal(linesFor({ kind: 'SWT', on: true, contacts: [], current: 0, env: [{ field: 'tilt', follows: true, value: 1 }] }, { t, decimal: '.' }).at(-1).text, 'sim.env.follows{"field":"sim.env.field.tilt{}","value":"sim.env.on{}"}');
});

test('environment: the engine moves every part that follows a field, and a part\'s own control detaches it', () => {
  const circuit = example('environment.json');
  const e = engineOf(circuit);
  const env = e.controls().filter((c) => c.id === 'environment');
  assert.deepEqual(env.map((c) => [c.field, c.value]), [['light', 300], ['temperature', 25]]);
  assert.deepEqual(e.environment(), { light: 300, temperature: 25 });
  const lm35 = () => e.read().parts.U2;
  assert.ok(close(lm35().vout, 0.25, 1e-6), '10 mV per °C at 25 °C');
  assert.ok(e.read().parts.D1.current < 1e-6, 'lit room: the LED is off');
  // Dark: the LDR's resistance from its own formula, the comparator lights the LED.
  assert.ok(e.set('environment', 'light', 5));
  const p = e.program().devices.find((d) => d.id === 'LDR1').params;
  assert.ok(close(p.resistance, ldrResistance(GL5528, 5)));
  assert.ok(e.read().parts.D1.current > 5e-3, 'dark: the LED is on');
  // Warm: the NTC and the LM35 follow the same field.
  assert.ok(e.set('environment', 'temperature', 60));
  assert.ok(close(lm35().vout, 0.6, 1e-6));
  const th = e.program().devices.find((d) => d.id === 'TH1').params;
  assert.ok(close(th.resistance, ntcResistance({ r25: 10e3, beta: 3950 }, 60)));
  // The LDR's own slider: it leaves the field, and the card says so.
  assert.ok(e.set('LDR1', 'light', 1000));
  assert.deepEqual(e.read().parts.LDR1.env, [{ field: 'light', follows: false }]);
  assert.ok(e.set('environment', 'light', 1));
  assert.ok(e.read().parts.D1.current < 1e-6, 'its own 1000 lx: still off');
  // Following again.
  assert.ok(e.attach('LDR1', 'light'));
  assert.ok(e.attach('LDR1', 'light'), 'already');
  assert.deepEqual(e.read().parts.LDR1.env, [{ field: 'light', follows: true, value: 1 }]);
  assert.ok(e.read().parts.D1.current > 5e-3);
  assert.equal(e.attach('R1', 'light'), false, 'a resistor senses nothing');
  assert.equal(e.set('environment', 'lux', 3), false);
  assert.equal(e.resume('environment', 'light'), false, 'no program there');
  assert.equal(e.resume('LDR1', 'light'), false);
  // A tilt switch: its own control field is `tilted`, the environment's is `tilt`.
  const s = engineOf(sensors({ light: 300 }));
  assert.equal(s.read().parts.R2.current > 1e-3, true, 'upright: closed');
  assert.ok(s.set('environment', 'tilt', true));
  assert.ok(Math.abs(s.read().parts.R2.current) < 1e-9, 'tilted: open');
  assert.ok(s.set('S1', 'tilted', false));
  assert.deepEqual(s.read().parts.S1.env, [{ field: 'tilt', follows: false }]);
  assert.ok(s.attach('S1', 'tilt'));
  assert.ok(Math.abs(s.read().parts.R2.current) < 1e-9, 'tilted again with the field');
  // An engine without an environment has no field to set.
  const none = engineOf(sensors());
  assert.equal(none.set('environment', 'light', 3), false);
  assert.deepEqual(none.environment(), {});
  assert.deepEqual(none.stimuli(), []);
  assert.equal(none.controls().some((c) => c.id === 'environment'), false);
  // A field no part follows: set, nothing to solve again.
  const lone = engineOf({ ...sensors({ sound: 50 }), parts: sensors().parts.filter((x) => x.type !== 'ldr' && x.type !== 'tilt-switch') });
  assert.ok(lone.set('environment', 'sound', 80));
  assert.equal(lone.environment().sound, 80);
});

test('environment: a program moves the parts with simulated time; DC takes it at t = 0', () => {
  const circuit = example('environment-cycle.json');
  const program = { kind: 'cycle', shape: 'sine', period: 8, min: 5, max: 2000 };
  assert.ok(close(simulate(circuit).parts.LDR1.sensor.resistance, ldrResistance(GL5528, programValue(program, 0))));
  const e = engineOf(circuit);
  assert.deepEqual(e.stimuli(), [8]);
  const pace = paceOf(e.timeConstants(), e.periods(), false, e.stimuli());
  assert.deepEqual(pace, { h: 0.02, perSecond: 1, window: 16, periodic: true }, 'real time, in steps of 20 ms');
  let lit = 0;
  for (let k = 1; k <= 400; k++) {
    assert.ok(e.advance(0.02));
    if (k % 50 === 0) {
      const light = programValue(program, e.time);
      assert.ok(close(e.environment().light, light, 1e-9), `light at ${e.time}`);
      assert.ok(close(e.program().devices.find((d) => d.id === 'LDR1').params.resistance, ldrResistance(GL5528, light), 1e-9));
    }
    if (e.read().parts.D1.current > 1e-3) lit++;
  }
  assert.ok(lit > 20 && lit < 200, `lit in the dark part of each cycle (${lit} of 400 steps)`);
  // Paused by a set, then resumed from the beginning of the cycle.
  assert.ok(e.set('environment', 'light', 700));
  assert.ok(e.controls().find((c) => c.id === 'environment' && c.field === 'light').paused);
  e.advance(0.5);
  assert.equal(e.environment().light, 700);
  assert.ok(e.resume('environment', 'light'));
  assert.ok(close(e.environment().light, 1002.5));
  e.advance(2);
  assert.ok(close(e.environment().light, 2000, 1e-6), 'a quarter of the cycle after the resume');
  // Restart: from t = 0 again.
  assert.ok(e.start('zero', 0.02));
  assert.ok(close(e.environment().light, 1002.5));
  // The pace of other things wins: a program only rides on it.
  assert.deepEqual(paceOf([0.01], [], false, [8]).perSecond, 0.005);
  assert.equal(paceOf([], [], false, [0.05]).h, 1e-3);
});

async function loadPage(html, search = '', size = { width: 800, height: 500 }) {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    return null;
  }
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: `https://page.test/environment.html${search}` });
  const { window } = dom;
  const rect = () => ({ left: 0, top: 0, right: size.width, bottom: size.height, ...size });
  window.document.querySelector('main').getBoundingClientRect = rect;
  for (const svg of window.document.querySelectorAll('svg')) svg.getBoundingClientRect = rect;
  if (!search) window.testClock = installClock(window);
  window.eval(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  return window;
}
const tap = (window, id) => window.document.querySelector(`svg:not([hidden]) .parts > [data-part="${id}"]`).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const slide = (window, input, k) => {
  input.value = String(k);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
};

test('page: the Environment panel, its indicators, and a sensor\'s card', async (t) => {
  const window = await loadPage(renderPage(example('environment.json'), { lang: 'es' }).html);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const live = window.protoboardLive;
  const panel = doc.querySelector('.side .environment');
  assert.ok(panel, 'its own section');
  assert.equal(panel.querySelector('.head').textContent, 'Ambiente');
  assert.equal(doc.querySelector('.side .controls'), null, 'no other control asked for');
  const rows = [...panel.querySelectorAll('.env-row')];
  assert.deepEqual(rows.map((r) => r.querySelector('.control .name').textContent), ['Luz', 'Temperatura']);
  // The indicators: a sun and a thermometer, no CSS filter, the value under each.
  assert.ok(rows[0].querySelector('svg.gauge-light .sun-rays'));
  assert.ok(rows[1].querySelector('svg.gauge-temperature .mercury'));
  const words = () => [...panel.querySelectorAll('svg.gauge > text')].map((x) => x.textContent);
  assert.deepEqual(words(), ['300 lx', '25 °C']);
  const sun = rows[0].querySelector('svg.gauge');
  const rays = sun.querySelector('.sun-rays');
  const bright = Number(rays.getAttribute('stroke-opacity'));
  // Down to 0.1 lx with the slider: the LED lights, the sun goes dark, the same node.
  slide(window, rows[0].querySelector('input'), 0);
  assert.equal(live.engine.environment().light, 0.1);
  assert.ok(live.reading.parts.D1.current > 5e-3);
  assert.deepEqual(words(), ['0,1 lx', '25 °C']);
  assert.ok(Number(rays.getAttribute('stroke-opacity')) < bright);
  assert.equal(rows[0].querySelector('svg.gauge'), sun, 'updated in place');
  assert.doesNotMatch([...doc.querySelectorAll('style')].map((x) => x.textContent).join(''), /filter\s*:/);
  // The LDR's card: the line and the indicator of light; its own slider detaches it.
  tap(window, 'LDR1');
  const info = doc.querySelector('.info');
  assert.match(info.querySelector('.sim').textContent, /Sigue el ambiente · luz 0,1 lx/);
  assert.ok(info.querySelector('.env-sense svg.gauge-light'));
  assert.equal(info.querySelector('.env-sense button'), null);
  slide(window, info.querySelector('.adjust .control input'), 1000);
  live.tick(300);
  assert.match(info.querySelector('.sim').textContent, /Valor propio \(no sigue el ambiente: luz\)/);
  assert.ok(live.reading.parts.D1.current < 1e-6, 'its own 10 klx');
  const follow = info.querySelector('.env-sense button');
  assert.equal(follow.textContent, 'Seguir el ambiente');
  follow.click();
  assert.ok(live.reading.parts.D1.current > 5e-3, 'the environment\'s 0.1 lx again');
  assert.equal(info.querySelector('.env-sense button'), null);
  // A thermometer that rises with the panel's temperature.
  const column = rows[1].querySelector('rect.mercury');
  const before = Number(column.getAttribute('height'));
  slide(window, rows[1].querySelector('input'), 1000);
  assert.equal(live.engine.environment().temperature, 100);
  assert.ok(Number(column.getAttribute('height')) > before);
  assert.ok(Math.abs(live.reading.parts.U2.vout - 1) < 1e-3);
});

test('page: a program moves the indicator and the row; Pause and Resume', async (t) => {
  const window = await loadPage(renderPage(example('environment-cycle.json'), { lang: 'en' }).html);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const live = window.protoboardLive;
  const row = doc.querySelector('.side .environment .env-row');
  const said = () => row.querySelector('svg.gauge > text').textContent;
  assert.equal(said(), '1 klx');
  for (let k = 0; k < 21; k++) live.tick(100);
  assert.ok(live.time > 1.9, `time runs (${live.time})`);
  assert.equal(said(), '2 klx', 'a quarter of the cycle');
  assert.equal(row.querySelector('output').textContent, '2 klx');
  const pause = row.querySelector('.env-pause');
  assert.equal(pause.textContent, 'Pause');
  pause.click();
  assert.equal(pause.textContent, 'Resume');
  const held = live.engine.environment().light;
  for (let k = 0; k < 10; k++) live.tick(100);
  assert.equal(live.engine.environment().light, held);
  pause.click();
  assert.equal(pause.textContent, 'Pause');
  assert.ok(close(live.engine.environment().light, 1002.5));
  // page.environment false: no panel, though the sensors still follow it.
  const off = { ...example('environment-cycle.json'), page: { environment: false } };
  const w2 = await loadPage(renderPage(off).html);
  assert.equal(w2.document.querySelector('.side .environment'), null);
  // page.environment by default: the whole environment, when a part follows it.
  const all = { ...example('environment-cycle.json'), page: {} };
  const w3 = await loadPage(renderPage(all).html);
  assert.equal(w3.document.querySelectorAll('.side .environment .env-row').length, 2);
  // A circuit without one has no section.
  const w4 = await loadPage(renderPage({ ...example('led-resistor.json') }).html);
  assert.equal(w4.document.querySelector('.side .environment'), null);
});

test('tour: set names a field of the environment, gauge shows its indicator; check says what is wrong', () => {
  const circuit = example('environment.json');
  assert.deepEqual(tourIssues(circuit), []);
  const { tour } = loadTour(circuit, 'es');
  const set = tour.steps.find((s) => s.do === 'set');
  assert.deepEqual([set.part, set.field, set.environment, set.move], ['environment', 'light', 'light', 'travel']);
  const withTour = (steps) => ({ ...circuit, page: { tour: { steps } } });
  const found = (steps) => codes(tourIssues(withTour(steps)));
  assert.deepEqual(found([{ at: 0, do: 'set', environment: 'sound', value: 3 }]), ['TOUR_UNKNOWN_ENVIRONMENT'], 'a field the circuit does not have');
  assert.deepEqual(found([{ at: 0, do: 'set', environment: 'light', part: 'LDR1', value: 3 }]), ['TOUR_FIELD']);
  assert.deepEqual(found([{ at: 0, do: 'set', value: 3 }]), ['TOUR_FIELD']);
  assert.deepEqual(found([{ at: 0, do: 'set', part: 'LDR1', value: 3 }]), ['TOUR_FIELD']);
  assert.deepEqual(found([{ at: 0, do: 'gauge', environment: 'temperature', on: true, corner: 'bl' }, { at: 10, do: 'gauge', environment: 'temperature', on: false }]), []);
  assert.deepEqual(found([{ at: 0, do: 'gauge', environment: 'temperature' }]), ['TOUR_FIELD']);
  assert.deepEqual(found([{ at: 0, do: 'gauge', environment: 'temperature', on: true, corner: 'middle' }]), ['TOUR_FIELD']);
  assert.deepEqual(found([{ at: 0, do: 'gauge', environment: 'rain', on: true }]), ['TOUR_UNKNOWN_ENVIRONMENT']);
  const issue = tourIssues(withTour([{ at: 0, do: 'set', environment: 'sound', value: 3 }]))[0];
  assert.deepEqual(issue.params, { step: 1, field: 'sound', options: 'light, temperature' });
  assert.deepEqual(found([{ at: 0, do: 'value', part: 'U2', field: 'vout' }]), [], 'value reads an output voltage');
});

test('tour: a recording shows the gauge in its corner, and a set without one shows it while it moves', async (t) => {
  const circuit = example('environment.json');
  const steps = [
    { at: 0, do: 'set', environment: 'light', value: 5, move: 'travel' },
    { at: 1800, do: 'gauge', environment: 'temperature', on: true, corner: 'bl' },
    { at: 2000, do: 'set', environment: 'temperature', value: 60, move: 'travel' },
    { at: 3700, do: 'gauge', environment: 'temperature', on: false },
  ];
  const window = await loadPage(renderPage({ ...circuit, page: { tour: { steps } } }, { lang: 'en' }).html, '?director=1', { width: 1080, height: 1920 });
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const live = window.protoboardLive;
  live.tour.play();
  const box = () => doc.querySelector('.gauge-inset');
  const at = (ms) => {
    while (live.director.time < ms - 1e-6) live.tick(1000 / 30);
  };
  at(100);
  assert.equal(box()?.dataset.corner, 'tr', 'the set put it up');
  assert.match(box().textContent, /Light/);
  at(700);
  assert.ok(live.engine.environment().light < 300 && live.engine.environment().light > 5, 'on its way (log)');
  at(1600);
  assert.equal(live.engine.environment().light, 5);
  assert.ok(live.reading.parts.D1.current > 5e-3);
  at(1700);
  assert.equal(box(), null, 'gone once the move is over');
  at(1900);
  assert.equal(box().dataset.corner, 'bl');
  assert.match(box().querySelector('svg > text').textContent, /25 °C/);
  at(3600);
  assert.match(box().querySelector('svg > text').textContent, /60 °C/);
  assert.equal(box().dataset.corner, 'bl', 'a set does not replace the gauge up');
  at(3800);
  assert.equal(box(), null);
  assert.deepEqual(JSON.parse(JSON.stringify(live.tour.events.filter((e) => e.kind === 'gauge').map((e) => e.on))), [true, false]);
});
