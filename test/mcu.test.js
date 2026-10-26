// Microcontroller boards (src/sim/devices/mcu.js, phase M1 of docs/en/microcontrollers.md): each
// GPIO in the state its `io` asks for, against the datasheets' numbers (models.js, MCUS).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulate } from '../src/sim/index.js';
import { MCUS } from '../src/sim/models.js';
import { autoLayout } from '../src/layout.js';
import { expandRecipe } from '../src/recipes/index.js';

const codes = (issues) => issues.map((i) => i.code);
const laid = (spec) => {
  const r = autoLayout({ board: 'auto', ...spec });
  assert.equal(r.status, 'done');
  return r.circuit;
};
const withIo = (circuit, id, io, extra = {}) => ({ ...circuit, parts: circuit.parts.map((p) => (p.id === id ? { ...p, program: undefined, ...extra, io } : p)) });
// The recipes' boards run a program (phase M2); these tests fix the pins with io instead (M1).
const fixed = (name, io) => withIo(laid(expandRecipe(name).spec), 'U1', io);

test('ESP32 output HIGH: 3.3 V behind its output resistance; the board on USB is the only source', () => {
  const circuit = fixed('esp32-led', { D13: 'high' });
  const r = simulate(circuit);
  assert.ok(r.ok, JSON.stringify(r.issues));
  const pin = r.parts.U1.pins.find((x) => x.name === 'D13');
  assert.equal(pin.mode, 'output');
  // VOH = VDD − I·R (datasheet: 0.8·VDD at 40 mA → 17 Ω).
  assert.ok(Math.abs(pin.voltage - (3.3 - pin.current * MCUS.esp32.outputResistance)) < 1e-3, `${pin.voltage} at ${pin.current}`);
  assert.ok(Math.abs(r.parts.D1.current - pin.current) < 1e-6, 'what leaves D13 goes through the LED');
  assert.ok(pin.current > 5e-3 && pin.current < 10e-3, `LED current ${pin.current}`);
  // USB gives the chip's own current, the regulator's and the LED's.
  const usb = r.parts.U1.usb.current;
  assert.ok(Math.abs(usb - (MCUS.esp32.own + MCUS.esp32.regulator.quiescent + pin.current)) < 2e-3, `USB ${usb}`);
  assert.equal(r.parts.U1.kind, 'MCU');
  // LOW: the LED is off.
  assert.ok(Math.abs(simulate(withIo(circuit, 'U1', { D13: 'low' })).parts.D1.current) < 1e-6);
});

test('ESP32 input with pull-up: reads 1 released, 0 pressed, through its 45 kΩ', () => {
  const circuit = fixed('esp32-button', { D27: 'input_pullup' });
  const released = simulate(circuit).parts.U1.pins.find((x) => x.name === 'D27');
  assert.deepEqual([released.mode, released.pull, released.read], ['input', 'up', 1]);
  assert.ok(released.voltage > 3.29);
  const pressed = simulate({ ...circuit, parts: circuit.parts.map((p) => (p.id === 'S1' ? { ...p, pressed: true } : p)) }).parts.U1.pins.find((x) => x.name === 'D27');
  assert.equal(pressed.read, 0);
  // Out of the pin (positive), from the rail through the pull-up into the button.
  assert.ok(Math.abs(pressed.current - 3.3 / MCUS.esp32.pull) < 1e-6, `pull-up current ${pressed.current}`);
  // Without the pull-up nothing holds it: no 0 or 1 to read from a pin left alone.
  const loose = simulate(withIo(circuit, 'U1', { D27: 'input' })).parts.U1.pins.find((x) => x.name === 'D27');
  assert.equal(loose.pull, null);
});

test('Arduino UNO: 5 V logic, VOH = 5 V − I·40 Ω; its GND only through the GND pin', () => {
  const circuit = JSON.parse(readFileSync(new URL('../examples/uno-led.json', import.meta.url), 'utf8'));
  const r = simulate(circuit);
  assert.ok(r.ok, JSON.stringify(r.issues));
  const pin = r.parts.A1.pins.find((x) => x.name === 'D13');
  // The logic rail is the USB's 5 V, less the cable's drop.
  assert.ok(Math.abs(r.parts.A1.vdd - (5 - r.parts.A1.usb.current * MCUS.uno.usbResistance)) < 1e-3);
  assert.ok(Math.abs(pin.voltage - (r.parts.A1.vdd - pin.current * MCUS.uno.outputResistance)) < 1e-3);
  assert.ok(Math.abs(r.parts.D1.current - pin.current) < 1e-6);
});

test('5 V on an ESP32 pin: its protection diodes conduct, and the page says so', () => {
  const circuit = laid({
    parts: [
      { id: 'U1', part: 'ESP32-DEVKIT', io: { D13: 'input' } }, // on VIN's side of the board
      { id: 'R1', type: 'resistor', value: '1k' },
    ],
    nets: [['U1.VIN', 'R1.1'], ['R1.2', 'U1.D13']],
  });
  const r = simulate(circuit);
  assert.ok(r.ok, JSON.stringify(r.issues));
  assert.ok(codes(r.issues).includes('SIM_PIN_OVERVOLTAGE'), JSON.stringify(r.issues));
  const pin = r.parts.U1.pins.find((x) => x.name === 'D13');
  assert.ok(pin.voltage > 3.3 + 0.3 && pin.voltage < 4.2, `clamped at ${pin.voltage}`);
  assert.ok(-pin.current > 0.5e-3, `current into the pin ${pin.current}`);
});

test('io mistakes are reported and left out: an unknown pin, an unknown state, an output on an input-only pin', () => {
  const circuit = fixed('esp32-led', {});
  const r = simulate(withIo(circuit, 'U1', { D13: 'high', D99: 'high', D27: 'sideways', D34: 'high' }));
  assert.ok(r.ok);
  assert.deepEqual(codes(r.issues).filter((c) => c.startsWith('SIM_PIN')).sort(), ['SIM_PIN_INPUT_ONLY', 'SIM_PIN_STATE', 'SIM_PIN_UNKNOWN']);
  // A GPIO number or its GPIO name works as well as the printed name.
  for (const key of ['13', 'GPIO13']) assert.ok(simulate(withIo(circuit, 'U1', { [key]: 'high' })).parts.D1.current > 5e-3, key);
});

test('a board with usb: false is no source; other modules stay unsupported', () => {
  const circuit = fixed('esp32-led', {});
  assert.deepEqual(codes(simulate(withIo(circuit, 'U1', { D13: 'high' }, { usb: false })).issues), ['SIM_NO_SUPPLY']);
  const epaper = JSON.parse(readFileSync(new URL('../examples/epaper-esp32.json', import.meta.url), 'utf8'));
  const r = simulate(epaper);
  assert.ok(r.ok);
  const adapter = epaper.parts.find((p) => p.part === 'DESPI-C02');
  assert.ok(r.parts[adapter.id].unsupported, 'the DESPI-C02 is drawn only');
});
