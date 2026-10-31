// What boards and regulators become in Falstad (devices/mcu.js, devices/regulator.js) and how the
// layout names the rails of the double board. Only the export is checked here; the comparison with
// Falstad's own results is test/falstad.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compile } from '../src/sim/compile.js';
import { createEngine } from '../src/sim/engine.js';
import { toFalstad } from '../src/sim/falstad.js';

const example = (file) => JSON.parse(readFileSync(new URL(`../examples/${file}`, import.meta.url), 'utf8'));
const exportCircuit = (circuit) => {
  const { program } = compile(circuit);
  return toFalstad(program, { timeConstants: createEngine(program).timeConstants() });
};
const lines = (text) => text.trim().split('\n').map((l) => l.split(' '));
const labels = (text) => lines(text).filter((t) => t[0] === '207').map((t) => t[6]);

test('falstad export: an ESP32 on USB is a source, its grounds are one net, a high pin is a source', () => {
  const { text, notes } = exportCircuit(example('esp32-two-boards.json'));
  const sources = lines(text).filter((t) => t[0] === 'v');
  assert.ok(sources.some((t) => t[8] === '5'), 'USB 5 V');
  assert.ok(sources.filter((t) => t[8] === '3.3').length >= 2, 'the 3.3 V rail and the high pin');
  assert.ok(lines(text).some((t) => t[0] === 'r' && t[6] === '17'), 'a pin behind its output resistance');
  assert.ok(lines(text).some((t) => t[0] === 'r' && t[6] === '220') && lines(text).some((t) => t[0] === '162'), "R1 and the LED hang from the pin's source");
  assert.ok(notes.some((n) => n.code === 'falstad.mcu' && n.params.part === 'U1'));
  assert.ok(!notes.some((n) => n.code === 'falstad.missing'));
  // GND and GND2 are joined: the strips they sit on have no label of their own (one net).
  const gnd = labels(text).filter((l) => l === '15:f-j' || l === '15:p-t');
  assert.ok(gnd.length <= 1, `two labels for one ground: ${gnd}`);
});

test('falstad export: a program freezes the pins and says so, a PWM is a square wave with its duty', () => {
  const circuit = example('esp32-two-boards.json');
  circuit.parts.find((p) => p.id === 'U1').program = 'void setup(){ pinMode(4, OUTPUT); } void loop(){ analogWrite(4, 64); delay(10); }';
  delete circuit.parts.find((p) => p.id === 'U1').io;
  const { text, notes } = exportCircuit(circuit);
  assert.ok(notes.some((n) => n.code === 'falstad.program'));
  const square = lines(text).find((t) => t[0] === 'v' && t[6] === '2');
  assert.ok(square, 'a square-wave source');
  assert.ok(Math.abs(Number(square[11]) - 0.25) < 0.02, `duty ${square[11]}`);
});

test('falstad export: a 7805 is an ideal 5 V source, no longer left out', () => {
  const { text, notes } = exportCircuit(example('battery-regulator.json'));
  assert.ok(lines(text).some((t) => t[0] === 'v' && t[8] === '5'));
  assert.ok(notes.some((n) => n.code === 'falstad.regulator' && n.params.part === 'U1' && n.params.voltage.value === 5));
  assert.ok(!notes.some((n) => n.code === 'falstad.missing' && n.params.part === 'U1'));
});

test('falstad layout: the rails of the double board are rails for naming', () => {
  const circuit = example('esp32-two-boards.json');
  circuit.supplies = [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'U+', negative: 'U-' }];
  circuit.parts = [
    { id: 'R1', type: 'resistor', value: '1k', pins: ['U+4', 'k8'] },
    { id: 'R2', type: 'resistor', value: '1k', pins: ['l8', 'U-9'] },
  ];
  delete circuit.spec;
  const { text } = exportCircuit(circuit);
  assert.ok(labels(text).includes('U\\p'), `labels: ${labels(text)}`);
});
