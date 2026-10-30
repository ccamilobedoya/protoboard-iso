// Claude Code Stop and SubagentStop hook (.claude/settings.json): what the session (or the agent)
// has spent so far, appended to .claude/state/usage.jsonl (not in git), so "circuit work should
// run on a small model" can be checked with numbers. It reads the transcript Claude Code writes;
// a response split over several lines counts once (by its message id). Transcripts carry tokens,
// not money, so cost stays null here; scripts/agent-bench.js gets the cost from claude -p.
//
//   stdin: { hook_event_name, session_id, transcript_path, agent_transcript_path?, agent_type? }
//   node .claude/hooks/usage.js --summary   the latest line of each session and agent, as a table
//
// It never blocks and prints nothing as a hook: a broken transcript only skips a line.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const stateFile = (dir) => join(dir, '.claude/state/usage.jsonl');

// Totals of a transcript (JSONL text): calls, tool uses, tokens by kind, the models, cache hit rate.
export function usageOf(jsonl) {
  const seen = new Set();
  const tools = new Set();
  const models = new Set();
  const t = { calls: 0, tools: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  for (const line of String(jsonl).split('\n')) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    const m = e?.type === 'assistant' ? e.message : null;
    if (!m?.usage) continue;
    for (const block of m.content ?? []) if (block?.type === 'tool_use' && block.id) tools.add(block.id);
    if (m.id && seen.has(m.id)) continue;
    if (m.id) seen.add(m.id);
    t.calls++;
    if (m.model) models.add(m.model);
    t.input += m.usage.input_tokens ?? 0;
    t.output += m.usage.output_tokens ?? 0;
    t.cacheRead += m.usage.cache_read_input_tokens ?? 0;
    t.cacheWrite += m.usage.cache_creation_input_tokens ?? 0;
  }
  t.tools = tools.size;
  const prompt = t.input + t.cacheRead + t.cacheWrite;
  return { ...t, cacheHit: prompt ? Number((t.cacheRead / prompt).toFixed(3)) : null, models: [...models], cost: null };
}

// The line a hook event appends, or null when there is no transcript to read.
export function usageLine(input, now = new Date().toISOString()) { // real clock: when it was spent
  const transcript = input.agent_transcript_path ?? input.transcript_path;
  if (!transcript || !existsSync(transcript)) return null;
  return { time: now, event: input.hook_event_name ?? null, session: input.session_id ?? null, agent: input.agent_type ?? null, ...usageOf(readFileSync(transcript, 'utf8')) };
}

// The latest line of each session and agent: a running total, so the last one is the whole.
export function latest(lines) {
  const by = new Map();
  for (const l of lines) by.set(`${l.session} ${l.agent ?? ''}`, l);
  return [...by.values()];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (process.argv.includes('--summary')) {
    const lines = existsSync(stateFile(dir)) ? readFileSync(stateFile(dir), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    for (const l of latest(lines)) console.log(`${l.time.slice(0, 16)}  ${(l.agent ?? 'session').padEnd(18)} ${l.models.join(',').padEnd(22)} ${String(l.calls).padStart(4)} calls ${String(l.tools).padStart(4)} tools  out ${l.output}  in ${l.input + l.cacheRead + l.cacheWrite} (cache ${Math.round((l.cacheHit ?? 0) * 100)} %)`);
  } else {
    try {
      const line = usageLine(JSON.parse(readFileSync(0, 'utf8') || '{}'));
      if (line) {
        mkdirSync(join(dir, '.claude/state'), { recursive: true });
        appendFileSync(stateFile(dir), `${JSON.stringify(line)}\n`);
      }
    } catch {
      // a usage log must never get in the way of the session
    }
  }
}
