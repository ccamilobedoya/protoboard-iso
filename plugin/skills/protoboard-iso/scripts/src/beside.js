// Files a circuit names beside itself (a board's program "blink.ino", a page's tour
// "tours/npn-switch.json"): read only from the circuit's folder, after links are followed, and only
// up to a size. A circuit from someone else must not read other files (CLAUDE.md, "External input").

import { readFileSync, statSync, existsSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';

// The folder a circuit was loaded from (node/workspace.js sets it, unsaved).
export const CIRCUIT_FOLDER = Symbol.for('protoboard-iso.folder');

const within = (folder, file) => {
  const rel = relative(folder, file);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

// { text } or { error: 'outside' | 'file' | 'size', size }: outside the folder, missing or
// unreadable (or no folder: a circuit given whole), larger than `limit` bytes.
export function readBeside(circuit, name, limit) {
  const folder = circuit?.[CIRCUIT_FOLDER];
  const file = folder ? resolve(folder, name) : null;
  if (file && (!within(resolve(folder), file) || (existsSync(file) && !within(realpathSync(folder), realpathSync(file))))) return { error: 'outside' };
  try {
    if (!file) throw new Error('no folder');
    const size = statSync(file).size;
    if (size > limit) return { error: 'size', size };
    return { text: readFileSync(file, 'utf8') };
  } catch {
    return { error: 'file' };
  }
}
