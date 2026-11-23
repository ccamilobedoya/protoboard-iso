// What layout's answer says besides the placement, when the circuit was built (DONE or WARNINGS):
// the readings at rest (the simulator's DC point), each board's program as stored, and what the
// recipe it came from lets change, with the current values and their limits. One call is then
// enough for an assistant to tell the user what the circuit does, show the sketch and offer only
// changes the kit accepts, every number taken from the kit (docs/en/layout.md, "The answer").
//
//   answerExtras(circuit, { folder, lang, advise }) → { readings?, behaviour?, programs?, changeable?, advice? }
//   formatExtras(r, lang, t) → lines for formatLayout, before its STATUS line
//
// Two lines come before the readings: `Solved` (r.solved, from autoLayout: the values a goal chose,
// the simulated result, how far from the goal and the neighbouring standard values) and `Worth checking` (the
// advisory: a part of a goal above its rated value as built, and the value that would bring it
// under; information only, nothing is changed).
// `Behaviour, first 2 s` follows the readings for a circuit that changes by itself (a board's program,
// a 555, a generator, an op-amp beside a capacitor; sim/run.js behaviourOf): what each output did in a
// bounded run, its frequency and duty when it toggles. The run stops at BEHAVIOUR_MS of the machine's
// time, and the line then says it was not measured and how to measure it.

import { simulate, compile, restingStates } from './sim/index.js';
import { readBeside, programFile, CIRCUIT_FOLDER } from './beside.js';
import { LIMITS } from './limits.js';
import { RECIPES, recipeDefaults, valueLimits } from './recipes/index.js';
import { goalsOf } from './recipes/goals.js';
import { adviseGoals } from './recipes/solve.js';
import { formatValue } from './core/units.js';
import { behaviourOf, BEHAVIOUR_STEPS, gainsOf } from './sim/run.js';
import { decimalSeparator } from './i18n/index.js';

// Parts whose job is to be driven, by the simulator's kind: LEDs first, then the rest.
const LOADS = { LED: 'led', LEDS: 'leds', BZA: 'buzzer', MOT: 'motor', RLY: 'relay', LSR: 'laser' };
const SHOWN_LOADS = 4;
// Under this a load is off: what it carries is the model's leakage (an LED behind a transistor that
// is off reads some pA), which would read like a real current. The JSON keeps the number.
const OFF_CURRENT = 1e-6;

const runsProgram = (p) => p?.program != null && p.program !== '';

// The DC point as a few numbers: the sources, then the loads with their current (and an LED's
// brightness). Null when it would say nothing true about the circuit: no source, no DC point, a
// board running a program (the program decides what is lit, not the rest point at time zero), a
// generator (its signal is the point, not the value it has at rest), or a page that hides the
// results (page.simulation or page.results false: a value a learner must predict first).
const hidden = (circuit) => circuit.page?.simulation === false || circuit.page?.results === false;

// A timer wired as an astable: the circuit never rests, so one instant of it is not "at rest". Read
// from the compiled circuit's own connections, no simulation: a timer (kind TMR) whose TRIG and THR
// are on one net with a capacitor, and whose DIS or OUT is on that net or one resistor away from it
// (the capacitor then charges and discharges between the 1/3 and 2/3 thresholds by itself: the
// datasheet's astable, with DIS through R2 or OUT through one resistor). A timer wired otherwise (a
// monostable, a latch, a threshold detector) keeps its readings.
export function oscillatesBy(program) {
  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) === x) return x;
    const root = find(parent.get(x));
    parent.set(x, root);
    return root;
  };
  const devices = program.devices ?? [];
  for (const d of devices) if (d.kind === 'W' && d.pins?.length === 2) parent.set(find(d.pins[0].node), find(d.pins[1].node));
  const net = (d, name) => {
    const pin = d.pins.find((p) => p.name === name);
    return pin ? find(pin.node) : null;
  };
  const touches = (type, node) => devices.filter((d) => d.type === type && d.pins.some((p) => find(p.node) === node));
  return devices.some((d) => {
    if (d.kind !== 'TMR') return false;
    const timing = net(d, 'THR');
    if (timing == null || timing !== net(d, 'TRIG') || !touches('capacitor', timing).length) return false;
    const reaches = (node) => node === timing || touches('resistor', timing).some((r) => r.pins.some((p) => find(p.node) === node));
    return reaches(net(d, 'DIS')) || reaches(net(d, 'OUT'));
  });
}

function readingsOf(circuit) {
  if (hidden(circuit)) return null;
  if ((circuit.parts ?? []).some(runsProgram)) return null;
  if ((circuit.supplies ?? []).some((s) => s?.kind === 'generator')) return null;
  const compiled = compile(circuit);
  if (!compiled.fatal && oscillatesBy(compiled.program)) return null;
  const r = simulate(circuit);
  if (!r.ok) return null;
  const rest = readingFrom(r);
  if (!rest) return null;
  // Nothing that lights or moves: the voltage of each net that is not a rail is what the circuit is
  // for (a divider's 3.33 V), so the line says those instead.
  if (!rest.parts.length && !compiled.fatal) rest.nets = netVoltages(compiled.program, r);
  // Two resting states (a latch): the point at rest is a balance between them; each is said instead.
  const two = compiled.fatal ? null : restingStates(circuit, compiled);
  if (!two) return rest;
  return { ...rest, states: two.states.map((s) => ({ ...readingFrom(s.reading), gains: gainsOf(s.reading) })) };
}

// Each net of the compiled circuit that is not ground or a supply's rail, with the pins on it (wires
// left out, nodes they join as one) and its voltage at rest, in the order the parts come.
const SHOWN_NETS = 4;
function netVoltages(program, r) {
  const parent = new Map();
  const find = (x) => (parent.has(x) && parent.get(x) !== x ? find(parent.get(x)) : x);
  for (const d of program.devices ?? []) if (d.kind === 'W' && d.pins?.length === 2) {
    const [a, b] = d.pins.map((p) => find(p.node));
    if (a !== b) parent.set(a, b);
  }
  const rails = new Set([program.ground, ...(program.supplies ?? []).flatMap((x) => [x.p, x.n])].map(find));
  const nets = new Map();
  for (const d of program.devices ?? []) {
    if (d.kind === 'W' || d.unsupported) continue;
    for (const p of d.pins) {
      const net = find(p.node);
      if (rails.has(net) || r.nodes?.[p.node] == null) continue;
      if (!nets.has(net)) nets.set(net, { pins: [], voltage: r.nodes[p.node] });
      nets.get(net).pins.push(`${d.id}.${p.name}`);
    }
  }
  return [...nets.values()].filter((n) => n.pins.length > 1 || nets.size === 1);
}

// A reading's sources and loads, as the Readings line says them.
function readingFrom(r) {
  const sources = Object.entries(r.supplies ?? {}).map(([id, s]) => ({ id, kind: s.kind === 'battery' ? 'battery' : 'supply', voltage: s.voltage, current: s.current, ...(s.written < 0 && { named: s.named, high: s.high }) }));
  const leds = [];
  const others = [];
  // A battery part is also one of the supplies the simulation reports: each source is said once.
  const listed = new Set(sources.map((s) => s.id));
  for (const [id, p] of Object.entries(r.parts ?? {})) {
    if (p.kind === 'BAT' && listed.has(id)) sources.splice(sources.findIndex((s) => s.id === id), 1);
    if (p.kind === 'BAT') sources.push({ id, kind: 'battery', part: true, voltage: p.on ? p.voltage : 0, current: p.on ? p.current : 0, ...(!p.on && { off: true }) });
    else if (p.kind === 'MCU' && p.usb) sources.push({ id, kind: 'usb', voltage: p.usb.voltage, current: p.usb.current });
    else if (LOADS[p.kind]) {
      const current = Math.abs(p.current ?? 0);
      (p.kind.startsWith('LED') ? leds : others).push({ id, kind: LOADS[p.kind], current, ...(current < OFF_CURRENT && { off: true }), ...(p.kind === 'LED' && { brightness: p.brightness }) });
    }
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
  const values = Object.entries(recipe.values)
    .filter(([, v]) => v.field)
    .map(([id, v]) => {
      const value = v.field === 'program' ? null : (items.get(id)?.[v.field] ?? defaults[id] ?? null);
      return { id, field: v.field, value, ...(v.role && { role: text(v.role, lang) }), ...(v.min !== undefined && { min: v.min }), ...(v.max !== undefined && { max: v.max }), ...(v.choices && { choices: v.choices }) };
    });
  // The goals it offers, after the values: what to ask for a result instead of a value.
  const goals = goalsOf(recipe).map((g) => ({ id: g.id, goal: g.goal, set: g.set, example: { [g.id]: { [g.goal]: g.example } } }));
  return [...values, ...goals];
}

// The advisory, for a recipe's circuit built with its values (no goal in the call) whose readings
// are not hidden from a learner.
function adviceOf(circuit) {
  const recipe = RECIPES[circuit.spec?.recipe?.name];
  if (!recipe || hidden(circuit)) return null;
  const goals = goalsOf(recipe);
  if (!goals.length) return null;
  const list = adviseGoals(circuit, goals);
  return list.length ? list : null;
}

const BEHAVIOUR_S = 2;
const SHOWN_OUTPUTS = 4;
function behaviourLineOf(circuit) {
  if (hidden(circuit)) return null;
  const b = behaviourOf(circuit, { seconds: BEHAVIOUR_S });
  if (!b) return null;
  if (b.skipped) return { seconds: b.seconds, skipped: b.skipped };
  // What a person sees first: the parts, then the pins a program drives.
  const outputs = [...b.outputs.filter((o) => o.kind !== 'pin'), ...b.outputs.filter((o) => o.kind === 'pin')];
  return { seconds: b.seconds, start: b.start, outputs: outputs.map(({ intervals, intervalsTotal, ...o }) => o) };
}

// The supplies written with a negative voltage: one line in the answer says the rail named + is the
// lower one (the readings name the voltage as written, −5 V).
function negativeOf(circuit) {
  const list = (circuit.supplies ?? []).map((s, i) => ({ id: s?.id ?? `V${i + 1}`, voltage: Number(s?.voltage) })).filter((s) => s.voltage < 0);
  if (!list.length) return null;
  const compiled = compile(circuit);
  if (compiled.fatal) return null;
  return list.map((s) => ({ ...s, ...(({ named, high }) => ({ named, high }))(compiled.program.supplies.find((x) => x.id === s.id) ?? {}) }));
}

export function answerExtras(circuit, { folder, lang = 'en', advise = true } = {}) {
  const readings = readingsOf(circuit);
  const negative = negativeOf(circuit);
  // The run reads a board's .ino from the circuit's folder, as the review did.
  const where = folder ?? circuit[CIRCUIT_FOLDER];
  const seen = where && circuit[CIRCUIT_FOLDER] !== where ? Object.defineProperty({ ...circuit }, CIRCUIT_FOLDER, { value: where, enumerable: false }) : circuit;
  const behaviour = behaviourLineOf(seen);
  const programs = programsOf(circuit, folder ?? circuit[CIRCUIT_FOLDER]);
  const changeable = changeableOf(circuit, lang);
  const advice = advise && readings ? adviceOf(circuit) : null;
  return { ...(advice && { advice }), ...(negative && { negative }), ...(readings && { readings }), ...(behaviour && { behaviour }), ...(programs && { programs }), ...(changeable && { changeable }) };
}

// The unit a recipe's numeric value is in, by its field (a resistor's "330" carries its own).
const FIELD_UNITS = { voltage: 'V', amplitude: 'V', frequency: 'Hz' };

const KNOB_UNITS = { resistor: 'Ω', capacitor: 'F' };

// How far a result is from its goal, in words: "3 % over", "0.4 % under", "on the goal".
function offBy(error, lang, t, decimal) {
  const percent = Math.abs(error) * 100;
  if (percent < 0.05) return t(lang, 'layout.solved.exact');
  const shown = percent < 0.5 ? percent.toFixed(1).replace('.', decimal) : String(Math.round(percent));
  return t(lang, error > 0 ? 'layout.solved.over' : 'layout.solved.under', { percent: shown });
}

// The state a goal is about: "S1 pressed", "RV1 at 100 %" (a control without words: "S1 on = false").
const WHEN_WORDS = new Set(['pressed', 'slid', 'tilted', 'position']);
function stateOf(when, lang, t) {
  const items = Object.entries(when ?? {}).flatMap(([id, fields]) =>
    Object.entries(fields).map(([field, v]) => (WHEN_WORDS.has(field) && (v === true || field === 'position') ? t(lang, `layout.when.${field}`, { id, percent: Math.round(v * 100) }) : `${id} ${field} = ${v}`)),
  );
  return items.length ? t(lang, 'layout.when', { items: items.join(', ') }) : '';
}

function solvedLine(s, lang, t, f, decimal) {
  const knob = (v) => f(v.value, KNOB_UNITS[v.type]);
  const values = s.values.map((v) => `${v.id} = ${knob(v)}`).join(', ');
  const series = [...new Set(s.values.map((v) => v.series))].join(', ');
  const kept = s.kept?.length ? t(lang, 'layout.solved.kept', { items: s.kept.map((v) => `${v.id} = ${knob(v)}`).join(', ') }) : '';
  const reach = s.reachable ? '' : t(lang, 'layout.solved.reach', { range: s.range.map((x) => t(lang, 'layout.solved.range', { id: x.id, lo: f(x.lo, KNOB_UNITS[x.type]), hi: f(x.hi, KNOB_UNITS[x.type]) })).join(', ') });
  const one = s.values.length === 1;
  const neighbour = (n) => `${s.values.map((v) => `${one ? '' : `${v.id} = `}${knob({ ...v, value: n.values[v.id] })}`).join(', ')} ${f(n.result, s.unit)}`;
  const next = s.neighbours.length ? t(lang, 'layout.solved.next', { items: s.neighbours.map(neighbour).join(' · ') }) : '';
  return t(lang, 'layout.solved', { values, series: `${series}${kept}`, part: s.id, target: f(s.target, s.unit), when: stateOf(s.when, lang, t), result: f(s.result, s.unit), off: offBy(s.error, lang, t, decimal), reach, next });
}

function adviceLine(a, lang, t, f) {
  const unit = KNOB_UNITS[a.knob.type];
  return t(lang, 'layout.advice', { part: a.id, percent: Math.round((a.value / a.rated) * 100), rated: f(a.rated, a.unit), when: stateOf(a.when, lang, t), knob: a.knob.id, value: f(a.knob.value, unit), suggest: f(a.suggest.value, unit), result: f(a.suggest.result, a.unit) });
}

export function formatExtras(r, lang, t) {
  const decimal = decimalSeparator(lang);
  const f = (v, unit) => formatValue(v, unit, { decimal });
  const lines = [];
  for (const s of r.solved ?? []) lines.push(solvedLine(s, lang, t, f, decimal));
  for (const a of r.advice ?? []) lines.push(adviceLine(a, lang, t, f));
  for (const n of r.negative ?? []) lines.push(t(lang, 'layout.negativeSupply', { id: n.id, voltage: f(n.voltage, 'V'), named: n.named, high: n.high }));
  if (r.readings) {
    const itemsOf = ({ sources, parts, nets }) => {
      const many = sources.length > 1;
      // A drawn battery is named by its id (BT1), as the parts are; a bench supply only when there are several.
      const source = (s) => (s.kind === 'usb' ? `${s.id} USB ${f(s.voltage, 'V')}` : `${t(lang, `layout.readings.${s.kind}`)}${many || s.part ? ` ${s.id}` : ''} ${s.off ? t(lang, 'sim.battery.off') : f(s.voltage, 'V')}`);
      const load = (p) => `${p.id} ${p.off ? '0 mA' : f(p.current, 'A')}${p.brightness != null ? `, ${t(lang, 'sim.brightness', { percent: Math.round(p.brightness * 100) })}` : ''}`;
      const items = [...sources.map(source), ...parts.slice(0, SHOWN_LOADS).map(load)];
      if (parts.length > SHOWN_LOADS) items.push(t(lang, 'layout.readings.more', { count: parts.length - SHOWN_LOADS }));
      for (const n of (nets ?? []).slice(0, SHOWN_NETS)) items.push(`${n.pins.join(' = ')} ${f(n.voltage, 'V')}`);
      if (nets?.length > SHOWN_NETS) items.push(t(lang, 'layout.readings.moreNets', { count: nets.length - SHOWN_NETS }));
      return items;
    };
    if (r.readings.states) {
      // Two resting states: each with its transistors on or off, then its readings; the point at rest
      // between them is not said as a reading (a real circuit never sits there).
      lines.push(t(lang, 'layout.states'));
      r.readings.states.forEach((s, k) => {
        const gains = s.gains.map((g) => t(lang, g.on ? 'layout.states.on' : 'layout.states.off', { id: g.id })).join(', ');
        lines.push(`  ${k + 1}. ${[gains, ...itemsOf(s)].join(' · ')}`);
      });
    } else lines.push(t(lang, 'layout.readings', { items: itemsOf(r.readings).join(' · ') }));
  }
  if (r.behaviour) lines.push(behaviourText(r.behaviour, lang, t, f));
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
    const item = (c) => (c.goal ? t(lang, 'layout.changeable.goal', { id: c.id, goal: c.goal, example: JSON.stringify(c.example) }) : `${c.id} = ${value(c)}${valueLimits(c, decimal)}${c.role && c.field !== 'program' ? ` (${c.role})` : ''}`);
    const items = r.changeable.map(item);
    lines.push(t(lang, 'layout.changeable', { items: items.join(' · ') }));
  }
  return lines;
}

// A passive buzzer in the Behaviour line: its beeps and its tone apart ("BZ1 beeps 2 Hz, sounding
// 20 % of the time, tone 2 kHz"); silent on a steady current.
function soundItem(o, lang, t, f) {
  const s = o.sound;
  const tone = o.tone ? t(lang, 'layout.behaviour.tone', { frequency: f(o.tone.frequency, 'Hz') }) : '';
  if (s.frequency) return t(lang, 'layout.behaviour.beeps', { id: o.id, frequency: f(s.frequency, 'Hz'), percent: Math.round(100 * (s.duty ?? s.onShare)), tone });
  if (!s.changes) return s.onShare > 0.5 ? t(lang, 'layout.behaviour.sounds', { id: o.id, tone }) : t(lang, o.onShare > 0 ? 'layout.behaviour.click' : 'layout.behaviour.silent', { id: o.id });
  return t(lang, 'layout.behaviour.soundShare', { id: o.id, percent: Math.round(100 * s.onShare), starts: s.starts, tone });
}

// "Behaviour, first 2 s (simulated): D1 1 Hz, on 50 % of the time · U1.D13 1 Hz, on 50 % of the time".
function behaviourText(b, lang, t, f) {
  const seconds = f(b.seconds, 's');
  if (b.skipped) {
    const why = b.skipped.code === 'RUN_STEPS' ? t(lang, 'layout.behaviour.steps', { steps: String(BEHAVIOUR_STEPS).replace(/\B(?=(\d{3})+$)/g, ' ') })
      : b.skipped.code === 'RUN_BUDGET' ? t(lang, 'layout.behaviour.slow', { budget: f(LIMITS.runMs / 1000, 's') }) : t(lang, 'layout.behaviour.failed', { time: b.skipped.params?.time ? f(b.skipped.params.time.value, 's') : '0 s' });
    return t(lang, 'layout.behaviour.skipped', { seconds, why, run: String(b.seconds) });
  }
  const item = (o) => {
    if (o.sound) return soundItem(o, lang, t, f);
    const percent = Math.round(100 * (o.duty ?? o.onShare));
    if (o.frequency && o.about) return t(lang, 'layout.behaviour.rhythmAbout', { id: o.id, frequency: formatValue(Number(o.frequency.toPrecision(2)), 'Hz', { decimal: decimalSeparator(lang) }), percent });
    if (o.frequency) return t(lang, 'layout.behaviour.rhythm', { id: o.id, frequency: f(o.frequency, 'Hz'), percent });
    if (!o.changes) return t(lang, o.onShare > 0.5 ? 'layout.behaviour.on' : 'layout.behaviour.off', { id: o.id });
    return t(lang, 'layout.behaviour.share', { id: o.id, percent: Math.round(100 * o.onShare), changes: o.changes });
  };
  const items = b.outputs.slice(0, SHOWN_OUTPUTS).map(item);
  if (b.outputs.length > SHOWN_OUTPUTS) items.push(t(lang, 'layout.behaviour.more', { count: b.outputs.length - SHOWN_OUTPUTS }));
  return t(lang, 'layout.behaviour', { seconds, start: t(lang, `layout.behaviour.start.${b.start === 'zero' ? 'zero' : 'dc'}`), items: items.length ? items.join(' · ') : t(lang, 'layout.behaviour.none') });
}
