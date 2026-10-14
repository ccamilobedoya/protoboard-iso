// Describes a rendered scene in numbers, so a drawing can be checked without looking at
// it: where every part and lead is (board holes, millimetres, screen pixels), how much of
// each part is visible and what covers it, whether labels or leader lines sit on top of
// something, and which text is too small to read.
//
// inspectCircuit(circuit, options) → report (plain JSON)
// formatReport(report, lang)       → readable text

import { createCoverage } from './render/coverage.js';
import { t, decimalSeparator } from './i18n/index.js';

const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const boxRound = (b) => ({ x: round(b.x), y: round(b.y), width: round(b.width), height: round(b.height) });

export const INSPECT_LIMITS = {
  hidden: 0.5, // visible share below this is a warning
  partlyHidden: 0.85, // below this is a note
  smallText: 6, // px: letters shorter than this are hard to read
  leaderOverPart: 6, // px of leader line over another part before it is reported
};

function boxOfOps(ops) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const op of ops) {
    const pts = op.kind === 'polygon' ? op.pts : op.box ? [op.box, { x: op.box.x + op.box.width, y: op.box.y + op.box.height }] : [];
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null;
}

export function partBoxes(scene) {
  const byPart = new Map();
  for (const op of [...scene.layers.under, ...scene.layers.parts]) {
    if (op.part == null) continue;
    if (!byPart.has(op.part)) byPart.set(op.part, []);
    byPart.get(op.part).push(op);
  }
  return new Map([...byPart].map(([part, ops]) => [part, boxOfOps(ops)]));
}

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

function segmentsCross(a, b) {
  const d = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const p1 = { x: a.x1, y: a.y1 };
  const p2 = { x: a.x2, y: a.y2 };
  const q1 = { x: b.x1, y: b.y1 };
  const q2 = { x: b.x2, y: b.y2 };
  const d1 = d(q1, q2, p1);
  const d2 = d(q1, q2, p2);
  const d3 = d(p1, p2, q1);
  const d4 = d(p1, p2, q2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

export function inspectScene(scene, result, { view, scale, limits = INSPECT_LIMITS } = {}) {
  const { camera } = scene;
  const coverage = createCoverage(scene.frame);
  for (const op of [...scene.layers.under, ...scene.layers.parts]) if (op.kind === 'polygon') coverage.paint(op.pts, op.part);

  const visibility = new Map(coverage.visibility().map((v) => [v.part, v]));
  const boxes = partBoxes(scene);
  const callouts = new Map(scene.callouts.map((c) => [c.part, c]));
  const leaders = scene.layers.labels.filter((op) => op.kind === 'line' && op.role === 'leader');
  const problems = [];

  const parts = result.parts.map((part) => {
    const v = visibility.get(part.id) ?? { visible: 1, hiddenBy: [], area: 0 };
    const pins = part.holes.map((hole, i) => {
      const s = camera.project(hole.pos);
      return {
        pin: part.pinNames[i],
        hole: hole.id,
        node: hole.node,
        world: { x: round(hole.pos.x, 2), y: round(hole.pos.y, 2) },
        screen: { x: round(s.x), y: round(s.y) },
      };
    });
    const callout = callouts.get(part.id);
    const label = callout ? { text: callout.text, row: callout.row, box: boxRound(callout) } : null;

    if (v.area > 0 && v.visible < limits.partlyHidden) {
      const [top] = v.hiddenBy;
      problems.push({
        severity: v.visible < limits.hidden ? 'warning' : 'info',
        code: 'PART_HIDDEN',
        params: { part: part.id, visible: Math.round(v.visible * 100), by: top?.part ?? '?', share: Math.round((top?.share ?? 0) * 100) },
      });
    }

    let leaderOver = [];
    const leader = leaders.find((l) => l.part === part.id);
    if (leader) {
      const length = Math.hypot(leader.x2 - leader.x1, leader.y2 - leader.y1);
      const over = new Map();
      for (let s = 0; s < length - 4; s += 1) {
        const k = s / length;
        const hit = coverage.at(leader.x1 + (leader.x2 - leader.x1) * k, leader.y1 + (leader.y2 - leader.y1) * k);
        if (hit && hit !== part.id) over.set(hit, (over.get(hit) ?? 0) + 1);
      }
      leaderOver = [...over].filter(([, px]) => px >= limits.leaderOverPart).map(([p, px]) => ({ part: p, px }));
      if (leaderOver.length) {
        problems.push({ severity: 'info', code: 'LEADER_OVER_PART', params: { part: part.id, over: leaderOver.map((o) => o.part).join(', ') } });
      }
    }

    return {
      id: part.id,
      type: part.type,
      value: part.def.label?.text ?? null,
      pins,
      box: boxes.get(part.id) ? boxRound(boxes.get(part.id)) : null,
      visible: round(v.visible, 3),
      hiddenBy: v.hiddenBy.map((h) => ({ part: h.part, share: round(h.share, 3) })),
      label,
      leaderOver,
    };
  });

  // Labels: over parts, over each other, over the printed rail labels.
  const labelRects = scene.layers.labels.filter((op) => op.kind === 'rect' && op.role === 'label');
  for (const rect of labelRects) {
    const under = coverage.under(rect).filter((u) => u.share > 0.02);
    if (under.length) problems.push({ severity: 'warning', code: 'LABEL_COVERS_PART', params: { part: rect.part, over: under.map((u) => u.part).join(', ') } });
  }
  for (let i = 0; i < labelRects.length; i++) {
    for (let j = i + 1; j < labelRects.length; j++) {
      if (overlaps(labelRects[i], labelRects[j])) problems.push({ severity: 'warning', code: 'LABEL_OVERLAP', params: { first: labelRects[i].part, second: labelRects[j].part } });
    }
  }
  const printed = scene.layers.board.filter((op) => op.kind === 'text' && op.role === 'net-label');
  for (const rect of labelRects) {
    for (const text of printed) {
      if (overlaps(rect, text.box)) problems.push({ severity: 'info', code: 'LABEL_HIDES_TEXT', params: { part: rect.part, text: text.text } });
    }
  }
  for (let i = 0; i < leaders.length; i++) {
    for (let j = i + 1; j < leaders.length; j++) {
      if (segmentsCross(leaders[i], leaders[j])) problems.push({ severity: 'info', code: 'LEADER_CROSSING', params: { first: leaders[i].part, second: leaders[j].part } });
    }
  }

  // Text size on screen.
  const texts = [...scene.layers.under, ...scene.layers.board, ...scene.layers.parts].filter((op) => op.kind === 'text');
  // Board print scales with --scale and is reported only as the smallest text; parts'
  // markings (TO-92 print, capacitor codes) are what a learner must be able to read.
  const small = texts.filter((op) => op.part != null && op.px < limits.smallText);
  const smallest = texts.reduce((best, op) => (!best || op.px < best.px ? op : best), null);
  if (small.length) {
    const partsWithSmall = [...new Set(small.map((op) => op.part).filter(Boolean))];
    problems.push({
      severity: 'info',
      code: 'TEXT_TOO_SMALL',
      params: { count: small.length, limit: limits.smallText, parts: partsWithSmall.join(', ') || '—', smallest: round(smallest.px) },
    });
  }

  return {
    view,
    scale,
    frame: scene.frame,
    parts,
    text: smallest ? { smallest: { text: smallest.text, px: round(smallest.px), part: smallest.part ?? null }, belowLimit: small.length } : null,
    problems,
    issues: result.issues,
  };
}

// Readable report. Numbers use the language's decimal separator.
export function formatReport(report, lang = 'en', formatIssue) {
  const dec = decimalSeparator(lang);
  const n = (x) => String(x).replace('.', dec);
  const lines = [];
  const f = report.frame;
  lines.push(t(lang, 'inspect.scene', { view: report.view, scale: n(report.scale), width: f.width, height: f.height, x: f.x, y: f.y }));
  lines.push('');
  for (const p of report.parts) {
    lines.push(`${p.id.padEnd(5)} ${t(lang, `type.${p.type}`)}${p.value ? ` · ${p.value}` : ''}`);
    for (const pin of p.pins) {
      lines.push(
        `      ${t(lang, 'inspect.pin', { pin: pin.pin, hole: pin.hole, node: pin.node, x: n(pin.world.x), y: n(pin.world.y), sx: n(pin.screen.x), sy: n(pin.screen.y) })}`,
      );
    }
    if (p.box) {
      const hidden = p.hiddenBy.length ? ` · ${t(lang, 'inspect.hiddenBy', { list: p.hiddenBy.map((h) => `${h.part} ${Math.round(h.share * 100)} %`).join(', ') })}` : '';
      lines.push(
        `      ${t(lang, 'inspect.box', { x: n(p.box.x), y: n(p.box.y), width: n(p.box.width), height: n(p.box.height), visible: Math.round(p.visible * 100) })}${hidden}`,
      );
    }
    if (p.label) lines.push(`      ${t(lang, 'inspect.label', { text: p.label.text, row: p.label.row, x: n(p.label.box.x), y: n(p.label.box.y) })}`);
  }
  if (report.text) {
    lines.push('');
    lines.push(t(lang, 'inspect.smallest', { text: report.text.smallest.text, px: n(report.text.smallest.px), part: report.text.smallest.part ?? '—' }));
  }
  lines.push('');
  const all = [...report.issues, ...report.problems];
  if (!all.length) lines.push(t(lang, 'inspect.clean'));
  else {
    lines.push(t(lang, 'inspect.problems', { count: all.length }));
    for (const issue of all) lines.push(`  ${formatIssue(issue, lang)}`);
  }
  return lines.join('\n');
}
