// Short labels (stage and video, V3; docs/en/stage-and-video.md, "The drawing that tells"): the
// page at rest names each part with a short text beside it, its name and value with a halo, no
// box and no leader, so the circuit leads and the first screen is the board, not a ladder of
// boxes. The boxes with leaders (scene.js's callouts) stay for the Labels button and the static
// image. Placed beside the part's box on screen: right, left, below or above, then farther out,
// the first that covers no part and no other short label (wires are thin and do not count), else
// the one that covers least.

import { partBoxes } from '../inspect.js';

export const SHORT_SIZE = 7; // drawing units, as the callouts' text
const GAP = 3;

// The area two boxes share.
const area = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

// texts: [{ part, text }] in the order to place them. → text ops with data-part
export function shortLabelOps(scene, texts, thin = new Set()) {
  const boxes = partBoxes(scene);
  const solid = [...boxes].filter(([id, b]) => b && !thin.has(id)).map(([, b]) => b);
  const taken = [];
  const ops = [];
  for (const { part, text } of texts) {
    const box = boxes.get(part);
    if (!box) continue;
    const width = text.length * SHORT_SIZE * 0.56;
    const height = SHORT_SIZE * 1.2;
    const cy = box.y + box.height / 2;
    const cx = box.x + box.width / 2;
    // Where the text box would sit, and how its text is anchored there: beside, below, above,
    // then a little farther out.
    const spots = [GAP, GAP + 6, GAP + 12, GAP + 20].flatMap((d) => [
      { anchor: 'start', x: box.x + box.width + d, y: cy, rect: { x: box.x + box.width + d, y: cy - height / 2 } },
      { anchor: 'end', x: box.x - d, y: cy, rect: { x: box.x - d - width, y: cy - height / 2 } },
      { anchor: 'middle', x: cx, y: box.y + box.height + d + height / 2, rect: { x: cx - width / 2, y: box.y + box.height + d } },
      { anchor: 'middle', x: cx, y: box.y - d - height / 2, rect: { x: cx - width / 2, y: box.y - d - height } },
    ]).map((s) => ({ ...s, rect: { ...s.rect, width, height } }));
    // The first that covers nothing; else, among those that cover no other label, the one that
    // covers the least of other parts; else the one that covers least of all.
    const parts = (s) => solid.reduce((sum, b) => sum + (b === box ? 0 : area(s.rect, b)), 0);
    const labels = (s) => taken.reduce((sum, t) => sum + area(s.rect, t), 0);
    const least = (list, cost) => list.reduce((best, s) => (cost(s) < cost(best) ? s : best));
    const apart = spots.filter((s) => labels(s) === 0);
    const spot = apart.find((s) => parts(s) === 0) ?? (apart.length ? least(apart, parts) : least(spots, (s) => parts(s) + 4 * labels(s)));
    taken.push(spot.rect);
    ops.push({ kind: 'text', text, size: SHORT_SIZE, x: spot.x, y: spot.y, anchor: spot.anchor, fill: '#1f2933', halo: '#f3f1ea', weight: 600, px: SHORT_SIZE, part, box: spot.rect, cls: 'short' });
  }
  return ops;
}
