// The Falstad comparison cases (see scripts/falstad.js): circuit files in cases/, references
// in refs/ (what Falstad gave for the exact export of each).

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { compile } from '../../src/sim/compile.js';
import { createEngine } from '../../src/sim/engine.js';
import { toFalstad } from '../../src/sim/falstad.js';

export const CASES = new URL('./cases/', import.meta.url);
export const REFS = new URL('./refs/', import.meta.url);

export const caseNames = () => readdirSync(CASES).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
export const readCase = (name) => JSON.parse(readFileSync(new URL(`${name}.json`, CASES), 'utf8'));

// The exact export of a case and the nodes to read (every group but ground, which is 0 V).
export function exportCase(name) {
  const { program, issues } = compile(readCase(name));
  if (!program) throw new Error(`${name}: ${JSON.stringify(issues)}`);
  const engine = createEngine(program);
  const { text, notes } = toFalstad(program, { exact: true, timeConstants: engine.timeConstants() });
  return { name, text, notes, ground: program.ground, nodes: program.nodes };
}

export const refFile = (name) => new URL(`${name}.json`, REFS);
export const readRef = (name) => (existsSync(refFile(name)) ? JSON.parse(readFileSync(refFile(name), 'utf8')) : null);
