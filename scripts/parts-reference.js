#!/usr/bin/env node
// What each part takes, as the skill's reference plugin-src/references/parts.md: for every part type
// its pins, the fields a spec and a `set` operation take, its part numbers (and the ones only drawn),
// what a run changes on it (`simulate --set`, the page's sliders) and the environment's fields it
// reads, with units and ranges. Written from the kit's own data (src/node/catalog.js partReference);
// test/parts-reference.test.js fails when the file is stale.
//
//   npm run parts-reference             show it
//   npm run parts-reference -- --write  write it

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { partReference } from '../src/node/catalog.js';
import { FIELDS } from '../src/sim/environment.js';
import { t } from '../src/i18n/index.js';
import { PART_TYPES } from '../src/parts/types/index.js';
import { FILE as SKETCH_FILE, sketchReference } from './sketch-reference.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export const FILE = join(root, 'plugin-src/references/parts.md');

const code = (s) => `\`${s}\``;
const num = (v) => (Math.abs(v) >= 1e6 ? v.toExponential().replace('e+', 'e') : String(v));
const range = (lo, hi, unit) => `${num(lo)} … ${num(hi)}${unit ? ` ${unit}` : ''}`;

// "position 0 … 1 (a share: 0.5 is half)", "pressed on / off (momentary: --press)".
function controlText(field, c) {
  if (c.scale === 'momentary') return `${code(field)} on / off (held: \`--press ID@t+dur\`)`;
  if (c.scale === 'toggle') return `${code(field)} on / off`;
  const [lo, hi] = c.limit ?? [c.min, c.max];
  const share = c.percent ? ', a share: 0.5 is half' : '';
  const slider = c.limit && (c.limit[0] !== c.min || c.limit[1] !== c.max) ? `; the slider ${range(c.min, c.max, c.unit)}` : '';
  return `${code(field)} ${range(lo, hi, c.unit)}${share}${slider}`;
}

function senseText(field) {
  const f = FIELDS[field];
  if (!f) return code(field);
  return f.kind === 'switch' ? `${code(field)} (on / off)` : `${code(field)} in ${f.unit} (\`--env\` ${range(f.min, f.max, f.unit)})`;
}

// One line about a variant (the bare type or a group of part numbers): pins, simulated, run, environment.
function variantLines(v) {
  if (v.simulated === false) return [`drawn, not simulated: it gives no readings and no warnings, and a circuit with it ends \`WARNINGS\`${v.pins?.length ? `; pins ${v.pins.map(code).join(', ')}` : ''}`];
  const out = [];
  if (v.pins?.length) out.push(`pins ${v.pins.map(code).join(', ')}`);
  const controls = Object.entries(v.controls ?? {});
  out.push(controls.length ? `while it runs: ${controls.map(([f, c]) => controlText(f, c)).join('; ')}` : 'nothing to change while it runs');
  if (v.senses?.length) out.push(`reads the environment's ${v.senses.map(senseText).join(', ')}, unless the part gives its own value`);
  return out;
}

// A field's description is the schema's, shared by every type that has the field and written
// "type: what; other-type PART: what". Keep the pieces about this type and the ones about no type,
// without the type's own name in front. A piece ends at "; " or ". " outside brackets.
const PIECE = /^([a-z][a-z0-9-]*(?: [A-Z0-9][\w.-]*)*(?:, [a-z][a-z0-9-]*(?: [A-Z0-9][\w.-]*)*)*(?: \([^)]*\))?): /;
const ALIAS = { electrolytic: 'capacitor' }; // a piece about a kind of one type
function pieces(text) {
  const out = [];
  let depth = 0;
  let from = 0;
  for (let k = 0; k < text.length; k++) {
    const c = text[k];
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (depth === 0 && (c === ';' || c === '.') && text[k + 1] === ' ' && /[a-z]/.test(text[k + 2] ?? '')) {
      out.push(text.slice(from, k));
      from = k + 2;
    }
  }
  return [...out, text.slice(from)];
}
export function forType(text, type) {
  const typeNames = new Set([...Object.keys(PART_TYPES), ...Object.keys(ALIAS)]);
  const kept = pieces(String(text)).filter((p) => {
    const m = PIECE.exec(p);
    const words = m ? m[1].replace(/\([^)]*\)/g, '').split(/,? /).map((w) => ALIAS[w] ?? w) : [];
    return !words.some((w) => typeNames.has(w)) || words.includes(type);
  });
  return kept.map((p) => p.replace(new RegExp(`^${type}: `), '').replace(/\.$/, '')).join('; ');
}

// What a value is for each type that takes one: the kit's own words when it cannot read one.
const VALUE_OF = { resistor: 'resistance', potentiometer: 'resistance', thermistor: 'resistance', capacitor: 'capacitance', inductor: 'inductance', zener: 'zener' };
const valueText = (type) => {
  const said = t('en', `check.BAD_VALUE.${VALUE_OF[type]}`);
  return VALUE_OF[type] && /It takes (.*)\.$/.exec(said)?.[1];
};
// Fields of a circuit written by hand: layout places every part and ignores them.
const PLACEMENT = ['pin1', 'rowSpacing', 'side', 'offset'];

const signature = (v) => JSON.stringify([v.pins, v.simulated, v.controls, v.senses]);

function typeSection(e) {
  const lines = [`## ${code(e.type)} · ${e.name}`, ''];
  const about = (f, d) => {
    if (f === 'part') return `${code('part')}: a part number below`;
    const text = f === 'value' && valueText(e.type) ? valueText(e.type) : forType(d, e.type);
    return `${code(f)}${text ? `: ${text}` : ''}`;
  };
  const entries = Object.entries(e.fields);
  const fields = entries.filter(([f]) => !PLACEMENT.includes(f)).map(([f, d]) => about(f, d));
  const placed = entries.filter(([f]) => PLACEMENT.includes(f)).map(([f]) => code(f));
  lines.push(`- Fields (spec, or \`set\` in an operation): ${fields.length ? fields.join(' · ') : 'none beyond `id` and `description`'}${placed.length ? `. Only in a circuit written by hand: ${placed.join(', ')}` : ''}`);
  // The bare type only when it is a part of its own (fixed pins); otherwise the part number decides.
  const numbered = e.variants.filter((v) => v.part);
  const bare = e.variants.find((v) => !v.part);
  const shown = [...(bare && (e.pins || !numbered.length) ? [{ ...bare, part: null }] : []), ...numbered];
  const groups = new Map();
  for (const v of shown) {
    const key = signature(v);
    if (!groups.has(key)) groups.set(key, { ...v, names: [] });
    groups.get(key).names.push(v.part);
  }
  for (const g of groups.values()) {
    const who = g.names.map((n) => (n ? code(n) : 'No part number')).join(', ');
    lines.push(`- ${who}: ${variantLines(g).join('; ')}.`);
  }
  if (e.roles) lines.push(`- What each pin does: ${e.roles.join('; ')}.`);
  if (e.note) lines.push(`- ${e.note}`);
  return lines.join('\n');
}

export function partsReference() {
  const head = [
    '# What each part takes',
    '',
    '<!-- generated: npm run parts-reference -- --write (from the kit\'s own data; do not edit) -->',
    '',
    'For every part type: the fields a spec and a `set` operation take; then, for the type and each',
    'part number, its pins, what a run changes on it (`kit simulate <folder> --run <s> --set',
    'ID.field=value`, and the page\'s sliders; a single control can go as `--set ID=value`) and the',
    'environment\'s fields it reads (`--env field=value`, or the circuit\'s `environment`). A field the',
    'part gives itself wins over the environment. Ranges are what the kit accepts; units as printed.',
    '`kit catalog <name>` says the same for one entry, with its limits.',
  ];
  return `${[head.join('\n'), ...partReference('en').map(typeSection)].join('\n\n')}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // sketch.md (scripts/sketch-reference.js) is written and checked with it.
  if (process.argv.includes('--write')) {
    writeFileSync(FILE, partsReference());
    writeFileSync(SKETCH_FILE, sketchReference());
    console.log('plugin-src/references/parts.md and sketch.md written.');
  } else if (process.argv.includes('--check')) {
    const fresh = readFileSync(FILE, 'utf8') === partsReference() && readFileSync(SKETCH_FILE, 'utf8') === sketchReference();
    console.log(fresh ? 'parts.md and sketch.md are up to date.' : 'parts.md or sketch.md is stale: npm run parts-reference -- --write');
    process.exitCode = fresh ? 0 : 1;
  } else process.stdout.write(partsReference());
}
