#!/usr/bin/env node
// The status line of an agent's report (.claude/agents/*.md, "reply format"): every report ends in
// one line "STATUS: <word>", so whoever reads it (the main conversation, the agent bench) knows
// what comes next without reading the rest. This finds that line and checks it against the report.
//
//   node scripts/report-status.js < report.txt   → prints the status; exit 1 when it is not valid
//   reportStatus(text) → { kind, status } or { error }

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// The words each kind of report may end with.
export const STATUSES = {
  'LAYOUT REPORT': ['DONE', 'CHANGES', 'BLOCKED'],
  'REVIEW REPORT': ['APPROVED', 'CHANGES'],
  'PARTS REPORT': ['DONE', 'BLOCKED'],
};

export function reportStatus(text) {
  const lines = String(text ?? '')
    .replace(/```\w*/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const kind = Object.keys(STATUSES).find((k) => lines.includes(k));
  if (!kind) return { error: `no report header (${Object.keys(STATUSES).join(', ')})` };
  const last = lines.at(-1);
  const m = /^STATUS:\s*(\S+)$/.exec(last);
  if (!m) return { kind, error: `the last line is not "STATUS: <word>": ${last}` };
  const status = m[1];
  if (!STATUSES[kind].includes(status)) return { kind, error: `${kind} ends in ${STATUSES[kind].join(' | ')}, not ${status}` };
  if (lines.filter((l) => l.startsWith('STATUS:')).length > 1) return { kind, error: 'more than one STATUS line' };
  // The line must agree with what the report says above it.
  const field = (name) => lines.find((l) => l.startsWith(`${name}:`))?.slice(name.length + 1).trim() ?? '';
  if (kind === 'REVIEW REPORT' && field('Verdict').split(/\s/)[0] !== status) return { kind, error: `Verdict says ${field('Verdict')}, STATUS says ${status}` };
  if (kind === 'LAYOUT REPORT' && /^CHANGES\b/.test(field('Review')) && status === 'DONE') return { kind, error: 'the review asks for changes, so the layout is not DONE' };
  return { kind, status };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = reportStatus(readFileSync(0, 'utf8'));
  if (r.error) {
    console.error(`report-status: ${r.error}`);
    process.exit(1);
  }
  console.log(r.status);
}
