// A root that does not exist yet: the desktop extension (scripts/pack-mcpb.js) passes the folder the
// person chose at install, which may not be there. The server starts, says so in plain words, and the
// first circuit creates it.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../../scripts/tmp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = join(tempDir('protoboard-root-'), 'Documents', 'Protoboard');
let client;

const call = async (name, args = {}) => client.callTool({ name, arguments: args });
const textOf = (r) => r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');

before(async () => {
  client = new Client({ name: 'test', version: '0.0.0' }, { capabilities: {} });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [new URL('../server.js', import.meta.url).pathname], env: { ...process.env, PROTOBOARD_ROOT: root, PROTOBOARD_LANG: 'en', PROTOBOARD_APPS: 'on' } }));
});
after(async () => client?.close());

test('a root that does not exist yet: the tools answer, and layout creates it with the first circuit', async () => {
  assert.ok(!existsSync(root));
  const list = await call('list_circuits');
  assert.ok(!list.isError, textOf(list));
  assert.match(textOf(list), /does not exist yet, and layout creates it/);
  assert.deepEqual(JSON.parse(textOf(await call('list_circuits', { format: 'json' }))).circuits, []);
  for (const [name, args] of [['catalog', {}], ['selection', {}], ['get_circuit', { target: 'circuits/led' }]]) {
    const r = await call(name, args);
    assert.doesNotMatch(textOf(r), /ENOENT|scandir/, `${name}: ${textOf(r)}`);
  }
  const made = await call('layout', { target: 'circuits/led', recipe: 'led-resistor' });
  assert.ok(!made.isError, textOf(made));
  assert.match(textOf(made), /STATUS: DONE/);
  assert.ok(existsSync(root));
  const after = textOf(await call('list_circuits'));
  assert.match(after, / · rev 0 · /);
  assert.doesNotMatch(after, /No circuits yet/);
});
