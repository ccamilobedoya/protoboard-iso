import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PART_TYPES } from '../src/parts/types/index.js';
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
