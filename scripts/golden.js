// Golden file of the simulator (see test/golden/cases.js). Without --write it only says how
// many cases differ from the stored file; with --write it stores what the simulator says now.
//
//   node scripts/golden.js           compare
//   node scripts/golden.js --write   overwrite test/fixtures/sim-golden.json

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { computeAll } from '../test/golden/cases.js';
import { compareGolden } from '../test/golden/compare.js';

const file = new URL('../test/fixtures/sim-golden.json', import.meta.url);
const now = computeAll();

if (process.argv.includes('--write')) {
  mkdirSync(new URL('.', file), { recursive: true });
  writeFileSync(file, JSON.stringify(now, null, 1) + '\n');
  console.log(`Wrote ${Object.keys(now).length} cases to test/fixtures/sim-golden.json`);
} else {
  if (!existsSync(file)) {
    console.error('No golden file yet: run with --write');
    process.exit(1);
  }
  const stored = JSON.parse(readFileSync(file, 'utf8'));
  const differences = compareGolden(stored, now);
  for (const d of differences.slice(0, 20)) console.log(d);
  console.log(differences.length ? `${differences.length} difference(s)` : 'Same as the golden file');
  process.exit(differences.length ? 1 : 0);
}
