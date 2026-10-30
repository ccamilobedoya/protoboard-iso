// Controls and limits (stage 3, phase 5): engine.set against each control's own formula and a
// fresh simulation of the changed circuit; the state carried over in a running RC; stresses in
// simulate(); the page's sliders, momentary button, outlines and warnings (jsdom); `check` of
// page.controls.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkCircuit } from '../src/index.js';
import { simulate, compile, createEngine } from '../src/sim/index.js';
import { renderPage } from '../src/page.js';
import { installClock } from './clock.js';
import { ntcResistance, ldrResistance, LDR_PARTS } from '../src/parts/sensors.js';
import { batteryModel } from '../src/parts/batteries.js';
import { fromSlider, toSlider, snapE24, stressLevel } from '../src/sim/controls.js';

const example = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));
const close = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-12);
const engineOf = (circuit) => {
  const e = createEngine(compile(circuit).program);
  assert.ok(e.start('dc'));
  return e;
};
const withPart = (circuit, id, change) => ({ ...circuit, parts: circuit.parts.map((p) => (p.id === id ? { ...p, ...change } : p)) });

// 5 V, a push button (column 7 to column 9 when pressed) and 1 kΩ to ground.
const buttonCircuit = () => ({
  supplies: [{ id: 'V1', voltage: 5 }],
  page: { results: true },
  parts: [
    { id: 'W1', type: 'wire', color: 'red', pins: ['T+7', 'j7'] },
    { id: 'S1', type: 'button', pins: ['f7', 'e7', 'f9', 'e9'] },
    { id: 'R1', type: 'resistor', value: '1k', pins: ['j9', 'T-9'] },
  ],
});

test('controls: the slider maps (log, E24, linear with step) go and come back', () => {
  const log = { min: 10, max: 1e6, scale: 'log', snap: 'E24' };
  assert.equal(fromSlider(log, 0), 10);
  assert.equal(fromSlider(log, 1000), 1e6);
  assert.equal(snapE24(4600), 4700);
  assert.equal(snapE24(333), 330);
  assert.equal(snapE24(0.97), 1);
  assert.equal(toSlider(log, 1000), 400, 'four decades of five: 1 kΩ at 2/5');
  const lin = { min: 0, max: 30, scale: 'linear', step: 0.1 };
  assert.equal(fromSlider(lin, 500), 15);
  assert.ok(close(fromSlider(lin, 123), 3.7, 1e-12));
  assert.deepEqual([0.5, 0.8, 0.81, 1, 1.01].map(stressLevel), ['fine', 'fine', 'near', 'near', 'exceeded']);
});

test('controls: every adjustable part and supply lists its controls', () => {
  const more = example('more-parts.json');
  const fields = createEngine(compile(more).program).controls().map((c) => `${c.id}.${c.field}`);
  for (const want of ['RV1.position', 'RT1.temperature', 'LDR1.light', 'BT1.charge']) assert.ok(fields.includes(want), `${want} in ${fields}`);
  const led = createEngine(compile(example('led-resistor.json')).program).controls();
  assert.deepEqual(led.map((c) => `${c.id}.${c.field}`), ['R1.resistance', 'V1.voltage']);
  // The resistor's range stays around the value in the file while it moves.
  const e = engineOf(example('led-resistor.json'));
  e.set('R1', 'resistance', 1000);
  const r = e.controls().find((c) => c.id === 'R1');
  assert.deepEqual([r.min, r.max, r.value], [3.3, 33000, 1000]);
});

test('engine.set: each control gives what a fresh simulation of the changed circuit gives', () => {
  const led = example('led-resistor.json');
  const cases = [
    [led, 'R1', 'resistance', 100, withPart(led, 'R1', { value: '100' })],
    [led, 'V1', 'voltage', 9, { ...led, supplies: [{ ...led.supplies[0], voltage: 9 }] }],
  ];
  const more = example('more-parts.json');
  cases.push([more, 'RT1', 'temperature', 60, withPart(more, 'RT1', { temperature: 60 })]);
  cases.push([more, 'LDR1', 'light', 3, withPart(more, 'LDR1', { light: 3 })]);
  cases.push([more, 'RV1', 'position', 0.8, withPart(more, 'RV1', { position: 0.8 })]);
  cases.push([more, 'BT1', 'charge', 0.25, withPart(more, 'BT1', { charge: 0.25 })]);
  const button = buttonCircuit();
  cases.push([button, 'S1', 'pressed', true, withPart(button, 'S1', { pressed: true })]);
  for (const [circuit, id, field, value, changed] of cases) {
    const e = engineOf(circuit);
    assert.ok(e.set(id, field, value), `${id}.${field}`);
    const now = e.read();
    const fresh = simulate(changed);
    assert.ok(fresh.ok);
    for (const [node, v] of Object.entries(fresh.nodes)) {
      if (v == null) continue;
      assert.ok(Math.abs(now.nodes[node] - v) < 1e-6, `${id}.${field}: V(${node}) ${now.nodes[node]} vs ${v}`);
    }
  }
});

test('engine.set: the pure formulas (NTC, photoresistor, battery charge, button)', () => {
  const more = example('more-parts.json');
  const e = engineOf(more);
  e.set('RT1', 'temperature', 0);
  assert.ok(close(e.read().parts.RT1.sensor.resistance, ntcResistance({ r25: 10e3, beta: 3950 }, 0)));
  e.set('LDR1', 'light', 1000);
  assert.ok(close(e.read().parts.LDR1.sensor.resistance, ldrResistance(LDR_PARTS.GL5528, 1000)));
  e.set('BT1', 'charge', 0.5);
  const bt = e.read().parts.BT1;
  assert.ok(close(bt.emf, batteryModel({ format: '18650', cells: 2, charge: 0.5 }).emf));
  assert.equal(bt.charge, 0.5);
  // A battery without a charge starts its slider at the charge of its nominal voltage.
  const c = createEngine(compile(more).program).controls().find((x) => x.id === 'BT1');
  assert.ok(Math.abs(batteryModel({ format: '18650', cells: 2, charge: c.value }).emf - 7.4) < 0.05, `charge ${c.value}`);
  // Out-of-range values are held inside what makes sense; unknown controls are refused.
  e.set('RV1', 'position', 3);
  assert.equal(e.controls().find((x) => x.id === 'RV1').value, 1);
  assert.equal(e.set('RV1', 'colour', 1), false);
  assert.equal(e.set('nope', 'position', 1), false);
  // The button conducts only while pressed.
  const b = engineOf(buttonCircuit());
  assert.ok(Math.abs(b.read().parts.R1.current) < 1e-9);
  b.set('S1', 'pressed', true);
  assert.ok(Math.abs(b.read().parts.R1.current - 5 / 1000) < 1e-5);
  b.set('S1', 'pressed', false);
  assert.ok(Math.abs(b.read().parts.R1.current) < 1e-9);
});

test('engine.set while running: the capacitor keeps its voltage and charges with the new τ', () => {
  const rc = {
    supplies: [{ id: 'V1', voltage: 5 }],
    parts: [
      { id: 'R1', type: 'resistor', value: '10k', pins: ['T+24', 'h24'] },
      { id: 'C1', type: 'capacitor', value: '100u', voltage: 25, pins: { '+': 'f24', '-': 'f25' } },
      { id: 'W1', type: 'wire', color: 'black', pins: ['j25', 'T-25'] },
    ],
  };
  const e = createEngine(compile(rc).program);
  const h = 1e-3;
  e.start('zero', h);
  for (let k = 0; k < 1000; k++) e.step(h); // 1 s = τ
  const v1 = e.read().parts.C1.voltage;
  assert.ok(Math.abs(v1 - 5 * (1 - Math.exp(-1))) < 0.01, `V(C1) at τ: ${v1}`);
  e.set('R1', 'resistance', 1000); // τ = 0.1 s from here
  assert.ok(Math.abs(e.read().parts.C1.voltage - v1) < 1e-4, 'no jump in the capacitor voltage');
  assert.ok(Math.abs(e.read().parts.R1.current - (5 - v1) / 1000) < 1e-5, 'the new current at once');
  for (let k = 0; k < 100; k++) e.step(h); // 0.1 s more
  const expected = 5 - (5 - v1) * Math.exp(-1);
  assert.ok(Math.abs(e.read().parts.C1.voltage - expected) < 0.02, `${e.read().parts.C1.voltage} vs ${expected}`);
});

test('simulate: each part carries its stress against its limits (computed apart)', () => {
  const led = example('led-resistor.json');
  const r = simulate(led);
  const r1 = r.parts.R1;
  const power = r1.stress.find((s) => s.quantity === 'power');
  assert.ok(close(power.value, r1.voltage ** 2 / 330, 1e-6), 'P = V²/R');
  assert.ok(close(power.ratio, power.value / 0.25));
  const d1 = r.parts.D1.stress.find((s) => s.quantity === 'current');
  assert.ok(close(d1.ratio, r.parts.D1.current / d1.max));
  assert.equal(d1.level, stressLevel(d1.ratio));
  // 9 V through 100 Ω: the LED is past its maximum, and the warning says so.
  const hot = simulate({ ...withPart(led, 'R1', { value: '100' }), supplies: [{ id: 'V1', voltage: 9 }] });
  assert.equal(hot.parts.D1.stress.find((s) => s.quantity === 'current').level, 'exceeded');
  assert.ok(hot.issues.some((i) => i.code === 'SIM_OVER_CURRENT' && i.params.part === 'D1'));
});

test('check: page.controls names real controls with sensible ranges', () => {
  const led = example('led-resistor.json');
  const codes = (page) => checkCircuit({ ...led, page }).issues.map((i) => i.code).filter((c) => c.startsWith('PAGE_'));
  assert.deepEqual(codes({ results: true, controls: [{ part: 'R1', field: 'resistance', min: 100, max: 10000 }, { supply: 'V1', field: 'voltage' }] }), []);
  assert.deepEqual(codes({ results: true, controls: [{ part: 'D1', field: 'resistance' }] }), ['PAGE_CONTROL_UNKNOWN']);
  assert.deepEqual(codes({ results: true, controls: [{ part: 'R1', field: 'resistance', min: 0, max: 100 }] }), ['PAGE_CONTROL_RANGE']);
  assert.deepEqual(codes({ results: true, controls: [{ field: 'voltage' }] }), ['PAGE_CONTROL_TARGET']);
  assert.deepEqual(codes({ controls: [{ supply: 'V1', field: 'voltage' }] }), [], 'live by default with a source');
  assert.deepEqual(codes({ simulation: false, controls: [{ supply: 'V1', field: 'voltage' }] }), ['PAGE_CONTROLS_NOT_LIVE']);
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
  window.testClock = installClock(window); // time moves by hand: window.testClock.tick(ms)
  window.eval(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  return window;
}
const tap = (window, id) => window.document.querySelector(`svg:not([hidden]) .parts > [data-part="${id}"]`).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
// Dragging fires 'input' (debounced), letting go fires 'change' (solved at once).
const drag = (window, input, k) => {
  input.value = String(k);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
};
const slide = (window, input, k) => {
  drag(window, input, k);
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
};

test('page: a slider in the card re-solves; past a limit the part is marked until cleared', async (t) => {
  const circuit = { ...example('led-resistor.json'), page: { results: true, controls: [{ supply: 'V1', field: 'voltage', max: 12, label: { en: 'Supply', es: 'Fuente' } }] } };
  const window = await loadPage(renderPage(circuit, { lang: 'es' }).html);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const live = window.protoboardLive;
  // The panel: one row, with the lesson's label and range.
  const row = doc.querySelector('.side .controls .control');
  assert.equal(row.querySelector('.name').textContent, 'Fuente');
  assert.equal(row.querySelector('output').textContent, '5 V');
  // The card of R1 has its own slider; moving it changes the current at once.
  tap(window, 'R1');
  const input = doc.querySelector('.info .adjust input[type="range"]');
  assert.ok(input, 'a slider in the card');
  assert.equal(doc.querySelector('.info .adjust .name').textContent, 'Resistencia');
  slide(window, input, 100); // 3.3 Ω · 10^(4·0.1) → E24
  const r = live.engine.controls().find((c) => c.id === 'R1').value;
  assert.equal(r, 8.2);
  assert.ok(live.reading.parts.D1.current > 0.1, 'far past the LED maximum');
  // Marked: outline rule, warning in the panel and in the card.
  assert.match(doc.getElementById('stress').textContent, /data-mark="D1"[^}]*stress-pulse/);
  // The outline is a box drawn once around the part (layer marks), not a CSS filter: a blur is
  // redrawn on every frame the dots move, which made the page crawl past 10 V.
  assert.ok(doc.querySelector('svg:not([hidden]) .marks > rect[data-mark="D1"]'), 'a box around D1');
  assert.equal(doc.querySelector('.marks [data-mark="W1"]'), null, 'no box around a wire');
  assert.doesNotMatch([...doc.querySelectorAll('style')].map((x) => x.textContent).join(''), /filter\s*:/);
  const warnings = doc.querySelector('.side .warnings');
  assert.equal(warnings.hidden, false);
  assert.match(warnings.textContent, /D1/);
  // Back to 330 Ω: the mark stays (latched) until cleared.
  slide(window, input, toSlider({ min: 3.3, max: 33000, scale: 'log' }, 330));
  assert.ok(live.reading.parts.D1.current < 0.02);
  assert.equal(warnings.hidden, false, 'still marked');
  // …and its text says the peak was a peak, and what flows now.
  const now = live.reading.parts.D1.current;
  assert.match(warnings.textContent, /D1: la corriente llegó a [\d,]+ mA \(máximo 30 mA\) · ahora /);
  assert.ok(warnings.textContent.includes(`ahora ${String(Number((now * 1000).toPrecision(3))).replace('.', ',')} mA`), warnings.textContent);
  assert.doesNotMatch(warnings.textContent, /todavía por encima/);
  warnings.querySelector('.clear').click();
  assert.equal(warnings.hidden, true);
  assert.doesNotMatch(doc.getElementById('stress').textContent, /stress-pulse/);
  // The panel slider moves the supply, and the card follows the panel.
  slide(window, row.querySelector('input'), 1000);
  assert.equal(live.reading.supplies.V1.voltage, 12);
  assert.equal(row.querySelector('output').textContent, '12 V');
});

test('page: a push button conducts while held, in its card and on the drawing', async (t) => {
  const window = await loadPage(renderPage(buttonCircuit(), { lang: 'es' }).html);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const live = window.protoboardLive;
  tap(window, 'S1');
  const hold = doc.querySelector('.info .adjust .hold');
  assert.equal(hold.textContent, 'Mantén presionado');
  hold.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  assert.ok(Math.abs(live.reading.parts.R1.current - 0.005) < 1e-5);
  hold.dispatchEvent(new window.Event('pointerup', { bubbles: true }));
  assert.ok(Math.abs(live.reading.parts.R1.current) < 1e-9);
  const part = doc.querySelector('svg:not([hidden]) .parts > [data-part="S1"]');
  part.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  assert.ok(Math.abs(live.reading.parts.R1.current - 0.005) < 1e-5, 'pressed on the drawing');
  window.dispatchEvent(new window.Event('pointerup'));
  assert.ok(Math.abs(live.reading.parts.R1.current) < 1e-9, 'let go');
  // "Keep pressed": it stays pressed while another part is looked at, until tapped again.
  const keep = doc.querySelector('.info .adjust .latch');
  assert.equal(keep.textContent, 'Dejar presionado');
  keep.click();
  assert.equal(keep.getAttribute('aria-pressed'), 'true');
  assert.ok(Math.abs(live.reading.parts.R1.current - 0.005) < 1e-5, 'kept pressed');
  hold.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  hold.dispatchEvent(new window.Event('pointerup', { bubbles: true }));
  part.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  window.dispatchEvent(new window.Event('pointerup'));
  tap(window, 'R1');
  assert.ok(Math.abs(live.reading.parts.R1.current - 0.005) < 1e-5, 'holding and letting go does not release it, nor does opening another card');
  tap(window, 'S1');
  const again = doc.querySelector('.info .adjust .latch');
  assert.equal(again.getAttribute('aria-pressed'), 'true', 'the card opens showing it kept');
  again.click();
  assert.ok(Math.abs(live.reading.parts.R1.current) < 1e-9, 'released');
});

test('page: a switch stays where it is left, on or off from its card and the panel', async (t) => {
  const window = await loadPage(renderPage(example('switches.json'), { lang: 'es' }).html);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const live = window.protoboardLive;
  const green = () => live.reading.parts.D2.current;
  const yellow = () => live.reading.parts.D3.current;
  assert.ok(green() > 5e-3 && Math.abs(yellow()) < 1e-9, 'released: C1–NC1, the green LED');
  tap(window, 'S2');
  const button = doc.querySelector('.info .adjust .toggle');
  assert.equal(button.textContent, 'Encender');
  button.click();
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(button.textContent, 'Apagar');
  assert.ok(yellow() > 5e-3 && Math.abs(green()) < 1e-9, 'latched: C1–NO1, the yellow LED');
  tap(window, 'R2');
  assert.ok(yellow() > 5e-3, 'it stays on while another card is open');
  const panel = [...doc.querySelectorAll('.panel.controls .control')].find((r) => r.dataset.id === 'S1');
  panel.querySelector('.toggle').click();
  assert.ok(Math.abs(live.reading.parts.D1.current) < 1e-9 && Math.abs(yellow()) < 1e-9, 'the main switch off: nothing lit');
});

test('page: while dragging, a slider shows its value at once but solves only after resting', async (t) => {
  const window = await loadPage(renderPage(example('led-resistor.json'), { lang: 'es' }).html);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const live = window.protoboardLive;
  tap(window, 'R1');
  const input = doc.querySelector('.info .adjust input[type="range"]');
  const solves = [];
  const set = live.engine.set;
  live.engine.set = (...args) => (solves.push(args[2]), set(...args));
  drag(window, input, 500); // the first touch solves at once
  for (const k of [520, 540, 560, 580]) drag(window, input, k); // a quick drag: shown, not solved
  assert.equal(solves.length, 1);
  assert.equal(doc.querySelector('.info .adjust output').textContent, '680 Ω', 'the label follows the finger');
  window.testClock.tick(119);
  assert.equal(solves.length, 1, 'still moving: not yet');
  window.testClock.tick(1); // at rest for 120 ms: the last value is solved
  assert.equal(solves.length, 2);
  assert.equal(solves[1], live.engine.controls().find((c) => c.id === 'R1').value);
});
