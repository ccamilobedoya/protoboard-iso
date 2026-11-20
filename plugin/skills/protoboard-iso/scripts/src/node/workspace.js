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
// Outputs (SVG, page, report.json) are derived and can be deleted at any time.

import { readFileSync, writeFileSync, appendFileSync, existsSync, statSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { applyOps, CIRCUIT_FIELDS } from '../ops.js';
import { evaluate, diffEvaluations, newErrorCount, isInputMistake } from '../diff.js';
import { renderCircuit, inspectCircuit, formatIssue } from '../index.js';
import { renderPage } from '../page.js';
import { pickLanguage, t } from '../i18n/index.js';
import { circuitTooLarge, fileTooLarge } from '../limits.js';
import { CIRCUIT_FOLDER } from '../beside.js';

const error = (code, params) => ({ severity: 'error', code, params });

// A file the user names that cannot be used (missing, empty, not JSON, wrong shape): an error with an
// issue (code + params), so every front end says the same thing in the person's language.
export function inputIssueFor(issue, lang = 'en') {
  const { what, shape } = issue.params;
  return { ...issue, params: { ...issue.params, what: t(lang, `input.what.${what}`), ...(shape && { shape: t(lang, `input.shape.${shape}`) }), ...(issue.params.got && { got: t(lang, `input.got.${issue.params.got}`) }) } };
}
export const inputErrorText = (issue, lang = 'en') => formatIssue(inputIssueFor(issue, lang), lang);
export class InputError extends Error {
  constructor(issue) {
    super(inputErrorText(issue, 'en'));
    this.issue = issue;
  }
}
const inputError = (code, params) => new InputError(error(code, params));
const gotWord = (v) => (v === null ? 'null' : Array.isArray(v) ? 'list' : typeof v === 'object' ? 'object' : typeof v === 'string' ? 'text' : typeof v === 'number' ? 'number' : 'boolean');

// Text that must hold JSON: what it is ('spec' | 'ops' | 'circuit' | 'history' | 'timeline'), where it
// came from (a file name, "standard input"), the shape wanted ('object', or 'objects': one or a list).
export function parseJsonInput(text, { what, file, shape = 'object' }) {
  if (!String(text).trim()) throw inputError('INPUT_EMPTY', { what, file, shape });
  let value;
  try {
    value = JSON.parse(text);
  } catch (e) {
    throw inputError('INPUT_NOT_JSON', { what, file, shape, reason: String(e.message).replace(/^JSON\.parse: /, '') });
  }
  const object = value !== null && typeof value === 'object';
  if (!object || (shape === 'object' && Array.isArray(value)) || (shape === 'objects' && Array.isArray(value) && !value.every((v) => v && typeof v === 'object' && !Array.isArray(v)))) {
    throw inputError('INPUT_BAD_SHAPE', { what, file, shape, got: gotWord(value) });
  }
  return value;
}

// Reads a file (or standard input when `file` is "-") and parses it as above.
export function readJsonInput(file, { what, shape = 'object' }) {
  const label = file === '-' ? 'standard input' : file;
  let text;
  try {
    text = readFileSync(file === '-' ? 0 : file, 'utf8');
  } catch (e) {
    throw inputError(e.code === 'ENOENT' ? 'INPUT_MISSING' : 'INPUT_UNREADABLE', { what, file: label, shape, reason: e.code ?? e.message });
  }
  return parseJsonInput(text, { what, file: label, shape });
}

export function resolveTarget(target) {
  if (existsSync(target) && statSync(target).isDirectory()) {
    return { circuitFile: join(target, 'circuit.json'), historyFile: join(target, 'history.jsonl'), outDir: join(target, 'out'), name: basename(target) };
  }
  const name = basename(target).replace(/\.json$/i, '');
  return { circuitFile: target, historyFile: join(dirname(target), `${name}.history.jsonl`), outDir: join(dirname(target), 'out'), name };
}

// The circuit, with the folder it lives in kept beside it (not saved: a symbol), so a board's
// program file ("program": "blink.ino") is read from there when it is simulated. A file over
// the size cap is not read at all (src/limits.js).
export function loadCircuit(paths) {
  if (!existsSync(paths.circuitFile)) throw inputError('INPUT_MISSING', { what: 'circuit', file: paths.circuitFile, shape: 'object', reason: 'ENOENT' });
  const large = fileTooLarge(statSync(paths.circuitFile).size);
  if (large) throw Object.assign(new Error(t('en', `check.${large.code}`, large.params)), { issue: large });
  return withFolder(readJsonInput(paths.circuitFile, { what: 'circuit' }), paths);
}
const withFolder = (circuit, paths) => Object.defineProperty(circuit, CIRCUIT_FOLDER, { value: dirname(paths.circuitFile), enumerable: false, configurable: true });

export function readHistory(paths) {
  if (!existsSync(paths.historyFile)) return [];
  return readFileSync(paths.historyFile, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line, i) => parseJsonInput(line, { what: 'history', file: `${paths.historyFile} (line ${i + 1})` }));
}

// The circuit as it was at an earlier revision: the current one with the inverse of every later
// change applied, newest first (each history line carries its inverse). Null when the history
// does not reach that far back or an inverse does not apply.
export function circuitAt(paths, revision) {
  const current = loadCircuit(paths);
  const now = current.revision ?? 0;
  if (revision === now) return current;
  if (!Number.isInteger(revision) || revision < 0 || revision > now) return null;
  const later = readHistory(paths).filter((h) => h.revision > revision).sort((a, b) => b.revision - a.revision);
  if (later.length !== now - revision || later.some((h) => !Array.isArray(h.inverse))) return null;
  let circuit = current;
  for (const entry of later) {
    const result = applyOps(circuit, entry.inverse);
    if (result.errors.length) return null;
    circuit = result.circuit;
  }
  return withFolder({ ...circuit, revision }, paths);
}

function saveCircuit(paths, circuit) {
  writeFileSync(paths.circuitFile, `${JSON.stringify(circuit, null, 2)}\n`);
}

// Derived outputs: front SVG (full board), the embeddable page and the inspect report.
// Cheap to regenerate. The page keeps its name across changes, so an embed of it always
// shows the latest revision.
export const pageFileOf = (paths) => join(paths.outDir, `${paths.name}.html`);

export function writePage(paths, circuit, options = {}) {
  const { html, issues } = renderPage(circuit, options);
  if (!html) return { pageFile: null, issues };
  mkdirSync(paths.outDir, { recursive: true });
  const pageFile = options.out ?? pageFileOf(paths);
  writeFileSync(pageFile, html);
  return { pageFile, issues };
}

// Language: one asked for explicitly (outputLang) wins, then the circuit's own `lang`, then
// the caller's default (lang). So a circuit with "lang": "es" keeps its page in Spanish even
// when an English-speaking tool changes it.
export function writeOutputs(paths, circuit, { lang = 'en', outputLang } = {}) {
  lang = pickLanguage(outputLang, circuit.lang, lang);
  withFolder(circuit, paths);
  mkdirSync(paths.outDir, { recursive: true });
  const { svg } = renderCircuit(circuit, { lang });
  const svgFile = join(paths.outDir, `${paths.name}.front.svg`);
  const reportFile = join(paths.outDir, `${paths.name}.report.json`);
  if (svg) writeFileSync(svgFile, svg);
  const { pageFile } = writePage(paths, circuit, { lang });
  const report = inspectCircuit(circuit, { lang });
  writeFileSync(reportFile, `${JSON.stringify({ revision: circuit.revision ?? 0, ...report }, null, 2)}\n`);
  return { svgFile, pageFile, reportFile };
}

function commit(paths, circuit, entry) {
  const revision = (circuit.revision ?? 0) + 1;
  const saved = { ...circuit, revision };
  saveCircuit(paths, saved);
  appendFileSync(paths.historyFile, `${JSON.stringify({ revision, time: new Date().toISOString(), ...entry })}\n`);
  return saved;
}

// Two processes may change one circuit (a host can run two of the MCP server): the read of the
// revision, its check and the write go under a lock, a folder made next to circuit.json (mkdir either
// makes it or fails), so expect_revision means what it says. A lock older than LOCK_STALE ms is a
// process that died, and is taken over.
const LOCK_STALE = 30000;
const LOCK_WAIT = 10000;
function withLock(paths, fn) {
  const lock = `${paths.circuitFile}.lock`;
  const start = Date.now();
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE) rmSync(lock, { recursive: true, force: true });
      } catch {
        // gone meanwhile
      }
      if (Date.now() - start > LOCK_WAIT) throw new Error(`The circuit is locked by another process (${lock}); try again.`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20); // a pause of 20 ms
    }
  }
  try {
    return fn();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

// options: refuse (default true: input mistakes refuse the batch; layout passes false), dryRun, author, note, expectRevision, views, lang (default), outputLang (asked for), outputs (default true)
export function applyToTarget(target, ops, options = {}) {
  const paths = resolveTarget(target);
  if (!existsSync(paths.circuitFile)) return applyLocked(target, ops, options);
  return withLock(paths, () => applyLocked(target, ops, options));
}

function applyLocked(target, ops, options) {
  const { dryRun = false, author = 'unknown', note = '', expectRevision, views, lang = 'en', outputLang, outputs = true } = options;
  const paths = resolveTarget(target);
  const current = loadCircuit(paths);
  const revision = current.revision ?? 0;
  if (expectRevision !== undefined && Number(expectRevision) !== revision) {
    return { applied: false, revision, errors: [error('REVISION_MISMATCH', { expected: Number(expectRevision), actual: revision })] };
  }
  const result = applyOps(current, ops);
  if (result.errors.length) return { applied: false, revision, errors: result.errors };

  const diff = diffEvaluations(evaluate(current, { views, lang }), evaluate(result.circuit, { views, lang }));
  // Input mistakes (diff.js) refuse the whole batch, in a dry run too (it says the real run would).
  const mistakes = options.refuse === false ? [] : diff.introduced.filter(isInputMistake);
  if (mistakes.length) return { applied: false, refused: true, ...(dryRun && { dryRun: true }), revision, errors: mistakes, diff };
  if (dryRun) return { applied: false, dryRun: true, revision, nextRevision: revision + 1, errors: [], diff, circuit: result.circuit };

  const saved = commit(paths, result.circuit, { author, note, ops, inverse: result.inverse });
  const files = outputs ? writeOutputs(paths, saved, { lang, outputLang }) : null;
  return { applied: true, revision: saved.revision, errors: [], diff, newErrors: newErrorCount(diff), files };
}

// Creates a circuit folder (circuit.json, history.jsonl, out/). Refuses to overwrite.
export function createTarget(target, circuit, { author = 'unknown', note = 'create', lang = 'en', outputLang, outputs = true } = {}) {
  if (existsSync(join(target, 'circuit.json')) || (existsSync(target) && !statSync(target).isDirectory())) {
    return { applied: false, errors: [error('TARGET_EXISTS', { target })] };
  }
  const large = circuitTooLarge(circuit);
  if (large) return { applied: false, errors: [large] };
  mkdirSync(target, { recursive: true });
  const paths = resolveTarget(target);
  const saved = { version: 1, ...circuit, revision: 0 };
  saveCircuit(paths, saved);
  appendFileSync(paths.historyFile, `${JSON.stringify({ revision: 0, time: new Date().toISOString(), author, note, created: true, ops: [], inverse: [] })}\n`);
  const files = outputs ? writeOutputs(paths, saved, { lang, outputLang }) : null;
  return { applied: true, revision: 0, errors: [], files };
}

// Lays a circuit out again (layout on an existing target): one revision that removes every part,
// sets the circuit's fields (spec included) and adds the new parts, so history shows it and undo
// brings the old layout back.
export function relayoutTarget(target, circuit, options = {}) {
  const current = loadCircuit(resolveTarget(target));
  const fields = Object.fromEntries(CIRCUIT_FIELDS.filter((k) => k !== 'view').map((k) => [k, circuit[k] ?? null]).filter(([k, v]) => v !== null || k in current));
  const ops = [...(current.parts ?? []).map((p) => ({ op: 'remove', part: p.id })), ...(Object.keys(fields).length ? [{ op: 'circuit', ...fields }] : []), ...circuit.parts.map((part) => ({ op: 'add', part }))];
  return applyToTarget(target, ops, { ...options, refuse: false });
}

// Undoes the most recent change that has not been undone yet.
export function undoTarget(target, options = {}) {
  const paths = resolveTarget(target);
  if (!existsSync(paths.circuitFile)) return undoLocked(target, options);
  return withLock(paths, () => undoLocked(target, options));
}

function undoLocked(target, { author = 'unknown', views, lang = 'en', outputLang, outputs = true }) {
  const paths = resolveTarget(target);
  const history = readHistory(paths);
  const undone = new Set(history.filter((h) => h.undoes).map((h) => h.undoes));
  const last = [...history].reverse().find((h) => !h.undoes && !h.created && !undone.has(h.revision));
  if (!last) return { applied: false, errors: [error('NOTHING_TO_UNDO', {})] };

  const current = loadCircuit(paths);
  const result = applyOps(current, last.inverse);
  if (result.errors.length) return { applied: false, errors: result.errors };
  const diff = diffEvaluations(evaluate(current, { views, lang }), evaluate(result.circuit, { views, lang }));
  const saved = commit(paths, result.circuit, { author, note: `undo ${last.revision}`, ops: last.inverse, inverse: last.ops, undoes: last.revision });
  const files = outputs ? writeOutputs(paths, saved, { lang, outputLang }) : null;
  return { applied: true, revision: saved.revision, undid: last.revision, errors: [], diff, files };
}
