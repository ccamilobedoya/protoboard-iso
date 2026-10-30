// The director (stage and video, V1): with ?director=1 one clock owns the live page. tick(ms) moves
// the camera, the controls and the simulation, and repaints, without reading the system clock, so
// a sequence played with tick(1000/30) gives the same page every time. Run in jsdom.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderPage } from '../src/page.js';

const example = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));
const FRAME = 1000 / 30;
// As in src/page/client/view.js (not imported: the page's modules run bundled, in the page).
const easeOut = (k) => 1 - (1 - k) ** 4;
const numbers = (text) => text.split(' ').map(Number);

async function loadPage(html, search = '?director=1') {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    return null;
  }
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: `https://page.test/circuit.html${search}` });
  const { window } = dom;
  for (const svg of window.document.querySelectorAll('svg')) svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 500 });
  window.eval(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  return window;
}
const ticks = (window, n) => {
  for (let k = 0; k < n; k++) window.protoboardLive.tick(FRAME);
};
const viewBox = (window) => numbers(window.document.querySelector('main > svg:not([hidden])').getAttribute('viewBox'));
const close = (a, b, eps, what) => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} vs ${b}`);
const control = (window, id, field) => window.protoboardLive.engine.controls().find((c) => c.id === id && c.field === field).value;

// 5 V through 10 kΩ into 100 µF from t = 0 (τ = 1 s): something changes on every tick.
const rc = () => ({
  netLabels: { 'T+': '+5 V', 'T-': 'GND' },
  supplies: [{ id: 'V1', voltage: 5 }],
  parts: [
    { id: 'R1', type: 'resistor', value: '10k', pins: ['T+24', 'h24'] },
    { id: 'C1', type: 'capacitor', value: '100u', voltage: 25, pins: { '+': 'f24', '-': 'f25' } },
    { id: 'W1', type: 'wire', color: 'black', pins: ['j25', 'T-25'] },
  ],
  page: { results: true, flow: true, start: 'zero' },
});

test('director: only with ?director=1; without it the page has none', async (t) => {
  const html = renderPage(example('led-resistor.json')).html;
  const plain = await loadPage(html, '');
  if (!plain) return t.skip('jsdom not installed');
  assert.equal(plain.protoboardLive.director, null);
  assert.ok(!plain.document.body.classList.contains('director'));
  const directed = await loadPage(html);
  assert.ok(directed.protoboardLive.director);
  assert.ok(directed.document.body.classList.contains('director'));
  assert.equal(directed.protoboardLive.director.time, 0);
});

test('director: the camera moves on its clock, along its curve, and stops at the target', async (t) => {
  const window = await loadPage(renderPage(example('led-resistor.json')).html);
  if (!window) return t.skip('jsdom not installed');
  const d = window.protoboardLive.director;
  const board = numbers(window.document.querySelector('main > svg:not([hidden])').dataset.board);
  const from = viewBox(window);
  // A quarter of the board around its centre (kept on the board, as every frame is).
  const to = [board[0] + board[2] * 0.375, board[1] + board[3] * 0.375, board[2] / 4, board[3] / 4];
  d.start();
  assert.ok(d.frame(to, { ms: 600 }));
  ticks(window, 9); // 300 ms: half the time
  const half = viewBox(window);
  from.forEach((f, i) => close(half[i], f + (to[i] - f) * easeOut(0.5), 0.02, `box[${i}] at 300 ms`));
  ticks(window, 9);
  viewBox(window).forEach((v, i) => close(v, to[i], 0.01, `box[${i}] at 600 ms`));
  ticks(window, 3);
  viewBox(window).forEach((v, i) => close(v, to[i], 0.01, `box[${i}] after the move`));
  // A name goes to the page's own frame; no time, at once.
  assert.ok(d.frame('board'));
  viewBox(window).forEach((v, i) => close(v, board[i], 0.01, `board[${i}]`));
  assert.equal(d.frame('nothing-here'), false);
});

test('director: a control moves by tick, linearly or by ratios on a log scale, and the circuit follows', async (t) => {
  const window = await loadPage(renderPage(example('led-resistor.json')).html);
  if (!window) return t.skip('jsdom not installed');
  const { director: d, reading } = window.protoboardLive;
  const before = reading.parts.D1.current;
  d.start();
  d.set('V1', 'voltage', 9, { ms: 1000, ease: (k) => k });
  d.set('R1', 'resistance', 3300, { ms: 1000, ease: (k) => k });
  ticks(window, 15); // 500 ms
  close(control(window, 'V1', 'voltage'), 7, 1e-6, 'V1 halfway');
  close(control(window, 'R1', 'resistance'), 330 * Math.sqrt(10), 1e-6, 'R1 halfway, by ratios');
  ticks(window, 15);
  assert.equal(control(window, 'V1', 'voltage'), 9);
  assert.equal(control(window, 'R1', 'resistance'), 3300);
  const after = window.protoboardLive.reading.parts.D1.current;
  assert.ok(after < before / 3, `D1: ${before} A → ${after} A`);
  // A button is not a number: it changes at once.
  assert.equal(d.set('R1', 'missing', 1), false);
});

test('director: cues run at their own time, in order', async (t) => {
  const window = await loadPage(renderPage(example('led-resistor.json')).html);
  if (!window) return t.skip('jsdom not installed');
  const d = window.protoboardLive.director;
  const seen = [];
  d.start([
    { at: 90, run: (x) => seen.push(['b', x.time]) },
    { at: 50, run: (x) => x.set('V1', 'voltage', 2, { ms: 100, ease: (k) => k }) },
    { at: 90, run: (x) => seen.push(['c', x.time]) },
  ]);
  ticks(window, 2); // 66.7 ms: the move began at 50 ms, a sixth of the way
  close(control(window, 'V1', 'voltage'), 5 - 3 * (FRAME * 2 - 50) / 100, 1e-6, 'V1 at 66.7 ms');
  assert.deepEqual(seen, []);
  ticks(window, 1);
  assert.deepEqual(seen, [['b', 90], ['c', 90]]);
  close(d.time, 100, 1e-9, 'time');
});

test('director: a sequence never reads the system clock, repaints on every tick and gives the same page twice', async (t) => {
  const html = renderPage(rc(), { lang: 'es' }).html;
  const run = async () => {
    const window = await loadPage(html);
    // From here on, reading the wall clock is a failure.
    const wall = () => {
      throw new Error('the system clock was read');
    };
    window.performance.now = wall;
    window.Date.now = wall;
    const d = window.protoboardLive.director;
    const board = numbers(window.document.querySelector('main > svg:not([hidden])').dataset.board);
    d.start([
      { at: 0, run: (x) => x.frame([board[0], board[1], board[2] / 2, board[3] / 2], { ms: 700 }) },
      { at: 400, run: (x) => x.set('R1', 'resistance', 4700, { ms: 500 }) },
    ]);
    const tag = () => window.document.querySelector('main > svg:not([hidden]) .results > text[data-node="24:f-j"]').textContent;
    const tags = [];
    const volts = [];
    for (let k = 0; k < 45; k++) {
      window.protoboardLive.tick(FRAME);
      tags.push(tag());
      volts.push(window.protoboardLive.reading.nodes['24:f-j']);
    }
    const svg = window.document.querySelector('main > svg:not([hidden])');
    return {
      window,
      tags,
      volts,
      state: JSON.stringify({
        time: d.time,
        sim: window.protoboardLive.time,
        box: svg.getAttribute('viewBox'),
        phases: window.protoboardLive.phases,
        dots: [...svg.querySelectorAll('.flow > [data-seg]')].map((el) => el.style.strokeDashoffset),
        colours: [...svg.querySelectorAll('.flow > [data-wire]')].map((el) => el.getAttribute('stroke')),
        nodes: window.protoboardLive.reading.nodes,
        r1: control(window, 'R1', 'resistance'),
      }),
    };
  };
  const a = await run();
  if (!a.window) return t.skip('jsdom not installed');
  // The capacitor's strip is repainted on every tick (the page alone waits 250 ms between repaints):
  // its tag always shows the voltage of that tick.
  a.tags.forEach((text, k) => {
    const shown = Number(text.replace(',', '.').replace(/\s*m?V$/, '')) / (/mV$/.test(text) ? 1000 : 1);
    close(shown, a.volts[k], 0.006, `tick ${k}: ${text}`);
  });
  assert.ok(a.volts[44] > a.volts[0], 'the capacitor charged');
  assert.ok(a.window.protoboardLive.phases.some((p) => p !== 0), 'the dots moved');
  const b = await run();
  assert.equal(b.state, a.state);
  assert.deepEqual(b.tags, a.tags);
});
