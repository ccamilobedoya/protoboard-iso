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
import { expandRecipe, RECIPES } from '../src/recipes/index.js';
import { autoLayout } from '../src/layout.js';
import { dot } from '../src/core/vec.js';
import { symbolOf as symbolOfPart, insideOf as insideOfPart } from '../src/parts/symbols.js';

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
  // A push button's pins say which one each is joined to inside; without a text of its own, a pin says
  // its name (a header's).
  assert.deepEqual(pinList(part(b, 'S1'), 'en').map((p) => p.text), ['1 · joined to 2 inside', '2 · joined to 1 inside', '3 · joined to 4 inside', '4 · joined to 3 inside']);
  const header = part(built('more-parts'), 'J1');
  assert.deepEqual(pinList(header, 'en').map((p) => p.text), header.pinNames);
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
      // An RGB LED's longest lead, the common, beside R; a display's decimal point's edge, pins 1–5.
      else if (p.type === 'rgb-led') assert.match(mark.text, new RegExp(`^Longest lead on the ${sideOf(camera, at('COM'), at('G'))}: the common; R alone beside it$`), `${p.id} ${view}`);
      else if (p.type === 'seven-segment') assert.match(mark.text, /^Decimal point's edge (in front|at the back|on the left|on the right): pins 1–5, pin 1 under e$/, `${p.id} ${view}`);
      // A slide switch's knob moves (a tap slides it): the sentence says what it does, not where it is.
      else if (p.type === 'slide-switch') assert.equal(mark.text, 'COM is the middle pin; the knob joins it to the end pin on its side', `${p.id} ${view}`);
      else if (p.built.mark.kind === 'bands') assert.match(mark.text, new RegExp(`^First colour band on the ${sideOf(camera, at('1'), at('2'))}: read from it; no polarity$`), `${p.id} ${view}`);
      else {
        // A flat face or a tab: which way it faces, and the pins as they are from the left.
        // Each pin as the part prints it (a module's VIN), else by its name.
        const order = [...pins].sort((x, y) => x.x - y.x).map((x) => x.id ?? x.name).join(' ');
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
});

test('pinout: a push button\'s joined pairs by its faces; a switch\'s tabs have no polarity, a latching button\'s rows their common in the middle', () => {
  // Seen from above at an angle a button's pairs cross on screen: the sentence says how to tell them on
  // the part (the legs of a pair on opposite faces), the same in every view.
  const s = part(built('npn-switch'), 'S1');
  for (const view of VIEWS) assert.equal(pinoutOf(s, createCamera({ view }), 'en').mark.text, 'Legs on opposite faces are joined: 1–2 and 3–4; pressed, all four', view);
  const b = built('switches');
  assert.equal(pinoutOf(part(b, 'S1'), createCamera({ view: 'front' }), 'en').mark.text, 'No polarity: it goes in either way round', 'a rocker\'s two tabs are alike');
  assert.equal(pinoutOf(part(b, 'S2'), createCamera({ view: 'back' }), 'es').mark.text, 'La pata del medio de cada fila es su común; NC y NO en los extremos');
  assert.deepEqual(pinList(part(b, 'S1'), 'en').map((p) => p.text), ['1 · a tab', '2 · the other tab']);
  assert.deepEqual(pinList(part(b, 'S2'), 'en').map((p) => p.text), ['C1 · common of row 1', 'NC1 · to C1, released', 'NO1 · to C1, latched']);
});

test('pinout: a bridge\'s bevelled corner is on the side of its + lead', () => {
  const br = part(built('rectifier'), 'BR1');
  for (const view of VIEWS) {
    const camera = createCamera({ view });
    const plus = camera.project(br.holes[br.pinNames.indexOf('+')].pos).x;
    const mid = br.holes.reduce((s, h) => s + camera.project(h.pos).x, 0) / br.holes.length;
    assert.equal(pinoutOf(br, camera, 'en').mark.text, `Bevelled corner on the ${plus < mid ? 'left' : 'right'}: the + lead`, view);
  }
  assert.deepEqual(pinList(br, 'en').map((p) => p.text), ['+ · DC out, to the load', '~1 · AC in', '~2 · AC in, the other end', '− · DC back from the load']);
});

test('pinout: a potentiometer\'s knob or a trimmer\'s printed face, and the pins from the left; a sensor has no polarity', () => {
  const knob = part(built('controls-and-ics'), 'RV1');
  const trimmer = part(built('more-parts'), 'RV1');
  for (const view of VIEWS) {
    const camera = createCamera({ view });
    for (const [p, what] of [[knob, 'Knob'], [trimmer, 'Printed face']]) {
      const { pins, mark } = pinoutOf(p, camera, 'en');
      const order = [...pins].sort((x, y) => x.x - y.x).map((x) => x.name).join(' ');
      const toward = dot(p.built.mark.normal, camera.toViewer) > 0 ? 'toward you' : 'away from you';
      assert.equal(mark.text, `${what} ${toward}: ${order} from the left`, `${p.id} ${view}`);
      // Seen from the knob (or the print), pin 1 is on the left, as the packages say.
      if (toward === 'toward you') assert.equal(order, '1 W 3', `${p.id} ${view}`);
    }
  }
  assert.deepEqual(pinList(knob, 'en').map((p) => p.text), ['1 · one end of the track', 'W · wiper, slides on it', '3 · the other end']);
  for (const id of ['RT1', 'LDR1']) assert.equal(pinoutOf(part(built('more-parts'), id), createCamera({ view: 'front' }), 'es').mark.text, 'Sin polaridad: entra en cualquier sentido', id);
});

test('pinout: a regulator\'s tab or a module\'s printed side; a battery\'s red lead and a buzzer\'s + on the side of their + pin', () => {
  const b = built('battery-regulator');
  const reg = part(b, 'U1');
  assert.deepEqual(pinList(reg, 'en').map((p) => p.text), ['IN · supply, higher V', 'GND · common, 0 V', 'OUT · steady voltage']);
  assert.equal(pinoutOf(reg, createCamera({ view: 'front' }), 'en').mark.text, 'Metal tab at the back: IN GND OUT from the left');
  const more = built('more-parts');
  assert.deepEqual(pinList(part(more, 'U2'), 'en').map((p) => p.text), ['ADJ · OUT is 1.25 V over it', 'OUT · steady voltage', 'IN · supply, higher V'], 'an LM317 by its own pins');
  // An AMS1117 module: its printed side, its pins as printed (VIN), the same row text for both voltages.
  const module = part(built('parts-showcase'), 'U1');
  assert.equal(pinList(module, 'es')[0].text, 'VIN · entrada, más voltaje');
  for (const view of VIEWS) assert.match(pinoutOf(module, createCamera({ view }), 'en').mark.text, view === 'front' ? /^Printed face toward you: VIN OUT GND from the left$/ : /^Printed face away from you: GND OUT VIN from the left$/, view);
  for (const [p, sentence, plus] of [[part(b, 'BT1'), 'Red lead (.*): the \\+; the black one, the −', '+'], [part(more, 'BZ1'), '\\+ printed on top (.*): pin 1, the \\+ lead', '1']]) {
    for (const view of VIEWS) {
      const camera = createCamera({ view });
      const text = pinoutOf(p, camera, 'en').mark.text;
      const side = new RegExp(`^${sentence}$`).exec(text)?.[1];
      const other = p.pinNames.find((n) => n !== plus);
      const at = (n) => p.holes[p.pinNames.indexOf(n)];
      const [x, y] = [at(plus), at(other)].map((h) => camera.project(h.pos).x);
      // The mark is by the + pin: across the screen, the side of that pin (a rail's two rows are seen
      // one behind the other at the back or in front, which the sentence then says).
      if (side === 'on the left' || side === 'on the right') assert.equal(side, x < y ? 'on the left' : 'on the right', `${p.id} ${view}`);
      else assert.ok(side, `${p.id} ${view}: ${text}`);
    }
  }
  assert.deepEqual(pinList(part(b, 'BT1'), 'es').map((p) => p.text), ['+ · cable rojo, a la carga', '− · cable negro, retorno']);
  assert.deepEqual(pinList(part(more, 'BZ1'), 'en').map((p) => p.text), ['+ · under the + on top', '− · the other lead']);
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
  // A push button's four pins, a switch's only the ones its circuit lists (the others stay unwired).
  const button = symbolOf(part(built('npn-switch'), 'S1'));
  assert.deepEqual(button.ids, { 1: '1', 2: '2', 3: '3', 4: '4' });
  assert.equal(button.pins['1'][0], button.pins['2'][0], 'a joined pair on one line');
  assert.deepEqual(Object.keys(symbolOf(part(built('switches'), 'S1')).pins), ['1', '2']);
  assert.deepEqual(symbolOf(part(built('switches'), 'S2')).ids, { C1: 'C1', NC1: 'NC1', NO1: 'NO1' });
  assert.deepEqual(insideOf(part(built('npn-switch'), 'Q1')), { kind: 'bjt', pnp: false });
  assert.equal(insideOf(timer).kind, 'timer');
  assert.equal(insideOf(part(built('npn-switch'), 'D1')).kind, 'led');
  assert.deepEqual(insideOf(part(built('npn-switch'), 'R1')), { kind: 'resistor', ids: ['1', '2'], maxPower: 0.25 });
  assert.deepEqual(insideOf(part(built('npn-switch'), 'S1')), { kind: 'button', ids: ['1', '2', '3', '4'], contact: ['1', '3'], pressed: false });
  assert.deepEqual(insideOf(part(built('switches'), 'S1')), { kind: 'switch', style: 'rocker', ids: ['1', '2'], on: true, onContacts: [['1', '2']], offContacts: [] });
  assert.deepEqual(insideOf(part(built('switches'), 'S2')), { kind: 'switch', style: 'latching', ids: ['C1', 'NC1', 'NO1'], on: false, onContacts: [['C1', 'NO1']], offContacts: [['C1', 'NC1']] });
  assert.deepEqual(insideOf(part(built('half-wave-rectifier'), 'D1')), { kind: 'diode', ids: ['A', 'K'], maxCurrent: 1 });
  assert.equal(insideOf(part(built('parts-showcase'), 'D2')).maxCurrent, 0.3, 'a 1N4148 by its own rating');
  const z = insideOf(part(built('more-parts'), 'D1'));
  assert.deepEqual([z.kind, z.ids, z.vz], ['zener', ['A', 'K'], 5.1]);
  const br = part(built('rectifier'), 'BR1');
  assert.deepEqual(insideOf(br), { kind: 'bridge', ids: ['+', '~1', '~2', '−'], maxCurrent: 3 });
  assert.deepEqual(Object.keys(symbolOf(br).pins).sort(), [...br.pinNames].sort(), 'a terminal for each of the bridge\'s pins');
  // A potentiometer's track and wiper, a thermistor's and a photoresistor's sensing, from the circuit.
  assert.deepEqual(insideOf(part(built('controls-and-ics'), 'RV1')), { kind: 'potentiometer', ids: ['1', 'W', '3'], resistance: 10000, position: 0.3 });
  assert.deepEqual(insideOf(part(built('more-parts'), 'RT1')), { kind: 'thermistor', ids: ['1', '2'], r25: 10000, beta: 3950, temperature: 25 });
  assert.deepEqual(insideOf(part(built('more-parts'), 'LDR1')), { kind: 'ldr', ids: ['1', '2'], light: 100 });
  assert.deepEqual(symbolOf(part(built('more-parts'), 'RV1')).ids, { 1: '1', W: 'W', 3: '3' }, 'a trimmer is a potentiometer to its symbol');
  // A regulator's box with its common (GND, an LM317's ADJ) under it; its limits from its model.
  const reg = part(built('battery-regulator'), 'U1');
  assert.deepEqual(symbolOf(reg).ids, { IN: 'IN', OUT: 'OUT', GND: 'GND' });
  assert.deepEqual(insideOf(reg), { kind: 'regulator', ids: ['IN', 'OUT', 'GND'], adjustable: false, vref: 5, dropout: 2, maxCurrent: 1.5, maxPower: 2 });
  assert.deepEqual(insideOf(part(built('more-parts'), 'U2')).ids, ['IN', 'OUT', 'ADJ']);
  assert.equal(insideOf(part(built('more-parts'), 'U2')).adjustable, true);
  assert.deepEqual(insideOf(part(built('parts-showcase'), 'U1')).ids, ['VIN', 'OUT', 'GND'], 'a module\'s printed names');
  // A battery's cells, one pair of plates each (a 9 V block's six inside it); a buzzer's + and −.
  const bt = part(built('battery-regulator'), 'BT1');
  assert.deepEqual(symbolOf(bt).ids, { '+': '+', '-': '−' });
  assert.deepEqual(insideOf(bt), { kind: 'battery', ids: ['+', '−'], chemistry: 'alkaline', series: 6, resistance: 1.7, maxCurrent: 0.3, rechargeable: false, charge: null });
  assert.equal(symbolOf(part(built('more-parts'), 'BT1')).fills.length, 2, 'two cells, two short plates');
  const bz = part(built('more-parts'), 'BZ1');
  assert.deepEqual(symbolOf(bz).ids, { 1: '+', 2: '−' });
  const buzz = insideOf(bz);
  assert.deepEqual([buzz.kind, buzz.ids, buzz.resistance, Math.round(buzz.maxCurrent * 1000)], ['buzzer', ['+', '−'], 16, 177]);
  // Parts of several LEDs: their chips to a common, its letter by what it is (K, A; a display's COM).
  const rgb = part(built('parts-showcase'), 'D6');
  assert.deepEqual(symbolOf(rgb).ids, { R: 'R', G: 'G', B: 'B', COM: 'K' });
  const inside = insideOf(rgb);
  assert.deepEqual([inside.kind, inside.commonId, inside.chips.map((c) => c.id), inside.maxCurrent], ['rgb', 'K', ['R', 'G', 'B'], 0.02]);
  const ds = part(built('parts-showcase'), 'DS1');
  assert.equal(symbolOf(ds).ids.COM2, 'COM');
  assert.deepEqual(insideOf(ds).chips.map((c) => c.pin), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'DP']);
  assert.deepEqual(pinList(ds, 'en').slice(0, 3).map((p) => p.text), ['segment e · bottom left', 'segment d · bottom', 'common · pin 3']);
  // A kit's slide and tilt switches, its LM35: their contacts and ratings, its range, from their devices.
  const showcase = (id) => part(built('parts-showcase'), id);
  assert.deepEqual(insideOfPart(showcase('S3')), { kind: 'slide', ids: ['1', 'COM', '2'], on: false, onContacts: [['COM', '2']], offContacts: [['COM', '1']], maxCurrent: 0.3, maxVoltage: 30 });
  assert.deepEqual(insideOfPart(showcase('S4')), { kind: 'tilt', ids: ['1', '2'], on: false, onContacts: [], offContacts: [['1', '2']], maxCurrent: 0.025, maxVoltage: 12 });
  assert.deepEqual(insideOfPart(showcase('U4')), { kind: 'lm35', ids: ['+VS', 'VOUT', 'GND'], temperature: 25, range: [0, 100], gain: 0.01, maxCurrent: 0.01 });
});

// A starter kit's switches in the board and its LM35: their pins, marks, symbols and inside views.
test('pinout: a slide switch\'s knob, a tilt switch with no polarity, an LM35\'s flat face', () => {
  const recipe = (name) => buildCircuit(autoLayout(expandRecipe(name).spec).circuit);
  const slide = part(recipe('slide-switch-leds'), 'S1');
  assert.deepEqual(pinList(slide, 'en').map((p) => p.text), ['1 · to COM, knob at 1', 'COM · common, middle', '2 · to COM, knob at 2']);
  assert.equal(pinoutOf(slide, createCamera({ view: 'back' }), 'es').mark.text, 'COM es la pata del medio; la perilla la une a la del extremo de su lado');
  assert.deepEqual(symbolOfPart(slide).ids, { 1: '1', COM: 'COM', 2: '2' });
  const tilt = part(recipe('tilt-alarm'), 'S1');
  assert.equal(pinoutOf(tilt, createCamera({ view: 'front' }), 'es').mark.text, 'Sin polaridad: entra en cualquier sentido');
  const lm35 = part(recipe('lm35-uno'), 'U2');
  assert.deepEqual(pinList(lm35, 'es').map((p) => p.text), ['+VS · alimentación, 4–30 V', 'VOUT · 10 mV por °C', 'GND · tierra, 0 V']);
  assert.equal(pinoutOf(lm35, createCamera({ view: 'front' }), 'en').kind, 'Temperature sensor · TO-92');
  assert.match(pinoutOf(lm35, createCamera({ view: 'front' }), 'en').mark.text, /^Flat face (toward you: \+VS VOUT GND|away from you: GND VOUT \+VS) from the left$/);
});

// The view of a part up close is a requirement for every new part type (docs/en/adding-parts.md, "6. A
// part up close"): the text of each pin, a schematic symbol with a letter for every pin, the package's
// orientation mark when it can go in the wrong way round, and a view of its inside with its legend. Each
// type of the kit is either complete or listed as pending with its reason: a new type must be one or
// the other, so the choice is made, never forgotten.
const COMPLETE = { bjt: 'npn-switch Q1', mosfet: 'mosfet-switch Q1', led: 'npn-switch D1', ic: '555-astable U1', resistor: 'npn-switch R1', capacitor: 'rc-square-wave C1', inductor: 'more-parts L1', diode: 'half-wave-rectifier D1', zener: 'zener-regulator D1', bridge: 'bridge-rectifier BR1', potentiometer: 'potentiometer-led RV1', thermistor: 'more-parts RT1', ldr: 'more-parts LDR1', button: 'button-pullup S1', switch: 'switches S1', regulator: 'regulator-7805 U1', battery: 'battery-regulator BT1', buzzer: 'more-parts BZ1', 'rgb-led': 'uno-rgb-led D1', 'seven-segment': 'uno-seven-segment DS1', 'slide-switch': 'slide-switch-leds S1', 'tilt-switch': 'tilt-alarm S1', 'temperature-sensor': 'lm35-uno U2' };
const PENDING = {
  wire: 'not a part on a pedestal',
  module: 'a development board: its own pin notes, no pedestal view',
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
    // A recipe by its name (laid out as the kit does), else an example.
    const circuit = RECIPES[name] ? autoLayout(expandRecipe(name).spec).circuit : loadCircuit(resolveTarget(`${examples}${name}.json`));
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
