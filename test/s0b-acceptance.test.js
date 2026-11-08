// Acceptance tests for S0b (ranges for the environment indicator and slider), written from the
// brief's acceptance items D1-D8 alone: a field's `range` in the circuit (and its ENV_BAD_RANGE
// check), page.controls `min`/`max` for an environment field, the timeline's `gauge` min/max
// (TOUR_GAUGE_RANGE), the gauge's position (`data-pos` 0...1 on its root), engine.set outside the
// range, the revised example tours and the compact catalog budget.
//
// Where the brief quotes numbers that differ from the registry (the distance limit), the tests
// read the registry's own `limit` instead of hard-coding the brief's.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkCircuit } from '../src/index.js';
import { compile, createEngine } from '../src/sim/index.js';
import { tourIssues, loadTour } from '../src/tour.js';
import { renderPage } from '../src/page.js';
import { RECIPES, expandRecipe } from '../src/recipes/index.js';
import { autoLayout } from '../src/layout.js';
import { compactCatalog, formatCompactCatalog } from '../src/node/catalog.js';
import { installClock } from './clock.js';

const loadEnv = () => import('../src/sim/environment.js');
const examples = fileURLToPath(new URL('../examples/', import.meta.url));
const codes = (issues) => issues.map((i) => i.code);
const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} vs ${expected} (± ${tol})`);

// 5 V, a photoresistor and a resistor to ground; the environment is whatever the test declares.
const circuit = (environment, page) => ({
  supplies: [{ id: 'V1', voltage: 5 }],
  ...(environment && { environment }),
  ...(page && { page }),
  parts: [
    { id: 'W1', type: 'wire', color: 'red', pins: ['T+10', 'a10'] },
    { id: 'LDR1', type: 'ldr', part: 'GL5528', pins: ['e10', 'e11'] },
    { id: 'R1', type: 'resistor', value: '10k', pins: ['a11', 'T-12'] },
  ],
});
const engineOf = (c) => {
  const e = createEngine(compile(c).program);
  assert.ok(e.start('dc'));
  return e;
};
const envCodes = (environment) => codes(checkCircuit(circuit(environment)).issues).filter((c) => c.startsWith('ENV_'));
const pageCodes = (environment, controls) => codes(checkCircuit(circuit(environment, { results: true, controls })).issues).filter((c) => c.startsWith('PAGE_'));
const withTour = (steps, environment = { distance: 30, light: 300, rain: 0 }) => circuit(environment, { tour: { steps } });
const tourCodes = (steps, environment) => codes(tourIssues(withTour(steps, environment)));

// ---------------------------------------------------------------- D1, environmentControls

test('D1: a range in the circuit gives the control min 2, max 40 and keeps the registry\'s limit', async () => {
  const { createEnvironment, environmentControls, FIELDS } = await loadEnv();
  const ranged = environmentControls(createEnvironment({ distance: { value: 30, range: [2, 40] } })).find((c) => c.field === 'distance');
  assert.ok(ranged, 'a control for distance');
  assert.deepEqual([ranged.min, ranged.max], [2, 40]);
  assert.deepEqual(ranged.limit, FIELDS.distance.limit, 'the limit stays the registry\'s');
  assert.equal(ranged.value, 30);
});

test('D1: without a range the control is the registry\'s 2 / 400', async () => {
  const { createEnvironment, environmentControls } = await loadEnv();
  for (const spec of [{ distance: 30 }, { distance: { value: 30 } }]) {
    const plain = environmentControls(createEnvironment(spec)).find((c) => c.field === 'distance');
    assert.deepEqual([plain.min, plain.max], [2, 400], JSON.stringify(spec));
  }
});

// ---------------------------------------------------------------- D2, ENV_BAD_RANGE

test('D2: a valid range raises no ENV_ issue', async () => {
  const { FIELDS } = await loadEnv();
  assert.deepEqual(envCodes({ distance: { value: 30, range: [2, 40] } }), []);
  assert.deepEqual(envCodes({ light: { value: 100, range: [1, 1000] } }), [], 'a log range above 0');
  assert.deepEqual(envCodes({ temperature: { value: 25, range: [20, 70] } }), []);
  const [lo, hi] = FIELDS.distance.limit;
  assert.deepEqual(envCodes({ distance: { value: 30, range: [lo, hi] } }), [], 'the whole limit is allowed');
});

test('D2: a range outside the field\'s limit is ENV_BAD_RANGE', async () => {
  const { FIELDS } = await loadEnv();
  const [lo, hi] = FIELDS.distance.limit;
  assert.deepEqual(envCodes({ distance: { value: 30, range: [lo, hi + 1] } }), ['ENV_BAD_RANGE'], 'above the limit');
  assert.deepEqual(envCodes({ distance: { value: 30, range: [lo - 1, 40] } }), ['ENV_BAD_RANGE'], 'below the limit');
  assert.deepEqual(envCodes({ temperature: { value: 25, range: [-56, 70] } }), ['ENV_BAD_RANGE']);
  assert.deepEqual(envCodes({ temperature: { value: 25, range: [20, 151] } }), ['ENV_BAD_RANGE']);
});

test('D2: the brief\'s literal [0, 500] is ENV_BAD_RANGE whenever it lies outside the registry\'s distance limit', async (t) => {
  const { FIELDS } = await loadEnv();
  const [lo, hi] = FIELDS.distance.limit;
  if (!(0 < lo || 500 > hi)) return t.skip(`[0, 500] lies inside the registry's limit [${lo}, ${hi}]: the brief's number does not match the registry (reported as a gap)`);
  assert.deepEqual(envCodes({ distance: { value: 30, range: [0, 500] } }), ['ENV_BAD_RANGE']);
});

test('D2: an inverted range ([40, 2]) is ENV_BAD_RANGE', () => {
  assert.deepEqual(envCodes({ distance: { value: 30, range: [40, 2] } }), ['ENV_BAD_RANGE']);
});

test('D2: a range on a switch field (rain) is ENV_BAD_RANGE', () => {
  assert.deepEqual(envCodes({ rain: { value: 1, range: [0, 1] } }), ['ENV_BAD_RANGE']);
});

test('D2: a log field with min 0 (light: [0, 100]) is ENV_BAD_RANGE', () => {
  assert.deepEqual(envCodes({ light: { value: 50, range: [0, 100] } }), ['ENV_BAD_RANGE']);
});

test('D2: ENV_BAD_RANGE is an error', () => {
  const issue = checkCircuit(circuit({ distance: { value: 30, range: [40, 2] } })).issues.find((i) => i.code === 'ENV_BAD_RANGE');
  assert.ok(issue, 'reported');
  assert.equal(issue.severity, 'error');
});

// ---------------------------------------------------------------- the page (jsdom)

const FRAME = 1000 / 30;
async function loadPage(html, size = { width: 800, height: 500 }) {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    return null;
  }
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://page.test/s0b.html' });
  const { window } = dom;
  const rect = () => ({ left: 0, top: 0, right: size.width, bottom: size.height, ...size });
  window.document.querySelector('main').getBoundingClientRect = rect;
  for (const svg of window.document.querySelectorAll('svg')) svg.getBoundingClientRect = rect;
  window.testClock = installClock(window);
  window.eval(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  return window;
}
const pageOf = (environment, controls) => loadPage(renderPage(circuit(environment, { results: true, controls }), { lang: 'es' }).html);
const rowOf = (doc, field) => doc.querySelector(`.control[data-id="environment"][data-field="${field}"]`);
const slide = (window, input, k) => {
  input.value = String(k);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
};
// The gauge root carries data-pos 0...1. Arbitration (orchestrator): a page shows the same field's
// indicator more than once on purpose (the Environment panel and the sensor's card, per S0), so the
// check takes every gauge of the page and requires all of them to agree on the position.
const gaugeRoots = (doc) => [...doc.querySelectorAll('[data-gauge], [class*="gauge"]')].filter((g) => g.hasAttribute('data-pos'));
const posOf = (doc) => {
  const roots = gaugeRoots(doc);
  assert.ok(roots.length >= 1, 'at least one gauge root carrying data-pos');
  const positions = roots.map((r) => Number(r.getAttribute('data-pos')));
  for (const pos of positions) assert.ok(Math.abs(pos - positions[0]) < 1e-9, `every gauge of the field agrees: ${positions}`);
  return positions[0];
};

// ---------------------------------------------------------------- D3, page.controls

test('D3: page.controls { environment, min, max } sets the panel slider\'s range', async (t) => {
  const window = await pageOf({ distance: 30 }, [{ environment: 'distance', min: 2, max: 40 }]);
  if (!window) return t.skip('jsdom not installed');
  const input = rowOf(window.document, 'distance').querySelector('input[type="range"]');
  assert.ok(input, 'a slider');
  slide(window, input, input.min);
  assert.equal(window.protoboardLive.engine.environment().distance, 2, 'the slider\'s start is 2');
  slide(window, input, input.max);
  assert.equal(window.protoboardLive.engine.environment().distance, 40, 'the slider\'s end is 40');
});

test('D3: without a page range the slider follows the circuit\'s range', async (t) => {
  const window = await pageOf({ distance: { value: 30, range: [5, 100] } }, [{ environment: 'distance' }]);
  if (!window) return t.skip('jsdom not installed');
  const input = rowOf(window.document, 'distance').querySelector('input[type="range"]');
  slide(window, input, input.min);
  assert.equal(window.protoboardLive.engine.environment().distance, 5);
  slide(window, input, input.max);
  assert.equal(window.protoboardLive.engine.environment().distance, 100);
});

test('D3: page.controls overrides the circuit\'s range for that panel entry', async (t) => {
  const window = await pageOf({ distance: { value: 30, range: [5, 100] } }, [{ environment: 'distance', min: 2, max: 40 }]);
  if (!window) return t.skip('jsdom not installed');
  const input = rowOf(window.document, 'distance').querySelector('input[type="range"]');
  slide(window, input, input.min);
  assert.equal(window.protoboardLive.engine.environment().distance, 2);
  slide(window, input, input.max);
  assert.equal(window.protoboardLive.engine.environment().distance, 40);
});

test('D3: a valid page.controls range raises no PAGE_ issue', () => {
  assert.deepEqual(pageCodes({ distance: 30 }, [{ environment: 'distance', min: 2, max: 40 }]), []);
});

test('D3: an invalid page.controls range is PAGE_CONTROL_RANGE', async () => {
  const { FIELDS } = await loadEnv();
  const [lo, hi] = FIELDS.distance.limit;
  assert.deepEqual(pageCodes({ distance: 30 }, [{ environment: 'distance', min: 40, max: 2 }]), ['PAGE_CONTROL_RANGE'], 'inverted');
  assert.deepEqual(pageCodes({ distance: 30 }, [{ environment: 'distance', min: lo, max: hi + 1 }]), ['PAGE_CONTROL_RANGE'], 'above the limit');
  assert.deepEqual(pageCodes({ distance: 30 }, [{ environment: 'distance', min: lo - 1, max: 40 }]), ['PAGE_CONTROL_RANGE'], 'below the limit');
  assert.deepEqual(pageCodes({ light: 300 }, [{ environment: 'light', min: 0, max: 100 }]), ['PAGE_CONTROL_RANGE'], 'a log range from 0');
});

// ---------------------------------------------------------------- D4, tour validation

test('D4: a gauge with min 2, max 40 on distance is accepted', () => {
  assert.deepEqual(tourCodes([{ at: 0, do: 'gauge', environment: 'distance', on: true, min: 2, max: 40 }]), []);
  assert.ok(loadTour(withTour([{ at: 0, do: 'gauge', environment: 'distance', on: true, min: 2, max: 40 }])).tour, 'it plays');
});

test('D4: a gauge range outside the limit or with max < min is TOUR_GAUGE_RANGE', async () => {
  const { FIELDS } = await loadEnv();
  const [lo, hi] = FIELDS.distance.limit;
  const gauge = (min, max) => [{ at: 0, do: 'gauge', environment: 'distance', on: true, min, max }];
  assert.deepEqual(tourCodes(gauge(lo, hi + 1)), ['TOUR_GAUGE_RANGE'], 'above the limit');
  assert.deepEqual(tourCodes(gauge(lo - 1, 40)), ['TOUR_GAUGE_RANGE'], 'below the limit');
  assert.deepEqual(tourCodes(gauge(40, 2)), ['TOUR_GAUGE_RANGE'], 'max < min');
  assert.deepEqual(tourCodes([{ at: 0, do: 'gauge', environment: 'light', on: true, min: 0, max: 100 }]), ['TOUR_GAUGE_RANGE'], 'a log range from 0');
});

test('D4: the brief\'s literal 0…500 is TOUR_GAUGE_RANGE whenever it lies outside the registry\'s distance limit', async (t) => {
  const { FIELDS } = await loadEnv();
  const [lo, hi] = FIELDS.distance.limit;
  if (!(0 < lo || 500 > hi)) return t.skip(`0…500 lies inside the registry's limit [${lo}, ${hi}]: the brief's number does not match the registry (reported as a gap)`);
  assert.deepEqual(tourCodes([{ at: 0, do: 'gauge', environment: 'distance', on: true, min: 0, max: 500 }]), ['TOUR_GAUGE_RANGE']);
});

test('D4: a gauge range on a switch field is TOUR_GAUGE_RANGE', () => {
  assert.deepEqual(tourCodes([{ at: 0, do: 'gauge', environment: 'rain', on: true, min: 0, max: 1 }]), ['TOUR_GAUGE_RANGE']);
  assert.deepEqual(tourCodes([{ at: 0, do: 'gauge', environment: 'rain', on: true }]), [], 'the same gauge without a range is fine');
});

// ---------------------------------------------------------------- D5, gauge geometry

test('D5: with range 2…40 the gauge is at ~0.74 for 30 cm, 0 for 2 cm and pinned at 1 for 100 cm', async (t) => {
  const window = await pageOf({ distance: { value: 30, range: [2, 40] } }, [{ environment: 'distance' }]);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const live = window.protoboardLive;
  near(posOf(doc), 28 / 38, 0.01, '30 cm on 2…40');
  live.set('environment', 'distance', 2);
  near(posOf(doc), 0, 1e-9, '2 cm');
  live.set('environment', 'distance', 100);
  near(posOf(doc), 1, 1e-9, '100 cm is pinned at the end');
  live.set('environment', 'distance', 40);
  near(posOf(doc), 1, 1e-9, '40 cm');
});

test('D5: the same range given by page.controls moves the gauge alike', async (t) => {
  const window = await pageOf({ distance: 30 }, [{ environment: 'distance', min: 2, max: 40 }]);
  if (!window) return t.skip('jsdom not installed');
  near(posOf(window.document), 28 / 38, 0.01, '30 cm on 2…40');
});

test('D5: a value below the range pins the gauge at 0', async (t) => {
  const window = await pageOf({ temperature: { value: 25, range: [20, 70] } }, [{ environment: 'temperature' }]);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  near(posOf(doc), 5 / 50, 0.01, '25 °C on 20…70');
  window.protoboardLive.set('environment', 'temperature', 0);
  near(posOf(doc), 0, 1e-9, '0 °C is below the range');
});

test('D5: light with range 1…1000 maps logarithmically: 100 lx is at ~0.667', async (t) => {
  const window = await pageOf({ light: { value: 100, range: [1, 1000] } }, [{ environment: 'light' }]);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  near(posOf(doc), 2 / 3, 0.01, '100 lx on 1…1000 (log)');
  window.protoboardLive.set('environment', 'light', 1);
  near(posOf(doc), 0, 1e-9, '1 lx');
  window.protoboardLive.set('environment', 'light', 1000);
  near(posOf(doc), 1, 1e-9, '1000 lx');
});

// ---------------------------------------------------------------- D6, engine.set outside the range

test('D6: engine.set on a value outside the chosen range is accepted and read back', async () => {
  const e = engineOf(circuit({ distance: { value: 30, range: [2, 40] } }));
  assert.ok(e.set('environment', 'distance', 100));
  assert.equal(e.environment().distance, 100);
});

// ---------------------------------------------------------------- D7, the tours

const TOURS = ['obstacle-buzzer', 'soil-led', 'ldr-comparator', 'environment', 'lm35-comparator'];
const laid = (name) => {
  const { spec, problems } = expandRecipe(name);
  assert.deepEqual(problems, [], `${name}: ${JSON.stringify(problems)}`);
  const r = autoLayout(spec);
  assert.equal(r.status, 'done', name);
  return r.circuit;
};

for (const name of TOURS) {
  test(`D7: tour ${name} validates against its circuit and plays`, () => {
    const file = `${examples}tours/${name}.json`;
    assert.ok(existsSync(file), file);
    const tour = JSON.parse(readFileSync(file, 'utf8'));
    const base = tour.circuit in RECIPES ? laid(tour.circuit) : JSON.parse(readFileSync(`${examples}${tour.circuit}.json`, 'utf8'));
    const full = { ...base, page: { ...base.page, tour } };
    const bad = tourIssues(full).filter((i) => i.severity === 'error' || i.severity === 'warning');
    assert.deepEqual(bad.map((i) => `${i.code} ${i.severity}`), []);
    assert.ok(loadTour(full, 'es').tour, 'it plays');
  });
}

test('D7: obstacle-buzzer has a gauge step with min 2 and max 40', () => {
  const { steps } = JSON.parse(readFileSync(`${examples}tours/obstacle-buzzer.json`, 'utf8'));
  assert.ok(steps.some((s) => s.do === 'gauge' && s.environment === 'distance' && s.min === 2 && s.max === 40), 'gauge distance min 2 max 40');
});

// ---------------------------------------------------------------- D8, catalog budget

test('D8: the compact catalog stays within 4600 characters', () => {
  const text = formatCompactCatalog(compactCatalog('en'), 'en');
  assert.ok(text.length <= 4600, `compact catalog is ${text.length} characters`);
});
