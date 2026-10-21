import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPin } from '../src/parts/pin-names.js';
import { pinsOf } from '../src/parts/resolve.js';

const ne555 = pinsOf({ type: 'ic', part: 'NE555' });
const devkit = pinsOf({ type: 'module', part: 'ESP32-DEVKIT' });
const uno = pinsOf({ type: 'module', part: 'UNO' });

test('findPin: exact names first, ignoring case', () => {
  assert.equal(findPin(['anode', 'cathode'], 'ANODE'), 'anode');
  assert.equal(findPin(['1', '2'], '2'), '2');
  assert.equal(findPin(['1', 'W', '3'], '2'), 'W'); // the middle pin of a potentiometer
  assert.equal(findPin(pinsOf({ type: 'module', part: 'DESPI-C02' }), 'RES'), 'RES'); // a real pin, not RESET
});

test('findPin: synonyms of polarity, transistors, regulators and chips', () => {
  assert.equal(findPin(['anode', 'cathode'], 'K'), 'cathode');
  assert.equal(findPin(['anode', 'cathode'], 'a'), 'anode');
  assert.equal(findPin(['A', 'K'], 'cathode'), 'K');
  assert.equal(findPin(['E', 'B', 'C'], 'collector'), 'C');
  assert.equal(findPin(['G', 'D', 'S'], 'gate'), 'G');
  assert.equal(findPin(['IN', 'GND', 'OUT'], 'VOUT'), 'OUT');
  assert.equal(findPin(ne555, 'DISCH'), 'DIS');
  assert.equal(findPin(ne555, 'threshold'), 'THR');
  assert.equal(findPin(ne555, 'VDD'), 'VCC');
  assert.equal(findPin(pinsOf({ type: 'ic', part: 'CD4017' }), 'GND'), 'VSS');
  assert.equal(findPin(['+', '-'], '−'), '-'); // a typographic minus
});

test('findPin: GPIO numbers on development boards', () => {
  assert.equal(findPin(devkit, 'GPIO4'), 'D4');
  assert.equal(findPin(devkit, 'IO23'), 'D23');
  assert.equal(findPin(devkit, '3.3V'), '3V3');
  assert.equal(findPin(pinsOf({ type: 'module', part: 'ESP32-C3-SUPERMINI' }), 'D4'), 'GPIO4');
  assert.equal(findPin(uno, '13'), 'D13');
  assert.equal(findPin(uno, 'A0'), 'A0');
});

test('findPin: nothing when the guess is unknown or not unique', () => {
  assert.equal(findPin(['1', '2'], 'A'), undefined);
  assert.equal(findPin(['OUT1', 'IN1-', 'IN1+', 'GND', 'IN2+', 'IN2-', 'OUT2', 'VCC'], 'OUT'), undefined); // LM358: which one?
  assert.equal(findPin(['IN1', 'IN2'], 'IN'), undefined);
  assert.equal(findPin(['anode', 'cathode'], ''), undefined);
});
