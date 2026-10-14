// Simulation results drawn on the board: the voltage of every group in use (blue tags) and
// the current through every part (orange tags), plus a "MODEL" badge. They go to their own
// layer, `results`, so a page can show or hide them.

import { partBoxes } from '../inspect.js';
import { formatValue } from '../core/units.js';
import { t, decimalSeparator } from '../i18n/index.js';

const VOLTAGE = '#1f5fbf';
const CURRENT = '#b5452a';
const SIZE = 8;

function partCurrent(reading) {
  if (!reading || reading.unsupported || reading.floating) return null;
  if (reading.kind === 'M') return { label: 'Id', value: reading.currents.D };
  if (reading.kind === 'Q') return { label: 'Ic', value: reading.currents.C };
  if (reading.kind === 'POT') return { label: 'I', value: Math.max(Math.abs(reading.currents['1']), Math.abs(reading.currents['3'])) };
  if (typeof reading.current === 'number') return { label: '', value: Math.abs(reading.current) };
  return null;
}

// Below a millivolt the value is wire resistance, not something to read: show 0 V.
const volts = (v, decimal) => formatValue(Math.abs(v) < 1e-3 ? 0 : v, 'V', { decimal });

const overlaps = (a, b, gap = 1) => a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;

export function resultsOverlay(scene, built, sim, lang = 'en') {
  const decimal = decimalSeparator(lang);
  const ops = [];
  const boxes = partBoxes(scene);
  // Tags never cover a part (wires excepted: they are thin) nor another tag, if there is room.
  const obstacles = built.parts.filter((p) => p.def.electrical?.kind !== 'W').map((p) => boxes.get(p.id)).filter(Boolean);
  const taken = [];
  const tag = (text, candidates, color, part) => {
    const width = text.length * SIZE * 0.6 + 6;
    const height = SIZE + 5;
    const place = (x, y) => ({ x: x - width / 2, y: y - height / 2, width, height });
    const free = candidates.map(([x, y]) => place(x, y)).find((b) => !taken.some((o) => overlaps(b, o)) && !obstacles.some((o) => overlaps(b, o, 0)));
    const box = free ?? candidates.map(([x, y]) => place(x, y)).find((b) => !taken.some((o) => overlaps(b, o))) ?? place(...candidates[0]);
    taken.push(box);
    ops.push({ kind: 'rect', ...box, rx: 3, fill: '#ffffff', fillOpacity: 0.92, stroke: color, strokeWidth: 0.7, part });
    ops.push({ kind: 'text', text, size: SIZE, x: box.x + width / 2, y: box.y + height / 2, anchor: 'middle', fill: color, weight: 700, px: SIZE, part });
  };
  const around = (x, y, steps) => steps.flatMap((r) => [[0, r], [r * 1.6, r / 2], [-r * 1.6, r / 2], [r * 1.6, -r / 2], [-r * 1.6, -r / 2], [0, -r]].map(([dx, dy]) => [x + dx, y + dy]));

  ops.push({ kind: 'text', text: t(lang, 'sim.badge'), size: 10, x: scene.frame.x + 10, y: scene.frame.y + 14, anchor: 'start', fill: '#5b5a57', halo: '#ffffff', weight: 700, px: 10 });
  if (!sim.ok) return ops;

  // Currents first (one per part, beside its body), then one voltage per group, near its
  // lowest lead on screen (nearest the viewer).
  for (const part of built.parts) {
    if (part.def.electrical?.kind === 'W') continue;
    const current = partCurrent(sim.parts[part.id]);
    const box = boxes.get(part.id);
    if (!current || !box) continue;
    const text = `${current.label ? `${current.label} ` : ''}${formatValue(current.value, 'A', { decimal })}`;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const w = text.length * SIZE * 0.6 + 6;
    tag(text, [[cx, box.y + box.height + 9], [box.x + box.width + w / 2 + 4, cy], [box.x - w / 2 - 4, cy], [cx, box.y - 9], [cx, box.y + box.height + 22]], CURRENT, part.id);
  }
  for (const [node, members] of Object.entries(built.netlist.nodes)) {
    const v = sim.nodes[node];
    if (v == null) continue;
    const points = members.map((m) => built.board.find(m.hole)).filter(Boolean).map((h) => scene.camera.project(h.pos)).sort((a, b) => b.y - a.y);
    if (points[0]) tag(volts(v, decimal), around(points[0].x, points[0].y, [12, 24, 36]), VOLTAGE);
  }
  return ops;
}
