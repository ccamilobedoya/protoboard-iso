// End-to-end: start the server over stdio with a temporary root and call its tools with
// the MCP client, exactly as an assistant would.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = mkdtempSync(join(tmpdir(), 'protoboard-mcp-'));
const led = JSON.parse(readFileSync(new URL('../../examples/led-resistor.json', import.meta.url), 'utf8'));
let client;

const call = async (name, args = {}) => client.callTool({ name, arguments: args });
const textOf = (r) => r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
const jsonOf = (r) => JSON.parse(textOf(r));

before(async () => {
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: [new URL('../server.js', import.meta.url).pathname], env: { ...process.env, PROTOBOARD_ROOT: root, PROTOBOARD_LANG: 'en' } }),
  );
});
after(async () => client?.close());

test('the server lists its tools with schemas and gives work instructions', async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['apply_ops', 'catalog', 'create_circuit', 'get_circuit', 'history', 'inspect', 'list_circuits', 'query', 'render', 'review', 'simulate', 'suggest', 'undo']);
  for (const tool of tools) assert.ok(tool.description && tool.inputSchema, tool.name);
  assert.ok(tools.find((t) => t.name === 'inspect').annotations.readOnlyHint);
  assert.match(client.getInstructions(), /dry_run/);
});

test('every MCP tool an agent lists exists in the server', async () => {
  const { readdirSync } = await import('node:fs');
  const { tools } = await client.listTools();
  const names = new Set(tools.map((t) => t.name));
  const dir = new URL('../../.claude/agents/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const front = readFileSync(new URL(file, dir), 'utf8').split('---')[1] ?? '';
    const listed = [...front.matchAll(/mcp__protoboard-iso__(\w+)/g)].map((m) => m[1]);
    for (const tool of listed) assert.ok(names.has(tool), `${file} lists "${tool}", which the server does not have: update the agent`);
  }
});

test('create, find, read and inspect a circuit', async () => {
  const created = await call('create_circuit', { target: 'circuits/led', circuit: led, author: 'test' });
  assert.ok(!created.isError, textOf(created));
  assert.equal(jsonOf(created).revision, 0);
  assert.ok(existsSync(join(root, 'circuits/led/out/led.report.json')));
  const again = await call('create_circuit', { target: 'circuits/led', circuit: led });
  assert.ok(again.isError, 'refuses to overwrite');

  const list = jsonOf(await call('list_circuits', { format: 'json' }));
  assert.deepEqual(list.circuits.map((c) => c.target), ['circuits/led']);
  const got = jsonOf(await call('get_circuit', { target: 'circuits/led' }));
  assert.equal(got.circuit.parts.length, 3);
  const r1 = jsonOf(await call('inspect', { target: 'circuits/led', part: 'R1' }));
  assert.equal(r1.part.pins[0].hole, 'T+9');
  assert.match(textOf(await call('inspect', { target: 'circuits/led', lang: 'es' })), /pata 1 → T\+9/);
});

test('query and suggest, then dry run, apply, history and undo', async () => {
  assert.match(textOf(await call('query', { target: 'circuits/led', kind: 'at', ref: 'h9' })), /holds R1\.2/);
  const s = jsonOf(await call('suggest', { target: 'circuits/led', part: { type: 'resistor', value: '1k' }, between: ['10:f-j', 'T-'], format: 'json' }));
  assert.ok(s.placements.length > 0);
  const ops = s.placements[0].ops;

  const dry = jsonOf(await call('apply_ops', { target: 'circuits/led', ops, dry_run: true, format: 'json' }));
  assert.equal(dry.applied, false);
  const stale = await call('apply_ops', { target: 'circuits/led', ops, expect_revision: 7 });
  assert.ok(stale.isError);
  assert.match(textOf(stale), /revision 0, not 7/);
  const done = jsonOf(await call('apply_ops', { target: 'circuits/led', ops, expect_revision: 0, author: 'test', note: 'second resistor', format: 'json' }));
  assert.equal(done.revision, 1);
  assert.match(textOf(await call('history', { target: 'circuits/led' })), /rev 1 .* test \(second resistor\): add R2/);

  const undone = jsonOf(await call('undo', { target: 'circuits/led', format: 'json' }));
  assert.equal(undone.undid, 1);
  assert.equal(jsonOf(await call('get_circuit', { target: 'circuits/led' })).circuit.parts.length, 3);
});

test('review gives a verdict', async () => {
  const r = jsonOf(await call('review', { target: 'circuits/led', format: 'json' }));
  assert.ok(['approved', 'changes'].includes(r.verdict));
  assert.match(textOf(await call('review', { target: 'circuits/led', lang: 'es' })), /APROBADO|HAY QUE CAMBIAR/);
});

test('render writes an SVG and returns a PNG only when asked', async () => {
  const plain = await call('render', { target: 'circuits/led', fit: 'parts' });
  assert.equal(plain.content.length, 1);
  assert.ok(existsSync(join(root, jsonOf(plain).svg)));
  const withPng = await call('render', { target: 'circuits/led', fit: 'parts', annotate: 'all', png_width: 300 });
  const image = withPng.content.find((c) => c.type === 'image');
  if (image) assert.equal(image.mimeType, 'image/png');
});

test('paths outside the root and unknown circuits are refused', async () => {
  const outside = await call('get_circuit', { target: '../../etc' });
  assert.ok(outside.isError);
  assert.match(textOf(outside), /outside the allowed folder/);
  const missing = await call('inspect', { target: 'circuits/nope' });
  assert.ok(missing.isError);
});

test('simulate: supplies set with an operation, then voltages and currents (a model)', async () => {
  const { supplies, page, ...bare } = led;
  assert.ok(supplies && page, 'the example has a supply');
  await call('create_circuit', { target: 'circuits/sim', circuit: bare, author: 'test' });
  const none = await call('simulate', { target: 'circuits/sim' });
  assert.ok(none.isError, 'no supply yet');
  assert.match(textOf(none), /add a supply/);
  const set = await call('apply_ops', { target: 'circuits/sim', ops: [{ op: 'circuit', supplies: [{ id: 'V1', voltage: 5 }] }], author: 'test' });
  assert.ok(!set.isError, textOf(set));
  const text = textOf(await call('simulate', { target: 'circuits/sim', lang: 'es' }));
  assert.match(text, /un modelo, no una medición/);
  const dc = jsonOf(await call('simulate', { target: 'circuits/sim', format: 'json' }));
  assert.ok(dc.ok && dc.model);
  assert.ok(dc.parts.D1.current > 0.009 && dc.parts.D1.current < 0.011);
  const tr = jsonOf(await call('simulate', { target: 'circuits/sim', analysis: 'transient', stop: 0.001, format: 'json' }));
  assert.equal(tr.analysis, 'transient');
  assert.equal(tr.times[0], 0);
  const linked = textOf(await call('simulate', { target: 'circuits/sim', falstad: true, lang: 'es' }));
  assert.match(linked, /Abrir en Falstad: https:\/\/www\.falstad\.com\/circuit\/circuitjs\.html\?cct=/);
});

test('language: a circuit with "lang" answers and writes in it; an explicit lang wins', async () => {
  const created = jsonOf(await call('create_circuit', { target: 'circuits/es', circuit: { ...led, lang: 'es' }, author: 'test' }));
  assert.match(readFileSync(join(root, created.files.pageFile), 'utf8'), /<html lang="es">/);
  assert.match(textOf(await call('simulate', { target: 'circuits/es' })), /un modelo, no una medición/, 'Spanish without asking (server default is en)');
  assert.match(textOf(await call('simulate', { target: 'circuits/es', lang: 'en' })), /a model, not a measurement/);
  await call('render', { target: 'circuits/es', page: true, lang: 'en' });
  assert.match(readFileSync(join(root, 'circuits/es/out/es.html'), 'utf8'), /<html lang="en">/, 'page in the language asked for');
});
