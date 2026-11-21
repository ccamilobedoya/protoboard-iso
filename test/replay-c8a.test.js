// What a replay of first-time requests still found in the simulator and the checks (2026-11): each
// case is written from its reproduction, through the CLI as a child process or the public exports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';

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
