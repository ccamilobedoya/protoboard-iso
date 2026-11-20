// What a change does to a circuit, measured: which issues and drawing problems it fixes,
// which it introduces, and how part visibility moves. An agent proposes operations, reads
// this diff from a dry run, and only then applies them.
//
// evaluate(circuit, options) → { problems, visibility }   (check issues + inspect problems)
// diffEvaluations(before, after) → { fixed, introduced, kept, visibility }

import { inspectCircuit, checkCircuit } from './index.js';

const sortKeys = (obj) => Object.fromEntries(Object.entries(obj ?? {}).sort(([a], [b]) => a.localeCompare(b)));
export const problemKey = (p) => `${p.severity} ${p.code} ${JSON.stringify(sortKeys(p.params))}`;

// views: which camera views to measure (each adds its drawing problems, tagged by view).
export function evaluate(circuit, { views = ['front'], fit = 'board', lang = 'en' } = {}) {
  const problems = [];
  const visibility = {};
  views.forEach((view, i) => {
    const report = inspectCircuit(circuit, { view, fit, lang });
    if (i === 0) problems.push(...report.issues);
    problems.push(...report.problems.map((p) => (views.length > 1 ? { ...p, view } : p)));
    for (const part of report.parts) visibility[views.length > 1 ? `${part.id}@${view}` : part.id] = part.visible;
  });
  // What check reports counts too: simulate refuses on the same placement errors, so a change that
  // adds one is never "no change in issues".
  const seen = new Set(problems.map(problemKey));
  for (const issue of checkCircuit(circuit).issues) if (!seen.has(problemKey(issue))) problems.push(issue);
  return { problems, visibility };
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
  'UNKNOWN_KIND', 'UNKNOWN_PACKAGE', 'BAD_VALUE', 'PIN_COUNT', 'UNKNOWN_PIN', 'MISSING_PIN', 'UNKNOWN_HOLE', 'DIP_SHAPE',
  'BUTTON_SHAPE', 'UNKNOWN_FIELD', 'UNKNOWN_PART_NAME', 'UNKNOWN_MODULE', 'MODULE_PINS', 'MODULE_SHAPE', 'BRIDGE_SHAPE',
  'PAGE_CONTROL_TARGET', 'PAGE_CONTROL_UNKNOWN', 'PAGE_CONTROL_RANGE', 'ENV_UNKNOWN_FIELD', 'ENV_OUT_OF_RANGE', 'ENV_SHAPE',
  'ENV_BAD_PROGRAM', 'ENV_BAD_RANGE', 'ENV_EMITTER_ALONE',
]);
export const isInputMistake = (p) => p.severity === 'error' && INPUT_MISTAKE_CODES.has(p.code);

// How many errors (not notes or warnings) a change introduces.
export const newErrorCount = (diff) => diff.introduced.filter((p) => p.severity === 'error').length;

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

// Readable summary of an apply/undo result. `formatIssue` comes from index.js.
export function formatChange(result, lang, { t, formatIssue }) {
  const lines = [];
  if (result.refused) {
    lines.push(t(lang, 'change.refused'));
    for (const p of result.diff.introduced) lines.push(`  ${p.severity === 'info' ? '·' : '✖'} ${t(lang, 'change.introduced')}: ${formatIssue(p, lang)}${p.view ? ` [${p.view}]` : ''}`);
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
  // A note is worth knowing, not a problem: it gets a dot, not a cross.
  for (const p of introduced) lines.push(`  ${p.severity === 'info' ? '·' : '✖'} ${t(lang, 'change.introduced')}: ${formatIssue(p, lang)}${p.view ? ` [${p.view}]` : ''}`);
  if (!fixed.length && !introduced.length) lines.push(`  ${t(lang, 'change.same')}`);
  const pct = (v) => (v === null ? '—' : `${Math.round(v * 100)} %`);
  if (visibility.length) lines.push(`  ${t(lang, 'change.visibility')}: ${visibility.map((v) => `${v.part} ${pct(v.before)} → ${pct(v.after)}`).join(', ')}`);
  // Saved, and the kit allows it, but the person is told in words that it does not work now.
  if (result.applied && !result.dryRun && !result.undid && result.newErrors > 0) lines.push(t(lang, 'change.appliedWithErrors', { revision: result.revision, count: result.newErrors }));
  if (result.files) lines.push(`  ${t(lang, 'change.outputs', { svg: result.files.svgFile, report: result.files.reportFile })}`);
  return lines.join('\n');
}
