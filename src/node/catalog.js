// What the kit knows, short enough to read: the compact list (every type with its pins, the part
// numbers by type, modules, batteries) or one entry in detail (a type, a part number or a
// module: pins, package, the fields it takes and a real part from examples/ to copy). The full
// registry is still there as JSON for tools. Node only: the example is read from disk.

import { readdirSync, readFileSync } from 'node:fs';
import { PART_TYPES } from '../parts/types/index.js';
import { PART_NUMBERS, lookupPartNumber } from '../parts/db.js';
import { PACKAGES } from '../parts/packages/index.js';
import { MODULES } from '../parts/modules.js';
import { BATTERY_FORMATS } from '../parts/batteries.js';
import { LDR_PARTS } from '../parts/types/more.js';
import { BOARDS, createBoard, boardLayout } from '../board/board.js';
import { formatBoardLayout } from '../board/layout-text.js';
import { resolvePart, closestNames } from '../parts/resolve.js';
import { VIEWS } from '../core/camera.js';
import { OP_NAMES } from '../ops.js';
import { ANNOTATION_LAYERS } from '../annotate.js';
import { LANGUAGES, t } from '../i18n/index.js';
import { buildSchemas } from '../schema.js';
import { recipeSummary, recipeEntry } from '../recipes/index.js';

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

const fieldsOf = (type) => {
  const props = buildSchemas()['circuit.schema.json'].$defs.part.properties;
  return Object.fromEntries((TYPE_FIELDS[type] ?? []).filter((f) => props[f]).map((f) => [f, props[f].description ?? (props[f].enum ? props[f].enum.join(' | ') : '')]));
};

const pinsOfModule = (m) => m.pins ?? m.headers.flatMap((h) => h.pins.map(([n]) => n));

// Everything, in short: what an agent reads before building a circuit.
export function compactCatalog(lang = 'en') {
  const numbers = {};
  for (const [n, e] of Object.entries(PART_NUMBERS)) (numbers[e.type] ??= []).push(n);
  return {
    types: Object.fromEntries(
      Object.entries(PART_TYPES).map(([k, v]) => [k, { name: t(lang, `type.${k}`), pins: v.pins ?? null, ...(numbers[k] && { parts: numbers[k] }) }]),
    ),
    modules: Object.fromEntries(Object.entries(MODULES).map(([k, m]) => [k, { name: m.label, mount: m.mount }])),
    batteries: Object.keys(BATTERY_FORMATS),
    photoresistors: Object.keys(LDR_PARTS),
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
      example: exampleOf(key),
    };
  }
  const moduleKey = Object.keys(MODULES).find((k) => k.toUpperCase() === key.toUpperCase());
  if (moduleKey) {
    const m = MODULES[moduleKey];
    return { kind: 'module', type: 'module', part: moduleKey, name: m.label, mount: m.mount, pins: pinsOfModule(m), fields: fieldsOf('module'), example: exampleOf('module', moduleKey) };
  }
  const found = lookupPartNumber(key);
  if (found) {
    const { number, entry } = found;
    return { kind: 'part', type: entry.type, part: number, package: entry.package, pins: entry.pins, fields: fieldsOf(entry.type), example: exampleOf(entry.type, number) };
  }
  const ldr = Object.keys(LDR_PARTS).find((k) => k.toUpperCase() === key.toUpperCase());
  if (ldr) return { kind: 'part', type: 'ldr', part: ldr, pins: PART_TYPES.ldr.pins, fields: fieldsOf('ldr'), example: exampleOf('ldr') };
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

// One recipe in a line: its name, title and the values that can change, with their defaults.
export const recipeLine = (name, r) => `  ${name} (${r.title})${Object.keys(r.values).length ? ` · ${Object.entries(r.values).map(([id, v]) => `${id}=${v}`).join(' ')}` : ''}`;

export function formatCompactCatalog(c, lang = 'en') {
  const lines = [t(lang, 'catalog.types')];
  for (const [k, v] of Object.entries(c.types)) {
    const pins = v.pins ? v.pins.join(' ') : t(lang, 'catalog.pinsFromPart');
    lines.push(`  ${k} (${v.name}) · ${pins}${v.parts ? ` · ${v.parts.join(', ')}` : ''}`);
  }
  lines.push(`${t(lang, 'catalog.modules')} ${Object.entries(c.modules).map(([k, m]) => `${k} (${m.mount})`).join(', ')}`);
  lines.push(`${t(lang, 'catalog.batteries')} ${c.batteries.join(', ')} · ${t(lang, 'catalog.photoresistors')} ${c.photoresistors.join(', ')}`);
  lines.push(`${t(lang, 'catalog.boards')} ${c.boards.join(', ')} · ${t(lang, 'catalog.views')} ${c.views.join(', ')} · ${t(lang, 'catalog.operations')} ${c.operations.join(', ')}`);
  if (c.recipes) {
    lines.push(t(lang, 'catalog.recipes'));
    for (const [k, r] of Object.entries(c.recipes)) lines.push(recipeLine(k, r));
  }
  lines.push(t(lang, 'catalog.more'));
  return lines.join('\n');
}

export function formatCatalogEntry(e, lang = 'en') {
  const aliasLine = e.alias ? `\n  ${t(lang, 'catalog.alias', { name: e.alias.name, fields: JSON.stringify(e.alias.fields) })}` : '';
  if (e.kind === 'recipe') {
    const lines = [`${e.recipe} (${e.title})`, `  ${t(lang, 'catalog.teaches')} ${e.teaches}`, `  ${t(lang, 'catalog.parts')} ${e.parts.map((p) => JSON.stringify(p)).join(', ')}`, `  ${t(lang, 'catalog.nets')} ${e.nets.map((n) => `[${n.join(', ')}]`).join(' ')}`];
    if (e.supplies) lines.push(`  supplies: ${e.supplies.map((x) => JSON.stringify(x)).join(', ')}`);
    lines.push(`  ${t(lang, 'catalog.recipeValues')}`);
    for (const [id, v] of Object.entries(e.values)) {
      const limits = v.choices ? ` [${v.choices.join(', ')}]` : v.min !== undefined || v.max !== undefined ? ` [${v.min ?? ''}…${v.max ?? ''}]` : '';
      lines.push(`    ${id}: ${v.field} = ${v.default}${limits}${v.role ? ` · ${v.role}` : ''}`);
    }
    return lines.join('\n');
  }
  if (e.kind === 'board') return `${e.part} (${e.name})\n  ${formatBoardLayout(e.layout, lang)}`;
  const head = e.kind === 'type' ? `${e.type} (${e.name})` : `${e.part} → ${e.type}${e.package ? ` · ${e.package}` : ''}${e.mount ? ` · ${e.mount}` : ''}`;
  const lines = [head];
  if (e.pins) lines.push(`  ${t(lang, 'catalog.pins')} ${e.pins.join(' ')}`);
  else lines.push(`  ${t(lang, 'catalog.pins')} ${t(lang, 'catalog.pinsFromPart')}`);
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
