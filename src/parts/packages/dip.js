// DIP chip (8, 14, 16… pins) straddling the centre channel. Pin 1 is next to the notch;
// pins count up along one row and back along the other, as seen from above.
//
// Placement: give "pin1" (e.g. "e10") instead of listing every hole. With pin 1 in the
// front row next to the channel (e on the bb830) the chip reads from the front (notch on the
// left); with pin 1 in the back row (f) it is turned round.
//
// params: count (number of pins), marking

import { add, sub, scale, normalize, length, dot, cross, Z } from '../../core/vec.js';
import { box, polygonDecal, circleDecal, textDecal } from '../../geometry/primitives.js';
import { MATERIALS } from '../colors.js';
import { lead, withZ } from './common.js';
import { channelPairs } from '../../board/board.js';

const WIDTH = 6.35;
const HEIGHT = 3.3;
const STANDOFF = 0.7;


// Hole names for every pin, from pin 1, or null when the chip does not fit there.
export function dipHoles(board, pin1, count) {
  const hole = board.find(String(pin1));
  if (!hole || hole.kind !== 'main') return null;
  // Across a channel (a double board has two; never across the joint between its boards).
  const pair = channelPairs(board.spec).find((p) => hole.row === p.front || hole.row === p.back);
  if (!pair) return null;
  const { back, front } = pair;
  const half = count / 2;
  const c = hole.col;
  const [rowA, rowB, step] = hole.row === front ? [front, back, 1] : [back, front, -1];
  const last = c + step * (half - 1);
  if (last < 1 || last > board.spec.columns) return null;
  const names = [];
  for (let i = 0; i < half; i++) names.push(`${rowA}${c + step * i}`);
  for (let i = half - 1; i >= 0; i--) names.push(`${rowB}${c + step * i}`);
  return names;
}

export default {
  id: 'dip',
  pinCount: null, // from params.count

  expandPin1(board, pin1, params) {
    return dipHoles(board, pin1, params.count);
  },

  footprints(board, params) {
    const out = [];
    for (const { back, front } of channelPairs(board.spec)) {
      for (let c = 1; c <= board.spec.columns; c++) {
        for (const row of [front, back]) {
          const holes = dipHoles(board, `${row}${c}`, params.count);
          if (holes) out.push(holes);
        }
      }
    }
    return out;
  },

  validate(pos, part) {
    const n = pos.length;
    const half = n / 2;
    const along = sub(pos[1], pos[0]);
    const across = sub(pos[n - 1], pos[0]);
    let ok = Math.abs(length(along) - 2.54) < 0.05 && Math.abs(length(across) - 7.62) < 0.05 && Math.abs(dot(normalize(along), normalize(across))) < 0.01;
    for (let i = 0; ok && i < half; i++) {
      ok = length(sub(pos[i], add(pos[0], scale(along, i)))) < 0.05 && length(sub(pos[n - 1 - i], add(pos[i], across))) < 0.05;
    }
    return ok ? [] : [{ severity: 'warning', code: 'DIP_SHAPE', params: { part: part.id } }];
  },

  build({ pins, params }) {
    const n = pins.length;
    const half = n / 2;
    const alongDir = normalize(withZ(sub(pins[half - 1], pins[0]), 0));
    const acrossDir = normalize(withZ(sub(pins[n - 1], pins[0]), 0));
    const centre = withZ(scale(pins.reduce((s, p) => add(s, p), { x: 0, y: 0, z: 0 }), 1 / n), STANDOFF);
    const L = half * 2.54 - 0.5;
    const body = box({ center: centre, u: alongDir, size: [L, WIDTH, HEIGHT], color: MATERIALS.chip, outline: true });

    const top = withZ(centre, STANDOFF + HEIGHT);
    // Notch: a half disc at the pin-1 end of the top face.
    const end = add(top, scale(alongDir, -L / 2));
    const notch = [];
    for (let i = 0; i <= 10; i++) {
      const t = -Math.PI / 2 + (Math.PI * i) / 10;
      notch.push(add(end, add(scale(alongDir, Math.cos(t) * 0.9), scale(acrossDir, Math.sin(t) * 0.9))));
    }
    body.decals.push(polygonDecal({ pts: notch, normal: Z, color: MATERIALS.chipMark }));
    const dot1 = add(add(top, scale(alongDir, -L / 2 + 1.5)), scale(acrossDir, -WIDTH / 2 + 1.1));
    body.decals.push(circleDecal({ center: dot1, u: alongDir, v: cross(Z, alongDir), radius: 0.4, color: MATERIALS.chipMark }));
    if (params.marking) {
      body.decals.push(textDecal({ text: params.marking, at: top, right: alongDir, down: scale(acrossDir, -1), size: Math.min(1.5, (L - 2) / (params.marking.length * 0.6)), color: MATERIALS.print, weight: 700 }));
    }

    const leads = pins.flatMap((p) => {
      const rel = sub(withZ(p, 0), withZ(centre, 0));
      const a = dot(rel, acrossDir);
      const edge = add(withZ(p, 1.4), scale(acrossDir, Math.sign(a) * (WIDTH / 2) - a));
      return lead([withZ(p, 0), withZ(p, 1.4), edge], { radius: 0.25, color: MATERIALS.tinned });
    });
    // Labels point at the back edge of the top face, clear of the printed marking.
    return { primitives: [body, ...leads], body: [body], anchor: add(top, scale(acrossDir, WIDTH / 2 - 0.5)) };
  },
};
