// The trigger bench (scripts/trigger-bench.js) without running it: its prompts, its command and how it reads a run.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';
import { PROMPTS, BUDGET_USD, commandFor, readStream, endState } from '../scripts/trigger-bench.js';

test('the bench has its prompts: 12 new, 4 changes, 3 negatives, none naming the kit', () => {
  const count = (k) => PROMPTS.filter((p) => p.kind === k).length;
  assert.deepEqual([count('new'), count('change'), count('negative')], [12, 4, 3]);
  assert.equal(new Set(PROMPTS.map((p) => p.id)).size, PROMPTS.length);
  assert.ok(!PROMPTS.some((p) => /protoboard|breadboard|protoboard-iso/i.test(p.text)), 'a natural request never names the kit');
  assert.ok(BUDGET_USD <= 6);
});

test('a run sees only this MCP server, no project instructions, no built-in tools, under a cap', () => {
  const [cmd, ...args] = commandFor('hola', { model: 'haiku', config: '/tmp/x/mcp.json' });
  assert.equal(cmd, 'claude');
  for (const flag of ['--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence', '--max-budget-usd']) assert.ok(args.includes(flag), flag);
  assert.equal(args[args.indexOf('--tools') + 1], '');
  assert.equal(args[args.indexOf('--setting-sources') + 1], '');
  assert.equal(args[args.indexOf('--mcp-config') + 1], '/tmp/x/mcp.json');
});

test('readStream finds the kit calls and the cost; endState checks the root', () => {
  const lines = [
    { type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }, { type: 'tool_use', name: 'mcp__protoboard-iso__layout' }, { type: 'tool_use', name: 'mcp__protoboard-iso__review' }] } },
    { type: 'result', total_cost_usd: 0.01, num_turns: 3 },
  ].map((e) => JSON.stringify(e)).join('\n');
  const { calls, result } = readStream(`${lines}\nnot json`);
  assert.deepEqual(calls, ['layout', 'review']);
  assert.equal(result.total_cost_usd, 0.01);
  const root = tempDir('tb-');
  mkdirSync(join(root, 'led'));
  writeFileSync(join(root, 'led', 'circuit.json'), JSON.stringify({ revision: 1, parts: [{ id: 'R1', value: '1k' }] }));
  const change = PROMPTS.find((p) => p.id === 'c1');
  assert.ok(endState(change, root).ok);
  assert.ok(!endState(PROMPTS.find((p) => p.id === 'c3'), root).ok, '470 is not what it holds');
  assert.ok(!endState(PROMPTS.find((p) => p.id === 'n1'), root).ok, 'a new circuit did not appear');
  assert.ok(endState(PROMPTS.find((p) => p.id === 'x1'), root).ok);
});
