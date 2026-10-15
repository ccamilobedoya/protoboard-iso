// Public API.
//
//   renderCircuit(circuit, options)  → { svg, scene, issues, netlist }
//   inspectCircuit(circuit, options) → report: positions, visibility, label problems
//   formatReport(report, lang)       → the report as readable text
//   checkCircuit(circuit)            → { issues, netlist }
//   formatIssue(issue, lang)         → "warning: R1: …"
//   applyOps(circuit, ops)           → { circuit, inverse, errors }   (pure, see ops.js)
//   evaluate / diffEvaluations       → what a change fixes and introduces (see diff.js)
//   queryAt / queryNode / queryFree / suggest → questions and placements (see query.js)
//   review(circuit, { profile })     → approved / changes, from measurements (see review.js)
//   File-based history and undo live in src/node/workspace.js (Node only).
//
// Works the same in Node and in the browser: no dependencies, no file access.

import { createCamera, VIEWS } from './core/camera.js';
import { formatValue, parseValue } from './core/units.js';
import { drawBoard } from './board/draw-board.js';
import { BOARDS, createBoard } from './board/board.js';
import { buildScene } from './render/scene.js';
import { sceneToSvg } from './render/svg.js';
import { inspectScene, formatReport as formatReportWith } from './inspect.js';
import { parseAnnotations, annotateScene, nodeColors, ANNOTATION_LAYERS } from './annotate.js';
import { buildCircuit } from './circuit/build.js';
import { nodeParams } from './circuit/checks.js';
import { t, decimalSeparator, LANGUAGES } from './i18n/index.js';
import { PART_TYPES } from './parts/types/index.js';
import { PACKAGES } from './parts/packages/index.js';
import { PART_NUMBERS } from './parts/db.js';
import { resistorBands } from './parts/types/resistor.js';
import { simulate } from './sim/index.js';
import { resultsOverlay } from './sim/overlay.js';
import { flowOps } from './sim/paths.js';
import { probeOps } from './sim/probes.js';
import { focusLayers, veilOps, stripOps, coordOps, nodesOf } from './render/focus.js';

export { applyOps, OP_NAMES, CIRCUIT_FIELDS } from './ops.js';
export { evaluate, diffEvaluations, problemKey } from './diff.js';
export { queryAt, queryNode, queryFree, suggest, resolveNode } from './query.js';
export { review, formatReview, PROFILES } from './review.js';
export { ANNOTATION_LAYERS, BOARDS, createBoard, PART_TYPES, PACKAGES, PART_NUMBERS, VIEWS, LANGUAGES, parseValue, formatValue, resistorBands, t, buildCircuit };

export function formatIssue(issue, lang = 'en') {
  const decimal = decimalSeparator(lang);
  const params = Object.fromEntries(
    Object.entries(issue.params).map(([k, v]) => [k, typeof v === 'number' ? String(v).replace('.', decimal) : v && typeof v === 'object' && 'unit' in v ? formatValue(v.value, v.unit, { decimal }) : v]),
  );
  if (params.node) {
    const n = nodeParams(params.node);
    params.node = t(lang, n.key, n.params);
  }
  return `${t(lang, `severity.${issue.severity}`)}: ${t(lang, `check.${issue.code}`, params)}`;
}

// Value as shown to people: "4,7 kΩ", "rojo", "IRLZ44N" (null for wires).
export function valueText(part, lang = 'en') {
  const label = part?.def.label;
  if (!label) return null;
  let text;
  if (label.value !== undefined) text = formatValue(label.value, label.unit, { decimal: decimalSeparator(lang) });
  else if (label.key) text = t(lang, label.key);
  else text = label.text;
  return label.extra ? `${text} ${label.extra}` : text;
}

export function labelText(part, lang = 'en') {
  const value = valueText(part, lang);
  return value ? `${part.id} · ${value}` : null;
}

export function checkCircuit(circuit) {
  const { issues, netlist } = buildCircuit(circuit);
  return { issues, netlist };
}

// A piece lying entirely beyond one side face of the board (a battery on the table, the low
// part of its leads), on the side the camera does not see: the board stands between it and
// the viewer, so it is painted before the board. Above the board top nothing is hidden, and
// the board never covers it there either.
const SIDE_FACES = [
  [(p, s) => p.x < -0.01, { x: -1, y: 0, z: 0 }],
  [(p, s) => p.x > s.length + 0.01, { x: 1, y: 0, z: 0 }],
  [(p, s) => p.y < -0.01, { x: 0, y: -1, z: 0 }],
  [(p, s) => p.y > s.width + 0.01, { x: 0, y: 1, z: 0 }],
];
function behindBoard(primitive, size, camera) {
  const pts = primitive.faces.flatMap((f) => f.pts);
  return SIDE_FACES.some(([outside, n]) => n.x * camera.toViewer.x + n.y * camera.toViewer.y < 0 && pts.every((p) => outside(p, size)));
}

// Shared by render and inspect: circuit → resolved parts → scene (+ annotations).
function sceneFor(circuit, options = {}) {
  const view = options.view ?? circuit?.view ?? 'front';
  const { lang = 'en', scale = 5, labels = true, fit = 'board' } = options;
  const layers = parseAnnotations(options.annotate);
  const result = buildCircuit(circuit);
  if (!result.board) return { result, scene: null, view, scale, lang };

  const camera = createCamera({ view, scale });
  const highlight = layers.has('nodes') ? nodeColors(result.netlist) : new Map();
  const base = [drawBoard(result.board, { netLabels: circuit.netLabels ?? {}, highlight, allNumbers: layers.has('grid') })];
  const items = [];
  const under = [];
  for (const part of result.parts) {
    for (const primitive of part.built.primitives) {
      primitive.part = part.id;
      (behindBoard(primitive, result.board.spec.size, camera) ? under : items).push(primitive);
    }
  }
  const anchors = [];
  if (labels) {
    for (const part of result.parts) {
      // labels: true / 'both' → "R1 · 330 Ω", 'id' → "R1", 'value' → "330 Ω"
      const text = labels === 'id' ? (part.def.label ? part.id : null) : labels === 'value' ? valueText(part, lang) : labelText(part, lang);
      if (!text) continue;
      const at = camera.project(part.built.anchor);
      anchors.push({ x: at.x, y: at.y, text, part: part.id });
    }
  }
  const scene = buildScene({ camera, base, items, under, labels: anchors, fit });
  if (layers.size) annotateScene(scene, result, layers);
  addLayers(scene, result, circuit, options, lang);
  return { result, scene, view, scale, lang };
}

// Optional layers, always in this order: veil, strips, coords, spotlight, flow, spotlabels,
// results, probes.
//   focus: ['R1']   dim everything but these parts and their strips (static images)
//   flow: true      conductor view: conductors coloured by voltage, dots for conventional
//                   current (moving in a page, still in a static image)
//   sim: true       simulation results, labelled as a model
//   interactive     a page: every part tagged and copied, every strip ready, shown by CSS
function addLayers(scene, built, circuit, options, lang) {
  const needSim = options.sim || options.flow;
  const sim = needSim ? simulate(circuit, { analysis: 'dc' }) : null;
  const extra = { veil: [], strips: [], coords: [], spotlight: [], flow: [], spotlabels: [], results: [], probes: [] };
  if (options.interactive) {
    extra.veil = veilOps(scene.frame);
    extra.strips = stripOps(scene, built.board, [...usedNodes(built, circuit)]);
    // Column numbers and row letters of every lead, shown for the tapped part only.
    extra.coords = coordOps(scene, built.board, built.parts.flatMap((p) => p.holes));
    // The page clones the focused parts into .spotlight when needed: no copies in the file.
  } else if (options.focus?.length) {
    Object.assign(extra, focusLayers(scene, built, options.focus));
  }
  if (options.flow) {
    // The conductor view draws the strips in use itself, coloured: no grey strips under them.
    if (!options.interactive) extra.veil = veilOps(scene.frame);
    // A page gets every piece, tagged for the live simulation to move and colour.
    extra.flow = flowOps(scene, built, sim, circuit, { live: Boolean(options.interactive) });
  }
  if (options.sim) {
    extra.results = resultsOverlay(scene, built, sim, lang);
    // A page shows, on demand, where each tag's value comes from (probes, arrows).
    if (options.interactive) extra.probes = probeOps(scene, built, sim, circuit);
    // With a focus, only the focused parts' currents and the voltages of their groups.
    if (!options.interactive && options.focus?.length) {
      const ids = new Set(options.focus);
      const nodes = new Set(nodesOf(built, ids));
      extra.results = extra.results.filter((op) => op.cls === 'badge' || ids.has(op.part) || nodes.has(op.data?.node));
    }
  }
  Object.assign(scene.layers, extra);
}

// Groups with a lead in them, plus the rails a supply is clipped to.
function usedNodes(built, circuit) {
  const nodes = new Set(Object.keys(built.netlist.nodes));
  for (const s of Array.isArray(circuit.supplies) ? circuit.supplies : []) {
    for (const ref of [s.positive ?? 'T+', s.negative ?? 'T-']) {
      const hole = built.board.find(String(ref));
      const node = hole ? hole.node : String(ref);
      if ([...built.board.holes.values()].some((h) => h.node === node)) nodes.add(node);
    }
  }
  return nodes;
}

const titleOf = (circuit, lang) => (typeof circuit.title === 'object' ? circuit.title?.[lang] ?? circuit.title?.en : circuit.title);

// options: view, lang, scale (px per mm), labels (true | 'both' | 'id' | 'value' | false),
//          fit ('board' | 'parts'),
//          annotate ('pins,boxes,nodes,grid' | 'all'), background,
//          sim (true: DC simulation results in the `results` layer, see src/sim/overlay.js),
//          focus (['R1', …]: dim the rest, see src/render/focus.js), flow (true: current flow),
//          interactive (true: everything a page needs to focus and show flow on demand)
export function renderCircuit(circuit, options = {}) {
  const { result, scene, lang } = sceneFor(circuit, options);
  if (!scene) return { svg: null, scene: null, issues: result.issues, netlist: result.netlist };
  const svg = sceneToSvg(scene, { background: options.background ?? '#ffffff', title: titleOf(circuit, lang), tagParts: Boolean(options.interactive) });
  return { svg, scene, issues: result.issues, netlist: result.netlist };
}

// Same options as renderCircuit. The report describes exactly what renderCircuit draws.
export function inspectCircuit(circuit, options = {}) {
  const { result, scene, view, scale, lang } = sceneFor(circuit, options);
  if (!scene) return { view, scale, frame: null, parts: [], text: null, problems: [], issues: result.issues };
  const report = inspectScene(scene, result, { view, scale });
  const byId = new Map(result.parts.map((p) => [p.id, p]));
  for (const p of report.parts) p.value = valueText(byId.get(p.id), lang);
  return report;
}

export const formatReport = (report, lang = 'en') => formatReportWith(report, lang, formatIssue);
