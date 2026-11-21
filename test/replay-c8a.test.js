// What a replay of first-time requests still found in the simulator and the checks (2026-11): each
// case is written from its reproduction, through the CLI as a child process or the public exports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';
import { autoLayout } from '../src/layout.js';
import { formatIssue } from '../src/index.js';
import { checkHazards } from '../src/sim/index.js';

const root = new URL('../', import.meta.url).pathname;
const bin = join(root, 'bin/protoboard-iso.js');
const cli = (args) => spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });

// A sketch named by file beside circuit.json, with a sensor that reads the world (an LDR): the
// environment's ends are states of the hazard check, compiled again, and they must keep the folder.
const BLINK = (pin) => `void setup() { pinMode(${pin}, OUTPUT); }\nvoid loop() { digitalWrite(${pin}, HIGH); delay(200); digitalWrite(${pin}, LOW); delay(200); }\n`;
const BOARDS = {
  uno: { part: 'ARDUINO-UNO', pin: 'D13', number: 13, power: '5V', analog: 'A0' },
  esp32: { part: 'ESP32-DEVKIT', pin: 'D23', number: 23, power: '3V3', analog: 'D34' },
};

for (const [name, b] of Object.entries(BOARDS)) {
  test(`a ${name}'s program file beside circuit.json is found by layout, review and simulate --run`, () => {
    const dir = tempDir(`c8a-ino-${name}-`);
    const target = join(dir, 'circuits', 'w');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'blink.ino'), BLINK(b.number));
    const spec = {
      parts: [{ id: 'U1', part: b.part, program: 'blink.ino' }, { id: 'D1', type: 'led', color: 'red' }, { id: 'R1', type: 'resistor', value: '220' }, { id: 'LDR1', part: 'GL5528' }, { id: 'R2', type: 'resistor', value: '10k' }],
      nets: [[`U1.${b.pin}`, 'R1.1'], ['R1.2', 'D1.A'], ['D1.K', 'U1.GND', 'R2.2'], [`U1.${b.power}`, 'LDR1.1'], ['LDR1.2', 'R2.1', `U1.${b.analog}`]],
    };
    writeFileSync(join(dir, 'spec.json'), JSON.stringify(spec));
    const laid = cli(['layout', target, join(dir, 'spec.json')]);
    assert.equal(laid.status, 0, laid.stdout + laid.stderr);
    assert.doesNotMatch(laid.stdout, /was not found/);
    assert.match(laid.stdout, /^Behaviour.*D1 2\.5 Hz/m);
    const reviewed = cli(['review', target]);
    assert.doesNotMatch(reviewed.stdout, /was not found/);
    const run = cli(['simulate', target, '--run', '1']);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /D1 \(LED\): 2\.5 Hz/);
  });
}

// ---- 2. An output that never comes on is a doubt (SIM_OUTPUT_NEVER_ON)

const neverOn = (r) => r.review.doubts.filter((d) => d.code === 'SIM_OUTPUT_NEVER_ON');

test('a relay fed straight from a sensor module\'s output never pulls in, nor the pump behind it', () => {
  const r = autoLayout({
    supplies: [{ voltage: 5, positive: 'T+', negative: 'T-' }],
    parts: [{ id: 'M1', part: 'YL-69' }, { id: 'K1', part: 'SRD-05VDC-SL-C' }, { id: 'P1', type: 'motor', part: 'RE-140RA-12240' }],
    nets: [['T+', 'M1.VCC', 'K1.COM'], ['T-', 'M1.GND', 'K1.A2', 'P1.-'], ['M1.DO', 'K1.A1'], ['K1.NO', 'P1.+']],
  });
  assert.equal(r.status, 'warnings');
  const lines = neverOn(r).map((d) => formatIssue(d, 'en'));
  assert.ok(lines.some((l) => /^warning: K1 never pulls in: .*Its coil gets at most 3\.\d+ mA and needs 53\.6 mA/.test(l)), lines.join('\n'));
  assert.ok(lines.some((l) => /^warning: P1 never comes on/.test(l)), lines.join('\n'));
  // Said once, not also as driven but not pulled in.
  assert.ok(!r.review.doubts.some((d) => d.code === 'SIM_RELAY_UNDERDRIVEN'));
});

test('a joule thief of two uncoupled inductors leaves its LED dark: a doubt, not DONE', () => {
  const r = autoLayout({
    parts: [{ id: 'BT1', type: 'battery', format: 'AA', cells: 1 }, { id: 'R1', type: 'resistor', value: '1k' }, { id: 'Q1', part: '2N3904' }, { id: 'L1', type: 'inductor', value: '100u' }, { id: 'L2', type: 'inductor', value: '100u' }, { id: 'D1', type: 'led', color: 'white' }],
    nets: [['BT1.+', 'L1.1', 'L2.1'], ['L1.2', 'Q1.C', 'D1.A'], ['D1.K', 'BT1.-'], ['L2.2', 'R1.1'], ['R1.2', 'Q1.B'], ['Q1.E', 'BT1.-']],
  });
  assert.equal(r.status, 'warnings');
  assert.match(formatIssue(neverOn(r)[0], 'en'), /^warning: D1 never comes on: the kit found no state in which it does/);
  assert.match(formatIssue(neverOn(r)[0], 'es'), /^aviso: D1 nunca se enciende/);
});

test('LEDs behind a chip that is not simulated are one doubt naming them all', () => {
  const r = autoLayout({
    supplies: [{ voltage: 5, positive: 'T+', negative: 'T-' }],
    parts: [{ id: 'U1', part: '74HC595' }, { id: 'R1', type: 'resistor', value: '330' }, { id: 'D1', type: 'led', color: 'red' }, { id: 'R2', type: 'resistor', value: '330' }, { id: 'D2', type: 'led', color: 'green' }],
    nets: [['T+', 'U1.VCC'], ['T-', 'U1.GND', 'D1.K', 'D2.K'], ['U1.QA', 'R1.1'], ['R1.2', 'D1.A'], ['U1.QB', 'R2.1'], ['R2.2', 'D2.A']],
  });
  const found = neverOn(r);
  assert.equal(found.length, 1);
  assert.match(formatIssue(found[0], 'en'), /^warning: D1, D2 never come on/);
});

test('no example gets SIM_OUTPUT_NEVER_ON (the recipes: test/hazards.test.js)', () => {
  const dir = join(root, 'examples');
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const c = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    const found = checkHazards(c).doubts.filter((d) => d.code === 'SIM_OUTPUT_NEVER_ON');
    assert.deepEqual(found.map((d) => formatIssue(d, 'en')), [], name);
  }
});
