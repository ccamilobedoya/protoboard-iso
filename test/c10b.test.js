// What a third round of first-time users found (C10b): a part that cannot be judged is not called
// dead, a note that is a hazard is a ⚠, a run that ends early says so, and small truths.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout } from './layout-generous.js';
import { formatIssue } from '../src/index.js';

const codes = (list) => list.map((i) => i.code);

// ---- 3. A part that cannot be judged is not called dead

// A 555 clocking a CD4017 that would light three LEDs: the LEDs hang from the chip the kit does not
// simulate, so its doubt names them and none is called never on.
test('LEDs that hang from a chip not simulated are named by its doubt, not called never on', () => {
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
  assert.ok(!codes(doubts).includes('SIM_OUTPUT_NEVER_ON'), JSON.stringify(doubts));
  const chip = doubts.find((d) => d.code === 'SIM_PART_NOT_SIMULATED');
  assert.equal(chip.params.drives, 'D1, D2, D3');
  assert.match(formatIssue(chip, 'en'), /so the kit cannot tell what U2 does, nor what D1, D2, D3 do/);
  assert.match(formatIssue(chip, 'es'), /ni qué hacen D1, D2, D3/);
});

// An LED wired backwards beside the same kind of chip never comes on for a reason the kit simulated:
// it keeps its doubt; the LED behind the chip does not get one.
test('an output dark for a reason the kit simulated keeps its doubt beside a chip not simulated', () => {
  const r = autoLayout({
    supplies: [{ voltage: 5, positive: 'T+', negative: 'T-' }],
    parts: [
      { id: 'U1', part: '74HC595' },
      { id: 'R1', type: 'resistor', value: '330' },
      { id: 'D1', type: 'led', color: 'red' },
      { id: 'R2', type: 'resistor', value: '330' },
      { id: 'D2', type: 'led', color: 'green' },
    ],
    nets: [['T+', 'U1.VCC', 'R2.1'], ['T-', 'U1.GND', 'D1.K', 'D2.A'], ['U1.QA', 'R1.1'], ['R1.2', 'D1.A'], ['R2.2', 'D2.K']],
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
  const { runCircuit } = await import('../src/sim/run.js');
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
