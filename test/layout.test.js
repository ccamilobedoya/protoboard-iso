import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLayout, checkNets, formatLayout } from '../src/layout.js';
import { formatIssue, t, checkCircuit } from '../src/index.js';

// A 5 V regulator with its capacitors and a pilot LED, from a 9 V battery's strip.
const spec = {
  board: 'auto',
  parts: [
    { id: 'U1', type: 'regulator', part: '7805' },
    { id: 'C1', type: 'capacitor', kind: 'ceramic', value: '100n' },
    { id: 'R1', type: 'resistor', value: '1k' },
    { id: 'D1', type: 'led', color: 'red' },
  ],
  nets: [
    ['U1.IN', 'T+'],
    { pins: ['U1.OUT', 'C1.1', 'R1.1'], color: 'orange' },
    ['R1.2', 'D1.anode'],
    ['U1.GND', 'C1.2', 'D1.cathode', 'T-'],
  ],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 9, positive: 'T+', negative: 'T-' }],
};

test('layout: every part placed, every net connected, nothing shorted, in one call', () => {
  const r = autoLayout(spec);
  assert.equal(r.placed.length, 4);
  assert.deepEqual(r.problems, []);
  assert.ok(r.check.ok, JSON.stringify(r.check));
  assert.equal(r.review.verdict, 'approved', r.review.blocking.map((b) => formatIssue(b, 'en')).join('\n'));
  // Left to right in the order given.
  const col = (id) => Math.min(...Object.values(r.placed.find((p) => p.id === id).pins).map((h) => Number(h.replace(/\D/g, ''))));
  assert.ok(col('U1') < col('R1') && col('R1') <= col('D1'));
  assert.doesNotMatch(formatLayout(r, 'es', { t, formatIssue }), /\{\w+\}/);
});

test('checkNets: nets that share a rail are one net; a missing pin and a short are reported', () => {
  const r = autoLayout(spec);
  const asked = (pins) => pins.map((p, index) => ({ index, pins: p }));
  assert.ok(checkNets(r.circuit, asked([['U1.GND', 'T-'], ['D1.cathode', 'T-']])).ok, 'both on T-: one net');
  const apart = checkNets(r.circuit, asked([['T+', 'T-']]));
  assert.equal(apart.missing.length, 1, 'the two rails are not joined in this circuit');
  const short = checkNets(r.circuit, asked([['U1.OUT'], ['C1.1']]));
  assert.equal(short.shorted.length, 1, 'two nets asked apart are one in the circuit');
  const wrong = checkNets(r.circuit, asked([['U1.OUT', 'R1.2']]));
  assert.equal(wrong.missing.length, 1);
});

test('parts by name: part numbers, modules and aliases resolve without a type; unknown ones suggest', async () => {
  const { resolvePart, pinsOf } = await import('../src/parts/resolve.js');
  assert.deepEqual(resolvePart({ id: 'U1', part: 'L7805CV' }).part, { id: 'U1', type: 'regulator', part: '7805' });
  assert.deepEqual(resolvePart({ id: 'S1', part: 'KCD1', on: true }).part, { id: 'S1', type: 'switch', style: 'rocker', on: true });
  assert.equal(resolvePart({ id: 'R1', type: 'resistencia', value: '1k' }).part.type, 'resistor');
  assert.equal(resolvePart({ id: 'D1', part: 'LED', color: 'red' }).part.type, 'led');
  assert.equal(resolvePart({ id: 'A1', part: 'Arduino UNO' }).error?.code ?? resolvePart({ id: 'A1', part: 'UNO' }).part.type, 'module');
  const unknown = resolvePart({ id: 'D2', part: '1N4148W' });
  assert.equal(unknown.error.code, 'UNKNOWN_PART_NAME');
  assert.match(unknown.error.params.suggestions, /1N4148/);
  assert.deepEqual(pinsOf({ type: 'switch' }), ['1', '2']);
});

test('validateSpec finds everything wrong in one pass, and layout places nothing then', () => {
  const bad = {
    parts: [{ id: 'U1', part: '7805' }, { id: 'U1', part: '7805' }, { id: 'X', part: 'warp-core' }, { id: 'D1', part: 'LED' }],
    nets: [['U1.SENSE', 'T+'], ['Q7.B', 'T-'], ['nonsense'], ['D1.anode', 'T+']],
  };
  const r = autoLayout(bad);
  assert.ok(r.invalid && r.checked);
  const codes = r.problems.map((p) => p.code).sort();
  for (const code of ['DUPLICATE_ID', 'UNKNOWN_PART_NAME', 'NET_UNKNOWN_PIN', 'NET_UNKNOWN_PART', 'NET_BAD_REF']) assert.ok(codes.includes(code), code);
  assert.match(formatLayout(r, 'es', { t, formatIssue }), /Sus patas: IN, GND, OUT/);
  // check only: a good spec comes back resolved, nothing placed.
  const ok = autoLayout({ parts: [{ id: 'U1', part: '7805' }], nets: [['U1.IN', 'T+'], ['U1.GND', 'T-'], ['U1.OUT']] }, { checkOnly: true });
  assert.equal(ok.invalid, false);
  assert.equal(ok.parts[0].type, 'regulator');
  assert.equal(ok.circuit, undefined);
});

test('a field the part type does not take is a warning in a circuit and an error in a layout spec', () => {
  const circuit = { version: 1, board: 'auto', parts: [{ id: 'S1', type: 'switch', state: 'on', pins: { 1: 'e5', 2: 'e7' } }] };
  const warning = checkCircuit(circuit).issues.find((i) => i.code === 'UNKNOWN_FIELD');
  assert.equal(warning?.severity, 'warning');
  assert.match(formatIssue(warning, 'es'), /«state».*on/);
  const r = autoLayout({ parts: [{ id: 'S1', part: 'KCD1', state: 'on' }], nets: [['S1.1', 'T+'], ['S1.2']] });
  assert.ok(r.invalid);
  assert.equal(r.problems[0].code, 'UNKNOWN_FIELD');
});

test('pin names as people write them: aliases resolve to the part\'s own names, and the answer ends in one status', () => {
  const aliased = {
    ...spec,
    nets: [['U1.VIN', 'T+'], { pins: ['U1.VOUT', 'C1.1', 'R1.1'], color: 'orange' }, ['R1.2', 'D1.A'], ['U1.GND', 'C1.2', 'D1.K', 'T-']],
  };
  const r = autoLayout(aliased);
  assert.equal(r.status, 'done', formatLayout(r, 'en', { t, formatIssue }));
  assert.ok(r.check.ok);
  assert.match(formatLayout(r, 'en', { t, formatIssue }).split('\n').at(-1), /^STATUS: DONE · /);
  assert.equal(autoLayout({ ...spec, nets: [['D1.X', 'T+']] }, { checkOnly: true }).status, 'fix_spec');
  assert.equal(autoLayout(spec, { checkOnly: true }).status, 'spec_ok');
});

test('the spec is kept in the circuit, a relayout keeps what still fits, and review checks the nets', async () => {
  const { specFromCircuit } = await import('../src/layout.js');
  const { review } = await import('../src/review.js');
  const { applyOps } = await import('../src/ops.js');
  const first = autoLayout(spec);
  const c = first.circuit;
  assert.equal(first.status, 'done');
  assert.equal(c.spec.nets.length, spec.nets.length);
  assert.ok(c.spec.wires.length && c.spec.wires.every((id) => c.parts.find((p) => p.id === id).type === 'wire'));
  // From the circuit back to a spec: its parts without holes and without the jumpers.
  const back = specFromCircuit(c);
  assert.deepEqual(back.parts.map((p) => p.id), ['U1', 'C1', 'R1', 'D1']);
  assert.ok(back.parts.every((p) => !p.pins));
  // Laid out again with one value changed: every part keeps its holes.
  const again = autoLayout(specFromCircuit(c, { parts: back.parts.map((p) => (p.id === 'R1' ? { ...p, value: '2k2' } : p)) }), { previous: c });
  assert.equal(again.status, 'done');
  for (const p of c.parts.filter((q) => q.type !== 'wire')) assert.deepEqual(again.circuit.parts.find((q) => q.id === p.id).pins, p.pins, p.id);
  // A jumper removed by hand: review blocks with the spec's net.
  const cut = applyOps(c, [{ op: 'remove', part: c.spec.wires[0] }]).circuit;
  assert.ok(review(cut).blocking.some((b) => b.code === 'SPEC_NET_MISSING'));
  // A rename follows into the spec.
  const renamed = applyOps(c, [{ op: 'rename', part: 'R1', to: 'R9' }]).circuit;
  assert.ok(renamed.spec.nets.flat().some((x) => (x.pins ?? [x]).some((r) => String(r).startsWith('R9.'))));
  assert.equal(review(renamed).blocking.filter((b) => b.code.startsWith('SPEC_')).length, 0);
});

test('a ground net without a rail goes to the − rail, with a note', () => {
  const r = autoLayout({
    parts: [{ id: 'R1', type: 'resistor', value: '1k' }, { id: 'D1', type: 'led', color: 'red' }, { id: 'U1', part: 'UNO' }],
    nets: [['U1.D13', 'R1.1'], ['R1.2', 'D1.A'], ['D1.K', 'U1.GND']],
  });
  assert.ok(r.notes.some((n) => n.code === 'LAYOUT_GROUND_TO_RAIL'), JSON.stringify(r.notes));
  assert.ok(r.check.ok);
  assert.deepEqual(r.circuit.spec.nets[2], ['D1.cathode', 'U1.GND'], 'the spec keeps what was asked, not the convention');
});

test('the example in SKILL.md lays out to STATUS: DONE (the first thing an assistant copies)', async () => {
  const { readFileSync } = await import('node:fs');
  const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  const block = /## 1\. [^\n]*\n+```json\n([\s\S]*?)```/.exec(skill)?.[1];
  assert.ok(block, 'SKILL.md section 1 starts with a json example');
  const { target, ...example } = JSON.parse(block);
  assert.ok(target);
  const r = autoLayout(example);
  assert.equal(r.status, 'done', formatLayout(r, 'en', { t, formatIssue }));
});
