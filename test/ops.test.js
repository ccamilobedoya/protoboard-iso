import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyOps, OP_NAMES, evaluate, diffEvaluations, PART_TYPES } from '../src/index.js';
import { applyToTarget, undoTarget, readHistory, resolveTarget, loadCircuit } from '../src/node/workspace.js';
import { buildSchemas } from '../src/schema.js';

const example = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));
const codes = (list) => list.map((i) => i.code);

test('every operation applies, and its inverse restores the circuit exactly', () => {
  const original = example('led-resistor.json');
  const batches = [
    [{ op: 'add', part: { id: 'C1', type: 'capacitor', value: '100n', pins: ['g12', 'g13'] } }],
    [{ op: 'remove', part: 'D1' }],
    [{ op: 'move', part: 'W1', pins: ['j11', 'T-11'] }],
    [{ op: 'set', part: 'R1', value: '220', tolerance: '1%' }],
    [{ op: 'rename', part: 'R1', to: 'R10' }],
    [{ op: 'circuit', clearance: 3, netLabels: null }],
    [
      { op: 'rename', part: 'D1', to: 'LED1' },
      { op: 'set', part: 'LED1', color: 'green' },
      { op: 'move', part: 'LED1', pins: ['f9', 'f11'] },
    ],
  ];
  for (const ops of batches) {
    const { circuit, inverse, errors } = applyOps(original, ops);
    assert.deepEqual(errors, [], JSON.stringify(ops));
    assert.notDeepEqual(circuit, original);
    assert.deepEqual(applyOps(circuit, inverse).circuit, original, `inverse of ${ops.map((o) => o.op)}`);
  }
});

test('a batch is atomic: one bad operation and nothing changes', () => {
  const original = example('led-resistor.json');
  const { circuit, errors } = applyOps(original, [
    { op: 'set', part: 'R1', value: '220' },
    { op: 'move', part: 'R9', pins: ['j1', 'j5'] },
  ]);
  assert.deepEqual(codes(errors), ['OP_UNKNOWN_PART']);
  assert.equal(circuit, original);
});

test('operations are validated', () => {
  const c = example('led-resistor.json');
  assert.deepEqual(codes(applyOps(c, [{ op: 'explode' }]).errors), ['OP_UNKNOWN']);
  assert.deepEqual(codes(applyOps(c, [{ op: 'add', part: { id: 'R1', type: 'resistor', pins: ['j1', 'j5'] } }]).errors), ['OP_DUPLICATE_ID']);
  assert.deepEqual(codes(applyOps(c, [{ op: 'set', part: 'R1', pins: ['j1', 'j5'] }]).errors), ['OP_BAD']);
  assert.deepEqual(codes(applyOps(c, [{ op: 'circuit', parts: [] }]).errors), ['OP_BAD']);
  assert.deepEqual(codes(applyOps(c, []).errors), ['OP_BAD']);
});

test('the diff says what a change fixes and what it breaks', () => {
  const before = example('led-resistor.json');
  const { circuit: after } = applyOps(before, [{ op: 'move', part: 'W1', pins: ['j11', 'T-11'] }]);
  const diff = diffEvaluations(evaluate(before), evaluate(after));
  assert.ok(codes(diff.fixed).includes('PART_HIDDEN'), 'W1 no longer covers R1');
  assert.ok(codes(diff.introduced).includes('FLOATING_PIN'), 'but the LED cathode is now disconnected');
  assert.ok(diff.visibility.some((v) => v.part === 'R1' && v.after > v.before));
});

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'protoboard-iso-'));
  const target = join(dir, 'led');
  mkdirSync(target);
  writeFileSync(join(target, 'circuit.json'), JSON.stringify(example('led-resistor.json')));
  return target;
}

test('a folder target keeps circuit, history and outputs together', () => {
  const target = workspace();
  const paths = resolveTarget(target);
  assert.ok(paths.circuitFile.endsWith('led/circuit.json'));
  assert.ok(paths.historyFile.endsWith('led/history.jsonl'));
  const file = resolveTarget('examples/led-resistor.json');
  assert.ok(file.historyFile.endsWith('examples/led-resistor.history.jsonl'));
});

test('dry run changes nothing; apply saves, records history and writes the report', () => {
  const target = workspace();
  const ops = [{ op: 'set', part: 'R1', value: '220' }];
  const dry = applyToTarget(target, ops, { dryRun: true });
  assert.equal(dry.applied, false);
  assert.equal(loadCircuit(resolveTarget(target)).revision, undefined);
  assert.deepEqual(readHistory(resolveTarget(target)), []);

  const done = applyToTarget(target, ops, { author: 'test', note: 'smaller resistor' });
  assert.equal(done.revision, 1);
  const saved = loadCircuit(resolveTarget(target));
  assert.equal(saved.parts.find((p) => p.id === 'R1').value, '220');
  const [entry] = readHistory(resolveTarget(target));
  assert.equal(entry.author, 'test');
  assert.deepEqual(entry.ops, ops);
  assert.ok(existsSync(done.files.reportFile) && existsSync(done.files.svgFile));
  assert.equal(JSON.parse(readFileSync(done.files.reportFile, 'utf8')).revision, 1);
});

test('expect-revision protects against overwriting someone else', () => {
  const target = workspace();
  applyToTarget(target, [{ op: 'set', part: 'R1', value: '220' }], { outputs: false });
  const late = applyToTarget(target, [{ op: 'set', part: 'R1', value: '1k' }], { expectRevision: 0, outputs: false });
  assert.deepEqual(codes(late.errors), ['REVISION_MISMATCH']);
  assert.equal(loadCircuit(resolveTarget(target)).parts.find((p) => p.id === 'R1').value, '220');
});

test('undo walks back one change at a time', () => {
  const target = workspace();
  const original = loadCircuit(resolveTarget(target));
  applyToTarget(target, [{ op: 'set', part: 'R1', value: '220' }], { outputs: false });
  applyToTarget(target, [{ op: 'remove', part: 'W1' }], { outputs: false });
  const first = undoTarget(target, { outputs: false });
  assert.equal(first.undid, 2);
  assert.ok(loadCircuit(resolveTarget(target)).parts.some((p) => p.id === 'W1'));
  const second = undoTarget(target, { outputs: false });
  assert.equal(second.undid, 1);
  const { revision, ...rest } = loadCircuit(resolveTarget(target));
  assert.equal(revision, 4);
  assert.deepEqual(rest, original);
  assert.deepEqual(codes(undoTarget(target, { outputs: false }).errors), ['NOTHING_TO_UNDO']);
});

test('the schema files are up to date and match the registries', () => {
  for (const [name, schema] of Object.entries(buildSchemas())) {
    const onDisk = JSON.parse(readFileSync(new URL(`../schema/${name}`, import.meta.url), 'utf8'));
    assert.deepEqual(onDisk, schema, `${name} is stale: run npm run schemas`);
  }
  const { 'circuit.schema.json': circuit, 'ops.schema.json': ops } = buildSchemas();
  assert.deepEqual(circuit.$defs.part.properties.type.enum, Object.keys(PART_TYPES));
  assert.deepEqual(ops.items.oneOf.map((o) => o.properties.op.const), OP_NAMES);
});
