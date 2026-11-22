// What a change does to a circuit, measured: which issues and drawing problems it fixes,
// which it introduces, and how part visibility moves. An agent proposes operations, reads
// this diff from a dry run, and only then applies them.
//
// evaluate(circuit, options) → { problems, visibility }   (check issues + inspect problems)
// diffEvaluations(before, after) → { fixed, introduced, kept, visibility }

import { inspectCircuit, checkCircuit } from './index.js';
import { DOUBT_CODES } from './circuit/checks.js';
import { checkNets } from './nets.js';
import { compile, doubtsOf } from './sim/index.js';

const sortKeys = (obj) => Object.fromEntries(Object.entries(obj ?? {}).sort(([a], [b]) => a.localeCompare(b)));
export const problemKey = (p) => `${p.severity} ${p.code} ${JSON.stringify(sortKeys(p.params))}`;

// The last evaluations, by the circuit's text and the options: layout's search measures the same
// circuit again and again (a candidate suggest measured, then the try's review; one try's circuit in
// the next), and a measurement is a pure function of them. Each caller gets its own copy.
const EVALUATED = new Map();
const EVALUATED_KEPT = 64;
const FOLDER = Symbol.for('protoboard-iso.folder'); // beside.js CIRCUIT_FOLDER (Node-only module)

// views: which camera views to measure (each adds its drawing problems, tagged by view).
export function evaluate(circuit, options = {}) {
  const key = JSON.stringify([circuit, circuit?.[FOLDER] ?? null, options.views ?? null, options.fit ?? null, options.lang ?? null]);
  let r = EVALUATED.get(key);
  if (r) EVALUATED.delete(key);
  else r = measured(circuit, options);
  EVALUATED.set(key, r);
  if (EVALUATED.size > EVALUATED_KEPT) EVALUATED.delete(EVALUATED.keys().next().value);
  return structuredClone(r);
}

function measured(circuit, { views = ['front'], fit = 'board', lang = 'en' } = {}) {
  const problems = [];
  const visibility = {};
  views.forEach((view, i) => {
    const report = inspectCircuit(circuit, { view, fit, lang });
    // A loop, not push(...list): a spread passes every item as an argument, and a batch of a few
    // hundred parts has more problems than the stack holds arguments.
    if (i === 0) for (const p of report.issues) problems.push(p);
    for (const p of report.problems) problems.push(views.length > 1 ? { ...p, view } : p);
    for (const part of report.parts) visibility[views.length > 1 ? `${part.id}@${view}` : part.id] = part.visible;
  });
  // What check reports counts too: simulate refuses on the same placement errors, so a change that
  // adds one is never "no change in issues".
  const seen = new Set(problems.map(problemKey));
  for (const issue of checkCircuit(circuit).issues) if (!seen.has(problemKey(issue))) problems.push(issue);
  return { problems, visibility };
}

// What `apply` and `undo` measure before and after a change: the same judgement `review` gives of a
// revision, less what needs the simulation to run. evaluate's problems, plus
//  - the connections the layout spec asked for (review.js: SPEC_NET_MISSING, SPEC_NETS_SHORTED), so a
//    part moved off its strip is "new: error", not a note;
//  - the doubts the kit finds without solving or running anything (sim/index.js doubtsOf on the
//    compiled circuit: a board's program file missing or outside the folder, a sketch the kit cannot
//    translate, a part with no simulation model, the wiring doubts), each a warning as review says it.
// The doubts of the hazard check's states and its run (an output that never comes on, a pin over its
// voltage) stay review's: a change is measured in a moment, a review takes its time.
export function judge(circuit, options = {}) {
  const r = evaluate(circuit, options);
  const seen = new Set(r.problems.map((p) => `${p.code} ${JSON.stringify(sortKeys(p.params))}`));
  const add = (p) => {
    const key = `${p.code} ${JSON.stringify(sortKeys(p.params))}`;
    if (seen.has(key)) return;
    seen.add(key);
    r.problems.push(p);
  };
  if (circuit?.spec?.nets?.length) {
    const asked = circuit.spec.nets.map((n) => (Array.isArray(n) ? { pins: n } : n));
    const nets = checkNets(circuit, asked);
    for (const m of nets.missing) add({ severity: 'error', code: 'SPEC_NET_MISSING', params: { net: m.net, pins: m.pins.join(', ') } });
    for (const sh of nets.shorted) add({ severity: 'error', code: 'SPEC_NETS_SHORTED', params: { nets: sh.nets.join(' + ') } });
  }
  // Only what the placement lets the kit read: a circuit that cannot be built has its errors already.
  if (!r.problems.some((p) => p.severity === 'error' && isInputMistake(p))) {
    const compiled = compile(circuit);
    const folder = circuit?.[FOLDER];
    for (const d of doubtsOf(circuit, compiled, null)) {
      // As review words it: a program file not found says where the kit looked.
      if (d.code === 'SIM_PROGRAM_FILE') add({ ...d, doubt: true, params: { ...d.params, ...(folder ? { folder: String(folder), variant: 'folder' } : { variant: 'noFolder' }) } });
      else add({ ...d, doubt: true });
    }
  }
  return r;
}

// Two classes of error a change can introduce. The rule:
//  - INPUT MISTAKES: the kit cannot read what was written (a value the part does not understand, an
//    unknown type, part number, colour, pin, field, hole, module or board, a malformed shape, a
//    duplicate or missing id, a control or environment field that does not exist). Nobody wants these;
//    they are the caller's slip. `apply` refuses the whole batch: nothing is saved.
//  - CIRCUIT OUTCOMES: the kit read it fine and the result is wrong or a bad idea (a short, a collision,
//    a covered part, a missing connection, a part that would burn, a span that does not reach). These
//    are allowed and saved, with a loud line (the design rule: allow and warn; learning includes
//    getting it wrong). Every error code not listed here is an outcome.
export const INPUT_MISTAKE_CODES = new Set([
  'INVALID_CIRCUIT', 'UNKNOWN_BOARD', 'DUPLICATE_ID', 'MISSING_ID', 'UNKNOWN_TYPE', 'UNKNOWN_PART_NUMBER', 'UNKNOWN_COLOR',
  'UNKNOWN_KIND', 'UNKNOWN_PACKAGE', 'BAD_VALUE', 'PIN_COUNT', 'UNKNOWN_PIN', 'MISSING_PIN', 'UNKNOWN_HOLE',
  'UNKNOWN_FIELD', 'UNKNOWN_PART_NAME', 'UNKNOWN_MODULE', 'MODULE_PINS',
  'PAGE_CONTROL_TARGET', 'PAGE_CONTROL_UNKNOWN', 'PAGE_CONTROL_RANGE', 'ENV_UNKNOWN_FIELD', 'ENV_OUT_OF_RANGE', 'ENV_SHAPE',
  'ENV_BAD_PROGRAM', 'ENV_BAD_RANGE',
]);
// A listed code is refused whatever its severity (UNKNOWN_FIELD is a warning); the shape codes
// (DIP_SHAPE, BUTTON_SHAPE, MODULE_SHAPE, BRIDGE_SHAPE: a part read fine but placed oddly) and
// ENV_EMITTER_ALONE are outcomes, and a doubt (DOUBT_CODES) is never refused.
export const isInputMistake = (p) => INPUT_MISTAKE_CODES.has(p.code) && !DOUBT_CODES.has(p.code);

// How many errors (not notes or warnings) a change introduces.
export const newErrorCount = (diff) => diff.introduced.filter((p) => p.severity === 'error' && !DOUBT_CODES.has(p.code)).length;

export function diffEvaluations(before, after) {
  const beforeKeys = new Map(before.problems.map((p) => [problemKey(p), p]));
  const afterKeys = new Map(after.problems.map((p) => [problemKey(p), p]));
  const fixed = [...beforeKeys].filter(([k]) => !afterKeys.has(k)).map(([, p]) => p);
  const introduced = [...afterKeys].filter(([k]) => !beforeKeys.has(k)).map(([, p]) => p);
  const kept = [...afterKeys.keys()].filter((k) => beforeKeys.has(k)).length;
  const visibility = [];
  for (const id of new Set([...Object.keys(before.visibility), ...Object.keys(after.visibility)])) {
    const a = before.visibility[id];
    const b = after.visibility[id];
    if (a === undefined || b === undefined || Math.abs(a - b) >= 0.01) visibility.push({ part: id, before: a ?? null, after: b ?? null });
  }
  return { fixed, introduced, kept, visibility };
}

const mark = (p) => (p.severity === 'info' ? '·' : p.doubt || DOUBT_CODES.has(p.code) ? '⚠' : '✖');

// Readable summary of an apply/undo result. `formatIssue` comes from index.js.
export function formatChange(result, lang, { t, formatIssue }) {
  const lines = [];
  if (result.refused) {
    lines.push(t(lang, 'change.refused'));
    for (const p of result.diff.introduced) lines.push(`  ${mark(p)} ${t(lang, 'change.introduced')}: ${formatIssue(p, lang)}${p.view ? ` [${p.view}]` : ''}`);
    lines.push(t(lang, result.dryRun ? 'change.refusedDry' : 'change.refusedNothing'));
    return lines.join('\n');
  }
  if (result.errors?.length) {
    lines.push(t(lang, 'change.failed'));
    for (const e of result.errors) lines.push(`  ${formatIssue(e, lang)}`);
    return lines.join('\n');
  }
  if (result.dryRun) lines.push(t(lang, 'change.dryRun', { from: result.revision, to: result.nextRevision }));
  else if (result.undid) lines.push(t(lang, 'change.undone', { undid: result.undid, revision: result.revision }));
  else lines.push(t(lang, 'change.applied', { revision: result.revision }));
  const { fixed, introduced, visibility } = result.diff;
  for (const p of fixed) lines.push(`  ✔ ${t(lang, 'change.fixed')}: ${formatIssue(p, lang)}${p.view ? ` [${p.view}]` : ''}`);
  // A note is worth knowing, not a problem: it gets a dot, not a cross; a doubt (DOUBT_CODES) a ⚠.
  for (const p of introduced) lines.push(`  ${mark(p)} ${t(lang, 'change.introduced')}: ${formatIssue(p, lang)}${p.view ? ` [${p.view}]` : ''}`);
  if (!fixed.length && !introduced.length) lines.push(`  ${t(lang, 'change.same')}`);
  const pct = (v) => (v === null ? '—' : `${Math.round(v * 100)} %`);
  if (visibility.length) lines.push(`  ${t(lang, 'change.visibility')}: ${visibility.map((v) => `${v.part} ${pct(v.before)} → ${pct(v.after)}`).join(', ')}`);
  // Saved, and the kit allows it, but the person is told in words that it does not work now.
  if (result.applied && !result.dryRun && !result.undid && result.newErrors > 0) lines.push(t(lang, 'change.appliedWithErrors', { revision: result.revision, count: result.newErrors }));
  if (result.newHistory) lines.push(`  ${t(lang, 'change.newHistory', result.newHistory)}`);
  if (result.files) lines.push(`  ${t(lang, 'change.outputs', { svg: result.files.svgFile, report: result.files.reportFile })}`);
  return lines.join('\n');
}
