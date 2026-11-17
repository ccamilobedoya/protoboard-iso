import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PART_TYPES, FAMILIES } from '../src/parts/types/index.js';
import { buildSchemas } from '../src/schema.js';
import { t } from '../src/i18n/index.js';
import { COMMON_FIELDS, TYPE_FIELDS, compactCatalog, catalogEntry, formatCatalogEntry, formatCompactCatalog } from '../src/node/catalog.js';

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
  assert.equal(catalogEntry('555').part, 'NE555', 'a bare 555 is the NE555');
  assert.equal(catalogEntry('555').type, 'ic');
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

// catalog <part> answers a question about a part from the kit alone (src/sim/ratings.js): the
// card's text (describePart), what each pin does (pin.role.*) and the limits the simulator checks.
test('a part\'s entry carries the card\'s text, its pins\' roles and the simulator\'s limits, in both languages', async () => {
  const { LED_LIMITS, RESISTOR_POWER } = await import('../src/sim/models.js');
  const line = (text, key, lang) => text.split('\n').find((l) => l.startsWith(`  ${t(lang, key)} `));

  const led = catalogEntry('led');
  assert.equal(led.about, t('en', 'describe.led'));
  assert.deepEqual(led.pinRoles, { anode: t('en', 'pin.role.led.anode'), cathode: t('en', 'pin.role.led.cathode') });
  assert.deepEqual(led.limits, [
    { kind: 'rated', quantity: 'current', value: LED_LIMITS.ratedCurrent, unit: 'A' },
    { kind: 'max', quantity: 'current', value: LED_LIMITS.maxCurrent, unit: 'A' },
    { kind: 'max', quantity: 'reverse', value: LED_LIMITS.maxReverse, unit: 'V' },
  ]);
  const en = formatCatalogEntry(led, 'en');
  assert.equal(line(en, 'catalog.limits', 'en'), "  limits (the simulator's): rated current 20 mA · maximum current 30 mA · maximum reverse voltage 5 V");
  assert.equal(line(en, 'catalog.about', 'en'), `  about: ${t('en', 'describe.led')}`);
  assert.equal(line(en, 'catalog.pinRoles', 'en'), '  pin roles: anode · the + side, in; cathode · the − side, out');
  const es = formatCatalogEntry(catalogEntry('led', 'es'), 'es');
  assert.equal(line(es, 'catalog.limits', 'es'), '  límites (los del simulador): la corriente nominal 20 mA · la corriente hasta 30 mA · el voltaje inverso hasta 5 V');
  assert.equal(line(es, 'catalog.about', 'es'), `  qué es: ${t('es', 'describe.led')}`);

  // A resistor: the power of its default rating, and the field that changes it.
  const resistor = catalogEntry('resistor');
  assert.deepEqual(resistor.limits, [{ kind: 'max', quantity: 'power', value: RESISTOR_POWER['1/4'], unit: 'W' }]);
  assert.deepEqual(resistor.limitFields, ['power']);
  assert.equal(line(formatCatalogEntry(resistor, 'en'), 'catalog.limits', 'en'), "  limits (the simulator's): maximum power 250 mW, by default (field power)");
  assert.equal(line(formatCatalogEntry(catalogEntry('resistor', 'es'), 'es'), 'catalog.limits', 'es'), '  límites (los del simulador): la potencia hasta 250 mW, por defecto (campo power)');

  // A transistor by its part number: its own model's power.
  const { BJTS } = await import('../src/sim/models.js');
  const q = catalogEntry('2N2222A');
  assert.equal(q.about, t('en', 'describe.bjt.npn'));
  assert.deepEqual(q.limits, [{ kind: 'max', quantity: 'power', value: BJTS['2N2222A'].maxPower, unit: 'W' }]);
  assert.equal(q.pinRoles.B, t('en', 'pin.role.bjt.B'));

  // A microcontroller board: its text, and a limit repeated over its pins says so.
  const uno = catalogEntry('UNO');
  assert.ok(uno.about.includes(t('en', 'describe.module.uno')), uno.about);
  assert.ok(uno.limits.some((l) => l.each === 'pins'), JSON.stringify(uno.limits));
  assert.match(formatCatalogEntry(uno, 'en'), /\n {2}limits \(the simulator's\): maximum current 40 mA per pin\n/);
  assert.match(formatCatalogEntry(catalogEntry('UNO', 'es'), 'es'), /\n {2}límites \(los del simulador\): la corriente hasta 40 mA por pata\n/);

  // Chips of a package that share a limit say which; a chip the simulator does not run, and a
  // breadboard, get no line for what the kit does not know.
  assert.deepEqual(catalogEntry('rgb-led').limits.find((l) => l.kind === 'max' && l.quantity === 'current').pins, ['R', 'G', 'B']);
  const register = catalogEntry('74HC595');
  assert.ok(register.about && register.limits === undefined);
  assert.doesNotMatch(formatCatalogEntry(register, 'en'), /limits/);
  const board = catalogEntry('bb830');
  for (const k of ['about', 'pinRoles', 'limits']) assert.equal(board[k], undefined, k);

  // The JSON is the same data as the text.
  const json = JSON.parse(JSON.stringify(catalogEntry('led', 'es')));
  assert.equal(json.about, t('es', 'describe.led'));
  assert.deepEqual(json.limits, led.limits);
});

test('every limit says what it belongs to when the quantity alone does not, in both languages', () => {
  const line = (name, lang) => formatCatalogEntry(catalogEntry(name, lang), lang).split('\n').find((l) => l.includes(t(lang, 'catalog.limits')));
  assert.match(line('relay', 'en'), /maximum voltage 6 V \(coil\) · maximum current 10 A \(contacts\)/);
  assert.match(line('relay', 'es'), /el voltaje hasta 6 V \(bobina\) · la corriente hasta 10 A \(contactos\)/);
  assert.match(line('motor', 'en'), /maximum current 140 mA \(when stalled\)/);
  assert.match(line('motor', 'es'), /la corriente hasta 140 mA \(con el eje frenado\)/);
  assert.match(line('ESP32-DEVKIT', 'en'), /maximum current 40 mA per pin · maximum current 800 mA \(3\.3 V regulator\)/);
  assert.match(line('AMS1117-3.3', 'en'), /maximum current 800 mA \(output\) · maximum voltage 15 V \(input\)/);
  assert.match(line('NE555', 'en'), /maximum voltage 16 V \(supply\)/);
  assert.match(line('slide-switch', 'en'), /maximum voltage 30 V across an open contact$/);
  // The UNO's logic rail is the USB's 5 V itself: the simulator checks no regulator there, so none is listed.
  assert.equal(line('UNO', 'en'), "  limits (the simulator's): maximum current 40 mA per pin");
  // Two limits of one part with the same quantity are told apart, and no key is left untranslated.
  for (const lang of ['en', 'es']) {
    for (const name of Object.keys(PART_TYPES)) {
      const e = catalogEntry(name, lang);
      if (!e?.limits) continue;
      const text = formatCatalogEntry(e, lang);
      assert.doesNotMatch(text, /catalog\.limit/, `${lang} ${name}`);
      const keys = e.limits.map((l) => [l.kind, l.quantity, l.each, l.of, (l.pins ?? []).join()].join('|'));
      assert.equal(new Set(keys).size, keys.length, `${name}: two limits that read the same`);
    }
  }
});
