import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseValue, formatValue } from '../src/core/units.js';

const close = (a, b) => assert.ok(Math.abs(a - b) <= Math.abs(b) * 1e-9, `${a} ≈ ${b}`);

test('parseValue reads the usual notations', () => {
  close(parseValue('330'), 330);
  close(parseValue('4k7'), 4700);
  close(parseValue('4.7k'), 4700);
  close(parseValue('4,7k'), 4700);
  close(parseValue('2R2'), 2.2);
  close(parseValue('1M'), 1e6);
  close(parseValue('100n'), 100e-9);
  close(parseValue('100nF'), 100e-9);
  close(parseValue('470u'), 470e-6);
  close(parseValue('470µF'), 470e-6);
  close(parseValue('10 kΩ'), 10e3);
  close(parseValue(220), 220);
});

test('parseValue rejects nonsense', () => {
  assert.ok(Number.isNaN(parseValue('abc')));
  assert.ok(Number.isNaN(parseValue('k7')));
  assert.ok(Number.isNaN(parseValue('4.7k7')));
  assert.ok(Number.isNaN(parseValue(undefined)));
});

test('formatValue picks the prefix and the decimal separator', () => {
  assert.equal(formatValue(4700, 'Ω'), '4.7 kΩ');
  assert.equal(formatValue(4700, 'Ω', { decimal: ',' }), '4,7 kΩ');
  assert.equal(formatValue(330, 'Ω'), '330 Ω');
  assert.equal(formatValue(100e-9, 'F'), '100 nF');
  assert.equal(formatValue(1e-3, 'F'), '1 mF');
  assert.equal(formatValue(470e-6, 'F'), '470 µF');
});
