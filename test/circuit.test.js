import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { renderCircuit, checkCircuit, formatIssue } from '../src/index.js';

const example = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));
const codes = (issues) => issues.map((i) => i.code);

test('the LED example is clean and connects R1 to the LED anode', () => {
  const { issues, netlist } = checkCircuit(example('led-resistor.json'));
  assert.deepEqual(issues, []);
  const node = netlist.nodes['9:f-j'];
  assert.deepEqual(node.map((m) => `${m.part}.${m.pin}`).sort(), ['D1.anode', 'R1.2']);
  assert.ok(netlist.nodes['T+'].some((m) => m.part === 'R1'));
});

test('the mistakes example reports each mistake', () => {
  const { issues } = checkCircuit(example('common-mistakes.json'));
  const found = codes(issues);
  assert.ok(found.includes('PINS_SAME_NODE'));
  assert.ok(found.includes('SPAN_TOO_SHORT'));
  assert.ok(found.includes('HOLE_OCCUPIED'));
});

test('three-lead packages must sit in a row', () => {
  const { issues } = checkCircuit({ parts: [{ id: 'Q1', type: 'mosfet', part: 'IRLZ44N', pins: ['h10', 'h11', 'h13'] }] });
  assert.ok(codes(issues).includes('NOT_INLINE'));
});

test('bad input gives readable errors instead of crashing', () => {
  const { issues } = checkCircuit({
    parts: [
      { id: 'X1', type: 'flux-capacitor', pins: ['j1', 'j2'] },
      { id: 'R1', type: 'resistor', value: 'lots', pins: ['j1', 'j5'] },
      { id: 'R2', type: 'resistor', value: '1k', pins: ['j1', 'z99'] },
      { id: 'D1', type: 'led', pins: { anode: 'j10', gate: 'j11' } },
    ],
  });
  assert.deepEqual(codes(issues).slice(0, 5), ['UNKNOWN_TYPE', 'BAD_VALUE', 'UNKNOWN_HOLE', 'UNKNOWN_PIN', 'MISSING_PIN']);
  for (const issue of issues) {
    assert.doesNotMatch(formatIssue(issue, 'es'), /\{\w+\}/, 'every placeholder is filled');
  }
});

test('overlapping bodies are reported', () => {
  const { issues } = checkCircuit({
    parts: [
      { id: 'C1', type: 'capacitor', value: '1000u', voltage: 16, pins: ['h10', 'h12'] },
      { id: 'C2', type: 'capacitor', value: '1000u', voltage: 16, pins: ['h13', 'h15'] },
    ],
  });
  assert.ok(codes(issues).includes('COLLISION'));
});

test('a lead or a wire through another part is reported; one passing by is not', () => {
  // The resistor's lead from d25 runs over e25, where the header stands.
  const lead = checkCircuit({
    parts: [
      { id: 'U2', type: 'header', count: 3, pin1: 'e24' },
      { id: 'R2', type: 'resistor', value: '470', pins: ['d25', 'h22'] },
    ],
  }).issues;
  assert.deepEqual(lead.filter((i) => i.code === 'LEAD_THROUGH_PART').map((i) => i.params), [{ part: 'R2', other: 'U2' }]);
  // A jumper from the far side of a tall regulator to the rail behind it goes through it.
  const regulator = { id: 'U1', type: 'regulator', part: '7805', pins: ['c14', 'c15', 'c16'] };
  const through = checkCircuit({ parts: [regulator, { id: 'W1', type: 'wire', pins: ['e14', 'B+13'] }] }).issues;
  assert.ok(codes(through).includes('WIRE_THROUGH_PART'));
  const around = checkCircuit({ parts: [regulator, { id: 'W1', type: 'wire', pins: ['a14', 'B+13'] }] }).issues;
  assert.ok(!codes(around).includes('WIRE_THROUGH_PART'));
  // A resistor lying over a flat jumper is fine.
  const over = checkCircuit({
    parts: [
      { id: 'R1', type: 'resistor', value: '1k', pins: ['c10', 'c16'] },
      { id: 'W1', type: 'wire', style: 'flat', pins: ['b12', 'd12'] },
    ],
  }).issues;
  assert.ok(!codes(over).some((c) => c.endsWith('_THROUGH_PART')), JSON.stringify(over));
});

test('a layout clearance reports parts that are too close, without it nothing', () => {
  const parts = [
    { id: 'D1', type: 'led', pins: ['h10', 'h11'] },
    { id: 'D2', type: 'led', pins: ['h13', 'h14'] },
  ];
  assert.ok(!codes(checkCircuit({ parts }).issues).includes('TOO_CLOSE'));
  assert.ok(codes(checkCircuit({ clearance: 3, parts }).issues).includes('TOO_CLOSE'));
});

test('every example renders from both sides into a self-contained SVG', () => {
  const dir = new URL('../examples/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    for (const view of ['front', 'back']) {
      const { svg } = renderCircuit(example(file), { view, lang: 'es' });
      assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="\d+" height="\d+"/);
      assert.doesNotMatch(svg, /NaN|undefined|Infinity/, `${file} ${view}`);
      assert.doesNotMatch(renderCircuit(example(file), { view, annotate: 'all' }).svg, /NaN|undefined|Infinity/, `${file} ${view} annotated`);
      assert.doesNotMatch(svg, /var\(--/, 'no CSS variables');
    }
  }
});

test('labels sit above every part', () => {
  const { svg } = renderCircuit(example('parts-showcase.json'), { fit: 'parts' });
  const partsSvg = svg.slice(svg.indexOf('<g class="parts">'), svg.indexOf('<g class="labels">'));
  const labelsSvg = svg.slice(svg.indexOf('<g class="labels">'));
  const labelBottoms = [...labelsSvg.matchAll(/<rect x="[-\d.]+" y="([-\d.]+)" width="[-\d.]+" height="([-\d.]+)"/g)].map((m) => Number(m[1]) + Number(m[2]));
  const partYs = [...partsSvg.matchAll(/points="([^"]+)"/g)].flatMap((m) => m[1].split(' ').map((p) => Number(p.split(',')[1])));
  assert.ok(labelBottoms.length > 5);
  assert.ok(Math.max(...labelBottoms) < Math.min(...partYs), 'the lowest label box ends above the highest point of any part');
});

test('labels follow the language', () => {
  const circuit = example('voltage-divider.json');
  assert.match(renderCircuit(circuit, { lang: 'es' }).svg, /R1 · 10 kΩ/);
  const led = example('led-resistor.json');
  assert.match(renderCircuit(led, { lang: 'es' }).svg, /D1 · rojo/);
  assert.match(renderCircuit(led, { lang: 'en' }).svg, /D1 · red/);
});
