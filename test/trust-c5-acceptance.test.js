// C5 acceptance (F1-F11): an assistant can check what a circuit does from the command line.
// The CLI is spawned as a child process, always with a timeout. Every number below is computed by hand
// from the recipe in the catalog (comments beside each assertion).
//
// The shape of `simulate --run --json` is fixed by the contract's author:
//   { ok, run: {seconds, step}, serial: {count, lines: [{t, text}]},
//     outputs: [{id, kind, onShare, changes, frequency, period, duty, intervals: [[tOn, tOff], ...]}],
//     readings, issues }
// `intervals` are the times an output was on; the tests derive everything else from them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';

const root = new URL('../', import.meta.url).pathname;
const bin = join(root, 'bin/protoboard-iso.js');
const work = tempDir('trust-c5-');

const cli = (args, timeout = 120000) =>
  spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, timeout });

// Each recipe is laid out once per file, the first time a test asks for it.
const laid = new Map();
const lay = (recipe) => {
  if (!laid.has(recipe)) {
    const dir = join(work, recipe);
    const r = cli(['layout', dir, '--recipe', recipe], 240000);
    assert.equal(r.status, 0, `layout ${recipe}: ${r.stdout}${r.stderr}`);
    laid.set(recipe, { dir, answer: r.stdout });
  }
  return laid.get(recipe);
};

// `simulate <target> --run <s> [...] --json`, parsed.
const runJson = (recipe, seconds, extra = []) => {
  const r = cli(['simulate', lay(recipe).dir, '--run', String(seconds), ...extra, '--json']);
  assert.equal(r.status, 0, `simulate --run failed (exit ${r.status}): ${r.stdout}${r.stderr}`);
  let j;
  try { j = JSON.parse(r.stdout); } catch (e) { assert.fail(`stdout is not JSON: ${r.stdout.slice(0, 300)}`); }
  assert.equal(j.ok, true);
  return j;
};
const output = (j, id) => {
  const o = j.outputs.find((x) => x.id === id && x.kind === 'led') ?? j.outputs.find((x) => x.id === id);
  assert.ok(o, `no output ${id} in ${JSON.stringify(j.outputs.map((x) => x.id))}`);
  return o;
};
// Seconds the output was on inside [a, b], from its intervals.
const onTime = (o, a, b) => o.intervals.reduce((s, [t0, t1]) => s + Math.max(0, Math.min(t1, b) - Math.max(t0, a)), 0);
const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual}, expected ${expected} ± ${tol}`);

test('F1: distance-alarm-uno lights D1 at 10 cm and not at 50 cm', () => {
  // The sketch lights the LED when 0 < cm < 15, cm = pulseIn / 58 (round trip of the echo).
  // 10 cm -> 10 < 15 -> HIGH every loop (delay(100) + ~1 ms ping), so D1 is on for the whole last 0.5 s.
  const near10 = output(runJson('distance-alarm-uno', 1, ['--env', 'distance=10']), 'D1');
  assert.ok(onTime(near10, 0.5, 1) > 0.25, `on for ${onTime(near10, 0.5, 1)} s of the last 0.5 s, expected more than half`);
  // 50 cm -> 50 >= 15 -> LOW: not on at all in the last 0.5 s.
  const far = output(runJson('distance-alarm-uno', 1, ['--env', 'distance=50']), 'D1');
  assert.equal(onTime(far, 0.5, 1), 0, 'D1 on at 50 cm');
});

test('F2: uno-blink toggles D1 as its sketch says (500 ms on, 500 ms off = 1 Hz, 50 %)', () => {
  // Sketch: digitalWrite HIGH; delay(500); LOW; delay(500) -> period 1.0 s, f = 1 / 1.0 = 1 Hz (not 0.5 Hz),
  // on share 0.5. In 4 s that is 4 periods, 8 changes.
  const o = output(runJson('uno-blink', 4), 'D1');
  near(o.frequency, 1.0, 0.05, 'frequency (Hz)');
  near(o.period, 1.0, 0.05, 'period (s)');
  near(o.onShare, 0.5, 0.05, 'on share');
  near(o.duty, 0.5, 0.05, 'duty');
});

test('F3: 555-astable frequency within 5 % of 1.44 / ((R1 + 2 R2) C1)', () => {
  // Catalog: R1 = 1k, R2 = 10k, C1 = 10u (default values) -> f = 1.44 / ((1000 + 2*10000) * 10e-6)
  // = 1.44 / 0.21 = 6.857 Hz, period 0.1458 s; 2 s is 13 periods (>= 5).
  const f = 1.44 / ((1000 + 2 * 10000) * 10e-6);
  const o = output(runJson('555-astable', 2), 'D1');
  near(o.frequency, f, f * 0.05, 'frequency (Hz)');
});

test('F4: uno-button keeps D1 off until S1 is pressed, then on for 0.4 s', () => {
  // The recipe's button is S1 (catalog: {"id":"S1","type":"button"}); the sketch lights D13 while D2 reads
  // LOW (pressed). Without a press: off for the whole second.
  const idle = output(runJson('uno-button', 1), 'D1');
  assert.equal(onTime(idle, 0, 1), 0, 'D1 on with no press');
  // S1@0.3+0.4: pressed from 0.3 s to 0.7 s; loop delay is 10 ms, so D1 is on for 0.4 s (± 0.05).
  const pressed = output(runJson('uno-button', 1, ['--press', 'S1@0.3+0.4']), 'D1');
  near(onTime(pressed, 0, 1), 0.4, 0.05, 'on time (s)');
  assert.equal(onTime(pressed, 0, 0.25), 0, 'on before the press');
  assert.equal(onTime(pressed, 0.75, 1), 0, 'on after the press');
});

test('F5: ldr-night-light is off in the light and on after light=0 at 0.5 s', () => {
  // Recipe text: in the dark the LDR is high, the divider voltage rises, Q1 switches the LED ON; with light the
  // LED goes out. Default environment light is 300 lx (> the ~190 lx switch point on 5 V): off before 0.5 s;
  // light=0 at 0.5 s: dark -> on after.
  const o = output(runJson('ldr-night-light', 1, ['--at', '0.5:light=0']), 'D1');
  assert.equal(onTime(o, 0, 0.5), 0, 'on before 0.5 s');
  near(onTime(o, 0.95, 1), 0.05, 1e-6, 'on during the last 0.05 s');
});

test('F6: uno-distance prints the distance it measured, near the environment value', () => {
  // The sketch prints cm = us / 58 every ~100 ms (delay(100) plus the ~1.5 ms ping); at distance=25 cm the echo
  // lasts 2 * 25 / 0.0343 = 1458 us -> 1458 / 58 = 25. In 1 s: about 9-10 lines.
  const j = runJson('uno-distance', 1, ['--env', 'distance=25']);
  assert.ok(j.serial.lines.length >= 5, `lines: ${j.serial.lines.length}`);
  assert.equal(j.serial.count, j.serial.lines.length);
  let last = -1;
  for (const l of j.serial.lines) {
    assert.ok(l.t >= last && l.t <= 1.01, `time ${l.t}`);
    last = l.t;
    near(Number(l.text.trim()), 25, 1, `line "${l.text}"`);
  }
});

test('F7a: an unknown environment field is one line naming it, exit 1', () => {
  const r = cli(['simulate', lay('distance-alarm-uno').dir, '--run', '1', '--env', 'nonsense=1']);
  assert.equal(r.status, 1, `exit ${r.status}: ${r.stdout}${r.stderr}`);
  const lines = (r.stdout + r.stderr).split('\n').filter((l) => l.trim());
  assert.equal(lines.length, 1, lines.join(' | '));
  assert.match(lines[0], /nonsense/);
});

test('F7b: a huge --run is refused or capped with a line saying so', () => {
  const r = cli(['simulate', lay('led-resistor').dir, '--run', '100000'], 180000);
  assert.notEqual(r.status, null, 'timed out');
  const out = r.stdout + r.stderr;
  if (r.status === 1) assert.ok(out.trim().length > 0);
  else {
    assert.equal(r.status, 0, out);
    assert.match(out, /cap|limit|at most|too long|maximum/i);
  }
});

test('F7c: a sketch that never lets time pass ends in under 20 s with the stuck warning', () => {
  const program = 'void setup(){} void loop(){ while(1){} }';
  const spec = {
    parts: [{ id: 'U1', part: 'UNO', program }, { id: 'R1', type: 'resistor', value: '220' }, { id: 'D1', type: 'led', color: 'red' }],
    nets: [['U1.D13', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'U1.GND']],
  };
  const file = join(work, 'stuck-spec.json');
  writeFileSync(file, JSON.stringify(spec));
  const dir = join(work, 'stuck');
  const l = cli(['layout', dir, file], 240000);
  assert.ok(existsSync(join(dir, 'circuit.json')), `layout: ${l.stdout}${l.stderr}`);
  const started = Date.now();
  const r = cli(['simulate', dir, '--run', '5'], 20000);
  assert.notEqual(r.status, null, 'did not end in 20 s');
  assert.ok(Date.now() - started < 20000);
  // The existing warning (SIM_PROGRAM_STUCK): "the program never lets time pass".
  assert.match(r.stdout + r.stderr, /never lets time pass/);
});

test('F8: --transient on distance-alarm-uno at 10 cm lights D1 or warns and names --run', () => {
  const r = cli(['simulate', lay('distance-alarm-uno').dir, '--transient', '1,0.01', '--env', 'distance=10', '--json']);
  assert.equal(r.status, 0, `exit ${r.status}: ${r.stdout}${r.stderr}`);
  let lit = false;
  try {
    const j = JSON.parse(r.stdout);
    const o = (j.outputs ?? []).find((x) => x.id === 'D1');
    lit = !!o && onTime(o, 0, 1) > 0;
  } catch { /* not the run shape: the warning line is the other way out */ }
  assert.ok(lit || r.stdout.includes('--run'), 'the LED never lights in the table and no line names --run');
});

test('F9a: layout of uno-blink names a frequency in Hz and ends DONE', () => {
  const a = lay('uno-blink').answer;
  assert.match(a, /\d+(\.\d+)?\s*Hz/);
  assert.match(a.trim().split('\n').at(-1), /^STATUS: DONE/);
});

test('F9b: layout of led-resistor names no frequency and ends DONE', () => {
  const a = lay('led-resistor').answer;
  assert.doesNotMatch(a, /\d\s*Hz/);
  assert.match(a.trim().split('\n').at(-1), /^STATUS: DONE/);
});

test('F10: --run does not change circuit.json nor the history', () => {
  const { dir } = lay('distance-alarm-uno');
  const files = ['circuit.json', 'history.jsonl'].map((f) => join(dir, f));
  const before = files.map((f) => readFileSync(f));
  cli(['simulate', dir, '--run', '1', '--env', 'distance=10', '--at', '0.5:distance=40']);
  const after = files.map((f) => readFileSync(f));
  assert.ok(before[0].equals(after[0]), 'circuit.json changed');
  assert.ok(before[1].equals(after[1]), 'history.jsonl changed');
});

test('F10b: the run that must leave the circuit alone really ran (exit 0)', () => {
  const r = cli(['simulate', lay('distance-alarm-uno').dir, '--run', '1', '--env', 'distance=10', '--at', '0.5:distance=40']);
  assert.equal(r.status, 0, `exit ${r.status}: ${r.stdout}${r.stderr}`);
});

test('F11: simulate of circuits with no program and no oscillator is unchanged', () => {
  // First line, last line and line count recorded from v0.12.1 behaviour before the fix.
  const recorded = {
    'led-resistor': { n: 12, first: 'DC operating point — a model, not a measurement (11 Newton iterations).', last: '  W1     -491 µV    -9.81 mA   4.81 µW' },
    divider: { n: 14, first: 'DC operating point — a model, not a measurement (2 Newton iterations).', last: '  W2     22.5 µV    450 µA     10.1 nW' },
    'npn-switch': { n: 28, first: 'DC operating point — a model, not a measurement (16 Newton iterations).', last: '  W5     25.9 pV    518 pA     0 W' },
  };
  for (const [recipe, rec] of Object.entries(recorded)) {
    const r = cli(['simulate', lay(recipe).dir]);
    assert.equal(r.status, 0, recipe);
    const lines = r.stdout.trimEnd().split('\n');
    assert.equal(lines.length, rec.n, `${recipe}: line count`);
    assert.equal(lines[0], rec.first, `${recipe}: first line`);
    assert.equal(lines.at(-1), rec.last, `${recipe}: last line`);
  }
});
