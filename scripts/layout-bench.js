// The layout algorithm against a fixed set of specs, to measure a change before and after it
// (docs/en/layout.md, "Changing the algorithm").  npm run layout-bench [-- spec.json …]
//
// One line per spec: verdict, nets check, parts placed, jumpers, board columns, relayouts, time,
// and every blocking item or failure. Without arguments it runs examples/layout/*.json.
import { readdirSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { autoLayout } from '../src/layout.js';
import { formatIssue } from '../src/index.js';

const dir = new URL('../examples/layout/', import.meta.url).pathname;
const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => dir + f);
let failed = 0;
for (const file of files) {
  const r = autoLayout(JSON.parse(readFileSync(file, 'utf8')));
  if (r.invalid) {
    failed++;
    console.log(`${basename(file)}: INVALID SPEC`);
    for (const p of r.problems) console.log(`  ✖ ${formatIssue(p, 'en')}`);
    continue;
  }
  const ok = r.check.ok && r.review.verdict === 'approved' && !r.problems.length;
  if (!ok) failed++;
  console.log(`${basename(file)}: ${ok ? 'APPROVED' : 'CHANGES'} · nets ${r.check.ok ? 'ok' : 'WRONG'} · ${r.placed.length} parts · ${r.wires} jumpers · ${r.columns} columns · ${r.tries} tries · ${r.ms} ms`);
  for (const p of r.problems) console.log(`  ✖ ${formatIssue(p, 'en')}`);
  for (const m of r.check.missing) console.log(`  ✖ net ${m.net}: missing ${m.pins.join(', ')}`);
  for (const s of r.check.shorted) console.log(`  ✖ nets ${s.nets.join(' + ')} shorted`);
  for (const b of r.review.blocking) console.log(`  ✖ ${formatIssue(b, 'en')}`);
}
process.exitCode = failed ? 1 : 0;
