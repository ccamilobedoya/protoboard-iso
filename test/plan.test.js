// The drawing that tells (stage and video, V3): the current layer in plan (pads, lines through
// two-pin parts, stubs on the others, a push button's links, a rail's net name), lit coordinates
// that are the board's own print, result tags off their part, short labels at rest, and inspect
// measuring the clashes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { buildCircuit } from '../src/circuit/build.js';
import { simulate, pageSimulation } from '../src/sim/index.js';
import { conductorPieces, flowStyle } from '../src/sim/paths.js';
import { inspectCircuit, renderCircuit } from '../src/index.js';
import { renderPage } from '../src/page.js';
import { COORD_COLOR } from '../src/render/focus.js';

const dir = new URL('../examples/', import.meta.url);
const example = (name) => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
const pieces = (circuit, style = 'plan', all = true) => conductorPieces(buildCircuit(circuit), simulate(circuit, { analysis: 'dc' }), circuit, { all, style });
const pressed = (c) => ({ ...c, parts: c.parts.map((p) => (p.id === 'S1' ? { ...p, pressed: true } : p)) });

test('plan: a pad at every landing, a line through two pins, a stub of one pitch on three', () => {
  const circuit = example('npn-switch.json');
  const built = buildCircuit(circuit);
  const { wires, dots } = pieces(circuit);
  const pads = wires.filter((w) => w.pad);
  const landings = new Set([...built.parts.flatMap((p) => p.holes.map((h) => h.id))]);
  assert.ok(pads.length >= landings.size, `${pads.length} pads for ${landings.size} landings`);
  assert.ok(pads.every((w) => w.points.every((p) => p.z === 0)));
  // R2: each pin from its hole to the middle of the two, at board level.
  const r2 = built.parts.find((p) => p.id === 'R2');
  const middle = { x: (r2.holes[0].pos.x + r2.holes[1].pos.x) / 2, y: (r2.holes[0].pos.y + r2.holes[1].pos.y) / 2 };
  for (const d of dots.filter((x) => x.ref.part === 'R2')) {
    const end = d.points.at(-1);
    assert.ok(Math.hypot(end.x - middle.x, end.y - middle.y) < 1e-9 && end.z === 0, 'to the middle');
  }
  // Q1 (TO-92, three in a row): three stubs of 2.54 mm, side by side across the row.
  const q1 = dots.filter((x) => x.ref.part === 'Q1').map((d) => ({ x: d.points[1].x - d.points[0].x, y: d.points[1].y - d.points[0].y }));
  assert.equal(q1.length, 3);
  for (const v of q1) {
    assert.ok(Math.abs(Math.hypot(v.x, v.y) - 2.54) < 1e-9, 'one pitch');
    assert.ok(Math.abs(v.x - q1[0].x) < 1e-9 && Math.abs(v.y - q1[0].y) < 1e-9, 'parallel');
  }
  // The real style keeps the packages' paths and has no pads.
  const real = pieces(circuit, 'real');
  assert.equal(real.wires.filter((w) => w.pad).length, 0);
  assert.ok(real.dots.some((d) => d.points.some((p) => p.z > 0)), 'up the leads');
});

test('plan: two jumpers along one row move aside, and inspect sees no lines on one line', () => {
  const circuit = example('npn-switch.json');
  for (const view of ['front', 'back']) {
    const codes = inspectCircuit(circuit, { view, sim: true, flow: true }).problems.map((p) => p.code);
    assert.ok(!codes.includes('FLOW_COLLINEAR'), view);
  }
  const real = inspectCircuit(circuit, { sim: true, flow: true, flowStyle: 'plan' });
  assert.ok(real.problems.every((p) => p.code !== 'FLOW_COLLINEAR'));
});

test('plan: a push button draws its pairs, and its bridge while pressed', () => {
  const circuit = example('npn-switch.json');
  const links = (c, all) => pieces(c, 'plan', all).wires.filter((w) => w.link);
  assert.equal(links(circuit, false).length, 2, 'the two pairs, released');
  assert.equal(links(pressed(circuit), false).length, 3, 'and the bridge, pressed');
  assert.equal(links(circuit, true).filter((w) => w.bridge === 'S1').length, 1, 'a page has it, shown while pressed');
  const html = renderPage(circuit).html;
  assert.match(html, /class="conductor link"[^>]*data-bridge="S1"/);
  assert.match(html, /<body [^>]*data-flow="plan"/);
});

test('plan: parts beside the board keep their real paths; a rail pad carries its net name', () => {
  const circuit = example('battery-regulator.json');
  const { dots } = pieces(circuit);
  assert.ok(dots.filter((d) => d.ref.part === 'BT1').some((d) => d.points.some((p) => p.z !== 0 || p.x < 0)), 'the battery: real');
  const led = example('led-resistor.json');
  const svg = renderCircuit(led, { flow: true }).svg;
  assert.match(svg, /<text [^>]*class="net" data-net="T\+"[^>]*>\+5 V<\/text>/);
  assert.equal(flowStyle({ page: { flow: { style: 'real' } } }), 'real');
  assert.equal(flowStyle({}), 'plan');
  assert.deepEqual(pageSimulation({ ...led, page: { flow: { style: 'real' } } }), { results: true, flow: true });
  assert.match(renderPage({ ...led, page: { flow: { style: 'real' } } }).html, /data-flow="real"/);
});

test('coordinates: the board\'s own print, lit; every column gets one', () => {
  const circuit = example('led-resistor.json');
  const { scene } = renderCircuit(circuit, { focus: ['R1'] });
  const coords = scene.layers.coords;
  assert.ok(coords.length && coords.every((op) => op.kind === 'text' && op.matrix && op.fill === COORD_COLOR), 'flat text, no pills');
  assert.deepEqual([...new Set(coords.filter((op) => op.data.col != null).map((op) => op.text))].sort(), ['9'], 'column 9, which the board does not number');
  const print = scene.layers.board.find((op) => op.kind === 'text' && op.text === '10');
  const lit = renderCircuit({ ...circuit, parts: [{ id: 'X', type: 'wire', pins: ['a10', 'a12'] }] }, { focus: ['X'] }).scene.layers.coords.find((op) => op.text === '10');
  assert.deepEqual(lit.matrix, print.matrix, 'the same place and size as the print');
});

test('inspect: no tag over its part and no coordinate covered, in any example, every part in focus', () => {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const circuit = example(file);
    const sim = pageSimulation(circuit).results;
    for (const part of circuit.parts.slice(0, 6)) {
      const r = inspectCircuit(circuit, { fit: 'parts', sim, flow: sim, focus: [part.id] });
      const bad = r.problems.filter((p) => ['TAG_OVER_PART', 'COORD_COVERED', 'FLOW_COLLINEAR'].includes(p.code));
      assert.deepEqual(bad, [], `${file} ${part.id}`);
    }
  }
});

test('short labels: the page at rest names each part beside it, framed with them', () => {
  const circuit = example('npn-switch.json');
  const { scene } = renderCircuit(circuit, { interactive: true, sim: true, flow: true });
  const short = scene.layers.shortlabels;
  assert.deepEqual(short.map((op) => op.part).sort(), ['D1', 'Q1', 'R1', 'R2', 'S1']);
  for (let i = 0; i < short.length; i++) {
    for (let j = i + 1; j < short.length; j++) {
      const [a, b] = [short[i].box, short[j].box];
      assert.ok(!(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height), `${short[i].part} and ${short[j].part}`);
    }
  }
  // The close-up frame holds the parts and their short labels, not the ladder of boxes.
  const html = renderPage(circuit).html;
  const [, , w, h] = html.match(/data-parts="([^"]+)"/)[1].split(' ').map(Number);
  const ladder = renderCircuit(circuit, { fit: 'parts' }).scene.frame;
  assert.ok(h < ladder.height, `${h} < ${ladder.height}`);
  assert.ok(w > 0);
  assert.deepEqual(renderCircuit(circuit).scene.layers.shortlabels, [], 'only in a page');
});

test('result tags: zooming in, the text and its box get one transform about their common centre', async (t) => {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    return t.skip('jsdom not installed');
  }
  const html = renderPage(example('led-resistor.json')).html;
  const { window } = new JSDOM(html, { runScripts: 'outside-only' });
  for (const svg of window.document.querySelectorAll('svg')) svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 500, right: 800, bottom: 500 });
  window.eval(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  const svg = window.document.querySelector('main > svg:not([hidden])');
  for (let k = 0; k < 4; k++) window.document.querySelector('[data-zoom="in"]').click();
  const tags = [...svg.querySelectorAll('.results > rect + text')];
  assert.ok(tags.length);
  for (const text of tags) {
    const transform = text.getAttribute('transform');
    const [x, y] = [text.getAttribute('x'), text.getAttribute('y')];
    const m = transform.match(/^translate\((\S+) (\S+)\) scale\((\S+)\) translate\((\S+) (\S+)\)$/);
    assert.ok(m, transform);
    const [tx, ty, k, bx, by] = m.slice(1).map(Number);
    assert.deepEqual([tx, ty, bx, by], [Number(x), Number(y), -Number(x), -Number(y)], 'about the text');
    assert.ok(k > 0 && k < 1, 'smaller');
    assert.equal(text.previousElementSibling.getAttribute('transform'), transform, 'its box, the same');
  }
  assert.doesNotMatch(html, /transform-box/, 'no CSS transform on SVG text');
});
