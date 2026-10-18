// Probes on nodes (stage 3, phase 9): a tap on a strip in use opens its card. Without results, what
// a strip is and what is clipped to it, with those parts brought forward; with results, its voltage
// to ground, the current of each lead (Kirchhoff: they add up to zero), the probes that read it and
// its oscilloscope, recorded from the start like the parts'.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPage } from '../src/page.js';
import { nodeLines, leadCurrent } from '../src/sim/lines.js';
import { samplesOf } from '../src/sim/recorder.js';
import { simulate } from '../src/sim/index.js';

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

const pageData = (window) => JSON.parse(window.document.getElementById('page-data').textContent);

// A click on the screen point where a drawing point is (the inverse of view.js's toBox).
function clickAt(window, x, y) {
  const svg = window.document.querySelector('main > svg:not([hidden])');
  const [bx, by, bw, bh] = svg.getAttribute('viewBox').split(' ').map(Number);
  const k = Math.max(bw / 800, bh / 500);
  const px = (x - bx - bw / 2) / k + 400;
  const py = (y - by - bh / 2) / k + 250;
  svg.querySelector('.board').dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: px, clientY: py }));
}
// A tap on a hole of a strip, from the page's own hit table (k: which hole of that strip).
function tapStrip(window, node, k = 0) {
  const data = pageData(window);
  const view = window.document.querySelector('main > svg:not([hidden])').dataset.view;
  const { holes } = data.hits[view];
  const index = data.strips.indexOf(node);
  const mine = [];
  for (let i = 0; i < holes.length; i += 3) if (holes[i + 2] === index) mine.push([holes[i], holes[i + 1]]);
  clickAt(window, ...mine[k]);
}

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

// A divider: 5 V, 1 kΩ over 2 kΩ, so 3,33 V and 1,67 mA through both.
const divider = (page) => ({
  supplies: [{ id: 'V1', voltage: 5 }],
  page,
  parts: [
    { id: 'R1', type: 'resistor', value: '1k', pins: ['T+10', 'h10'] },
    { id: 'R2', type: 'resistor', value: '2k', pins: ['g10', 'T-10'] },
  ],
});

test('node lines: the voltage, then each lead into or out of the strip, adding up to zero', () => {
  const circuit = divider();
  const sim = simulate(circuit);
  const leads = [{ name: 'R1 (2)', part: 'R1', pin: '2' }, { name: 'R2 (1)', part: 'R2', pin: '1' }];
  const t = (key, p = {}) => `${key}|${Object.values(p).join('|')}`;
  const lines = nodeLines(sim, '10:f-j', leads, { t, decimal: ',' });
  assert.deepEqual(lines.map((l) => l.key), ['node.voltage', 'node.current', 'node.current']);
  assert.equal(lines[0].text, 'page.node.voltage|3,33 V');
  assert.equal(lines[1].text, 'page.node.in|R1 (2)|1,67 mA');
  assert.equal(lines[2].text, 'page.node.out|R2 (1)|1,67 mA');
  const sum = leads.reduce((s, l) => s + leadCurrent(sim, l), 0);
  assert.ok(Math.abs(sum) < 1e-9, `Kirchhoff (the solver leaks picoamperes to ground): ${sum}`);
  // The supply's terminals: + delivers into its rail, − takes it back.
  assert.ok(Math.abs(leadCurrent(sim, { supply: 'V1', sign: 1 }) - 5 / 3000) < 1e-9);
  assert.ok(Math.abs(leadCurrent(sim, { supply: 'V1', sign: -1 }) + 5 / 3000) < 1e-9);
});

test('static page: a tapped strip shows what it is and brings forward what is clipped to it', async (t) => {
  const window = await loadPage(renderPage(divider({ simulation: false }), { lang: 'es' }).html);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const data = pageData(window);
  assert.deepEqual([...data.strips].sort(), ['10:f-j', 'T+', 'T-'], 'the strips in use and the rails of the supply');
  tapStrip(window, '10:f-j', 3);
  const info = doc.querySelector('.info');
  assert.ok(!info.hidden);
  assert.equal(info.querySelector('h2').textContent, 'columna 10 (filas f–j)');
  assert.match(info.querySelector('.here').textContent, /5 agujeros, f10–j10, están unidos/);
  assert.deepEqual([...info.querySelectorAll('ul > li')].map((li) => li.textContent), ['R1 (pata 2) en h10', 'R2 (pata 1) en g10']);
  assert.equal(info.querySelector('.sim'), null, 'no values without results');
  const rules = doc.getElementById('dynamic').textContent;
  assert.match(rules, /\.strips > \[data-node="10:f-j"\]/);
  assert.doesNotMatch(rules, /data-node="T\+"/, 'only that strip, not the others of its parts');
  assert.deepEqual([...doc.querySelectorAll('svg:not([hidden]) .spotlight > [data-part]')].map((e) => e.dataset.part).filter((v, i, a) => a.indexOf(v) === i).sort(), ['R1', 'R2']);
  assert.ok(doc.body.classList.contains('focusing'));

  // A part still wins where it is; the empty board clears.
  doc.querySelector('svg:not([hidden]) .parts > [data-part="R2"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(info.querySelector('h2').textContent, data.parts.R2.title);
  assert.doesNotMatch(doc.getElementById('dynamic').textContent, /\.probes/);
  // From a part's card to the strip of a pin (a part often covers its strip on screen), and back.
  const links = [...info.querySelectorAll('ul > li > button.link')];
  assert.deepEqual(links.map((b) => b.textContent.split(' → ')[0]), ['1', '2']);
  links[0].click();
  assert.equal(info.querySelector('h2').textContent, 'columna 10 (filas f–j)');
  assert.ok(!info.hidden, 'the card stays open: the tap does not fall through to the board');
  [...info.querySelectorAll('button.link')].find((b) => b.textContent.startsWith('R2')).click();
  assert.equal(info.querySelector('h2').textContent, data.parts.R2.title);
  assert.ok(!info.hidden);
  const [bx, by] = doc.querySelector('main > svg:not([hidden])').getAttribute('viewBox').split(' ').map(Number);
  clickAt(window, bx + 1, by + 1);
  assert.ok(info.hidden, 'a tap far from any strip closes the card');
});

test('live page: a strip\'s voltage, its currents and its oscilloscope follow the capacitor charging', async (t) => {
  const window = await loadPage(renderPage(rc({ results: true, start: 'zero' }), { lang: 'es' }).html);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const live = window.protoboardLive;
  for (let k = 0; k < 60; k++) live.tick(40); // ≈ 1.2 s of simulated time
  const rec = live.recording('node:24:f-j');
  assert.ok(rec && rec.count > 50, 'the strip was recorded before anyone tapped it');
  const near = samplesOf(rec, 'a', 0.99, 1.01).find(([time]) => time >= 0.99);
  assert.ok(Math.abs(near[1] - 5 * (1 - Math.exp(-near[0]))) < 0.02, `V at ${near[0]} s: ${near[1]} V, 63 % of 5 V at τ`);

  tapStrip(window, '24:f-j');
  live.tick(300);
  const info = doc.querySelector('.info');
  const lines = [...info.querySelectorAll('.sim .terms > li')].map((li) => li.textContent);
  assert.match(lines[0], /^Voltaje respecto a tierra: [\d,]+ V/);
  assert.match(lines[1], /^R1 \(pata 2\): entran [\d,]+ µA a la tira/);
  assert.match(lines[2], /^C1 \(\+\): salen [\d,]+ µA de la tira/);
  const leads = pageData(window).nodes['24:f-j'].leads;
  const sum = leads.reduce((s, l) => s + leadCurrent(live.reading, l), 0);
  assert.ok(Math.abs(sum) < 1e-9, `what goes in comes out: ${sum}`);
  // One trace, the voltage to ground, rising.
  const scope = info.querySelector('.scope');
  const traces = [...scope.querySelectorAll('polyline')];
  assert.equal(traces.length, 1);
  assert.match(scope.querySelector('.scope-label').textContent, /^Voltaje respecto a tierra: /);
  const ys = traces[0].getAttribute('points').split(' ').map((p) => Number(p.split(',')[1]));
  assert.ok(ys.at(-1) < ys[0], 'it rises');
  // The probes that read it: red on the strip, black on ground.
  assert.match(doc.getElementById('dynamic').textContent, /\.probes > \[data-probe="node:24:f-j"\]/);
  assert.ok(doc.querySelector('svg:not([hidden]) .probes > [data-probe="node:24:f-j"]'));

  // The values move while the card is open, in place.
  const before = info.querySelector('.sim .terms > li').textContent;
  for (let k = 0; k < 40; k++) live.tick(40);
  assert.notEqual(info.querySelector('.sim .terms > li').textContent, before);

  // A part's card after it: its own oscilloscope, two traces again.
  doc.querySelector('svg:not([hidden]) .parts > [data-part="C1"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  live.tick(300);
  assert.equal(info.querySelectorAll('.scope polyline').length, 2);
  assert.doesNotMatch(doc.getElementById('dynamic').textContent, /\.probes/);
});

test('prediction rule: without results a strip\'s card has no values and nothing is recorded', async (t) => {
  const window = await loadPage(renderPage(rc({ results: false }), { lang: 'en' }).html);
  if (!window) return t.skip('jsdom not installed');
  window.protoboardLive.tick(100);
  assert.equal(window.protoboardLive.recording('node:24:f-j'), null);
  tapStrip(window, '24:f-j');
  const info = window.document.querySelector('.info');
  assert.equal(info.querySelector('h2').textContent, 'column 24 (rows f–j)');
  assert.equal(info.querySelector('.sim'), null);
  assert.equal(info.querySelector('.scope'), null);
});
