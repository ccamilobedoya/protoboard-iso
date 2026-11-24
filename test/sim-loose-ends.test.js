// Loose ends left by the command-line work (C12) in the simulator's files, closed with C11: a program
// that names a folder, a one-line program that is a file name, a run's "at its strongest" only on a
// warning with a quantity, and two batteries facing each other as a hazard.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';
import { simulate } from '../src/sim/index.js';
import { runCircuit } from '../src/sim/run.js'; // its runs take under a second since C15b's step
import { formatIssue, review } from '../src/index.js';
import { CIRCUIT_FOLDER } from '../src/beside.js';

const example = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));
const withProgram = (program, folder) => {
  const c = example('uno-led.json');
  const out = { ...c, parts: c.parts.map((p) => (p.part === 'UNO' ? { ...p, program } : p)) };
  if (folder) out[CIRCUIT_FOLDER] = folder;
  return out;
};
const programIssue = (r) => r.issues.find((i) => i.code.startsWith('SIM_PROGRAM_'));

test('a program that names a folder says it is a folder, and where the kit looked', () => {
  const dir = tempDir('c11-folder-');
  mkdirSync(join(dir, 'sketches'));
  mkdirSync(join(dir, 'blink.ino'));
  for (const program of ['sketches/', 'blink.ino']) {
    const i = programIssue(simulate(withProgram(program, dir)));
    assert.equal(i?.code, 'SIM_PROGRAM_FOLDER', `${program}: ${JSON.stringify(i)}`);
    const text = formatIssue(i, 'en');
    assert.match(text, /is a folder, not a file/);
    assert.ok(text.includes(dir), text);
    assert.match(formatIssue(i, 'es'), /es una carpeta, no un archivo/);
  }
});

test('a one-line program that is a file name the kit does not read is said so, not parsed as a sketch', () => {
  const dir = tempDir('c11-name-');
  for (const program of ['blink.cpp', 'sketches/blink']) {
    const r = simulate(withProgram(program, dir));
    const i = programIssue(r);
    assert.equal(i?.code, 'SIM_PROGRAM_NOT_SKETCH', `${program}: ${JSON.stringify(r.issues)}`);
    const text = formatIssue(i, 'en');
    assert.match(text, /was taken for a file name, not a sketch/);
    assert.ok(text.includes(dir), 'where it looked');
    assert.match(text, /setup\(\) and loop\(\)/);
    assert.ok(!r.issues.some((x) => x.code === 'SIM_PROGRAM_ERROR'), 'no "does not read at line 1"');
  }
  // A circuit given whole (no folder) says that instead; a real sketch on one line is still a sketch.
  assert.match(formatIssue(programIssue(simulate(withProgram('blink.cpp'))), 'en'), /not loaded from a folder/);
  assert.ok(!programIssue(simulate(withProgram('void setup(){} void loop(){ delay(10); }'))));
  // Both are doubts of the review.
  assert.ok(review(withProgram('blink.cpp', dir)).doubts.some((d) => d.code === 'SIM_PROGRAM_NOT_SKETCH'));
});

test('a run says "at its strongest" only for a warning with a quantity', () => {
  const r = runCircuit(withProgram('void setup(){ pinMode(99, OUTPUT); } void loop(){ delay(10); }'), { seconds: 0.05 });
  const pin = r.issues.find((i) => i.code === 'SIM_PROGRAM_PIN_UNKNOWN');
  assert.ok(pin, JSON.stringify(r.issues.map((i) => i.code)));
  assert.equal(pin.when, undefined);
  assert.doesNotMatch(formatIssue(pin, 'en'), /strongest/);
});

test('two batteries in parallel facing opposite ways: each is a hazard over its maximum current, beside the short circuit', () => {
  const c = {
    parts: [
      { id: 'BT1', type: 'battery', format: '9V', pins: ['j10', 'j14'] },
      { id: 'BT2', type: 'battery', format: '9V', pins: ['h14', 'h10'] },
    ],
  };
  const v = review(c);
  const hazards = v.hazards.filter((h) => h.code === 'SIM_OVER_CURRENT').map((h) => h.params.part).sort();
  assert.deepEqual(hazards, ['BT1', 'BT2'], JSON.stringify(v.hazards));
  assert.match(formatIssue(v.hazards[0], 'en'), /carries 5\.\d+ A, more than its maximum 300 mA: it overheats and its voltage collapses/);
  assert.ok(v.doubts.some((d) => d.code === 'SIM_SHORT_CIRCUIT'));
});
