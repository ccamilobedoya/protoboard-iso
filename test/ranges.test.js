// Ranges for the environment's slider and indicator (sensors, S0b; docs/en/environment.md): a field
// of the circuit may declare `range`, page.controls and a timeline's gauge may choose another, and
// the indicator draws its dial between them (data-pos on its root, in jsdom).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FIELDS, createEnvironment, environmentControls, rangeProblem, cleanEnvironment } from '../src/sim/environment.js';
import { compile, createEngine } from '../src/sim/index.js';
import { checkCircuit } from '../src/index.js';
import { renderPage } from '../src/page.js';
import { loadTour, tourIssues } from '../src/tour.js';
import { CIRCUIT_FOLDER } from '../src/beside.js';
import { expandRecipe } from '../src/recipes/index.js';
import { autoLayout } from '../src/layout.js';
import { installClock } from './clock.js';

const examples = fileURLToPath(new URL('../examples/', import.meta.url));
const codes = (issues) => issues.map((i) => i.code);
const near = (a, b, eps = 0.001) => Math.abs(a - b) <= eps;

// 5 V, an LDR under 10 kΩ; the environment, the page and the tour are given.
const circuit = (environment, page = { results: true }) => ({
  supplies: [{ id: 'V1', voltage: 5 }],
  environment,
  page,
  parts: [
    { id: 'R1', type: 'resistor', value: '10k', pins: ['T+3', 'a3'] },
    { id: 'L1', type: 'ldr', pins: ['b3', 'T-6'] },
  ],
});
const RANGED = { distance: { value: 30, range: [2, 40] }, light: { value: 100, range: [1, 1000] }, temperature: 25 };
const envIssues = (environment) => codes(checkCircuit(circuit(environment)).issues).filter((c) => c.startsWith('ENV_'));
const pageIssues = (controls) => codes(checkCircuit(circuit(RANGED, { results: true, controls })).issues).filter((c) => c.startsWith('PAGE_') || c.startsWith('ENV_'));
const tourOf = (steps) => circuit(RANGED, { results: true, tour: { steps } });

test('ranges: a field\'s range gives the control its min and max, and leaves the limit', () => {
  const controls = environmentControls(createEnvironment(RANGED));
  const get = (field) => controls.find((c) => c.field === field);
  assert.deepEqual([get('distance').min, get('distance').max, get('distance').limit, get('distance').value], [2, 40, [0, 1000], 30]);
  assert.deepEqual([get('light').min, get('light').max, get('light').scale], [1, 1000, 'log']);
  assert.deepEqual([get('temperature').min, get('temperature').max], [FIELDS.temperature.min, FIELDS.temperature.max], 'no range: the registry\'s');
  const plain = environmentControls(createEnvironment({ distance: 30 })).find((c) => c.field === 'distance');
  assert.deepEqual([plain.min, plain.max], [2, 400]);
  // A range with a program, and a field the circuit did not name (a sensor follows it).
  const programmed = environmentControls(createEnvironment({ distance: { range: [2, 40], program: { kind: 'ramp', from: 30, to: 5, seconds: 4 } } })).find((c) => c.field === 'distance');
  assert.deepEqual([programmed.min, programmed.max, programmed.programmed], [2, 40, true]);
  assert.deepEqual(environmentControls(createEnvironment({}, ['distance']))[0].max, 400);
});

test('ranges: rangeProblem and check say what cannot be a range', () => {
  assert.equal(rangeProblem('distance', [2, 40]), null);
  assert.equal(rangeProblem('distance', [0, 500]), null, 'inside the limit 0…1000');
  assert.equal(rangeProblem('distance', [0, 1001]), 'limit');
  assert.equal(rangeProblem('distance', [40, 2]), 'order');
  assert.equal(rangeProblem('distance', [5, 5]), 'order');
  assert.equal(rangeProblem('distance', [2]), 'order');
  assert.equal(rangeProblem('distance', ['2', 40]), 'order');
  assert.equal(rangeProblem('rain', [0, 1]), 'switch');
  assert.equal(rangeProblem('light', [0, 100]), 'log');
  assert.equal(rangeProblem('light', [0.5, 100]), null);
  assert.deepEqual(envIssues(RANGED), []);
  assert.deepEqual(envIssues({ distance: { range: [0, 1001] } }), ['ENV_BAD_RANGE']);
  assert.deepEqual(envIssues({ distance: { range: [40, 2] } }), ['ENV_BAD_RANGE']);
  assert.deepEqual(envIssues({ rain: { range: [0, 1] } }), ['ENV_BAD_RANGE']);
  assert.deepEqual(envIssues({ light: { range: [0, 100] } }), ['ENV_BAD_RANGE']);
  assert.deepEqual(envIssues({ distance: { range: 'wide' } }), ['ENV_BAD_RANGE']);
  // A range the simulation cannot use is left out: the registry's applies.
  assert.deepEqual(cleanEnvironment({ distance: { value: 30, range: [40, 2] } }).distance, { value: 30 });
  assert.deepEqual(cleanEnvironment({ distance: { value: 30, range: [2, 40] } }).distance, { value: 30, range: [2, 40] });
});

test('ranges: page.controls overrides the circuit\'s range, with PAGE_CONTROL_RANGE for a bad one', () => {
  assert.deepEqual(pageIssues([{ environment: 'distance', min: 2, max: 40 }]), []);
  assert.deepEqual(pageIssues([{ environment: 'distance', min: 0, max: 5000 }]), ['PAGE_CONTROL_RANGE']);
  assert.deepEqual(pageIssues([{ environment: 'distance', min: 40, max: 2 }]), ['PAGE_CONTROL_RANGE']);
  assert.deepEqual(pageIssues([{ environment: 'light', min: 0, max: 100 }]), ['PAGE_CONTROL_RANGE']);
  assert.deepEqual(pageIssues([{ environment: 'distance', max: 20 }]), [], 'the circuit\'s min stays');
  assert.deepEqual(pageIssues([{ environment: 'distance', min: 50 }]), ['PAGE_CONTROL_RANGE'], 'min above the circuit\'s max');
});

test('ranges: a timeline gauge takes min and max, TOUR_GAUGE_RANGE when they cannot be a range', () => {
  const found = (...steps) => codes(tourIssues(tourOf(steps)));
  assert.deepEqual(found({ at: 0, do: 'gauge', environment: 'distance', on: true, min: 2, max: 40 }), []);
  assert.deepEqual(found({ at: 0, do: 'gauge', environment: 'distance', on: true, min: 2 }), [], 'one end: the other is the circuit\'s');
  assert.deepEqual(found({ at: 0, do: 'gauge', environment: 'distance', on: true, min: 0, max: 5000 }), ['TOUR_GAUGE_RANGE']);
  assert.deepEqual(found({ at: 0, do: 'gauge', environment: 'distance', on: true, min: 40, max: 2 }), ['TOUR_GAUGE_RANGE']);
  assert.deepEqual(found({ at: 0, do: 'gauge', environment: 'distance', on: true, min: 50 }), ['TOUR_GAUGE_RANGE'], 'min above the circuit\'s max');
  assert.deepEqual(found({ at: 0, do: 'gauge', environment: 'light', on: true, min: 0, max: 100 }), ['TOUR_GAUGE_RANGE']);
  assert.deepEqual(found({ at: 0, do: 'gauge', environment: 'light', on: true, min: 1, max: 1000 }), []);
  assert.deepEqual(found({ at: 0, do: 'gauge', environment: 'distance', on: true, min: 'a' }), ['TOUR_FIELD']);
  const switched = { ...tourOf([{ at: 0, do: 'gauge', environment: 'rain', on: true, min: 0, max: 1 }]), environment: { rain: false } };
  assert.deepEqual(codes(tourIssues(switched)), ['TOUR_GAUGE_RANGE']);
  // The page gets the range as the step says it.
  const step = loadTour(tourOf([{ at: 0, do: 'gauge', environment: 'distance', on: true, min: 2, max: 40 }])).tour.steps[0];
  assert.deepEqual([step.min, step.max], [2, 40]);
});

test('ranges: engine.set outside the range is allowed (the range is how it shows), within the limit', () => {
  const engine = createEngine(compile(circuit(RANGED)).program);
  assert.ok(engine.start('dc'));
  assert.ok(engine.set('environment', 'distance', 100));
  assert.equal(engine.environment().distance, 100);
  assert.equal(engine.controls().find((c) => c.field === 'distance').max, 40, 'the control keeps the range');
  assert.ok(engine.set('environment', 'distance', 5000));
  assert.equal(engine.environment().distance, 1000, 'clamped to the limit');
});

test('ranges: the revised tours validate and their gauge steps carry the range', () => {
  const tours = { 'obstacle-buzzer': ['distance', 2, 40], 'ldr-comparator': ['light', 1, 1000], 'lm35-comparator': ['temperature', 20, 70], environment: ['light', 1, 1000] };
  for (const [name, [field, min, max]] of Object.entries(tours)) {
    const file = JSON.parse(readFileSync(`${examples}tours/${name}.json`, 'utf8'));
    const gauge = file.steps.find((s) => s.do === 'gauge' && s.environment === field);
    assert.deepEqual([gauge.min, gauge.max], [min, max], name);
    const base = name === 'environment' ? JSON.parse(readFileSync(`${examples}environment.json`, 'utf8')) : (() => {
      const r = autoLayout(expandRecipe(name).spec);
      assert.equal(r.status, 'done', name);
      return r.circuit;
    })();
    const withTour = { ...base, page: { ...base.page, tour: file } };
    Object.defineProperty(withTour, CIRCUIT_FOLDER, { value: examples });
    assert.deepEqual(tourIssues(withTour), [], name);
    assert.ok(loadTour(withTour, 'es').tour, name);
  }
  // The second gauge of the environment tour: temperature 20…70.
  const env = JSON.parse(readFileSync(`${examples}tours/environment.json`, 'utf8'));
  const temperature = env.steps.find((s) => s.do === 'gauge' && s.environment === 'temperature');
  assert.deepEqual([temperature.min, temperature.max], [20, 70]);
});

// ------------------------------------------------------------------ the indicator (jsdom)

async function loadPage(html, search = '', size = { width: 800, height: 500 }) {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    return null;
  }
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: `https://page.test/ranges.html${search}` });
  const { window } = dom;
  const rect = () => ({ left: 0, top: 0, right: size.width, bottom: size.height, ...size });
  window.document.querySelector('main').getBoundingClientRect = rect;
  for (const svg of window.document.querySelectorAll('svg')) svg.getBoundingClientRect = rect;
  if (!search) window.testClock = installClock(window);
  window.eval(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  return window;
}
const rowOf = (doc, field) => doc.querySelector(`.control[data-id="environment"][data-field="${field}"]`);
const gaugeOf = (doc, field) => doc.querySelector(`svg.gauge-${field}`);
const slide = (window, input, k) => {
  input.value = String(k);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
};
const pos = (doc, field) => Number(gaugeOf(doc, field).getAttribute('data-pos'));

test('ranges: the panel slider spans the range and the dial reads its position in it', async (t) => {
  const controls = [{ environment: 'distance' }, { environment: 'light' }, { environment: 'temperature', min: 0, max: 50 }];
  const window = await loadPage(renderPage(circuit(RANGED, { results: true, controls }), { lang: 'en' }).html);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const live = window.protoboardLive;
  const row = rowOf(doc, 'distance');
  assert.deepEqual([row.dataset.min, row.dataset.max], ['2', '40']);
  assert.deepEqual([rowOf(doc, 'temperature').dataset.min, rowOf(doc, 'temperature').dataset.max], ['0', '50'], 'page.controls wins');
  const g = gaugeOf(doc, 'distance');
  assert.deepEqual([g.getAttribute('data-min'), g.getAttribute('data-max')], ['2', '40']);
  assert.ok(near(pos(doc, 'distance'), (30 - 2) / 38), `30 cm in 2…40: ${pos(doc, 'distance')}`);
  slide(window, row.querySelector('input'), 0);
  assert.equal(live.engine.environment().distance, 2);
  assert.equal(pos(doc, 'distance'), 0);
  slide(window, row.querySelector('input'), 1000);
  assert.equal(live.engine.environment().distance, 40);
  assert.equal(pos(doc, 'distance'), 1);
  // Past the range: pinned at the end, the words still say the value.
  assert.ok(live.engine.set('environment', 'distance', 100));
  live.tick(100);
  assert.equal(pos(doc, 'distance'), 1);
  assert.match(gaugeOf(doc, 'distance').querySelector(':scope > text').textContent, /100 cm/);
  // A log field in its range: 100 lx in 1…1000 is two thirds of the way.
  assert.ok(near(pos(doc, 'light'), 2 / 3), `100 lx in 1…1000: ${pos(doc, 'light')}`);
  slide(window, rowOf(doc, 'light').querySelector('input'), 1000);
  assert.equal(live.engine.environment().light, 1000);
  assert.equal(pos(doc, 'light'), 1);
  slide(window, rowOf(doc, 'temperature').querySelector('input'), 500);
  assert.equal(live.engine.environment().temperature, 25);
  assert.ok(near(pos(doc, 'temperature'), 0.5), `25 °C in 0…50: ${pos(doc, 'temperature')}`);
});

test('ranges: without a range the dial spans the registry\'s', async (t) => {
  const window = await loadPage(renderPage(circuit({ distance: 30 }, { results: true, controls: [{ environment: 'distance' }] }), { lang: 'en' }).html);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  assert.deepEqual([gaugeOf(doc, 'distance').getAttribute('data-min'), gaugeOf(doc, 'distance').getAttribute('data-max')], ['2', '400']);
  assert.ok(near(pos(doc, 'distance'), 28 / 398));
});

test('ranges: a gauge step\'s range shapes the box\'s dial; a set without a gauge uses the field\'s range', async (t) => {
  const steps = [
    { at: 0, do: 'set', environment: 'distance', value: 5, move: 'travel' },
    { at: 1800, do: 'gauge', environment: 'distance', on: true, min: 0, max: 100 },
    { at: 3600, do: 'gauge', environment: 'distance', on: false },
  ];
  const window = await loadPage(renderPage(circuit(RANGED, { results: true, tour: { steps } }), { lang: 'en' }).html, '?director=1', { width: 1080, height: 1920 });
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const live = window.protoboardLive;
  live.tour.play();
  const at = (ms) => {
    while (live.director.time < ms - 1e-6) live.tick(1000 / 30);
  };
  const box = () => doc.querySelector('.gauge-inset svg.gauge');
  at(100);
  assert.deepEqual([box().getAttribute('data-min'), box().getAttribute('data-max')], ['2', '40'], 'the circuit\'s range');
  at(1900);
  assert.deepEqual([box().getAttribute('data-min'), box().getAttribute('data-max')], ['0', '100'], 'the step\'s range');
  assert.ok(near(Number(box().getAttribute('data-pos')), 0.05), `5 cm in 0…100: ${box().getAttribute('data-pos')}`);
});
