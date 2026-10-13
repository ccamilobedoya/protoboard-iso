import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectCircuit, formatReport, renderCircuit } from '../src/index.js';

const example = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));
const codes = (report) => report.problems.map((p) => p.code);

test('the report gives every lead its hole, node, board and screen position', () => {
  const report = inspectCircuit(example('led-resistor.json'));
  const d1 = report.parts.find((p) => p.id === 'D1');
  assert.deepEqual(d1.pins.map((p) => [p.pin, p.hole, p.node]), [['anode', 'e9', '9:a-e'], ['cathode', 'e10', '10:a-e']]);
  assert.ok(Math.abs(d1.pins[1].world.x - d1.pins[0].world.x - 2.54) < 0.01, 'neighbouring holes 2.54 mm apart');
  assert.ok(d1.box.width > 0 && d1.box.height > 0);
  assert.equal(d1.visible, 1);
  assert.equal(d1.value, 'red');
});

test('a tall part in front hides the one behind it, and only from that side', () => {
  const circuit = {
    parts: [
      // From the front-right corner, "behind" C1 is towards the back and the left.
      { id: 'R1', type: 'resistor', value: '1k', pins: ['c4', 'c8'] },
      { id: 'C1', type: 'capacitor', value: '1000u', voltage: 16, pins: ['g11', 'g13'] },
    ],
  };
  const front = inspectCircuit(circuit, { view: 'front' }).parts.find((p) => p.id === 'R1');
  const back = inspectCircuit(circuit, { view: 'back' }).parts.find((p) => p.id === 'R1');
  assert.ok(front.visible < 0.9, `front visible ${front.visible}`);
  assert.equal(front.hiddenBy[0].part, 'C1');
  assert.ok(back.visible > front.visible);
});

test('labels never cover parts, each other or the rail labels in the examples', () => {
  for (const name of ['led-resistor.json', 'voltage-divider.json', 'parts-showcase.json']) {
    for (const fit of ['board', 'parts']) {
      const found = codes(inspectCircuit(example(name), { fit }));
      for (const code of ['LABEL_COVERS_PART', 'LABEL_OVERLAP', 'LABEL_HIDES_TEXT']) assert.ok(!found.includes(code), `${name} ${fit}: ${code}`);
    }
  }
});

test('small markings are reported and a larger scale fixes them', () => {
  const circuit = { parts: [{ id: 'Q1', type: 'bjt', part: '2N2222A', pins: ['c10', 'c11', 'c12'] }] };
  assert.ok(codes(inspectCircuit(circuit)).includes('TEXT_TOO_SMALL'));
  assert.ok(!codes(inspectCircuit(circuit, { scale: 12 })).includes('TEXT_TOO_SMALL'));
});

test('the text report fills every placeholder in both languages', () => {
  for (const lang of ['en', 'es']) {
    const text = formatReport(inspectCircuit(example('parts-showcase.json'), { lang }), lang);
    assert.doesNotMatch(text, /\{\w+\}/);
    assert.match(text, lang === 'es' ? /pata 1 → c2/ : /pin 1 → c2/);
  }
});

test('annotation layers are drawn only when asked for', () => {
  const circuit = example('led-resistor.json');
  const plain = renderCircuit(circuit).svg;
  assert.doesNotMatch(plain, /class="annotations"/);
  const all = renderCircuit(circuit, { annotate: 'all' }).svg;
  assert.match(all, /<g class="annotations">/);
  assert.match(all, />c9<\/text>/, 'pin tag with the hole name');
  assert.match(all, /stroke-dasharray="3 2"/, 'part boxes');
  assert.ok(all.length > plain.length);
  const grid = renderCircuit(circuit, { annotate: 'grid' }).svg;
  assert.match(grid, />7<\/text>/, 'every column is numbered');
  assert.doesNotMatch(plain, />7<\/text>/);
});

test('pin tags of the annotation layer do not overlap each other', () => {
  for (const name of ['led-resistor.json', 'voltage-divider.json', 'parts-showcase.json', 'common-mistakes.json']) {
    for (const view of ['front', 'back']) {
      const { scene } = renderCircuit(example(name), { view, annotate: 'pins' });
      const tags = scene.layers.annotations.filter((op) => op.role === 'pin-tag').map((op) => op.box);
      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          const a = tags[i];
          const b = tags[j];
          const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
          assert.ok(!overlap, `${name} ${view}: tags ${i} and ${j} overlap`);
        }
      }
    }
  }
});

test('no leader lines cross in the examples', () => {
  for (const name of ['led-resistor.json', 'voltage-divider.json', 'parts-showcase.json', 'common-mistakes.json']) {
    for (const view of ['front', 'back']) {
      assert.ok(!codes(inspectCircuit(example(name), { view })).includes('LEADER_CROSSING'), `${name} ${view}`);
    }
  }
});
