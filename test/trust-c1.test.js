// DONE means checked: a circuit the kit could not check (a part with no simulation model, a board's
// program it cannot run as written, a warning of the simulation) ends WARNINGS with a ⚠ line for each
// doubt, under its own heading, and DONE stays for a circuit checked with nothing to tell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';
import { autoLayout, formatLayout } from '../src/layout.js';
import { review, formatReview } from '../src/review.js';
import { checkHazards } from '../src/sim/index.js';
import { formatIssue, t } from '../src/index.js';
import { compactCatalog, formatCompactCatalog, catalogEntry, formatCatalogEntry, partTypeLines, simulates } from '../src/node/catalog.js';

const root = new URL('../', import.meta.url).pathname;
const cli = (...args) => spawnSync(process.execPath, [join(root, 'bin/protoboard-iso.js'), ...args], { encoding: 'utf8', timeout: 60_000 });
const text = (r, lang = 'en') => formatLayout(r, lang, { t, formatIssue });
const lastLine = (s) => s.trim().split('\n').at(-1);

// An UNO with an LED on D13 and the sketch given.
const uno = (program) => ({
  parts: [{ id: 'U1', part: 'UNO', program }, { id: 'R1', type: 'resistor', value: '220' }, { id: 'D1', type: 'led', color: 'red' }],
  nets: [['U1.D13', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'U1.GND']],
});
const BLINK = 'void setup(){ pinMode(13, OUTPUT); } void loop(){ digitalWrite(13, HIGH); delay(500); digitalWrite(13, LOW); delay(500); }';
// The UNO circuit laid out once, its program swapped (the simulation needs the parts placed).
let placed = null;
const withProgram = (program) => {
  placed ??= autoLayout(uno(BLINK)).circuit;
  return { ...placed, parts: placed.parts.map((p) => (p.id === 'U1' ? { ...p, program } : p)) };
};

test('a wired part with no simulation model is a doubt: WARNINGS, its own ⚠ heading, hazards empty', () => {
  const r = autoLayout({ parts: [{ id: 'BT1', type: 'battery', format: '9V' }, { id: 'U1', part: 'LM386' }], nets: [['BT1.+', 'U1.VS'], ['BT1.-', 'U1.GND']] });
  assert.equal(r.status, 'warnings');
  assert.equal(r.review.verdict, 'approved-with-warnings');
  assert.deepEqual(r.review.hazards, []);
  assert.deepEqual(r.review.doubts.map((d) => d.code), ['SIM_PART_NOT_SIMULATED']);
  assert.deepEqual(r.review.doubts[0].params, { part: 'U1', name: 'LM386' });
  assert.deepEqual(r.review.doubts[0].parts, ['U1']);
  assert.equal(r.review.summary.doubts, 1);
  const out = text(r);
  assert.match(out, /The kit could not check this/);
  assert.doesNotMatch(out, /As wired, this would damage/);
  assert.match(out, /⚠ .*U1 \(LM386\) is drawn and wired/);
  // The floating nodes it leaves are its own doubt's consequence: not said again.
  assert.doesNotMatch(out, /no DC path/);
  assert.match(out, /what U1 does \(not simulated\)/);
  assert.match(lastLine(out), /^STATUS: WARNINGS · .*1 point\(s\) are marked ⚠ above/);
  for (const lang of ['en', 'es']) assert.doesNotMatch(text(r, lang), /\{\w+\}/);
});

test('a part not wired to anything is not a doubt; a plain header is simulated', () => {
  const c = autoLayout({ parts: [{ id: 'V', type: 'battery', format: '9V' }, { id: 'R1', type: 'resistor', value: '1k' }, { id: 'U1', part: '74HC595' }], nets: [['V.+', 'R1.1'], ['R1.2', 'V.-']] });
  assert.ok(!c.review.doubts.some((d) => d.code === 'SIM_PART_NOT_SIMULATED'), JSON.stringify(c.review.doubts));
  assert.equal(simulates({ type: 'header' }), true);
});

test('a board program the kit cannot run is a doubt: syntax error with its line, stuck loop, missing file', () => {
  const syntax = autoLayout(uno('void setup(){ pinMode(13, OUTPUT); } void loop(){ digitalWrite(13, HIGH) delay(100); }'));
  assert.equal(syntax.status, 'warnings');
  const error = syntax.review.doubts.find((d) => d.code === 'SIM_PROGRAM_ERROR');
  assert.equal(error?.params.line, 1);
  assert.match(text(syntax), /⚠ .*line 1/);

  const started = Date.now(); // real clock: a stuck program must not hang the layout
  const stuck = autoLayout(uno('void setup(){} void loop(){ while(1){} }'));
  assert.ok(Date.now() - started < 20_000); // real clock: the same bound, in wall time
  assert.equal(stuck.status, 'warnings');
  assert.deepEqual(stuck.review.doubts.map((d) => d.code), ['SIM_PROGRAM_STUCK']);
  assert.match(text(stuck), /never lets time pass/);
  // Stuck in setup() too; a loop() that returns without a delay is a working program.
  assert.deepEqual(checkHazards(withProgram('void setup(){ for(;;){} } void loop(){}')).doubts.map((d) => d.code), ['SIM_PROGRAM_STUCK']);
  assert.deepEqual(checkHazards(withProgram('void setup(){ pinMode(13, OUTPUT); } void loop(){ digitalWrite(13, digitalRead(2)); }')).doubts, []);
  assert.deepEqual(checkHazards(withProgram('void setup(){ pinMode(13, OUTPUT); delay(10); } void loop(){ while (true) { digitalWrite(13, HIGH); delay(5); } }')).doubts, []);
  assert.deepEqual(checkHazards(withProgram(BLINK)).doubts, []);
});

test('a missing program file says where the kit looked and where the file goes', () => {
  const dir = tempDir('pbi-c1-');
  const target = join(dir, 'lights');
  mkdirSync(target);
  const spec = join(dir, 'spec.json');
  writeFileSync(spec, JSON.stringify(uno('lights.ino')));
  const r = cli('layout', target, spec, '--lang', 'en');
  assert.equal(r.status, 0, r.stderr);
  assert.match(lastLine(r.stdout), /^STATUS: WARNINGS/);
  const line = r.stdout.split('\n').find((l) => l.includes('⚠') && l.includes('lights.ino'));
  assert.ok(line, r.stdout);
  assert.ok(line.includes(target), line);
  assert.match(line, /circuit's folder, beside circuit\.json/);
  // With the file there, the program runs: DONE.
  writeFileSync(join(target, 'lights.ino'), BLINK);
  const again = cli('review', target, '--json');
  assert.deepEqual(JSON.parse(again.stdout).doubts, []);
  // A circuit not loaded from a folder: it says so.
  const loose = review(withProgram('lights.ino'));
  assert.equal(loose.doubts[0].params.variant, 'noFolder');
});

test('hazards alone keep their words and the fix; hazards and doubts together show both headings', () => {
  const led = { parts: [{ id: 'BT1', type: 'battery', format: '9V' }, { id: 'D1', type: 'led', color: 'red' }], nets: [['BT1.+', 'D1.anode'], ['BT1.-', 'D1.cathode']] };
  const alone = autoLayout(led);
  assert.equal(alone.status, 'warnings');
  assert.deepEqual(alone.review.doubts, []);
  assert.ok(alone.review.hazards.length);
  const a = text(alone);
  assert.match(a, /To fix it/);
  assert.doesNotMatch(a, /could not check/);
  assert.match(lastLine(a), /would be damaged as wired \(marked ⚠ above\)/);

  const both = autoLayout({ parts: [...led.parts, { id: 'U2', part: '74HC595' }], nets: [['BT1.+', 'D1.anode', 'U2.VCC'], ['BT1.-', 'D1.cathode', 'U2.GND']] });
  assert.equal(both.status, 'warnings');
  const b = text(both);
  assert.match(b, /As wired, this would damage/);
  assert.match(b, /The kit could not check this/);
  assert.match(b, /To fix it/);
  assert.match(lastLine(b), /would be damaged as wired and 1 point\(s\) the kit could not check/);
  const rv = formatReview(review(both.circuit), 'en', { t, formatIssue });
  assert.match(rv, /^APPROVED WITH WARNINGS .* 1 point\(s\) the kit could not check/);
});

test('a checked circuit stays DONE; the Checked line is truthful', () => {
  const blink = autoLayout(uno(BLINK));
  assert.equal(blink.status, 'done');
  assert.doesNotMatch(text(blink), /⚠/);
  // An LDR with its own light and no environment declared: the sensors' reading is not checked.
  const ldr = autoLayout({ parts: [{ id: 'BT1', type: 'battery', format: '9V' }, { id: 'R1', type: 'resistor', value: '1k' }, { id: 'LDR1', type: 'ldr', light: 100 }], nets: [['BT1.+', 'R1.1'], ['R1.2', 'LDR1.1'], ['LDR1.2', 'BT1.-']] });
  assert.equal(ldr.status, 'done');
  assert.match(text(ldr), /Not checked: what the sensors read from the environment/);
  assert.doesNotMatch(text(ldr), /nothing that applies/);
});

test('the readings name a battery once', () => {
  const r = autoLayout({
    parts: [{ id: 'BT1', type: 'battery', format: '9V' }, ...[1, 2, 3].flatMap((i) => [{ id: `R${i}`, type: 'resistor', value: '470' }, { id: `D${i}`, type: 'led', color: 'red' }])],
    nets: [['BT1.+', 'R1.1', 'R2.1', 'R3.1'], ...[1, 2, 3].flatMap((i) => [[`R${i}.2`, `D${i}.anode`], [`D${i}.cathode`, 'BT1.-']])],
  });
  const line = text(r).split('\n').find((l) => l.startsWith('Readings'));
  assert.equal(line.match(/BT1/g)?.length, 1, line);
});

test('a part hard to see in every view gets its own line in the answer', () => {
  const boxedIn = {
    parts: [
      { id: 'R1', type: 'resistor', value: '1k', pins: ['h20', 'h24'] },
      { id: 'C1', type: 'capacitor', value: '1000u', voltage: 16, pins: ['d27', 'd29'] },
      { id: 'C2', type: 'capacitor', value: '1000u', voltage: 16, pins: ['T+17', 'T+19'] },
    ],
  };
  const v = review(boxedIn);
  assert.deepEqual(v.hidden.map((h) => h.part), ['R1']);
  assert.ok(v.hidden[0].visible < 50);
  // The answer of a layout that kept such a circuit: one line for R1.
  const r = { placed: [], wires: 0, ms: 0, columns: 30, notes: [], problems: [], check: { ok: true, missing: [], shorted: [] }, review: v, status: 'changes' };
  const lines = text(r).split('\n').filter((l) => l.startsWith('Hard to see'));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /R1 is \d+ % visible at best .*covered by C1, C2/);
});

test('catalog marks what is drawn but not simulated, and names no path of the sources', () => {
  const list = formatCompactCatalog(compactCatalog('en'), 'en');
  const ic = list.split('\n').find((l) => l.startsWith('  ic:'));
  assert.match(ic, /not simulated: .*74HC595/);
  assert.match(ic, /not simulated: .*LM386/);
  assert.doesNotMatch(ic.split('not simulated')[1], /NE555|LM358/);
  const cliList = partTypeLines('en').find((l) => l.startsWith('ic '));
  assert.match(cliList, /not simulated: 74HC595.*LM386/);
  assert.doesNotMatch(cliList.split('not simulated')[1], /NE555|LM358/);
  assert.match(formatCatalogEntry(catalogEntry('74HC595'), 'en'), /Simulation: none/);
  assert.doesNotMatch(formatCatalogEntry(catalogEntry('NE555'), 'en'), /Simulation: none/);
  for (const name of [null, 'buzzer', 'led', 'module', 'UNO', 'ic']) {
    const out = name ? formatCatalogEntry(catalogEntry(name), 'en') : list;
    assert.doesNotMatch(out, /\bsrc\/|\bdocs\//, String(name));
  }
});

test('the CLI review --json carries doubts next to hazards', () => {
  const dir = tempDir('pbi-c1-');
  const file = join(dir, 'c', 'circuit.json');
  mkdirSync(join(dir, 'c'));
  const built = autoLayout({ parts: [{ id: 'BT1', type: 'battery', format: '9V' }, { id: 'U1', part: 'LM386' }], nets: [['BT1.+', 'U1.VS'], ['BT1.-', 'U1.GND']] });
  writeFileSync(file, JSON.stringify(built.circuit));
  const r = cli('review', join(dir, 'c'), '--json');
  const j = JSON.parse(r.stdout);
  assert.equal(j.verdict, 'approved-with-warnings');
  assert.deepEqual(j.hazards, []);
  assert.deepEqual(j.doubts.map((d) => d.code), ['SIM_PART_NOT_SIMULATED']);
});
