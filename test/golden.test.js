// The simulator says today what it said when the golden file was written (see
// test/golden/cases.js). After an intended change of results: node scripts/golden.js --write,
// and say why in the commit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { goldenCases, computeGolden } from './golden/cases.js';
import { compareGolden } from './golden/compare.js';

const stored = JSON.parse(readFileSync(new URL('./fixtures/sim-golden.json', import.meta.url), 'utf8'));

test('golden: the same cases as the stored file', () => {
  assert.deepEqual(goldenCases().map((c) => c.name).sort(), Object.keys(stored).sort());
});

for (const c of goldenCases()) {
  test(`golden: ${c.name}`, () => {
    const differences = compareGolden(stored[c.name], computeGolden(c));
    assert.deepEqual(differences.slice(0, 10), [], `${differences.length} difference(s)`);
  });
}
