// A part's pinout (a video about one part, F2; src/pinout.js): the pins a step can name, the row of
// text of each, and the sentence of the package's mark, which must agree with the drawing in each
// view (orientation is data, never written by hand: F0 found a mock-up that said "left" for a notch
// on the right).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadCircuit, resolveTarget } from '../src/node/workspace.js';
import { buildCircuit } from '../src/circuit/build.js';
import { createCamera } from '../src/core/camera.js';
import { pinIndex, pinRole, pinList, pinoutOf } from '../src/pinout.js';
import { expandRecipe } from '../src/recipes/index.js';
import { autoLayout } from '../src/layout.js';

const examples = fileURLToPath(new URL('../examples/', import.meta.url));
const built = (name) => buildCircuit(loadCircuit(resolveTarget(`${examples}${name}.json`)));
const part = (b, id) => b.parts.find((p) => p.id === id);
const VIEWS = ['front', 'back'];

test('pinout: a step names a pin by its name, an alias, or a chip\'s number', () => {
  const q = part(built('npn-switch'), 'Q1');
  assert.equal(pinIndex(q, 'B'), 1);
  assert.equal(pinIndex(q, 'base'), 1);
  assert.equal(pinIndex(q, 'collector'), 2);
  assert.equal(pinIndex(q, '2'), -1, 'a transistor\'s pins have no numbers');
  assert.equal(pinIndex(q, 'X'), -1);
  const d = part(built('npn-switch'), 'D1');
  assert.equal(pinIndex(d, 'K'), 1, 'an LED\'s cathode by its letter');
  const u = part(built('parts-showcase'), 'U1');
  if (u?.def.package === 'dip') {
    assert.equal(pinIndex(u, '1'), 0);
    assert.equal(pinIndex(u, String(u.pinNames.length)), u.pinNames.length - 1);
    assert.equal(pinIndex(u, String(u.pinNames.length + 1)), -1);
  }
});

test('pinout: each pin\'s row says what it does, in the page\'s language; a chip\'s with its number', () => {
  const b = built('npn-switch');
  assert.deepEqual(pinList(part(b, 'Q1'), 'en').map((p) => [p.ref, p.text]), [['Q1.E', 'emitter · common to both'], ['Q1.B', 'base · the small current'], ['Q1.C', 'collector · the load']]);
  assert.equal(pinRole(part(b, 'Q1'), 2, 'es'), 'colector · la carga');
  assert.equal(pinRole(part(b, 'D1'), 0, 'es'), 'ánodo · el lado +, entra');
  // Without a text of its own, a pin says its name (a resistor's 1 and 2).
  assert.deepEqual(pinList(part(b, 'R1'), 'en').map((p) => p.text), ['1', '2']);
  const { spec } = expandRecipe('555-astable');
  const timer = part(buildCircuit(autoLayout(spec).circuit), 'U1');
  assert.deepEqual(pinList(timer, 'en').map((p) => p.text).slice(0, 3), ['1 GND · ground', '2 TRIG · starts a cycle', '3 OUT · output']);
  assert.equal(pinRole(timer, 4, 'es'), '5 CTRL · nivel del umbral');
});

// The side a pin is on screen against another, as the mark's sentence says it.
const sideOf = (camera, a, b) => (camera.project(a.pos).x < camera.project(b.pos).x ? 'left' : 'right');

test('pinout: the mark\'s sentence agrees with the drawing in both views', () => {
  const b = built('parts-showcase');
  let seen = 0;
  for (const p of b.parts.filter((x) => x.built?.mark)) {
    for (const view of VIEWS) {
      const camera = createCamera({ view });
      const { kind, pins, mark } = pinoutOf(p, camera, 'en');
      assert.ok(kind.length > 0 && pins.length === p.holes.length, p.id);
      const at = (name) => p.holes[p.pinNames.indexOf(name)];
      if (p.type === 'diode') assert.match(mark.text, new RegExp(`^Stripe on the ${sideOf(camera, at('K'), at('A'))}: the cathode$`), `${p.id} ${view}`);
      else if (p.type === 'led') assert.match(mark.text, new RegExp(`^Flat edge on the ${sideOf(camera, at('cathode'), at('anode'))}: the cathode$`), `${p.id} ${view}`);
      else if (p.type === 'capacitor') assert.match(mark.text, new RegExp(`^Stripe on the ${sideOf(camera, at('-'), at('+'))}: the − lead$`), `${p.id} ${view}`);
      else {
        // A flat face or a tab: which way it faces, and the pins as they are from the left.
        const order = [...pins].sort((x, y) => x.x - y.x).map((x) => x.name).join(' ');
        assert.ok(mark.text.endsWith(`: ${order} from the left`), `${p.id} ${view}: ${mark.text}`);
      }
      seen++;
    }
  }
  assert.ok(seen >= 8, `${seen} marks`);
  // A TO-92 turned round: the flat face away, the pins read the other way.
  const q = part(built('npn-switch'), 'Q1');
  assert.equal(pinoutOf(q, createCamera({ view: 'front' }), 'en').mark.text, 'Flat face toward you: E B C from the left');
  assert.equal(pinoutOf(q, createCamera({ view: 'back' }), 'es').mark.text, 'Cara plana hacia atrás: C B E desde la izquierda');
  assert.equal(pinoutOf(part(built('npn-switch'), 'R1'), createCamera({ view: 'front' }), 'en').mark, null, 'a resistor has none');
});

test('pinout: a chip\'s notch is on the side of its pin 1', () => {
  const { spec } = expandRecipe('555-astable');
  const timer = part(buildCircuit(autoLayout(spec).circuit), 'U1');
  for (const view of VIEWS) {
    const camera = createCamera({ view });
    const one = camera.project(timer.holes[0].pos).x;
    const mid = timer.holes.reduce((s, h) => s + camera.project(h.pos).x, 0) / timer.holes.length;
    const side = one < mid ? 'left' : 'right';
    assert.equal(pinoutOf(timer, camera, 'en').mark.text, `Notch on the ${side}: pin 1 beside it`, view);
    assert.equal(pinoutOf(timer, camera, 'en').kind, 'Integrated circuit · DIP-8');
  }
});
