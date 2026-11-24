// The computed fix of a circuit's hazards: the simplest change the kit's own simulator finds that
// clears every hazard in every state the hazard check solves (sim/index.js checkHazards), said as
// information. Nothing is changed: review and layout print it (docs/en/simulation.md, "The fix").
//
//   hazardFix(circuit, hazards) → { fix: { kind, part?, with?, pin?, value, brings } } | { fix: null, noFix: true }
//
// Candidates, in this order, the first that clears every hazard wins:
//   1 'set'         a new value for a resistor already in series with the stressed part or branch
//                   (the part itself when it is a resistor): `part`, `value`
//   'resupply'    first, for a logic input over its chip's supply: the chip fed from a rail at the
//                 signals' voltage (tryResupply): `part`, `pin`, `rail` or `supply`, `voltage`
//   2 'add-series'  one new resistor in series with the stressed part, or with each load on a
//                   board's pin (`with`: the part, `pin`: where it goes, "BZ1.1"), or with the pin
//                   itself: `value`
// The value is searched in E24 from 10 Ω to 1 MΩ with the goal solver's sweep (recipes/solve.js,
// sweepResistor, in place on the compiled program), aiming the stressed quantity at its rated value
// where the part has one (an LED's 20 mA), otherwise at half of its maximum (a pin's 40 mA → 20 mA):
// the nearest result at or under the aim that clears every hazard (when the nearest does not, the
// next ones down, by bisection: a larger value limits more), else the most limiting value under the
// maximum. Only the values picked are checked in every state (about ten at most per candidate), at
// most CANDIDATES candidates. A new
// resistor is added to the compiled circuit, not to the layout: the pin is split from its net and
// the resistor (¼ W) joins them, so its own power is judged too: a change that only moves the
// damage is not a fix. `brings`: each hazard's quantity with the fix, in the state it was found in.

import { compile, createEngine, controlStates, engineHazards, enterState } from './sim/index.js';
import { BOARDS, supplyRails } from './board/board.js';
import { standardValues, valueText } from './core/units.js';
import { choose, sweepResistor } from './recipes/solve.js';
import { LED_LIT } from './sim/models.js';

const CANDIDATES = 6;
const VERIFIED = 8; // bisection steps over the values under the aim (121 values: 7)
const VALUES = standardValues('E24', 10, 1e6);
const ADDED = 'FIX'; // the id of the resistor a candidate adds (never shown)
const ADDED_POWER = 0.25;
// The rated value of a quantity, by the field of the part's model that holds it.
const RATED = { current: 'ratedCurrent' };
const BRANCH_STEPS = 4; // parts walked along a branch looking for its resistor

// Nets of the compiled circuit: nodes joined by jumpers (devices of kind W) are one.
function netsOf(program) {
  const parent = new Map();
  const find = (n) => {
    let x = n;
    while (parent.has(x) && parent.get(x) !== x) x = parent.get(x);
    return x;
  };
  for (const d of program.devices) if (d.kind === 'W' && d.pins?.length === 2) {
    const [a, b] = d.pins.map((p) => find(p.node));
    if (a !== b) parent.set(a, b);
  }
  // Every lead on a net (wires left out), and the supplies clipped to it.
  const on = (net) => [
    ...program.devices.filter((d) => d.kind !== 'W').flatMap((d) => d.pins.filter((p) => find(p.node) === net).map((p) => ({ d, pin: p.name }))),
    ...program.supplies.filter((s) => find(s.p) === net || find(s.n) === net).map((s) => ({ supply: s.id })),
  ];
  return { find, on };
}

const isResistor = (d) => d?.type === 'resistor' && d.kind === 'R';
const twoLeads = (d) => d && !d.unsupported && d.pins.length === 2 && d.kind !== 'MCU';

// The stressed thing of a hazard: a part, or a board's pin ("U1.D10").
function subjectOf(program, hazard) {
  const [id, ...rest] = String(hazard.params.part).split('.');
  const d = program.devices.find((x) => x.id === id);
  return d ? { d, pin: rest.length ? rest.join('.') : null } : null;
}

// Walking a branch from a lead: while its net holds only this lead and one other part's, that part is
// in series; its other lead goes on. The resistors met and the first part met.
function branchFrom(nets, d, pin) {
  const resistors = [];
  let first = null;
  let at = { d, pin };
  for (let step = 0; step < BRANCH_STEPS; step++) {
    const node = at.d.pins.find((p) => p.name === at.pin)?.node;
    if (node == null) break;
    const others = nets.on(nets.find(node)).filter((x) => !(x.d === at.d && x.pin === at.pin));
    if (others.length !== 1 || !twoLeads(others[0].d)) break;
    const next = others[0];
    first ??= next;
    if (isResistor(next.d)) resistors.push(next.d.id);
    at = { d: next.d, pin: next.d.pins.find((p) => p.name !== next.pin).name };
  }
  return { resistors, first };
}

// The candidates for one hazard, in the order above.
function candidatesOf(program, nets, hazard) {
  const s = subjectOf(program, hazard);
  if (!s) return [];
  const sets = [];
  const adds = [];
  if (!s.pin && twoLeads(s.d)) {
    if (isResistor(s.d)) sets.push(s.d.id);
    for (const p of s.d.pins) sets.push(...branchFrom(nets, s.d, p.name).resistors);
    adds.push({ with: s.d.id, pin: `${s.d.id}.${s.d.pins[0].name}` });
  } else if (s.pin) {
    const lead = s.d.pins.find((p) => p.name === s.pin);
    if (!lead) return [];
    sets.push(...branchFrom(nets, s.d, s.pin).resistors);
    // Each load on the pin's net, then the pin itself.
    const loads = nets.on(nets.find(lead.node)).filter((x) => x.d && x.d !== s.d && twoLeads(x.d));
    for (const l of loads) adds.push({ with: l.d.id, pin: `${l.d.id}.${l.pin}` });
    adds.push({ with: hazard.params.part, pin: hazard.params.part });
  }
  return [...sets.map((part) => ({ kind: 'set', part })), ...adds.map((a) => ({ kind: 'add-series', ...a }))];
}

// The compiled program with a resistor added in series at a lead ("BZ1.1"): the lead goes to a new
// node, the resistor joins it to the net it left.
function withSeries(program, ref) {
  const out = structuredClone(program);
  const [id, ...rest] = ref.split('.');
  const lead = out.devices.find((d) => d.id === id)?.pins.find((p) => p.name === rest.join('.'));
  if (!lead) return null;
  const node = `~fix:${ref}`;
  out.nodes = [...out.nodes, node];
  out.members = { ...out.members, [node]: [id, ADDED] };
  out.devices.push({ id: ADDED, type: 'resistor', kind: 'R', pins: [{ name: '1', node: lead.node }, { name: '2', node }], params: { resistance: 1000, maxPower: ADDED_POWER } });
  lead.node = node;
  return out;
}

// The state a hazard was found in, from its `when` (a control's or a pin's), to enter on an engine.
const stateOf = (when) => (!when ? null : when.held ? { part: when.part, chips: when.chips, ...(when.pins && { pins: when.pins }) } : when.pin ? { part: when.part, pin: when.pin, value: when.value } : { part: when.part, field: when.field, value: when.value });

// A hazard's quantity on a DC reading: its stress (the same code, the same pin).
function quantityOf(engine, reading, hazard) {
  if (!reading?.ok) return null;
  const [id, ...rest] = String(hazard.params.part).split('.');
  const pin = rest.length ? rest.join('.') : undefined;
  return (engine.stresses(reading)[id] ?? []).find((x) => x.code === hazard.code && x.pin === pin) ?? null;
}

// Whether the part a hazard is about still does its job with the fix in place, in the state the
// hazard was found in: an LED is lit (LED_LIT of its rated current), a motor gets at least the
// bottom of its voltage range. A fix that clears the hazard by stopping the part is not a fix. Other
// parts have no such range in the model: they are not asked.
function stillWorks(found, hazards) {
  return hazards.every((h) => {
    const s = subjectOf(found.program, h);
    if (!s || !['LED', 'LEDS', 'MOT'].includes(s.d.kind)) return true;
    const engine = measurer(found.program, h);
    if (!engine || !engine.set(found.id, 'resistance', found.value)) return false;
    const reading = engine.dc();
    const part = reading.ok ? reading.parts[s.d.id] : null;
    if (!part) return false;
    if (s.d.kind === 'MOT') return Math.abs(part.voltage) >= (s.d.params.model.range?.[0] ?? 0);
    const lit = s.pin ? part.channels?.[s.pin] : part;
    return (lit?.brightness ?? 0) >= LED_LIT;
  });
}

// An unstarted engine of the program in the hazard's state, to read its quantity value by value.
function measurer(program, hazard) {
  const engine = createEngine(program);
  const state = stateOf(hazard.when);
  if (state && !enterState(engine, state)) return null;
  return engine;
}

// The aim of the search: the part's rated value, else half of its maximum.
function aimOf(program, hazard, stress) {
  const d = subjectOf(program, hazard)?.d;
  const rated = RATED[stress.quantity] && !subjectOf(program, hazard)?.pin ? d?.params?.model?.[RATED[stress.quantity]] : null;
  return rated > 0 && rated < stress.max ? rated : stress.max / 2;
}

// One candidate: the value that clears every hazard, or null.
function tryCandidate(base, candidate, hazards) {
  const program = candidate.kind === 'set' ? base : withSeries(base, candidate.pin);
  if (!program) return null;
  const id = candidate.kind === 'set' ? candidate.part : ADDED;
  const primary = hazards[0];
  const engine = measurer(program, primary);
  if (!engine) return null;
  let max = null;
  const read = (e) => {
    const s = quantityOf(e, e.dc(), primary);
    if (s) max = s.max;
    return s ? Math.abs(s.value) : NaN;
  };
  const all = sweepResistor(engine, createEngine(program), id, VALUES, read, { hazards: false });
  if (!all.length || !(max > 0)) return null;
  const aim = aimOf(program, primary, { quantity: quantityOf(engine, engine.dc(), primary)?.quantity, max });
  const check = createEngine(program);
  const states = controlStates(check.program(), check);
  const clears = (c) => check.set(id, 'resistance', c.value) && ((v) => v.ok && !v.hazards.length)(engineHazards(check, states));
  const found = (c) => {
    const f = { value: c.value, program, id };
    return stillWorks(f, hazards) ? f : null;
  };
  // The aim's side first: the results at or under it, nearest first (choose's pick leads). Further
  // down the list a value limits more, so the values that clear everything are its tail: the first
  // of them by bisection (a few checks, not one per value).
  const under = all.filter((c) => c.result <= aim * (1 + 1e-9)).sort((a, b) => b.result - a.result);
  if (under.length) {
    const pick = choose(under, aim, { under: true });
    const list = [pick, ...under.filter((c) => c !== pick)];
    if (clears(list[0])) return found(list[0]);
    let lo = 0;
    let hi = list.length - 1;
    if (hi === 0 || !clears(list[hi])) return null;
    for (let k = 0; k < VERIFIED && hi - lo > 1; k++) {
      const mid = (lo + hi) >> 1;
      if (clears(list[mid])) hi = mid;
      else lo = mid;
    }
    return hi - lo > 1 ? null : found(list[hi]);
  }
  // Nothing reaches the aim: the most limiting value under the maximum, if it clears everything.
  const over = all.filter((c) => c.result < max).sort((a, b) => a.result - b.result);
  return over.length && clears(over[0]) ? found(over[0]) : null;
}

// Each hazard's quantity with the fix in place, in the state it was found in.
function bringsOf(found, hazards) {
  return hazards.map((h) => {
    const engine = measurer(found.program, h);
    const s = engine && engine.set(found.id, 'resistance', found.value) ? quantityOf(engine, engine.dc(), h) : null;
    return { part: h.params.part, quantity: s?.quantity ?? null, value: s ? Math.abs(s.value) : null, max: s?.max ?? null, unit: s?.unit ?? null, ...(h.when && { when: h.when }) };
  });
}

// A part in backwards is turned round, never limited: a resistor in series with a buzzer wired the
// wrong way only silences it. For a reverse hazard (SIM_REVERSE_VOLTAGE) the candidates are the part
// with its two leads swapped, then each supply (a bench supply, a battery part) with its leads swapped;
// the first that clears every hazard in every state is the fix ('swap', 'swap-supply'). No series
// resistor is offered while a reverse hazard is left.
const isReverse = (h) => h.code === 'SIM_REVERSE_VOLTAGE';
function swapCandidates(program, hazards) {
  const out = [];
  for (const h of hazards.filter(isReverse)) {
    const s = subjectOf(program, h);
    if (s && !s.pin && s.d.pins.length === 2 && s.d.kind !== 'MCU' && h.params.variant !== 'pins') out.push({ kind: 'swap', part: s.d.id, pins: s.d.pins.map((p) => p.name) });
  }
  for (const x of program.supplies ?? []) if (x.id) out.push({ kind: 'swap-supply', supply: x.id });
  for (const d of program.devices) if (d.kind === 'BAT' && d.pins.length === 2) out.push({ kind: 'swap-supply', supply: d.id, part: true });
  return out.filter((c, k) => out.findIndex((x) => JSON.stringify(x) === JSON.stringify(c)) === k);
}
function swapped(program, c) {
  const out = structuredClone(program);
  if (c.kind === 'swap' || c.part) {
    const d = out.devices.find((x) => x.id === (c.part === true ? c.supply : c.part));
    const [a, b] = d.pins;
    [a.node, b.node] = [b.node, a.node];
  } else {
    const x = out.supplies.find((y) => y.id === c.supply);
    [x.p, x.n] = [x.n, x.p];
  }
  return out;
}
function trySwaps(program, hazards) {
  for (const c of swapCandidates(program, hazards)) {
    const changed = swapped(program, c);
    const engine = createEngine(changed);
    const r = engineHazards(engine, controlStates(changed, engine));
    if (!r.ok || r.hazards.length) continue;
    return c.kind === 'swap' ? { kind: 'swap', part: c.part, pins: c.pins } : { kind: 'swap-supply', supply: c.supply };
  }
  return null;
}

// A logic chip's input over its supply because the chip is fed less than the signals that drive it (a
// 74HC595 on 3.3 V driven by an UNO's 5 V pins): the chip's supply pin moved to a rail of the circuit
// at the signals' voltage (a board's 5V pin, a supply's +), within the chip's own supply range; the
// first that clears every hazard in every state is the fix ('resupply'). A circuit with no such rail
// has none: the warning's own sentence says what to do.
const isOverSupply = (h) => h.code === 'SIM_IC_PIN_VOLTAGE' && h.params.variant === 'fed';
const SUPPLY_PINS = ['VCC', 'VDD'];
const POWER_PINS = ['5V', 'VIN', '3V3', 'VCC'];
const SIGNAL_MARGIN = 0.3; // V a rail may sit under the signal it is meant to match
function tryResupply(program, hazards) {
  const rest = createEngine(program).dc();
  if (!rest.ok) return null;
  const signal = Math.max(...hazards.filter(isOverSupply).map((h) => h.params.voltage.value));
  const chips = [...new Set(hazards.filter(isOverSupply).map((h) => String(h.params.part).split('.')[0]))];
  const rails = [
    ...program.devices.filter((d) => d.kind === 'MCU' && !d.unsupported).flatMap((d) => d.pins.filter((p) => POWER_PINS.includes(p.name)).map((p) => ({ node: p.node, from: { rail: `${d.id}.${p.name}` } }))),
    ...(program.supplies ?? []).filter((x) => x.id).map((x) => ({ node: x.p, from: { supply: x.id } })),
  ].filter((r) => rest.nodes[r.node] >= signal - SIGNAL_MARGIN);
  for (const id of chips) {
    const chip = program.devices.find((d) => d.id === id);
    const pin = chip?.pins.find((p) => SUPPLY_PINS.includes(p.name));
    const max = chip?.params?.model?.maxSupply ?? Number.POSITIVE_INFINITY;
    if (!pin) continue;
    for (const rail of rails.filter((r) => r.node !== pin.node && rest.nodes[r.node] <= max)) {
      const changed = structuredClone(program);
      changed.devices.find((d) => d.id === id).pins.find((p) => p.name === pin.name).node = rail.node;
      const engine = createEngine(changed);
      const r = engineHazards(engine, controlStates(changed, engine));
      if (r.ok && !r.hazards.length) return { kind: 'resupply', part: id, pin: pin.name, ...rail.from, voltage: rest.nodes[rail.node] };
    }
  }
  return null;
}

export function hazardFix(circuit, hazards) {
  if (!hazards?.length) return {};
  const compiled = compile(circuit);
  if (compiled.fatal) return { fix: null, noFix: true };
  const { program } = compiled;
  if (hazards.some(isReverse)) {
    const fix = trySwaps(program, hazards);
    return fix ? { fix } : { fix: null, noFix: true };
  }
  if (hazards.some(isOverSupply)) {
    const fix = tryResupply(program, hazards);
    if (fix) return { fix };
  }
  const nets = netsOf(program);
  // Each candidate once, with the hazards that propose it. The one it is aimed at: a hazard on
  // another part than the resistor it changes (the LED a resistor feeds, not the resistor's own
  // power), else the first.
  const byKey = new Map();
  // A board drawing more than its USB port gives proposes nothing of its own: a resistor in series
  // with the supply would starve what it feeds. A fix of the other hazards must clear it too.
  for (const h of hazards.filter((x) => x.params.variant !== 'usb')) {
    for (const c of candidatesOf(program, nets, h)) {
      const key = JSON.stringify(c);
      if (!byKey.has(key)) byKey.set(key, { c, from: [] });
      byKey.get(key).from.push(h);
    }
  }
  const candidates = [...byKey.values()].map(({ c, from }) => {
    const lead = from.find((h) => String(h.params.part).split('.')[0] !== c.part) ?? from[0];
    return { c, ordered: [lead, ...hazards.filter((x) => x !== lead)] };
  });
  // Only resistors over their power, nothing else wrong: a resistor that is the circuit's load (a
  // stand-in for a heater, a lamp) has no value the kit can choose for it: a bigger one stops it doing
  // what it is there for. The way out (a part of more watts, another design) is a person's.
  if (hazards.every((h) => h.code === 'SIM_OVER_POWER' && isResistor(subjectOf(program, h)?.d) && !subjectOf(program, h).pin)) return { fix: null, noFix: true };
  const sets = candidates.filter((x) => x.c.kind === 'set');
  const adds = candidates.filter((x) => x.c.kind !== 'set');
  for (const { c, ordered } of [...sets, ...adds].slice(0, CANDIDATES)) {
    const found = tryCandidate(program, c, ordered);
    if (!found) continue;
    const brings = bringsOf(found, hazards);
    return { fix: c.kind === 'set' ? { kind: 'set', part: c.part, value: found.value, brings } : { kind: 'add-series', with: c.with, pin: c.pin, value: found.value, brings } };
  }
  return { fix: null, noFix: true };
}

// The spec of a circuit with its computed fix applied, for layout to lay out as one change (layout
// --fix, the MCP tool's fix: true; docs/en/layout.md, "Applying the kit's fix"). Nothing here
// decides to fix: it runs only on that request.
//   'set'         the resistor's new value (and the recipe's, when the circuit came from one)
//   'resupply'    the chip's supply pin moved to the rail named (`rail`, a board's pin, or `supply`'s +)
//   'add-series'  a new resistor, the next R number of the circuit, between the pin and the net it
//                 was on (its pin 1 on the net, pin 2 on the pin; a supply clipped to the pin stays
//                 on the net), listed just before the part it is in series with (just after a board
//                 for one of its own pins): signal order. A recipe no longer describes the circuit.
// → { spec, applied: { kind, part, value, with? } }
export function specWithFix(spec, fix) {
  // A chip fed from another rail: its supply pin leaves its net and joins the rail's (a board's pin, or
  // the supply's + rail).
  if (fix.kind === 'resupply') {
    const ref = `${fix.part}.${fix.pin}`;
    const same = (x) => String(x).toLowerCase() === ref.toLowerCase();
    const drop = (pins) => pins.filter((x) => !same(x));
    const nets = spec.nets.map((net) => (Array.isArray(net) ? drop(net) : { ...net, pins: drop(net.pins ?? []) })).filter((net) => (Array.isArray(net) ? net : net.pins).length > 1);
    const [positive] = supplyRails(typeof spec.board === 'string' ? BOARDS[spec.board] : spec.board);
    const rail = fix.supply ? (spec.supplies?.find((x) => x.id === fix.supply)?.positive ?? positive) : fix.rail;
    const { recipe, ...rest } = spec;
    return { spec: { ...rest, nets: [...nets, [rail, ref]] }, applied: { kind: 'resupply', part: fix.part, pin: fix.pin, rail } };
  }
  // A part turned round: its two pins swap in the nets; a supply's leads: its + and − swap.
  if (fix.kind === 'swap' || fix.kind === 'swap-supply') {
    const id = fix.kind === 'swap' ? fix.part : fix.supply;
    // The part's two leads as the spec names them (an alias such as D1.A is the anode): exchanged.
    const all = spec.nets.flatMap((net) => (Array.isArray(net) ? net : (net.pins ?? [])));
    const own = [...new Set(all.filter((ref) => String(ref).split('.')[0] === id))];
    const lead = (ref) => (own.length === 2 && own.includes(ref) ? own.find((x) => x !== ref) : ref);
    const swap = (pins) => pins.map(lead);
    const nets = spec.nets.map((net) => (Array.isArray(net) ? swap(net) : { ...net, pins: swap(net.pins ?? []) }));
    // A supply with no rails of its own is on the board's (T+ and T−): written out, then exchanged,
    // or the swap would change nothing.
    const [positive, negative] = supplyRails(typeof spec.board === 'string' ? BOARDS[spec.board] : spec.board);
    const supplies = spec.supplies?.map((x) => (x.id === id ? { ...x, positive: x.negative ?? negative, negative: x.positive ?? positive } : x));
    return { spec: { ...spec, nets, ...(supplies && { supplies }) }, applied: { kind: fix.kind, part: id, ...(fix.pins && { pins: fix.pins }) } };
  }
  const value = valueText(fix.value);
  if (fix.kind === 'set') {
    const parts = spec.parts.map((p) => (p.id === fix.part ? { ...p, value } : p));
    const recipe = spec.recipe && { ...spec.recipe, values: { ...spec.recipe.values, [fix.part]: value } };
    return { spec: { ...spec, parts, ...(recipe && { recipe }) }, applied: { kind: 'set', part: fix.part, value: fix.value } };
  }
  const max = Math.max(0, ...spec.parts.map((p) => /^R(\d+)$/.exec(p.id)?.[1]).filter(Boolean).map(Number));
  let n = max + 1;
  while (spec.parts.some((p) => p.id === `R${n}`)) n++;
  const id = `R${n}`;
  const same = (ref) => String(ref).toLowerCase() === fix.pin.toLowerCase();
  const swap = (pins) => pins.map((ref) => (same(ref) ? `${id}.1` : ref));
  const nets = spec.nets.map((net) => (Array.isArray(net) ? swap(net) : { ...net, pins: swap(net.pins ?? []) }));
  const supplies = spec.supplies?.map((s) => ({ ...s, ...(s.positive != null && same(s.positive) && { positive: `${id}.1` }), ...(s.negative != null && same(s.negative) && { negative: `${id}.1` }) }));
  const parts = [...spec.parts];
  const owner = fix.pin.split('.')[0];
  const at = parts.findIndex((p) => p.id === owner);
  parts.splice(fix.with === owner ? at : at + 1, 0, { id, type: 'resistor', value });
  const { recipe, ...rest } = spec;
  return { spec: { ...rest, parts, nets: [...nets, [`${id}.2`, fix.pin]], ...(supplies && { supplies }) }, applied: { kind: 'add-series', part: id, value: fix.value, with: fix.with } };
}
