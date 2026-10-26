import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RECIPES, expandRecipe, resolveRecipe, recipeDefaults } from '../src/recipes/index.js';
import { autoLayout, specFromCircuit } from '../src/layout.js';
import { simulate } from '../src/sim/index.js';
import { resolvePart } from '../src/parts/resolve.js';
import { catalogEntry, compactCatalog } from '../src/node/catalog.js';
import { formatIssue } from '../src/index.js';

const why = (r) => [...r.problems, ...r.review.blocking].map((b) => formatIssue(b, 'en')).join('\n') + JSON.stringify(r.check);
const layoutOf = (name, values) => {
  const { spec, problems } = expandRecipe(name, values);
  assert.deepEqual(problems, [], `${name}: ${JSON.stringify(problems)}`);
  return autoLayout(spec);
};

for (const name of Object.keys(RECIPES)) {
  test(`recipe ${name}: ready in one layout call, with its defaults`, () => {
    const r = layoutOf(name);
    assert.equal(r.status, 'done', why(r));
    assert.deepEqual(r.circuit.spec.recipe, { name });
  });
}

test('recipes: every choice of a part comes out ready too', () => {
  for (const [name, recipe] of Object.entries(RECIPES)) {
    for (const [id, rule] of Object.entries(recipe.values)) {
      for (const choice of (rule.choices ?? []).slice(1)) {
        const r = layoutOf(name, { [id]: choice });
        assert.equal(r.status, 'done', `${name} ${id}=${choice}: ${why(r)}`);
      }
    }
  }
});

test('recipe bridge-rectifier: any usual filter capacitor leaves the jumpers in sight', () => {
  for (const value of ['100u', '220u', '1000u', '2200u']) {
    const r = layoutOf('bridge-rectifier', { C1: value });
    assert.equal(r.status, 'done', `C1=${value}: ${why(r)}`);
  }
});

test('recipes: each value names an item that has that field', () => {
  for (const [name, recipe] of Object.entries(RECIPES)) {
    const defaults = recipeDefaults(recipe);
    for (const id of Object.keys(recipe.values)) assert.notEqual(defaults[id], undefined, `${name}: ${id}`);
  }
});

test('recipes with a source simulate without errors and without stressing a part', () => {
  for (const name of Object.keys(RECIPES)) {
    if (!RECIPES[name].supplies) continue;
    const s = simulate(layoutOf(name).circuit);
    assert.ok(s.ok, `${name}: ${JSON.stringify(s.issues)}`);
    const over = Object.entries(s.parts).flatMap(([id, p]) => (p.stress ?? []).filter((x) => x.level !== 'fine').map((x) => `${id} ${x.quantity} ${x.level}`));
    assert.deepEqual(over, [], name);
  }
});

test('recipe values: the main field by id, or some allowed fields', () => {
  const { spec } = expandRecipe('npn-switch', { R1: '470', D1: { color: 'green' }, Q1: 'bc547', V1: 9, R2: { value: '220', tolerance: '1%' } });
  const part = (id) => spec.parts.find((p) => p.id === id);
  assert.equal(part('R1').value, '470');
  assert.equal(part('D1').color, 'green');
  assert.equal(part('Q1').part, 'bc547');
  assert.deepEqual([part('R2').value, part('R2').tolerance], ['220', '1%']);
  assert.equal(spec.supplies[0].voltage, 9);
  // The recipe itself is not changed.
  assert.equal(RECIPES['npn-switch'].parts.find((p) => p.id === 'R1').value, '1k');
  assert.deepEqual(spec.recipe.values.R1, '470');
});

test('recipe problems: unknown name, item, field, choice and range; never with parts or nets', () => {
  const codes = (r) => r.problems.map((p) => p.code);
  const unknown = expandRecipe('npn-swich');
  assert.deepEqual(codes(unknown), ['RECIPE_UNKNOWN']);
  assert.match(unknown.problems[0].params.recipes, /npn-switch/);
  assert.deepEqual(codes(expandRecipe('npn-switch', { R9: '1k' })), ['RECIPE_VALUE_UNKNOWN']);
  assert.deepEqual(codes(expandRecipe('npn-switch', { D1: { size: 5 } })), ['RECIPE_VALUE_FIELD']);
  assert.deepEqual(codes(expandRecipe('npn-switch', { Q1: 'IRLZ44N' })), ['RECIPE_VALUE_CHOICE']);
  assert.deepEqual(codes(expandRecipe('npn-switch', { V1: 40 })), ['RECIPE_VALUE_RANGE']);
  assert.deepEqual(codes(resolveRecipe({ recipe: 'divider', nets: [['R1.1', 'T+']] })), ['RECIPE_AND_PARTS']);
  // Settings given beside a recipe replace the recipe's.
  assert.equal(resolveRecipe({ recipe: 'divider', title: 'Mine', clearance: 3 }).spec.title, 'Mine');
});

test('recipe on an existing circuit: new values, every part keeps its holes', () => {
  const first = layoutOf('led-resistor').circuit;
  const spec = specFromCircuit(first, resolveRecipe({ recipe: 'led-resistor', values: { R1: '470' } }).spec);
  const r = autoLayout(spec, { previous: first });
  assert.equal(r.status, 'done', why(r));
  const pins = (c, id) => c.parts.find((p) => p.id === id).pins;
  for (const id of ['R1', 'D1']) assert.deepEqual(pins(r.circuit, id), pins(first, id));
  assert.equal(r.circuit.parts.find((p) => p.id === 'R1').value, '470');
  assert.deepEqual(r.circuit.spec.recipe, { name: 'led-resistor', values: { R1: '470' } });
  // Laid out again with other nets, it is no longer that recipe.
  assert.equal(specFromCircuit(r.circuit, { nets: r.circuit.spec.nets }).recipe, undefined);
});

test('recipes in the catalog: listed with their values, found by name, never shadowing a part', () => {
  const c = compactCatalog('es');
  assert.deepEqual(Object.keys(c.recipes), Object.keys(RECIPES));
  assert.equal(c.recipes['npn-switch'].values.R1, '1k');
  for (const name of Object.keys(RECIPES)) {
    assert.equal(catalogEntry(name).kind, 'recipe');
    assert.ok(resolvePart({ id: 'X', part: name }).error, `${name} is also a part name`);
  }
});

test('recipes: every one documented in English and Spanish', () => {
  for (const file of ['docs/en/recipes.md', 'docs/es/recetas.md']) {
    const doc = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    for (const name of Object.keys(RECIPES)) assert.ok(doc.includes(`\`${name}\``), `${file}: ${name}`);
  }
});
