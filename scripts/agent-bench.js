#!/usr/bin/env node
// The agents against three fixed briefs, to see whether a change to the kit made them better or
// worse (like layout-bench.js does for the algorithm). It spends tokens on the account Claude Code
// is signed in with, so by default it only shows the plan:
//
//   node scripts/agent-bench.js           the briefs and the commands, nothing run
//   node scripts/agent-bench.js --run     run them (claude -p), compare with the last run
//
// Each brief runs as its agent (claude -p --agent <name> --output-format json), allowed only the
// tools its file lists, under a spending cap. The reply's STATUS line (scripts/report-status.js),
// the number of turns and the cost are kept in .claude/state/agent-bench.json (not in git) and
// compared with the run before. Exit 1 when a brief does not end as expected. The circuits go to
// bench-out/ (not in git), inside the MCP server's root.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { reportStatus } from './report-status.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const STATE = join(root, '.claude/state/agent-bench.json');
const BUDGET_USD = 1; // per brief

// The briefs in the formats of docs/en/agents.md ("Brief formats").
export const BRIEFS = [
  {
    name: 'recipe',
    agent: 'circuit-layout',
    expect: 'DONE',
    brief: ['LAYOUT BRIEF', 'Target: bench-out/led (new)', 'Goal: a first lesson, an LED and its resistor', 'Recipe: led-resistor, {"R1": "330", "D1": "red"}', 'Done when: review lesson APPROVED'].join('\n'),
  },
  {
    name: 'new circuit',
    agent: 'circuit-layout',
    expect: 'DONE',
    brief: [
      'LAYOUT BRIEF',
      'Target: bench-out/divider-led (new)',
      'Goal: a voltage divider under load, for a lesson',
      'Connections: a 9 V supply on T+ and T-; R1 between T+ and the middle; R2 between the middle and T-; R3 between the middle and the LED anode; the LED cathode to T-',
      'Parts: R1 resistor 10k, R2 resistor 10k, R3 resistor 1k, D1 led green',
      'Board: auto',
      'Done when: review lesson APPROVED',
    ].join('\n'),
  },
  {
    name: 'review',
    agent: 'circuit-reviewer',
    expect: 'APPROVED',
    brief: ['REVIEW BRIEF', 'Target: examples/led-resistor.json · revision 0', 'Profile: lesson', 'Intent: R1 between T+ and the LED anode; the LED cathode to T- through W1'].join('\n'),
  },
];

// The tools an agent's file lists, which are all a brief may use.
export function toolsOf(agent) {
  const text = readFileSync(join(root, '.claude/agents', `${agent}.md`), 'utf8');
  return (/^tools:\s*(.*)$/m.exec(text)?.[1] ?? '').split(',').map((t) => t.trim()).filter(Boolean);
}

export const commandFor = (b) => ['claude', '-p', b.brief, '--agent', b.agent, '--output-format', 'json', '--allowedTools', toolsOf(b.agent).join(','), '--max-budget-usd', String(BUDGET_USD), '--no-session-persistence'];

// One run's line for a brief, from claude -p's JSON answer.
export function resultOf(b, json) {
  const status = reportStatus(json.result ?? '');
  return { name: b.name, agent: b.agent, expect: b.expect, status: status.status ?? null, error: status.error ?? (json.is_error ? json.result : null), turns: json.num_turns ?? null, cost: json.total_cost_usd ?? null, ms: json.duration_ms ?? null };
}

// Lines comparing a run with the one before.
export function compare(now, before = []) {
  return now.map((r) => {
    const was = before.find((b) => b.name === r.name);
    const delta = (k, unit, digits = 0) => (was?.[k] != null && r[k] != null ? ` (${r[k] - was[k] >= 0 ? '+' : ''}${(r[k] - was[k]).toFixed(digits)}${unit})` : '');
    const ok = r.status === r.expect ? '✔' : '✖';
    return `${ok} ${r.name} (${r.agent}): ${r.status ?? r.error ?? 'no status'} · ${r.turns ?? '?'} turns${delta('turns', '')} · $${r.cost?.toFixed(3) ?? '?'}${delta('cost', '$', 3)}`;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv.includes('--run')) {
    for (const b of BRIEFS) console.log(`${b.name} → ${b.agent}, expects STATUS: ${b.expect}\n  ${commandFor(b).slice(0, 2).join(' ')} <brief> ${commandFor(b).slice(3).join(' ')}\n`);
    console.log(`Nothing run. --run spends up to $${BUDGET_USD} per brief on the signed-in account.`);
    process.exit(0);
  }
  rmSync(join(root, 'bench-out'), { recursive: true, force: true });
  const results = [];
  for (const b of BRIEFS) {
    let json;
    try {
      json = JSON.parse(execFileSync(commandFor(b)[0], commandFor(b).slice(1), { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
    } catch (e) {
      json = { is_error: true, result: String(e.stderr || e.message).slice(0, 300) };
    }
    results.push(resultOf(b, json));
  }
  const before = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')).results : [];
  for (const line of compare(results, before)) console.log(line);
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, `${JSON.stringify({ time: new Date().toISOString(), results }, null, 2)}\n`); // real clock: when it ran
  process.exit(results.every((r) => r.status === r.expect) ? 0 : 1);
}
