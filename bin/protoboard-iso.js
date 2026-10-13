#!/usr/bin/env node
// Command line: render, inspect, check and change circuits.
// A <target> is a circuit file (examples/led.json) or a circuit folder (circuits/led/).
//
// Exit codes: 0 fine · 1 errors (or a refused change, or no placement found) ·
//             2 review says CHANGES.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderCircuit, inspectCircuit, formatReport, checkCircuit, formatIssue, PART_TYPES, PART_NUMBERS, t } from '../src/index.js';
import { formatChange } from '../src/diff.js';
import { queryAt, queryNode, queryFree, suggest } from '../src/query.js';
import { formatAt, formatNode, formatFree, formatSuggest } from '../src/query-format.js';
import { review, formatReview } from '../src/review.js';
import { resolveTarget, loadCircuit, applyToTarget, undoTarget, readHistory } from '../src/node/workspace.js';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o' || a === '--out') args.out = argv[++i];
    else if (a === '--view') args.view = argv[++i];
    else if (a === '--views') args.views = argv[++i].split(',');
    else if (a === '--lang') args.lang = argv[++i];
    else if (a === '--scale') args.scale = Number(argv[++i]);
    else if (a === '--no-labels') args.labels = false;
    else if (a === '--labels') args.labels = argv[++i];
    else if (a === '--fit') args.fit = argv[++i];
    else if (a === '--annotate') args.annotate = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--ops') args.ops = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--author') args.author = argv[++i];
    else if (a === '--note') args.note = argv[++i];
    else if (a === '--expect-revision') args.expectRevision = Number(argv[++i]);
    else if (a === '--no-outputs') args.outputs = false;
    else if (a === '--part') args.part = argv[++i];
    else if (a === '--between') args.between = argv[++i].split(',');
    else if (a === '--connect') args.connect = argv[++i];
    else if (a === '--near') args.near = argv[++i];
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--window') args.window = Number(argv[++i]);
    else if (a === '--empty') args.empty = true;
    else if (a === '--profile') args.profile = argv[++i];
    else if (a === '-h' || a === '--help') args.help = true;
    else args._.push(a);
  }
  return args;
}

function printIssues(issues, lang) {
  if (!issues.length) {
    console.log(t(lang, 'cli.noIssues'));
    return;
  }
  for (const issue of issues) console.log(`  ${formatIssue(issue, lang)}`);
}

// Operations: --ops '<json>', a file, or "-" for standard input. One object or a list.
function readOps(args, source) {
  const text = args.ops ?? (source === '-' ? readFileSync(0, 'utf8') : source ? readFileSync(source, 'utf8') : null);
  if (!text) return null;
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
}

const args = parseArgs(process.argv.slice(2));
const lang = args.lang ?? 'en';
const [command, target, extra, extra2] = args._;
const fail = (code) => process.exit(code);

if (args.help || !command || (command !== 'parts' && !target)) {
  console.log(t(lang, 'cli.usage'));
  fail(command ? 0 : 1);
}

const paths = target ? resolveTarget(target) : null;
const viewOptions = { view: args.view, lang, scale: args.scale || undefined, labels: args.labels, fit: args.fit, annotate: args.annotate };

if (command === 'render') {
  const circuit = loadCircuit(paths);
  const { svg, issues } = renderCircuit(circuit, viewOptions);
  printIssues(issues, lang);
  if (!svg) fail(1);
  let out = args.out;
  if (!out) {
    mkdirSync(paths.outDir, { recursive: true });
    out = join(paths.outDir, `${paths.name}.${args.view ?? circuit.view ?? 'front'}${args.annotate ? '.annotated' : ''}.svg`);
  }
  writeFileSync(out, svg);
  console.log(t(lang, 'cli.written', { file: out, parts: circuit.parts.length, issues: issues.length }));
  fail(issues.some((i) => i.severity === 'error') ? 1 : 0);
} else if (command === 'inspect') {
  const report = inspectCircuit(loadCircuit(paths), viewOptions);
  console.log(args.json ? JSON.stringify(report, null, 2) : formatReport(report, lang));
  fail(report.issues.some((i) => i.severity === 'error') ? 1 : 0);
} else if (command === 'check') {
  const { issues, netlist } = checkCircuit(loadCircuit(paths));
  if (args.json) {
    console.log(JSON.stringify({ issues: issues.map((i) => ({ ...i, text: formatIssue(i, lang) })), netlist }, null, 2));
    fail(issues.some((i) => i.severity === 'error') ? 1 : 0);
  }
  printIssues(issues, lang);
  console.log(t(lang, 'cli.nodes'));
  for (const [node, members] of Object.entries(netlist.nodes)) {
    console.log(`  ${node.padEnd(10)} ${members.map((m) => `${m.part}.${m.pin}@${m.hole}`).join('  ')}`);
  }
  fail(issues.some((i) => i.severity === 'error') ? 1 : 0);
} else if (command === 'netlist') {
  console.log(JSON.stringify(checkCircuit(loadCircuit(paths)).netlist, null, 2));
} else if (command === 'apply') {
  const ops = readOps(args, extra);
  if (!ops) {
    console.log(t(lang, 'cli.usage'));
    fail(1);
  }
  const result = applyToTarget(target, ops, { dryRun: args.dryRun, author: args.author, note: args.note, expectRevision: args.expectRevision, views: args.views, lang, outputs: args.outputs });
  console.log(args.json ? JSON.stringify({ ...result, circuit: undefined }, null, 2) : formatChange(result, lang, { t, formatIssue }));
  fail(result.errors.length ? 1 : 0);
} else if (command === 'query') {
  const circuit = loadCircuit(paths);
  const out = (value, text) => console.log(args.json ? JSON.stringify(value, null, 2) : text(value, lang));
  if (extra === 'at') out(queryAt(circuit, extra2), formatAt);
  else if (extra === 'node') out(queryNode(circuit, extra2), formatNode);
  else if (extra === 'free') out(queryFree(circuit, { near: args.near ?? extra2, limit: args.limit, emptyNodes: args.empty }), formatFree);
  else {
    console.log(t(lang, 'cli.usage'));
    fail(1);
  }
} else if (command === 'suggest') {
  if (!args.part) {
    console.log(t(lang, 'cli.usage'));
    fail(1);
  }
  const result = suggest(loadCircuit(paths), JSON.parse(args.part), {
    between: args.between,
    connect: args.connect ? JSON.parse(args.connect) : undefined,
    near: args.near,
    limit: args.limit,
    window: args.window,
    views: args.views,
  });
  console.log(args.json ? JSON.stringify(result, null, 2) : formatSuggest(result, lang, { formatIssue, target }));
  fail(result.error || !result.placements.length ? 1 : 0);
} else if (command === 'review') {
  const result = review(loadCircuit(paths), { profile: args.profile, views: args.views, lang });
  console.log(args.json ? JSON.stringify(result, null, 2) : formatReview(result, lang, { t, formatIssue }));
  fail(result.verdict === 'approved' ? 0 : 2);
} else if (command === 'undo') {
  const result = undoTarget(target, { author: args.author, views: args.views, lang, outputs: args.outputs });
  console.log(args.json ? JSON.stringify(result, null, 2) : formatChange(result, lang, { t, formatIssue }));
  fail(result.errors.length ? 1 : 0);
} else if (command === 'history') {
  const history = readHistory(paths);
  if (args.json) console.log(JSON.stringify(history, null, 2));
  else if (!history.length) console.log(t(lang, 'history.empty'));
  else {
    for (const h of history) {
      const ops = h.ops.map((o) => `${o.op}${o.part ? ` ${typeof o.part === 'string' ? o.part : o.part.id}` : ''}`).join(', ');
      console.log(t(lang, 'history.entry', { revision: h.revision, time: h.time, author: h.author, note: h.note ? ` (${h.note})` : '', ops }));
    }
  }
} else if (command === 'parts') {
  for (const [type, def] of Object.entries(PART_TYPES)) {
    const numbers = Object.entries(PART_NUMBERS).filter(([, e]) => e.type === type).map(([n]) => n);
    const pins = def.pins ? def.pins.join(', ') : '—';
    console.log(`${type.padEnd(10)} ${t(lang, `type.${type}`).padEnd(20)} pins: ${pins}${numbers.length ? `  parts: ${numbers.join(', ')}` : ''}`);
  }
} else {
  console.log(t(lang, 'cli.usage'));
  fail(1);
}
