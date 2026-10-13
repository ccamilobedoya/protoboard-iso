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
    for (const part of result.parts) {
      const box = boxes.get(part.id);
      const centre = box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
      part.holes.forEach((hole) => {
        const s = scene.camera.project(hole.pos);
        // Push the tag away from the middle of the part so the tags of one part spread out.
        let dx = centre ? s.x - centre.x : 1;
        let dy = centre ? s.y - centre.y : -1;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        const tx = s.x + dx * 12;
        const ty = s.y + dy * 12 + 4;
        const color = layers.has('nodes') ? colors.get(hole.node) : ink;
        out.push({ kind: 'circle', cx: s.x, cy: s.y, r: 2.6, fill: 'none', stroke: color, strokeWidth: 1.2, part: part.id });
        out.push({ kind: 'line', x1: s.x, y1: s.y, x2: tx, y2: ty, stroke: color, strokeWidth: 0.6, part: part.id });
        out.push({ kind: 'text', text: hole.id, size: 8, x: tx, y: ty, anchor: dx < -0.2 ? 'end' : dx > 0.2 ? 'start' : 'middle', fill: color, halo: '#ffffff', weight: 700, px: 8, part: part.id });
      });
    }
  }
  return scene;
}
