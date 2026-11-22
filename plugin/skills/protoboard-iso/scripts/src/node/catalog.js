// What the kit knows, short enough to read: the compact list (every type with its pins, the part
// numbers by type, modules, batteries) or one entry in detail (a type, a part number or a
// module: pins, package, the fields it takes and a real part from examples/ to copy, when the
// kit's examples are there). What it says about a part comes from src/ alone, so the packed plugin,
// which has no examples/, says the same. The full registry is still there as JSON for tools. Node
// only: the example is read from disk.

import { readdirSync, readFileSync } from 'node:fs';
import { PART_TYPES, FAMILIES } from '../parts/types/index.js';
import { PART_NUMBERS, lookupPartNumber } from '../parts/db.js';
import { PACKAGES } from '../parts/packages/index.js';
import { MODULES, lookupModule } from '../parts/modules.js';
import { MCUS } from '../sim/models.js';
import { BATTERY_FORMATS } from '../parts/batteries.js';
import { LDR_PARTS } from '../parts/types/more.js';
import { BOARDS, createBoard, boardLayout } from '../board/board.js';
import { formatBoardLayout } from '../board/layout-text.js';
import { resolvePart, closestNames, pinsOf } from '../parts/resolve.js';
import { VIEWS } from '../core/camera.js';
import { OP_NAMES } from '../ops.js';
import { ANNOTATION_LAYERS } from '../annotate.js';
import { LANGUAGES, t, decimalSeparator } from '../i18n/index.js';
import { buildSchemas } from '../schema.js';
import { recipeSummary, recipeEntry, RECIPE_GROUPS, valueLimits } from '../recipes/index.js';
import { describePart } from '../parts/describe.js';
import { pinRoles } from '../pinout.js';
import { partRatings, partControls } from '../sim/ratings.js';
import { deviceFor } from '../sim/devices/index.js';
import { formatValue } from '../core/units.js';

export { COMMON_FIELDS, TYPE_FIELDS } from '../parts/fields.js';
import { TYPE_FIELDS } from '../parts/fields.js';

const EXAMPLES = new URL('../../examples/', import.meta.url);

// The first part of that type (and part number, when given) in the kit's examples.
function exampleOf(type, number) {
  let files = [];
  try {
    files = readdirSync(EXAMPLES).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return null;
  }
  for (const file of files) {
    let circuit;
    try {
      circuit = JSON.parse(readFileSync(new URL(file, EXAMPLES), 'utf8'));
    } catch {
      continue;
    }
    const part = (circuit.parts ?? []).find((p) => p.type === type && (!number || String(p.part).toUpperCase() === number.toUpperCase()));
    if (part) {
      const { description, ...plain } = part;
      return { file: `examples/${file}`, part: plain };
    }
  }
  return number ? exampleOf(type) : null;
}

// The schema's words point to the kit's sources and docs ("see src/parts/db.js", "(docs/en/…)"),
// which a user of the plugin does not have: the catalog says the thing without them.
export const withoutPaths = (text) =>
  String(text)
    .replace(/\s*\((?:see )?(?:src|docs)\/[^)]*\)/g, '')
    .replace(/\s*(?:see )?(?:src|docs)\/\S+/g, '');
const fieldsOf = (type) => {
  const props = buildSchemas()['circuit.schema.json'].$defs.part.properties;
  return Object.fromEntries((TYPE_FIELDS[type] ?? []).filter((f) => props[f]).map((f) => [f, withoutPaths(props[f].description ?? (props[f].enum ? props[f].enum.join(' | ') : ''))]));
};

// A part as the type resolves it, not placed: what describePart, pinRoles and partRatings read.
// A bare type that needs more takes its `typical` fields (a resistor's value, a module's part
// number); a part wired pin by name (a switch, a relay, a board beside the breadboard) is taken
// with every pin it has, each to a hole that does not matter here.
function unplaced(raw) {
  const type = PART_TYPES[raw.type];
  let def = type?.resolve(raw);
  if (def?.error && type.typical) {
    raw = { ...type.typical, ...raw };
    def = type.resolve(raw);
  }
  if (def?.error?.code === 'MODULE_PINS') {
    const all = pinsOf(raw);
    const names = all.length ? all : (lookupPartNumber(raw.part)?.entry.pins ?? []);
    raw = { ...raw, pins: Object.fromEntries(names.map((n) => [n, 'a1'])) };
    def = type.resolve(raw);
  }
  if (!def || def.error) return null;
  return { id: raw.id, type: raw.type, raw, def, pinNames: def.pinNames ?? type.pins ?? [] };
}

// What the page's card says about a typical instance (`raw`: the part number, or a type with its
// defaults) and the limits the simulator checks it against. The fields its limits follow are left
// at their defaults, so a resistor says the power of the default 1/4 W.
function facts(raw, lang) {
  let part = unplaced(raw);
  if (!part) return {};
  let ratings = partRatings(part);
  const follow = ratings?.fields ?? [];
  if (follow.some((f) => f in part.raw)) {
    part = unplaced(Object.fromEntries(Object.entries(part.raw).filter(([k]) => !follow.includes(k)))) ?? part;
    ratings = partRatings(part);
  }
  // A type with a passive and an active kind says which is which (the part number decides).
  const about = [describePart(part, lang), raw.type === 'buzzer' && !raw.part ? t(lang, 'catalog.buzzer.kinds') : null].filter(Boolean).join(' ');
  const roles = pinRoles(part, lang);
  // A development board's output pin as the simulator drives it: its rail behind a resistance, with
  // where that figure comes from (sim/models.js MCUS) or that it is assumed.
  const family = raw.part ? lookupModule(raw.part)?.module.family : null;
  const mcu = MCUS[family];
  const pinOutput = mcu && { voltage: mcu.vdd, resistance: mcu.outputResistance, source: t(lang, `catalog.pinOutput.source.${family}`) };
  // What a chip's model covers and leaves out, when its device says (devices/index.js, `modelText`).
  const modelKey = deviceFor(part)?.modelText;
  const model = modelKey ? t(lang, `catalog.model.${modelKey}`) : null;
  return { ...(about && { about }), ...(model && { model }), ...(pinOutput && { pinOutput }), ...(roles.length && { pinRoles: Object.fromEntries(roles.map((r) => [r.name, r.text])) }), ...(ratings && { limits: ratings.limits, ...(ratings.fields && { limitFields: ratings.fields }) }) };
}

const pinsOfModule = (m) => m.pins ?? m.headers.flatMap((h) => h.pins.map(([n]) => n));

// Whether the simulator has a model for a part (`raw`: a type, a part number or a module): false
// for one it only draws (a 74HC595, an LM386: its pins are left open in the simulation, and a circuit
// with it ends WARNINGS), so an assistant knows before building. Null when it cannot be resolved
// without more fields.
export function simulates(raw) {
  const part = unplaced({ id: 'X1', ...raw });
  return part ? Boolean(deviceFor(part)) : null;
}

// Part numbers of a type the simulator only draws.
const drawnOnly = (type, numbers) => numbers.filter((n) => simulates({ type, part: n }) === false);

// Everything, in short: what an agent reads before building a circuit.
export function compactCatalog(lang = 'en') {
  const numbers = {};
  for (const [n, e] of Object.entries(PART_NUMBERS)) (numbers[e.type] ??= []).push(n);
  numbers.ldr = Object.keys(LDR_PARTS); // photoresistors are not in the part-number table
  return {
    types: Object.fromEntries(
      Object.entries(PART_TYPES).map(([k, v]) => {
        const drawn = drawnOnly(k, numbers[k] ?? []);
        return [k, { name: t(lang, `type.${k}`), family: v.family, pins: v.pins ?? null, ...(numbers[k] && { parts: numbers[k] }), ...(simulates({ type: k }) === false && { simulated: false }), ...(drawn.length && { notSimulated: drawn }) }];
      }),
    ),
    modules: Object.fromEntries(Object.entries(MODULES).map(([k, m]) => [k, { name: m.label, mount: m.mount, ...(simulates({ type: 'module', part: k }) === false && { simulated: false }) }])),
    batteries: Object.keys(BATTERY_FORMATS),
    boards: Object.keys(BOARDS),
    views: Object.keys(VIEWS),
    operations: OP_NAMES,
    languages: Object.keys(LANGUAGES),
    recipes: recipeSummary(lang),
  };
}

// One entry in detail. `name` is a type (resistor), a part number (7805, L7805CV) or a module
// (UNO). Returns null when the kit does not know it.
function catalogEntryExact(name, lang = 'en') {
  const key = String(name ?? '').trim();
  const boardId = Object.keys(BOARDS).find((b) => b.toLowerCase() === key.toLowerCase());
  if (boardId) return { kind: 'board', type: 'board', part: boardId, name: BOARDS[boardId].name?.[lang] ?? BOARDS[boardId].name?.en, layout: boardLayout(createBoard(boardId)) };
  if (PART_TYPES[key]) {
    const type = PART_TYPES[key];
    const example = exampleOf(key);
    const numbers = Object.entries(PART_NUMBERS).filter(([, e]) => e.type === key);
    return {
      kind: 'type',
      type: key,
      name: t(lang, `type.${key}`),
      pins: type.pins ?? null,
      fields: fieldsOf(key),
      ...(numbers.length && { parts: Object.fromEntries(numbers.map(([n, e]) => [n, { package: e.package, pins: e.pins }])) }),
      ...(key === 'module' && { modules: Object.fromEntries(Object.entries(MODULES).map(([k, m]) => [k, { name: m.label, mount: m.mount, pins: pinsOfModule(m) }])) }),
      ...(key === 'battery' && { formats: Object.fromEntries(Object.entries(BATTERY_FORMATS).map(([k, f]) => [k, { default: f.default, chemistries: Object.keys(f.chemistries) }])) }),
      ...(key === 'ldr' && { parts: Object.keys(LDR_PARTS) }),
      ...(simulates({ type: key }) === false && { simulated: false }),
      ...((drawn) => drawn.length && { notSimulated: drawn })(drawnOnly(key, numbers.map(([n]) => n))),
      ...facts({ id: 'X1', type: key }, lang),
      example,
    };
  }
  const moduleKey = Object.keys(MODULES).find((k) => k.toUpperCase() === key.toUpperCase());
  if (moduleKey) {
    const m = MODULES[moduleKey];
    const example = exampleOf('module', moduleKey);
    return { kind: 'module', type: 'module', part: moduleKey, name: m.label, mount: m.mount, pins: pinsOfModule(m), fields: fieldsOf('module'), ...(simulates({ type: 'module', part: moduleKey }) === false && { simulated: false }), ...facts({ id: 'X1', type: 'module', part: moduleKey }, lang), example };
  }
  const found = lookupPartNumber(key);
  if (found) {
    const { number, entry } = found;
    const example = exampleOf(entry.type, number);
    return { kind: 'part', type: entry.type, part: number, package: entry.package, pins: entry.pins, fields: fieldsOf(entry.type), ...(simulates({ type: entry.type, part: number }) === false && { simulated: false }), ...facts({ id: 'X1', type: entry.type, part: number }, lang), example };
  }
  const ldr = Object.keys(LDR_PARTS).find((k) => k.toUpperCase() === key.toUpperCase());
  if (ldr) return { kind: 'part', type: 'ldr', part: ldr, pins: PART_TYPES.ldr.pins, fields: fieldsOf('ldr'), ...facts({ id: 'X1', type: 'ldr', part: ldr }, lang), example: exampleOf('ldr') };
  return null;
}

// One entry by any name the kit answers to: a type, a part number, a module, a board, or an alias
// ("KCD1" → the rocker switch, "resistencia" → resistor), which comes back with what it stands for.
export function catalogEntry(name, lang = 'en') {
  const recipe = recipeEntry(name, lang);
  if (recipe) return recipe;
  const exact = catalogEntryExact(name, lang);
  if (exact) return exact;
  const r = resolvePart({ id: '?', part: String(name ?? '') });
  if (r.error) return null;
  const { id, ...fields } = r.part;
  const entry = catalogEntryExact(fields.part ?? fields.type, lang);
  return entry ? { ...entry, alias: { name: String(name), fields } } : null;
}

// The closest names to one the catalog does not know.
export const catalogSuggestions = (name) => closestNames(name);

// What catalog answers for a name it does not have: for a common ask (a servo, a speaker, an LED
// strip…) the same "the kit does not know … Nearest it has: …" text layout gives for that part
// (check.UNKNOWN_PART_NAME.<variant>, without the part's id); otherwise the types and the closest names.
export function unknownText(name, lang = 'en') {
  const mark = '@part@';
  const asked = resolvePart({ id: mark, part: String(name) }).error;
  const variant = asked?.code === 'UNKNOWN_PART_NAME' ? asked.params?.variant : null;
  if (variant && variant !== 'none') {
    const text = t(lang, `check.UNKNOWN_PART_NAME.${variant}`, { ...asked.params, part: mark }).replace(`${mark}: `, '');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  const close = catalogSuggestions(name);
  return `${t(lang, 'catalog.unknown', { name, types: Object.keys(PART_TYPES).join(', ') })}${close.length ? ` ${t(lang, 'catalog.closest', { names: close.join(', ') })}` : ''}`;
}

// Every registry in full (the catalog's former answer), for tools that want it all.
export function fullCatalog(lang = 'en') {
  return {
    types: Object.fromEntries(Object.entries(PART_TYPES).map(([k, v]) => [k, { name: t(lang, `type.${k}`), pins: v.pins ?? 'from the part number' }])),
    partNumbers: Object.fromEntries(Object.entries(PART_NUMBERS).map(([k, v]) => [k, { type: v.type, package: v.package, pins: v.pins }])),
    batteries: Object.fromEntries(Object.entries(BATTERY_FORMATS).map(([k, f]) => [k, { default: f.default, chemistries: Object.keys(f.chemistries) }])),
    photoresistors: Object.keys(LDR_PARTS),
    modules: Object.fromEntries(Object.entries(MODULES).map(([k, m]) => [k, { name: m.label, mount: m.mount, pins: pinsOfModule(m) }])),
    packages: Object.keys(PACKAGES),
    boards: Object.keys(BOARDS),
    views: Object.keys(VIEWS),
    operations: OP_NAMES,
    annotations: ANNOTATION_LAYERS,
    languages: Object.keys(LANGUAGES),
  };
}

// The part types one per line, as `catalog` without a name prints them (the CLI): its pins and
// part numbers, each type or part number the simulator only draws marked so where it is named
// ("74HC595 (drawn, not simulated)"), so a reader of one entry cannot miss it.
export function partTypeLines(lang = 'en') {
  const c = compactCatalog(lang);
  return Object.entries(c.types).map(([type, v]) => {
    const pins = v.pins ? v.pins.join(', ') : '—';
    const parts = Object.entries(PART_NUMBERS).filter(([, e]) => e.type === type).map(([n]) => n);
    const only = new Set(v.notSimulated ?? []);
    const named = parts.map((n) => (only.has(n) ? `${n} ${t(lang, 'catalog.typeNotSimulated')}` : n));
    const drawn = v.simulated === false ? ` ${t(lang, 'catalog.typeNotSimulated')}` : '';
    return `${type.padEnd(10)} ${v.name.padEnd(20)} pins: ${pins}${named.length ? `  parts: ${named.join(', ')}` : ''}${drawn}`;
  });
}

// One recipe in a line: its name, title and (unless `values` is false, as in the compact catalog,
// where `catalog` with the name gives them) the values that can change, with their defaults.
export const recipeLine = (name, r, { values = true } = {}) => `  ${name} (${r.title})${values && Object.keys(r.values).length ? ` · ${Object.entries(r.values).map(([id, v]) => `${id}=${String(v).includes('\n') ? '(sketch)' : v}`).join(' ')}` : ''}`;

// Part numbers in runs: three or more in a row that count up by one with the same prefix and suffix
// (1N4728A … 1N4751A, the 1 W Zeners) as "first…last", so a long family takes one entry.
function runs(numbers) {
  const parse = (n) => /^(.*\D)?(\d+)(\D*)$/.exec(n);
  const out = [];
  for (let i = 0; i < numbers.length; ) {
    const a = parse(numbers[i]);
    let j = i;
    while (a && j + 1 < numbers.length) {
      const b = parse(numbers[j + 1]);
      if (!b || b[1] !== a[1] || b[3] !== a[3] || b[2].length !== a[2].length || Number(b[2]) !== Number(a[2]) + (j + 1 - i)) break;
      j++;
    }
    out.push(j - i >= 2 ? `${numbers[i]}…${numbers[j]}` : numbers[i]);
    if (j - i < 2) j = i;
    i = j + 1;
  }
  return out;
}

// A long list of part numbers is cut to its first few and a count; `catalog` with the type's name has them all.
const SHOWN_PARTS = 6;
const MAX_PARTS = 8;
function shortParts(numbers, lang) {
  const list = runs(numbers);
  if (list.length <= MAX_PARTS) return list.join(', ');
  const shown = list.slice(0, SHOWN_PARTS);
  let covered = 0; // part numbers behind the entries shown (a range stands for several)
  for (const entry of shown) covered = entry.includes('…') ? numbers.indexOf(entry.split('…')[1], covered) + 1 : covered + 1;
  return `${shown.join(', ')} ${t(lang, 'catalog.partsMore', { n: numbers.length - covered })}`;
}

// One block per family (the order of FAMILIES): its name, then a line for each of its types with the
// pins in order and the part numbers, so a type is found by its family and nothing repeats.
export function formatCompactCatalog(c, lang = 'en') {
  const lines = [t(lang, 'catalog.types')];
  for (const family of FAMILIES) {
    const types = Object.entries(c.types).filter(([, v]) => v.family === family);
    if (!types.length) continue;
    lines.push(family);
    for (const [k, v] of types) {
      const pins = v.pins ? v.pins.join(' ') : t(lang, 'catalog.pinsPerPart');
      const drawn = v.simulated === false ? ` ${t(lang, 'catalog.typeNotSimulated')}` : v.notSimulated ? ` · ${t(lang, 'catalog.notSimulated', { parts: v.notSimulated.join(', ') })}` : '';
      lines.push(`  ${k}: ${pins}${v.parts ? ` · ${shortParts(v.parts, lang)}` : ''}${drawn}`);
    }
  }
  lines.push(`${t(lang, 'catalog.modules')} ${Object.entries(c.modules).map(([k, m]) => `${k} (${m.mount})${m.simulated === false ? ` ${t(lang, 'catalog.typeNotSimulated')}` : ''}`).join(', ')}`);
  lines.push(`${t(lang, 'catalog.batteries')} ${c.batteries.join(', ')}`);
  lines.push(`${t(lang, 'catalog.boards')} ${c.boards.join(', ')} · ${t(lang, 'catalog.views')} ${c.views.join(', ')} · ${t(lang, 'catalog.operations')} ${c.operations.join(', ')}`);
  if (c.recipes) {
    lines.push(t(lang, 'catalog.recipes'));
    for (const g of RECIPE_GROUPS) {
      const names = Object.entries(c.recipes).filter(([, r]) => r.group === g).map(([k]) => k);
      if (names.length) lines.push(`  ${t(lang, `recipe.group.${g}`)} = ${names.join(', ')}`);
    }
  }
  lines.push(t(lang, 'catalog.more'));
  return lines.join('\n');
}

// "rated current 20 mA · maximum current 30 mA · maximum reverse voltage 5 V", in the page's words
// for each quantity (page.warnings.q.*), and the fields the limits follow.
function limitsText(e, lang) {
  const items = e.limits.map((l) => {
    const text = t(lang, `catalog.limit.${l.kind}`, { quantity: t(lang, `page.warnings.q.${l.quantity}`), value: formatValue(l.value, l.unit, { decimal: decimalSeparator(lang) }) });
    return `${text}${l.pins ? ` (${l.pins.join(', ')})` : ''}${l.of ? ` (${t(lang, `catalog.limit.of.${l.of}`)})` : ''}${l.each ? ` ${t(lang, `catalog.limit.each.${l.each}`)}` : ''}`;
  });
  return `${items.join(' · ')}${e.limitFields ? `, ${t(lang, 'catalog.limitFields', { fields: e.limitFields.join(', ') })}` : ''}`;
}

export function formatCatalogEntry(e, lang = 'en') {
  const aliasLine = e.alias ? `\n  ${t(lang, 'catalog.alias', { name: e.alias.name, fields: JSON.stringify(e.alias.fields) })}` : '';
  if (e.kind === 'recipe') {
    const lines = [`${e.recipe} (${e.title})`, `  ${t(lang, 'catalog.teaches')} ${e.teaches}`, `  ${t(lang, 'catalog.parts')} ${e.parts.map((p) => JSON.stringify(p)).join(', ')}`, `  ${t(lang, 'catalog.nets')} ${e.nets.map((n) => `[${n.join(', ')}]`).join(' ')}`];
    if (e.supplies) lines.push(`  supplies: ${e.supplies.map((x) => JSON.stringify(x)).join(', ')}`);
    lines.push(`  ${t(lang, 'catalog.recipeValues')}`);
    for (const [id, v] of Object.entries(e.values)) {
      lines.push(`    ${id}: ${v.field} = ${v.default}${valueLimits(v, decimalSeparator(lang))}${v.role ? ` · ${v.role}` : ''}`);
    }
    if (e.goals) {
      lines.push(`  ${t(lang, 'catalog.recipeGoals')}`);
      for (const g of e.goals) lines.push(`    ${g.id}: ${g.goal} → ${g.set.join(', ')} · ${JSON.stringify(g.example)}`);
    }
    return lines.join('\n');
  }
  if (e.kind === 'board') return `${e.part} (${e.name})\n  ${formatBoardLayout(e.layout, lang)}`;
  const head = e.kind === 'type' ? `${e.type} (${e.name})` : `${e.part} → ${e.type}${e.package ? ` · ${e.package}` : ''}${e.mount ? ` · ${e.mount}` : ''}`;
  const lines = [head];
  if (e.about) lines.push(`  ${t(lang, 'catalog.about')} ${e.about}`);
  if (e.simulated === false) lines.push(`  ${t(lang, 'catalog.simulation.none')}`);
  else if (e.notSimulated) lines.push(`  ${t(lang, 'catalog.simulation.some', { parts: e.notSimulated.join(', ') })}`);
  if (e.model) lines.push(`  ${e.model}`);
  if (e.pins) lines.push(`  ${t(lang, 'catalog.pins')} ${e.pins.join(' ')}`);
  else lines.push(`  ${t(lang, 'catalog.pins')} ${t(lang, 'catalog.pinsFromPart')}`);
  if (e.pinRoles) lines.push(`  ${t(lang, 'catalog.pinRoles')} ${Object.values(e.pinRoles).join('; ')}`);
  if (e.limits) lines.push(`  ${t(lang, 'catalog.limits')} ${limitsText(e, lang)}`);
  if (e.pinOutput) {
    const f = (v, u) => formatValue(v, u, { decimal: decimalSeparator(lang) });
    lines.push(`  ${t(lang, 'catalog.pinOutput', { voltage: f(e.pinOutput.voltage, 'V'), resistance: f(e.pinOutput.resistance, 'Ω'), source: e.pinOutput.source })}`);
  }
  if (Array.isArray(e.parts)) lines.push(`  ${t(lang, 'catalog.parts')} ${e.parts.join(', ')}`);
  else if (e.parts) for (const [n, p] of Object.entries(e.parts)) lines.push(`  ${n} · ${p.package} · ${p.pins.join(' ')}`);
  if (e.modules) for (const [n, m] of Object.entries(e.modules)) lines.push(`  ${n} (${m.name}, ${m.mount}) · ${m.pins.join(' ')}`);
  if (e.formats) for (const [n, f] of Object.entries(e.formats)) lines.push(`  ${n} · ${f.chemistries.join(', ')}`);
  const fields = Object.entries(e.fields ?? {});
  if (fields.length) {
    lines.push(`  ${t(lang, 'catalog.fields')}`);
    for (const [f, d] of fields) lines.push(`    ${f}${d ? `: ${d}` : ''}`);
  }
  if (e.example) lines.push(`  ${t(lang, 'catalog.example', { file: e.example.file })} ${JSON.stringify(e.example.part)}`);
  return `${lines.join('\n')}${aliasLine}`;
}

// What each part takes, for the skill's reference written by scripts/parts-reference.js: per type its
// pins, the fields a spec and a `set` operation take (the schema's words), and for the bare type and
// each part number or module: its pins, whether it is simulated, what a run changes on it
// (`simulate --set`, the page's sliders) and the environment's fields it reads. All from src/.
export function partReference(lang = 'en') {
  const numbersOf = (type) => (type === 'ldr' ? Object.keys(LDR_PARTS) : type === 'module' ? Object.keys(MODULES) : Object.entries(PART_NUMBERS).filter(([, e]) => e.type === type).map(([n]) => n));
  return Object.keys(PART_TYPES).map((type) => {
    const variants = [null, ...numbersOf(type)].map((number) => {
      const part = unplaced({ id: 'X1', type, ...(number && { part: number }) });
      if (!part) return { part: number, pins: null, simulated: null };
      const device = deviceFor(part);
      const run = device ? partControls(part) : null;
      return { part: number, pins: part.pinNames, simulated: Boolean(device), ...(run && { controls: run.controls, senses: run.senses }) };
    });
    // A type with fixed pins: what each pin does (catalog's pin roles), and what a spec must know
    // about it that no field says (`reference.<type>` in src/i18n: which way a knob runs, which pin
    // is +, which pins make the switch), checked against a run in test/parts-reference.test.js.
    const bare = PART_TYPES[type].pins && unplaced({ id: 'X1', type });
    const roles = bare ? pinRoles(bare, lang).map((r) => r.text) : [];
    const note = `reference.${type}` in LANGUAGES.en ? t(lang, `reference.${type}`) : null;
    return { type, name: t(lang, `type.${type}`), family: PART_TYPES[type].family, pins: PART_TYPES[type].pins ?? null, fields: fieldsOf(type), variants, ...(roles.length && { roles }), ...(note && { note }) };
  });
}
