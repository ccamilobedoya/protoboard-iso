// What a change does to a circuit, measured: which issues and drawing problems it fixes,
// which it introduces, and how part visibility moves. An agent proposes operations, reads
// this diff from a dry run, and only then applies them.
//
// evaluate(circuit, options) → { problems, visibility }   (check issues + inspect problems)
// diffEvaluations(before, after) → { fixed, introduced, kept, visibility }

import { inspectCircuit } from './index.js';

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
  return { problems, visibility };
}

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
  if (result.files) lines.push(`  ${t(lang, 'change.outputs', { svg: result.files.svgFile, report: result.files.reportFile })}`);
  return lines.join('\n');
}
