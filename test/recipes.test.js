import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RECIPES, expandRecipe, resolveRecipe, recipeDefaults } from '../src/recipes/index.js';
import { goalsOf, QUANTITIES } from '../src/recipes/goals.js';
import { ESTIMATES } from '../src/recipes/estimates.js';
import { autoLayout, specFromCircuit } from '../src/layout.js';
import { simulate } from '../src/sim/index.js';
import { resolvePart } from '../src/parts/resolve.js';
import { catalogEntry, compactCatalog } from '../src/node/catalog.js';
import { formatIssue, buildCircuit, labelText } from '../src/index.js';

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

// One case per goal a recipe declares (docs/en/recipes.md, "Goals"): its example is reachable at the
// recipe's defaults, solved into standard values, and the circuit solved ends DONE.
for (const [name, recipe] of Object.entries(RECIPES)) {
  for (const g of goalsOf(recipe)) {
    test(`recipe ${name}: the goal ${g.id}.${g.goal} = ${g.example} is reached and the circuit is ready`, () => {
      const r = layoutOf(name, { [g.id]: { [g.goal]: g.example } });
      assert.equal(r.status, 'done', why(r));
      assert.equal(r.solved.length, 1);
      const [s] = r.solved;
      assert.equal(s.reachable, true);
      assert.ok(Math.abs(s.error) < 0.1, `${s.result} for ${s.target}`);
      for (const v of s.values) assert.equal(r.circuit.parts.find((p) => p.id === v.id).value, r.circuit.spec.recipe.values[v.id]);
    });
  }
}

test('recipes: every goal is declared as data the solver knows', () => {
  for (const [name, recipe] of Object.entries(RECIPES)) {
    for (const g of goalsOf(recipe)) {
      const label = `${name} ${g.id}.${g.goal}`;
      assert.ok(QUANTITIES[g.goal], `${label}: a goal of goals.js QUANTITIES`);
      assert.ok(g.reading || (g.measure === 'cycle' && g.of && ESTIMATES[g.estimate]), `${label}: a reading, or a cycle with an estimate`);
      for (const id of g.set) assert.ok(['resistor', 'capacitor'].includes(recipe.parts.find((p) => p.id === id)?.type), `${label}: ${id} is a resistor or a capacitor`);
      assert.ok(recipe.parts.some((p) => p.id === g.id), `${label}: names a part`);
    }
  }
});

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
    // An entry that only carries goals has no value of its own.
    for (const [id, rule] of Object.entries(recipe.values)) if (rule.field) assert.notEqual(defaults[id], undefined, `${name}: ${id}`);
  }
});

test('recipes with a source simulate without errors and without stressing a part', () => {
  for (const name of Object.keys(RECIPES)) {
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
  assert.deepEqual(codes(expandRecipe('divider', { R1: { size: 5 } })), ['RECIPE_VALUE_FIELD']);
  // In a recipe with goals, an unknown field may be a goal asked of the wrong part: the message lists both.
  assert.deepEqual(codes(expandRecipe('npn-switch', { D1: { size: 5 } })), ['RECIPE_GOAL_UNKNOWN']);
  assert.deepEqual(codes(expandRecipe('npn-switch', { Q1: 'IRLZ44N' })), ['RECIPE_VALUE_CHOICE']);
  assert.deepEqual(codes(expandRecipe('npn-switch', { V1: 40 })), ['RECIPE_VALUE_RANGE']);
  assert.deepEqual(codes(resolveRecipe({ recipe: 'divider', nets: [['R1.1', 'T+']] })), ['RECIPE_AND_PARTS']);
  // Settings given beside a recipe replace the recipe's.
  assert.equal(resolveRecipe({ recipe: 'divider', title: 'Mine', clearance: 3 }).spec.title, 'Mine');
});

test('a recipe value the kit cannot read is refused before anything is placed, saying what it takes, in both languages', () => {
  const cases = [
    ['led-resistor', { R1: 'abc' }, 'BAD_VALUE', /^error: R1: the kit does not understand the value "abc"\. It takes a resistance in ohms, such as 330, 4k7 or 1M\.$/, /^error: R1: el kit no entiende el valor «abc»\. Lleva una resistencia en ohmios, como 330, 4k7 o 1M\.$/],
    ['rc-square', { C1: 'xyz' }, 'BAD_VALUE', /^error: C1: the kit does not understand the value "xyz"\. It takes a capacitance in farads, such as 100n/, /^error: C1: el kit no entiende el valor «xyz»\. Lleva una capacidad en faradios, como 100n/],
    ['led-resistor', { V1: 'abc' }, 'RECIPE_VALUE_NUMBER', /^error: V1 = abc is not a number: it takes one from 1\.5 to 15, such as 5\.$/, /^error: V1 = abc no es un número: lleva uno de 1,5 a 15, como 5\.$/],
    ['led-resistor', { D1: 'pink' }, 'UNKNOWN_COLOR', /^error: D1: unknown colour "pink"\. Options: red, green/, /^error: D1: color desconocido/],
  ];
  for (const [name, values, code, en, es] of cases) {
    const expanded = resolveRecipe({ recipe: name, values });
    // Refused when the recipe is expanded, or by layout's check of the parts: nothing placed either way.
    const r = expanded.problems.length ? { status: 'fix_spec', problems: expanded.problems } : autoLayout(expanded.spec);
    const label = `${name} ${JSON.stringify(values)}`;
    assert.equal(r.status, 'fix_spec', label);
    assert.equal(r.circuit, undefined, `${label}: nothing created`);
    assert.deepEqual(r.problems.map((p) => p.code), [code], label);
    assert.match(formatIssue(r.problems[0], 'en'), en, label);
    assert.match(formatIssue(r.problems[0], 'es'), es, label);
  }
  // Values the kit reads stay as they were.
  for (const [name, values] of [['led-resistor', { R1: '4k7', V1: '9', D1: 'green' }], ['rc-square', { C1: '4u7' }]]) {
    const r = autoLayout(resolveRecipe({ recipe: name, values }).spec);
    assert.equal(r.status, 'done', why(r));
  }
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

// The entry paragraph of a recipe's page sits under the title: a few sentences, so the drawing stays in
// the first screen of a phone (the median is about 125 characters).
test('recipes: the text each page opens with (`teaches`, in both languages) is at most 340 characters', () => {
  for (const [name, recipe] of Object.entries(RECIPES)) {
    for (const lang of ['en', 'es']) assert.ok(recipe.teaches[lang].length <= 340, `${name} ${lang}: ${recipe.teaches[lang].length} characters`);
  }
});

test('recipes: the thermistor\'s label says its value once, not its kind (the part\'s name already does)', () => {
  const { spec } = expandRecipe('ntc-follower');
  const built = buildCircuit(autoLayout(spec).circuit);
  const th = built.parts.find((p) => p.id === 'TH1');
  assert.equal(labelText(th, 'en'), 'TH1 · 10 kΩ');
  assert.equal(labelText(th, 'es'), 'TH1 · 10 kΩ');
});

// The recipes' tables (docs/en/recipes.md, docs/es/recetas.md) list each value's default as the
// recipe has it: "R1 = 1k (base)", "R1, R2 = 330", "R1 … R7 = 220". A recipe's own default changed
// without its row (as npn-switch's R1 = 22k once) fails here. A board's sketch is not compared.
test('the recipes documents give every recipe a row whose defaults are the recipe\'s, in both languages', () => {
  const idsOf = (spec) => {
    const run = /^([A-Z]+)(\d+)\s*…\s*[A-Z]+(\d+)$/.exec(spec);
    return run ? Array.from({ length: Number(run[3]) - Number(run[2]) + 1 }, (_, i) => `${run[1]}${Number(run[2]) + i}`) : spec.split(/\s*,\s*/);
  };
  for (const [file, decimal] of [['docs/en/recipes.md', '.'], ['docs/es/recetas.md', ',']]) {
    const listed = new Set();
    for (const line of readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').split('\n')) {
      const row = /^\| `([^`]+)` \| .* \| ([^|]+) \|$/.exec(line);
      const recipe = row && RECIPES[row[1]];
      if (!recipe) continue;
      listed.add(row[1]);
      const defaults = recipeDefaults(recipe);
      const cells = [...row[2].replace(/\([^)]*\)/g, '').matchAll(/([A-Z]+\d+(?:\s*(?:,|…)\s*[A-Z]+\d+)*)\s*=\s*(\d+,\d+|[^,\s]+)/g)];
      assert.ok(cells.length, `${file}, ${row[1]}: no "ID = value" in its row`);
      for (const c of cells) {
        for (const id of idsOf(c[1])) {
          assert.ok(recipe.values[id], `${file}, ${row[1]}: ${id} is not one of its values`);
          if (recipe.values[id].field === 'program') continue;
          assert.equal(c[2].replace(decimal, '.'), String(defaults[id]), `${file}, ${row[1]}: ${id}'s default`);
        }
      }
    }
    assert.deepEqual([...listed].sort(), Object.keys(RECIPES).sort(), `${file}: one row per recipe`);
  }
});
