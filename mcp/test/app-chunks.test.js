// page_parts in chunks (mcp/app.js): a host refuses a tool result over a size (Claude Desktop's is
// 983,040 bytes), so no result of the app-only tools may pass RESULT_MAX, and the pieces put back
// together must be the page's own.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fetchPageParts } from '../../src/page/client/app.js';
import { RESULT_MAX, CHUNK_BYTES, cutPoints } from '../app.js';
import { RECIPES } from '../../src/recipes/index.js';
import { renderPageParts } from '../../src/page.js';
import { pickLanguage } from '../../src/i18n/index.js';
import { loadCircuit, resolveTarget } from '../../src/node/workspace.js';

const root = mkdtempSync(join(tmpdir(), 'protoboard-chunks-'));
const examples = new URL('../../examples/', import.meta.url).pathname;
let host;
let biggest = { bytes: 0, name: '' };
let biggestRecipe = { bytes: 0, name: '' };
let widest = 0;

before(async () => {
  host = new Client({ name: 'test', version: '0.0.0' }, { capabilities: {} });
  await host.connect(new StdioClientTransport({ command: process.execPath, args: [new URL('../server.js', import.meta.url).pathname], env: { ...process.env, PROTOBOARD_ROOT: root, PROTOBOARD_LANG: 'en', PROTOBOARD_APPS: 'on' } }));
});
after(async () => {
  console.log(`largest page: ${biggest.name}, ${biggest.bytes} bytes of pieces (recipe: ${biggestRecipe.name}, ${biggestRecipe.bytes}); largest result ${widest} bytes (cap ${RESULT_MAX})`);
  await host?.close();
});

const call = async (args) => {
  const r = await host.callTool({ name: 'page_parts', arguments: args });
  const size = Buffer.byteLength(JSON.stringify(r));
  widest = Math.max(widest, size);
  assert.ok(size <= RESULT_MAX, `a result of ${size} bytes passes ${RESULT_MAX} (${JSON.stringify(args).slice(0, 80)})`);
  if (r.isError) throw new Error(r.content[0].text);
  return r.structuredContent;
};
const unchunked = (target) => {
  const circuit = loadCircuit(resolveTarget(join(root, target)));
  return JSON.stringify(renderPageParts(circuit, { lang: pickLanguage(undefined, circuit.lang) }).parts);
};
const sameAsWhole = async (target) => {
  const got = await fetchPageParts(call, { target });
  const whole = unchunked(target);
  assert.equal(JSON.stringify(got.parts), whole, `${target}: the chunks put back are the page`);
  if (whole.length > biggest.bytes) biggest = { bytes: whole.length, name: target };
  if (target.startsWith('r-') && whole.length > biggestRecipe.bytes) biggestRecipe = { bytes: whole.length, name: target };
  return got;
};

test('cutPoints: every piece fits the budget as JSON text, and no cut falls inside a character', () => {
  const text = `ab"c\\d\né€😀x`.repeat(500) + '\ud800' + 'tail\u0001';
  for (const budget of [10, 11, 50, 333, 1000]) {
    const cuts = cutPoints(text, budget);
    assert.equal(cuts[0], 0);
    assert.equal(cuts.at(-1), text.length);
    for (let k = 1; k < cuts.length; k++) {
      const piece = text.slice(cuts[k - 1], cuts[k]);
      assert.ok(cuts[k] > cuts[k - 1]);
      assert.ok(Buffer.byteLength(JSON.stringify(piece)) - 2 <= budget, `piece ${k} of ${budget}`);
      if (cuts[k] < text.length) assert.ok(!((text.charCodeAt(cuts[k] - 1) & 0xfc00) === 0xd800 && (text.charCodeAt(cuts[k]) & 0xfc00) === 0xdc00), 'no pair is cut');
    }
    assert.equal(cuts.slice(1).map((c, k) => text.slice(cuts[k], c)).join(''), text);
  }
});

test('a title with non-ASCII text and an emoji survives the chunks, whatever the size of a chunk', async () => {
  const r = await host.callTool({ name: 'layout', arguments: { target: 'unicode', recipe: 'led-resistor', title: 'Señal ¿ñandú? 😀 電路' } });
  assert.ok(!r.isError, JSON.stringify(r.content));
  const got = await sameAsWhole('unicode');
  assert.match(JSON.stringify(got.parts), /😀 電路/);
  // The same text cut at every size around a surrogate pair.
  const whole = JSON.stringify(got.parts);
  const at = whole.indexOf('😀');
  for (let budget = 20; budget < 60; budget++) {
    const cuts = cutPoints(whole.slice(at - 30, at + 30), budget);
    assert.equal(cuts.slice(1).map((c, k) => whole.slice(at - 30, at + 30).slice(cuts[k], c)).join(''), whole.slice(at - 30, at + 30));
  }
});

test('the manifest pins the page: the chunks are of that revision even if the circuit changes after', async () => {
  await host.callTool({ name: 'layout', arguments: { target: 'pin', recipe: 'led-resistor' } });
  const manifest = await call({ target: 'pin' });
  assert.ok(manifest.chunks >= 3, `${manifest.chunks} chunks`);
  const changed = await host.callTool({ name: 'apply_ops', arguments: { target: 'pin', ops: [{ op: 'set', part: 'R1', value: '1k' }], expect_revision: 0 } });
  assert.ok(!changed.isError);
  const pinned = { target: 'pin', revision: manifest.revision, id: manifest.id };
  const pieces = [];
  for (let i = 0; i < manifest.chunks; i++) pieces.push((await call({ ...pinned, chunk: i })).data);
  assert.equal(pieces.join('').length, manifest.bytes);
  assert.equal(JSON.parse(pieces.join('')).revision, 0, 'still revision 0');
  await assert.rejects(call({ ...pinned, id: '0000000000000000', chunk: 0 }), /changed while/);
  await assert.rejects(call({ ...pinned, chunk: 999 }), /No chunk/);
});

test('a chunk that fails is tried once more; a second failure says which chunk', async () => {
  const seen = [];
  let failures = 0;
  const flaky = (times) => async (a) => {
    if (a.chunk === 1 && failures < times) {
      failures++;
      throw new Error('boom');
    }
    return call(a);
  };
  await host.callTool({ name: 'layout', arguments: { target: 'retry', recipe: 'led-resistor' } });
  const ok = await fetchPageParts(flaky(1), { target: 'retry' }, { onRetry: (i) => seen.push(i) });
  assert.deepEqual(seen, [1]);
  assert.ok(ok.parts.markup);
  failures = 0;
  await assert.rejects(fetchPageParts(flaky(2), { target: 'retry' }), (e) => e.chunk === 1 && /chunk 2\/\d+: boom/.test(e.message));
});

test('every recipe at its defaults: each result under the cap, the chunks put back are the page', async () => {
  let n = 0;
  for (const name of Object.keys(RECIPES)) {
    const r = await host.callTool({ name: 'layout', arguments: { target: `r-${name}`, recipe: name } });
    if (r.isError) continue; // a recipe that needs its values is not a page
    await sameAsWhole(`r-${name}`);
    n++;
  }
  assert.ok(n > 40, `${n} recipes`);
});

test('every example with a page: each result under the cap, the chunks put back are the page', async () => {
  let n = 0;
  for (const file of readdirSync(examples).filter((f) => f.endsWith('.json'))) {
    if (!Array.isArray(JSON.parse(readFileSync(join(examples, file), 'utf8')).parts)) continue;
    copyFileSync(join(examples, file), join(root, file));
    try {
      await sameAsWhole(file);
      n++;
    } catch (e) {
      if (!/nothing to draw|^[A-Z][A-Z_]{3,}/.test(e.message)) throw e; // an example that makes no page
    }
  }
  assert.ok(n > 5, `${n} examples`);
});
