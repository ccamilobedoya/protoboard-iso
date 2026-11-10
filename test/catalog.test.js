import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PART_TYPES, FAMILIES } from '../src/parts/types/index.js';
import { buildSchemas } from '../src/schema.js';
import { COMMON_FIELDS, TYPE_FIELDS, compactCatalog, catalogEntry, formatCompactCatalog } from '../src/node/catalog.js';

test('every field of a part belongs to every type or to some types', () => {
  const props = Object.keys(buildSchemas()['circuit.schema.json'].$defs.part.properties);
  const typed = new Set(Object.values(TYPE_FIELDS).flat());
  for (const field of props) assert.ok(COMMON_FIELDS.includes(field) || typed.has(field), `field "${field}": add it to TYPE_FIELDS in src/node/catalog.js`);
  for (const type of Object.keys(PART_TYPES)) assert.ok(TYPE_FIELDS[type], `type "${type}": add it to TYPE_FIELDS`);
});

test('the compact catalog is short; an entry tells pins, fields and an example', () => {
  const text = formatCompactCatalog(compactCatalog('en'), 'en');
  // About 2 KB of parts and boards plus the recipes (what a small model should look at first).
  assert.ok(text.length < 5000, `${text.length} characters`);
  const ldr = catalogEntry('ldr');
  assert.ok(ldr.parts.length && ldr.fields.light);
  assert.equal(catalogEntry('UNO').kind, 'module');
  assert.equal(catalogEntry('2SC1815').part, 'C1815');
  assert.equal(catalogEntry('nope'), null);
});

test('every part type has a family, and the compact catalog lists each family with all its types', () => {
  for (const [k, v] of Object.entries(PART_TYPES)) assert.ok(FAMILIES.includes(v.family), `type "${k}": give it a family from FAMILIES (src/parts/types/index.js)`);
  for (const f of FAMILIES) assert.ok(Object.values(PART_TYPES).some((v) => v.family === f), `family "${f}" has no type: remove it from FAMILIES`);
  for (const lang of ['en', 'es']) {
    const lines = formatCompactCatalog(compactCatalog(lang), lang).split('\n');
    for (const family of FAMILIES) {
      const start = lines.indexOf(family);
      assert.ok(start >= 0, `${lang}: no block for family "${family}"`);
      let end = start + 1;
      while (end < lines.length && lines[end].startsWith('  ')) end++;
      const listed = lines.slice(start + 1, end).map((l) => l.trim().split(':')[0]);
      const expected = Object.entries(PART_TYPES).filter(([, v]) => v.family === family).map(([k]) => k);
      assert.deepEqual(listed, expected, `${lang}: family "${family}" lists every one of its types`);
    }
    const all = lines.filter((l) => /^ {2}[a-z0-9-]+: /.test(l)).length;
    assert.equal(all, Object.keys(PART_TYPES).length, `${lang}: no type missing or repeated`);
  }
});

test('the compact catalog keeps its types in groups and stays short in English', () => {
  const text = formatCompactCatalog(compactCatalog('en'), 'en');
  assert.ok(text.length <= 4600, `compact catalog is ${text.length} characters: the budget is 4600, shorten before raising it`);
  // A long list of part numbers is cut to the first few with a count; the entry by name has them all.
  const bjt = text.split('\n').find((l) => l.startsWith('  bjt:'));
  const total = catalogEntry('bjt').parts ? Object.keys(catalogEntry('bjt').parts).length : 0;
  assert.match(bjt, /\(\+\d+ more\)$/);
  assert.ok(total > 8, 'bjt has a long list');
  assert.ok(text.includes('  zener: A K · 1N4728A…1N4751A'), 'a series with a pattern stays a range');
  assert.ok(!/ · R1=/.test(text), 'recipes come without their values');
  assert.ok(text.includes('  ldr: 1 2 · GL5516'), 'the photoresistors are the ldr type\'s parts');
});

test('every recipe is in one of the recipe groups, and the compact catalog lists the recipes by group, names only', async () => {
  const { RECIPES, RECIPE_GROUPS } = await import('../src/recipes/index.js');
  const { t } = await import('../src/i18n/index.js');
  for (const r of Object.values(RECIPES)) {
    assert.ok(RECIPE_GROUPS.includes(r.group), `recipe "${r.name}": set its "group" to one of ${RECIPE_GROUPS.join(', ')} (src/recipes/index.js)`);
  }
  for (const g of RECIPE_GROUPS) assert.ok(Object.values(RECIPES).some((r) => r.group === g), `group "${g}" has no recipe: remove it from RECIPE_GROUPS`);
  for (const lang of ['en', 'es']) {
    const text = formatCompactCatalog(compactCatalog(lang), lang);
    const lines = text.split('\n');
    const start = lines.indexOf(t(lang, 'catalog.recipes'));
    assert.ok(start >= 0, `${lang}: recipes header`);
    const listed = [];
    for (const g of RECIPE_GROUPS) {
      const line = lines.slice(start + 1).find((l) => l.startsWith(`  ${t(lang, `recipe.group.${g}`)} = `));
      assert.ok(line, `${lang}: a line for group "${g}"`);
      const names = line.split(' = ')[1].split(', ');
      assert.deepEqual(names, Object.values(RECIPES).filter((r) => r.group === g).map((r) => r.name), `${lang}: "${g}" lists its recipes in the order of recipes/index.js`);
      listed.push(...names);
    }
    assert.equal(listed.length, Object.keys(RECIPES).length, `${lang}: no recipe missing or repeated`);
    for (const r of Object.values(RECIPES)) assert.ok(!text.includes(`(${r.title[lang]})`), `${lang}: no title in the compact list`);
  }
  assert.equal(catalogEntry('divider', 'es').title, 'Divisor de voltaje');
  assert.equal(catalogEntry('divider', 'en').group, 'basics');
});
