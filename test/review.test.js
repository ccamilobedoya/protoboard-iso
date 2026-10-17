import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { review, formatReview, t, formatIssue } from '../src/index.js';

const example = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));

test('the teaching examples are approved; the mistakes example is not', () => {
  for (const name of ['led-resistor.json', 'voltage-divider.json', 'parts-showcase.json', 'battery-regulator.json', 'more-parts.json']) assert.equal(review(example(name)).verdict, 'approved', name);
  const r = review(example('common-mistakes.json'));
  assert.equal(r.verdict, 'changes');
  const codes = r.blocking.map((p) => p.code);
  assert.ok(codes.includes('HOLE_OCCUPIED') && codes.includes('SPAN_TOO_SHORT') && codes.includes('PINS_SAME_NODE'));
});

test('a part hidden from every view blocks a lesson, once; hidden from one view is a note', () => {
  // R1 sits between two tall capacitors: C1 hides it from the front, C2 from the back.
  const boxedIn = {
    parts: [
      { id: 'R1', type: 'resistor', value: '1k', pins: ['h20', 'h24'] },
      { id: 'C1', type: 'capacitor', value: '1000u', voltage: 16, pins: ['d27', 'd29'] },
      { id: 'C2', type: 'capacitor', value: '1000u', voltage: 16, pins: ['T+17', 'T+19'] },
    ],
  };
  const r = review(boxedIn);
  assert.equal(r.blocking.filter((p) => p.code === 'PART_HIDDEN' && p.params.part === 'R1').length, 1);
  assert.ok(review(example('led-resistor.json')).advisory.some((p) => p.code === 'PART_HIDDEN' && p.view === 'front'));
});

test('the draft profile only blocks errors and warnings', () => {
  const crowded = { clearance: 5, parts: [{ id: 'D1', type: 'led', pins: ['h10', 'h11'] }, { id: 'D2', type: 'led', pins: ['h13', 'h14'] }] };
  assert.equal(review(crowded, { profile: 'lesson' }).verdict, 'changes');
  assert.equal(review(crowded, { profile: 'draft' }).verdict, 'approved');
});

test('the review text fills every placeholder', () => {
  for (const lang of ['en', 'es']) assert.doesNotMatch(formatReview(review(example('common-mistakes.json'), { lang }), lang, { t, formatIssue }), /\{\w+\}/);
});

test('each blocking item names its parts and views; explain gives the rules', () => {
  const r = review(example('common-mistakes.json'), { explain: true });
  const occupied = r.blocking.find((p) => p.code === 'HOLE_OCCUPIED');
  assert.deepEqual(occupied.parts.sort(), ['D1', 'R2']);
  assert.ok(r.rules.blocks.includes('TOO_CLOSE') && r.rules.hiddenEverywhere);
  const text = formatReview(r, 'es', { t, formatIssue });
  assert.match(text, /Bloquea: todo error y aviso/);
  assert.match(text, /\[componentes D1, R2\]|\[componentes R2, D1\]/);
  assert.equal(review(example('led-resistor.json')).rules, undefined, 'rules only when asked');
});
