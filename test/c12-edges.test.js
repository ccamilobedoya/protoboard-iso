// Edge cases and careless or hostile use of the command line: what a stress run found the kit doing
// against its own rules, each case written from its reproduction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';

const root = new URL('../', import.meta.url).pathname;
const bin = join(root, 'bin/protoboard-iso.js');
const cli = (args, env = {}) => spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, ...env } });
const led = (dir, name = 'c') => {
  const target = join(dir, name);
  assert.equal(cli(['layout', target, '--recipe', 'led-resistor']).status, 0);
  return target;
};

test('apply: a batch of 900 add operations does not overflow the stack', () => {
  const dir = tempDir('c12-batch-');
  const target = led(dir);
  // Off the board, as the stress run had them: every part is measured, and refused as an input mistake.
  const ops = Array.from({ length: 900 }, (_, i) => ({ op: 'add', part: { id: `X${i}`, type: 'resistor', value: '1k', pins: [`i${10 + i}`, `j${10 + i}`] } }));
  writeFileSync(join(dir, 'ops.json'), JSON.stringify(ops));
  const r = cli(['apply', target, join(dir, 'ops.json'), '--dry-run']);
  assert.doesNotMatch(r.stdout + r.stderr, /internal error|call stack/);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^Refused/);
});

test('apply: 3000 add operations are refused by the parts cap, quickly', () => {
  const dir = tempDir('c12-cap-');
  const target = led(dir);
  const ops = Array.from({ length: 3000 }, (_, i) => ({ op: 'add', part: { id: `X${i}`, type: 'resistor', value: '1k', pins: ['a1', 'a5'] } }));
  writeFileSync(join(dir, 'ops.json'), JSON.stringify(ops));
  const start = Date.now();
  const r = cli(['apply', target, join(dir, 'ops.json')]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /more than the 1000 the kit accepts/);
  assert.ok(Date.now() - start < 30_000);
});

// Every id the kit accepts, also the names an object answers from its prototype.
const PROTO_IDS = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'];
test('page: a part called __proto__, constructor, toString, hasOwnProperty or valueOf opens its card, live and with the current layer', async (t) => {
  let JSDOM;
  let VirtualConsole;
  try {
    ({ JSDOM, VirtualConsole } = await import('jsdom'));
  } catch {
    t.skip('jsdom is not installed');
    return;
  }
  const { renderPage } = await import('../src/page.js');
  const [a, b, c, d, e] = PROTO_IDS;
  const circuit = {
    supplies: [{ id: 'V1', voltage: 5 }],
    page: { results: true, flow: true },
    parts: [
      { id: a, type: 'resistor', value: '220', pins: ['T+5', 'a5'] },
      { id: b, type: 'led', color: 'red', pins: ['e5', 'f5'] },
      { id: c, type: 'resistor', value: '1k', pins: ['j5', 'T-6'] },
      { id: d, type: 'wire', color: 'red', pins: ['b10', 'T+10'] },
      { id: e, type: 'capacitor', value: '100u', voltage: 25, pins: { '+': 'c10', '-': 'c12' } },
      { id: 'W9', type: 'wire', color: 'black', pins: ['a12', 'T-12'] },
    ],
  };
  const { html } = renderPage(circuit, { lang: 'en' });
  const data = JSON.parse(html.match(/<script type="application\/json" id="page-data">([\s\S]*?)<\/script>/)[1]);
  for (const id of PROTO_IDS) assert.ok(Object.hasOwn(data.parts, id), `${id} is in the page's data`);
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (err) => errors.push(String(err.detail?.message ?? err.message)));
  const dom = new JSDOM(html, { runScripts: 'outside-only', virtualConsole });
  const { window } = dom;
  for (const svg of window.document.querySelectorAll('svg')) svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 500 });
  window.addEventListener('error', (ev) => errors.push(String(ev.error?.message ?? ev.message)));
  window.eval(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  const live = window.protoboardLive;
  for (let k = 0; k < 10; k++) live?.tick(16);
  const doc = window.document;
  const info = doc.querySelector('.info');
  for (const id of PROTO_IDS) {
    const el = [...doc.querySelectorAll('svg:not([hidden]) .parts > [data-part]')].find((x) => x.dataset.part === id);
    assert.ok(el, `${id} is drawn`);
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    for (let k = 0; k < 3; k++) live?.tick(16);
    assert.ok(!info.hidden, `${id}: its card is open`);
    assert.ok(info.querySelector('h2').textContent.startsWith(id), `${id}: the card is its own (${info.querySelector('h2').textContent})`);
  }
  window.close();
  assert.deepEqual(errors, []);
});

test('apply refuses to build on a damaged history, and --new-history starts one from the circuit as it is', () => {
  const dir = tempDir('c12-history-');
  for (const [name, junk] of [['garbage', 'garbage{\n'], ['bytes', Buffer.from([0xff, 0xfe, 0x00, 0x9c, 0x7b, 0x22, 0x0a, 0xc3])]]) {
    const target = led(dir, name);
    appendFileSync(join(target, 'history.jsonl'), junk);
    const before = readFileSync(join(target, 'circuit.json'), 'utf8');
    const set = ['--ops', '{"op":"set","part":"R1","value":"1k"}'];
    for (const extra of [[], ['--dry-run']]) {
      const r = cli(['apply', target, ...set, ...extra]);
      assert.equal(r.status, 1, name);
      assert.match(r.stdout, /history file .*history\.jsonl is damaged at line 2/, name);
      assert.match(r.stdout, /circuit itself \(circuit\.json\) is intact/);
      assert.match(r.stdout, /--new-history/);
    }
    assert.equal(readFileSync(join(target, 'circuit.json'), 'utf8'), before, 'nothing saved');
    const es = cli(['apply', target, ...set, '--lang', 'es']);
    assert.match(es.stdout, /está dañado en la línea 2/);
    const again = cli(['apply', target, ...set, '--new-history']);
    assert.equal(again.status, 0, again.stdout + again.stderr);
    assert.match(again.stdout, /New history from revision 0: undo goes back no further\. The damaged one is kept as .*history\.jsonl\.damaged/);
    assert.ok(existsSync(join(target, 'history.jsonl.damaged')));
    assert.equal(cli(['history', target]).status, 0);
    assert.equal(cli(['undo', target]).status, 0);
    assert.match(cli(['undo', target]).stdout, /Nothing to undo/);
  }
});

test('undo and history on a damaged history say the same, with the way on', () => {
  const dir = tempDir('c12-history2-');
  const target = led(dir);
  appendFileSync(join(target, 'history.jsonl'), '[1,2]\n');
  for (const command of ['undo', 'history']) {
    const r = cli([command, target]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /damaged at line 2.*--new-history/s, command);
  }
});
