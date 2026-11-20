// Acceptance tests of the C1 contract "DONE means checked" (A1-A14), through the CLI as a child
// process and the public exports. DONE means the kit checked the circuit and found nothing to tell;
// WARNINGS means "built, and each ⚠ line must be told to the user before saying it works".
//
// Exact sentences are not asserted where the contract leaves them open: only codes, part ids, the
// STATUS token, the exit code and the words that name a fact (a file name, a line number).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';
import { autoLayout, formatLayout } from '../src/layout.js';
import { formatIssue, t } from '../src/index.js';
import { RECIPES } from '../src/recipes/index.js';

const root = new URL('../', import.meta.url).pathname;
const SLOW = { timeout: 120_000 };
const run = (args, options = {}) => spawnSync(process.execPath, [join(root, 'bin/protoboard-iso.js'), ...args], { cwd: root, encoding: 'utf8', timeout: 120_000, ...options });
const lastLine = (text) => text.trimEnd().split('\n').at(-1);
const warnLines = (text) => text.split('\n').filter((l) => l.includes('⚠'));

// Lay out a spec with the CLI in a fresh folder; returns the run, the circuit file and its folder.
function build(spec, { files = {} } = {}) {
  const dir = tempDir('pbi-c1-');
  const circuitDir = join(dir, 'circuit');
  mkdirSync(circuitDir);
  const specFile = join(dir, 'spec.json');
  writeFileSync(specFile, JSON.stringify(spec));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(circuitDir, name), text);
  const circuit = join(circuitDir, 'circuit.json');
  const r = run(['layout', circuit, specFile]);
  return { r, circuit, circuitDir, out: r.stdout };
}
const reviewJson = (circuit) => {
  const r = run(['review', circuit, '--json']);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};
const codes = (list) => (list ?? []).map((i) => i.code);

// A UNO with a resistor and a LED on D13 and the given sketch.
const unoLed = (program, extra = {}) => ({
  parts: [{ id: 'U1', part: 'UNO', ...(program === undefined ? {} : { program }) }, { id: 'R1', type: 'resistor', value: '220' }, { id: 'D1', type: 'led', color: 'red' }],
  nets: [['U1.D13', 'R1.1'], ['R1.2', 'D1.A'], ['D1.K', 'U1.GND']],
  ...extra,
});

// ---- A1: 74HC595 + shiftOut (reduced to one LED: the same facts, a faster layout)
const SHIFT = 'const int DS=2,SH=3,ST=4; byte c=0;\nvoid setup(){pinMode(DS,OUTPUT);pinMode(SH,OUTPUT);pinMode(ST,OUTPUT);}\nvoid loop(){digitalWrite(ST,LOW);shiftOut(DS,SH,MSBFIRST,c);digitalWrite(ST,HIGH);c++;delay(500);}';
const shiftSpec = {
  parts: [{ id: 'U1', part: 'UNO', program: SHIFT }, { id: 'U2', part: '74HC595' }, { id: 'R1', type: 'resistor', value: '330' }, { id: 'D1', type: 'led', color: 'red' }],
  nets: [['U1.5V', 'U2.VCC', 'U2.SRCLR', 'T+'], ['U1.GND', 'U2.GND', 'U2.OE', 'T-'], ['U1.D2', 'U2.SER'], ['U1.D3', 'U2.SRCLK'], ['U1.D4', 'U2.RCLK'], ['U2.QA', 'R1.1'], ['R1.2', 'D1.A'], ['D1.K', 'T-']],
};

test('A1: a 74HC595 with a shiftOut sketch ends WARNINGS, with a ⚠ for U2 and one for shiftOut; review lists the doubts', SLOW, () => {
  const { r, circuit, out } = build(shiftSpec);
  assert.equal(r.status, 0, r.stderr);
  assert.match(lastLine(out), /^STATUS: WARNINGS/, out);
  const w = warnLines(out);
  assert.ok(w.some((l) => /\bU2\b/.test(l)), `a ⚠ line naming U2\n${out}`);
  assert.ok(w.some((l) => /shiftOut/.test(l)), `a ⚠ line naming shiftOut\n${out}`);
  const j = reviewJson(circuit);
  assert.equal(j.verdict, 'approved-with-warnings');
  assert.ok(codes(j.doubts).includes('SIM_PART_NOT_SIMULATED'), JSON.stringify(j.doubts));
  assert.ok(codes(j.doubts).includes('SIM_PROGRAM_UNSUPPORTED'), JSON.stringify(j.doubts));
  assert.deepEqual(j.hazards, []);
  assert.ok(j.summary?.doubts >= 2, `summary.doubts: ${JSON.stringify(j.summary)}`);
  // review says them too, as ⚠ lines.
  const text = run(['review', circuit]);
  assert.ok(warnLines(text.stdout).some((l) => /\bU2\b/.test(l)), text.stdout);
});

// ---- A2
test('A2: an LM386 wired to a supply ends WARNINGS with a ⚠ naming U1', SLOW, () => {
  const { r, out } = build({
    parts: [{ id: 'BT1', type: 'battery', format: '9V' }, { id: 'U1', part: 'LM386' }],
    nets: [['BT1.+', 'U1.VS'], ['BT1.-', 'U1.GND']],
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(lastLine(out), /^STATUS: WARNINGS/, out);
  assert.ok(warnLines(out).some((l) => /\bU1\b/.test(l)), out);
});

// ---- A3 (must not change)
test('A3: the uno-blink recipe (everything simulated) is still DONE with no ⚠', SLOW, () => {
  const dir = tempDir('pbi-c1-');
  const r = run(['layout', join(dir, 'circuit.json'), '--recipe', 'uno-blink']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(lastLine(r.stdout), /^STATUS: DONE/, r.stdout);
  assert.equal(warnLines(r.stdout).length, 0, r.stdout);
});

// ---- A4
test('A4: every recipe in the catalog ends DONE, or WARNINGS with its reason (the others are listed)', SLOW, () => {
  const list = run(['catalog']).stdout;
  const after = list.slice(list.indexOf('Recipes'));
  const names = [...after.matchAll(/^ {2}([a-z0-9][a-z0-9-]*) \(/gm)].map((m) => m[1]);
  assert.deepEqual([...names].sort(), Object.keys(RECIPES).sort(), 'every recipe of the kit');
  const notDone = [];
  for (const name of names) {
    const dir = tempDir('pbi-c1-');
    const r = run(['layout', join(dir, 'circuit.json'), '--recipe', name]);
    const status = /^STATUS: (\w+)/.exec(lastLine(r.stdout))?.[1];
    if (status !== 'DONE') notDone.push({ name, status, why: warnLines(r.stdout).join(' | ') });
  }
  if (notDone.length) console.log('A4: recipes not DONE (a human reads these):', JSON.stringify(notDone, null, 1));
  for (const n of notDone) {
    assert.equal(n.status, 'WARNINGS', `${n.name} must be DONE or WARNINGS, not ${n.status}`);
    assert.ok(n.why, `${n.name}: WARNINGS needs its ⚠ reason`);
  }
});

// ---- A5
test('A5: a program file that is not there ends WARNINGS and says the file and where it must be', SLOW, () => {
  const { r, circuit, circuitDir, out } = build(unoLed('semaforo.ino'));
  assert.equal(r.status, 0, r.stderr);
  assert.match(lastLine(out), /^STATUS: WARNINGS/, out);
  const line = warnLines(out).find((l) => /semaforo\.ino/.test(l));
  assert.ok(line, `a ⚠ line naming semaforo.ino\n${out}`);
  assert.ok(line.includes(circuitDir) || /circuit\.json/.test(line), `the ⚠ says where the file must be (beside circuit.json): ${line}`);
  assert.ok(codes(reviewJson(circuit).doubts).includes('SIM_PROGRAM_FILE'));
});

// ---- A6 and A7
test('A6: a sketch with a syntax error ends WARNINGS with the line number, and review is quick', SLOW, () => {
  const { r, circuit, out } = build(unoLed('void setup(){ pinMode(13, OUTPUT); }\nvoid loop(){ digitalWrite(13, HIGH) delay(100); }'));
  assert.equal(r.status, 0, r.stderr);
  assert.match(lastLine(out), /^STATUS: WARNINGS/, out);
  assert.ok(warnLines(out).some((l) => /\b2\b/.test(l)), `a ⚠ line with the line number (2)\n${out}`);
  const quick = run(['review', circuit, '--json'], { timeout: 20_000 });
  assert.equal(quick.status, 0, quick.error?.message ?? quick.stderr);
  assert.ok(codes(JSON.parse(quick.stdout).doubts).includes('SIM_PROGRAM_ERROR'));
});

test('A7: a sketch whose loop never ends or waits ends WARNINGS with the stuck-program ⚠, no hang', SLOW, () => {
  const { r, circuit, out } = build(unoLed('void setup(){} void loop(){ while(1){} }'));
  assert.equal(r.status, 0, r.stderr);
  assert.match(lastLine(out), /^STATUS: WARNINGS/, out);
  assert.ok(warnLines(out).some((l) => /U1/.test(l)), out);
  const quick = run(['review', circuit, '--json'], { timeout: 20_000 });
  assert.equal(quick.status, 0, quick.error?.message ?? quick.stderr);
  const j = JSON.parse(quick.stdout);
  assert.ok(j.doubts?.some((d) => d.code === 'SIM_PROGRAM_STUCK'), JSON.stringify(j.doubts));
});

// ---- A8, A9, A10
const ledNoResistor = (extraParts = [], extraNets = [], supplyV = 9) => ({
  parts: [{ id: 'D1', part: 'LED', color: 'red' }, ...extraParts],
  supplies: [{ id: 'V1', kind: 'bench', voltage: supplyV, positive: 'T+', negative: 'T-' }],
  nets: [['T+', 'D1.anode'], ['D1.cathode', 'T-'], ...extraNets],
});

test('A8: a LED on 9 V with no resistor is still WARNINGS with the damage ⚠ and the fix line (no doubts)', SLOW, () => {
  const { r, circuit, out } = build(ledNoResistor());
  assert.equal(r.status, 0, r.stderr);
  assert.match(lastLine(out), /^STATUS: WARNINGS/, out);
  assert.match(out, /As wired, this would damage/);
  assert.ok(warnLines(out).some((l) => /\bD1\b/.test(l)), out);
  assert.match(out, /To fix it/);
  const j = reviewJson(circuit);
  assert.ok(j.hazards.length > 0);
  assert.equal((j.doubts ?? []).length, 0);
});

test('A9: a LED with no resistor and a 74HC595 in one circuit: WARNINGS, a damage ⚠ and a doubt ⚠ under different headings', SLOW, () => {
  const { r, circuit, out } = build(ledNoResistor([{ id: 'U2', part: '74HC595' }], [['T+', 'U2.VCC', 'U2.SRCLR'], ['T-', 'U2.GND', 'U2.OE']], 5));
  assert.equal(r.status, 0, r.stderr);
  assert.match(lastLine(out), /^STATUS: WARNINGS/, out);
  assert.match(out, /As wired, this would damage/);
  const lines = out.split('\n');
  const headingOf = (pattern) => {
    const i = lines.findIndex((l) => l.includes('⚠') && pattern.test(l));
    assert.ok(i >= 0, `a ⚠ line matching ${pattern}\n${out}`);
    let k = i;
    while (k >= 0 && lines[k].includes('⚠')) k--;
    return lines[k];
  };
  const damage = headingOf(/\bD1\b/);
  const doubt = headingOf(/\bU2\b/);
  assert.match(damage, /As wired, this would damage/);
  assert.notEqual(doubt, damage, 'the doubts have their own heading');
  const j = reviewJson(circuit);
  assert.ok(j.hazards.length > 0 && codes(j.doubts).includes('SIM_PART_NOT_SIMULATED'));
});

test('A10: a circuit that needs a fix is still CHANGES', SLOW, () => {
  const spec = JSON.parse(spawnSync('cat', [join(root, 'examples/layout/esp32-both-headers.json')], { encoding: 'utf8' }).stdout);
  const { out } = build({ ...spec, board: 'bb830' });
  assert.match(lastLine(out), /^STATUS: CHANGES/, out); // exit code not asserted: the contract does not change it
});

// ---- A11, A12
test('A11: the ldr-night-light recipe does not say "nothing that applies" on its Checked line (layout and review)', SLOW, () => {
  const dir = tempDir('pbi-c1-');
  const circuit = join(dir, 'circuit.json');
  const r = run(['layout', circuit, '--recipe', 'ldr-night-light']);
  assert.equal(r.status, 0, r.stderr);
  const checked = r.stdout.split('\n').filter((l) => /^Checked:/.test(l));
  assert.equal(checked.length, 1, r.stdout);
  assert.doesNotMatch(checked[0], /nothing that applies/);
  const rev = run(['review', circuit]);
  assert.doesNotMatch(rev.stdout.split('\n').find((l) => /^Checked:/.test(l)) ?? '', /nothing that applies/);
});

test('A12: three LEDs on a 9 V battery: the Readings line names BT1 once', SLOW, () => {
  const spec = {
    parts: [{ id: 'BT1', type: 'battery', format: '9V' }, { id: 'R1', type: 'resistor', value: '470' }, { id: 'D1', type: 'led', color: 'red' }, { id: 'R2', type: 'resistor', value: '470' }, { id: 'D2', type: 'led', color: 'green' }, { id: 'R3', type: 'resistor', value: '470' }, { id: 'D3', type: 'led', color: 'yellow' }],
    nets: [['BT1.+', 'R1.1', 'R2.1', 'R3.1'], ['R1.2', 'D1.A'], ['R2.2', 'D2.A'], ['R3.2', 'D3.A'], ['D1.K', 'D2.K', 'D3.K', 'BT1.-']],
  };
  const { r, out } = build(spec);
  assert.equal(r.status, 0, r.stderr);
  const line = out.split('\n').find((l) => /^Readings/.test(l));
  assert.ok(line, out);
  assert.equal(line.match(/\bBT1\b/g)?.length, 1, line);
});

// ---- A13
test('A13: catalog marks 74HC595 and LM386 as not simulated, and NE555 and LM358 not; no text points to src/ or docs/', () => {
  const list = run(['catalog']).stdout;
  const controls = ['NE555', 'LM358'];
  const marked = (name) => {
    const bySegment = list.split(/[,\n]/).some((s) => s.includes(name) && /not simulated/i.test(s));
    const byLine = list.split('\n').some((l) => /not simulated/i.test(l) && l.includes(name) && !controls.some((c) => l.includes(c)));
    return bySegment || byLine;
  };
  assert.ok(marked('74HC595'), '74HC595 marked as not simulated');
  assert.ok(marked('LM386'), 'LM386 marked as not simulated');
  assert.ok(!marked('NE555'), 'NE555 is simulated');
  assert.ok(!marked('LM358'), 'LM358 is simulated');
  assert.match(run(['catalog', '74HC595']).stdout, /not simulated/i, 'catalog <part> says it too');
  assert.doesNotMatch(run(['catalog', 'NE555']).stdout, /not simulated/i);
  for (const args of [[], ['buzzer'], ['led']]) {
    const text = run(['catalog', ...args]).stdout;
    assert.doesNotMatch(text, /\b(src|docs)\//, `catalog ${args.join(' ')} points to a path a plugin user does not have`);
  }
});

// ---- A14: the formatter, fed a review where a part is hard to see in every view (no spec makes one
// that is not already blocking, so the review is the input; the status must not change by itself).
test('A14: a part under 50 % visible in every view gets one line in layout\'s answer, and the status stays', () => {
  const r = autoLayout({
    parts: [{ id: 'R1', type: 'resistor', value: '10k' }, { id: 'R2', type: 'resistor', value: '10k' }, { id: 'R3', type: 'resistor', value: '10k' }],
    supplies: [{ id: 'V1', kind: 'bench', voltage: 9, positive: 'T+', negative: 'T-' }],
    nets: [['T+', 'R1.1', 'R2.1', 'R3.1'], ['R1.2', 'R2.2', 'R3.2', 'T-']],
  });
  assert.equal(r.status, 'done');
  const hidden = (part, visible, view, by = 'W9') => ({ severity: 'info', code: 'PART_HIDDEN', params: { part, visible, by, share: 100 - visible }, view });
  const fake = {
    ...r,
    review: {
      ...r.review,
      advisory: [hidden('R1', 30, 'front'), hidden('R1', 20, 'back'), hidden('R2', 30, 'front'), hidden('R2', 90, 'back')],
      // What review() computes from those PART_HIDDEN entries (its best view: R1 30 %; R2 is 90 % seen
      // from the back, so not in the list); formatLayout reads this.
      hidden: [{ part: 'R1', visible: 30, by: ['W9'] }],
    },
  };
  const text = formatLayout(fake, 'en', { t, formatIssue });
  const mentions = (id) => text.split('\n').filter((l) => new RegExp(`\\b${id}\\b`).test(l) && !/→|^Readings|^\s*·/.test(l));
  const r1 = mentions('R1');
  assert.equal(r1.length, 1, `one line for R1\n${text}`);
  assert.match(r1[0], /\d+ ?%/, 'how visible');
  assert.match(r1[0], /\bW9\b/, 'what covers it');
  assert.equal(mentions('R2').length, 0, 'R2 shows in one view: no line');
  assert.match(lastLine(text), /^STATUS: DONE/, 'information only: the status does not change');
});
