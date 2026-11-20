#!/usr/bin/env node
// Command line: render, inspect, check and change circuits; write the embeddable page.
// A <target> is a circuit file (examples/led.json) or a circuit folder (circuits/led/).
//
// Exit codes: 0 fine · 1 errors (or a refused change, or no placement found) ·
//             2 review says CHANGES.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCircuit, inspectCircuit, formatReport, checkCircuit, formatIssue, PART_TYPES, PART_NUMBERS, t } from '../src/index.js';
import { pickLanguage } from '../src/i18n/index.js';
import { formatChange } from '../src/diff.js';
import { queryAt, queryNode, queryFree, suggest, suggestMany } from '../src/query.js';
import { formatAt, formatNode, formatFree, formatSuggest, formatSuggestMany } from '../src/query-format.js';
import { nets, formatNets } from '../src/nets.js';
import { review, formatReview } from '../src/review.js';
import { simulate } from '../src/sim/index.js';
import { formatSimulation } from '../src/sim/format.js';
import { parseValue } from '../src/core/units.js';
import { InputError, inputErrorText, inputIssueFor, readJsonInput, parseJsonInput, resolveTarget, loadCircuit, applyToTarget, undoTarget, readHistory, writePage, createTarget, relayoutTarget } from '../src/node/workspace.js';
import { autoLayout, formatLayout, specFromCircuit, specProblems, fixRequest } from '../src/layout.js';
import { resolveRecipe } from '../src/recipes/index.js';
import { svgToPng, rasterAvailable, rasterSearchIn } from '../src/node/raster.js';
import { catalogEntry, formatCatalogEntry, compactCatalog, recipeLine } from '../src/node/catalog.js';

// Strict: an option nobody knows, or one whose value is missing, is an error (args.errors), so a
// typo never runs a command with a default the person did not ask for.
// An option whose value is JSON: a mistake is an error of the arguments, never a stack trace.
function jsonOption(option, text) {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch (e) {
    badJson.push(['cli.badJson', { option, reason: e.message }]);
    return undefined;
  }
}
const badJson = [];

function parseArgs(argv) {
  const args = { _: [], errors: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 < argv.length) return argv[++i];
      args.errors.push(['cli.missingValue', { option: a }]);
      return undefined;
    };
    if (a === '-o' || a === '--out') args.out = value();
    else if (a === '--view') args.view = value();
    else if (a === '--views') args.views = value()?.split(',');
    else if (a === '--lang') args.lang = value();
    else if (a === '--png-width') args.pngWidth = Number(value());
    else if (a === '--scale') args.scale = Number(value());
    else if (a === '--no-labels') args.labels = false;
    else if (a === '--labels') args.labels = value();
    else if (a === '--fit') args.fit = value();
    else if (a === '--annotate') args.annotate = value();
    else if (a === '--json') args.json = true;
    else if (a === '--ops') args.ops = value();
    else if (a === '--parts') args.parts = value();
    else if (a === '--explain') args.explain = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--author') args.author = value();
    else if (a === '--note') args.note = value();
    else if (a === '--expect-revision') args.expectRevision = Number(value());
    else if (a === '--no-outputs') args.outputs = false;
    else if (a === '--part') args.part = value();
    else if (a === '--between') args.between = value()?.split(',');
    else if (a === '--connect') args.connect = value();
    else if (a === '--near') args.near = value();
    else if (a === '--limit') args.limit = Number(value());
    else if (a === '--window') args.window = Number(value());
    else if (a === '--empty') args.empty = true;
    else if (a === '--profile') args.profile = value();
    else if (a === '--transient') args.transient = value()?.split(',');
    else if (a === '--start') args.start = value();
    else if (a === '--sim') args.sim = true;
    else if (a === '--focus') args.focus = value()?.split(',');
    else if (a === '--flow') args.flow = true;
    else if (a === '--check') args.check = true;
    else if (a === '--fix') args.fix = true;
    else if (a === '--recipe') args.recipe = value();
    else if (a === '--values') args.values = jsonOption(a, value());
    else if (a === '-h' || a === '--help') args.help = true;
    else if (/^--?[A-Za-z]/.test(a)) args.errors.push(['cli.unknownOption', { option: a }]);
    else args._.push(a);
  }
  args.errors.push(...badJson);
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
  const parsed = args.ops !== undefined ? parseJsonInput(args.ops, { what: 'ops', file: '--ops', shape: 'objects' }) : source ? readJsonInput(source, { what: 'ops', shape: 'objects' }) : null;
  if (parsed === null) return null;
  return Array.isArray(parsed) ? parsed : [parsed];
}

// The rasteriser may be where the MCP install put it (cd mcp && npm install).
const MCP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'mcp');
rasterSearchIn(MCP_DIR);

// Exit codes are set with process.exitCode and the process ends when its output has drained, so a
// pipe is never cut (process.exit would drop what is still buffered). `fail` stops the command.
class Exit extends Error {}
// A reader that closes its end (| head -1) is not an error.
for (const stream of [process.stdout, process.stderr]) stream.on('error', (e) => (e.code === 'EPIPE' ? process.exit(0) : (() => { throw e; })()));

async function main() {
  let command;
  let lang = 'en';
  try {
    await run((c, l) => {
      command = c;
      lang = l;
    });
  } catch (e) {
    if (e instanceof Exit) return;
    if (e instanceof InputError) {
      if (command === 'layout') console.log(formatLayout(specProblems([inputIssueFor(e.issue, lang)]), lang, { t, formatIssue }));
      else console.error(inputErrorText(e.issue, lang));
      process.exitCode = 1;
      return;
    }
    console.error(t(lang, 'cli.internal', { message: e?.message ?? String(e) }));
    console.error(t(lang, 'cli.internalReport'));
    if (process.env.PROTOBOARD_DEBUG === '1' && e?.stack) console.error(e.stack);
    process.exitCode = 3;
  }
}

async function run(seen) {
  const args = parseArgs(process.argv.slice(2));
  // Test hook, not a user feature: PROTOBOARD_TEST_THROW=1 throws an unexpected error right after the
  // arguments are parsed, to prove an internal error is contained (exit 3, no stack unless PROTOBOARD_DEBUG=1).
  if (process.env.PROTOBOARD_TEST_THROW === '1') throw new Error('forced failure (PROTOBOARD_TEST_THROW)');
  const [command, target, extra, extra2] = args._;
  const paths = target ? resolveTarget(target) : null;
  // Language: --lang if given, else the circuit's own "lang", else English.
  const circuitLang = (() => {
    try {
      return paths && existsSync(paths.circuitFile) ? loadCircuit(paths).lang : undefined;
    } catch {
      return undefined;
    }
  })();
  const lang = pickLanguage(args.lang, circuitLang, 'en');
  seen(command, lang);
  const fail = (code) => {
    process.exitCode = code;
    throw new Exit();
  };

  if (args.errors.length) {
    for (const [key, params] of args.errors) console.error(t(lang, key, params));
    console.error(t(lang, 'cli.seeHelp'));
    fail(2);
  }

  if (args.help || !command || (command !== 'parts' && command !== 'catalog' && !target)) {
    console.log(t(lang, 'cli.usage'));
    fail(command ? 0 : 1);
  }

  // Where the page is, as an absolute path in one line (the person opens it by double-clicking).
  const pageLine = (files, outLang) => (files?.pageFile ? t(outLang, 'cli.page', { file: resolve(files.pageFile) }) : null);
  // A formatted answer whose last line is STATUS: the page line goes just before it.
  function beforeStatus(text, line) {
    if (!line) return text;
    const at = text.lastIndexOf('\nSTATUS:');
    return at < 0 ? `${text}\n${line}` : `${text.slice(0, at)}\n${line}${text.slice(at)}`;
  }

  const viewOptions = { view: args.view, lang, scale: args.scale || undefined, labels: args.labels, fit: args.fit, annotate: args.annotate, sim: args.sim, focus: args.focus, flow: args.flow };

  if (command === 'layout') {
    // layout <target> [spec.json | -]: the whole circuit placed from its parts and nets; on an
    // existing target, laid out again (the spec's fields replace the circuit's, the rest stays).
    // --recipe name [--values json]: a recipe instead of a spec (or "recipe" in the spec file).
    // --dry-run: a trial, the same answer and nothing written (below).
    // --fix: the circuit with the kit's computed fix applied, as one revision (fixRequest), only on
    // this request; with no hazard nothing changes and it is not an error.
    const previous = existsSync(paths.circuitFile) ? loadCircuit(paths) : null;
    let fixed = null;
    if (args.fix) {
      const refuse = (code, exit = 1) => {
        printIssues([{ severity: exit ? 'error' : 'info', code, params: { target } }], lang);
        fail(exit);
      };
      if (extra || args.recipe || args.values) refuse('LAYOUT_FIX_AND_SPEC');
      fixed = previous ? fixRequest(previous) : { refuse: 'LAYOUT_FIX_NO_SPEC' };
      if (fixed.refuse) refuse(fixed.refuse);
      if (fixed.nothing) refuse('LAYOUT_FIX_NONE', 0);
    }
    if (!extra && !previous && !args.recipe) {
      console.log(t(lang, 'cli.usage'));
      fail(1);
    }
    const file = extra ? readJsonInput(extra, { what: 'spec' }) : {};
    const fromRecipe = resolveRecipe({ ...file, ...(args.recipe && { recipe: args.recipe }), ...(args.values && { values: args.values }) });
    if (fromRecipe.problems.length) {
      console.log(formatLayout(specProblems(fromRecipe.problems), lang, { t, formatIssue }));
      fail(1);
    }
    const given = fromRecipe.spec;
    if (previous && !given.nets && !previous.spec?.nets) {
      printIssues([{ severity: 'error', code: 'LAYOUT_NO_SPEC', params: { target } }], lang);
      fail(1);
    }
    const built = fixed ? fixed.spec : previous ? specFromCircuit(previous, given) : given;
    // A language asked for with --lang stays with the circuit, so later answers keep it.
    const spec = args.lang && !built.lang ? { ...built, lang: args.lang } : built;
    if (!Array.isArray(spec.parts) || !spec.parts.length) {
      console.log(formatLayout(specProblems([{ severity: 'error', code: 'SPEC_EMPTY', params: {} }]), pickLanguage(args.lang, spec.lang, 'en'), { t, formatIssue }));
      fail(1);
    }
    // No spec given on an existing circuit: it is laid out again from its kept spec, and says so.
    const again = previous && !extra && !args.recipe && !args.values && !fixed && !args.json && !args.check ? `${t(pickLanguage(args.lang, spec.lang, 'en'), 'layout.again', { revision: previous.revision ?? 0 })}\n` : '';
    const outLang = pickLanguage(args.lang, spec.lang, 'en');
    const result = { ...autoLayout(spec, { checkOnly: args.check, previous, folder: dirname(paths.circuitFile), lang: outLang }), ...(fixed && { applied: fixed.applied }) };
    if (result.checked) {
      console.log(args.json ? JSON.stringify(result, null, 2) : formatLayout(result, outLang, { t, formatIssue }));
      fail(result.invalid ? 1 : 0);
    }
    // --dry-run: the whole answer of the circuit as it would be after the call, and nothing written
    // (no circuit file, history, page or outputs folder; an existing circuit stays as it was).
    if (args.dryRun) {
      const trial = { ...result, trial: true };
      console.log(args.json ? JSON.stringify({ ...trial, circuit: undefined }, null, 2) : again + formatLayout(trial, outLang, { t, formatIssue }));
      fail(result.status === 'done' || result.status === 'warnings' ? 0 : 2);
    }
    const save = { author: args.author ?? 'layout', note: args.note ?? (fixed ? 'layout --fix' : 'layout'), lang: outLang, outputs: args.outputs };
    const created = previous ? relayoutTarget(target, result.circuit, { ...save, expectRevision: args.expectRevision }) : createTarget(target, result.circuit, save);
    if (created.errors.length) {
      printIssues(created.errors, outLang);
      fail(1);
    }
    console.log(args.json ? JSON.stringify({ ...result, circuit: undefined, files: created.files }, null, 2) : again + beforeStatus(formatLayout(result, outLang, { t, formatIssue }), pageLine(created.files, outLang)));
    fail(result.status === 'done' || result.status === 'warnings' ? 0 : 2);
  } else if (command === 'render') {
    const circuit = loadCircuit(paths);
    const { svg, issues } = renderCircuit(circuit, viewOptions);
    printIssues(issues, lang);
    if (!svg) fail(1);
    let out = args.out;
    if (!out) {
      mkdirSync(paths.outDir, { recursive: true });
      out = join(paths.outDir, `${paths.name}.${args.view ?? circuit.view ?? 'front'}${args.annotate ? '.annotated' : ''}${args.sim ? '.sim' : ''}${args.focus ? '.focus' : ''}${args.flow ? '.flow' : ''}.svg`);
    }
    // A name ending in .png is a PNG or an error, never SVG text under a PNG name.
    const wantsPng = extname(out).toLowerCase() === '.png';
    if (wantsPng) {
      if (!(await rasterAvailable())) {
        // Only a clone has mcp/ beside bin/ (the plugin and the extension do not): there, say how to get PNG.
        console.error(`${t(lang, 'cli.pngMissing')}${existsSync(join(MCP_DIR, 'package.json')) ? ` ${t(lang, 'cli.pngClone')}` : ''}`);
        fail(1);
      }
      writeFileSync(out, await svgToPng(svg, { width: args.pngWidth ?? 900 }));
    } else {
      if (args.pngWidth !== undefined) {
        console.error(t(lang, 'cli.pngWidthNeedsPng'));
        fail(1);
      }
      writeFileSync(out, svg);
    }
    console.log(t(lang, 'cli.written', { file: out, parts: circuit.parts.length, issues: issues.length }));
    fail(issues.some((i) => i.severity === 'error') ? 1 : 0);
  } else if (command === 'simulate') {
    const circuit = loadCircuit(paths);
    const options = args.transient
      ? { analysis: 'transient', stop: parseValue(args.transient[0]), step: args.transient[1] ? parseValue(args.transient[1]) : undefined, start: args.start }
      : { analysis: 'dc' };
    const result = simulate(circuit, options);
    console.log(args.json ? JSON.stringify(result, null, 2) : formatSimulation(result, lang, { formatIssue, netLabels: circuit.netLabels }));
    fail(result.ok ? 0 : 1);
  } else if (command === 'page') {
    const circuit = loadCircuit(paths);
    const { pageFile, issues } = writePage(paths, circuit, { lang, fit: args.fit, out: args.out });
    printIssues(issues, lang);
    if (!pageFile) fail(1);
    console.log(t(lang, 'cli.written', { file: resolve(pageFile), parts: circuit.parts.length, issues: issues.length }));
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
  } else if (command === 'nets') {
    const r = nets(loadCircuit(paths));
    console.log(args.json ? JSON.stringify(r, null, 2) : formatNets(r, lang, { t }));
  } else if (command === 'apply') {
    const ops = readOps(args, extra);
    if (!ops) {
      console.log(t(lang, 'cli.usage'));
      fail(1);
    }
    const result = applyToTarget(target, ops, { dryRun: args.dryRun, author: args.author, note: args.note, expectRevision: args.expectRevision, views: args.views, lang, outputLang: args.lang, outputs: args.outputs });
    console.log(args.json ? JSON.stringify({ ...result, circuit: undefined }, null, 2) : [formatChange(result, lang, { t, formatIssue }), pageLine(result.files, lang)].filter(Boolean).join('\n'));
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
  } else if (command === 'suggest' && args.parts) {
    const result = suggestMany(loadCircuit(paths), parseJsonInput(args.parts, { what: 'option', file: '--parts', shape: 'objects' }), { profile: args.profile, window: args.window, views: args.views });
    console.log(args.json ? JSON.stringify(result, null, 2) : formatSuggestMany(result, lang, { formatIssue }));
    fail(result.failed.length ? 1 : 0);
  } else if (command === 'suggest') {
    if (!args.part) {
      console.log(t(lang, 'cli.usage'));
      fail(1);
    }
    const result = suggest(loadCircuit(paths), parseJsonInput(args.part, { what: 'option', file: '--part' }), {
      between: args.between,
      connect: args.connect ? parseJsonInput(args.connect, { what: 'option', file: '--connect' }) : undefined,
      near: args.near,
      limit: args.limit,
      window: args.window,
      views: args.views,
      profile: args.profile,
    });
    console.log(args.json ? JSON.stringify(result, null, 2) : formatSuggest(result, lang, { formatIssue, target }));
    fail(result.error || !result.placements.length ? 1 : 0);
  } else if (command === 'review') {
    const result = review(loadCircuit(paths), { profile: args.profile, views: args.views, lang, explain: args.explain });
    console.log(args.json ? JSON.stringify(result, null, 2) : formatReview(result, lang, { t, formatIssue }));
    fail(result.verdict === 'changes' ? 2 : 0);
  } else if (command === 'undo') {
    const result = undoTarget(target, { author: args.author, views: args.views, lang, outputLang: args.lang, outputs: args.outputs });
    console.log(args.json ? JSON.stringify(result, null, 2) : [formatChange(result, lang, { t, formatIssue }), pageLine(result.files, lang)].filter(Boolean).join('\n'));
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
  } else if ((command === 'catalog' || command === 'parts') && target) {
    // catalog <name> (parts is the older name, kept): one type, part number, module, board or recipe in detail.
    const entry = catalogEntry(target, lang);
    if (!entry) {
      console.log(t(lang, 'catalog.unknown', { name: target, types: Object.keys(PART_TYPES).join(', ') }));
      fail(1);
    }
    console.log(args.json ? JSON.stringify(entry, null, 2) : formatCatalogEntry(entry, lang));
  } else if (command === 'catalog' || command === 'parts') {
    for (const [type, def] of Object.entries(PART_TYPES)) {
      const numbers = Object.entries(PART_NUMBERS).filter(([, e]) => e.type === type).map(([n]) => n);
      const pins = def.pins ? def.pins.join(', ') : '—';
      console.log(`${type.padEnd(10)} ${t(lang, `type.${type}`).padEnd(20)} pins: ${pins}${numbers.length ? `  parts: ${numbers.join(', ')}` : ''}`);
    }
    console.log(t(lang, 'catalog.recipes'));
    for (const [name, r] of Object.entries(compactCatalog(lang).recipes)) console.log(recipeLine(name, r));
  } else {
    console.log(t(lang, 'cli.usage'));
    fail(1);
  }

}

await main();
