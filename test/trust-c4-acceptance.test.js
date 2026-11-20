// C4 acceptance: layout size is calculated first, never hangs, never runs out of memory.
// Each test is one item (E1-E9) of the contract, driven through the CLI as a child process (always
// with a timeout, so a hang fails the test instead of blocking it) or through the public exports.
// Timing bounds are the contract's figures times three, never "faster than"; behaviours are exact.
// The slow cases (E1, E2, E3, E4) run one layout each, and no case runs twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';
import { RECIPES, resolveRecipe } from '../src/recipes/index.js';
import { autoLayout } from '../src/layout.js';

const root = new URL('../', import.meta.url).pathname;
const bin = join(root, 'bin/protoboard-iso.js');

// The CLI as a child process, with a wall-clock timeout; `elapsed` in ms, `timedOut` when killed.
function cli(args, { timeout, nodeArgs = [] } = {}) {
  const started = Date.now();
  const r = spawnSync(process.execPath, [...nodeArgs, bin, ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, timeout, killSignal: 'SIGKILL' });
  return { ...r, elapsed: Date.now() - started, timedOut: r.error?.code === 'ETIMEDOUT', stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
const lastLine = (r) => r.stdout.trim().split('\n').at(-1);
const describe = (r) => `exit ${r.status} signal ${r.signal} elapsed ${r.elapsed} ms; last line: ${lastLine(r)}`;

const specFile = (dir, name, spec) => {
  const file = join(dir, name);
  writeFileSync(file, JSON.stringify(spec));
  return file;
};

// N LED + 220 ohm pairs from one UNO pin (D8): one net with U1.D8 and every Rn.1.
function pairsSpec(n, { split = false } = {}) {
  const parts = [{ id: 'U1', part: 'UNO' }];
  const nets = [];
  for (let i = 1; i <= n; i++) {
    parts.push({ id: `R${i}`, type: 'resistor', value: '220' }, { id: `D${i}`, type: 'led', color: 'red' });
    nets.push([`R${i}.2`, `D${i}.A`]);
  }
  const rs = Array.from({ length: n }, (_, i) => `R${i + 1}.1`);
  if (split) for (const r of rs) nets.push(['U1.D8', r]);
  else nets.push(['U1.D8', ...rs]);
  nets.push(['U1.GND', ...Array.from({ length: n }, (_, i) => `D${i + 1}.K`)]);
  return { parts, nets };
}

// The nets of a laid-out target as a sorted list of sorted "part.pin" lists (holes dropped).
function netsOf(target) {
  const r = cli(['nets', target, '--json'], { timeout: 30_000 });
  assert.equal(r.status, 0, `nets failed: ${r.stderr}${r.stdout}`);
  return JSON.parse(r.stdout).nets.map((n) => n.pins.map((p) => p.replace(/@.*$/, '')).sort()).sort((a, b) => a.join().localeCompare(b.join()));
}

// Every asked group of pins sits together in one net of the laid-out circuit.
function assertAskedNets(target, asked) {
  const nets = netsOf(target);
  const missing = asked.filter((group) => !nets.some((pins) => group.every((p) => pins.includes(p.replace(/\.A$/, '.anode').replace(/\.K$/, '.cathode')))));
  assert.deepEqual(missing, [], 'asked nets that are not in the circuit');
}

const askedPairs = (n) => [
  ...Array.from({ length: n }, (_, i) => [`R${i + 1}.2`, `D${i + 1}.A`]),
  ['U1.D8', ...Array.from({ length: n }, (_, i) => `R${i + 1}.1`)],
  ['U1.GND', ...Array.from({ length: n }, (_, i) => `D${i + 1}.K`)],
];

test('E1: 10 LED + 220 ohm pairs from one UNO pin finish within 60 s, not CHANGES, every net there', () => {
  const dir = tempDir('c4-e1-');
  const file = specFile(dir, 'spec.json', pairsSpec(10));
  const r = cli(['layout', join(dir, 'c'), file], { timeout: 60_000 });
  assert.ok(!r.timedOut && r.elapsed <= 60_000, `did not finish within 60 s (${describe(r)})`);
  assert.match(lastLine(r), /^STATUS: (WARNINGS|DONE)\b/, describe(r));
  assert.ok(existsSync(join(dir, 'c', 'circuit.json')));
  assertAskedNets(join(dir, 'c'), askedPairs(10));
});

test('E2: 20 pairs finish within 135 s and are not CHANGES', () => {
  const dir = tempDir('c4-e2-');
  const file = specFile(dir, 'spec.json', pairsSpec(20));
  const r = cli(['layout', join(dir, 'c'), file], { timeout: 135_000 });
  assert.ok(!r.timedOut && r.elapsed <= 135_000, `did not finish within 135 s (${describe(r)})`);
  assert.doesNotMatch(lastLine(r), /^STATUS: CHANGES/, describe(r));
  assert.match(lastLine(r), /^STATUS: (WARNINGS|DONE)\b/, describe(r));
});

test('E3: --budget 2 on the 20-pair spec ends within 15 s as CHANGES, says the budget, leaves a valid circuit.json', () => {
  const dir = tempDir('c4-e3-');
  const file = specFile(dir, 'spec.json', pairsSpec(20));
  const r = cli(['layout', join(dir, 'c'), file, '--budget', '2'], { timeout: 15_000 });
  assert.ok(!r.timedOut && r.elapsed <= 15_000, `did not end within 15 s (${describe(r)})`);
  assert.equal(r.status, 2, `exit code as for CHANGES (${describe(r)})`);
  assert.match(lastLine(r), /^STATUS: CHANGES/, describe(r));
  // The budget line's exact text is open in the contract: the stable part is the word "budget".
  assert.match(r.stdout, /budget/i, 'stdout has a line about the budget');
  const circuit = join(dir, 'c', 'circuit.json');
  assert.ok(existsSync(circuit), 'circuit.json exists');
  const parsed = JSON.parse(readFileSync(circuit, 'utf8'));
  assert.ok(Array.isArray(parsed.parts) && parsed.parts.length > 0, 'circuit.json has parts');
});

test('E4: 200 resistors in series on a 9 V battery: placed or refused, never out of memory, in 90 s', () => {
  const dir = tempDir('c4-e4-');
  const n = 200;
  const parts = [{ id: 'BT1', type: 'battery', format: '9V' }, ...Array.from({ length: n }, (_, i) => ({ id: `R${i + 1}`, type: 'resistor', value: '1k' }))];
  const nets = [['BT1.+', 'R1.1'], ...Array.from({ length: n - 1 }, (_, i) => [`R${i + 1}.2`, `R${i + 2}.1`]), [`R${n}.2`, 'BT1.-']];
  const file = specFile(dir, 'spec.json', { parts, nets });
  const target = join(dir, 'c');
  // A child capped at 1 GB of heap and 90 s: a kill by timeout or an out-of-memory exit is the failure.
  const r = cli(['layout', target, file], { timeout: 90_000, nodeArgs: ['--max-old-space-size=1024'] });
  assert.ok(!r.timedOut, `killed by the 90 s timeout (${describe(r)})`);
  assert.doesNotMatch(r.stdout + r.stderr, /heap out of memory|FATAL ERROR/, 'ran out of memory');
  assert.notEqual(r.status, 134, 'exit 134 (abort: out of memory)');
  assert.notEqual(r.signal, 'SIGABRT');
  assert.match(lastLine(r), /^STATUS: /, describe(r));
  if (/^STATUS: FIX_SPEC/.test(lastLine(r))) {
    // Refused by the calculation: two numbers (needed and available), and no folder created.
    const numbers = r.stdout.match(/\d+/g) ?? [];
    assert.ok(numbers.length >= 2, 'the refusal gives two numbers (needed, available)');
    assert.ok(!existsSync(target), 'no folder created');
  } else {
    assert.ok([0, 2].includes(r.status), describe(r));
    assert.ok(existsSync(join(target, 'circuit.json')));
  }
});

test('E5: a spec that cannot fit (400 DIP-8 ICs) is FIX_SPEC, exit 1, in under 5 s, nothing created', () => {
  const dir = tempDir('c4-e5-');
  const n = 400;
  const parts = Array.from({ length: n }, (_, i) => ({ id: `U${i + 1}`, part: 'NE555' }));
  const nets = Array.from({ length: n - 1 }, (_, i) => [`U${i + 1}.OUT`, `U${i + 2}.TRIG`]);
  const file = specFile(dir, 'spec.json', { parts, nets });
  const target = join(dir, 'c');
  const r = cli(['layout', target, file], { timeout: 5_000 });
  assert.ok(!r.timedOut && r.elapsed < 5_000, `not answered in 5 s (${describe(r)})`);
  assert.equal(r.status, 1, describe(r));
  assert.match(lastLine(r), /^STATUS: FIX_SPEC/, describe(r));
  assert.ok(!existsSync(target), 'nothing created');
});

test('E6: nets that share a pin are one net: same nets as the joined list, a note, not FIX_SPEC', () => {
  const dir = tempDir('c4-e6-');
  const split = specFile(dir, 'split.json', pairsSpec(3, { split: true }));
  const joined = specFile(dir, 'joined.json', pairsSpec(3));
  const a = cli(['layout', join(dir, 'a'), split], { timeout: 60_000 });
  assert.ok(!a.timedOut, describe(a));
  assert.doesNotMatch(lastLine(a), /^STATUS: FIX_SPEC/, describe(a));
  assert.match(lastLine(a), /^STATUS: /);
  assert.ok(existsSync(join(dir, 'a', 'circuit.json')), `no circuit (${describe(a)})`);
  const b = cli(['layout', join(dir, 'b'), joined], { timeout: 60_000 });
  assert.ok(!b.timedOut, describe(b));
  // The note's exact text is open. Stable parts: the split spec's answer has a note line that the
  // answer for the same pins in one list does not have, and it says the nets were joined (or merged).
  const notes = (r) => r.stdout.split('\n').filter((l) => /^\s*· note:/.test(l));
  // (The ground note, "joined to the B- rail", is another thing and is left out; it also carries the net's number.)
  const extra = notes(a).filter((l) => !notes(b).includes(l) && !/ground|rail/i.test(l));
  assert.ok(extra.some((l) => /join|merg/i.test(l)), `a note says the nets were joined; extra notes: ${JSON.stringify(extra)}`);
  assert.deepEqual(netsOf(join(dir, 'a')), netsOf(join(dir, 'b')));
});

// Fields that are times or revision metadata are removed before circuits are compared.
const withoutTimes = (value) => {
  if (Array.isArray(value)) return value.map(withoutTimes);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([k]) => !/^(revision|ms|at|time|timestamp|date|created|updated)$|(At|Ms|Time)$/.test(k)).map(([k, v]) => [k, withoutTimes(v)]));
  }
  return value;
};

test('E7: the same 5-pair spec twice gives the same circuit.json', () => {
  const dir = tempDir('c4-e7-');
  const file = specFile(dir, 'spec.json', pairsSpec(5));
  const run = (name) => {
    const r = cli(['layout', join(dir, name), file], { timeout: 120_000 });
    assert.ok(!r.timedOut, describe(r));
    return withoutTimes(JSON.parse(readFileSync(join(dir, name, 'circuit.json'), 'utf8')));
  };
  assert.deepEqual(run('a'), run('b'));
});

test('E8: every recipe still lays out to DONE (in process)', () => {
  const failures = [];
  for (const name of Object.keys(RECIPES)) {
    const { spec, problems } = resolveRecipe({ recipe: name });
    if (problems.length) {
      failures.push(`${name}: recipe problems ${problems.map((p) => p.code).join(',')}`);
      continue;
    }
    const r = autoLayout(spec, { lang: 'en' });
    if (r.status !== 'done') failures.push(`${name}: ${r.status}`);
  }
  assert.deepEqual(failures, []);
});

test('E9: --budget with a value that is not a number is refused by the parser, naming the option', () => {
  const dir = tempDir('c4-e9-');
  const r = cli(['layout', join(dir, 'x'), '--recipe', 'led-resistor', '--budget', 'abc'], { timeout: 30_000 });
  assert.ok([1, 2].includes(r.status), describe(r));
  const out = r.stdout + r.stderr;
  assert.doesNotMatch(out, /^\s+at |node:internal/m, 'no stack');
  assert.match(out, /--budget/, 'names the option');
  assert.doesNotMatch(out, /unknown option/i, 'the option exists; its value is what is wrong');
  assert.ok(!existsSync(join(dir, 'x')), 'nothing created');
  // And a good value is accepted (a trial, so nothing is written).
  const ok = cli(['layout', join(dir, 'y'), '--recipe', 'led-resistor', '--budget', '60', '--dry-run'], { timeout: 60_000 });
  assert.equal(ok.status, 0, describe(ok));
});
