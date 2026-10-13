import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resistorBands } from '../src/parts/types/resistor.js';
import { capacitorCode, canSize } from '../src/parts/types/capacitor.js';

test('resistor colour code, 4 bands', () => {
  assert.deepEqual(resistorBands(4700, 5, 4), ['yellow', 'violet', 'red', 'gold']);
  assert.deepEqual(resistorBands(330, 5, 4), ['orange', 'orange', 'brown', 'gold']);
  assert.deepEqual(resistorBands(10, 5, 4), ['brown', 'black', 'black', 'gold']);
  assert.deepEqual(resistorBands(1e6, 10, 4), ['brown', 'black', 'green', 'silver']);
  assert.deepEqual(resistorBands(0.47, 5, 4), ['yellow', 'violet', 'silver', 'gold']);
  assert.deepEqual(resistorBands(220, 20, 4), ['red', 'red', 'brown']);
});

test('resistor colour code, 5 bands', () => {
  assert.deepEqual(resistorBands(330, 1, 5), ['orange', 'orange', 'black', 'black', 'brown']);
  assert.deepEqual(resistorBands(4700, 1, 5), ['yellow', 'violet', 'black', 'brown', 'brown']);
  assert.deepEqual(resistorBands(100e3, 1, 5), ['brown', 'black', 'black', 'orange', 'brown']);
});

test('ceramic capacitor code', () => {
  assert.equal(capacitorCode(100e-9), '104');
  assert.equal(capacitorCode(10e-9), '103');
  assert.equal(capacitorCode(4.7e-9), '472');
  assert.equal(capacitorCode(22e-12), '22');
  assert.equal(capacitorCode(100e-12), '101');
});

test('electrolytic size grows with C·V', () => {
  assert.equal(canSize(10e-6, 25).diameter, 5);
  assert.equal(canSize(100e-6, 25).diameter, 6.3);
  assert.equal(canSize(1000e-6, 16).diameter, 10);
});
