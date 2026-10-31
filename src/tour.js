// A circuit's timeline (stage and video, V2; docs/en/stage-and-video.md, "The timeline"): the
// script of a tour of the page and of a video. `page.tour` names a JSON file beside the circuit
// (read by beside.js, inside the circuit's folder only) or holds the timeline itself.
//
//   loadTour(circuit, lang) → { tour, issues }   tour: what the page plays (null without one, or
//                                                when it cannot be used), texts in `lang`
//   tourIssues(circuit)     → issues             what check reports
//
// A timeline comes from anyone, so it is data only: its size, steps, texts and length are capped
// (src/limits.js), every field is checked against a closed list, and its texts reach the page as
// text (page/client/tour.js writes them with textContent). Shape, size and file problems drop the
// tour (a warning); an unknown part, a control the part does not have or a rhythm broken is a
// warning and the tour still plays (a step that cannot act does nothing).

import { LIMITS } from './limits.js';
import { readBeside } from './beside.js';
import { MOVES, moveTiming } from './page/client/moves.js';
import { THEMES } from './page/client/themes.js';
import { compile } from './sim/index.js';
import { createEngine } from './sim/engine.js';

export const ACTIONS = ['frame', 'focus', 'flip', 'set', 'flow', 'caption', 'value', 'probe', 'insert', 'wait-until'];
// What a `value` or `wait-until` step reads from a part's reading, and its unit.
export const READINGS = { current: 'A', voltage: 'V', power: 'W', brightness: '%' };
export const FORMATS = ['vertical', 'horizontal'];
// The page's themes a recording can take; a video is on the stage by default (V4).
export { THEMES } from './page/client/themes.js';
const FRAMES = ['board', 'parts'];
// The move a step makes when it names none.
const DEFAULT_MOVE = { frame: 'arrival', set: 'hit', insert: 'arrival' };
const BREATH = MOVES.breath.min; // ms of rest that count as a breath between two hits

const warn = (code, params = {}) => ({ severity: 'warning', code, params });
const isText = (v) => typeof v === 'string' || (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((s) => typeof s === 'string'));
const texts = (v) => (typeof v === 'string' ? [v] : Object.values(v ?? {}));
const localized = (v, lang) => (v == null ? undefined : typeof v === 'string' ? v : (v[lang] ?? v.en ?? Object.values(v)[0]));
const num = (v) => typeof v === 'number' && Number.isFinite(v);

// The fields each action takes besides at, do, move and ms: name → test.
const FIELDS = {
  frame: { target: (v) => typeof v === 'string', zoom: (v) => num(v) && v > 0 && v <= 20 },
  focus: { parts: (v) => Array.isArray(v) && v.every((p) => typeof p === 'string') },
  flip: { view: (v) => typeof v === 'string' },
  set: { part: (v) => typeof v === 'string', field: (v) => typeof v === 'string', value: (v) => num(v) || typeof v === 'boolean' },
  flow: { on: (v) => typeof v === 'boolean', ramp: (v) => num(v) && v >= 0 && v <= 10_000 },
  caption: { text: isText, line: isText },
  value: { part: (v) => typeof v === 'string', field: (v) => Object.hasOwn(READINGS, v), label: isText },
  probe: { part: (v) => typeof v === 'string', node: (v) => typeof v === 'string' },
  insert: { part: (v) => typeof v === 'string' },
  'wait-until': { part: (v) => typeof v === 'string', field: (v) => Object.hasOwn(READINGS, v), above: num, below: num, max: (v) => num(v) && v >= 0 && v <= 60_000 },
};
const REQUIRED = { frame: ['target'], focus: ['parts'], flip: ['view'], set: ['part', 'field', 'value'], flow: ['on'], caption: ['text'], value: ['part', 'field'], insert: ['part'], 'wait-until': ['part', 'field'] };

// The timeline as given, or why there is none to read: { raw, issues }.
function readTour(circuit) {
  const given = circuit?.page?.tour;
  if (given == null) return { raw: null, issues: [] };
  if (typeof given === 'string') {
    const read = readBeside(circuit, given, LIMITS.tourBytes);
    if (read.error === 'outside') return { raw: null, issues: [warn('TOUR_OUTSIDE', { file: given })] };
    if (read.error === 'size') return { raw: null, issues: [warn('TOUR_TOO_LARGE', { size: read.size, limit: LIMITS.tourBytes })] };
    if (read.error) return { raw: null, issues: [warn('TOUR_FILE', { file: given })] };
    try {
      return { raw: JSON.parse(read.text), issues: [] };
    } catch (e) {
      return { raw: null, issues: [warn('TOUR_JSON', { file: given, message: String(e.message).slice(0, 200) })] };
    }
  }
  const size = JSON.stringify(given).length;
  if (size > LIMITS.tourBytes) return { raw: null, issues: [warn('TOUR_TOO_LARGE', { size, limit: LIMITS.tourBytes })] };
  return { raw: given, issues: [] };
}

// Shape and caps: the problems that make the timeline unusable.
function shapeIssues(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.steps)) return [warn('TOUR_SHAPE', { where: 'steps' })];
  const out = [];
  for (const key of Object.keys(raw)) if (!['circuit', 'format', 'theme', 'steps', '$schema'].includes(key)) out.push(warn('TOUR_FIELD', { step: 0, field: key }));
  if (raw.format != null && !FORMATS.includes(raw.format)) out.push(warn('TOUR_FIELD', { step: 0, field: 'format' }));
  if (raw.theme != null && !THEMES.includes(raw.theme)) out.push(warn('TOUR_FIELD', { step: 0, field: 'theme' }));
  if (raw.steps.length > LIMITS.tourSteps) return [...out, warn('TOUR_TOO_MANY_STEPS', { size: raw.steps.length, limit: LIMITS.tourSteps })];
  raw.steps.forEach((s, i) => {
    const step = i + 1;
    if (!s || typeof s !== 'object' || Array.isArray(s)) return out.push(warn('TOUR_SHAPE', { where: `step ${step}` }));
    if (!ACTIONS.includes(s.do)) return out.push(warn('TOUR_ACTION', { step, action: String(s.do).slice(0, 40), actions: ACTIONS.join(', ') }));
    if (!num(s.at) || s.at < 0) out.push(warn('TOUR_FIELD', { step, field: 'at' }));
    const fields = FIELDS[s.do];
    for (const [key, v] of Object.entries(s)) {
      if (key === 'at' || key === 'do') continue;
      if (key === 'move') {
        if (!Object.hasOwn(MOVES, v)) out.push(warn('TOUR_MOVE', { step, move: String(v).slice(0, 40), moves: Object.keys(MOVES).join(', ') }));
      } else if (key === 'ms') {
        if (!num(v)) out.push(warn('TOUR_FIELD', { step, field: 'ms' }));
      } else if (!fields[key] || !fields[key](v)) out.push(warn('TOUR_FIELD', { step, field: key.slice(0, 40) }));
    }
    for (const key of REQUIRED[s.do] ?? []) if (s[key] == null) out.push(warn('TOUR_FIELD', { step, field: key }));
    if (s.do === 'probe' && (s.part == null) === (s.node == null)) out.push(warn('TOUR_FIELD', { step, field: 'part' }));
    if (s.do === 'wait-until' && (s.above == null) === (s.below == null)) out.push(warn('TOUR_FIELD', { step, field: 'above' }));
    for (const key of ['text', 'line', 'label']) {
      const long = texts(s[key]).find((x) => x.length > LIMITS.tourText);
      if (long) out.push(warn('TOUR_TEXT_TOO_LONG', { step, size: long.length, limit: LIMITS.tourText }));
    }
  });
  return out;
}

// When each step's move ends, in ms from the start.
const ends = (s) => s.at + timing(s).ms;
const moveOf = (s) => s.move ?? DEFAULT_MOVE[s.do] ?? 'cut';
const timing = (s) => (s.do === 'frame' || s.do === 'set' || s.do === 'insert' || s.move ? moveTiming(moveOf(s), s.ms) : { ms: 0 });

// What the circuit can do with the steps, and the rhythm: problems that leave the tour playable.
function meaningIssues(circuit, steps) {
  const out = [];
  const ids = new Set([...(circuit?.parts ?? []).map((p) => p?.id), ...(circuit?.supplies ?? []).map((s) => s?.id)]);
  let controls = null;
  const controlsOf = () => {
    if (controls) return controls;
    const compiled = compile(circuit);
    controls = compiled.fatal ? [] : createEngine(compiled.program).controls();
    return controls;
  };
  steps.forEach((s, i) => {
    const step = i + 1;
    const named = [s.part, ...(s.do === 'focus' ? s.parts : []), ...(s.do === 'frame' && !FRAMES.includes(s.target) ? [s.target] : [])].filter((x) => x != null);
    for (const id of named) if (!ids.has(id)) out.push(warn('TOUR_UNKNOWN_PART', { step, part: id }));
    if (s.do === 'set' && ids.has(s.part) && !controlsOf().some((c) => c.id === s.part && c.field === s.field)) {
      out.push(warn('TOUR_UNKNOWN_CONTROL', { step, part: s.part, field: s.field, options: controlsOf().filter((c) => c.id === s.part).map((c) => c.field).join(', ') || '—' }));
    }
    const m = MOVES[moveOf(s)];
    if (s.ms != null && m && (s.ms < m.min || s.ms > m.max)) out.push(warn('TOUR_MOVE_MS', { step, move: moveOf(s), ms: s.ms, min: m.min, max: m.max }));
    if (ends(s) > LIMITS.tourMs) out.push(warn('TOUR_TOO_LONG', { step, size: Math.round(ends(s)), limit: LIMITS.tourMs }));
  });
  // The rhythm: never two slow moves in a row, never two hits without a breath between them.
  const moving = steps.map((s, i) => ({ s, step: i + 1, move: moveOf(s) })).filter((x) => timing(x.s).ms > 0 || x.move === 'hit').sort((a, b) => a.s.at - b.s.at || a.step - b.step);
  for (let k = 1; k < moving.length; k++) {
    const [a, b] = [moving[k - 1], moving[k]];
    if (a.move === 'push' && b.move === 'push') out.push(warn('TOUR_RHYTHM_SLOW', { step: b.step, before: a.step }));
    if (a.move === 'hit' && b.move === 'hit' && b.s.at - ends(a.s) < BREATH) out.push(warn('TOUR_RHYTHM_HIT', { step: b.step, before: a.step, ms: BREATH }));
  }
  return out;
}

export function tourIssues(circuit) {
  return loadTour(circuit).issues;
}

// The page's copy: steps in order of time (the same `at` in the order written), each with its
// move named, texts in `lang`, nothing else.
export function loadTour(circuit, lang = 'en') {
  const { raw, issues } = readTour(circuit);
  if (!raw) return { tour: null, issues };
  const shape = shapeIssues(raw);
  if (shape.length) return { tour: null, issues: [...issues, ...shape] };
  const meaning = meaningIssues(circuit, raw.steps);
  const steps = raw.steps
    .map((s, k) => ({ s, k }))
    .sort((a, b) => a.s.at - b.s.at || a.k - b.k)
    .map(({ s }) => {
      const out = { ...s, move: moveOf(s) };
      for (const key of ['text', 'line', 'label']) if (s[key] != null) out[key] = localized(s[key], lang);
      return out;
    });
  return { tour: { format: raw.format ?? 'vertical', theme: raw.theme ?? 'stage', steps }, issues: [...issues, ...meaning] };
}
