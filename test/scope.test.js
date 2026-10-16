// The oscilloscope (stage 3, phase 7): what each part plots (sim/scope.js), the recording
// (sim/recorder.js), the plot's scale and path (page/client/scope.js), and in the live page:
// recorded from the start, drawn only in the open card, cleared when switched on again, and the
// recording matches the engine's transient.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRecorder, samplesOf } from '../src/sim/recorder.js';
import { scopeOf } from '../src/sim/scope.js';
import { scaleOf, pathOf } from '../src/page/client/scope.js';
import { simulate } from '../src/sim/index.js';
import { renderPage } from '../src/page.js';

const example = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));

test('recorder: a ring per key, samples in order, the one before the window included', () => {
  const rec = createRecorder(4);
  for (let k = 0; k < 6; k++) rec.push('R1', k, k * 10, -k);
  const s = rec.get('R1');
  assert.equal(s.count, 4);
  assert.deepEqual(samplesOf(s, 'a', 0, 99), [[2, 20], [3, 30], [4, 40], [5, 50]], 'the oldest dropped out');
  assert.deepEqual(samplesOf(s, 'b', 3.5, 4.5), [[3, -3], [4, -4]], 'the sample before the window starts the line');
  rec.push('D1', 0, NaN, 1);
  assert.deepEqual(samplesOf(rec.get('D1'), 'a', 0, 1), [], 'NaN: a value the part does not have');
  rec.clear();
  assert.equal(rec.get('R1'), null);
});

test('scope: two leads plot their voltage and current; others say what they plot', () => {
  const dc = simulate(example('led-resistor.json'));
  const r1 = scopeOf(dc.parts.R1);
  assert.equal(r1.v.label, null);
  assert.ok(Math.abs(r1.v.value - dc.parts.R1.voltage) < 1e-12 && Math.abs(r1.i.value - dc.parts.R1.current) < 1e-12);
  const bjt = simulate(JSON.parse(readFileSync(new URL('./falstad/cases/bjt-active.json', import.meta.url), 'utf8')));
  const q1 = scopeOf(bjt.parts.Q1);
  assert.deepEqual([q1.v.label, q1.i.label], ['Vce', 'Ic']);
  assert.ok(Math.abs(q1.v.value - bjt.parts.Q1.vce) < 1e-12);
  const more = simulate({ ...example('more-parts.json'), supplies: [{ id: 'V1', voltage: 5 }] });
  assert.equal(scopeOf(more.parts.J1), null, 'header pins: nothing');
  assert.equal(scopeOf(more.parts.U1), null, 'not simulated: nothing');
});

test('scope plot: the scale always shows 0 and ends just above the values; a column keeps its min and max', () => {
  assert.deepEqual(scaleOf([[0, 0.3], [1, 4.4]]), [0, 5]);
  assert.deepEqual(scaleOf([[0, 5]]), [0, 6], '5 V fills most of the screen');
  assert.deepEqual(scaleOf([[0, -1.5e-18], [1, 5]]), [0, 6], 'rounding noise below 0 is not a negative side');
  const [lo, hi] = scaleOf([[0, -0.012]]);
  assert.ok(Math.abs(lo + 0.015) < 1e-12 && hi === 0, 'negative only: from −15 mA to 0');
  assert.deepEqual(scaleOf([[0, -1], [1, 3]]), [-4, 4], "crossing 0: symmetric");
  // 1000 samples of a fast square wave in one column: a band from −1 to 1, not one point.
  const points = Array.from({ length: 1000 }, (_, k) => [k * 1e-6, k % 2 ? 1 : -1]);
  const ys = pathOf(points, 0, 1, -1, 1).split(' ').map((p) => Number(p.split(',')[1]));
  assert.equal(Math.min(...ys), 0);
  assert.equal(Math.max(...ys), 84);
});

async function loadPage(html) {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    return null;
  }
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  const { window } = dom;
  for (const svg of window.document.querySelectorAll('svg')) svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 500 });
  window.eval(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  return window;
}
const tap = (window, id) => window.document.querySelector(`svg:not([hidden]) .parts > [data-part="${id}"]`).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

// 5 V through 10 kΩ into 100 µF: τ = 1 s, from t = 0.
const rc = (page) => ({
  supplies: [{ id: 'V1', voltage: 5 }],
  page,
  parts: [
    { id: 'R1', type: 'resistor', value: '10k', pins: ['T+24', 'h24'] },
    { id: 'C1', type: 'capacitor', value: '100u', voltage: 25, pins: { '+': 'f24', '-': 'f25' } },
    { id: 'W1', type: 'wire', color: 'black', pins: ['j25', 'T-25'] },
  ],
});

test('page: the capacitor\'s voltage rises and its current falls in its card, as the transient says', async (t) => {
  const window = await loadPage(renderPage(rc({ results: true, start: 'zero' }), { lang: 'es' }).html);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const live = window.protoboardLive;
  // Recorded from the start, before any card is open.
  for (let k = 0; k < 120; k++) live.tick(40); // ≈ 2.4 s of simulated time at τ / 2 per second
  assert.ok(live.time > 2, `simulated time ${live.time}`);
  const s = live.recording('C1');
  assert.ok(s.count > 100, 'recorded while no card was open');
  // The recording against the engine's own transient (stored as a plain table).
  const tr = simulate(rc(), { analysis: 'transient', start: 'zero', stop: 2, step: 1e-3 });
  const at = (time) => tr.parts.C1.voltage[tr.times.findIndex((x) => x >= time - 1e-9)];
  const near = samplesOf(s, 'a', 0.99, 1.01).find(([time]) => time >= 0.99);
  assert.ok(Math.abs(near[1] - 5 * (1 - Math.exp(-near[0]))) < 0.02, `V(C1) at ${near[0]} s: ${near[1]} V, 63 % of 5 V at τ`);
  assert.ok(Math.abs(at(1) - 5 * (1 - Math.exp(-1))) < 0.01, 'and the transient agrees');
  assert.equal(doc.querySelector('.info .scope'), null, 'no plot without a card');

  tap(window, 'C1');
  live.tick(300);
  const scope = doc.querySelector('.info .scope');
  assert.ok(scope, 'the card has its oscilloscope');
  assert.equal(scope.querySelector('h3').textContent, 'Osciloscopio');
  const lines = [...scope.querySelectorAll('polyline')];
  assert.equal(lines.length, 2, 'voltage and current');
  assert.deepEqual(lines.map((l) => [l.getAttribute('class'), l.getAttribute('stroke')]), [['scope-trace v', null], ['scope-trace i', null]], 'colours from the theme, not written on the trace');
  const labels = [...scope.querySelectorAll('.scope-label')].map((e) => e.textContent);
  assert.match(labels[0], /^Voltaje: /);
  assert.match(labels[1], /^Corriente: /);
  // Voltage rises (its line ends higher than it starts: smaller y), current falls.
  const ys = (line) => line.getAttribute('points').split(' ').map((p) => Number(p.split(',')[1]));
  assert.ok(ys(lines[0]).at(-1) < ys(lines[0])[0], 'V(C1) rises');
  assert.ok(ys(lines[1]).at(-1) > ys(lines[1])[0], 'I(C1) falls');

  // Closing the card takes it away; switching on again clears the recording.
  doc.querySelector('.info .actions button:last-child').click();
  assert.ok(doc.querySelector('.info').hidden);
  [...doc.querySelectorAll('nav .time button')].find((b) => b.textContent === 'Encender (t = 0)').click();
  assert.equal(live.recording('C1').count, 1, 'only t = 0 left');
});

test('page: without C or L the time is the clock on the wall; a pressed button shows as a step', async (t) => {
  const circuit = {
    supplies: [{ id: 'V1', voltage: 5 }],
    page: { results: true },
    parts: [
      { id: 'W1', type: 'wire', color: 'red', pins: ['T+7', 'j7'] },
      { id: 'S1', type: 'button', pins: ['f7', 'e7', 'f9', 'e9'] },
      { id: 'R1', type: 'resistor', value: '1k', pins: ['j9', 'T-9'] },
    ],
  };
  const window = await loadPage(renderPage(circuit, { lang: 'en' }).html);
  if (!window) return t.skip('jsdom not installed');
  const live = window.protoboardLive;
  for (let k = 0; k < 20; k++) live.tick(50); // 1 s on the wall
  live.set('S1', 'pressed', true);
  for (let k = 0; k < 20; k++) live.tick(50);
  const current = samplesOf(live.recording('R1'), 'b', 0, 10);
  assert.ok(Math.abs(current[0][1]) < 1e-9, 'released at first');
  assert.ok(Math.abs(current.at(-1)[1] - 0.005) < 1e-5, 'then 5 mA');
  const step = current.find(([, i]) => i > 0.004);
  assert.ok(step[0] > 0.9 && step[0] < 1.1, `the step at ${step[0]} s, when it was pressed`);
  assert.equal(window.document.querySelector('.scope'), null);
});

test('page: no oscilloscope where the card shows no results', async (t) => {
  const window = await loadPage(renderPage(rc({ flow: true }), { lang: 'en' }).html);
  if (!window) return t.skip('jsdom not installed');
  window.protoboardLive.tick(100);
  assert.equal(window.protoboardLive.recording('C1'), null, 'nothing recorded');
  tap(window, 'C1');
  assert.equal(window.document.querySelector('.info .scope'), null);
});
