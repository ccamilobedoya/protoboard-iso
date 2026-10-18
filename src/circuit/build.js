// From a circuit file to resolved parts, geometry, connectivity and issues.
//
//   circuit file ──resolve types──▶ packages + params ──place on board──▶ hole positions
//        ──build──▶ 3D primitives          ──board strips──▶ netlist
//        ──checks──▶ issues
//
// The netlist and each part's `electrical` description are what the simulator will
// read in the next stage; drawing never depends on it.

import { nearestHoles, createBoard, columnsUsed, BOARDS } from '../board/board.js';
import { PART_TYPES } from '../parts/types/index.js';
import { PACKAGES } from '../parts/packages/index.js';
import { checkOccupancy, checkLeads, checkConnections, checkCollisions, checkCrossings, checkDescriptions } from './checks.js';
import { LANGUAGES } from '../i18n/index.js';
import { strayFields, fieldsOfType } from '../parts/fields.js';

// { nearest: 'B-6, B-8' } for a hole name that is not on the board, or nothing.
const nearestOf = (board, name) => {
  const list = nearestHoles(board, name);
  return list.length ? { nearest: list.join(', ') } : {};
};

const err = (code, params) => ({ severity: 'error', code, params });

function mapPins(part, names) {
  const given = part.pins;
  const issues = [];
  let holes = [];
  if (Array.isArray(given)) {
    if (given.length !== names.length) {
      issues.push(err('PIN_COUNT', { part: part.id, expected: names.length, names: names.join(', '), got: given.length }));
    } else {
      holes = given;
    }
  } else if (given && typeof given === 'object') {
    const lower = new Map(names.map((n) => [n.toLowerCase(), n]));
    const byName = {};
    for (const [key, hole] of Object.entries(given)) {
      const name = lower.get(key.toLowerCase());
      if (!name) issues.push(err('UNKNOWN_PIN', { part: part.id, pin: key, names: names.join(', ') }));
      else byName[name] = hole;
    }
    holes = names.map((n) => byName[n]);
    names.forEach((n, i) => {
      if (holes[i] === undefined) issues.push(err('MISSING_PIN', { part: part.id, pin: n }));
    });
  } else {
    issues.push(err('PIN_COUNT', { part: part.id, expected: names.length, names: names.join(', '), got: 0 }));
  }
  return { holes, issues };
}

// headroom: extra columns for an elastic board beyond the ones the circuit uses (suggest).
export function buildCircuit(circuit, { headroom = 0 } = {}) {
  const issues = [];
  if (!circuit || typeof circuit !== 'object' || !Array.isArray(circuit.parts)) {
    return { board: null, parts: [], issues: [err('INVALID_CIRCUIT', {})], netlist: { nodes: {} } };
  }
  const boardId = circuit.board ?? 'bb830';
  if (typeof boardId === 'string' && !BOARDS[boardId]) {
    return { board: null, parts: [], issues: [err('UNKNOWN_BOARD', { board: boardId, options: Object.keys(BOARDS).join(', ') })], netlist: { nodes: {} } };
  }
  const board = createBoard(boardId, { columns: columnsUsed(circuit) + 2 + headroom });
  const parts = [];
  const seen = new Set();

  circuit.parts.forEach((raw, index) => {
    if (!raw || !raw.id) {
      issues.push(err('MISSING_ID', { index: index + 1 }));
      return;
    }
    if (seen.has(raw.id)) {
      issues.push(err('DUPLICATE_ID', { part: raw.id }));
      return;
    }
    seen.add(raw.id);

    const type = PART_TYPES[raw.type];
    if (!type) {
      issues.push(err('UNKNOWN_TYPE', { part: raw.id, type: String(raw.type), options: Object.keys(PART_TYPES).join(', ') }));
      return;
    }
    for (const field of strayFields(raw)) issues.push({ severity: 'warning', code: 'UNKNOWN_FIELD', params: { part: raw.id, field, fields: fieldsOfType(raw.type).join(', ') } });
    const def = type.resolve(raw);
    if (def.error) {
      issues.push(err(def.error.code, { part: raw.id, ...def.error.params }));
      return;
    }
    const pkg = PACKAGES[def.package];
    if (!pkg) {
      issues.push(err('UNKNOWN_PACKAGE', { part: raw.id, package: String(def.package), options: Object.keys(PACKAGES).join(', ') }));
      return;
    }
    const pinNames = def.pinNames ?? type.pins;
    // Packages with many leads (DIP) can be placed by pin 1 only.
    let source = raw;
    if (raw.pin1 !== undefined && raw.pins === undefined && pkg.expandPin1) {
      const holes = pkg.expandPin1(board, raw.pin1, def.params);
      if (!holes) {
        // A package may explain where its pin 1 can go (a development board: rows that depend
        // on its row spacing).
        const help = pkg.pin1Help?.(board, def.params);
        issues.push(help ? err(help.code, { part: raw.id, hole: String(raw.pin1), ...help.params }) : err('BAD_PIN1', { part: raw.id, hole: String(raw.pin1) }));
        return;
      }
      source = { ...raw, pins: holes };
    }
    const mapped = mapPins(source, pinNames);
    issues.push(...mapped.issues);
    if (mapped.issues.length) return;

    const holes = [];
    let missing = false;
    mapped.holes.forEach((name, i) => {
      const hole = board.find(name);
      if (!hole) {
        issues.push(err('UNKNOWN_HOLE', { part: raw.id, pin: pinNames[i], hole: String(name), ...nearestOf(board, name) }));
        missing = true;
      }
      holes.push(hole);
    });
    if (missing) return;

    const built = pkg.build({ pins: holes.map((h) => h.pos), params: def.params, board });
    parts.push({ id: raw.id, type: raw.type, raw, def, pkg, pinNames, holes, built });
  });

  const nodes = {};
  for (const part of parts) {
    part.holes.forEach((hole, i) => {
      (nodes[hole.node] ??= []).push({ part: part.id, pin: part.pinNames[i], hole: hole.id });
    });
  }
  const netlist = { board: board.spec.id, nodes };

  issues.push(...checkOccupancy(parts));
  for (const part of parts) issues.push(...checkLeads(part, board.pitch));
  issues.push(...checkConnections(parts, netlist, { netLabels: circuit.netLabels }));
  issues.push(...checkCollisions(parts, { clearance: Number(circuit.clearance) || 0 }));
  issues.push(...checkCrossings(parts));
  issues.push(...checkDescriptions(parts, Object.keys(LANGUAGES)));

  return { board, parts, issues, netlist };
}
