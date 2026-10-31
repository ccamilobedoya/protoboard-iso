// The golden frames (scripts/frames.js, test/frames/): the cases are well formed, their pages run
// the simulation, and a run is judged pass, fail or skip, never pass without a stored hash.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCases, casePage, verdict, exitCode } from '../scripts/frames.js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RECIPES } from '../src/recipes/index.js';

const HASH = /^[0-9a-f]{64}$/;

test('frames: three recipes and a frame per move, each with a size, ticks and a stored hash', () => {
  const cases = loadCases();
  assert.deepEqual([...new Set(cases.map((c) => c.recipe))].sort(), ['led-resistor', 'npn-switch', 'rc-square']);
  // V6: one golden frame for each move built (the plan's M numbers), from a timeline or a tap.
  const moves = cases.filter((c) => c.name.startsWith('move-')).map((c) => c.name.slice(5, 8));
  assert.deepEqual(moves, ['m01', 'm02', 'm03', 'm08', 'm09', 'm10', 'm12', 'm13', 'm14', 'm15', 'm16']);
  for (const c of cases.filter((x) => x.tour)) assert.ok(existsSync(fileURLToPath(new URL(`../${c.tour}`, import.meta.url))), c.name);
  for (const c of cases) {
    assert.ok(RECIPES[c.recipe], c.name);
    assert.ok(c.viewport.width > 0 && c.viewport.height > 0, c.name);
    assert.ok(c.ticks.length && c.ticks.every(([ms, steps]) => ms >= 0 && Number.isInteger(steps) && steps > 0), c.name);
    assert.match(c.png, HASH, `${c.name}: node scripts/frames.js --write`);
    assert.match(c.html, HASH, c.name);
    assert.ok(c.renderer, c.name);
  }
});

test('frames: the page of a case carries the live simulation, and the case of a move its timeline', () => {
  const html = casePage(loadCases().find((c) => c.name === 'npn-switch'));
  assert.match(html, /id="sim-program"/);
  assert.doesNotMatch(html, /"tour":/);
  assert.match(casePage(loadCases().find((c) => c.name === 'move-m15-insert')), /"tour":/);
});

test('frames: a run passes only on the same browser and hash', () => {
  const c = { renderer: 'chromium 1 linux-x64', html: 'a', png: 'p' };
  const run = (pngs, extra = {}) => verdict(c, { html: 'a', pngs, renderer: 'chromium 1 linux-x64', ...extra }).status;
  assert.equal(run(['p', 'p']), 'pass');
  assert.equal(run(['q']), 'fail');
  assert.equal(run(['p', 'q']), 'fail', 'two runs that differ');
  assert.equal(run(['p'], { renderer: 'chromium 2 linux-x64' }), 'skip', 'another browser');
  assert.equal(verdict({}, { html: 'a', pngs: ['p'], renderer: 'x' }).status, 'fail', 'no stored hash');
  assert.match(verdict(c, { html: 'b', pngs: ['q'], renderer: c.renderer }).detail, /page changed/);
  const ci = (pngs) => verdict(c, { html: 'b', pngs, renderer: 'other' }, { determinism: true }).status;
  assert.equal(ci(['q', 'q']), 'pass', 'CI: two runs that agree, whatever is stored');
  assert.equal(ci(['q', 'r']), 'fail', 'CI: two runs that differ');
  assert.equal(ci(['q']), 'skip', 'CI: one run proves nothing');
  assert.equal(exitCode([{ status: 'pass' }, { status: 'skip' }]), 2);
  assert.equal(exitCode([{ status: 'skip' }, { status: 'fail' }]), 1);
  assert.equal(exitCode([{ status: 'pass' }]), 0);
});
