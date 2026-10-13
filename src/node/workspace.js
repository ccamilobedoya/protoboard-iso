// Circuits on disk, with history. Node only (uses the file system); everything else in
// src/ also runs in the browser.
//
// A target is either
//   a folder   circuits/led/            → circuit.json, history.jsonl, out/
//   a file     examples/led.json        → led.history.jsonl beside it, out/ beside it
//
// The circuit file is the only source of truth. Every change made through applyToTarget
// or undoTarget bumps `revision` in the circuit and appends one line to the history:
//   { revision, time, author, note, ops, inverse, undoes? }
// Outputs (SVG, report.json) are derived and can be deleted at any time.

import { readFileSync, writeFileSync, appendFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { applyOps } from '../ops.js';
import { evaluate, diffEvaluations } from '../diff.js';
import { renderCircuit, inspectCircuit } from '../index.js';

const error = (code, params) => ({ severity: 'error', code, params });

export function resolveTarget(target) {
  if (existsSync(target) && statSync(target).isDirectory()) {
    return { circuitFile: join(target, 'circuit.json'), historyFile: join(target, 'history.jsonl'), outDir: join(target, 'out'), name: basename(target) };
  }
  const name = basename(target).replace(/\.json$/i, '');
  return { circuitFile: target, historyFile: join(dirname(target), `${name}.history.jsonl`), outDir: join(dirname(target), 'out'), name };
}

export function loadCircuit(paths) {
  return JSON.parse(readFileSync(paths.circuitFile, 'utf8'));
}

export function readHistory(paths) {
  if (!existsSync(paths.historyFile)) return [];
  return readFileSync(paths.historyFile, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function saveCircuit(paths, circuit) {
  writeFileSync(paths.circuitFile, `${JSON.stringify(circuit, null, 2)}\n`);
}

// Derived outputs: front SVG (full board) and the inspect report. Cheap to regenerate.
export function writeOutputs(paths, circuit, { lang = 'en' } = {}) {
  mkdirSync(paths.outDir, { recursive: true });
  const { svg } = renderCircuit(circuit, { lang });
  const svgFile = join(paths.outDir, `${paths.name}.front.svg`);
  const reportFile = join(paths.outDir, `${paths.name}.report.json`);
  if (svg) writeFileSync(svgFile, svg);
  const report = inspectCircuit(circuit, { lang });
  writeFileSync(reportFile, `${JSON.stringify({ revision: circuit.revision ?? 0, ...report }, null, 2)}\n`);
  return { svgFile, reportFile };
}

function commit(paths, circuit, entry) {
  const revision = (circuit.revision ?? 0) + 1;
  const saved = { ...circuit, revision };
  saveCircuit(paths, saved);
  appendFileSync(paths.historyFile, `${JSON.stringify({ revision, time: new Date().toISOString(), ...entry })}\n`);
  return saved;
}

// options: dryRun, author, note, expectRevision, views, lang, outputs (default true)
export function applyToTarget(target, ops, options = {}) {
  const { dryRun = false, author = 'unknown', note = '', expectRevision, views, lang = 'en', outputs = true } = options;
  const paths = resolveTarget(target);
  const current = loadCircuit(paths);
  const revision = current.revision ?? 0;
  if (expectRevision !== undefined && Number(expectRevision) !== revision) {
    return { applied: false, revision, errors: [error('REVISION_MISMATCH', { expected: Number(expectRevision), actual: revision })] };
  }
  const result = applyOps(current, ops);
  if (result.errors.length) return { applied: false, revision, errors: result.errors };

  const diff = diffEvaluations(evaluate(current, { views, lang }), evaluate(result.circuit, { views, lang }));
  if (dryRun) return { applied: false, dryRun: true, revision, nextRevision: revision + 1, errors: [], diff, circuit: result.circuit };

  const saved = commit(paths, result.circuit, { author, note, ops, inverse: result.inverse });
  const files = outputs ? writeOutputs(paths, saved, { lang }) : null;
  return { applied: true, revision: saved.revision, errors: [], diff, files };
}

// Undoes the most recent change that has not been undone yet.
export function undoTarget(target, { author = 'unknown', views, lang = 'en', outputs = true } = {}) {
  const paths = resolveTarget(target);
  const history = readHistory(paths);
  const undone = new Set(history.filter((h) => h.undoes).map((h) => h.undoes));
  const last = [...history].reverse().find((h) => !h.undoes && !undone.has(h.revision));
  if (!last) return { applied: false, errors: [error('NOTHING_TO_UNDO', {})] };

  const current = loadCircuit(paths);
  const result = applyOps(current, last.inverse);
  if (result.errors.length) return { applied: false, errors: result.errors };
  const diff = diffEvaluations(evaluate(current, { views, lang }), evaluate(result.circuit, { views, lang }));
  const saved = commit(paths, result.circuit, { author, note: `undo ${last.revision}`, ops: last.inverse, inverse: last.ops, undoes: last.revision });
  const files = outputs ? writeOutputs(paths, saved, { lang }) : null;
  return { applied: true, revision: saved.revision, undid: last.revision, errors: [], diff, files };
}
