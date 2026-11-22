// What a third round of first-time users found (C10b): a part that cannot be judged is not called
// dead, a note that is a hazard is a ⚠, a run that ends early says so, and small truths.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout } from './layout-generous.js';
import { formatIssue } from '../src/index.js';
import { UNSIMULATED } from './unsimulated-part.js';

const codes = (list) => list.map((i) => i.code);

// ---- 3. A part that cannot be judged is not called dead

// A 555 clocking a CD4017 that lights three LEDs. Until C11a the kit did not simulate the chip and its
// doubt named the LEDs; now it does (src/sim/devices/counter.js), so the LEDs are judged like any
// other. This 555 is slow (10 kΩ, 47 kΩ, 47 µF: f = 1.44 / (104 kΩ · 47 µF) ≈ 0.29 Hz): the review's
// run follows it for two of its periods and more while LEDs keep coming on, so all three are seen lit.
test('LEDs behind a CD4017 clocked by a slow 555 are judged and seen lit: DONE', () => {
  const r = autoLayout({
    supplies: [{ id: 'V1', kind: 'bench', voltage: 9, positive: 'T+', negative: 'T-' }],
    parts: [
      { id: 'R1', type: 'resistor', value: '10k' },
      { id: 'R2', type: 'resistor', value: '47k' },
      { id: 'U1', part: 'NE555' },
      { id: 'C1', type: 'capacitor', kind: 'electrolytic', value: '47u' },
      { id: 'C2', type: 'capacitor', value: '10n' },
      { id: 'U2', part: 'CD4017' },
      { id: 'R3', type: 'resistor', value: '470' },
      { id: 'R4', type: 'resistor', value: '470' },
      { id: 'R5', type: 'resistor', value: '470' },
      { id: 'D1', type: 'led', color: 'green' },
      { id: 'D2', type: 'led', color: 'yellow' },
      { id: 'D3', type: 'led', color: 'red' },
    ],
    nets: [
      ['T+', 'U1.VCC', 'U1.RESET', 'R1.1'], ['R1.2', 'R2.1', 'U1.DIS'], ['R2.2', 'U1.THR', 'U1.TRIG', 'C1.+'], ['C1.-', 'T-'],
      ['U1.CTRL', 'C2.1'], ['C2.2', 'T-'], ['U1.GND', 'T-'], ['U1.OUT', 'U2.CLK'],
      ['T+', 'U2.VDD'], ['T-', 'U2.VSS'], ['T-', 'U2.CE'], ['U2.Q3', 'U2.MR'],
      ['U2.Q0', 'R3.1'], ['R3.2', 'D1.A'], ['D1.K', 'T-'],
      ['U2.Q1', 'R4.1'], ['R4.2', 'D2.A'], ['D2.K', 'T-'],
      ['U2.Q2', 'R5.1'], ['R5.2', 'D3.A'], ['D3.K', 'T-'],
    ],
  });
  const doubts = r.review.doubts;
  assert.ok(!codes(doubts).includes('SIM_PART_NOT_SIMULATED'), JSON.stringify(doubts));
  assert.ok(!codes(doubts).includes('SIM_OUTPUT_NEVER_ON'), JSON.stringify(doubts));
  assert.equal(r.status, 'done', JSON.stringify(doubts));
});

// An LED wired backwards beside the same kind of chip never comes on for a reason the kit simulated:
// it keeps its doubt; the LED behind the chip does not get one.
// Since C11 every chip is simulated: the part with no model is the tests' own (test/unsimulated-part.js).
test('an output dark for a reason the kit simulated keeps its doubt beside a chip not simulated', () => {
  const r = autoLayout({
    supplies: [{ voltage: 5, positive: 'T+', negative: 'T-' }],
    parts: [
      { id: 'U1', part: UNSIMULATED },
      { id: 'R1', type: 'resistor', value: '330' },
      { id: 'D1', type: 'led', color: 'red' },
      { id: 'R2', type: 'resistor', value: '330' },
      { id: 'D2', type: 'led', color: 'green' },
    ],
    nets: [['T+', 'U1.VCC', 'R2.1'], ['T-', 'U1.GND', 'D1.K', 'D2.A'], ['U1.OUT', 'R1.1'], ['R1.2', 'D1.A'], ['R2.2', 'D2.K']],
  });
  const never = r.review.doubts.filter((d) => d.code === 'SIM_OUTPUT_NEVER_ON');
  assert.deepEqual(never.map((d) => d.params.part), ['D2'], JSON.stringify(r.review.doubts));
  assert.equal(r.review.doubts.find((d) => d.code === 'SIM_PART_NOT_SIMULATED').params.drives, 'D1');
});

// ---- 4. A note that is a hazard is a ⚠

const BME_SKETCH = `#include <Wire.h>
#include <Adafruit_BME280.h>
Adafruit_BME280 bme;
void setup() { Serial.begin(9600); Serial.println(bme.begin(0x76)); }
void loop() { Serial.println(bme.readTemperature()); delay(1000); }
`;
const bme = (part, vcc) => autoLayout({
  parts: [{ id: 'U1', part: 'UNO', program: BME_SKETCH }, { id: 'B1', part }],
  nets: [[`U1.${vcc}`, 'B1.VCC'], ['U1.GND', 'B1.GND'], ['U1.SCL', 'B1.SCL'], ['U1.SDA', 'B1.SDA']],
});

test('a BME280 on 3.3 V on a UNO\'s I2C: its bus over the chip\'s maximum is a ⚠, not DONE', () => {
  const r = bme('BME280', '3V3');
  assert.equal(r.status, 'warnings', JSON.stringify(r.review.doubts));
  const over = r.review.doubts.filter((d) => d.code === 'SIM_PIN_OVER_VDDIO');
  assert.deepEqual(over.map((d) => d.params.pin).sort(), ['SCL', 'SDA']);
  assert.match(formatIssue(over[0], 'en'), /^warning: B1: S[DC]A idles at 3\.6\d V, over the 3\.6 V/);
  assert.match(formatIssue(over[0], 'en'), /digitalWrite\(A4, LOW\)/);
});

test('a BME280 on 5 V: its warning names the 5 V board the kit has', () => {
  const r = bme('BME280', '5V');
  const supply = r.review.doubts.find((d) => d.code === 'SIM_IC_SUPPLY');
  assert.equal(supply.params.instead, 'BME280-5V');
  assert.match(formatIssue(supply, 'en'), /The kit has BME280-5V, the same sensor on a board with its own 3\.3 V regulator/);
  assert.match(formatIssue(supply, 'es'), /El kit tiene BME280-5V/);
});

// ---- 5. A run that ends early says so where it is read

test('a run cut by its time or capped at 60 s says so first, and each figure names its span', async () => {
  const { runCircuit } = await import('./run-generous.js');
  const { formatRun } = await import('../src/sim/format.js');
  const { expandRecipe } = await import('../src/recipes/index.js');
  const { LIMITS } = await import('../src/limits.js');
  const astable = autoLayout(expandRecipe('555-astable').spec).circuit;
  const slow = runCircuit(astable, { seconds: 5, budgetMs: 200 });
  assert.equal(slow.run.seconds, 5);
  assert.ok(slow.run.ran > 0 && slow.run.ran < 5, JSON.stringify(slow.run));
  const lines = formatRun(slow, 'en', { formatIssue }).split('\n');
  assert.match(lines[1], /^warning: The run stopped at .+ of 5 s: it took more than 200 ms of the machine's time/);
  assert.match(lines[2], /^Every figure below covers the first .+ of the 5 s asked/);
  assert.ok(lines.some((l) => /^Outputs over time in the first /.test(l)), lines.join('\n'));
  assert.equal(lines.filter((l) => /The run stopped at/.test(l)).length, 1, 'said once');
  const capped = runCircuit(autoLayout({
    supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
    parts: [{ id: 'R1', type: 'resistor', value: '330' }, { id: 'D1', type: 'led', color: 'red' }],
    nets: [['T+', 'R1.1'], ['R1.2', 'D1.A'], ['D1.K', 'T-']],
  }).circuit, { seconds: 120 });
  assert.deepEqual([capped.run.seconds, capped.run.ran], [120, LIMITS.runSeconds]);
  const text = formatRun(capped, 'es', { formatIssue }).split('\n');
  assert.match(text[1], /60 s/);
  assert.match(text[2], /^Cada cifra de abajo cubre los primeros 60 s de los 120 s pedidos/);
  assert.match(text.find((l) => l.startsWith('Lecturas')) ?? '', /60 s/);
});

// ---- 6. Small truths

test('a Darlington carrying milliamps under 1 V at its base is not called off', async () => {
  const { simulate } = await import('../src/sim/index.js');
  const r = autoLayout({
    supplies: [{ id: 'V1', kind: 'bench', voltage: 12, positive: 'T+', negative: 'T-' }],
    parts: [{ id: 'RB', type: 'resistor', value: '100k' }, { id: 'Q1', part: 'TIP120' }, { id: 'RC', type: 'resistor', value: '1k' }],
    nets: [['T+', 'RB.1'], ['RB.2', 'Q1.B'], ['T+', 'RC.1'], ['RC.2', 'Q1.C'], ['Q1.E', 'T-']],
  });
  const q = simulate(r.circuit).parts.Q1;
  assert.ok(q.vbe < 1 && q.currents.C > 1e-3, `${q.vbe} V, ${q.currents.C} A`);
  assert.notEqual(q.region, 'off');
  // One with nothing at its base is still off.
  const idle = autoLayout({
    supplies: [{ id: 'V1', kind: 'bench', voltage: 12, positive: 'T+', negative: 'T-' }],
    parts: [{ id: 'RB', type: 'resistor', value: '10M' }, { id: 'Q1', part: 'TIP120' }, { id: 'RC', type: 'resistor', value: '1k' }],
    nets: [['T+', 'RB.1'], ['RB.2', 'Q1.B'], ['T+', 'RC.1'], ['RC.2', 'Q1.C'], ['Q1.E', 'T-']],
  });
  assert.equal(simulate(idle.circuit).parts.Q1.region, 'off');
});

const { spawnSync } = await import('node:child_process');
const { join } = await import('node:path');
const { mkdirSync, writeFileSync, existsSync } = await import('node:fs');
const { tempDir } = await import('../scripts/tmp.js');
const bin = join(new URL('..', import.meta.url).pathname, 'bin', 'protoboard-iso.js');
const cli = (args, cwd) => spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });

test('the target "." names the page after the folder, not "..html"', () => {
  const dir = join(tempDir('dot-target'), 'blinker');
  mkdirSync(dir);
  writeFileSync(join(dir, 'spec.json'), JSON.stringify({
    supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
    parts: [{ id: 'R1', type: 'resistor', value: '330' }, { id: 'D1', type: 'led', color: 'red' }],
    nets: [['T+', 'R1.1'], ['R1.2', 'D1.A'], ['D1.K', 'T-']],
  }));
  assert.equal(cli(['layout', '.', 'spec.json'], dir).status, 0);
  const page = cli(['page', '.'], dir);
  assert.equal(page.status, 0, page.stderr);
  assert.match(page.stdout, /blinker\.html/);
  assert.ok(existsSync(join(dir, 'out', 'blinker.html')));
  assert.ok(!existsSync(join(dir, 'out', '..html')));
});

test('catalog of a servo, an SG90 or a speaker gives layout\'s "nearest it has" text, not the list of types', () => {
  for (const [name, near] of [['servo', /a DC motor \(type motor\)/], ['SG90', /a DC motor \(type motor\)/], ['speaker', /a passive buzzer \(type buzzer\)/]]) {
    const r = cli(['catalog', name]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, new RegExp(`^The kit does not know "${name}"`));
    assert.match(r.stdout, near);
    assert.doesNotMatch(r.stdout, /Types:/);
  }
  assert.match(cli(['catalog', 'altavoz', '--lang', 'es']).stdout, /^El kit no conoce «altavoz».*zumbador pasivo/);
});

test('a jumper hidden in one view only is a note of an APPROVED review, never a warning', async () => {
  const { review } = await import('../src/review.js');
  const { expandRecipe } = await import('../src/recipes/index.js');
  // potentiometer-led: W1 is 20 % visible in one view, well seen in the other.
  const r = review(autoLayout(expandRecipe('potentiometer-led').spec).circuit, { profile: 'lesson', electrical: false });
  assert.equal(r.verdict, 'approved');
  const hidden = r.advisory.filter((a) => a.code === 'PART_HIDDEN');
  assert.ok(hidden.some((a) => a.params.part === 'W1' && a.params.visible < 50), JSON.stringify(hidden));
  assert.ok(hidden.every((a) => a.severity === 'info'), JSON.stringify(hidden));
  // The draft profile keeps what the drawing says.
  assert.ok(review(autoLayout(expandRecipe('potentiometer-led').spec).circuit, { profile: 'draft', electrical: false }).blocking.some((a) => a.code === 'PART_HIDDEN' && a.severity === 'warning'));
});

// ---- 2. A circuit with two resting states says so

const LATCH = {
  parts: [
    { id: 'BT1', type: 'battery', format: '9V' },
    { id: 'R1', type: 'resistor', value: '1k' }, { id: 'R2', type: 'resistor', value: '1k' },
    { id: 'R3', type: 'resistor', value: '10k' }, { id: 'R4', type: 'resistor', value: '10k' },
    { id: 'R5', type: 'resistor', value: '470' },
    { id: 'Q1', part: '2N2222A' }, { id: 'Q2', part: '2N2222A' },
    { id: 'D1', type: 'led', color: 'green' },
    { id: 'SW1', type: 'button' }, { id: 'SW2', type: 'button' },
  ],
  nets: [
    ['BT1.+', 'T+'], ['BT1.-', 'T-'], ['T+', 'R1.1'], ['R1.2', 'Q1.C', 'R4.1', 'R5.1'], ['R5.2', 'D1.A'], ['D1.K', 'T-'],
    ['T+', 'R2.1'], ['R2.2', 'Q2.C', 'R3.1'], ['R3.2', 'Q1.B', 'SW1.1'], ['R4.2', 'Q2.B', 'SW2.1'],
    ['Q1.E', 'T-'], ['Q2.E', 'T-'], ['SW1.3', 'T-'], ['SW2.3', 'T-'],
  ],
};

test('a transistor latch says it has two resting states, with the readings of each, and runs from the first', async () => {
  const { formatLayout } = await import('../src/layout.js');
  const { restingStates, simulate, withStates } = await import('../src/sim/index.js');
  const { runCircuit } = await import('./run-generous.js');
  const r = autoLayout(LATCH);
  const two = restingStates(r.circuit);
  assert.equal(two?.states.length, 2);
  const lit = two.states.map((s) => s.reading.parts.D1.current > 1e-3);
  assert.deepEqual([...lit].sort(), [false, true], 'D1 lit in one state, dark in the other');
  for (const s of two.states) assert.deepEqual(Object.values(s.reading.parts).filter((p) => p.kind === 'Q').map((p) => p.region === 'off').sort(), [false, true], 'one transistor on, one off');
  const { t } = await import('../src/index.js');
  const text = formatLayout(r, 'en', { t, formatIssue });
  assert.match(text, /\nTwo resting states \(a model\): .*a real circuit never stays in; it powers up in one of them, and the kit cannot say which/);
  assert.match(text, /\n {2}1\. Q1 (on|off), Q2 (on|off) · battery BT1 [\d.]+ V · D1 /);
  assert.match(text, /\n {2}2\. /);
  assert.doesNotMatch(text, /\nReadings \(at rest/);
  const dc = withStates(r.circuit, simulate(r.circuit));
  assert.equal(dc.states.length, 2);
  assert.match(formatIssue(dc.issues.find((i) => i.code === 'SIM_TWO_STATES'), 'en'), /^warning: These readings are the balance point between the circuit's two resting states/);
  const run = runCircuit(r.circuit, { seconds: 0.5 });
  assert.equal(run.run.state, 1);
  assert.equal(run.outputs.find((o) => o.id === 'D1').onShare > 0.5, lit[0], 'the run rests in the first state');
  const { formatRun } = await import('../src/sim/format.js');
  assert.match(formatRun(run, 'en', { formatIssue }), /^Run from the first of its two resting states \(/);
});

test('two transistors in cascade, with no loop, keep one resting point', async () => {
  const { restingStates } = await import('../src/sim/index.js');
  const r = autoLayout({
    supplies: [{ id: 'V1', kind: 'bench', voltage: 9, positive: 'T+', negative: 'T-' }],
    parts: [
      { id: 'R1', type: 'resistor', value: '100k' }, { id: 'R2', type: 'resistor', value: '1k' }, { id: 'R3', type: 'resistor', value: '10k' },
      { id: 'R4', type: 'resistor', value: '1k' }, { id: 'Q1', part: '2N2222A' }, { id: 'Q2', part: '2N2222A' },
    ],
    nets: [['T+', 'R1.1', 'R2.1', 'R4.1'], ['R1.2', 'Q1.B'], ['R2.2', 'Q1.C', 'R3.1'], ['R3.2', 'Q2.B'], ['R4.2', 'Q2.C'], ['Q1.E', 'Q2.E', 'T-']],
  });
  assert.equal(restingStates(r.circuit), null);
});

// ---- 7. The skill says what the kit prints

test('run-it.md quotes the latch\'s two resting states as layout prints them', async () => {
  const { readFileSync } = await import('node:fs');
  const { formatLayout } = await import('../src/layout.js');
  const { t } = await import('../src/index.js');
  const text = readFileSync(new URL('../plugin-src/references/run-it.md', import.meta.url), 'utf8');
  const quoted = [...text.matchAll(/^> (\S.*)$/gm)].map((m) => m[1]);
  assert.equal(quoted.length, 3);
  const lines = new Set(formatLayout(autoLayout(LATCH), 'en', { t, formatIssue }).split('\n').map((l) => l.trim()));
  for (const line of quoted) assert.ok(lines.has(line), line);
  // The place marked for what the sketch session reports is filled (C13): no marker left.
  assert.doesNotMatch(text, /<!-- SKETCH SESSION:/);
  assert.match(text, /^## Sketches\n\n[\s\S]*attachInterrupt/m);
});

test('the skill says what a note is, what to do with nobody to ask, and to dry-run a swap of kinds', async () => {
  const { readFileSync } = await import('node:fs');
  const skill = readFileSync(new URL('../plugin-src/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /`· note:` lines \(drawing, nets, model details: over a limit is a ⚠\)/);
  assert.match(skill, /With nobody to ask: say what the kit lacks and stop\./);
  assert.match(skill, /a MOSFET for an NPN\) needs other\s+parts around it: `--dry-run` first/);
  const spec = readFileSync(new URL('../plugin-src/references/spec.md', import.meta.url), 'utf8');
  assert.doesNotMatch(spec, /does not know \(`shiftOut`/);
});
