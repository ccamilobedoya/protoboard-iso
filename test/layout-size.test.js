// Layout calculates before it tries, never runs away and never runs out of memory (docs/en/layout.md,
// "Size and budget"): the size bound refuses only what cannot fit, the budget stops the search with
// its best try and says so, nets that share a pin are one net, and the same spec gives the same
// circuit. Timings are bounds far above the measured ones (the machine may be shared).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { autoLayout, validateSpec, estimateSize, joinSharedPins, specFromCircuit, formatLayout } from '../src/layout.js';
import { RECIPES, expandRecipe } from '../src/recipes/index.js';
import { LIMITS } from '../src/limits.js';
import { t } from '../src/i18n/index.js';
import { formatIssue } from '../src/index.js';
import { tempDir } from '../scripts/tmp.js';

const root = new URL('../', import.meta.url).pathname;
const cli = (cwd, ...args) => spawnSync(process.execPath, [join(root, 'bin/protoboard-iso.js'), ...args], { cwd, encoding: 'utf8' });

// n LEDs, each behind its 220 Ω resistor, all from one UNO pin (D8), cathodes to the UNO's GND.
function pairs(n, { shared = false } = {}) {
  const parts = [{ id: 'U1', part: 'UNO' }];
  const nets = [];
  for (let i = 1; i <= n; i++) {
    parts.push({ id: `R${i}`, type: 'resistor', value: '220' }, { id: `D${i}`, type: 'led', color: 'red' });
    nets.push([`R${i}.2`, `D${i}.A`]);
  }
  const fan = Array.from({ length: n }, (_, i) => `R${i + 1}.1`);
  if (shared) nets.push(...fan.map((r) => ['U1.D8', r]));
  else nets.push(['U1.D8', ...fan]);
  nets.push(['U1.GND', ...Array.from({ length: n }, (_, i) => `D${i + 1}.K`)]);
  return { parts, nets };
}

const recipeSpecs = () => Object.keys(RECIPES).map((name) => [name, expandRecipe(name).spec]);
const exampleSpecs = () => readdirSync(join(root, 'examples/layout')).filter((f) => f.endsWith('.json')).map((f) => [f, JSON.parse(readFileSync(join(root, 'examples/layout', f), 'utf8'))]);

test('the size bound passes every recipe, every layout example and every example circuit far below the board', () => {
  const circuits = readdirSync(join(root, 'examples'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(root, 'examples', f), 'utf8')))
    .filter((c) => Array.isArray(c.parts))
    .map((c, i) => [`example ${i}`, specFromCircuit(c, c.spec?.nets ? {} : { nets: [] })]);
  for (const [name, spec] of [...recipeSpecs(), ...exampleSpecs(), ...circuits]) {
    const valid = validateSpec(spec);
    const size = estimateSize(valid, spec.board ?? 'auto');
    assert.ok(size.needed <= size.available / 2, `${name}: ${size.needed} of ${size.available} columns`);
  }
});

test('a spec that cannot fit is FIX_SPEC at once, with the columns needed and available and how many parts fit', () => {
  const parts = [{ id: 'BT1', type: 'battery', format: '9V' }, ...Array.from({ length: 400 }, (_, i) => ({ id: `U${i + 1}`, part: 'NE555' }))];
  const nets = [['BT1.+', ...parts.slice(1).map((p) => `${p.id}.VCC`)], ['BT1.-', ...parts.slice(1).map((p) => `${p.id}.GND`)]];
  const started = Date.now();
  const r = autoLayout({ parts, nets });
  assert.ok(Date.now() - started < 5000);
  assert.equal(r.status, 'fix_spec');
  const p = r.problems.find((x) => x.code === 'LAYOUT_TOO_LARGE');
  assert.ok(p.params.needed > p.params.available, JSON.stringify(p.params));
  assert.equal(p.params.available, LIMITS.boardColumns);
  assert.ok(p.params.fit > 0 && p.params.fit < 401);
  const text = formatLayout(r, 'en', { t, formatIssue });
  assert.match(text, new RegExp(`${p.params.needed} columns needed, ${p.params.available} available`));
  assert.match(text.split('\n').at(-1), /^STATUS: FIX_SPEC/);
  assert.ok(text.split('\n').length < 10, 'its numbers, not a line per part');
});

test('the CLI refuses a spec too large: exit 1 and no folder', () => {
  const dir = tempDir('pb-size-');
  const parts = Array.from({ length: 300 }, (_, i) => ({ id: `U${i + 1}`, part: 'NE555' }));
  writeFileSync(join(dir, 'big.json'), JSON.stringify({ parts, nets: [] }));
  const r = cli(dir, 'layout', 'big', 'big.json');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout.trim().split('\n').at(-1), /^STATUS: FIX_SPEC/);
  assert.ok(!existsSync(join(dir, 'big')));
});

test('nets that share a pin are one net, said in one note, and the same circuit as the pins in one list', () => {
  const { nets, joined } = joinSharedPins([['U1.D8', 'R1.1'], ['R1.2', 'D1.A'], { pins: ['U1.D8', 'R2.1'], color: 'yellow' }, ['T-', 'D1.K'], ['T-', 'D2.K']]);
  assert.deepEqual(nets, [{ pins: ['U1.D8', 'R1.1', 'R2.1'], color: 'yellow' }, ['R1.2', 'D1.A'], ['T-', 'D1.K'], ['T-', 'D2.K']]);
  assert.deepEqual(joined, [{ nets: '1, 3', pins: 'U1.D8' }]);
  assert.deepEqual(joinSharedPins([['a.1', 'b.1']]).joined, [], 'nothing shared, nothing joined');

  const apart = autoLayout(pairs(2, { shared: true }));
  const together = autoLayout(pairs(2));
  assert.equal(apart.status, 'done', formatLayout(apart, 'en', { t, formatIssue }));
  const note = apart.notes.filter((n) => n.code === 'LAYOUT_NETS_JOINED');
  assert.equal(note.length, 1);
  assert.match(formatIssue(note[0], 'en'), /Nets 3, 4 share U1\.D8/);
  assert.deepEqual(apart.circuit, together.circuit);
});

test('the same spec gives the same circuit', () => {
  const a = autoLayout(pairs(5));
  const b = autoLayout(pairs(5));
  assert.equal(a.status, 'done');
  assert.deepEqual(a.circuit, b.circuit);
});

test('ten LEDs from one pin are built in one or two tries, not left to fix', () => {
  const started = Date.now();
  const r = autoLayout(pairs(10));
  assert.ok(Date.now() - started < 60_000, `${Date.now() - started} ms`);
  assert.ok(['done', 'warnings'].includes(r.status), formatLayout(r, 'en', { t, formatIssue }));
  assert.ok(r.check.ok);
  assert.ok(r.tries <= 2, `${r.tries} tries`);
});

test('the budget stops the search with its best try and a line that says so', () => {
  const started = Date.now();
  const r = autoLayout(pairs(10), { budget: 0.5 });
  assert.ok(Date.now() - started < 20_000, `${Date.now() - started} ms`);
  assert.equal(r.status, 'changes');
  const p = r.problems.find((x) => x.code === 'LAYOUT_BUDGET');
  assert.ok(p);
  assert.equal(p.params.seconds, 0.5);
  const text = formatLayout(r, 'en', { t, formatIssue });
  assert.match(text, /The search stopped at its budget of 0\.5 s/);
  assert.match(text, /a larger budget/);
  assert.match(formatLayout(r, 'es', { t, formatIssue }), /La búsqueda se detuvo/);
});

test('a budget above the cap is the cap, and says so; a budget not reached changes nothing', () => {
  const capped = autoLayout(expandRecipe('led-resistor').spec, { budget: LIMITS.layoutSeconds * 10 });
  assert.equal(capped.status, 'done');
  assert.equal(capped.budget, LIMITS.layoutSeconds);
  assert.ok(capped.notes.some((n) => n.code === 'LAYOUT_BUDGET_CAPPED'));
  const plain = autoLayout(expandRecipe('led-resistor').spec);
  assert.deepEqual(capped.circuit, plain.circuit);
});

test('the CLI reads --budget and refuses one that is not a number of seconds', () => {
  const dir = tempDir('pb-budget-');
  for (const bad of ['abc', '0', '-3']) {
    const r = cli(dir, 'layout', 'x', '--recipe', 'led-resistor', '--budget', bad);
    assert.equal(r.status, 2, bad);
    assert.match(r.stderr, /--budget/);
    assert.doesNotMatch(r.stderr, /at .*\.js:\d+/, 'no stack');
    assert.ok(!existsSync(join(dir, 'x')));
  }
  const ok = cli(dir, 'layout', 'x', '--recipe', 'led-resistor', '--budget', '30');
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
});
