// The device registry (src/sim/devices/): every part type the simulator handles has a device (a
// type shared by several only when each accepts its own parts: the ICs), devices that share a reading kind share its reading hooks, and every warning a stress
// can raise has its text in every language.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PART_TYPES } from '../src/parts/types/index.js';
import { DEVICES } from '../src/sim/devices/index.js';
import { stress, stressIssue } from '../src/sim/devices/shared.js';
import { LANGUAGES, t } from '../src/i18n/index.js';

const NOT_SIMULATED = ['module']; // left unconnected and reported (SIM_UNSUPPORTED)

test('devices: one per simulated part type, and only known types', () => {
  const types = DEVICES.flatMap((d) => d.types);
  for (const type of types) {
    assert.ok(PART_TYPES[type], `${type} is a part type`);
    const sharing = DEVICES.filter((d) => d.types.includes(type));
    if (sharing.length > 1) for (const d of sharing) assert.equal(typeof d.accepts, 'function', `${type}: ${d.kind} must say which parts it takes`);
  }
  for (const type of Object.keys(PART_TYPES)) {
    if (!NOT_SIMULATED.includes(type)) assert.ok(types.includes(type), `${type} has a device`);
  }
  for (const d of DEVICES) {
    assert.equal(typeof d.params, 'function', `${d.types}: params`);
    assert.equal(typeof d.elements, 'function', `${d.types}: elements`);
    assert.equal(typeof d.read, 'function', `${d.types}: read`);
    assert.equal(typeof d.lines, 'function', `${d.types}: lines`);
    assert.equal(typeof d.tag, 'function', `${d.types}: tag`);
  }
});

test('devices: the same reading kind means the same reading hooks', () => {
  const byKind = new Map();
  for (const d of DEVICES) {
    const first = byKind.get(d.kind);
    if (!first) byKind.set(d.kind, d);
    else for (const hook of ['lines', 'tag', 'probe', 'currentPins']) assert.equal(d[hook], first[hook], `${d.types} and ${first.types}: ${hook}`);
  }
});

test('stresses: ratio against the limit, a warning only when over it, with its text', () => {
  const s = stress('SIM_OVER_POWER', 'power', 0.5, 0.25, 'W');
  assert.equal(s.ratio, 2);
  assert.deepEqual(stressIssue('R1', s), { severity: 'warning', code: 'SIM_OVER_POWER', params: { part: 'R1', power: { value: 0.5, unit: 'W' }, max: { value: 0.25, unit: 'W' } } });
  assert.equal(stress('SIM_OVER_CURRENT', 'current', 1, undefined, 'A').ratio, 0, 'no limit known: no stress');
  for (const code of ['SIM_OVER_POWER', 'SIM_OVER_CURRENT', 'SIM_REVERSE_VOLTAGE', 'SIM_CAP_REVERSED', 'SIM_CAP_OVER_VOLTAGE', 'SIM_REG_HOT']) {
    for (const lang of Object.keys(LANGUAGES)) assert.notEqual(t(lang, `check.${code}`), `check.${code}`, `${code} in ${lang}`);
  }
});
