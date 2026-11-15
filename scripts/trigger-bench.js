#!/usr/bin/env node
// Does a model reach for the kit on a natural request, one that never names it? And does it leave it
// alone when it should? Measured with Claude Code's CLI as the host (claude -p), not guessed. It spends
// tokens on the account Claude Code is signed in with, so by default it only shows the plan:
//
//   node scripts/trigger-bench.js                                 the prompts and the command, nothing run
//   node scripts/trigger-bench.js --run --label baseline          run them with haiku (claude -p)
//   node scripts/trigger-bench.js --run --label x --model sonnet --only n1,n2,c1
//
// Each prompt runs in an empty temporary directory (no CLAUDE.md, no skills, no settings: only the
// prompt and the kit), with ONLY this repository's MCP server connected (--strict-mcp-config, a
// temporary --mcp-config, PROTOBOARD_APPS=on, a temporary root), no built-in tools, a spending cap per
// prompt and a cap for the whole bench (BUDGET_USD, kept in the state file). No follow-ups: -p has none.
//
// Score per prompt, from the stream of the run: did it call a tool that builds or changes a circuit
// (layout, apply_ops, create_circuit), did the root end in the expected state (a new circuit, or the
// prepared one changed as asked), how many tool calls, what it cost. A negative prompt must call no kit
// tool. Results go to .claude/state/trigger-bench.json (not in git), keyed by label, with the total spent.
//
// What it cannot tell: Claude Desktop is another host (its own system prompt, its own way to show tools,
// artifacts instead of files), and a model's habits change with its version.

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const STATE = join(repo, '.claude/state/trigger-bench.json');
export const BUDGET_USD = 6; // for every run of this bench, all labels together
const CAP = { haiku: 0.4, sonnet: 0.8 }; // per prompt
const BUILDERS = ['layout', 'apply_ops', 'create_circuit'];

// kind: new (a circuit must appear), change (the prepared circuit `led` must end as `expect`), negative (no kit tool).
export const PROMPTS = [
  { id: 'n1', kind: 'new', text: 'Quiero prender un LED rojo con una batería de 9 V' },
  { id: 'n2', kind: 'new', text: 'un LED rojo con su resistencia a 9 V' },
  { id: 'n3', kind: 'new', text: '¿Cómo conecto un potenciómetro a un Arduino para atenuar un LED?' },
  { id: 'n4', kind: 'new', text: 'Make a 555 blink an LED once per second' },
  { id: 'n5', kind: 'new', text: 'I want to light an LED from a 9 V battery' },
  { id: 'n6', kind: 'new', text: 'Necesito que un transistor NPN encienda un LED cuando oprimo un botón' },
  { id: 'n7', kind: 'new', text: 'How do I wire a push button to an Arduino UNO with a pull-down resistor?' },
  { id: 'n8', kind: 'new', text: 'Muéstrame un divisor de voltaje con dos resistencias de 10k desde 9 V' },
  { id: 'n9', kind: 'new', text: 'Connect a temperature sensor to an ESP32 and show me the wiring' },
  { id: 'n10', kind: 'new', text: 'Quiero que un LED parpadee con un Arduino' },
  { id: 'n11', kind: 'new', text: 'Design a simple RC low-pass filter and show me how it is wired' },
  { id: 'n12', kind: 'new', text: '¿Cómo se conecta un buzzer activo a un Arduino?' },
  { id: 'c1', kind: 'change', text: 'cambia la resistencia de led a 1k', expect: { part: 'R1', value: /^(1k|1000|1 ?kΩ?)$/i } },
  { id: 'c2', kind: 'change', text: 'what if R1 were 100 ohm in the circuit led?', expect: { part: 'R1', value: /^100( ?Ω)?$/i } },
  { id: 'c3', kind: 'change', text: 'en el circuito led, pon la resistencia en 470 ohmios', expect: { part: 'R1', value: /^470( ?Ω)?$/i } },
  { id: 'c4', kind: 'change', text: 'In the circuit led, make the LED green', expect: { part: 'D1', color: /^green$/i } },
  { id: 'x1', kind: 'negative', text: "what is Ohm's law?" },
  { id: 'x2', kind: 'negative', text: 'write a Python function to parse JSON' },
  { id: 'x3', kind: 'negative', text: 'explain what a pull-up resistor is in one sentence' },
];

export function commandFor(prompt, { model = 'haiku', config }) {
  return ['claude', '-p', prompt, '--model', model, '--output-format', 'stream-json', '--verbose', '--strict-mcp-config', '--mcp-config', config, '--tools', '', '--allowedTools', 'mcp__protoboard-iso', '--setting-sources', '', '--disable-slash-commands', '--no-session-persistence', '--max-budget-usd', String(CAP[model] ?? 0.4)];
}

// The tool calls and the result of a run, from claude -p's stream-json lines.
export function readStream(text) {
  const calls = [];
  let result = null;
  for (const line of text.split('\n')) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'assistant') for (const block of event.message?.content ?? []) if (block.type === 'tool_use') calls.push(block.name.replace(/^mcp__protoboard-iso__/, ''));
    if (event.type === 'result') result = event;
  }
  return { calls, result };
}

// The root's state against what the prompt expected.
export function endState(prompt, root) {
  const circuits = readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && existsSync(join(root, e.name, 'circuit.json'))).map((e) => e.name);
  if (prompt.kind === 'new') return { ok: circuits.some((n) => n !== 'led'), circuits };
  if (prompt.kind === 'change') {
    const circuit = JSON.parse(readFileSync(join(root, 'led', 'circuit.json'), 'utf8'));
    const part = circuit.parts.find((p) => p.id === prompt.expect.part);
    const ok = Boolean(part) && Object.entries(prompt.expect).every(([k, re]) => k === 'part' || re.test(String(part[k] ?? '')));
    return { ok, revision: circuit.revision ?? 0, seen: part && { value: part.value, color: part.color } };
  }
  return { ok: circuits.every((n) => n === 'led') };
}

function plan(model) {
  console.log(`trigger bench: ${PROMPTS.length} prompts (${PROMPTS.filter((p) => p.kind === 'new').length} new, ${PROMPTS.filter((p) => p.kind === 'change').length} change, ${PROMPTS.filter((p) => p.kind === 'negative').length} negative), model ${model}, cap ${CAP[model]} USD each, ${BUDGET_USD} USD in all`);
  for (const p of PROMPTS) console.log(`  ${p.id.padEnd(4)} ${p.kind.padEnd(9)} ${p.text}`);
  console.log(`\ncommand: ${commandFor('<prompt>', { model, config: '<tmp>/mcp.json' }).map((a) => (/\s|^$/.test(a) ? JSON.stringify(a) : a)).join(' ')}\n(run from an empty temp directory; nothing is run without --run)`);
}

const loadState = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { spent: 0, runs: {} });
const saveState = (state) => {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, `${JSON.stringify(state, null, 2)}\n`);
};

async function runOne(prompt, model) {
  const dir = mkdtempSync(join(tmpdir(), 'trigger-bench-'));
  const root = join(dir, 'root');
  mkdirSync(root);
  const cwd = join(dir, 'cwd');
  mkdirSync(cwd);
  if (prompt.kind === 'change') execFileSync(process.execPath, [join(repo, 'bin/protoboard-iso.js'), 'layout', join(root, 'led'), '--recipe', 'led-resistor'], { stdio: 'ignore' });
  const config = join(dir, 'mcp.json');
  writeFileSync(config, JSON.stringify({ mcpServers: { 'protoboard-iso': { command: process.execPath, args: [join(repo, 'mcp/server.js')], env: { PROTOBOARD_ROOT: root, PROTOBOARD_APPS: 'on' } } } }));
  const [cmd, ...args] = commandFor(prompt.text, { model, config });
  const out = await new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
    let text = '';
    child.stdout.on('data', (d) => (text += d));
    child.on('close', () => resolve(text));
  });
  const { calls, result } = readStream(out);
  const built = calls.some((c) => BUILDERS.includes(c));
  const state = endState(prompt, root);
  const triggered = prompt.kind === 'negative' ? calls.length === 0 : built && state.ok;
  return { id: prompt.id, kind: prompt.kind, triggered, built, state, calls: calls.length, tools: calls, cost: result?.total_cost_usd ?? 0, turns: result?.num_turns ?? 0, error: result?.is_error ? String(result.result).slice(0, 120) : undefined };
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  const model = flag('--model', 'haiku');
  if (!args.includes('--run')) return plan(model);
  const label = flag('--label', null);
  if (!label) throw new Error('--label <name> says what this run measures (baseline, +instructions…)');
  const only = flag('--only', null)?.split(',');
  const picked = PROMPTS.filter((p) => !only || only.includes(p.id));
  const state = loadState();
  const rows = [];
  let next = 0;
  const worker = async () => {
    while (next < picked.length) {
      const prompt = picked[next++];
      if (state.spent >= BUDGET_USD) {
        console.log(`budget of ${BUDGET_USD} USD reached: ${prompt.id} not run`);
        continue;
      }
      const row = await runOne(prompt, model);
      state.spent += row.cost;
      rows.push(row);
      console.log(`${row.id.padEnd(4)} ${row.triggered ? 'ok  ' : 'MISS'} calls ${String(row.calls).padStart(2)} $${row.cost.toFixed(3)} ${row.tools.join(',')}${row.error ? ` ERROR ${row.error}` : ''}`);
    }
  };
  await Promise.all(Array.from({ length: Number(flag('--parallel', 3)) }, worker));
  rows.sort((a, b) => PROMPTS.findIndex((p) => p.id === a.id) - PROMPTS.findIndex((p) => p.id === b.id));
  state.runs[`${label} (${model})`] = { at: new Date().toISOString(), rows };
  saveState(state);
  const of = (kind) => rows.filter((r) => r.kind === kind);
  const hit = (kind) => `${of(kind).filter((r) => r.triggered).length}/${of(kind).length}`;
  console.log(`\n${label} (${model}): new ${hit('new')}, change ${hit('change')}, negatives respected ${hit('negative')}, cost $${rows.reduce((s, r) => s + r.cost, 0).toFixed(3)} (spent in all: $${state.spent.toFixed(2)} of ${BUDGET_USD})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
