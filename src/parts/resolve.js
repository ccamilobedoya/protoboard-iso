// From what a person writes to a part the kit knows. A brief says "7805", "KCD1", "UNO",
// "GL5528" or "resistencia"; the kit already has the tables (part numbers, modules,
// photoresistors), so the type need not be looked up first:
//
//   resolvePart({ id: 'U1', part: '7805' })  → { part: { id: 'U1', type: 'regulator', part: '7805' } }
//   resolvePart({ id: 'S1', part: 'KCD1' })  → { part: { id: 'S1', type: 'switch', style: 'rocker' } }
//   resolvePart({ id: 'X', part: '1N4148W' }) → { error: { code: 'UNKNOWN_PART_NAME', params: { …, suggestions: '1N4148, …' } } }
//
// pinsOf(part) gives the pin names a resolved part takes (for parts beside the board, all the
// ones it can use), so a list of nets can be checked before anything is placed.

import { PART_TYPES } from './types/index.js';
import { PART_NUMBERS, lookupPartNumber } from './db.js';
import { MODULES, lookupModule, headerPins } from './modules.js';
import { LDR_PARTS } from './sensors.js';
import { SWITCH_STYLES } from './types/switch.js';

// Names that are neither types nor part numbers: what a part is called on the bench or in a
// brief, and the types in Spanish. Each one is the fields it stands for.
export const PART_ALIASES = {
  KCD1: { type: 'switch', style: 'rocker' },
  ROCKER: { type: 'switch', style: 'rocker' },
  BASCULANTE: { type: 'switch', style: 'rocker' },
  LATCHING: { type: 'switch', style: 'latching' },
  '7X7': { type: 'switch', style: 'latching' },
  ENCLAVAMIENTO: { type: 'switch', style: 'latching' },
  RESISTENCIA: { type: 'resistor' },
  CONDENSADOR: { type: 'capacitor' },
  DIODO: { type: 'diode' },
  PUENTE: { type: 'bridge' },
  INTERRUPTOR: { type: 'switch' },
  PULSADOR: { type: 'button' },
  REGULADOR: { type: 'regulator' },
  CABLE: { type: 'wire' },
  BATERIA: { type: 'battery' },
  PILA: { type: 'battery' },
  BOBINA: { type: 'inductor' },
  TERMISTOR: { type: 'thermistor' },
  NTC: { type: 'thermistor' },
  FOTORRESISTENCIA: { type: 'ldr' },
  ZUMBADOR: { type: 'buzzer' },
  POTENCIOMETRO: { type: 'potentiometer' },
  TRIMMER: { type: 'potentiometer', style: 'trimmer' },
  '3296W': { type: 'potentiometer', style: 'trimmer' },
  PINES: { type: 'header' },
};

const norm = (s) => String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '');

// Every name the kit answers to, for suggestions.
const ALL_NAMES = [...Object.keys(PART_TYPES), ...Object.keys(PART_NUMBERS), ...Object.keys(MODULES), ...Object.keys(LDR_PARTS), ...Object.keys(PART_ALIASES)];

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// The kit's names closest to one it does not know: the same start, contained, or a few edits away.
export function closestNames(name, count = 3) {
  const n = norm(name);
  if (!n) return [];
  return ALL_NAMES.map((candidate) => {
    const c = norm(candidate);
    const score = c === n ? 0 : c.startsWith(n) || n.startsWith(c) ? 1 : c.includes(n) || n.includes(c) ? 1.5 : distance(n, c);
    return { candidate, score };
  })
    .filter(({ score, candidate }) => score <= Math.max(2, Math.floor(norm(candidate).length / 3)))
    .sort((a, b) => a.score - b.score || a.candidate.localeCompare(b.candidate))
    .slice(0, count)
    .map(({ candidate }) => candidate);
}

// A part as written to a part the kit can build: { part } or { error }.
export function resolvePart(raw) {
  const part = { ...raw };
  if (PART_TYPES[part.type]) return { part };
  const name = part.type ?? part.part;
  const key = norm(name);
  const typeName = Object.keys(PART_TYPES).find((t) => norm(t) === key);
  if (typeName) {
    const out = { ...part, type: typeName };
    if (norm(part.part) === key) delete out.part;
    return { part: out };
  }
  const alias = PART_ALIASES[key];
  if (alias) {
    const out = { ...part, ...alias };
    if (norm(part.part) === key) delete out.part;
    return { part: out };
  }
  const number = lookupPartNumber(name);
  if (number) return { part: { ...part, type: number.entry.type, part: number.number } };
  const module = lookupModule(name);
  if (module) return { part: { ...part, type: 'module', part: module.id } };
  const ldr = Object.keys(LDR_PARTS).find((k) => norm(k) === key);
  if (ldr) return { part: { ...part, type: 'ldr', part: ldr } };
  return { error: { severity: 'error', code: 'UNKNOWN_PART_NAME', params: { part: part.id ?? '?', name: String(name ?? '—'), suggestions: closestNames(name).join(', ') || '—' } } };
}

// The pin names a resolved part takes; for a switch or a board beside the breadboard, all the
// ones it has (a circuit lists only those it uses).
export function pinsOf(part) {
  const type = PART_TYPES[part.type];
  if (!type) return [];
  if (part.type === 'switch') return SWITCH_STYLES[part.style ?? 'rocker']?.pins ?? [];
  if (part.type === 'module') {
    const found = lookupModule(part.part);
    if (found) return found.module.mount === 'straddle' ? found.module.pins : headerPins(found.module);
  }
  const def = type.resolve(part);
  if (def.error) return type.pins ?? [];
  return def.pinNames ?? type.pins ?? [];
}
