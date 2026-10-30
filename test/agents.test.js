// The agents in .claude/agents/ as files: each says who it is, which model and which tools it
// gets, and none sends its reader to a private file (CLAUDE.local.md, privacy.local.txt) that a
// clone of the repository does not have. Whether the tools it names exist is checked by
// npm run test:mcp (mcp/test), against the running server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reportStatus, STATUSES } from '../scripts/report-status.js';

const root = new URL('../', import.meta.url).pathname;
const dir = join(root, '.claude/agents');
const MODELS = new Set(['haiku', 'sonnet', 'opus', 'fable', 'inherit']);

// The frontmatter of an agent file: { name, description, tools: [...], model }, and its body.
export function agentOf(text) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) return null;
  const fields = Object.fromEntries(m[1].split('\n').map((l) => /^(\w+):\s*(.*)$/.exec(l)).filter(Boolean).map(([, k, v]) => [k, v.trim()]));
  return { ...fields, tools: fields.tools ? fields.tools.split(',').map((t) => t.trim()).filter(Boolean) : [], body: m[2] };
}

const agents = readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => ({ file: f, ...agentOf(readFileSync(join(dir, f), 'utf8')) }));

test('agents: each declares its name, a description, its tools and its model', () => {
  assert.ok(agents.length >= 3);
  for (const a of agents) {
    assert.equal(a.name, a.file.replace(/\.md$/, ''), `${a.file}: name matches the file`);
    assert.ok(a.description?.length > 40, `${a.file}: a description that says when to use it`);
    assert.ok(a.tools.length, `${a.file}: a closed list of tools`);
    assert.ok(MODELS.has(a.model), `${a.file}: model is one of ${[...MODELS].join(', ')} (got ${a.model})`);
  }
});

test('agents: none sends its reader to a private file', () => {
  const found = [];
  for (const a of agents) {
    a.body.split('\n').forEach((line, i) => {
      if (/\b(?:read|open|see|check|look in|from)\s+`?(?:CLAUDE\.local\.md|privacy\.local\.txt)`?\s+(?:for|to)\b/i.test(line)) found.push(`${a.file}: ${line.trim()}`);
    });
  }
  assert.deepEqual(found, [], 'a clone does not have that file: say what to do instead');
});

test('agents: the frontmatter reader', () => {
  const a = agentOf('---\nname: x\ndescription: d\ntools: Read, Bash\nmodel: haiku\n---\n\nBody');
  assert.deepEqual(a.tools, ['Read', 'Bash']);
  assert.equal(a.model, 'haiku');
  assert.equal(agentOf('no frontmatter'), null);
});

// Every report format ends in its STATUS line, and the validator reads real reports.
test('agents: each reply format ends in its STATUS line', () => {
  for (const a of agents) {
    const format = /```text\n([A-Z]+ REPORT\n[\s\S]*?)```/.exec(a.body)?.[1];
    assert.ok(format, `${a.file}: a reply format`);
    const kind = format.split('\n')[0];
    assert.ok(STATUSES[kind], `${a.file}: ${kind}`);
    assert.equal(format.trim().split('\n').at(-1), `STATUS: ${STATUSES[kind].join(' | ')}`, a.file);
  }
});

test('report status: the last line, checked against the report', () => {
  const review = (verdict, status) => `REVIEW REPORT\nTarget: led · revision 2 · profile lesson\nVerdict: ${verdict}\nNotes: none\nSTATUS: ${status}\n`;
  assert.deepEqual(reportStatus(review('APPROVED', 'APPROVED')), { kind: 'REVIEW REPORT', status: 'APPROVED' });
  assert.match(reportStatus(review('CHANGES', 'APPROVED')).error, /Verdict says CHANGES/);
  assert.match(reportStatus(review('APPROVED', 'DONE')).error, /ends in APPROVED \| CHANGES/);
  assert.match(reportStatus('LAYOUT REPORT\nReview: CHANGES (2 blocking) · notes: 1\nSTATUS: DONE').error, /not DONE/);
  assert.equal(reportStatus('Here it is:\n```text\nLAYOUT REPORT\nReview: APPROVED · notes: 0\nOpen: nothing\nSTATUS: DONE\n```\n').status, 'DONE', 'inside a code block');
  assert.match(reportStatus('LAYOUT REPORT\nOpen: nothing').error, /last line/);
  assert.match(reportStatus('Done, all good.').error, /no report header/);
  assert.match(reportStatus('PARTS REPORT\nSTATUS: DONE\nSTATUS: BLOCKED').error, /more than one|ends in/);
});
