// What layout's answer says besides the placement, when the circuit was built (DONE or WARNINGS):
// the readings at rest (the simulator's DC point), each board's program as stored, and what the
// recipe it came from lets change, with the current values and their limits. One call is then
// enough for an assistant to tell the user what the circuit does, show the sketch and offer only
// changes the kit accepts, every number taken from the kit (docs/en/layout.md, "The answer").
//
//   answerExtras(circuit, { folder, lang }) → { readings?, programs?, changeable? }
//   formatExtras(r, lang, t) → lines for formatLayout, before its STATUS line

import { simulate } from './sim/index.js';
import { readBeside, programFile, CIRCUIT_FOLDER } from './beside.js';
import { LIMITS } from './limits.js';
import { RECIPES, recipeDefaults, valueLimits } from './recipes/index.js';
import { formatValue } from './core/units.js';
import { decimalSeparator } from './i18n/index.js';

// Parts whose job is to be driven, by the simulator's kind: LEDs first, then the rest.
const LOADS = { LED: 'led', LEDS: 'leds', BZA: 'buzzer', MOT: 'motor', RLY: 'relay', LSR: 'laser' };
const SHOWN_LOADS = 4;

const runsProgram = (p) => p?.program != null && p.program !== '';

// The DC point as a few numbers: the sources, then the loads with their current (and an LED's
// brightness). Null when it would say nothing true about the circuit: no source, no DC point, a
// board running a program (the program decides what is lit, not the rest point at time zero), a
// generator (its signal is the point, not the value it has at rest), or a page that hides the
// results (page.simulation or page.results false: a value a learner must predict first).
function readingsOf(circuit) {
  if (circuit.page?.simulation === false || circuit.page?.results === false) return null;
  if ((circuit.parts ?? []).some(runsProgram)) return null;
  if ((circuit.supplies ?? []).some((s) => s?.kind === 'generator')) return null;
  const r = simulate(circuit);
  if (!r.ok) return null;
  const sources = Object.entries(r.supplies ?? {}).map(([id, s]) => ({ id, kind: s.kind === 'battery' ? 'battery' : 'supply', voltage: s.voltage, current: s.current }));
  const leds = [];
  const others = [];
  for (const [id, p] of Object.entries(r.parts ?? {})) {
    if (p.kind === 'BAT') sources.push({ id, kind: 'battery', voltage: p.on ? p.voltage : 0, current: p.on ? p.current : 0, ...(!p.on && { off: true }) });
    else if (p.kind === 'MCU' && p.usb) sources.push({ id, kind: 'usb', voltage: p.usb.voltage, current: p.usb.current });
    else if (LOADS[p.kind]) (p.kind.startsWith('LED') ? leds : others).push({ id, kind: LOADS[p.kind], current: Math.abs(p.current ?? 0), ...(p.kind === 'LED' && { brightness: p.brightness }) });
  }
  return sources.length ? { sources, parts: [...leds, ...others] } : null;
}

// Output caps, not input caps (those are in limits.js): a long sketch would push the rest of the
// answer out of a chat, while its first lines say what it does and the whole text is one call away.
const PROGRAM_LINES = 80;
const PROGRAM_CHARS = 4000;
const PROGRAM_HEAD = 40;
// Every character a reader may take for the end of a line, so no line of a sketch can start the
// answer's next line (a fake STATUS: line; test/attack.test.js).
// biome-ignore lint/suspicious/noControlCharactersInRegex: the separators \x1c to \x1e end a line for some readers (Python's splitlines)
export const LINE_BREAK = /\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/;

// Each board's program as stored: the sketch's text, or the .ino file beside the circuit (read
// through beside.js, inside its folder only). A file that cannot be read is left out: the
// simulator's own issue (SIM_PROGRAM_*) says why.
function programsOf(circuit, folder) {
  const out = [];
  for (const p of circuit.parts ?? []) {
    if (!runsProgram(p)) continue;
    let text = String(p.program);
    const file = programFile(text);
    if (file) {
      const read = readBeside(folder ? { [CIRCUIT_FOLDER]: folder } : circuit, file, LIMITS.sketchChars);
      if (read.error) continue;
      text = read.text;
    }
    const lines = text.split(LINE_BREAK);
    if (lines.length > 1 && lines.at(-1) === '') lines.pop();
    const fits = lines.length <= PROGRAM_LINES && text.length <= PROGRAM_CHARS;
    const shown = [];
    let size = 0;
    for (const line of fits ? lines : lines.slice(0, PROGRAM_HEAD)) {
      size += line.length + 1;
      if (!fits && size > PROGRAM_CHARS) break;
      shown.push(line);
    }
    out.push({ part: p.id, text: shown.join('\n'), truncated: !fits, ...(file && { file }), ...(!fits && { omitted: lines.length - shown.length }) });
  }
  return out.length ? out : null;
}

const text = (v, lang) => (v && typeof v === 'object' ? (v[lang] ?? v.en) : v);

// What the recipe the circuit came from lets change: each value with its current setting (from
// the circuit, so the values it was laid out with), its role and its limits. Null for a circuit
// that is not a recipe's.
function changeableOf(circuit, lang) {
  const recipe = RECIPES[circuit.spec?.recipe?.name];
  if (!recipe) return null;
  const items = new Map([...(circuit.parts ?? []).map((p) => [p.id, p]), ...(circuit.supplies ?? []).map((s) => [s.id, s])]);
  const defaults = recipeDefaults(recipe);
  return Object.entries(recipe.values).map(([id, v]) => {
    const value = v.field === 'program' ? null : (items.get(id)?.[v.field] ?? defaults[id] ?? null);
    return { id, field: v.field, value, ...(v.role && { role: text(v.role, lang) }), ...(v.min !== undefined && { min: v.min }), ...(v.max !== undefined && { max: v.max }), ...(v.choices && { choices: v.choices }) };
  });
}

export function answerExtras(circuit, { folder, lang = 'en' } = {}) {
  const readings = readingsOf(circuit);
  const programs = programsOf(circuit, folder ?? circuit[CIRCUIT_FOLDER]);
  const changeable = changeableOf(circuit, lang);
  return { ...(readings && { readings }), ...(programs && { programs }), ...(changeable && { changeable }) };
}

// The unit a recipe's numeric value is in, by its field (a resistor's "330" carries its own).
const FIELD_UNITS = { voltage: 'V', amplitude: 'V', frequency: 'Hz' };

export function formatExtras(r, lang, t) {
  const decimal = decimalSeparator(lang);
  const f = (v, unit) => formatValue(v, unit, { decimal });
  const lines = [];
  if (r.readings) {
    const { sources, parts } = r.readings;
    const many = sources.length > 1;
    const source = (s) => (s.kind === 'usb' ? `${s.id} USB ${f(s.voltage, 'V')}` : `${t(lang, `layout.readings.${s.kind}`)}${many ? ` ${s.id}` : ''} ${s.off ? t(lang, 'sim.battery.off') : f(s.voltage, 'V')}`);
    const load = (p) => `${p.id} ${f(p.current, 'A')}${p.brightness != null ? `, ${t(lang, 'sim.brightness', { percent: Math.round(p.brightness * 100) })}` : ''}`;
    const items = [...sources.map(source), ...parts.slice(0, SHOWN_LOADS).map(load)];
    if (parts.length > SHOWN_LOADS) items.push(t(lang, 'layout.readings.more', { count: parts.length - SHOWN_LOADS }));
    lines.push(t(lang, 'layout.readings', { items: items.join(' · ') }));
  }
  for (const p of r.programs ?? []) {
    lines.push(t(lang, 'layout.program', { part: p.part }));
    for (const line of p.text.split('\n')) lines.push(line ? `  ${line}` : '');
    if (p.truncated) lines.push(`  ${t(lang, p.file ? 'layout.programCutFile' : 'layout.programCut', { count: p.omitted, file: p.file })}`);
  }
  if (r.changeable) {
    const value = (c) => {
      if (c.field === 'program') return t(lang, 'layout.changeable.sketch');
      const shown = typeof c.value === 'number' ? String(c.value).replace('.', decimal) : String(c.value ?? '—');
      return FIELD_UNITS[c.field] && typeof c.value === 'number' ? `${shown} ${FIELD_UNITS[c.field]}` : shown;
    };
    const items = r.changeable.map((c) => `${c.id} = ${value(c)}${valueLimits(c, decimal)}${c.role && c.field !== 'program' ? ` (${c.role})` : ''}`);
    lines.push(t(lang, 'layout.changeable', { items: items.join(' · ') }));
  }
  return lines;
}
