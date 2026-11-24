// DONE means checked: a circuit the kit could not check (a part with no simulation model, a board's
// program it cannot run as written, a warning of the simulation) ends WARNINGS with a ⚠ line for each
// doubt, under its own heading, and DONE stays for a circuit checked with nothing to tell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';
import { formatLayout } from '../src/layout.js';
import { autoLayout } from './layout-generous.js';
import { review, formatReview } from '../src/review.js';
import { checkHazards } from '../src/sim/index.js';
import { formatIssue, t } from '../src/index.js';
import { compactCatalog, formatCompactCatalog, catalogEntry, formatCatalogEntry, partTypeLines, simulates } from '../src/node/catalog.js';
import { UNSIMULATED } from './unsimulated-part.js';

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

// The LM386 this used to take is simulated now; the e-paper adapter of examples/epaper-esp32.json
// is a part the kit still draws only (layout cannot place a module beside the board by itself, so
// the circuit is the example as drawn and its review is the answer).
const epaper = () => JSON.parse(readFileSync(join(root, 'examples/epaper-esp32.json'), 'utf8'));
test('a wired part with no simulation model is a doubt: WARNINGS, its own ⚠ heading, hazards empty', () => {
  const v = review(epaper());
  assert.equal(v.verdict, 'approved-with-warnings');
  assert.deepEqual(v.hazards, []);
  assert.deepEqual(v.doubts.map((d) => d.code), ['SIM_PART_NOT_SIMULATED']);
  assert.deepEqual(v.doubts[0].params, { part: 'EP1', name: 'DESPI-C02' });
  assert.deepEqual(v.doubts[0].parts, ['EP1']);
  assert.equal(v.summary.doubts, 1);
  const out = formatReview(v, 'en', { t, formatIssue });
  assert.match(out, /The kit cannot confirm these work/);
  assert.doesNotMatch(out, /As wired, this would damage/);
  assert.match(out, /⚠ .*EP1 \(DESPI-C02\) is drawn and wired/);
  // The floating nodes it leaves are its own doubt's consequence: not said again.
  assert.doesNotMatch(out, /no DC path/);
  assert.match(out, /what EP1 does \(not simulated\)/);
  for (const lang of ['en', 'es']) assert.doesNotMatch(formatReview(v, lang, { t, formatIssue }), /\{\w+\}/);
});

// The same through layout, with a part layout places (the tests' own part with no model): WARNINGS,
// the not-simulated ⚠ naming the LED behind it, which is not called dead.
test('layout: a wired chip with no model ends WARNINGS with its ⚠, which names the LED behind it', () => {
  const r = autoLayout({ supplies: [{ voltage: 5, positive: 'T+', negative: 'T-' }], parts: [{ id: 'U1', part: UNSIMULATED }, { id: 'R1', type: 'resistor', value: '330' }, { id: 'D1', type: 'led', color: 'red' }], nets: [['T+', 'U1.VCC'], ['T-', 'U1.GND', 'D1.K'], ['U1.OUT', 'R1.1'], ['R1.2', 'D1.A']] });
  assert.equal(r.status, 'warnings');
  assert.deepEqual(r.review.hazards, []);
  assert.deepEqual(r.review.doubts.map((d) => d.code), ['SIM_PART_NOT_SIMULATED']);
  const out = text(r);
  assert.match(out, new RegExp(`⚠ .*U1 \\(${UNSIMULATED}\\) is drawn and wired.*nor what D1 do`));
  assert.doesNotMatch(out, /D1 never comes on/);
  assert.match(lastLine(out), /^STATUS: WARNINGS/);
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
  const dir = tempDir('pbi-verdict-');
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

  // The 74HC595 is simulated: its one doubt here is RCLK left open (the rest tied to a rail).
  const both = autoLayout({ parts: [...led.parts, { id: 'U2', part: '74HC595' }], nets: [['BT1.+', 'D1.anode', 'U2.VCC', 'U2.SRCLR', 'U2.SER', 'U2.SRCLK'], ['BT1.-', 'D1.cathode', 'U2.GND', 'U2.OE']] });
  assert.equal(both.status, 'warnings');
  const b = text(both);
  assert.match(b, /As wired, this would damage/);
  assert.match(b, /The kit cannot confirm these work/);
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
  // Since C11 every chip of the kit is simulated: none is marked; the tests' own part with no model is.
  assert.match(ic, new RegExp(`not simulated: .*${UNSIMULATED}`));
  assert.doesNotMatch(ic.split('not simulated')[1] ?? '', /NE555|LM358|74HC595|CD4017|LM386|ULN2003|ULN2803|PC817/);
  const cliList = partTypeLines('en').find((l) => l.startsWith('ic '));
  assert.match(cliList, new RegExp(`${UNSIMULATED} \\(not simulated: drawn only\\)`));
  assert.match(cliList, /NE555, LM358, 74HC595, CD4017, LM324, LM393, UA741, NE5532, LM386, ULN2003, ULN2803, PC817,/);
  assert.match(formatCatalogEntry(catalogEntry(UNSIMULATED), 'en'), /Not simulated: the kit draws it/);
  assert.match(formatCatalogEntry(catalogEntry('DESPI-C02'), 'en'), /Not simulated: the kit draws it/);
  for (const chip of ['74HC595', 'CD4017', 'LM386', 'ULN2003', 'ULN2803', 'PC817']) assert.doesNotMatch(formatCatalogEntry(catalogEntry(chip), 'en'), /not simulated/i, chip);
  assert.doesNotMatch(formatCatalogEntry(catalogEntry('NE555'), 'en'), /not simulated/i);
  for (const name of [null, 'buzzer', 'led', 'module', 'UNO', 'ic']) {
    const out = name ? formatCatalogEntry(catalogEntry(name), 'en') : list;
    assert.doesNotMatch(out, /\bsrc\/|\bdocs\//, String(name));
  }
});

test('the CLI review --json carries doubts next to hazards', () => {
  const dir = tempDir('pbi-verdict-');
  const file = join(dir, 'c', 'circuit.json');
  mkdirSync(join(dir, 'c'));
  writeFileSync(file, JSON.stringify(epaper()));
  const r = cli('review', join(dir, 'c'), '--json');
  const j = JSON.parse(r.stdout);
  assert.equal(j.verdict, 'approved-with-warnings');
  assert.deepEqual(j.hazards, []);
  assert.deepEqual(j.doubts.map((d) => d.code), ['SIM_PART_NOT_SIMULATED']);
});

test('a button across its joined pins is a doubt: layout WARNINGS, check lists it, apply saves it with ⚠', () => {
  const button = (nets) => ({ parts: [{ id: 'S1', type: 'button' }, { id: 'R1', type: 'resistor', value: '330' }, { id: 'D1', type: 'led', color: 'red' }], supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }], nets });
  const dir = tempDir('pbi-verdict-');
  const spec = join(dir, 'spec.json');
  writeFileSync(spec, JSON.stringify(button([['T+', 'S1.1'], ['S1.2', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'T-']])));
  const target = join(dir, 'b');
  const made = cli('layout', target, spec, '--lang', 'en');
  assert.equal(made.status, 0, made.stdout);
  assert.match(lastLine(made.stdout), /^STATUS: WARNINGS/);
  const heading = made.stdout.indexOf('The kit cannot confirm these work');
  assert.ok(heading > 0 && made.stdout.indexOf('⚠ warning: S1: pins 1 and 2 are joined') > heading, made.stdout);
  assert.doesNotMatch(made.stdout, /✖/);
  const check = JSON.parse(cli('check', target, '--json').stdout);
  assert.ok(check.issues.some((i) => i.code === 'BUTTON_PINS_JOINED' && i.severity === 'warning'));
  // Taken out and put back by apply: saved, marked ⚠, not a new error.
  const s1 = JSON.parse(readFileSync(join(target, 'circuit.json'), 'utf8')).parts.find((p) => p.id === 'S1');
  assert.equal(cli('apply', target, '--ops', JSON.stringify([{ op: 'remove', part: 'S1' }])).status, 0);
  const back = cli('apply', target, '--ops', JSON.stringify([{ op: 'add', part: s1 }]), '--lang', 'en');
  assert.equal(back.status, 0, back.stdout + back.stderr);
  assert.match(back.stdout, /⚠ new: warning: S1: pins 1 and 2 are joined/);
  assert.doesNotMatch(back.stdout, /✖|refused|errors/i);
  // Wired across the button (one pin of each side): DONE with no ⚠.
  writeFileSync(spec, JSON.stringify(button([['T+', 'S1.1', 'S1.2'], ['S1.3', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'T-']])));
  const ok = cli('layout', join(dir, 'ok'), spec, '--lang', 'en');
  assert.match(lastLine(ok.stdout), /^STATUS: DONE/);
  assert.doesNotMatch(ok.stdout, /⚠/);
});
