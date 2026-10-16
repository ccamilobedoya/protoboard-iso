// The Falstad comparison cases (see scripts/falstad.js): circuit files in cases/, references
// in refs/ (what Falstad gave for the exact export of each). Most are compared at their DC
// operating point; those in TRANSIENT are run from t = 0 to `stop` with Falstad's own time step
// (the export's) and compared sample by sample.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { compile } from '../../src/sim/compile.js';
import { createEngine } from '../../src/sim/engine.js';
import { toFalstad } from '../../src/sim/falstad.js';

export const CASES = new URL('./cases/', import.meta.url);
export const REFS = new URL('./refs/', import.meta.url);

export const TRANSIENT = {
  'rc-square': { stop: 0.02 },
  'rectifier-half-wave': { stop: 0.1 },
};

export const caseNames = () => readdirSync(CASES).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
export const readCase = (name) => JSON.parse(readFileSync(new URL(`${name}.json`, CASES), 'utf8'));

// The exact export of a case and the nodes to read (every group but ground, which is 0 V).
export function exportCase(name) {
  const { program, issues } = compile(readCase(name));
  if (!program) throw new Error(`${name}: ${JSON.stringify(issues)}`);
  const engine = createEngine(program);
  const { text, notes, step } = toFalstad(program, { exact: true, timeConstants: engine.timeConstants() });
  return { name, text, notes, step, ground: program.ground, nodes: program.nodes, ...(TRANSIENT[name] && { stop: TRANSIENT[name].stop }) };
}

export const refFile = (name) => new URL(`${name}.json`, REFS);
export const readRef = (name) => (existsSync(refFile(name)) ? JSON.parse(readFileSync(refFile(name), 'utf8')) : null);
