// Development boards (src/parts/modules.js): placement across the channel by pin 1, the
// Arduino UNO beside the board with its Dupont leads, their cards, and parts resting on others.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCircuit, checkCircuit, renderCircuit } from '../src/index.js';
import { renderPage } from '../src/page.js';
import { supportsFirst } from '../src/render/scene.js';

const example = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));
const codes = (issues) => issues.map((i) => i.code);
const holesOf = (circuit, id) => {
  const part = buildCircuit(circuit).parts.find((p) => p.id === id);
  return Object.fromEntries(part.pinNames.map((n, i) => [n, part.holes[i].id]));
};
const pageData = (html) => JSON.parse(html.match(/id="page-data">([\s\S]*?)<\/script>/)[1]);

test('an ESP32 DevKit straddles the channel from pin 1, its rows rowSpacing holes apart', () => {
  const devkit = (extra) => ({ parts: [{ id: 'U1', type: 'module', part: 'ESP32-DEVKIT', ...extra }] });
  const h = holesOf(devkit({ pin1: 'c5' }), 'U1');
  assert.equal(Object.keys(h).length, 30);
  assert.deepEqual([h.EN, h.VIN, h['3V3'], h.D23], ['c5', 'c19', 'j19', 'j5'], 'down one row from pin 1, back along the other, 9 holes behind');
  assert.equal(holesOf(devkit({ pin1: 'b5', rowSpacing: 10 }), 'U1').D23, 'j5', 'a board with rows 1.0" apart');
  assert.equal(holesOf(devkit({ pin1: 'h40' }), 'U1').D23, 'a40', 'pin 1 behind the channel: turned round');
  const bad = checkCircuit(devkit({ pin1: 'e5' })).issues.find((i) => i.code === 'BAD_PIN1_MODULE');
  assert.equal(bad.params.rows, 'a, b, c, h, i, j', 'the error says where pin 1 can go');
  // Its unused pins are not a mistake: no "nothing else touches it" note for each.
  assert.ok(!codes(checkCircuit(example('esp32-led.json')).issues).includes('FLOATING_PIN'));
  assert.equal(holesOf({ parts: [{ id: 'U2', type: 'module', part: 'esp32-c3', pin1: 'd40' }] }, 'U2')['5V'], 'd40', 'other names of a board');
});

test('an Arduino UNO lies beside the board and wires only the pins listed', () => {
  const uno = (pins, extra) => ({ parts: [{ id: 'A1', type: 'module', part: 'UNO', pins, ...extra }] });
  assert.deepEqual(holesOf(uno({ d13: 'j20', GND: 'T-27' }), 'A1'), { D13: 'j20', GND: 'T-27' });
  assert.deepEqual(codes(checkCircuit(uno({ D14: 'j20' })).issues), ['UNKNOWN_PIN']);
  assert.deepEqual(codes(checkCircuit(uno(undefined, { pin1: 'a1' })).issues), ['MODULE_PINS']);
  const [a1] = buildCircuit(uno({ D13: 'j20', GND: 'T-27', '5V': 'T+3' })).parts;
  assert.deepEqual(Object.keys(a1.def.params.colors), ['D13', 'GND', '5V']);
  assert.equal(a1.def.params.colors.GND, '#2b2b2e', 'ground leads are black');
  assert.equal(a1.def.params.colors['5V'], '#d33a32', 'and 5 V red');
  assert.ok(a1.built.anchor.y > buildCircuit(uno({ D13: 'j20' })).board.spec.size.width, 'behind the board by default');
  assert.deepEqual(codes(checkCircuit(uno({ D13: 'j20' }, { side: 'left' })).issues), ['UNKNOWN_KIND']);
  for (const view of ['front', 'back']) assert.doesNotMatch(renderCircuit(example('uno-led.json'), { view }).svg, /NaN|undefined/);
});

test('the DESPI-C02 e-paper adapter lies beside the board, its RESE switch and panel as asked', () => {
  const despi = (pins, extra) => ({ parts: [{ id: 'EP1', type: 'module', part: 'DESPI-C02', pins, ...extra }] });
  assert.deepEqual(holesOf(despi({ busy: 'j20', 'd/c': 'j18', '3.3V': 'j24' }), 'EP1'), { BUSY: 'j20', 'D/C': 'j18', '3.3V': 'j24' });
  assert.deepEqual(codes(checkCircuit(despi({ MOSI: 'j20' })).issues), ['UNKNOWN_PIN']);
  assert.deepEqual(codes(checkCircuit(despi({ BUSY: 'j20' }, { rese: '3' })).issues), ['UNKNOWN_KIND']);
  const [ep] = buildCircuit(despi({ GND: 'j23', '3.3V': 'j24', SCK: 'j16' })).parts;
  assert.equal(ep.def.params.rese, '2.2', 'as sold');
  assert.equal(ep.def.params.colors.GND, '#2b2b2e', 'ground black');
  assert.equal(ep.def.params.colors['3.3V'], buildCircuit({ parts: [{ id: 'A', type: 'module', part: 'UNO', pins: { '3V3': 'j1' } }] }).parts[0].def.params.colors['3V3'], '3.3 V orange, as on the other boards');
  assert.ok(ep.built.anchor.y > buildCircuit(despi({ SCK: 'j16' })).board.spec.size.width, 'behind the board by default');
  const plain = renderCircuit(despi({ SCK: 'j16' })).svg;
  const withPanel = renderCircuit(despi({ SCK: 'j16' }, { panel: true })).svg;
  assert.ok(withPanel.length > plain.length, 'the panel is drawn');
  for (const view of ['front', 'back']) assert.doesNotMatch(renderCircuit(example('epaper-esp32.json'), { view }).svg, /NaN|undefined/);
  const card = pageData(renderPage(example('epaper-esp32.json'), { lang: 'es' }).html).parts.EP1;
  assert.match(card.pins.find((l) => l.startsWith('BUSY')), /activo en bajo/);
});

test('a board\'s card lists the pins in use with their notes', () => {
  const { html } = renderPage(example('esp32-led.json'), { lang: 'es' });
  const { pins } = pageData(html).parts.U1;
  assert.deepEqual(pins.slice(0, 2), [
    'D13 → c17, columna 17 (filas a–e) — con R1 (1) · GPIO13 · ADC2 (no con Wi-Fi) · táctil',
    'GND → c18, columna 18 (filas a–e) — con W2 (1) · tierra (0 V)',
  ]);
  assert.equal(pins.at(-1), 'y 28 pines más, sin nada conectado');
  const uno = pageData(renderPage(example('uno-led.json'), { lang: 'en' }).html).parts.A1;
  assert.match(uno.pins[0], /^D13 → j20, .* · SPI \(SCK\) · on-board LED L$/);
  assert.equal(uno.pins.length, 2, 'a UNO lists every pin it wires');
});

test('a part resting on another is painted after it, whatever their centres say', () => {
  const pcb = { name: 'pcb' };
  const strip = { name: 'strip' };
  const chip = { name: 'chip', on: pcb };
  const can = { name: 'can', on: chip };
  pcb.on = [strip];
  const order = supportsFirst([can, chip, pcb, strip, { name: 'other' }].map((p) => ({ p }))).map((e) => e.p.name);
  assert.ok(order.indexOf('strip') < order.indexOf('pcb') && order.indexOf('pcb') < order.indexOf('chip') && order.indexOf('chip') < order.indexOf('can'), order.join(' '));
});
