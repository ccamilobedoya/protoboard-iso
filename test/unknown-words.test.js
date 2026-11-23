// A part the kit does not have, asked for in the words people use (src/parts/resolve.js, nearOf):
// the common asks are matched on the words the name contains, in English and Spanish, so a size or
// a voltage after the name still gets the useful "Nearest it has" and not a closest name.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSpec } from '../src/layout.js';
import { formatIssue } from '../src/index.js';

const problem = (name) => validateSpec({ parts: [{ id: 'X1', part: name }], nets: [] }).problems.find((p) => p.code === 'UNKNOWN_PART_NAME');

test('unknown words: each common ask is found inside a longer name, in English and Spanish', () => {
  const asks = {
    'LED strip 12V': 'ledstrip',
    'LED strip': 'ledstrip',
    'tira de LED': 'ledstrip',
    'tira de LEDs 12 V': 'ledstrip',
    'WS2812B strip': 'ledstrip',
    parlante: 'speaker',
    'parlante 8 ohm': 'speaker',
    'speaker 0.5W': 'speaker',
    servo: 'servo',
    'micro servo SG90': 'servo',
    transformador: 'transformer',
    'transformador 12V': 'transformer',
    'pantalla LCD': 'lcd',
    'LCD 16x2 I2C': 'lcd',
  };
  for (const [name, variant] of Object.entries(asks)) {
    const p = problem(name);
    assert.equal(p?.params.variant, variant, `${name}: ${p && formatIssue(p)}`);
    assert.match(formatIssue(p, 'en'), /Nearest it has/, name);
    assert.match(formatIssue(p, 'es'), /Lo más cercano que tiene/, name);
    assert.doesNotMatch(formatIssue(p, 'en'), /Closest:/, name);
  }
});

test('unknown words: "LED strip 12V" no longer answers "Closest: led"', () => {
  assert.match(formatIssue(problem('LED strip 12V'), 'en'), /an addressable strip is not in the kit/);
});

test('unknown words: a word that is an ask only alone, and names with no ask in them, keep the closest names', () => {
  assert.equal(problem('pin header strip').params.variant, undefined);
  assert.match(formatIssue(problem('pin header strip'), 'en'), /Closest: header/);
  assert.equal(problem('strip').params.variant, 'ledstrip', 'the whole name "strip" is still the ask');
  assert.equal(problem('LEDX').params.variant, undefined);
});

// The common asks a round of assistants met with no answer ("28BYJ-48 … has no part with a close
// name"): each says what the kit has near it, or that nothing is near, in both languages.
test('unknown words: a stepper, screens, keypad, joystick, radios, SD card, clock and load cell say what is near', () => {
  const asks = {
    '28BYJ-48': 'stepper',
    'stepper motor 28BYJ-48': 'stepper',
    'motor paso a paso': 'stepper',
    'NEMA 17': 'stepper',
    'OLED 128x64': 'oled',
    'pantalla OLED SSD1306': 'oled',
    'keypad 4x4': 'keypad',
    'teclado matricial': 'keypad',
    joystick: 'joystick',
    'KY-023': 'joystick',
    'HC-05': 'bluetooth',
    'modulo bluetooth': 'bluetooth',
    'ESP-01': 'wifi',
    'módulo WiFi ESP8266': 'wifi',
    'SD card': 'sdcard',
    'micro SD': 'sdcard',
    'tarjeta SD': 'sdcard',
    'DS3231 RTC': 'rtc',
    'reloj de tiempo real': 'rtc',
    'load cell 5kg': 'loadcell',
    'celda de carga': 'loadcell',
    HX711: 'loadcell',
  };
  for (const [name, variant] of Object.entries(asks)) {
    const p = problem(name);
    assert.equal(p?.params.variant, variant, `${name}: ${p && formatIssue(p)}`);
    assert.match(formatIssue(p, 'en'), /Nearest it has|Nothing near/, name);
    assert.match(formatIssue(p, 'es'), /Lo más cercano que tiene|Nada cercano/, name);
    assert.doesNotMatch(formatIssue(p, 'en'), /Closest:|no part with a close name/, name);
  }
  assert.match(formatIssue(problem('28BYJ-48'), 'en'), /a DC motor \(type motor\), which turns but does not step; a ULN2003 .* only as a wiring exercise/);
  for (const name of ['SD card', 'DS3231', 'load cell']) assert.match(formatIssue(problem(name), 'en'), /Nothing near/, name);
  // The words that are an ask only alone stay so: "BLE" or "SD" inside another name is not one.
  assert.equal(problem('SDX').params.variant, undefined);
});
