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
import { MOVES, moveTiming, INSERT, RAISE, ASSEMBLE, PULSE_COLORS } from './page/client/moves.js';
import { THEMES } from './page/client/themes.js';
import { compile } from './sim/index.js';
import { createEngine } from './sim/engine.js';

export const ACTIONS = ['frame', 'focus', 'flip', 'set', 'flow', 'caption', 'value', 'probe', 'insert', 'raise', 'assemble', 'pulse', 'label', 'wait-until'];
// What a `value` or `wait-until` step reads from a part's reading, and its unit.
export const READINGS = { current: 'A', voltage: 'V', power: 'W', brightness: '%' };
export const FORMATS = ['vertical', 'horizontal'];
// The page's themes a recording can take; a video is on the stage by default (V4).
export { THEMES } from './page/client/themes.js';
const FRAMES = ['board', 'parts', 'here'];
// The move a step makes when it names none.
const DEFAULT_MOVE = { frame: 'arrival', set: 'hit', insert: 'arrival', raise: 'arrival', assemble: 'arrival', pulse: 'travel' };
const BREATH = MOVES.breath.min; // ms of rest that count as a breath between two hits

const warn = (code, params = {}) => ({ severity: 'warning', code, params });
const isText = (v) => typeof v === 'string' || (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((s) => typeof s === 'string'));
const texts = (v) => (typeof v === 'string' ? [v] : Object.values(v ?? {}));
const localized = (v, lang) => (v == null ? undefined : typeof v === 'string' ? v : (v[lang] ?? v.en ?? Object.values(v)[0]));
const num = (v) => typeof v === 'number' && Number.isFinite(v);

// The fields each action takes besides at, do, move, ms and curve: name → test. Every field but the
// required ones is optional; left out, a step does what the kit does by default
// (docs/en/timeline.md lists each one with its default).
const id = (v) => typeof v === 'string';
const ids = (v) => Array.isArray(v) && v.length > 0 && v.every(id);
const within = (lo, hi) => (v) => num(v) && v >= lo && v <= hi;
const oneOf = (...list) => (v) => list.includes(v);
const ENTER = oneOf('drop', 'fade', 'cut'); // how a part comes in
const WIRE = oneOf('draw', 'fade', 'cut'); // how a wire comes in
const SHOW = oneOf('rise', 'fade', 'cut'); // how a caption's lines come in
const color = (v) => Object.hasOwn(PULSE_COLORS, v) || (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v));
// An assemble's part: its id, or { part, enter, wire, from } for that one part.
const assembled = (v) => id(v) || (v && typeof v === 'object' && !Array.isArray(v) && id(v.part) && Object.keys(v).every((k) => ['part', 'enter', 'wire', 'from'].includes(k)) && (v.enter == null || ENTER(v.enter)) && (v.wire == null || WIRE(v.wire)) && (v.from == null || oneOf('start', 'end')(v.from)));
const FIELDS = {
  frame: { target: (v) => id(v) || ids(v), zoom: within(0.05, 20), pan: (v) => Array.isArray(v) && v.length === 2 && v.every(within(-3, 3)) },
  focus: { parts: (v) => Array.isArray(v) && v.every(id) },
  flip: { view: id },
  set: { part: id, field: id, value: (v) => num(v) || typeof v === 'boolean' },
  flow: { on: (v) => typeof v === 'boolean', ramp: within(0, 10_000) },
  caption: { text: isText, line: isText, off: (v) => v === true, enter: SHOW, in: within(0, 3000), stagger: within(0, 1000), out: within(0, 2000) },
  value: { part: id, field: (v) => Object.hasOwn(READINGS, v), label: isText, count: within(0, 5000), enter: SHOW, in: within(0, 3000) },
  probe: { part: id, node: id, field: oneOf('voltage', 'current'), off: (v) => v === true, title: isText, label: isText, note: isText },
  insert: { part: id, enter: ENTER, height: within(0, 40), dark: (v) => typeof v === 'boolean' },
  raise: { part: id, mm: within(0, RAISE.max) },
  assemble: { parts: (v) => Array.isArray(v) && v.length > 0 && v.every(assembled), gap: within(ASSEMBLE.min, ASSEMBLE.max), enter: ENTER, wire: WIRE, from: oneOf('start', 'end'), height: within(0, 40), dark: (v) => typeof v === 'boolean' },
  pulse: { through: ids, direction: oneOf('forward', 'back'), color, width: within(0.05, 1), size: within(1, 12) },
  label: { part: id, text: isText },
  'wait-until': { part: id, field: (v) => Object.hasOwn(READINGS, v), above: num, below: num, max: within(0, 60_000) },
};
const REQUIRED = { frame: ['target'], focus: ['parts'], flip: ['view'], set: ['part', 'field', 'value'], flow: ['on'], value: ['part', 'field'], insert: ['part'], raise: ['part'], label: ['part', 'text'], 'wait-until': ['part', 'field'] };
// Texts a step may carry, plain or one per language.
const TEXTS = ['text', 'line', 'label', 'title', 'note'];
// A cubic-bezier of CSS: the time coordinates between 0 and 1.
const isCurve = (v) => Array.isArray(v) && v.length === 4 && v.every(num) && v[0] >= 0 && v[0] <= 1 && v[2] >= 0 && v[2] <= 1 && v.every(within(-3, 4));

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
      } else if (key === 'curve') {
        if (!isCurve(v)) out.push(warn('TOUR_FIELD', { step, field: 'curve' }));
      } else if (!fields[key] || !fields[key](v)) out.push(warn('TOUR_FIELD', { step, field: key.slice(0, 40) }));
    }
    for (const key of REQUIRED[s.do] ?? []) if (s[key] == null) out.push(warn('TOUR_FIELD', { step, field: key }));
    if (s.do === 'probe' && [s.part, s.node, s.off].filter((x) => x != null).length !== 1) out.push(warn('TOUR_FIELD', { step, field: 'part' }));
    if (s.do === 'wait-until' && (s.above == null) === (s.below == null)) out.push(warn('TOUR_FIELD', { step, field: 'above' }));
    if (s.do === 'caption' && (s.text == null) === (s.off == null)) out.push(warn('TOUR_FIELD', { step, field: 'text' }));
    if (s.do === 'assemble' && s.ms != null && !(s.ms >= 0 && s.ms <= 5000)) out.push(warn('TOUR_FIELD', { step, field: 'ms' }));
    for (const key of TEXTS) {
      const long = texts(s[key]).find((x) => x.length > LIMITS.tourText);
      if (long) out.push(warn('TOUR_TEXT_TOO_LONG', { step, size: long.length, limit: LIMITS.tourText }));
    }
  });
  return out;
}

// When each step's move ends, in ms from the start.
// An assemble lasts as long as its parts take, one `gap` after the other (all of the circuit's by default).
const ends = (s, count = 0) => s.at + (s.do === 'assemble' ? Math.max(0, (s.parts?.length ?? count) - 1) * (s.gap ?? ASSEMBLE.gap) + (s.ms ?? ASSEMBLE.ms) : timing(s).ms);
const moveOf = (s) => s.move ?? DEFAULT_MOVE[s.do] ?? 'cut';
const timing = (s) => (s.do === 'frame' || s.do === 'set' || s.do === 'insert' || s.do === 'raise' || s.do === 'pulse' || s.move ? moveTiming(moveOf(s), s.ms ?? (s.do === 'insert' ? INSERT.ms : undefined)) : { ms: 0 });

const VALUE_READ = 1000; // ms a value stays before a caption may take it away

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
    const named = [s.part, ...(s.do === 'focus' ? s.parts : []), ...(s.do === 'assemble' ? (s.parts ?? []).map((p) => (typeof p === 'string' ? p : p.part)) : []), ...(s.do === 'frame' ? [s.target].flat().filter((x) => !FRAMES.includes(x)) : [])].filter((x) => x != null);
    for (const id of named) if (!ids.has(id)) out.push(warn('TOUR_UNKNOWN_PART', { step, part: id }));
    if (s.do === 'set' && ids.has(s.part) && !controlsOf().some((c) => c.id === s.part && c.field === s.field)) {
      out.push(warn('TOUR_UNKNOWN_CONTROL', { step, part: s.part, field: s.field, options: controlsOf().filter((c) => c.id === s.part).map((c) => c.field).join(', ') || '—' }));
    }
    const m = MOVES[moveOf(s)];
    if (s.ms != null && m && s.do !== 'assemble' && (s.ms < m.min || s.ms > m.max)) out.push(warn('TOUR_MOVE_MS', { step, move: moveOf(s), ms: s.ms, min: m.min, max: m.max }));
    const last = ends(s, (circuit?.parts ?? []).length);
    if (last > LIMITS.tourMs) out.push(warn('TOUR_TOO_LONG', { step, size: Math.round(last), limit: LIMITS.tourMs }));
  });
  // The rhythm: never two slow moves in a row, never two hits without a breath between them.
  const moving = steps.map((s, i) => ({ s, step: i + 1, move: moveOf(s) })).filter((x) => timing(x.s).ms > 0 || x.move === 'hit').sort((a, b) => a.s.at - b.s.at || a.step - b.step);
  for (let k = 1; k < moving.length; k++) {
    const [a, b] = [moving[k - 1], moving[k]];
    if (a.move === 'push' && b.move === 'push') out.push(warn('TOUR_RHYTHM_SLOW', { step: b.step, before: a.step }));
    if (a.move === 'hit' && b.move === 'hit' && b.s.at - ends(a.s) < BREATH) out.push(warn('TOUR_RHYTHM_HIT', { step: b.step, before: a.step, ms: BREATH }));
  }
  // A value shows until the next caption: one that comes within a second leaves it unread.
  const ordered = steps.map((s, i) => ({ s, step: i + 1 })).sort((a, b) => a.s.at - b.s.at || a.step - b.step);
  ordered.forEach((v, k) => {
    if (v.s.do !== 'value') return;
    const next = ordered.slice(k + 1).find((x) => x.s.do === 'caption');
    if (next && next.s.at - v.s.at < VALUE_READ) out.push(warn('TOUR_VALUE_HIDDEN', { step: v.step, caption: next.step, ms: VALUE_READ }));
  });
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
      for (const key of TEXTS) if (s[key] != null) out[key] = localized(s[key], lang);
      return out;
    });
  return { tour: { format: raw.format ?? 'vertical', theme: raw.theme ?? 'stage', steps }, issues: [...issues, ...meaning] };
}
