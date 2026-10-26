// Recipes: layout specs of usual lesson circuits, called by name with only the values that change
// (docs/en/recipes.md). A recipe is data (src/recipes/<name>.js): parts in signal order with their
// default values, nets, supplies, and `values`, what may be changed and which field the short
// form sets. Everything else stays as proven: a small model asks for "npn-switch with R1 = 470"
// instead of working the circuit out.
//
//   expandRecipe('npn-switch', { R1: '470', D1: { color: 'green' }, V1: 9 }) → { spec, problems }
//   resolveRecipe({ recipe, values, title, … }) → the layout spec, or problems (FIX_SPEC)

import { closestNames } from '../parts/resolve.js';
import ledResistor from './led-resistor.js';
import divider from './divider.js';
import npnSwitch from './npn-switch.js';
import potentiometerLed from './potentiometer-led.js';
import mosfetSwitch from './mosfet-switch.js';
import buttonPullup from './button-pullup.js';
import buttonPulldown from './button-pulldown.js';
import rcSquare from './rc-square.js';
import astable555 from './555-astable.js';
import regulator7805 from './regulator-7805.js';
import regulatorAms1117 from './regulator-ams1117.js';
import bridgeRectifier from './bridge-rectifier.js';
import zenerRegulator from './zener-regulator.js';
import esp32Led from './esp32-led.js';
import esp32Button from './esp32-button.js';
import opampComparator from './opamp-comparator.js';
import lm393Comparator from './lm393-comparator.js';
import opampFollower from './opamp-follower.js';
import opampNoninverting from './opamp-noninverting.js';
import opampInverting from './opamp-inverting.js';
import unoBlink from './uno-blink.js';
import unoButton from './uno-button.js';
import unoPotPwm from './uno-pot-pwm.js';
import c3Blink from './c3-blink.js';
import c3PotPwm from './c3-pot-pwm.js';

export const RECIPES = Object.fromEntries(
  [ledResistor, divider, npnSwitch, potentiometerLed, mosfetSwitch, buttonPullup, buttonPulldown, rcSquare, astable555, regulator7805, regulatorAms1117, bridgeRectifier, zenerRegulator, esp32Led, esp32Button, opampComparator, lm393Comparator, opampFollower, opampNoninverting, opampInverting, unoBlink, unoButton, unoPotPwm, c3Blink, c3PotPwm].map((r) => [r.name, r]),
);

// Fields a value may set besides its main one, by the kind of item (a part's type or "supply").
const EXTRA = {
  resistor: ['tolerance', 'power'],
  capacitor: ['kind', 'voltage'],
  led: ['color'],
  button: ['color'],
  potentiometer: ['style', 'position'],
  supply: ['voltage', 'currentLimit', 'frequency', 'amplitude', 'offset', 'waveform'],
};

const items = (recipe) => new Map([...recipe.parts.map((p) => [p.id, p]), ...(recipe.supplies ?? []).map((s) => [s.id, { ...s, supply: true }])]);
const kindOf = (item) => (item.supply ? 'supply' : item.type);
const text = (v, lang) => (v && typeof v === 'object' ? v[lang] ?? v.en : v);

// The current value of each changeable item: { R1: '1k', V1: 5, Q1: '2N2222A' }.
export function recipeDefaults(recipe) {
  const all = items(recipe);
  return Object.fromEntries(Object.entries(recipe.values).map(([id, v]) => [id, all.get(id)?.[v.field]]));
}

// The recipe's spec with the values given. Each value is the main field's ("1k", 9) or an object
// of fields ({ value: "470", tolerance: "1%" }); only items in `values` and their allowed fields.
export function expandRecipe(name, values = {}) {
  const recipe = RECIPES[String(name ?? '').trim().toLowerCase()];
  if (!recipe) {
    const close = closestNames(name, 3, Object.keys(RECIPES));
    return { problems: [{ severity: 'error', code: 'RECIPE_UNKNOWN', params: { name: String(name), recipes: (close.length ? close : Object.keys(RECIPES)).join(', ') } }] };
  }
  const problems = [];
  const all = items(recipe);
  const changes = new Map();
  for (const [id, given] of Object.entries(values ?? {})) {
    const rule = recipe.values[id];
    if (!rule) {
      problems.push({ severity: 'error', code: 'RECIPE_VALUE_UNKNOWN', params: { recipe: recipe.name, id, ids: Object.keys(recipe.values).join(', ') } });
      continue;
    }
    const allowed = [...new Set([rule.field, ...(rule.extra ?? EXTRA[kindOf(all.get(id))] ?? [])])];
    const fields = given && typeof given === 'object' ? given : { [rule.field]: given };
    for (const [field, v] of Object.entries(fields)) {
      if (!allowed.includes(field)) problems.push({ severity: 'error', code: 'RECIPE_VALUE_FIELD', params: { recipe: recipe.name, id, field, fields: allowed.join(', ') } });
      else if (field === rule.field && rule.choices && !rule.choices.some((c) => String(c).toUpperCase() === String(v).toUpperCase()))
        problems.push({ severity: 'error', code: 'RECIPE_VALUE_CHOICE', params: { id, value: String(v), choices: rule.choices.join(', ') } });
      else if (field === rule.field && (rule.min !== undefined || rule.max !== undefined) && !(Number(v) >= (rule.min ?? -Infinity) && Number(v) <= (rule.max ?? Infinity)))
        problems.push({ severity: 'error', code: 'RECIPE_VALUE_RANGE', params: { id, value: String(v), min: rule.min ?? '—', max: rule.max ?? '—' } });
      else changes.set(id, { ...changes.get(id), [field]: v });
    }
  }
  if (problems.length) return { problems };
  const apply = (item) => ({ ...item, ...changes.get(item.id) });
  const spec = {
    recipe: { name: recipe.name, ...(Object.keys(values ?? {}).length && { values }) },
    title: recipe.title,
    board: 'auto',
    ...(recipe.clearance && { clearance: recipe.clearance }),
    parts: recipe.parts.map(apply),
    nets: structuredClone(recipe.nets),
    ...(recipe.supplies && { supplies: recipe.supplies.map(apply) }),
    ...(recipe.netLabels && { netLabels: recipe.netLabels }),
    ...(recipe.page && { page: recipe.page }),
  };
  return { spec, problems: [] };
}

// A layout request as given (CLI spec file or MCP arguments) → the layout spec. With `recipe`, the
// recipe expanded; title, board, page, netLabels, clearance and lang given replace the recipe's.
// A recipe never comes with parts or nets: to add to a recipe circuit, lay it out again with them.
export function resolveRecipe(given) {
  if (!given?.recipe) return { spec: given, problems: [] };
  if (given.parts || given.nets) return { problems: [{ severity: 'error', code: 'RECIPE_AND_PARTS', params: { recipe: String(given.recipe) } }] };
  const { recipe, values, ...rest } = given;
  const r = expandRecipe(recipe, values);
  if (r.problems.length) return r;
  return { spec: { ...r.spec, ...rest }, problems: [] };
}

// Short entries for the catalog: name, title, what it teaches, the changeable values with defaults.
export function recipeSummary(lang = 'en') {
  return Object.fromEntries(Object.values(RECIPES).map((r) => [r.name, { title: text(r.title, lang), values: recipeDefaults(r) }]));
}

// One recipe in full for the catalog: what it teaches, its parts, nets and supplies, and the
// values with their role, choices or range.
export function recipeEntry(name, lang = 'en') {
  const r = RECIPES[String(name ?? '').trim().toLowerCase()];
  if (!r) return null;
  const defaults = recipeDefaults(r);
  return {
    kind: 'recipe',
    recipe: r.name,
    title: text(r.title, lang),
    teaches: text(r.teaches, lang),
    parts: r.parts,
    nets: r.nets,
    ...(r.supplies && { supplies: r.supplies }),
    values: Object.fromEntries(
      Object.entries(r.values).map(([id, v]) => [id, { field: v.field, default: defaults[id], ...(v.role && { role: text(v.role, lang) }), ...(v.choices && { choices: v.choices }), ...(v.min !== undefined && { min: v.min }), ...(v.max !== undefined && { max: v.max }) }]),
    ),
  };
}
