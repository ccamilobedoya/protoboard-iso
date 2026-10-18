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
const jsonOf = (r) => JSON.parse(r.content.find((c) => c.type === 'text').text); // a reload note may follow as its own block

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
  assert.deepEqual(names, ['apply_ops', 'catalog', 'create_circuit', 'get_circuit', 'history', 'inspect', 'layout', 'list_circuits', 'netlist', 'query', 'render', 'review', 'simulate', 'suggest', 'undo']);
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

test('catalog: a compact list by default, one entry in detail by name', async () => {
  const compact = textOf(await call('catalog', {}));
  assert.match(compact, /regulator \(.*\) · .*7805/);
  assert.ok(compact.length < 4000, `compact catalog is ${compact.length} characters`);
  const one = jsonOf(await call('catalog', { name: 'L7805CV', format: 'json' }));
  assert.equal(one.part, '7805');
  assert.deepEqual(one.pins, ['IN', 'GND', 'OUT']);
  const type = jsonOf(await call('catalog', { name: 'header', format: 'json' }));
  assert.ok(type.fields.count && type.fields.pin1);
  assert.equal(type.example.part.type, 'header');
  assert.ok((await call('catalog', { name: 'flux-capacitor' })).isError);
  assert.ok(jsonOf(await call('catalog', { format: 'json' })).partNumbers['1N4007'], 'the full registry as JSON');
});

test('netlist: groups joined by wires, with the pins on each net', async () => {
  const r = jsonOf(await call('netlist', { target: 'circuits/led', format: 'json' }));
  const all = r.nets.flatMap((n) => n.pins);
  assert.ok(all.includes('R1.1@T+9'));
  assert.ok(r.nets.every((n) => n.pins.every((p) => !p.startsWith('W'))), 'wires are listed apart, not as pins');
  assert.match(textOf(await call('netlist', { target: 'circuits/led', lang: 'es' })), /redes/);
});

test('a target prefixed with a folder that does not exist lands next to the other circuits', async () => {
  await call('create_circuit', { target: 'flat', circuit: led, author: 'test' });
  const nested = jsonOf(await call('create_circuit', { target: 'circuitos/flat2', circuit: led, author: 'test' }));
  assert.equal(nested.target, 'flat2');
  assert.ok(existsSync(join(root, 'flat2/circuit.json')));
  assert.ok(!(await call('get_circuit', { target: 'circuits/flat2' })).isError, 'circuits/ exists here, but flat2 is found either way');
});

test('the server reloads the kit when its code changes', async () => {
  const { utimesSync, statSync } = await import('node:fs');
  const file = new URL('../../src/nets.js', import.meta.url);
  const before = statSync(file);
  assert.doesNotMatch(textOf(await call('list_circuits', {})), /reloaded/);
  utimesSync(file, before.atime, new Date(Date.now() + 1000));
  try {
    assert.match(textOf(await call('list_circuits', {})), /code changed: reloaded/);
    assert.doesNotMatch(textOf(await call('list_circuits', {})), /reloaded/);
  } finally {
    utimesSync(file, before.atime, before.mtime);
  }
});

test('suggest with parts answers one batch; review names the parts of each blocking item', async () => {
  const r = jsonOf(await call('suggest', { target: 'circuits/led', parts: [{ part: { type: 'led', color: 'green' }, between: ['20:f-j', '21:f-j'] }, { part: { type: 'resistor', value: '330' }, between: ['D2.cathode', 'T-'] }], profile: 'lesson', format: 'json' }));
  assert.equal(r.ops.length, 2);
  const dry = jsonOf(await call('apply_ops', { target: 'circuits/led', ops: r.ops, dry_run: true, format: 'json' }));
  assert.deepEqual(dry.errors, []);
  assert.ok((await call('suggest', { target: 'circuits/led' })).isError, 'part or parts');
  const explained = jsonOf(await call('review', { target: 'circuits/led', explain: true, format: 'json' }));
  assert.ok(explained.rules);
});

test('layout creates a whole circuit from parts and nets, with the nets check and the review', async () => {
  const r = await call('layout', {
    target: 'circuits/laid-out',
    parts: [{ id: 'R1', type: 'resistor', value: '330' }, { id: 'D1', type: 'led', color: 'red' }],
    nets: [['R1.1', 'T+'], ['R1.2', 'D1.anode'], ['D1.cathode', 'T-']],
    supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  });
  const text = r.content[0].text;
  assert.match(text, /Nets: every connection asked for is there/);
  assert.ok((await call('get_circuit', { target: 'circuits/laid-out' })).content[0].text.includes('"D1"'));
  assert.ok((await call('layout', { target: 'circuits/laid-out', parts: [{ id: 'R1', type: 'resistor', value: '1k' }], nets: [] })).isError, 'refuses to overwrite');
});

test('layout check_only reads parts by name and reports every problem without creating anything', async () => {
  const ok = await call('layout', { target: 'circuits/checked', parts: [{ id: 'U1', part: 'L7805CV' }, { id: 'S1', part: 'KCD1' }], nets: [['U1.IN', 'S1.2'], ['S1.1', 'T+'], ['U1.GND', 'T-'], ['U1.OUT']], check_only: true });
  assert.ok(!ok.isError);
  assert.match(ok.content[0].text, /U1: regulator 7805/);
  const bad = await call('layout', { target: 'circuits/checked', parts: [{ id: 'U1', part: '7805' }], nets: [['U1.VIN', 'T+']], check_only: true });
  assert.ok(bad.isError);
  assert.match(bad.content[0].text, /IN, GND, OUT/);
  assert.ok((await call('get_circuit', { target: 'circuits/checked' })).isError, 'nothing created');
});
