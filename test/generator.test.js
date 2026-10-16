// The signal generator (stage 3, phase 8): its waves, the supply in a circuit file, the engine
// following it (against the textbook RC answer, solved apart), its controls, and the live page
// pacing time by its period.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { waveAt, peakOf } from '../src/sim/generator.js';
import { simulate, compile, createEngine } from '../src/sim/index.js';
import { toFalstad } from '../src/sim/falstad.js';
import { renderPage } from '../src/page.js';
import { samplesOf } from '../src/sim/recorder.js';

const rc = (supply) => ({
  supplies: [{ id: 'G1', kind: 'generator', frequency: 100, amplitude: 2.5, offset: 2.5, resistance: 0, waveform: 'square', ...supply }],
  parts: [
    { id: 'R1', type: 'resistor', value: '1k', pins: ['T+24', 'h24'] },
    { id: 'C1', type: 'capacitor', value: '1u', pins: ['f24', 'f25'] },
    { id: 'W1', type: 'wire', color: 'black', pins: ['j25', 'T-25'] },
  ],
});

test('generator: the waves start and turn where Falstad\'s do', () => {
  const g = (waveform) => ({ waveform, frequency: 50, amplitude: 10, offset: 1 });
  const T = 1 / 50;
  assert.equal(waveAt(g('sine'), 0), 1);
  assert.ok(Math.abs(waveAt(g('sine'), T / 4) - 11) < 1e-12);
  assert.equal(waveAt(g('square'), 0), 11, 'square starts high');
  assert.equal(waveAt(g('square'), 0.6 * T), -9);
  assert.equal(waveAt(g('triangle'), 0), -9, 'triangle starts at the bottom');
  assert.ok(Math.abs(waveAt(g('triangle'), T / 4) - 1) < 1e-12);
  assert.ok(Math.abs(waveAt(g('triangle'), T / 2) - 11) < 1e-12);
  assert.equal(peakOf(g('sine')), 11);
});

test('generator: a supply in the circuit file, 50 Ω unless given, checked', () => {
  const { program } = compile(rc({ resistance: undefined }));
  const [s] = program.supplies;
  assert.equal(s.internalResistance, 50);
  assert.deepEqual(s.generator, { waveform: 'square', frequency: 100, amplitude: 2.5, offset: 2.5 });
  assert.equal(s.voltage, 5, 'its value at t = 0');
  for (const bad of [{ frequency: 0 }, { waveform: 'sawtooth' }, { amplitude: -1 }]) {
    assert.deepEqual(compile(rc(bad)).issues.map((i) => i.code), ['SIM_BAD_SUPPLY'], JSON.stringify(bad));
  }
  const dc = simulate(rc());
  assert.equal(dc.supplies.G1.mode, 'GEN');
  assert.equal(dc.supplies.G1.peak, 5);
});

test('generator: an RC follows a square wave as the exponential charge and discharge say', () => {
  // τ = 1 ms, 100 Hz: 5 ms high (0 → 5 V), 5 ms low, from a discharged capacitor.
  const tau = 1e-3;
  const tr = simulate(rc(), { analysis: 'transient', start: 'zero', stop: 0.01, step: 1e-6, points: 2000 });
  assert.ok(tr.ok);
  const at = (t) => tr.parts.C1.voltage[tr.times.findIndex((x) => x >= t - 1e-12)];
  const high = 5 * (1 - Math.exp(-5e-3 / tau)); // at the end of the first half
  assert.ok(Math.abs(at(1e-3) - 5 * (1 - Math.exp(-1))) < 0.01, `63 % at τ: ${at(1e-3)}`);
  assert.ok(Math.abs(at(6e-3) - high * Math.exp(-1)) < 0.01, `falls to 37 % one τ into the low half: ${at(6e-3)}`);
});

test('generator: frequency and amplitude are controls; the period follows', () => {
  const engine = createEngine(compile(rc()).program);
  const fields = engine.controls().filter((c) => c.id === 'G1').map((c) => c.field);
  assert.deepEqual(fields, ['frequency', 'amplitude']);
  assert.deepEqual(engine.periods(), [0.01]);
  assert.ok(engine.set('G1', 'frequency', 1000));
  assert.deepEqual(engine.periods(), [0.001]);
});

test('generator: exported to Falstad as its own source; exact, one step ahead', () => {
  const { program } = compile(rc());
  const plain = toFalstad(program);
  assert.match(plain.text, /^v \d+ \d+ \d+ \d+ 0 2 100 2\.5 2\.5 0 0\.5$/m, 'square, 100 Hz, peak and offset');
  assert.deepEqual(plain.notes, []);
  const exact = toFalstad(program, { exact: true });
  const phase = Number(exact.text.match(/^v (?:\S+ ){9}(\S+) 0\.5$/m)[1]);
  assert.ok(Math.abs(phase - 2 * Math.PI * 100 * exact.step) < 1e-9);
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

test('page: with a generator time runs by its period, and the oscilloscope shows the wave', async (t) => {
  const circuit = { ...rc({ waveform: 'sine', offset: 0, amplitude: 5 }), page: { results: true } };
  const window = await loadPage(renderPage(circuit, { lang: 'es' }).html);
  if (!window) return t.skip('jsdom not installed');
  const live = window.protoboardLive;
  assert.ok(window.document.querySelector('nav .time'), 'time controls: it changes by itself');
  for (let k = 0; k < 50; k++) live.tick(40); // 2 s on the wall: 2 periods at one a second
  assert.ok(Math.abs(live.time - 0.02) < 0.002, `simulated time ${live.time}`);
  const v = samplesOf(live.recording('R1'), 'a', 0, 1).map(([, x]) => x);
  assert.ok(v.length > 100);
  // Xc = 1 / (2π · 100 Hz · 1 µF) ≈ 1.6 kΩ: R1 sees 5 V · 1 k / 1.88 k ≈ 2.7 V each way.
  assert.ok(Math.min(...v) < -2.2 && Math.max(...v) > 2.2 && Math.max(...v) < 2.8, `R1 sees the sine both ways: ${Math.min(...v)} … ${Math.max(...v)}`);
});
