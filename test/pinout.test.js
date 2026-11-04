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
  // A resistor's pins: 1 by the first colour band, where its code is read from.
  assert.deepEqual(pinList(part(b, 'R1'), 'en').map((p) => p.text), ['1 · by the first band', '2 · the other end']);
  // Without a text of its own, a pin says its name (a button's).
  assert.deepEqual(pinList(part(b, 'S1'), 'en').map((p) => p.text), part(b, 'S1').pinNames);
  const { spec } = expandRecipe('555-astable');
  const timer = part(buildCircuit(autoLayout(spec).circuit), 'U1');
  assert.deepEqual(pinList(timer, 'en').map((p) => p.text).slice(0, 3), ['1 GND · ground', '2 TRIG · starts a cycle', '3 OUT · output']);
  assert.equal(pinRole(timer, 4, 'es'), '5 CTRL · fija el umbral');
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
      else if (p.type === 'capacitor' && p.def.electrical.polarised) assert.match(mark.text, new RegExp(`^Stripe on the ${sideOf(camera, at('-'), at('+'))}: the − lead$`), `${p.id} ${view}`);
      // A part with no polarity says so; with a colour code, the first band is by pin 1.
      else if (p.built.mark.kind === 'either') assert.equal(mark.text, 'No polarity: it goes in either way round', `${p.id} ${view}`);
      else if (p.built.mark.kind === 'bands') assert.match(mark.text, new RegExp(`^First colour band on the ${sideOf(camera, at('1'), at('2'))}: read from it; no polarity$`), `${p.id} ${view}`);
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
  assert.match(pinoutOf(part(built('npn-switch'), 'R1'), createCamera({ view: 'front' }), 'en').mark.text, /^First colour band on the (left|right): read from it; no polarity$/, 'a resistor\'s first band');
  assert.equal(pinoutOf(part(built('npn-switch'), 'S1'), createCamera({ view: 'front' }), 'en').mark, null, 'a button has none');
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

// F4: the schematic symbol of each kind and its inside view (src/parts/symbols.js).
test('symbols: each symbol has a terminal for every pin of its part, inside its box', async () => {
  const { symbolOf, insideOf } = await import('../src/parts/symbols.js');
  const b = built('parts-showcase');
  const { spec } = expandRecipe('555-astable');
  const timer = part(buildCircuit(autoLayout(spec).circuit), 'U1');
  let seen = 0;
  for (const p of [...b.parts, timer]) {
    const s = symbolOf(p);
    if (!s) continue;
    seen++;
    assert.deepEqual(Object.keys(s.pins).sort(), [...p.pinNames].sort(), `${p.id} ${p.type}`);
    assert.deepEqual(Object.keys(s.ids).sort(), [...p.pinNames].sort(), `${p.id}: a name on the part for every pin`);
    for (const [x, y] of Object.values(s.pins)) assert.ok(x >= 0 && x <= s.w && y >= 0 && y <= s.h, `${p.id}: a terminal out of its box`);
    assert.ok(s.strokes.length > 0 && s.strokes.every((d) => /^M[\d.\s]/.test(d)), p.id);
  }
  assert.ok(seen >= 8, `${seen} symbols`);
  assert.equal(symbolOf(part(built('npn-switch'), 'S1')), null, 'a button has none yet');
  assert.deepEqual(insideOf(part(built('npn-switch'), 'Q1')), { kind: 'bjt', pnp: false });
  assert.equal(insideOf(timer).kind, 'timer');
  assert.equal(insideOf(part(built('npn-switch'), 'D1')).kind, 'led');
  assert.deepEqual(insideOf(part(built('npn-switch'), 'R1')), { kind: 'resistor', ids: ['1', '2'], maxPower: 0.25 });
  assert.equal(insideOf(part(built('npn-switch'), 'S1')), null);
});

// The view of a part up close is a requirement for every new part type (docs/en/adding-parts.md, "6. A
// part up close"): the text of each pin, a schematic symbol with a letter for every pin, the package's
// orientation mark when it can go in the wrong way round, and a view of its inside with its legend. Each
// type of the kit is either complete or listed as pending with its reason: a new type must be one or
// the other, so the choice is made, never forgotten.
const COMPLETE = { bjt: 'npn-switch Q1', mosfet: 'mosfet-switch Q1', led: 'npn-switch D1', ic: '555-astable U1', resistor: 'npn-switch R1', capacitor: 'rc-square-wave C1', inductor: 'more-parts L1' };
const PENDING = {
  potentiometer: 'no symbol or inside view yet',
  diode: 'no inside view yet',
  zener: 'no inside view yet',
  bridge: 'no symbol or inside view yet',
  regulator: 'no symbol or inside view yet',
  button: 'no symbol or inside view yet',
  wire: 'not a part on a pedestal',
  battery: 'off the board; no symbol or inside view yet',
  module: 'a development board: its own pin notes, no pedestal view',
  switch: 'off the board; no symbol or inside view yet',
  thermistor: 'no symbol or inside view yet',
  ldr: 'no symbol or inside view yet',
  buzzer: 'no symbol or inside view yet',
  header: 'pins only: nothing to show inside',
};

test('a part up close: every part type is complete or pending with a reason, and the complete ones have it all', async () => {
  const { PART_TYPES } = await import('../src/parts/types/index.js');
  const { symbolOf, insideOf } = await import('../src/parts/symbols.js');
  const { t } = await import('../src/i18n/index.js');
  const { readFileSync } = await import('node:fs');
  for (const type of Object.keys(PART_TYPES)) assert.ok(COMPLETE[type] || PENDING[type], `${type}: a new part type comes with its view up close (docs/en/adding-parts.md §6), or is listed in PENDING with its reason`);
  for (const type of Object.keys(COMPLETE)) assert.ok(!PENDING[type], type);
  const both = (key) => ['en', 'es'].every((lang) => t(lang, key) !== key);
  // The page's drawers and legends, read from their modules (the page's code is not imported here).
  const figure = readFileSync(new URL('../src/page/client/figure.js', import.meta.url), 'utf8');
  const legends = readFileSync(new URL('../src/page/client/focus-view.js', import.meta.url), 'utf8');
  for (const [type, where] of Object.entries(COMPLETE)) {
    const [name, id] = where.split(' ');
    const circuit = name === '555-astable' || name === 'mosfet-switch' ? autoLayout(expandRecipe(name).spec).circuit : loadCircuit(resolveTarget(`${examples}${name}.json`));
    const p = part(buildCircuit(circuit), id);
    assert.equal(p.type, type, where);
    for (const n of p.pinNames) assert.ok(both(`pin.role.${p.raw?.part}.${n}`) || both(`pin.role.${type}.${n}`), `${type}: the text of pin ${n} (pin.role.*) in every language`);
    const symbol = symbolOf(p);
    assert.ok(symbol, `${type}: a symbol`);
    for (const n of p.pinNames) assert.ok(symbol.ids?.[n] && symbol.pins[n], `${type}: the symbol's terminal and letter for pin ${n}`);
    assert.ok(p.built?.mark, `${type}: the package's orientation mark`);
    const inside = insideOf(p);
    assert.ok(inside, `${type}: an inside view`);
    assert.match(figure, new RegExp(`\\n  ${inside.kind}\\(g, r, data`), `${type}: its drawer in figure.js INSIDE`);
    const legend = legends.match(new RegExp(`\\n  ${inside.kind}: \\[(.*)\\],`))?.[1];
    assert.ok(legend, `${type}: its legend in focus-view.js LEGENDS`);
    for (const [, key] of legend.matchAll(/\['[a-z]*', '([a-z]+)'\]/g)) assert.ok(both(`page.tour.legend.${inside.kind}.${key}`), `${type}: legend line ${key} in every language`);
  }
});
