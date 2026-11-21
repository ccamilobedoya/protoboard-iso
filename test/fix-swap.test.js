// layout --fix on a part in backwards: the fix turns the part round or swaps a supply's leads, its
// "Applied the fix" line says so (never as an added resistor), the circuit after it has no hazard,
// and --fix --dry-run saves nothing. Through the CLI as a child process and the exports of layout.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../scripts/tmp.js';
import { autoLayout, fixRequest, formatLayout } from '../src/layout.js';
import { formatIssue, t } from '../src/index.js';

const root = new URL('../', import.meta.url).pathname;
const bin = join(root, 'bin/protoboard-iso.js');
const cli = (args) => spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });

const BUZZER = {
  parts: [{ id: 'BT1', type: 'battery', format: 'AA', cells: 3 }, { id: 'SW1', type: 'button' }, { id: 'BZ1', part: 'TMB12A05' }],
  nets: [['BT1.+', 'SW1.1'], ['SW1.3', 'BZ1.2'], ['BZ1.1', 'BT1.-']],
};
// A bench supply with no rails of its own (T+ and T−): swapping its leads writes them out, exchanged.
const REGULATOR = {
  supplies: [{ id: 'V1', voltage: 9 }],
  parts: [{ id: 'U1', part: 'L7805' }, { id: 'C1', type: 'capacitor', value: '100n' }],
  nets: [['T-', 'U1.IN'], ['T+', 'U1.GND', 'C1.2'], ['U1.OUT', 'C1.1']],
};
const BATTERY_REGULATOR = {
  parts: [{ id: 'BT1', type: 'battery', format: '9V' }, { id: 'U1', part: 'L7805' }, { id: 'C1', type: 'capacitor', value: '100n' }],
  nets: [['BT1.-', 'U1.IN'], ['BT1.+', 'U1.GND', 'C1.2'], ['U1.OUT', 'C1.1']],
};

const CASES = [
  { name: 'a buzzer wired backwards', spec: BUZZER, kind: 'swap', en: /^Applied the fix: turned BZ1 round \(its 1 and 2 swapped\)\.$/m, es: /^Arreglo aplicado: BZ1 volteado \(su 1 y su 2 intercambiados\)\.$/m },
  { name: 'a regulator fed backwards by a bench supply', spec: REGULATOR, kind: 'swap-supply', en: /^Applied the fix: swapped the leads of V1 \(its \+ and −\)\.$/m, es: /^Arreglo aplicado: intercambiados los cables de V1 \(su \+ y su −\)\.$/m },
  { name: 'a regulator fed backwards by its battery', spec: BATTERY_REGULATOR, kind: 'swap-supply', en: /^Applied the fix: swapped the leads of BT1 \(its \+ and −\)\.$/m, es: /^Arreglo aplicado: intercambiados los cables de BT1 \(su \+ y su −\)\.$/m },
];

for (const c of CASES) {
  test(`${c.name}: the fix is a swap, worded as one, and the circuit after it has no hazard`, () => {
    const laid = autoLayout(c.spec);
    assert.ok(laid.review.hazards.some((h) => h.code === 'SIM_REVERSE_VOLTAGE'), JSON.stringify(laid.review.hazards));
    const fixed = fixRequest(laid.circuit);
    assert.equal(fixed.applied?.kind, c.kind, JSON.stringify(fixed));
    const after = { ...autoLayout(fixed.spec), applied: fixed.applied };
    assert.deepEqual(after.review.hazards, []);
    for (const lang of ['en', 'es']) {
      const text = formatLayout(after, lang, { t, formatIssue });
      assert.match(text, c[lang]);
      assert.doesNotMatch(text, /in series with|en serie con|= \?|\{with\}/);
    }
  });
}

test('layout <target> --fix on a buzzer wired backwards: --dry-run saves nothing, then the fix clears the hazard', () => {
  const dir = tempDir('fix-swap-');
  const target = join(dir, 'bz');
  writeFileSync(join(dir, 'spec.json'), JSON.stringify(BUZZER));
  const laid = cli(['layout', target, join(dir, 'spec.json')]);
  assert.equal(laid.status, 0, laid.stderr);
  assert.match(laid.stdout, /To fix it: turn BZ1 round/);
  const before = readFileSync(join(target, 'circuit.json'), 'utf8');
  const dry = cli(['layout', target, '--fix', '--dry-run']);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /^Applied the fix: turned BZ1 round \(its 1 and 2 swapped\)\.$/m);
  assert.match(dry.stdout, /nothing was saved/);
  assert.equal(readFileSync(join(target, 'circuit.json'), 'utf8'), before);
  const done = cli(['layout', target, '--fix']);
  assert.equal(done.status, 0, done.stderr);
  assert.match(done.stdout, /^Applied the fix: turned BZ1 round/m);
  assert.doesNotMatch(done.stdout, /⚠/);
  assert.match(done.stdout, /^STATUS: DONE/m);
  assert.notEqual(readFileSync(join(target, 'circuit.json'), 'utf8'), before);
});
