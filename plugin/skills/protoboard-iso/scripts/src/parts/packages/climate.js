// Climate sensor modules (docs/en/library-sensors.md), at their real sizes:
//
// - dht-module: the usual DHT11 module standing in the breadboard on its three straight pins through a
//   black header strip: a blue board 14 × 24 mm, the DHT11 itself on its front face, a blue plastic
//   box of 12 × 15.5 × 5.5 mm (the sensor's datasheet) with its grid of slots, the 10 kΩ pull-up (a
//   small chip resistor) under it and the pin names S, +, − printed over the header. Its front looks
//   towards the front view when the pins go to increasing columns, as the laser module's.
// - bme-board: the usual BME280 / BMP280 board lying flat on its four-pin header (VCC, GND, SCL, SDA):
//   a purple board 11.5 × 15 mm whose pins are along one short edge, the board reaching back from them;
//   the chip is the small metal can (2.5 × 2.5 × 0.93 mm, Bosch's LGA) in the middle, two chip
//   resistors (the pull-ups) and, on the regulated board, the 3.3 V regulator (SOT-23). The pin names
//   are printed by the pins.
//
// params: part (printed on the board). mark (src/pinout.js): the printed face, `face`.

import { add, scale, cross, Z } from '../../core/vec.js';
import { box, rectDecal, textDecal } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { lead, directionBetween, withZ } from './common.js';

const P = 2.54;
const LIFT = 3.5; // the board's bottom edge (standing) or face (lying) over the breadboard

const onFace = (b, board, side) => Object.assign(b, { on: board, side });

const DHT = { w: 14, h: 24, t: 1.6, sensor: { w: 12, h: 15.5, d: 5.5 } };

export const dhtModule = {
  id: 'dht-module',
  pinCount: 3,
  inline: { count: 3, pitch: 1 },

  build({ pins, params }) {
    const dir = directionBetween(pins[0], pins[2]);
    const out = scale(cross(Z, dir), -1); // towards the front face
    const row = withZ(pins[1], 0);
    const at = (d, z, s = 0) => add(add(withZ(row, z), scale(out, d)), scale(dir, s));
    const front = DHT.t / 2;
    const board = box({ center: at(0, LIFT), u: dir, w: Z, size: [DHT.w, DHT.t, DHT.h], color: MATERIALS.pcbBlue, outline: true });
    // The sensor: its blue box on the face, the top of the board, with its grid of slots.
    const S = DHT.sensor;
    const base = LIFT + DHT.h - S.h - 0.8;
    const sensor = onFace(box({ center: at(front + S.d / 2, base, 0), u: dir, w: Z, size: [S.w, S.d, S.h], color: MATERIALS.dhtBlue, outline: true }), board, out);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 4; c++) sensor.decals.push(rectDecal({ center: at(front + S.d + 0.01, base + 2.4 + r * 2.6, (c - 1.5) * 2.6), u: dir, v: Z, width: 1.5, height: 1.6, color: MATERIALS.dhtSlot }));
    }
    // The pull-up resistor, between the sensor and the pin names.
    const resistor = onFace(box({ center: at(front + 0.35, LIFT + 4.3, 3), u: dir, w: Z, size: [2, 0.7, 1.2], color: MATERIALS.chip, outline: true }), board, out);
    ['S', '+', '−'].forEach((name, i) => board.decals.push(textDecal({ text: name, at: at(front + 0.01, LIFT + 1.6, (i - 1) * P), right: dir, down: scale(Z, -1), size: 1.1, color: MATERIALS.pcbPrint, weight: 700 })));
    board.decals.push(textDecal({ text: params?.part ?? 'DHT11', at: at(front + 0.01, LIFT + 4.4, -2.6), right: dir, down: scale(Z, -1), size: 0.9, color: MATERIALS.pcbPrint, weight: 700 }));

    const strip = box({ center: at(0, 0.4), u: dir, w: Z, size: [3 * P, 2.5, 2.0], color: MATERIALS.headerBlack, outline: true });
    const leads = pins.flatMap((p) => lead([withZ(p, 0), withZ(p, LIFT + 1)], { radius: 0.32, color: MATERIALS.tinned }));
    const paths = pins.map((p) => ({ points: [withZ(p, 0), withZ(p, LIFT), withZ(p, LIFT + 3)], body: 1 }));
    // How to tell its pins apart (src/pinout.js): the printed face, the sensor's.
    const mark = { kind: 'face', at: at(front, LIFT + 1.6), normal: out };
    return { primitives: [board, strip, sensor, resistor, ...leads], body: [board, strip, sensor], anchor: at(front + S.d, LIFT + DHT.h), paths, mark };
  },
};

const BME = { w: 11.5, d: 15, t: 1.2, edge: 1.4, can: { w: 2.5, d: 2.5, h: 0.93 } };
const TILES = 3; // the board in tiles from the pins back: each sorts against what is at its own place

export const bmeBoard = {
  id: 'bme-board',
  pinCount: 4,
  inline: { count: 4, pitch: 1 },

  build({ pins, params }) {
    const dir = directionBetween(pins[0], pins[3]);
    const out = scale(cross(Z, dir), -1); // towards the front view: the edge with the pins
    const back = scale(out, -1);
    const middle = scale(add(withZ(pins[1], 0), withZ(pins[2], 0)), 0.5);
    // d: from the row of pins towards the front (negative: back over the board), z up, s along the row.
    const at = (d, z, s = 0) => add(add(withZ(middle, z), scale(out, d)), scale(dir, s));
    const top = LIFT + BME.t;
    const reach = BME.d - BME.edge; // how far the board goes back from the pins
    const tiles = [];
    for (let k = 0; k < TILES; k++) {
      const from = BME.edge - (k * BME.d) / TILES;
      tiles.push(box({ center: at(from - BME.d / TILES / 2, LIFT), u: dir, w: Z, size: [BME.w, BME.d / TILES, BME.t], color: MATERIALS.pcbPurple, outline: true }));
    }
    const tileAt = (d) => tiles[Math.min(TILES - 1, Math.max(0, Math.floor((BME.edge - d) / (BME.d / TILES))))];
    const onTop = (b) => Object.assign(b, { on: tiles, side: Z });
    const print = (text, d, s, size) => tileAt(d).decals.push(textDecal({ text, at: at(d, top + 0.01, s), right: dir, down: out, size, color: MATERIALS.pcbPrint, weight: 700 }));
    // The pads of the four pins, their names behind them, the part's name across the middle.
    const names = ['VCC', 'GND', 'SCL', 'SDA'];
    names.forEach((name, i) => {
      tileAt(0).decals.push(rectDecal({ center: at(0, top + 0.01, (i - 1.5) * P), u: dir, v: back, width: 1.6, height: 1.6, color: MATERIALS.tinned }));
      print(name, -1.9, (i - 1.5) * P, 0.55);
    });
    print(params?.part ?? 'BME280', -reach + 2.2, 0, 0.9);
    // The chip: a metal can in the middle; the pull-ups beside it; the regulated board's regulator.
    const can = onTop(box({ center: at(-reach / 2 - 0.5, top, 0), u: dir, w: Z, size: [BME.can.w, BME.can.d, BME.can.h], color: MATERIALS.aluminium, outline: true }));
    const parts = [can];
    for (const s of [-3.2, 3.2]) parts.push(onTop(box({ center: at(-reach / 2 - 0.5, top, s), u: dir, w: Z, size: [1, 0.5, 0.45], color: MATERIALS.chip, outline: true })));
    if (params?.part === 'BME280-5V') parts.push(onTop(box({ center: at(-reach + 4.6, top, 3.2), u: dir, w: Z, size: [2.9, 1.6, 1.1], color: MATERIALS.chip, outline: true })));

    // The header: its black strip under the board's edge, the pins through it, their tips over the board.
    const strip = box({ center: at(0, 0.4), u: dir, w: Z, size: [4 * P, 2.5, LIFT - 0.4], color: MATERIALS.headerBlack, outline: true });
    const leads = pins.flatMap((p) => lead([withZ(p, 0), withZ(p, top + 0.6)], { radius: 0.32, color: MATERIALS.tinned }));
    const paths = pins.map((p) => ({ points: [withZ(p, 0), withZ(p, LIFT), withZ(p, top)], body: 1 }));
    // How to tell its pins apart (src/pinout.js): the printed face, up.
    const mark = { kind: 'face', at: at(0, top), normal: Z };
    return { primitives: [...tiles, strip, ...parts, ...leads], body: [...tiles, strip], anchor: at(-reach / 2, top + 1), paths, mark };
  },
};
