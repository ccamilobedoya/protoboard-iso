// The layout algorithm against a fixed set of specs, to measure a change before and after it
// (docs/en/layout.md, "Changing the algorithm").
//   npm run layout-bench [-- spec.json …] [--save [file]] [--compare [file]]
//
// One line per spec: verdict, nets check, the metrics of scripts/layout-metrics.js, and every
// blocking item or failure. Without arguments it runs examples/layout/*.json and every recipe
// with its default values (src/recipes/): a recipe must come out ready in one call. A spec may
// carry "bench": { "expect": "changes", "why": "…" } for a case the algorithm cannot solve yet:
// ending in that status is not a failure. --save writes the metrics to a baseline (default
// .claude/state/layout-bench.json, not in git); --compare prints what changed against it.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { autoLayout } from '../src/layout.js';
import { formatIssue } from '../src/index.js';
import { RECIPES, expandRecipe } from '../src/recipes/index.js';
import { layoutMetrics } from './layout-metrics.js';

const root = new URL('../', import.meta.url).pathname;
const DEFAULT_BASELINE = join(root, '.claude/state/layout-bench.json');

// The spec without its bench note, and the status the note expects (if any).
export function benchSpec(raw) {
  const { bench, ...spec } = raw;
  return { spec, expect: bench?.expect ? String(bench.expect).toLowerCase() : null, why: bench?.why ?? null };
}

// What differs between a run and the baseline, as "name: metric before → now (±delta)".
const FIELDS = [['jumpers', (m) => m.jumpers], ['wireLength', (m) => m.wireLength], ['columns.span', (m) => m.columns.span], ['holes.T', (m) => m.holes.T], ['holes.B', (m) => m.holes.B], ['holes.rail', (m) => m.holes.rail], ['channelCrossings', (m) => m.channelCrossings], ['tries', (m) => m.tries], ['status', (m) => m.status]];
const sign = (d) => `${d > 0 ? '+' : ''}${Math.round(d * 10) / 10}`;
export function compareRuns(now, before) {
  const lines = [];
  for (const name of Object.keys(now)) {
    if (!before[name]) {
      lines.push(`  + ${name}: new case`);
      continue;
    }
    const changes = FIELDS.flatMap(([key, get]) => {
      const [a, b] = [get(before[name]), get(now[name])];
      if (a === b) return [];
      return [typeof b === 'number' ? `${key} ${a} → ${b} (${sign(b - a)})` : `${key} ${a} → ${b}`];
    });
    if (changes.length) lines.push(`  ${name}: ${changes.join(' · ')}`);
  }
  for (const name of Object.keys(before)) if (!now[name]) lines.push(`  - ${name}: missing from this run`);
  const sum = (set, get) => Math.round(Object.values(set).reduce((s, m) => s + get(m), 0) * 10) / 10;
  const total = (label, get) => `${label} ${sum(before, get)} → ${sum(now, get)}`;
  lines.push(`totals: ${total('jumpers', (m) => m.jumpers)} · ${total('wire mm', (m) => m.wireLength)} · ${total('crossings', (m) => m.channelCrossings)} · ${total('DONE', (m) => (m.status === 'done' ? 1 : 0))}`);
  return lines;
}

function main() {
  const argv = process.argv.slice(2);
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--save' || argv[i] === '--compare') {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      flags[key] = next && !next.startsWith('--') ? next : DEFAULT_BASELINE; // a file right after the flag; spec files go before it
      if (flags[key] === next) i++;
    } else positional.push(argv[i]);
  }
  const dir = join(root, 'examples/layout/');
  const files = positional.length ? positional : readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => dir + f);
  const cases = [
    ...files.map((file) => ({ name: basename(file), raw: () => JSON.parse(readFileSync(file, 'utf8')) })),
    ...(positional.length ? [] : Object.keys(RECIPES).map((name) => ({ name: `recipe ${name}`, raw: () => expandRecipe(name).spec }))),
  ];
  let failed = 0;
  const measured = {};
  for (const { name, raw } of cases) {
    const { spec, expect, why } = benchSpec(raw());
    const r = autoLayout(spec);
    if (r.invalid) {
      failed++;
      console.log(`${name}: INVALID SPEC`);
      for (const p of r.problems) console.log(`  ✖ ${formatIssue(p, 'en')}`);
      continue;
    }
    const m = layoutMetrics(r);
    measured[name] = m;
    const expected = expect && r.status === expect;
    const ok = r.status === 'done';
    if (!ok && !expected) failed++;
    const verdict = expected ? 'EXPECTED CHANGES' : r.status.toUpperCase();
    console.log(`${name}: ${verdict} · nets ${r.check.ok ? 'ok' : 'WRONG'} · ${m.parts} parts · ${m.jumpers} jumpers · ${m.wireLength} mm · cols ${m.columns.min}–${m.columns.max} (of ${m.boardColumns}) · holes ${Object.entries(m.holes).map(([k, v]) => `${k}${v}`).join('/')} · crossings ${m.channelCrossings} · ${m.tries} tries · ${m.ms} ms`);
    if (expected && why) console.log(`  expected: ${why}`);
    if (!expected) {
      for (const p of r.problems) console.log(`  ✖ ${formatIssue(p, 'en')}`);
      for (const x of r.check.missing) console.log(`  ✖ net ${x.net}: missing ${x.pins.join(', ')}`);
      for (const s of r.check.shorted) console.log(`  ✖ nets ${s.nets.join(' + ')} shorted`);
      for (const b of r.review.blocking) console.log(`  ✖ ${formatIssue(b, 'en')}`);
    }
  }
  if (flags.compare) {
    if (!existsSync(flags.compare)) console.log(`\nNo baseline at ${flags.compare} (run with --save first).`);
    else {
      const base = JSON.parse(readFileSync(flags.compare, 'utf8'));
      console.log(`\nCompared with ${base.date}:`);
      for (const l of compareRuns(measured, base.cases)) console.log(l);
    }
  }
  if (flags.save) {
    mkdirSync(dirname(flags.save), { recursive: true });
    writeFileSync(flags.save, `${JSON.stringify({ date: new Date().toISOString(), node: process.version, cases: measured }, null, 2)}\n`); // real clock: when it ran
    console.log(`\nSaved ${Object.keys(measured).length} cases to ${flags.save}`);
  }
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
