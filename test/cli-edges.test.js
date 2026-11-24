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
  const dir = tempDir('cli-edges-batch-');
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
  const dir = tempDir('cli-edges-cap-');
  const target = led(dir);
  const ops = Array.from({ length: 3000 }, (_, i) => ({ op: 'add', part: { id: `X${i}`, type: 'resistor', value: '1k', pins: ['a1', 'a5'] } }));
  writeFileSync(join(dir, 'ops.json'), JSON.stringify(ops));
  const start = Date.now(); // real clock: a speed bound
  const r = cli(['apply', target, join(dir, 'ops.json')]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /more than the 1000 the kit accepts/);
  assert.ok(Date.now() - start < 30_000); // real clock: a speed bound
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
  const dir = tempDir('cli-edges-history-');
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
  const dir = tempDir('cli-edges-history2-');
  const target = led(dir);
  appendFileSync(join(target, 'history.jsonl'), '[1,2]\n');
  for (const command of ['undo', 'history']) {
    const r = cli([command, target]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /damaged at line 2.*--new-history/s, command);
    // They name the command that takes it (undo and history do not).
    assert.match(r.stderr, /make the next change with apply <folder> --ops '<json>' --new-history: it starts a new history/, command);
  }
});

test('apply says what review will say: a part moved off its strips, a program file missing or outside', () => {
  const dir = tempDir('cli-edges-judge-');
  const target = led(dir);
  const moved = cli(['apply', target, '--ops', '{"op":"move","part":"R1","pins":["i100","i104"]}', '--json']);
  assert.equal(moved.status, 0);
  const result = JSON.parse(moved.stdout);
  const review = JSON.parse(cli(['review', target, '--json']).stdout);
  assert.equal(review.verdict, 'changes');
  const key = (p) => `${p.code} ${JSON.stringify(p.params)}`;
  const introduced = new Set(result.diff.introduced.map(key));
  for (const b of review.blocking) assert.ok(introduced.has(key(b)), `apply said ${b.code} too`);
  assert.ok(result.newErrors >= 2);
  const text = cli(['undo', target]).stdout;
  assert.match(text, /✔ fixed: error: Net 1 of the spec/);

  const uno = join(dir, 'uno');
  assert.equal(cli(['layout', uno, '--recipe', 'uno-blink']).status, 0);
  for (const [program, code] of [['missing.ino', 'SIM_PROGRAM_FILE'], ['../../etc/x.ino', 'SIM_PROGRAM_OUTSIDE']]) {
    const r = cli(['apply', uno, '--ops', JSON.stringify({ op: 'set', part: 'U1', program }), '--json']);
    assert.equal(r.status, 0);
    assert.ok(JSON.parse(r.stdout).diff.introduced.some((p) => p.code === code), code);
    const doubts = JSON.parse(cli(['review', uno, '--json']).stdout).doubts;
    assert.ok(doubts.some((d) => d.code === code), `review says ${code} too`);
    assert.match(cli(['undo', uno]).stdout, new RegExp(`✔ fixed: warning: U1: its program file`));
  }
});

test('a chip whose supply pins are not both wired, or share a net, gets a doubt that names them', () => {
  const dir = tempDir('cli-edges-supply-');
  const cases = [
    ['op', { parts: [{ id: 'U1', part: 'LM358' }, { id: 'R1', type: 'resistor', value: '1k' }], supplies: [{ voltage: 5 }], nets: [['U1.OUT1', 'R1.1'], ['R1.2', 'T-'], ['U1.IN1+', 'T+'], ['U1.IN1-', 'T-']] }, /U1 has no supply: its supply pins VCC and GND are wired to nothing/],
    ['op-gnd', { parts: [{ id: 'U1', part: 'LM358' }, { id: 'R1', type: 'resistor', value: '1k' }], supplies: [{ voltage: 5 }], nets: [['U1.OUT1', 'R1.1'], ['R1.2', 'T-'], ['U1.IN1+', 'T+'], ['U1.IN1-', 'T-'], ['U1.GND', 'T-']] }, /its supply pin VCC is wired to nothing \(of VCC and GND\)/],
    ['555-one-net', { parts: [{ id: 'U1', part: 'NE555' }], supplies: [{ voltage: 9 }], nets: [['U1.GND', 'U1.TRIG', 'U1.OUT', 'U1.RESET', 'U1.CTRL', 'U1.THR', 'U1.DIS', 'U1.VCC', 'T+']] }, /U1 has no supply: its supply pins VCC and GND are on the same net/],
  ];
  for (const [name, spec, said] of cases) {
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(spec));
    const r = cli(['layout', join(dir, name), join(dir, `${name}.json`)]);
    assert.equal(r.status, 0, name);
    assert.match(r.stdout, said, name);
    assert.match(r.stdout, /STATUS: WARNINGS/, name);
    const check = JSON.parse(cli(['check', join(dir, name), '--json']).stdout);
    assert.ok(check.issues.some((i) => i.code === 'SUPPLY_PINS_UNWIRED' && i.severity === 'warning'), `check says it: ${name}`);
    assert.equal(JSON.parse(cli(['review', join(dir, name), '--json']).stdout).verdict, 'approved-with-warnings', name);
  }
  const es = cli(['review', join(dir, 'op'), '--lang', 'es']);
  assert.match(es.stdout, /U1 no tiene alimentación/);
  // Wired to its supply: nothing to say.
  for (const recipe of ['555-astable', 'opamp-comparator']) {
    const r = cli(['layout', join(dir, recipe), '--recipe', recipe, '--dry-run']);
    assert.doesNotMatch(r.stdout, /has no supply/, recipe);
  }
});

test('two batteries lie side by side: in series, in parallel, and in parallel facing opposite ways', () => {
  const dir = tempDir('cli-edges-batteries-');
  const bt = [{ id: 'BT1', type: 'battery', format: '9V' }, { id: 'BT2', type: 'battery', format: '9V' }];
  const led = [{ id: 'R1', type: 'resistor', value: '1k' }, { id: 'D1', type: 'led', color: 'red' }];
  const run = (name, spec) => {
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(spec));
    const r = cli(['layout', join(dir, name), join(dir, `${name}.json`), '--json']);
    return JSON.parse(r.stdout);
  };
  const series = run('series', { parts: [...bt, ...led], nets: [['BT1.+', 'R1.1'], ['R1.2', 'D1.A'], ['D1.K', 'BT2.-'], ['BT1.-', 'BT2.+']] });
  assert.ok(['done', 'warnings'].includes(series.status), series.status);
  assert.equal(series.failed?.length ?? 0, 0);
  const sim = JSON.parse(cli(['simulate', join(dir, 'series'), '--json']).stdout);
  assert.ok(sim.ok);
  // 18 V across 1 kΩ and a red LED: about 16 mA.
  assert.ok(Math.abs(sim.parts.D1.current) > 0.014 && Math.abs(sim.parts.D1.current) < 0.018, String(sim.parts.D1.current));
  const parallel = run('parallel', { parts: [...bt, ...led], nets: [['BT1.+', 'BT2.+', 'R1.1'], ['R1.2', 'D1.A'], ['D1.K', 'BT1.-', 'BT2.-']] });
  assert.equal(parallel.status, 'done');
  const opposite = cli(['layout', join(dir, 'opposite'), '--dry-run', writeSpec(dir, 'opposite', { parts: bt, nets: [['BT1.+', 'BT2.-'], ['BT1.-', 'BT2.+']] })]);
  assert.match(opposite.stdout, /BT2: \+→/);
  assert.match(opposite.stdout, /that looks like a short circuit/);
  assert.doesNotMatch(opposite.stdout, /found no place/);
});
function writeSpec(dir, name, spec) {
  const file = join(dir, `${name}.json`);
  writeFileSync(file, JSON.stringify(spec));
  return file;
}

test('a board alone is placed', () => {
  const dir = tempDir('cli-edges-board-');
  for (const part of ['UNO', 'ESP32-DEVKIT']) {
    const file = writeSpec(dir, part, { parts: [{ id: 'U1', type: 'module', part }], nets: [] });
    const r = cli(['layout', join(dir, `c-${part}`), file]);
    assert.equal(r.status, 0, r.stdout);
    assert.doesNotMatch(r.stdout, /found no place/);
    assert.match(r.stdout, /STATUS: DONE/, part);
  }
});

test('a dry run never says the circuit is built: layout --dry-run, and undo --dry-run changes nothing', () => {
  const dir = tempDir('cli-edges-dry-');
  const r = cli(['layout', join(dir, 'c'), '--recipe', 'led-resistor', '--dry-run']);
  assert.equal(r.status, 0);
  const status = r.stdout.trim().split('\n').at(-1);
  assert.match(status, /^STATUS: DONE · as tried, the circuit would be ready.*nothing was saved/);
  assert.doesNotMatch(status, /the circuit is ready/);
  const es = cli(['layout', join(dir, 'c'), '--recipe', 'led-resistor', '--dry-run', '--lang', 'es']);
  assert.match(es.stdout.trim().split('\n').at(-1), /no se guardó nada/);
  const target = led(dir, 'u');
  assert.equal(cli(['apply', target, '--ops', '{"op":"set","part":"R1","value":"1k"}']).status, 0);
  const before = readFileSync(join(target, 'circuit.json'), 'utf8');
  const u = cli(['undo', target, '--dry-run']);
  assert.equal(u.status, 0);
  assert.match(u.stdout, /^Dry run \(nothing saved\)/);
  assert.equal(readFileSync(join(target, 'circuit.json'), 'utf8'), before);
});

test('messages: --run echoes what was typed and has one lower bound, --transient says above 0, --start names its values', () => {
  const dir = tempDir('cli-edges-msg-');
  const target = led(dir);
  for (const value of ['abc', 'Infinity', '0', '1e-300']) {
    const r = cli(['simulate', target, '--run', value]);
    assert.equal(r.status, 1, value);
    assert.match(r.stderr, new RegExp(`a number from 1 µs to 60 .*not "${value}"`), value);
  }
  assert.equal(cli(['simulate', target, '--run', '1u']).status, 0);
  const es = cli(['simulate', target, '--run', 'abc', '--lang', 'es']);
  assert.match(es.stderr, /un número de 1 µs a 60 .*no "abc"/);
  const tr = cli(['simulate', target, '--transient', '0']);
  assert.equal(tr.status, 2);
  assert.match(tr.stderr, /--transient takes the time to simulate, above 0/);
  const start = cli(['simulate', target, '--transient', '1', '--start', 'xx']);
  assert.equal(start.status, 2);
  assert.match(start.stderr, /--start takes zero \| dc, not "xx"/);
  assert.doesNotMatch(start.stdout + start.stderr, /sim\.start\./);
});

test('messages: a part id with a space says ids have no spaces', () => {
  const dir = tempDir('cli-edges-space-');
  const file = writeSpec(dir, 's', { parts: [{ id: 'BT1', type: 'battery', format: '9V' }, { id: 'R 1', type: 'resistor', value: '330' }], nets: [['BT1.+', 'R 1.1'], ['R 1.2', 'BT1.-']] });
  const r = cli(['layout', join(dir, 'c'), file]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /"R 1": a part's id has no spaces.*Write it as "R1"/);
  assert.doesNotMatch(r.stdout, /neither a pin/);
  assert.match(cli(['layout', join(dir, 'c'), file, '--lang', 'es']).stdout, /no lleva espacios/);
});

test('messages: a resistance says which rule it breaks, and the spec and --set read it alike', () => {
  const dir = tempDir('cli-edges-ohms-');
  const target = led(dir);
  const cases = [['0', /"0" is not a resistance/], ['-100', /"-100" is not a resistance/], ['1e12', /no exponent \(1G, not 1e9\), from 100 mΩ to 99 GΩ/], ['1m', /"1m" is outside the resistances the kit takes, 100 mΩ to 99 GΩ/], ['1000G', /"1000G" is outside/], ['1T', /prefixes p, n, u, m, k, M, G/]];
  for (const [value, said] of cases) {
    const op = cli(['apply', target, '--ops', JSON.stringify({ op: 'set', part: 'R1', value }), '--dry-run']);
    assert.match(op.stdout, said, `apply ${value}`);
    const set = cli(['simulate', target, '--set', `R1=${value}`]);
    assert.equal(set.status, 1, `--set ${value}`);
    assert.match(set.stderr, said, `--set ${value}`);
  }
  assert.equal(cli(['simulate', target, '--set', 'R1=10M']).status, 0, '--set takes the spec\'s forms');
  assert.match(cli(['apply', target, '--ops', '{"op":"set","part":"R1","value":"0"}', '--dry-run', '--lang', 'es']).stdout, /«0» no es una resistencia/);
});

test('messages: --json answers are JSON, errors too; catalog lists; layout on an empty folder is one line', () => {
  const dir = tempDir('cli-edges-json-');
  const parse = (r) => JSON.parse(r.stdout);
  assert.ok(parse(cli(['catalog', '--json'])).types.resistor);
  const unknown = parse(cli(['catalog', 'zzz', '--json']));
  assert.equal(unknown.ok, false);
  assert.match(unknown.message, /does not know "zzz"/);
  const missing = cli(['check', join(dir, 'nope'), '--json']);
  assert.equal(missing.status, 1);
  assert.equal(parse(missing).ok, false);
  assert.equal(parse(cli(['review', join(dir, 'nope'), '--bogus', '--json'])).ok, false);
  assert.match(cli(['catalog', 'parts']).stdout, /^resistor /);
  assert.ok(parse(cli(['catalog', 'boards', '--json'])).boards.includes('bb830'));
  assert.match(cli(['catalog', 'recipes']).stdout, /led-resistor/);
  const empty = cli(['layout', dir]);
  assert.equal(empty.status, 1);
  assert.equal(empty.stdout.trim().split('\n').length, 1);
  assert.match(empty.stdout, /There is no circuit at .*a new one needs a spec .* or a recipe/);
});

test('a budget cut is the same on every run, or says plainly that it is not', async () => {
  const { autoLayout, formatLayout } = await import('../src/layout.js');
  const { t, formatIssue } = await import('../src/index.js');
  const leds = Array.from({ length: 10 }, (_, i) => [{ id: `R${i + 1}`, type: 'resistor', value: '220' }, { id: `D${i + 1}`, type: 'led', color: 'red' }]).flat();
  const nets = [['T+', ...Array.from({ length: 10 }, (_, i) => `R${i + 1}.1`)], ...Array.from({ length: 10 }, (_, i) => [`R${i + 1}.2`, `D${i + 1}.A`]), ['T-', ...Array.from({ length: 10 }, (_, i) => `D${i + 1}.K`)]];
  const spec = { parts: leds, nets, supplies: [{ voltage: 5 }] };
  const runs = [autoLayout(spec, { budget: 1 }), autoLayout(spec, { budget: 1 })];
  for (const r of runs) assert.ok(r.tried.placements > 0 && r.tried.max === 5000);
  if (runs.every((r) => !r.tried.byClock)) assert.deepEqual(runs[0].circuit.parts, runs[1].circuit.parts);
  for (const r of runs.filter((x) => x.tried.byClock)) assert.match(formatLayout(r, 'en', { t, formatIssue }), /this cut is not repeatable/);
});
