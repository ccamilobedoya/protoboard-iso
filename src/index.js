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
  const items = result.parts.flatMap((part) => {
    for (const primitive of part.built.primitives) primitive.part = part.id;
    return part.built.primitives;
  });
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
  const scene = buildScene({ camera, base, items, labels: anchors, fit });
  if (layers.size) annotateScene(scene, result, layers);
  // Simulation results (a model): voltages per group, currents per part, in their own layer.
  if (options.sim) scene.layers.results = resultsOverlay(scene, result, simulate(circuit, { analysis: 'dc' }), lang);
  return { result, scene, view, scale, lang };
}

const titleOf = (circuit, lang) => (typeof circuit.title === 'object' ? circuit.title?.[lang] ?? circuit.title?.en : circuit.title);

// options: view, lang, scale (px per mm), labels (true | 'both' | 'id' | 'value' | false),
//          fit ('board' | 'parts'),
//          annotate ('pins,boxes,nodes,grid' | 'all'), background,
//          sim (true: DC simulation results in the `results` layer, see src/sim/overlay.js)
export function renderCircuit(circuit, options = {}) {
  const { result, scene, lang } = sceneFor(circuit, options);
  if (!scene) return { svg: null, scene: null, issues: result.issues, netlist: result.netlist };
  const svg = sceneToSvg(scene, { background: options.background ?? '#ffffff', title: titleOf(circuit, lang) });
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
