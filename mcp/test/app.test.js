// MCP Apps (app.js): a client that announces the extension gets the viewer, page_parts and the
// links; one that does not gets exactly what it got before, and the same text from every tool.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../../scripts/tmp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fetchPageParts } from '../../src/page/client/app.js';

const root = tempDir('protoboard-app-');
const UI = { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } };
let plain;
let host;

const connect = async (capabilities, env = {}) => {
  const client = new Client({ name: 'test', version: '0.0.0' }, { capabilities });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [new URL('../server.js', import.meta.url).pathname], env: { ...process.env, PROTOBOARD_ROOT: root, PROTOBOARD_LANG: 'en', PROTOBOARD_APPS: 'auto', ...env } }));
  return client;
};
// The viewer's own fetch (manifest, then chunks), over a client; every result stays under the cap.
const sizes = [];
const fetchParts = (client, args, options) =>
  fetchPageParts(async (a) => {
    const r = await client.callTool({ name: 'page_parts', arguments: a });
    sizes.push(Buffer.byteLength(JSON.stringify(r)));
    if (r.isError) throw new Error(r.content[0].text);
    return r.structuredContent;
  }, args, options);
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

test('what a session loads grows by little with MCP Apps; the model-visible tool is short', async () => {
  const words = (tools) => tools.reduce((n, t) => n + Buffer.byteLength(`${t.title ?? ''}${t.description ?? ''}`), 0);
  const a = await plain.listTools();
  const b = await host.listTools();
  assert.ok(words(b.tools) - words(a.tools) <= 600, `${words(b.tools) - words(a.tools)} bytes`);
  const selection = b.tools.find((t) => t.name === 'selection');
  assert.ok(Buffer.byteLength(JSON.stringify(selection)) < 450, `${Buffer.byteLength(JSON.stringify(selection))} bytes`);
  assert.equal(selection._meta, undefined, 'visible to the model');
  assert.deepEqual(b.tools.find((t) => t.name === 'selection_set')._meta.ui.visibility, ['app'], 'app-only');
  assert.ok(!a.tools.some((t) => t.name.startsWith('selection')), 'nothing for a client without MCP Apps');
  console.log(`tools/list for an app client: +${Buffer.byteLength(JSON.stringify(b.tools)) - Buffer.byteLength(JSON.stringify(a.tools))} bytes; selection ${Buffer.byteLength(JSON.stringify(selection))}`);
  assert.equal(plain.getInstructions(), host.getInstructions());
});

test('layout answers the same text to both; the host also gets {target, revision, lang} and the pieces', async () => {
  const args = (target) => ({ target, recipe: 'led-resistor', values: { V1: 9 }, lang: 'es' });
  const a = await plain.callTool({ name: 'layout', arguments: args('led-a') });
  const b = await host.callTool({ name: 'layout', arguments: args('led-b') });
  assert.ok(!a.isError && !b.isError, textOf(a));
  const steady = (r) => textOf(r).replace(/ \d+ ms /, ' … ms '); // the time it took differs
  // The app client's text is the plain one plus exactly one final line: the board is already on screen.
  const note = "The user sees this circuit as a live board in the chat: do not render or draw it. What they tap is read with `selection`; never call the widget's own tools.";
  const esNote = 'El usuario ve este circuito como tablero vivo en el chat: no lo generes ni lo dibujes. Lo que toca se lee con `selection`; nunca llames las herramientas del widget.';
  assert.equal(steady(b), `${steady(a).replaceAll('led-a', 'led-b')}\n${esNote}`, 'same text plus one line');
  assert.ok(Buffer.byteLength(`\n${esNote}`) < 240 && Buffer.byteLength(`\n${note}`) < 240, 'the added line is short');
  const en = await host.callTool({ name: 'layout', arguments: { target: 'led-en', recipe: 'led-resistor', lang: 'en' } });
  assert.ok(textOf(en).endsWith(`\n${note}`));
  assert.ok(!textOf(await plain.callTool({ name: 'layout', arguments: { target: 'led-en2', recipe: 'led-resistor', lang: 'en' } })).includes('live board'));
  assert.equal(a.structuredContent, undefined);
  assert.deepEqual(b.structuredContent, { target: 'led-b', revision: 0, lang: 'es' });

  const got = await fetchParts(host, { target: 'led-b', revision: 0 });
  const p = got.parts;
  assert.equal(p.revision, 0);
  assert.equal(got.latest, 0);
  assert.equal(p.lang, 'es');
  assert.match(p.markup, /^<nav hidden>/);
  assert.ok(p.data.parts.R1 && p.program, 'part data and the program of a live page');
  assert.deepEqual(Object.keys(got.texts), ['context', 'newer', 'loading', 'failed']);
  const manifest = await host.callTool({ name: 'page_parts', arguments: { target: 'led-b', revision: 0 } });
  assert.ok(Buffer.byteLength(textOf(manifest)) < 100, 'the text of page_parts stays small');
});

test('apply_ops and undo show the board for a host (dry runs and other tools never do); other clients keep the same text', async () => {
  const { tools } = await host.listTools();
  const linked = tools.filter((x) => x._meta?.ui?.resourceUri && !x._meta.ui.visibility).map((x) => x.name).sort();
  assert.deepEqual(linked, ['apply_ops', 'layout', 'undo']);
  const plainTools = (await plain.listTools()).tools;
  assert.ok(plainTools.every((x) => x._meta === undefined));
  await plain.callTool({ name: 'layout', arguments: { target: 'chg-a', recipe: 'led-resistor', lang: 'en' } });
  await host.callTool({ name: 'layout', arguments: { target: 'chg-b', recipe: 'led-resistor', lang: 'en' } });
  const ops = (target) => ({ target, ops: [{ op: 'set', part: 'R1', value: '1k' }], expect_revision: 0, lang: 'en' });
  const a = await plain.callTool({ name: 'apply_ops', arguments: ops('chg-a') });
  const b = await host.callTool({ name: 'apply_ops', arguments: ops('chg-b') });
  assert.ok(!a.isError && !b.isError, textOf(a));
  const note = "The user sees this circuit as a live board in the chat: do not render or draw it. What they tap is read with `selection`; never call the widget's own tools.";
  assert.equal(textOf(b).replace(/chg-b/g, 'chg-a'), `${textOf(a)}\n${note}`.replace(/ \d+ ms /, ' … ms '), 'the same text plus the one line');
  assert.equal(a.structuredContent, undefined);
  assert.deepEqual(b.structuredContent, { target: 'chg-b', revision: 1, lang: 'en' });
  // a dry run, a failed change and the read-only tools show nothing
  const dry = await host.callTool({ name: 'apply_ops', arguments: { ...ops('chg-b'), expect_revision: 1, dry_run: true } });
  assert.equal(dry.structuredContent, undefined);
  const stale = await host.callTool({ name: 'apply_ops', arguments: ops('chg-b') });
  assert.ok(stale.isError && stale.structuredContent === undefined);
  assert.equal((await host.callTool({ name: 'try_ops', arguments: { target: 'chg-b', ops: [{ op: 'set', part: 'R1', value: '2k' }] } })).structuredContent, undefined);
  assert.equal((await host.callTool({ name: 'review', arguments: { target: 'chg-b' } })).structuredContent, undefined);
  const undone = await host.callTool({ name: 'undo', arguments: { target: 'chg-b' } });
  assert.deepEqual(undone.structuredContent, { target: 'chg-b', revision: 2, lang: 'en' });
});

test('page_parts pins a revision: an older one is rebuilt from the history', async () => {
  const before = await fetchParts(host, { target: 'led-b', revision: 0 });
  const changed = await host.callTool({ name: 'apply_ops', arguments: { target: 'led-b', ops: [{ op: 'set', part: 'R1', value: '1k' }], expect_revision: 0 } });
  assert.ok(!changed.isError, textOf(changed));
  const old = await fetchParts(host, { target: 'led-b', revision: 0 });
  const now = await fetchParts(host, { target: 'led-b', revision: 1 });
  assert.equal(old.parts.revision, 0);
  assert.equal(old.latest, 1);
  assert.deepEqual(old.parts.data, before.parts.data, 'revision 0 as it was');
  assert.equal(now.parts.revision, 1);
  assert.notDeepEqual(now.parts.data.parts.R1, old.parts.data.parts.R1);
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

test('selection: what the viewer tells the server, read back by the model; null clears; bounded; app clients only', async () => {
  await host.callTool({ name: 'layout', arguments: { target: 'sel', recipe: 'led-resistor', lang: 'en' } });
  const none = await host.callTool({ name: 'selection', arguments: { target: 'sel' } });
  assert.equal(textOf(none), 'Nothing is tapped on the board.');
  const set = await host.callTool({ name: 'selection_set', arguments: { target: 'sel', revision: 0, part: 'R1', line: 'Open on the board: R1, Resistance: 330 Ω, Current: 21.5 mA.' } });
  assert.ok(!set.isError, textOf(set));
  const got = textOf(await host.callTool({ name: 'selection', arguments: { target: 'sel' } }));
  assert.match(got, /^Open on the board: R1, Resistance: 330 Ω, Current: 21\.5 mA\. Tapped \d+ s ago, circuit sel, revision 0\.$/);
  // without a target: the most recent one, across targets
  await host.callTool({ name: 'selection_set', arguments: { target: 'led-a', revision: 0, part: 'D1', line: 'Open on the board: D1, Color: red.' } });
  assert.match(textOf(await host.callTool({ name: 'selection', arguments: {} })), /D1.*led-a/);
  // a newer revision is said
  await host.callTool({ name: 'apply_ops', arguments: { target: 'sel', ops: [{ op: 'set', part: 'R1', value: '1k' }], expect_revision: 0 } });
  assert.match(textOf(await host.callTool({ name: 'selection', arguments: { target: 'sel' } })), /revision 0, now at revision 1\./);
  // null clears
  await host.callTool({ name: 'selection_set', arguments: { target: 'sel', revision: 1, part: null, line: '' } });
  assert.equal(textOf(await host.callTool({ name: 'selection', arguments: { target: 'sel' } })), 'Nothing is tapped on the board.');
  // inputs are capped and the path stays in the root
  assert.ok((await host.callTool({ name: 'selection_set', arguments: { target: '../x', revision: 0, part: 'R1', line: 'x' } }).catch((e) => ({ isError: true, e }))).isError);
  assert.ok((await host.callTool({ name: 'selection_set', arguments: { target: 'sel', revision: 0, part: 'R1', line: 'x'.repeat(401) } }).catch(() => ({ isError: true }))).isError, 'a long line is refused');
  // bounded memory: 40 targets, only the last 32 are kept
  for (let k = 0; k < 40; k++) await host.callTool({ name: 'selection_set', arguments: { target: `many-${k}`, revision: 0, part: 'R1', line: `Open on the board: R1 ${k}.` } });
  assert.equal(textOf(await host.callTool({ name: 'selection', arguments: { target: 'many-0' } })), 'Nothing is tapped on the board.', 'the oldest is forgotten');
  assert.match(textOf(await host.callTool({ name: 'selection', arguments: { target: 'many-39' } })), /R1 39/);
  assert.ok(existsSync(join(root, '.protoboard', 'selection.json')) && !readdirSync(join(root, '.protoboard')).some((f) => f.endsWith('.tmp')), 'one hidden file, no temp left');
  assert.ok(!textOf(await host.callTool({ name: 'list_circuits', arguments: {} })).includes('selection'), 'never listed as a circuit');
  // a client without MCP Apps cannot call either
  for (const name of ['selection', 'selection_set']) {
    const r = await plain.callTool({ name, arguments: { target: 'sel' } }).catch(() => ({ isError: true }));
    assert.ok(r.isError, `${name} is not offered`);
  }
});

test('render does not push a model that sees the board to PNG; other clients keep the description', async () => {
  const render = (r) => r.tools.find((t) => t.name === 'render').description;
  const a = render(await plain.listTools());
  const b = render(await host.listTools());
  assert.match(a, /Add png_width to also get a PNG/);
  assert.ok(!/png_width/.test(b) && /already sees the circuit as a live board/.test(b), b);
});

test('app_report exists only with PROTOBOARD_APPS_DEBUG=1 and an app client; it writes capped lines inside the root', async () => {
  const names = async (c) => (await c.listTools()).tools.map((t) => t.name);
  assert.ok(!(await names(host)).includes('app_report'), 'not without the variable');
  const debugRoot = tempDir('protoboard-app-debug-');
  const env = { PROTOBOARD_ROOT: debugRoot, PROTOBOARD_APPS_DEBUG: '1' };
  const plainDebug = await connect({}, { ...env, PROTOBOARD_APPS: 'auto' });
  const hostDebug = await connect(UI, env);
  try {
    assert.ok(!(await names(plainDebug)).includes('app_report'), 'not for a client without MCP Apps');
    const refused = await plainDebug.callTool({ name: 'app_report', arguments: { event: 'x' } }).catch(() => ({ isError: true }));
    assert.ok(refused.isError, 'not callable');
    assert.ok(!existsSync(join(debugRoot, '.protoboard', 'app-report.jsonl')));
    const tool = (await hostDebug.listTools()).tools.find((t) => t.name === 'app_report');
    assert.deepEqual(tool._meta.ui.visibility, ['app']);
    const file = join(debugRoot, '.protoboard', 'app-report.jsonl');
    const r = await hostDebug.callTool({ name: 'app_report', arguments: { event: 'ui/initialize', detail: { hostInfo: { name: 'h' } } } });
    assert.ok(!r.isError, textOf(r));
    const lines = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(lines.length, 1);
    assert.equal(lines[0].event, 'ui/initialize');
    assert.deepEqual(lines[0].detail, { hostInfo: { name: 'h' } });
    assert.ok(!Number.isNaN(Date.parse(lines[0].t)));
    // detail is cut at 4 KB
    await hostDebug.callTool({ name: 'app_report', arguments: { event: 'big', detail: 'x'.repeat(20000) } });
    const big = JSON.parse(readFileSync(file, 'utf8').trim().split('\n')[1]);
    assert.ok(Buffer.byteLength(big.detail) < 4200 && big.detail.endsWith('[cut]'));
    // the file stops growing at 256 KB
    writeFileSync(file, 'x'.repeat(256 * 1024));
    await hostDebug.callTool({ name: 'app_report', arguments: { event: 'late' } });
    assert.equal(statSync(file).size, 256 * 1024);
    // page_parts tells the viewer that debugging is on; the path is fixed in the root
    await hostDebug.callTool({ name: 'layout', arguments: { target: 'd', recipe: 'led-resistor' } });
    const parts = await hostDebug.callTool({ name: 'page_parts', arguments: { target: 'd' } });
    assert.equal(parts.structuredContent.debug, true, 'the manifest says so');
    assert.ok(!existsSync(join(debugRoot, '..', '.protoboard', 'app-report.jsonl')));
    const off = await host.callTool({ name: 'page_parts', arguments: { target: 'led-b' } });
    assert.equal(off.structuredContent.debug, undefined);
  } finally {
    await plainDebug.close();
    await hostDebug.close();
  }
});
