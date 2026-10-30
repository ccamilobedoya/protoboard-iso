// scripts/agent-bench.js without running Claude: its briefs are in the documented formats and go
// to agents that exist, each may use only its agent's tools, and a run is read and compared.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BRIEFS, commandFor, compare, resultOf, toolsOf } from '../scripts/agent-bench.js';
import { STATUSES } from '../scripts/report-status.js';

const root = new URL('../', import.meta.url).pathname;
const HEADER = { 'circuit-layout': 'LAYOUT BRIEF', 'circuit-reviewer': 'REVIEW BRIEF', 'parts-librarian': 'PARTS BRIEF' };
const REPORT = { 'circuit-layout': 'LAYOUT REPORT', 'circuit-reviewer': 'REVIEW REPORT', 'parts-librarian': 'PARTS REPORT' };

test('agent bench: three briefs, in their formats, to agents that exist', () => {
  assert.equal(BRIEFS.length, 3);
  for (const b of BRIEFS) {
    assert.ok(existsSync(join(root, '.claude/agents', `${b.agent}.md`)), b.agent);
    assert.equal(b.brief.split('\n')[0], HEADER[b.agent], `${b.name}: the brief's header`);
    assert.ok(STATUSES[REPORT[b.agent]].includes(b.expect), `${b.name}: ${b.expect} is a status its report can end in`);
    if (b.agent === 'circuit-layout') assert.match(b.brief, /^Target: bench-out\//m, 'circuits go to bench-out/ (not in git)');
  }
});

test('agent bench: each brief runs as its agent, with only that agent\'s tools and a spending cap', () => {
  for (const b of BRIEFS) {
    const cmd = commandFor(b);
    assert.deepEqual(cmd.slice(0, 2), ['claude', '-p']);
    assert.equal(cmd[cmd.indexOf('--agent') + 1], b.agent);
    assert.deepEqual(cmd[cmd.indexOf('--allowedTools') + 1].split(','), toolsOf(b.agent));
    assert.ok(Number(cmd[cmd.indexOf('--max-budget-usd') + 1]) > 0);
    assert.ok(cmd.includes('--no-session-persistence'));
  }
});

test('agent bench: a run is read from claude -p\'s JSON and compared with the one before', () => {
  const b = BRIEFS[2];
  const report = 'REVIEW REPORT\nTarget: x · revision 0 · profile lesson\nVerdict: APPROVED\nNotes: none\nSTATUS: APPROVED';
  const now = resultOf(b, { result: report, num_turns: 6, total_cost_usd: 0.12, duration_ms: 9000 });
  assert.deepEqual(now, { name: 'review', agent: 'circuit-reviewer', expect: 'APPROVED', status: 'APPROVED', error: null, turns: 6, cost: 0.12, ms: 9000 });
  const [line] = compare([now], [{ ...now, turns: 8, cost: 0.2 }]);
  assert.match(line, /^✔ review \(circuit-reviewer\): APPROVED · 6 turns \(-2\) · \$0\.120 \(-0\.080\$\)$/);
  const bad = resultOf(b, { result: 'Looks fine to me.', is_error: false });
  assert.equal(bad.status, null);
  assert.match(compare([bad])[0], /^✖ review .*no report header/);
});
