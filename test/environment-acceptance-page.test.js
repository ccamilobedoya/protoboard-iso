// Acceptance tests for the environment system in the live page (jsdom), written from the contract
// alone: page.controls with { environment }, the "Ambiente" panel, page.environment, pause and
// resume of programmed fields, the indicator icons (src/page/client/gauge.js, reached only through
// the built page) and a timeline whose `set` names an environment field. The rest is in
// verify-environment.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCircuit } from '../src/index.js';
import { renderPage } from '../src/page.js';
import { installClock } from './clock.js';
import { LANGUAGES } from '../src/i18n/index.js';
import { ldrResistance, LDR_PARTS } from '../src/parts/sensors.js';

const codes = (issues) => issues.map((i) => i.code);
const close = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-12);
const GL5528 = LDR_PARTS.GL5528;
const FRAME = 1000 / 30;
const ES = LANGUAGES.es;

const LIGHT_CYCLE = { kind: 'cycle', shape: 'sine', period: 8, min: 5, max: 2000 };

// 5 V; a photoresistor and a thermistor, each with a resistor to ground.
const circuit = (environment = { light: 300, temperature: 25 }, page = { results: true }) => ({
  supplies: [{ id: 'V1', voltage: 5 }],
  environment,
  page,
  parts: [
    { id: 'W1', type: 'wire', color: 'red', pins: ['T+10', 'a10'] },
    { id: 'LDR1', type: 'ldr', part: 'GL5528', pins: ['e10', 'e11'] },
    { id: 'R1', type: 'resistor', value: '10k', pins: ['a11', 'T-12'] },
    { id: 'W2', type: 'wire', color: 'red', pins: ['T+21', 'a20'] },
    { id: 'RT1', type: 'thermistor', value: '10k', pins: ['e20', 'e21'] },
    { id: 'R2', type: 'resistor', value: '10k', pins: ['a21', 'T-22'] },
  ],
});

async function loadPage(html, size = { width: 800, height: 500 }) {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    return null;
  }
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://page.test/environment.html' });
  const { window } = dom;
  const rect = () => ({ left: 0, top: 0, right: size.width, bottom: size.height, ...size });
  window.document.querySelector('main').getBoundingClientRect = rect;
  for (const svg of window.document.querySelectorAll('svg')) svg.getBoundingClientRect = rect;
  window.testClock = installClock(window);
  window.eval(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  return window;
}
const drag = (window, input, k) => {
  input.value = String(k);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
};
const slide = (window, input, k) => {
  drag(window, input, k);
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
};
const rowOf = (doc, field) => doc.querySelector(`.control[data-id="environment"][data-field="${field}"]`);
const titles = (doc) => [...doc.body.querySelectorAll('*')].filter((e) => !['SCRIPT', 'STYLE'].includes(e.tagName) && e.children.length === 0 && e.textContent.trim() === ES['page.env.title']);
const buttonsOf = (row) => [...row.querySelectorAll('button')].map((b) => b.textContent.trim());
const gauges = (doc) => [...doc.querySelectorAll('[data-gauge], [class*="gauge"]')];
const ticks = (live, ms) => {
  for (let at = 0; at < ms; at += FRAME) live.tick(FRAME);
};

test('check: page.controls may name an environment field', () => {
  const pageCodes = (page, environment) => codes(checkCircuit(circuit(environment, page)).issues).filter((c) => c.startsWith('PAGE_') || c.startsWith('ENV_'));
  assert.deepEqual(pageCodes({ results: true, controls: [{ environment: 'light' }, { environment: 'temperature' }] }), []);
  assert.deepEqual(pageCodes({ results: true, controls: [{ environment: 'light' }, { part: 'R1', field: 'resistance' }] }), []);
});

test('page: page.controls with { environment } puts a section titled by page.env.title ("Ambiente") with that field\'s control', async (t) => {
  const window = await loadPage(renderPage(circuit(undefined, { results: true, controls: [{ environment: 'light' }] }), { lang: 'es' }).html);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  assert.equal(ES['page.env.title'], 'Ambiente');
  assert.ok(titles(doc).length >= 1, 'a section titled "Ambiente"');
  const row = rowOf(doc, 'light');
  assert.ok(row, 'a control row for environment.light');
  assert.ok(row.querySelector('input[type="range"]'), 'a slider');
  assert.ok(row.querySelector('output').textContent.includes('300'), `shows 300 lx: ${row.querySelector('output').textContent}`);
});

test('page: the slider of an environment field moves the sensors that follow it', async (t) => {
  const window = await loadPage(renderPage(circuit(undefined, { results: true, controls: [{ environment: 'light' }] }), { lang: 'es' }).html);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const live = window.protoboardLive;
  const row = rowOf(doc, 'light');
  assert.ok(close(live.reading.parts.LDR1.sensor.resistance, ldrResistance(GL5528, 300)));
  const before = row.querySelector('output').textContent;
  slide(window, row.querySelector('input'), 1000); // the top of the slider: the field's maximum
  const now = live.engine.environment().light;
  assert.equal(now, 10000, 'the slider goes to the top of the field\'s range');
  assert.ok(close(live.reading.parts.LDR1.sensor.resistance, ldrResistance(GL5528, 10000)), 'the photoresistor follows');
  assert.notEqual(row.querySelector('output').textContent, before, 'the value shown changes');
});

test('page: page.environment true shows every declared field, false shows none', async (t) => {
  const on = await loadPage(renderPage(circuit(undefined, { results: true, environment: true }), { lang: 'es' }).html);
  if (!on) return t.skip('jsdom not installed');
  assert.ok(titles(on.document).length >= 1, 'the section');
  for (const field of ['light', 'temperature']) assert.ok(rowOf(on.document, field), `a control for ${field}`);
  const off = await loadPage(renderPage(circuit(undefined, { results: true, environment: false }), { lang: 'es' }).html);
  assert.equal(titles(off.document).length, 0, 'no section');
  assert.equal(off.document.querySelector('.control[data-id="environment"]'), null, 'no control rows');
  assert.equal(gauges(off.document).length, 0, 'no indicators');
});

test('page: a programmed field has a pause button, a plain one does not; pausing holds the value', async (t) => {
  const environment = { light: { program: LIGHT_CYCLE }, temperature: 30 };
  const window = await loadPage(renderPage(circuit(environment, { results: true, controls: [{ environment: 'light' }, { environment: 'temperature' }] }), { lang: 'es' }).html);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const live = window.protoboardLive;
  const [pause, resume] = [ES['page.env.pause'], ES['page.env.resume']];
  assert.ok(buttonsOf(rowOf(doc, 'light')).includes(pause), `a "${pause}" button: ${buttonsOf(rowOf(doc, 'light'))}`);
  assert.ok(!buttonsOf(rowOf(doc, 'temperature')).some((b) => b === pause || b === resume), 'nothing to pause in a plain field');
  const button = [...rowOf(doc, 'light').querySelectorAll('button')].find((b) => b.textContent.trim() === pause);
  button.click();
  assert.ok(buttonsOf(rowOf(doc, 'light')).includes(resume), `now offers "${resume}": ${buttonsOf(rowOf(doc, 'light'))}`);
  const held = live.engine.environment().light;
  ticks(live, 5000);
  assert.equal(live.engine.environment().light, held, 'paused: the value stays');
});

test('page: moving the slider of a programmed field pauses it and offers resume', async (t) => {
  const window = await loadPage(renderPage(circuit({ light: { program: LIGHT_CYCLE }, temperature: 30 }, { results: true, controls: [{ environment: 'light' }] }), { lang: 'es' }).html);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const live = window.protoboardLive;
  slide(window, rowOf(doc, 'light').querySelector('input'), 1000);
  assert.equal(live.engine.environment().light, 10000);
  assert.ok(buttonsOf(rowOf(doc, 'light')).includes(ES['page.env.resume']), `resume offered: ${buttonsOf(rowOf(doc, 'light'))}`);
  ticks(live, 5000);
  assert.equal(live.engine.environment().light, 10000, 'it stays where the slider left it');
});

test('page: an indicator per environment control, whose value text updates after a set', async (t) => {
  const window = await loadPage(renderPage(circuit(undefined, { results: true, controls: [{ environment: 'light' }, { environment: 'temperature' }] }), { lang: 'es' }).html);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const live = window.protoboardLive;
  const found = gauges(doc);
  assert.ok(found.length >= 2, `an element marked "gauge" (data-gauge or a class containing it) for each of the two controls: found ${found.length}`);
  const before = found.map((g) => g.textContent);
  live.set('environment', 'light', 2000);
  const after = gauges(doc).map((g) => g.textContent);
  assert.notDeepEqual(after, before, 'some indicator text changed');
  const temperature = gauges(doc).map((g) => g.textContent);
  live.set('environment', 'temperature', 80);
  assert.notDeepEqual(gauges(doc).map((g) => g.textContent), temperature, 'the temperature indicator changed too');
});

test('page: a timeline step that sets an environment field moves it while the tour plays', async (t) => {
  const steps = [{ at: 0, do: 'caption', text: 'Luz' }, { at: 500, do: 'set', environment: 'light', value: 50 }, { at: 2500, do: 'caption', off: true }];
  const window = await loadPage(renderPage(circuit(undefined, { results: true, tour: { steps } }), { lang: 'es' }).html);
  if (!window) return t.skip('jsdom not installed');
  const live = window.protoboardLive;
  const doc = window.document;
  assert.equal(live.engine.environment().light, 300);
  doc.querySelector('nav .menu .tour-play').click();
  assert.ok(live.tour.playing);
  let now = 0;
  for (; now < 3500; now += FRAME) live.tick(FRAME);
  assert.equal(live.engine.environment().light, 50, 'the tour set the light');
  assert.ok(close(live.reading.parts.LDR1.sensor.resistance, ldrResistance(GL5528, 50)), 'and the photoresistor followed');
});
