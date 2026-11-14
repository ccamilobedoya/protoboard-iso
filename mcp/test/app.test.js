// MCP Apps (app.js): a client that announces the extension gets the viewer, page_parts and the
// links; one that does not gets exactly what it got before, and the same text from every tool.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = mkdtempSync(join(tmpdir(), 'protoboard-app-'));
const UI = { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } };
let plain;
let host;

const connect = async (capabilities, env = {}) => {
  const client = new Client({ name: 'test', version: '0.0.0' }, { capabilities });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [new URL('../server.js', import.meta.url).pathname], env: { ...process.env, PROTOBOARD_ROOT: root, PROTOBOARD_LANG: 'en', PROTOBOARD_APPS: 'auto', ...env } }));
  return client;
};
const textOf = (r) => r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');

before(async () => {
  plain = await connect({});
  host = await connect(UI);
});
after(async () => {
  await plain?.close();
  await host?.close();
});

test('a client without MCP Apps sees no viewer, no page_parts and no _meta', async () => {
  const { tools } = await plain.listTools();
  assert.ok(!tools.some((t) => t.name === 'page_parts'));
  assert.ok(tools.every((t) => t._meta === undefined), 'no _meta on any tool');
  const listed = await plain.listResources().catch(() => ({ resources: [] }));
  assert.deepEqual(listed.resources, []);
  await assert.rejects(plain.readResource({ uri: 'ui://protoboard-iso/board.html' }));
});

test('a host with MCP Apps gets the viewer, the link on layout and an app-only page_parts', async () => {
  const { tools } = await host.listTools();
  const layout = tools.find((t) => t.name === 'layout');
  assert.equal(layout._meta.ui.resourceUri, 'ui://protoboard-iso/board.html');
  const parts = tools.find((t) => t.name === 'page_parts');
  assert.deepEqual(parts._meta.ui.visibility, ['app']);
  const { resources } = await host.listResources();
  assert.deepEqual(resources.map((r) => [r.uri, r.mimeType]), [['ui://protoboard-iso/board.html', 'text/html;profile=mcp-app']]);
  const read = await host.readResource({ uri: 'ui://protoboard-iso/board.html' });
  assert.equal(read.contents.length, 1);
  assert.equal(read.contents[0].mimeType, 'text/html;profile=mcp-app');
  assert.match(read.contents[0].text, /^<!doctype html>/);
  assert.match(read.contents[0].text, /ui\/initialize/);
  assert.ok(!/id="page-data"/.test(read.contents[0].text), 'the viewer carries no circuit');
});

test('what a session loads grows by at most 300 bytes of descriptions with MCP Apps', async () => {
  const words = (tools) => tools.reduce((n, t) => n + Buffer.byteLength(`${t.title ?? ''}${t.description ?? ''}`), 0);
  const a = await plain.listTools();
  const b = await host.listTools();
  assert.ok(words(b.tools) - words(a.tools) <= 300, `${words(b.tools) - words(a.tools)} bytes`);
  assert.equal(plain.getInstructions(), host.getInstructions());
});

test('layout answers the same text to both; the host also gets {target, revision, lang} and the pieces', async () => {
  const args = (target) => ({ target, recipe: 'led-resistor', values: { V1: 9 }, lang: 'es' });
  const a = await plain.callTool({ name: 'layout', arguments: args('led-a') });
  const b = await host.callTool({ name: 'layout', arguments: args('led-b') });
  assert.ok(!a.isError && !b.isError, textOf(a));
  const steady = (r) => textOf(r).replace(/ \d+ ms /, ' … ms '); // the time it took differs
  assert.equal(steady(b), steady(a).replace('led-a', 'led-b'), 'same text');
  assert.equal(a.structuredContent, undefined);
  assert.deepEqual(b.structuredContent, { target: 'led-b', revision: 0, lang: 'es' });

  const got = await host.callTool({ name: 'page_parts', arguments: { target: 'led-b', revision: 0 } });
  assert.ok(!got.isError, textOf(got));
  const p = got.structuredContent.parts;
  assert.equal(p.revision, 0);
  assert.equal(got.structuredContent.latest, 0);
  assert.equal(p.lang, 'es');
  assert.match(p.markup, /^<nav hidden>/);
  assert.ok(p.data.parts.R1 && p.program, 'part data and the program of a live page');
  assert.equal(got.structuredContent.texts.ask, 'Preguntar por esta pieza');
  assert.ok(Buffer.byteLength(textOf(got)) < 100, 'the text of page_parts stays small');
});

test('page_parts pins a revision: an older one is rebuilt from the history', async () => {
  const before = await host.callTool({ name: 'page_parts', arguments: { target: 'led-b', revision: 0 } });
  const changed = await host.callTool({ name: 'apply_ops', arguments: { target: 'led-b', ops: [{ op: 'set', part: 'R1', value: '1k' }], expect_revision: 0 } });
  assert.ok(!changed.isError, textOf(changed));
  const old = await host.callTool({ name: 'page_parts', arguments: { target: 'led-b', revision: 0 } });
  const now = await host.callTool({ name: 'page_parts', arguments: { target: 'led-b', revision: 1 } });
  assert.equal(old.structuredContent.parts.revision, 0);
  assert.equal(old.structuredContent.latest, 1);
  assert.deepEqual(old.structuredContent.parts.data, before.structuredContent.parts.data, 'revision 0 as it was');
  assert.equal(now.structuredContent.parts.revision, 1);
  assert.notDeepEqual(now.structuredContent.parts.data.parts.R1, old.structuredContent.parts.data.parts.R1);
  const outside = await host.callTool({ name: 'page_parts', arguments: { target: '../x' } });
  assert.ok(outside.isError);
});

test('PROTOBOARD_APPS=on offers the viewer to a host that does not announce it; off to none', async () => {
  const on = await connect({}, { PROTOBOARD_APPS: 'on' });
  const off = await connect(UI, { PROTOBOARD_APPS: 'off' });
  try {
    assert.ok((await on.listTools()).tools.some((t) => t.name === 'page_parts'));
    assert.ok(!(await off.listTools()).tools.some((t) => t.name === 'page_parts'));
  } finally {
    await on.close();
    await off.close();
  }
});
