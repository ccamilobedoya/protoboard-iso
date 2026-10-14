// Every part says what it is, in every language of the kit; a circuit's own descriptions are
// checked for missing languages.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCircuit } from '../src/circuit/build.js';
import { checkCircuit, PART_NUMBERS } from '../src/index.js';
import { describeKeys, describePart } from '../src/parts/describe.js';
import { LANGUAGES } from '../src/i18n/index.js';

const samples = [
  { id: 'R1', type: 'resistor', value: '330', pins: ['a5', 'a9'] },
  { id: 'C1', type: 'capacitor', value: '100n', pins: ['a5', 'a7'] },
  { id: 'C2', type: 'capacitor', value: '100u', pins: { '+': 'a5', '-': 'a7' } },
  { id: 'RV1', type: 'potentiometer', value: '10k', pins: ['a5', 'a6', 'a7'] },
  { id: 'D2', type: 'led', pins: ['a5', 'a6'] },
  { id: 'S1', type: 'button', pins: ['e10', 'f10', 'e12', 'f12'] },
  { id: 'W1', type: 'wire', pins: ['a5', 'a9'] },
  { id: 'RV2', type: 'potentiometer', style: 'trimmer', value: '10k', pins: ['a5', 'a6', 'a7'] },
  { id: 'D3', type: 'zener', value: '5V1', pins: ['a5', 'a9'] },
  { id: 'L1', type: 'inductor', value: '100u', pins: ['a5', 'a9'] },
  { id: 'RT1', type: 'thermistor', value: '10k', pins: ['a5', 'a6'] },
  { id: 'LDR1', type: 'ldr', pins: ['a5', 'a7'] },
  { id: 'BZ1', type: 'buzzer', pins: ['a5', 'a8'] },
  { id: 'J1', type: 'header', count: 3, pin1: 'a5' },
  ...['AA', 'AAA', '18650', '9V', 'pouch'].map((format, i) => ({ id: `BT${i}`, type: 'battery', format, cells: 2, pins: { '+': 'T+3', '-': 'T-3' } })),
  { id: 'BT9', type: 'battery', format: 'AA', chemistry: 'nimh', pins: { '+': 'T+3', '-': 'T-3' } },
  { id: 'BT8', type: 'battery', format: '18650', chemistry: 'lifepo4', pins: { '+': 'T+3', '-': 'T-3' } },
  ...Object.entries(PART_NUMBERS).map(([number, e], i) => ({ id: `P${i}`, type: e.type, part: number, ...(e.type === 'ic' ? { pin1: 'f10' } : { pins: e.pins.map((_, k) => `a${10 + k}`) }) })),
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
