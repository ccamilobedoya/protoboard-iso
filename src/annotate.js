// Annotation layers: extra information drawn on top of a scene, chosen one by one.
// Useful to point at exact holes and parts ("the lead in c12"), to check a layout, or to
// teach how the strips connect.
//
//   pins   the hole name at every lead
//   boxes  a dashed box and the id around every part (its exact screen extent)
//   nodes  each connected group in use tinted on the board          (drawn with the board)
//   grid   every column numbered, not only multiples of five        (drawn with the board)
//
// parseAnnotations('pins,nodes') → Set; 'all' or true → every layer.

import { partBoxes } from './inspect.js';
import { NODE_COLORS } from './parts/colors.js';

export const ANNOTATION_LAYERS = ['pins', 'boxes', 'nodes', 'grid'];

export function parseAnnotations(value) {
  if (!value) return new Set();
  if (value === true || value === 'all') return new Set(ANNOTATION_LAYERS);
  const list = Array.isArray(value) ? value : String(value).split(',');
  return new Set(list.map((s) => s.trim()).filter((s) => ANNOTATION_LAYERS.includes(s)));
}

// Colour for every node in use, in order of first appearance.
export function nodeColors(netlist) {
  return new Map(Object.keys(netlist.nodes).map((node, i) => [node, NODE_COLORS[i % NODE_COLORS.length]]));
}

export function annotateScene(scene, result, layers) {
  const out = scene.layers.annotations;
  const ink = '#1f2933';

  if (layers.has('boxes')) {
    for (const [part, box] of partBoxes(scene)) {
      if (!box) continue;
      out.push({ kind: 'rect', x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4, rx: 2, fill: 'none', stroke: '#c2399b', strokeWidth: 0.8, dash: '3 2', part });
      out.push({ kind: 'text', text: part, size: 8, x: box.x - 2, y: box.y - 8, anchor: 'start', fill: '#c2399b', halo: '#ffffff', weight: 700, px: 8, part });
    }
  }

  if (layers.has('pins')) {
    const boxes = partBoxes(scene);
    const colors = nodeColors(result.netlist);
    // Tags must not overlap each other nor sit on a hole ring: try directions around the
    // hole, starting away from the middle of the part, and keep the first free one.
    const taken = [];
    const rings = result.parts.flatMap((part) => part.holes.map((h) => scene.camera.project(h.pos)));
    const boxOf = (text, x, y, anchor) => {
      const w = text.length * 8 * 0.6 + 4;
      const x0 = anchor === 'end' ? x - w : anchor === 'start' ? x : x - w / 2;
      return { x: x0, y: y - 6, width: w, height: 12 };
    };
    const hits = (b) =>
      taken.some((o) => b.x < o.x + o.width + 2 && o.x < b.x + b.width + 2 && b.y < o.y + o.height + 1 && o.y < b.y + b.height + 1) ||
      rings.some((r) => r.x > b.x - 3 && r.x < b.x + b.width + 3 && r.y > b.y - 3 && r.y < b.y + b.height + 3);
    for (const part of result.parts) {
      const box = boxes.get(part.id);
      const centre = box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
      part.holes.forEach((hole) => {
        const s = scene.camera.project(hole.pos);
        const away = centre ? Math.atan2(s.y - centre.y, s.x - centre.x) : -Math.PI / 4;
        const color = layers.has('nodes') ? colors.get(hole.node) : ink;
        let tag = null;
        for (const reach of [13, 20, 28]) {
          for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, Math.PI]) {
            const a = away + turn;
            const tx = s.x + Math.cos(a) * reach;
            const ty = s.y + Math.sin(a) * reach;
            const anchor = Math.cos(a) < -0.3 ? 'end' : Math.cos(a) > 0.3 ? 'start' : 'middle';
            const b = boxOf(hole.id, tx, ty, anchor);
            if (!hits(b)) {
              tag = { tx, ty, anchor, b };
              break;
            }
          }
          if (tag) break;
        }
        if (!tag) {
          const tx = s.x + 13;
          const ty = s.y - 13;
          tag = { tx, ty, anchor: 'start', b: boxOf(hole.id, tx, ty, 'start') };
        }
        taken.push(tag.b);
        out.push({ kind: 'circle', cx: s.x, cy: s.y, r: 2.6, fill: 'none', stroke: color, strokeWidth: 1.2, part: part.id });
        out.push({ kind: 'line', x1: s.x, y1: s.y, x2: tag.tx, y2: tag.ty, stroke: color, strokeWidth: 0.6, part: part.id });
        out.push({ kind: 'text', text: hole.id, size: 8, x: tag.tx, y: tag.ty, anchor: tag.anchor, fill: color, halo: '#ffffff', weight: 700, px: 8, part: part.id, role: 'pin-tag', box: tag.b });
      });
    }
  }
  return scene;
}
