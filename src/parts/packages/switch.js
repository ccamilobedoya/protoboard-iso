// Switches that do not fit the board, lying on the table beside it (in front by default, or
// behind), their contacts pointing at the board and wired to holes: only the pins the circuit
// lists, each with a lead ending in a Dupont male pin pushed into its hole.
//
//   rocker-kcd1    KCD1 rocker (SPST): flange 21 × 15 mm, two 4.8 mm faston tabs gripped by
//                  alligator clips; the rocker leans to the side that is pressed (I or O)
//   latching-7x7   7 × 7 mm latching push button (DPDT): six pins in two rows of three (2 mm
//                  apart, rows about 5 mm apart), a wire soldered to each pin in use under a
//                  heat-shrink sleeve; the plunger stays down while it is on
//
// params: names (the listed pins, in order), colors (pin → wire colour), on, side ('front' |
//         'back'), offset (mm along the board)
//
// Like the battery and the UNO it needs the board (where its edges are), so build() takes it.

import { v3, add, sub, scale, normalize, X, Y, Z } from '../../core/vec.js';
import { box, prism, textDecal } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { wireToHole } from './offboard.js';


// Where the switch lies: `at(d, x, z)` is d mm away from the board edge, x mm along it from the
// switch's centre, at height z (the board's top is 0, the table −H).
function placement(pins, params, board) {
  const { length: L, width: W, height: H } = board.spec.size;
  const mean = pins.length ? pins.reduce((s, p) => s + p.x, 0) / pins.length : L / 2;
  const cx = Math.min(L - 15, Math.max(15, mean)) + Number(params.offset ?? 0);
  const front = params.side !== 'back';
  const edge = front ? 0 : W;
  const away = front ? scale(Y, -1) : Y;
  const at = (d, x, z) => v3(cx + x, edge + away.y * d, z);
  return { at, away, toward: scale(away, -1), table: -H, front };
}

// A box from d0 to d1 away from the board, centred on (x, z), sized sx along the board and sz
// high.
function slab(at, away, d0, d1, x, z, sx, sz, color, outline = true) {
  return box({ center: at(d0, x, z), u: X, w: away, size: [sx, sz, d1 - d0], color, outline });
}

// Each listed pin's lead: what holds it on the contact (`holder`), then the wire to its hole.
function leads(pins, params, contactOf, holder, toward, inside) {
  const out = [];
  const paths = [];
  pins.forEach((hole, i) => {
    const name = params.names[i];
    const c = contactOf(name);
    if (!c) return;
    const color = params.colors?.[name];
    const { primitives, start } = holder(c, color);
    out.push(...primitives);
    const wire = wireToHole({ from: start, dir: normalize(add(scale(toward, 0.5), Z)), hole, color });
    out.push(...wire.primitives);
    const points = [...wire.points].reverse();
    paths.push({ points: [...points, c.tip, inside], body: points.length });
  });
  return { primitives: out, paths };
}

export const rocker = {
  id: 'rocker-kcd1',
  pinCount: null, // the pins the circuit lists

  build({ pins, params, board }) {
    const { at, away, toward, table, front } = placement(pins, params, board);
    const zc = table + 7.5; // the flange (15 mm) stands on the table
    // Along the switch, from the board: clips, tabs, body, flange, rocker.
    const TAB = [20, 28];
    const BODY = [28, 38];
    const FLANGE = [38, 40.5];
    const body = slab(at, away, BODY[0], BODY[1], 0, zc, 18.5, 12.5, MATERIALS.rockerBody);
    const flange = slab(at, away, FLANGE[0], FLANGE[1], 0, zc, 21, 15, MATERIALS.rockerBody);

    // The rocker leans: the pressed end (I when on) sits 2 mm out of the flange, the other 5.5.
    const [hO, hI] = params.on ? [5.5, 2] : [2, 5.5];
    const d0 = FLANGE[1];
    const sgn = away.y; // the prism's v axis is Y; d grows along `away`
    const profile = [[-8, sgn * d0], [8, sgn * d0], [8, sgn * (d0 + hI)], [-8, sgn * (d0 + hO)]];
    const rockerCap = prism({ profile, origin: v3(at(0, 0, 0).x, at(0, 0, 0).y, zc - 5), u: X, w: Z, height: 10, color: MATERIALS.rockerRed, outline: true });
    // I and O on its slanted face, reading left to right from the side it is seen from.
    const end = (x) => at(d0 + (x > 0 ? hI : hO) + 0.01, x, zc);
    const right = normalize(front ? sub(end(8), end(-8)) : sub(end(-8), end(8)));
    const mark = (text, x) => {
      const p = add(end(-8), scale(sub(end(8), end(-8)), (x + 8) / 16));
      rockerCap.decals.push(textDecal({ text, at: p, right, down: scale(Z, -1), size: 3.2, color: MATERIALS.rockerPrint, weight: 700 }));
    };
    mark('I', 5);
    mark('O', -5);

    const tabs = { 1: -3.75, 2: 3.75 };
    const tabBoxes = Object.values(tabs).map((x) => slab(at, away, TAB[0], TAB[1], x, zc, 0.5, 4.8, MATERIALS.tinned));
    // An alligator clip on each tab: its jaws, and the insulating boot in the wire's colour.
    const contactOf = (name) => (tabs[name] == null ? null : { x: tabs[name], tip: at(TAB[0] + 1, tabs[name], zc) });
    const clip = (c, color) => ({
      primitives: [slab(at, away, 17.5, 23, c.x, zc, 2.6, 5.6, MATERIALS.clipJaw), slab(at, away, 10, 17.5, c.x, zc, 4.2, 6.4, color ?? MATERIALS.clipBoot)],
      start: at(10, c.x, zc),
    });
    const inside = at((BODY[0] + BODY[1]) / 2, 0, zc);
    const wired = leads(pins, params, contactOf, clip, toward, inside);
    const parts = [body, flange, rockerCap];
    return { primitives: [...parts, ...tabBoxes, ...wired.primitives], body: parts, anchor: at(BODY[1], 0, table + 15), paths: wired.paths };
  },
};

// Pin names of the 7 × 7 latching button, as seen from the pins with the plunger away: each row
// is a changeover (NC: closed while released, C: common, NO: closed while latched); row 1 below.
export const LATCH_PINS = { NC1: [-2, 1], C1: [0, 1], NO1: [2, 1], NC2: [-2, 2], C2: [0, 2], NO2: [2, 2] };

export const latching = {
  id: 'latching-7x7',
  pinCount: null,

  build({ pins, params, board }) {
    const { at, away, toward, table } = placement(pins, params, board);
    const zc = table + 3.5; // the 7 mm body lies on the table
    const PIN = [20, 23.5];
    const BODY = [23.5, 32.5];
    const housing = slab(at, away, BODY[0], BODY[1], 0, zc, 7, 7, MATERIALS.latchBody);
    // The plunger: out 5 mm while released, 2.5 mm while latched down.
    const reach = params.on ? 2.5 : 5;
    const plunger = slab(at, away, BODY[1], BODY[1] + reach, 0, zc, 3.6, 3.6, MATERIALS.latchCap);
    const rowZ = (row) => zc + (row === 1 ? -2.4 : 2.4);
    const pinBoxes = Object.values(LATCH_PINS).map(([x, row]) => slab(at, away, PIN[0], PIN[1], x, rowZ(row), 0.5, 0.3, MATERIALS.tinned, false));
    const contactOf = (name) => {
      const p = LATCH_PINS[name];
      return p ? { x: p[0], z: rowZ(p[1]), tip: at(PIN[0] + 0.5, p[0], rowZ(p[1])) } : null;
    };
    // A heat-shrink sleeve over the pin's tip, in the wire's colour.
    const sleeve = (c, color) => ({
      primitives: [slab(at, away, 17, 21.5, c.x, c.z, 1.5, 1.5, color ?? MATERIALS.clipBoot)],
      start: at(17, c.x, c.z),
    });
    const inside = at((BODY[0] + BODY[1]) / 2, 0, zc);
    const wired = leads(pins, params, contactOf, sleeve, toward, inside);
    const parts = [housing, plunger];
    return { primitives: [...parts, ...pinBoxes, ...wired.primitives], body: parts, anchor: at(BODY[1], 0, table + 7), paths: wired.paths };
  },
};
