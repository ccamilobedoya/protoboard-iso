// The review's verdict and every part's visible share in both views, for every recipe as layout
// places it, stay what they were: the raster that measures them (src/render/coverage.js) and the
// builds the review reuses (src/circuit/build.js) were made lighter for long boards, never
// different. After an intended change of a placement or of the drawing, write the figures again:
//   PROTOBOARD_WRITE=1 node --test test/recipe-visibility.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { autoLayout } from '../src/layout.js';
import { RECIPES, expandRecipe } from '../src/recipes/index.js';
import { inspectCircuit } from '../src/index.js';
import { review } from '../src/review.js';

const FILE = new URL('./fixtures/recipe-visibility.json', import.meta.url);

function measure() {
  const out = {};
  for (const name of Object.keys(RECIPES)) {
    const { circuit } = autoLayout(expandRecipe(name).spec);
    const v = review(circuit, { views: ['front', 'back'] });
    const visible = {};
    for (const view of ['front', 'back']) for (const p of inspectCircuit(circuit, { view }).parts) visible[`${p.id}@${view}`] = Math.round(p.visible * 1e4) / 1e4;
    out[name] = { verdict: v.verdict, blocking: v.blocking.map((b) => b.code), visible };
  }
  return out;
}

test('every recipe keeps its review verdict and every visible share in both views', () => {
  const now = measure();
  if (process.env.PROTOBOARD_WRITE === '1') writeFileSync(FILE, `${JSON.stringify(now, null, 1)}\n`);
  const stored = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.deepEqual(Object.keys(now).sort(), Object.keys(stored).sort(), 'one entry per recipe');
  for (const name of Object.keys(stored)) assert.deepEqual(now[name], stored[name], name);
});
