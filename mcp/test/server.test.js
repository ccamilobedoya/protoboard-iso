// End-to-end: start the server over stdio with a temporary root and call its tools with
// the MCP client, exactly as an assistant would.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../../scripts/tmp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = tempDir('protoboard-mcp-');
const led = JSON.parse(readFileSync(new URL('../../examples/led-resistor.json', import.meta.url), 'utf8'));
let client;

const call = async (name, args = {}) => client.callTool({ name, arguments: args });
const textOf = (r) => r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
const jsonOf = (r) => JSON.parse(r.content.find((c) => c.type === 'text').text); // a reload note may follow as its own block

before(async () => {
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: [new URL('../server.js', import.meta.url).pathname], env: { ...process.env, PROTOBOARD_ROOT: root, PROTOBOARD_LANG: 'en', PROTOBOARD_DEV: '1' } }),
  );
});
after(async () => client?.close());

test('the server lists its tools with schemas and gives work instructions', async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['apply_ops', 'catalog', 'create_circuit', 'get_circuit', 'history', 'inspect', 'layout', 'list_circuits', 'netlist', 'query', 'render', 'review', 'simulate', 'suggest', 'try_ops', 'undo']);
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

test('every MCP tool named in an agent\'s instructions is in its tools list', async () => {
  // The layout agent's instructions said "layout first" for days while its tools list lacked
  // layout: it could only reach it through the CLI.
  const { readdirSync } = await import('node:fs');
  const { tools } = await client.listTools();
  const dir = new URL('../../.claude/agents/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const [, front = '', ...rest] = readFileSync(new URL(file, dir), 'utf8').split('---');
    const listed = new Set([...front.matchAll(/mcp__protoboard-iso__(\w+)/g)].map((m) => m[1]));
    if (!listed.size) continue;
    const body = rest.join('---');
    for (const { name } of tools) if (body.includes(`\`${name}\``)) assert.ok(listed.has(name), `${file} tells the agent to use "${name}" but does not list mcp__protoboard-iso__${name}`);
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
  const tried = jsonOf(await call('try_ops', { target: 'circuits/led', ops, format: 'json' }));
  assert.equal(tried.applied, false, 'try_ops only dry-runs');
  assert.deepEqual(tried.diff, dry.diff, 'the same answer as apply_ops with dry_run');
  assert.equal(jsonOf(await call('get_circuit', { target: 'circuits/led', format: 'json' })).revision, 0, 'nothing saved');
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
  else {
    const said = withPng.content.map((c) => c.text ?? '').join('\n');
    assert.match(said, /PNG is not available in this install: the SVG and the page are\./);
    assert.doesNotMatch(said, /npm install/);
  }
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
  assert.match(compact, /\npower\n(  .*\n)*  regulator: .*7805/);
  // Parts and boards plus the recipes (what a small model should look at first).
  assert.ok(compact.length < 5000, `compact catalog is ${compact.length} characters`);
  const one = jsonOf(await call('catalog', { name: 'L7805CV', format: 'json' }));
  assert.equal(one.part, '7805');
  assert.deepEqual(one.pins, ['IN', 'GND', 'OUT']);
  const type = jsonOf(await call('catalog', { name: 'header', format: 'json' }));
  assert.ok(type.fields.count && type.fields.pin1);
  assert.equal(type.example.part.type, 'header');
  assert.ok((await call('catalog', { name: 'flux-capacitor' })).isError);
  assert.ok(jsonOf(await call('catalog', { format: 'json' })).partNumbers['1N4007'], 'the full registry as JSON');
});

test('catalog: a part answers what it is, what each pin does and the limits the simulator checks', async () => {
  const led = textOf(await call('catalog', { name: 'led' }));
  assert.match(led, /\n {2}about: LED: a diode that gives light\. .*The long lead is the anode/);
  assert.match(led, /\n {2}pin roles: anode · the \+ side, in; cathode · the − side, out\n/);
  assert.match(led, /\n {2}limits \(the simulator's\): rated current 20 mA · maximum current 30 mA · maximum reverse voltage 5 V\n/);
  const es = textOf(await call('catalog', { name: 'resistor', lang: 'es' }));
  assert.match(es, /\n {2}límites \(los del simulador\): la potencia hasta 250 mW, por defecto \(campo power\)\n/);
  const q = jsonOf(await call('catalog', { name: '2N2222A', format: 'json' }));
  assert.deepEqual(q.limits, [{ kind: 'max', quantity: 'power', value: 0.5, unit: 'W' }]);
  assert.ok(q.about.startsWith('NPN bipolar transistor'));
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
  utimesSync(file, before.atime, new Date(Date.now() + 1000)); // real clock: a file time, not a wait
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
  const before = JSON.parse((await call('get_circuit', { target: 'circuits/laid-out', format: 'json' })).content[0].text).circuit;
  assert.deepEqual(before.spec.nets, [['R1.1', 'T+'], ['R1.2', 'D1.anode'], ['D1.cathode', 'T-']]);
  assert.ok(before.spec.wires.every((id) => before.parts.find((p) => p.id === id).type === 'wire'));

  // Lay it out again: a new value and one more part on the LED's strip, nets kept for the rest.
  assert.ok((await call('layout', { target: 'circuits/laid-out', nets: [['R1.1', 'T+']], expect_revision: 7 })).isError, 'revision guard');
  const again = await call('layout', {
    target: 'circuits/laid-out',
    parts: [{ id: 'R1', type: 'resistor', value: '1k' }, { id: 'D1', type: 'led', color: 'red' }],
    expect_revision: 0,
  });
  assert.ok(!again.isError, again.content[0].text);
  assert.match(again.content[0].text, /STATUS: DONE[\s\S]*rev 1/);
  const after = JSON.parse((await call('get_circuit', { target: 'circuits/laid-out', format: 'json' })).content[0].text).circuit;
  const pinsOf = (c, id) => JSON.stringify(c.parts.find((p) => p.id === id).pins);
  assert.equal(pinsOf(after, 'R1'), pinsOf(before, 'R1'), 'R1 keeps its holes');
  assert.equal(pinsOf(after, 'D1'), pinsOf(before, 'D1'), 'D1 keeps its holes');
  assert.equal(after.parts.find((p) => p.id === 'R1').value, '1k');
  assert.ok(!(await call('undo', { target: 'circuits/laid-out' })).isError);
  const undone = JSON.parse((await call('get_circuit', { target: 'circuits/laid-out', format: 'json' })).content[0].text).circuit;
  assert.equal(undone.parts.find((p) => p.id === 'R1').value, '330');

  // The kept nets are checked by every review: a jumper removed by hand blocks.
  const jumper = undone.spec.wires[0];
  assert.ok(!(await call('apply_ops', { target: 'circuits/laid-out', ops: [{ op: 'remove', part: jumper }] })).isError);
  assert.match((await call('review', { target: 'circuits/laid-out' })).content[0].text, /Net \d of the spec/);
});

test('layout on a circuit not made by layout needs its nets', async () => {
  assert.ok(!(await call('create_circuit', { target: 'circuits/by-hand', circuit: led })).isError);
  const r = await call('layout', { target: 'circuits/by-hand' });
  assert.ok(r.isError);
  assert.match(r.content[0].text, /not made by layout/);
});

test('layout check_only reads parts by name and reports every problem without creating anything', async () => {
  const ok = await call('layout', { target: 'circuits/checked', parts: [{ id: 'U1', part: 'L7805CV' }, { id: 'S1', part: 'KCD1' }], nets: [['U1.IN', 'S1.2'], ['S1.1', 'T+'], ['U1.GND', 'T-'], ['U1.OUT']], check_only: true });
  assert.ok(!ok.isError);
  assert.match(ok.content[0].text, /U1: regulator 7805/);
  const bad = await call('layout', { target: 'circuits/checked', parts: [{ id: 'U1', part: '7805' }], nets: [['U1.SENSE', 'T+']], check_only: true });
  assert.ok(bad.isError);
  assert.match(bad.content[0].text, /IN, GND, OUT/);
  assert.match(bad.content[0].text, /STATUS: FIX_SPEC/);
  assert.ok((await call('get_circuit', { target: 'circuits/checked' })).isError, 'nothing created');
});

test('layout dry_run: the same answer, a trial line, a STATUS that says nothing was saved, nothing written, new or existing', async () => {
  const trial = await call('layout', { target: 'trial-led', recipe: 'led-resistor', values: { V1: 9 }, dry_run: true });
  assert.ok(!trial.isError, textOf(trial));
  assert.match(textOf(trial), /\nTrial: nothing was saved\.\nSTATUS: DONE · [^\n]*$/);
  assert.equal(trial.structuredContent, undefined);
  assert.equal(trial._meta, undefined);
  assert.ok(!existsSync(join(root, 'trial-led')), 'no folder');
  const made = await call('layout', { target: 'trial-led', recipe: 'led-resistor', values: { V1: 9 } });
  // The STATUS words differ on purpose: a trial says nothing was saved (C12).
  const steady = (text) => text.replace(/ \d+ ms /, ' … ms ').split('\n').filter((l) => !/^(Trial: |trial-led · rev |Page: |STATUS: )/.test(l)).join('\n');
  assert.equal(steady(textOf(trial)), steady(textOf(made)));
  assert.match(textOf(trial), /STATUS: DONE · as tried, the circuit would be ready[^\n]*nothing was saved/);
  assert.match(textOf(made), /STATUS: DONE · the circuit is ready/);
  const file = join(root, 'trial-led', 'circuit.json');
  const before = [readFileSync(file, 'utf8'), readFileSync(join(root, 'trial-led', 'history.jsonl'), 'utf8')];
  const again = await call('layout', { target: 'trial-led', recipe: 'led-resistor', values: { V1: 9, R1: '10' }, dry_run: true, lang: 'es' });
  assert.match(textOf(again), /\nEnsayo: no se guardó nada\.\nSTATUS: WARNINGS · /);
  assert.match(textOf(again), /\nPara arreglarlo: R1 = \d+ Ω deja a R1 en [^\n]* y a D1 en/);
  assert.deepEqual([readFileSync(file, 'utf8'), readFileSync(join(root, 'trial-led', 'history.jsonl'), 'utf8')], before, 'the circuit is untouched');
});

test('layout fix: the kit applies its own computed fix as one revision; with nothing to fix or a spec too it says so', async () => {
  const made = await call('layout', { target: 'fix-led', recipe: 'led-resistor', values: { V1: 9, R1: '10' } });
  assert.match(textOf(made), /STATUS: WARNINGS/);
  const value = /To fix it: R1 = (\d+) Ω/.exec(textOf(made))?.[1];
  assert.ok(value, textOf(made));
  const both = await call('layout', { target: 'fix-led', fix: true, values: { R1: '1k' } });
  assert.ok(both.isError);
  assert.match(textOf(both), /Give the fix or a spec \(or values\), not both/);
  const fixed = await call('layout', { target: 'fix-led', fix: true });
  assert.ok(!fixed.isError, textOf(fixed));
  assert.match(textOf(fixed), new RegExp(`\\nApplied the fix: R1 = ${value} Ω\\.\\n[^]*STATUS: DONE`));
  assert.doesNotMatch(textOf(fixed), /⚠/);
  const history = textOf(await call('history', { target: 'fix-led' }));
  assert.match(history, /rev 1 [^\n]*layout fix/);
  const none = await call('layout', { target: 'fix-led', fix: true, lang: 'es' });
  assert.ok(!none.isError);
  assert.match(textOf(none), /Nada que arreglar: tal como está conectado, ningún componente de fix-led se dañaría\. No se cambió nada\./);
  assert.match(textOf(await call('history', { target: 'fix-led' })), /rev 1 /, 'no revision more');
  assert.doesNotMatch(textOf(await call('history', { target: 'fix-led' })), /rev 2 /);
});

test('layout with a goal: the kit picks the standard value and says so; without one, the advisory', async () => {
  const solved = await call('layout', { target: 'goal-led', recipe: 'led-resistor', values: { V1: 9, D1: { current: '15mA' } } });
  assert.ok(!solved.isError, textOf(solved));
  assert.match(textOf(solved), /\nSolved: R1 = 470 Ω \(E24\) for D1 at 15 mA: 15\.\d mA simulated, \d+ % over \(next values: 430 Ω [^)]*\)\nReadings /);
  assert.doesNotMatch(textOf(solved), /\nWorth checking:/);
  assert.match(textOf(solved), /STATUS: DONE/);
  const stored = JSON.parse((await call('get_circuit', { target: 'goal-led', format: 'json' })).content[0].text).circuit;
  assert.deepEqual(stored.spec.recipe, { name: 'led-resistor', values: { V1: 9, R1: '470' } });
  const advised = await call('layout', { target: 'goal-advice', recipe: 'led-resistor', values: { V1: 9 } });
  assert.match(textOf(advised), /\nWorth checking: D1 is at 10\d % of its rated 20 mA with R1 = 330 Ω; R1 = \d+ Ω would give [\d.]+ mA\.\n/);
  assert.match(textOf(advised), /STATUS: DONE/);
  const wrong = await call('layout', { target: 'goal-bad', recipe: 'led-resistor', values: { D1: { current: 'abc' } } });
  assert.ok(wrong.isError);
  assert.match(textOf(wrong), /D1\.current: the kit does not understand the value abc[^\n]*\nSTATUS: FIX_SPEC/);
});

test('a part that burns only with the button pressed: layout ends WARNINGS saying so, review has the state in JSON', async () => {
  const made = await call('layout', { target: 'pressed-burns', recipe: 'npn-switch', values: { R2: '47', V1: 12 } });
  assert.match(textOf(made), /⚠ warning: D1 carries 178 mA, more than its maximum 30 mA: it burns out, with S1 pressed\./);
  assert.match(textOf(made), /STATUS: WARNINGS/);
  const r = jsonOf(await call('review', { target: 'pressed-burns', format: 'json' }));
  assert.equal(r.verdict, 'approved-with-warnings');
  assert.deepEqual(r.hazards.find((h) => h.params.part === 'D1').when, { part: 'S1', field: 'pressed', value: true });
});

test('layout with a recipe: ready in one call, the catalog lists it, bad values change nothing', async () => {
  const listed = await call('catalog', {});
  assert.match(listed.content[0].text, /transistors = npn-switch, /); // names by group; the title is in the recipe's own entry
  assert.ok(!/R1=1k/.test(listed.content[0].text), 'the compact list leaves the values to the entry');
  assert.match((await call('catalog', { name: 'npn-switch' })).content[0].text, /Q1: part = 2N2222A \[2N2222A \| 2N3904/);
  const made = await call('layout', { target: 'recipe-switch', recipe: 'npn-switch', values: { R1: '470', V1: 9 } });
  assert.ok(!made.isError, made.content[0].text);
  assert.match(made.content[0].text, /STATUS: DONE/);
  // The answer says what the reply needs: the readings at rest and what the recipe lets change, now.
  assert.match(made.content[0].text, /\nReadings \(at rest, a model\): supply 9 V · D1 [\d.]+ [pnµm]?A, brightness \d+ % of 20 mA\n/);
  assert.match(made.content[0].text, /\nCan change \(layout with the recipe and values\): R1 = 470 \(base resistor\) · R2 = 330 [^\n]* · V1 = 9 V \[3…12\] · D1 current \(a goal: \{"D1":\{"current":"15mA"\}\}\)\nSTATUS: DONE/);
  const again = await call('layout', { target: 'recipe-switch' });
  assert.match(again.content[0].text, /\nCan change [^\n]*R1 = 470 [^\n]*\n/, 'layout again on the target says it too');
  const blink = await call('layout', { target: 'recipe-blink', recipe: 'uno-blink', lang: 'es' });
  assert.match(blink.content[0].text, /\nPrograma U1 \(sketch de Arduino\):\n {2}\/\/ Blink: D13/);
  assert.doesNotMatch(blink.content[0].text, /Lecturas/);
  const circuit = JSON.parse((await call('get_circuit', { target: 'recipe-switch', format: 'json' })).content[0].text).circuit;
  assert.deepEqual(circuit.spec.recipe, { name: 'npn-switch', values: { R1: '470', V1: 9 } });
  assert.equal(circuit.parts.find((p) => p.id === 'R1').value, '470');
  const bad = await call('layout', { target: 'recipe-bad', recipe: 'npn-switch', values: { Q1: 'IRLZ44N' } });
  assert.ok(bad.isError);
  assert.match(bad.content[0].text, /RECIPE|2N3904/);
  assert.match(bad.content[0].text, /STATUS: FIX_SPEC/);
  const unreadable = await call('layout', { target: 'recipe-bad', recipe: 'led-resistor', values: { R1: 'abc' } });
  assert.ok(unreadable.isError);
  assert.match(unreadable.content[0].text, /R1: the kit does not understand the value "abc"\. It takes a resistance in ohms, such as 330, 4k7/);
  assert.match(unreadable.content[0].text, /STATUS: FIX_SPEC/);
  const both = await call('layout', { target: 'recipe-bad', recipe: 'divider', nets: [['R1.1', 'T+']] });
  assert.ok(both.isError);
  assert.ok((await call('get_circuit', { target: 'recipe-bad' })).isError, 'nothing created');
});

test('simulate run_s: the same run, text and structure as simulate --run on the command line', async () => {
  const { spawnSync } = await import('node:child_process');
  const laid = await call('layout', { target: 'run-button', recipe: 'uno-button' });
  assert.ok(!laid.isError, textOf(laid));
  const args = { target: 'run-button', run_s: 1, press: ['S1@0.3+0.4'] };
  const json = jsonOf(await call('simulate', { ...args, format: 'json' }));
  const d1 = json.outputs.find((o) => o.id === 'D1');
  assert.equal(d1.intervals.length, 1);
  assert.ok(Math.abs(d1.intervals[0][1] - d1.intervals[0][0] - 0.4) < 0.02);
  const bin = new URL('../../bin/protoboard-iso.js', import.meta.url).pathname;
  const target = join(root, 'run-button');
  const cli = (extra) => spawnSync(process.execPath, [bin, 'simulate', target, '--run', '1', '--press', 'S1@0.3+0.4', ...extra], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(cli(['--json']).stdout), json);
  assert.equal(textOf(await call('simulate', args)), cli([]).stdout.trimEnd());
  // Errors are tool errors with the line.
  const bad = await call('simulate', { target: 'run-button', run_s: 1, environment: { nonsense: 1 } });
  assert.ok(bad.isError);
  assert.match(textOf(bad), /"nonsense" is not a field of the environment/);
});

test('simulate serial: text typed to a board in a run, as simulate --run … --serial; only with run_s', async () => {
  const { spawnSync } = await import('node:child_process');
  const menu = "void setup() { Serial.begin(9600); pinMode(8, OUTPUT); Serial.println(\"Type 1 or 2\"); }\nvoid loop() { if (Serial.available() > 0) { char c = Serial.read(); if (c == '1') { digitalWrite(8, HIGH); Serial.println(\"LED 1 on\"); } } }";
  const laid = await call('layout', { target: 'run-serial', parts: [{ id: 'U1', part: 'UNO', program: menu }, { id: 'R1', type: 'resistor', value: '220' }, { id: 'D1', type: 'led', color: 'red' }], nets: [['U1.D8', 'R1.1'], ['R1.2', 'D1.A'], ['D1.K', 'U1.GND']] });
  assert.ok(!laid.isError, textOf(laid));
  const args = { target: 'run-serial', run_s: 1, serial: ['1\\n@0.5'] };
  const json = jsonOf(await call('simulate', { ...args, format: 'json' }));
  assert.deepEqual(json.serial.lines.map((l) => l.text), ['Type 1 or 2', 'LED 1 on']);
  const bin = new URL('../../bin/protoboard-iso.js', import.meta.url).pathname;
  const cli = spawnSync(process.execPath, [bin, 'simulate', join(root, 'run-serial'), '--run', '1', '--serial', '1\\n@0.5'], { encoding: 'utf8' });
  assert.equal(textOf(await call('simulate', args)), cli.stdout.trimEnd());
  const dc = await call('simulate', { target: 'run-serial', serial: ['1@0.5'] });
  assert.ok(dc.isError);
  assert.match(textOf(dc), /serial works with --run/);
  const bad = await call('simulate', { target: 'run-serial', run_s: 1, serial: ['1'] });
  assert.ok(bad.isError);
  assert.match(textOf(bad), /--serial/);
});
