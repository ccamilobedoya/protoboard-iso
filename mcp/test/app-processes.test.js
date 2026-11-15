// A host may run two processes of the stdio server for one session (Claude Desktop does), the viewer's
// calls landing in one and the model's in the other. Nothing shared between the app-only tools and
// the model's may live in a process's memory; and a server whose host went away must end.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, existsSync, chmodSync, readFileSync, writeFileSync, rmSync, mkdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fetchPageParts } from '../../src/page/client/app.js';
import { SELECTION_FILE, SELECTION_TTL, PAGES_DIR, PAGES_PER_TARGET, PAGES_TTL, STATE_DIR } from '../app.js';

const server = new URL('../server.js', import.meta.url).pathname;
const connect = async (root, env = {}) => {
  const client = new Client({ name: 'test', version: '0.0.0' }, { capabilities: {} });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [server], env: { ...process.env, PROTOBOARD_ROOT: root, PROTOBOARD_LANG: 'en', PROTOBOARD_APPS: 'on', ...env } }));
  return client;
};
const textOf = (r) => r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');

test('two processes on one root: A gets selection_set, B answers selection; A makes a manifest, B serves its chunks', async () => {
  const root = mkdtempSync(join(tmpdir(), 'protoboard-two-'));
  const a = await connect(root);
  const b = await connect(root);
  try {
    await a.callTool({ name: 'layout', arguments: { target: 'led', recipe: 'led-resistor', lang: 'en' } });
    const set = await a.callTool({ name: 'selection_set', arguments: { target: 'led', revision: 0, part: 'R1', line: 'Open on the board: R1, Resistance: 330 Ω.' } });
    assert.ok(!set.isError, textOf(set));
    assert.match(textOf(await b.callTool({ name: 'selection', arguments: { target: 'led' } })), /^Open on the board: R1, Resistance: 330 Ω\. Tapped \d+ s ago, circuit led, revision 0\.$/);
    assert.match(textOf(await b.callTool({ name: 'selection', arguments: {} })), /R1/, 'and without a target');
    // the state is a hidden file in the root, which no listing shows as a circuit
    assert.ok(existsSync(join(root, SELECTION_FILE)));
    assert.ok(!readdirSync(join(root, '.protoboard')).some((f) => f.endsWith('.tmp')), 'the temp file is renamed away');
    assert.ok(!textOf(await b.callTool({ name: 'list_circuits', arguments: {} })).includes('selection'));
    // null clears, seen by the other process
    await a.callTool({ name: 'selection_set', arguments: { target: 'led', revision: 0, part: null, line: '' } });
    assert.equal(textOf(await b.callTool({ name: 'selection', arguments: { target: 'led' } })), 'Nothing is tapped on the board.');

    // the chunk cache: the manifest from A, every chunk from B (which has never built the page)
    const manifest = (await a.callTool({ name: 'page_parts', arguments: { target: 'led' } })).structuredContent;
    const viaB = await fetchPageParts(async (args) => {
      const r = await (args.chunk == null ? a : b).callTool({ name: 'page_parts', arguments: args });
      if (r.isError) throw new Error(textOf(r));
      return r.structuredContent;
    }, { target: 'led' });
    assert.equal(viaB.id, manifest.id);
    assert.equal(viaB.parts.revision, 0);
    assert.ok(viaB.parts.markup);
  } finally {
    await a.close();
    await b.close();
  }
});

test('the selection file: entries older than 24 h are ignored, 32 targets at most, a read-only root falls back to memory and says so once', async () => {
  const root = mkdtempSync(join(tmpdir(), 'protoboard-sel-'));
  const a = await connect(root);
  try {
    const old = Date.now() - SELECTION_TTL - 1000;
    mkdirSync(join(root, STATE_DIR), { recursive: true });
    writeFileSync(join(root, SELECTION_FILE), JSON.stringify({ entries: { stale: { revision: 0, part: 'R1', line: 'old', at: old } } }));
    assert.equal(textOf(await a.callTool({ name: 'selection', arguments: { target: 'stale' } })), 'Nothing is tapped on the board.');
    for (let k = 0; k < 40; k++) await a.callTool({ name: 'selection_set', arguments: { target: `t${k}`, revision: 0, part: 'R1', line: `line ${k}` } });
    const entries = JSON.parse(readFileSync(join(root, SELECTION_FILE), 'utf8')).entries;
    assert.equal(Object.keys(entries).length, 32);
    assert.ok(!entries.stale && !entries.t0 && entries.t39, 'the stale and the oldest are pruned');
    // read-only: the file cannot be replaced (the folder takes no new files)
    if (process.getuid?.() !== 0) {
      chmodSync(root, 0o555);
      chmodSync(join(root, STATE_DIR), 0o555);
      try {
        await a.callTool({ name: 'selection_set', arguments: { target: 'ro', revision: 0, part: 'D1', line: 'Open on the board: D1.' } });
        const first = textOf(await a.callTool({ name: 'selection', arguments: { target: 'ro' } }));
        assert.match(first, /D1.*cannot be shared/);
        assert.doesNotMatch(textOf(await a.callTool({ name: 'selection', arguments: { target: 'ro' } })), /cannot be shared/, 'said once');
      } finally {
        chmodSync(join(root, STATE_DIR), 0o755);
        chmodSync(root, 0o755);
      }
    }
  } finally {
    await a.close();
  }
});

test('the stdio server ends when its stdin closes, worker included, and when its stdout breaks', async () => {
  const root = mkdtempSync(join(tmpdir(), 'protoboard-exit-'));
  const child = spawn(process.execPath, [server], { env: { ...process.env, PROTOBOARD_ROOT: root }, stdio: ['pipe', 'pipe', 'ignore'] });
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal, at: Date.now() })));
  const reply = new Promise((resolve) => child.stdout.once('data', resolve));
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } })}\n`);
  await reply;
  const closedAt = Date.now();
  child.stdin.end();
  const done = await Promise.race([exited, new Promise((r) => setTimeout(() => r(null), 2000))]);
  if (!done) child.kill();
  assert.ok(done, 'still running 2 s after stdin closed');
  assert.ok(done.at - closedAt < 2000);
  assert.equal(done.code, 0);
});

test('pages are files, not memory: the manifest from one process, its chunks from another, after the file or without it; pruned on write', async () => {
  const root = mkdtempSync(join(tmpdir(), 'protoboard-pages-'));
  const a = await connect(root);
  const b = await connect(root);
  try {
    await a.callTool({ name: 'layout', arguments: { target: 'led', recipe: 'led-resistor' } });
    const manifest = (await a.callTool({ name: 'page_parts', arguments: { target: 'led' } })).structuredContent;
    const dir = join(root, PAGES_DIR);
    const files = readdirSync(dir);
    assert.equal(files.length, 1);
    assert.match(files[0], new RegExp(`^[0-9a-f]{12}\\.0\\.${manifest.id}\\.json$`));
    const chunk = async (client, index) => (await client.callTool({ name: 'page_parts', arguments: { target: 'led', revision: 0, id: manifest.id, chunk: index } })).structuredContent.data;
    const fromB = await chunk(b, 1);
    // another process, no file: rebuilt at the pinned revision, the same bytes, and the file is back
    rmSync(dir, { recursive: true });
    assert.equal(await chunk(b, 1), fromB);
    assert.equal(readdirSync(dir).length, 1);
    // revisions pile up: only the newest PAGES_PER_TARGET stay per circuit
    for (let k = 0; k < 4; k++) {
      await a.callTool({ name: 'apply_ops', arguments: { target: 'led', ops: [{ op: 'set', part: 'R1', value: `${k + 2}k` }] } });
      await b.callTool({ name: 'page_parts', arguments: { target: 'led' } });
    }
    const kept = readdirSync(dir).map((f) => Number(f.split('.')[1])).sort();
    assert.deepEqual(kept, [3, 4].slice(-PAGES_PER_TARGET), `${kept}`);
    // nothing older than the TTL survives the next write
    const old = readdirSync(dir)[0];
    const longAgo = new Date(Date.now() - PAGES_TTL - 60000);
    utimesSync(join(dir, old), longAgo, longAgo);
    await a.callTool({ name: 'apply_ops', arguments: { target: 'led', ops: [{ op: 'set', part: 'R1', value: '9k' }] } });
    await a.callTool({ name: 'page_parts', arguments: { target: 'led' } });
    assert.ok(!readdirSync(dir).includes(old));
    // nothing else is left behind, and the listing does not show the folder
    assert.ok(!readdirSync(dir).some((f) => f.endsWith('.tmp')));
    assert.ok(!textOf(await a.callTool({ name: 'list_circuits', arguments: {} })).includes(STATE_DIR));
    // deleting the whole folder is safe
    rmSync(join(root, STATE_DIR), { recursive: true });
    assert.ok(!(await b.callTool({ name: 'page_parts', arguments: { target: 'led' } })).isError);
    assert.equal(textOf(await b.callTool({ name: 'selection', arguments: {} })), 'Nothing is tapped on the board.');
  } finally {
    await a.close();
    await b.close();
  }
});

test('two processes apply to one circuit with the same expected revision: exactly one wins, the other gets REVISION_MISMATCH', async () => {
  const root = mkdtempSync(join(tmpdir(), 'protoboard-race-'));
  const a = await connect(root, { PROTOBOARD_APPS: 'off' });
  const b = await connect(root, { PROTOBOARD_APPS: 'off' });
  try {
    await a.callTool({ name: 'layout', arguments: { target: 'led', recipe: 'led-resistor' } });
    for (let round = 0; round < 6; round++) {
      const rev = JSON.parse(textOf(await a.callTool({ name: 'get_circuit', arguments: { target: 'led' } }))).revision;
      const go = (client, value) => client.callTool({ name: 'apply_ops', arguments: { target: 'led', ops: [{ op: 'set', part: 'R1', value }], expect_revision: rev } });
      const [x, y] = await Promise.all([go(a, `${round + 1}00`), go(b, `${round + 1}k`)]);
      const lost = [x, y].filter((r) => r.isError);
      assert.equal(lost.length, 1, `round ${round}: exactly one loses: ${textOf(x)} | ${textOf(y)}`);
      assert.match(textOf(lost[0]), /REVISION_MISMATCH|revision/i);
    }
    assert.ok(!existsSync(join(root, 'led', 'circuit.json.lock')), 'the lock is gone');
  } finally {
    await a.close();
    await b.close();
  }
});

test('with PROTOBOARD_DEV=1 (a worker) the server also ends when stdin closes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'protoboard-exit-dev-'));
  const child = spawn(process.execPath, [server], { env: { ...process.env, PROTOBOARD_ROOT: root, PROTOBOARD_DEV: '1' }, stdio: ['pipe', 'pipe', 'ignore'] });
  const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
  const reply = new Promise((resolve) => child.stdout.once('data', resolve));
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } })}\n`);
  await reply;
  child.stdin.end();
  const code = await Promise.race([exited, new Promise((r) => setTimeout(() => r('still running'), 2000))]);
  if (code === 'still running') child.kill();
  assert.equal(code, 0);
});
