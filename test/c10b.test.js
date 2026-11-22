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
