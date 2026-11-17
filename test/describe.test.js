// Every part says what it is, in every language of the kit; a circuit's own descriptions are
// checked for missing languages.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCircuit } from '../src/circuit/build.js';
import { checkCircuit, PART_NUMBERS } from '../src/index.js';
import { describeKeys, describePart } from '../src/parts/describe.js';
import { LANGUAGES } from '../src/i18n/index.js';
import { catalogEntry } from '../src/node/catalog.js';
import * as models from '../src/sim/models.js';

const samples = [
  { id: 'R1', type: 'resistor', value: '330', pins: ['j5', 'j9'] },
  { id: 'C1', type: 'capacitor', value: '100n', pins: ['j5', 'j7'] },
  { id: 'C2', type: 'capacitor', value: '100u', pins: { '+': 'j5', '-': 'j7' } },
  { id: 'RV1', type: 'potentiometer', value: '10k', pins: ['j5', 'j6', 'j7'] },
  { id: 'D2', type: 'led', pins: ['j5', 'j6'] },
  { id: 'S1', type: 'button', pins: ['f10', 'e10', 'f12', 'e12'] },
  { id: 'W1', type: 'wire', pins: ['j5', 'j9'] },
  { id: 'RV2', type: 'potentiometer', style: 'trimmer', value: '10k', pins: ['j5', 'j6', 'j7'] },
  { id: 'D3', type: 'zener', value: '5V1', pins: ['j5', 'j9'] },
  { id: 'L1', type: 'inductor', value: '100u', pins: ['j5', 'j9'] },
  { id: 'RT1', type: 'thermistor', value: '10k', pins: ['j5', 'j6'] },
  { id: 'LDR1', type: 'ldr', pins: ['j5', 'j7'] },
  { id: 'BZ1', type: 'buzzer', pins: ['j5', 'j8'] },
  { id: 'J1', type: 'header', count: 3, pin1: 'j5' },
  ...['AA', 'AAA', '18650', '9V', 'pouch'].map((format, i) => ({ id: `BT${i}`, type: 'battery', format, cells: 2, pins: { '+': 'T+3', '-': 'T-3' } })),
  { id: 'BT9', type: 'battery', format: 'AA', chemistry: 'nimh', pins: { '+': 'T+3', '-': 'T-3' } },
  { id: 'BT8', type: 'battery', format: '18650', chemistry: 'lifepo4', pins: { '+': 'T+3', '-': 'T-3' } },
  ...Object.entries(PART_NUMBERS).map(([number, e], i) => ({ id: `P${i}`, type: e.type, part: number, ...(e.type === 'ic' ? { pin1: 'e10' } : e.type === 'relay' ? { pins: Object.fromEntries(e.pins.map((n, k) => [n, `a${10 + 2 * k}`])) } : { pins: e.pins.map((_, k) => `a${10 + k}`) }) })),
];

test('every kind of part has its own description in every language', () => {
  for (const raw of samples) {
    const [part] = buildCircuit({ parts: [raw] }).parts;
    assert.ok(part, raw.id);
    const keys = describeKeys(part);
    assert.ok(keys.length, `${raw.type} ${raw.part ?? ''} has a description`);
    for (const lang of Object.keys(LANGUAGES)) {
      for (const key of keys) assert.ok(LANGUAGES[lang][`describe.${key}`], `describe.${key} in ${lang}`);
      assert.ok(describePart(part, lang).length > 40);
    }
  }
  const [led] = buildCircuit({ parts: [samples[4]] }).parts;
  assert.match(describePart(led, 'es'), /^LED: un diodo que emite luz/);
  assert.match(describePart(led, 'en'), /^LED: a diode that gives light/);
});

test('a description per language missing one is reported; a plain string is fine', () => {
  const issue = (description) => checkCircuit({ parts: [{ ...samples[0], description }] }).issues.find((i) => i.code === 'DESCRIPTION_LANGUAGE');
  assert.equal(issue({ en: 'Limits the LED current', es: 'Limita la corriente del LED' }), undefined);
  assert.equal(issue({ es: 'Limita la corriente del LED' }).params.missing, 'en');
  assert.equal(issue('Limita la corriente'), undefined, 'a plain string is the generic format, shown as it is');
  assert.equal(issue({ en: 'x', es: '  ' }).params.missing, 'es');
});

test('a development board is described as simulated, and no board text contradicts its limits', () => {
  const boards = ['ESP32-DEVKIT', 'ESP32-C3-SUPERMINI', 'UNO'];
  for (const board of boards) {
    for (const lang of Object.keys(LANGUAGES)) {
      const text = catalogEntry(board, lang).about;
      assert.doesNotMatch(text, /Not simulated|no se simula/i, `${board} ${lang}`);
      assert.match(text, lang === 'en' ? /simulator follows each pin/ : /simulador sigue cada pin/, `${board} ${lang}`);
    }
  }
  // The UNO's card gives the recommended current and the absolute maximum the simulator warns at.
  const { MCUS } = models;
  assert.equal(MCUS.uno.maxPin, 0.04);
  assert.match(LANGUAGES.en['describe.module.uno'], /about 20 mA.*40 mA is the absolute maximum/);
  assert.match(LANGUAGES.es['describe.module.uno'], /unos 20 mA.*40 mA es el máximo absoluto/);
  // The adapter board is the one module that is not simulated, and still says so.
  assert.match(LANGUAGES.en['describe.module.adapter'], /Not simulated yet/);
});
