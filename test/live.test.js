// The live page (stage 3, phase 4): the engine runs in the page, dots move by an accumulated
// phase in proportion to the current, simulated time advances for capacitors, tags and card
// follow. Run in jsdom (no requestAnimationFrame: frames are driven by protoboardLive.tick).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkCircuit } from '../src/index.js';
import { renderPage } from '../src/page.js';

const example = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));

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

// 5 V through 10 kΩ into 100 µF: τ = 1 s.
const rc = () => ({
  netLabels: { 'T+': '+5 V', 'T-': 'GND' },
  supplies: [{ id: 'V1', voltage: 5 }],
  parts: [
    { id: 'R1', type: 'resistor', value: '10k', pins: ['T+24', 'h24'] },
    { id: 'C1', type: 'capacitor', value: '100u', voltage: 25, pins: { '+': 'f24', '-': 'f25' } },
    { id: 'W1', type: 'wire', color: 'black', pins: ['j25', 'T-25'] },
  ],
});

test('live: only pages that ask for results or the current layer carry the engine', () => {
  const { page, ...noPage } = example('led-resistor.json');
  const plain = renderPage(noPage).html;
  assert.doesNotMatch(plain, /id="sim-program"/);
  assert.doesNotMatch(plain, /createEngine/, 'no engine in the script');
  const asking = renderPage(example('led-resistor.json')).html;
  assert.match(asking, /id="sim-program"/, 'led-resistor asks for results');
  assert.match(asking, /createEngine/);
});

test('live: dots advance in proportion to the current, + to −', async (t) => {
  const circuit = { ...example('led-resistor.json'), page: { flow: true } };
  const window = await loadPage(renderPage(circuit, { lang: 'es' }).html);
  if (!window) return t.skip('jsdom not installed');
  const live = window.protoboardLive;
  assert.ok(live, 'the live script ran');
  live.tick(0);
  live.tick(50);
  const I = live.currents();
  const phases = live.phases;
  const peak = Math.max(...I.map(Math.abs));
  // 60 px/s at the peak, for 50 ms: 3 px, in the direction of the current.
  I.forEach((i, k) => {
    if (Math.abs(i) < 1e-6) return assert.equal(phases[k], 0);
    assert.ok(Math.abs(phases[k] - Math.sign(i) * 3 * (Math.abs(i) / peak)) < 1e-9, `piece ${k}: ${phases[k]} for ${i} A`);
  });
  // The dots of the visible view moved by that phase.
  const seg = window.document.querySelector('svg:not([hidden]) .flow > [data-seg="0"]');
  assert.equal(Number(seg.style.strokeDashoffset), -phases[0]);
  assert.ok(window.document.body.classList.contains('live'));
});

test('live: a capacitor charges in simulated time (textbook RC), pause stops the clock', async (t) => {
  const circuit = { ...rc(), page: { results: true, flow: true } };
  assert.deepEqual(checkCircuit(circuit).issues.filter((i) => i.severity === 'error'), []);
  const window = await loadPage(renderPage(circuit, { lang: 'es' }).html);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const live = window.protoboardLive;
  const buttons = () => [...doc.querySelectorAll('nav .time button')];
  assert.equal(buttons().length, 2, 'pause and switch on, only because there is a capacitor');
  // Switch on at t = 0 and let one second of simulated time run (τ every 2 s: 2 s of frames).
  buttons().find((b) => b.textContent === 'Encender (t = 0)').click();
  assert.equal(live.time, 0);
  for (let k = 0; k < 125; k++) live.tick(16);
  const tau = live.time;
  assert.ok(tau > 0.9 && tau < 1.1, `simulated ${tau} s`);
  const vc = live.reading.parts.C1.voltage;
  const expected = 5 * (1 - Math.exp(-tau / 1)); // 10 kΩ · 100 µF = 1 s
  assert.ok(Math.abs(vc - expected) < 0.02 * 5, `V(C1) = ${vc} vs ${expected}`);
  // The clock shows it, and the voltage tag of the capacitor's + strip follows.
  assert.match(doc.querySelector('nav .clock').textContent, /^t = /);
  // (5 V minus what R1 drops is what C1 holds: the + strip reads V(C1).)
  window.protoboardLive.tick(300);
  const tag = doc.querySelector('svg:not([hidden]) .results > text[data-node="24:f-j"]');
  const shown = Number(tag.textContent.replace(',', '.').replace(/\s*[mµ]?V$/, ''));
  assert.ok(Math.abs(shown - live.reading.nodes['24:f-j']) < 0.01, `tag ${tag.textContent} vs ${live.reading.nodes['24:f-j']}`);
  // The dots slow down with the current: the scale stays the largest current since switching on.
  const r1 = window.protoboardLive.currents().findIndex((i) => Math.abs(i) > 0);
  const speedNow = Math.abs(live.currents()[r1]);
  assert.ok(Math.abs(speedNow / (5 / 10000) - Math.exp(-live.time)) < 0.03, `I/I0 = ${speedNow / (5 / 10000)} vs e^-t = ${Math.exp(-live.time)}`);
  // Pause: the clock stops.
  buttons().find((b) => b.textContent === 'Pausa').click();
  const stopped = live.time;
  for (let k = 0; k < 10; k++) live.tick(16);
  assert.equal(live.time, stopped);
});
