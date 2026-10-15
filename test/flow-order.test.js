// Painting order of the conductor view (src/sim/paths.js, flowOps): strips first (they lie inside
// the board), then each pin of each part from the farthest to the nearest, in every view; each
// pin's dots right above its own conductors.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCircuit, checkCircuit } from '../src/index.js';
import { createCamera, VIEWS } from '../src/core/camera.js';
import { paintOrder } from '../src/sim/paths.js';

// A jumper (W3) arches over a resistor (R1) lying along row c.
const crossing = {
  supplies: [{ id: 'V1', voltage: 5 }],
  parts: [
    { id: 'W1', type: 'wire', color: 'red', pins: ['T+9', 'a9'] },
    { id: 'R1', type: 'resistor', value: '220', pins: ['c9', 'c19'] },
    { id: 'D1', type: 'led', color: 'red', pins: { anode: 'e19', cathode: 'e20' } },
    { id: 'W2', type: 'wire', color: 'black', pins: ['a20', 'T-16'] },
    { id: 'W3', type: 'wire', color: 'blue', pins: ['b14', 'h14'] },
  ],
};

// The flow layer's elements, in file (painting) order.
function flowElements(view) {
  const { svg } = renderCircuit(crossing, { view, flow: true, interactive: true });
  const layer = svg.match(/<g class="flow">([\s\S]*?)<\/g>/)[1];
  return [...layer.matchAll(/<path [^>]*?class="(conductor|dots)"[^>]*?data-(flow|node)="([^"]+)"/g)].map((m) => ({ cls: m[1], strip: m[2] === 'node', id: m[3] }));
}

test('flow order: strips under every lead and wire, in both views', () => {
  assert.deepEqual(checkCircuit(crossing).issues.filter((i) => i.severity === 'error'), []);
  for (const view of ['front', 'back']) {
    const els = flowElements(view);
    const lastStrip = els.findLastIndex((e) => e.strip);
    const firstPart = els.findIndex((e) => !e.strip);
    assert.ok(lastStrip < firstPart, `${view}: every strip before the first part piece`);
  }
});

test('flow order: each pin draws its conductors and then its dots, nothing of another pin between', () => {
  const els = flowElements('front').filter((e) => !e.strip);
  // Runs of the same part: a part's pieces may be split by another part's pin (depth), but a
  // dots piece always follows a conductor of the same part.
  els.forEach((e, k) => {
    if (e.cls === 'dots') assert.equal(els[k - 1]?.id, e.id, `dots of ${e.id} right after its conductor`);
  });
});

// A long lead (a resistor lying 2 mm up) and a jumper arching 8 mm over it near one end. Sorted by
// their middles, the long lead comes out nearer in some views (its middle reaches towards the
// camera) and was painted over the jumper; at the crossing the jumper is always nearer.
test('paintOrder: where two lines cross on screen, the nearer one there is painted last', () => {
  const jumper = { points: [{ x: 20, y: 0, z: 0 }, { x: 20, y: 2, z: 6 }, { x: 20, y: 5, z: 8 }, { x: 20, y: 8, z: 6 }, { x: 20, y: 10, z: 0 }], group: 'J' };
  let middleWouldFail = 0;
  for (const view of Object.keys(VIEWS)) {
    const camera = createCamera({ view });
    for (const way of [1, -1]) {
      const lead = { points: [{ x: 20 - 15 * way, y: 5, z: 2 }, { x: 20 + 80 * way, y: 5, z: 2 }], group: 'R' };
      const order = paintOrder(camera, [jumper, lead], 3.2);
      assert.deepEqual(order, [1, 0], `${view}, lead towards ${way > 0 ? '+x' : '−x'}: the jumper last`);
      const mid = (l) => camera.project({ x: l.points.reduce((s, p) => s + p.x, 0) / l.points.length, y: 5, z: 2 }).depth;
      if (mid(lead) < camera.project({ x: 20, y: 5, z: 5 }).depth) middleWouldFail++;
    }
  }
  assert.ok(middleWouldFail > 0, 'the case where sorting by the middle goes wrong is covered');
  // Lines that never meet on screen keep the farther-middle-first order.
  const camera = createCamera({ view: 'front' });
  const near = { points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] };
  const far = { points: [{ x: 0, y: 60, z: 0 }, { x: 1, y: 60, z: 0 }] };
  const order = paintOrder(camera, [near, far], 3.2);
  const depth = (l) => camera.project(l.points[0]).depth;
  assert.deepEqual(order, depth(near) > depth(far) ? [0, 1] : [1, 0]);
});
