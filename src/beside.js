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

// The file a board's program names ("blink.ino"), or null when the program is the sketch's text.
export const programFile = (program) => {
  const text = String(program ?? '');
  return /\.ino$/i.test(text.trim()) && !text.includes('\n') ? text.trim() : null;
};

// A one-line program that reads as a file name and not as a sketch: no `;`, brace or parenthesis, and a
// slash or a file ending ("sketches/blink", "blink.cpp"). The kit takes it for a file name it cannot
// use (only a .ino beside the circuit is read), not for a sketch that "does not read at line 1".
export const looksLikeFileName = (program) => {
  const text = String(program ?? '').trim();
  return text !== '' && !/[\n;{}()]/.test(text) && (/[\\/]/.test(text) || /\.[A-Za-z0-9]{1,5}$/.test(text));
};

// The folder a circuit was read from, resolved, or null (a circuit given whole).
export const circuitFolder = (circuit) => (circuit?.[CIRCUIT_FOLDER] ? resolve(String(circuit[CIRCUIT_FOLDER])) : null);

// Whether `name` is a folder inside the circuit's folder (a program that names one).
export function isFolderBeside(circuit, name) {
  const folder = circuit?.[CIRCUIT_FOLDER];
  if (!folder) return false;
  const file = resolve(folder, name);
  try {
    return within(resolve(folder), file) && statSync(file).isDirectory();
  } catch {
    return false;
  }
}

// { text } or { error: 'outside' | 'folder' | 'file' | 'size', size }: outside the folder, a folder and
// not a file, missing or unreadable (or no folder: a circuit given whole), larger than `limit` bytes.
export function readBeside(circuit, name, limit) {
  const folder = circuit?.[CIRCUIT_FOLDER];
  const file = folder ? resolve(folder, name) : null;
  if (file && (!within(resolve(folder), file) || (existsSync(file) && !within(realpathSync(folder), realpathSync(file))))) return { error: 'outside' };
  try {
    if (!file) throw new Error('no folder');
    const stat = statSync(file);
    if (stat.isDirectory()) return { error: 'folder' };
    const size = stat.size;
    if (size > limit) return { error: 'size', size };
    return { text: readFileSync(file, 'utf8') };
  } catch {
    return { error: 'file' };
  }
}
