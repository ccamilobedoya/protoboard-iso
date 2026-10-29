// Operations on a circuit: small, validated edits instead of rewriting the file.
//
//   { op: 'add',     part: { id, type, …, pins }, index? }
//   { op: 'remove',  part: 'R1' }
//   { op: 'move',    part: 'R1', pins: ['c10', 'c14'] }        (list or object by pin name)
//   { op: 'move',    part: 'U1', pin1: 'f20' }                  (parts placed by pin 1)
//   { op: 'set',     part: 'R1', value: '4k7', tolerance: null } (null deletes a field)
//   { op: 'rename',  part: 'R1', to: 'R10' }
//   { op: 'circuit', clearance: 3, title: { … } }               (top-level fields)
//
// applyOps(circuit, ops) is atomic: either every operation applies or none does. It
// returns the new circuit and the inverse operations that undo the batch, in the order
// they must be applied. It is pure (no files), so the CLI, the MCP server and a browser
// editor all share it.

import { COMMON_FIELDS, TYPE_FIELDS } from './parts/fields.js';
import { opsTooMany, circuitTooLarge } from './limits.js';
export const OP_NAMES = ['add', 'remove', 'move', 'set', 'rename', 'circuit'];
export const CIRCUIT_FIELDS = ['title', 'lang', 'board', 'view', 'clearance', 'netLabels', 'supplies', 'page', 'spec'];
const FIXED_PART_FIELDS = ['id', 'pins', 'pin1']; // changed with `rename` and `move`

const clone = (x) => (x === undefined ? undefined : structuredClone(x));
const error = (code, params) => ({ severity: 'error', code, params });

function fieldsOf(op, skip) {
  return Object.entries(op).filter(([k]) => !skip.includes(k));
}

export function applyOps(circuit, ops) {
  if (!Array.isArray(ops) || !ops.length) return { circuit, inverse: [], errors: [error('OP_BAD', { index: 0, op: '—', need: 'a non-empty list of operations' })] };
  const many = opsTooMany(ops);
  if (many) return { circuit, inverse: [], errors: [many] };
  const next = clone(circuit ?? {});
  next.parts ??= [];
  const inverse = [];
  const errors = [];
  const indexOf = (id) => next.parts.findIndex((p) => p.id === id);

  ops.forEach((op, i) => {
    const index = i + 1;
    const name = op?.op;
    const fail = (code, params = {}) => errors.push(error(code, { index, op: String(name), ...params }));
    const partAt = () => {
      const at = indexOf(op.part);
      if (at < 0) fail('OP_UNKNOWN_PART', { part: String(op.part) });
      return at;
    };

    switch (name) {
      case 'add': {
        const part = op.part;
        if (!part || typeof part !== 'object' || !part.id || !part.type) return fail('OP_BAD', { need: 'part.id and part.type' });
        if (indexOf(part.id) >= 0) return fail('OP_DUPLICATE_ID', { part: part.id });
        const at = Number.isInteger(op.index) ? Math.max(0, Math.min(op.index, next.parts.length)) : next.parts.length;
        next.parts.splice(at, 0, clone(part));
        inverse.unshift({ op: 'remove', part: part.id });
        return;
      }
      case 'remove': {
        const at = partAt();
        if (at < 0) return;
        const [removed] = next.parts.splice(at, 1);
        inverse.unshift({ op: 'add', part: removed, index: at });
        return;
      }
      case 'move': {
        const at = partAt();
        if (at < 0) return;
        const hasPins = op.pins && typeof op.pins === 'object';
        if (!hasPins && op.pin1 === undefined) return fail('OP_BAD', { need: 'pins or pin1' });
        const part = next.parts[at];
        const back = { op: 'move', part: part.id };
        if (part.pins !== undefined) back.pins = clone(part.pins);
        if (part.pin1 !== undefined) back.pin1 = part.pin1;
        inverse.unshift(back);
        delete part.pins;
        delete part.pin1;
        if (hasPins) part.pins = clone(op.pins);
        else part.pin1 = op.pin1;
        return;
      }
      case 'set': {
        const at = partAt();
        if (at < 0) return;
        const fields = fieldsOf(op, ['op', 'part']);
        if (!fields.length) return fail('OP_BAD', { need: 'at least one field' });
        const fixed = fields.find(([k]) => FIXED_PART_FIELDS.includes(k));
        if (fixed) return fail('OP_BAD', { need: `"${fixed[0]}" changes with ${fixed[0] === 'id' ? 'rename' : 'move'}` });
        const part = next.parts[at];
        // Only fields the part's type knows: a stray key would be saved and silently ignored.
        const known = TYPE_FIELDS[part.type] ? [...COMMON_FIELDS, ...TYPE_FIELDS[part.type]] : null;
        const stray = known && fields.find(([k, v]) => !known.includes(k) && v !== null); // null still deletes it
        if (stray) return fail(stray[0] === 'field' ? 'OP_SET_FORM' : 'OP_UNKNOWN_FIELD', { part: part.id, field: stray[0], fields: known.filter((f) => !FIXED_PART_FIELDS.includes(f) && f !== 'type').join(', ') });
        const old = {};
        for (const [k, v] of fields) {
          old[k] = k in part ? clone(part[k]) : null;
          if (v === null) delete part[k];
          else part[k] = clone(v);
        }
        inverse.unshift({ op: 'set', part: part.id, ...old });
        return;
      }
      case 'rename': {
        const at = partAt();
        if (at < 0) return;
        if (!op.to) return fail('OP_BAD', { need: 'to' });
        if (indexOf(op.to) >= 0) return fail('OP_DUPLICATE_ID', { part: op.to });
        const part = next.parts[at];
        inverse.unshift({ op: 'rename', part: op.to, to: part.id });
        // The layout spec names pins by part id ("R1.2"): it follows the rename.
        if (next.spec) next.spec = renameInSpec(next.spec, part.id, op.to);
        part.id = op.to;
        return;
      }
      case 'circuit': {
        const fields = fieldsOf(op, ['op']);
        if (!fields.length) return fail('OP_BAD', { need: 'at least one field' });
        const wrong = fields.find(([k]) => !CIRCUIT_FIELDS.includes(k));
        if (wrong) return fail('OP_BAD', { need: `one of ${CIRCUIT_FIELDS.join(', ')} (not "${wrong[0]}")` });
        const old = {};
        for (const [k, v] of fields) {
          old[k] = k in next ? clone(next[k]) : null;
          if (v === null) delete next[k];
          else next[k] = clone(v);
        }
        inverse.unshift({ op: 'circuit', ...old });
        return;
      }
      default:
        fail('OP_UNKNOWN', { options: OP_NAMES.join(', ') });
    }
  });

  const large = errors.length ? null : circuitTooLarge(next);
  if (large) errors.push(large);
  if (errors.length) return { circuit, inverse: [], errors };
  return { circuit: next, inverse, errors };
}

// The layout spec (what layout was asked for: nets of pin references, supplies, the ids of its
// jumpers) with a part renamed.
function renameInSpec(spec, from, to) {
  const ref = (r) => (typeof r === 'string' && r.startsWith(`${from}.`) ? `${to}${r.slice(from.length)}` : r);
  const out = clone(spec);
  if (out.nets) out.nets = out.nets.map((n) => (Array.isArray(n) ? n.map(ref) : { ...n, pins: (n.pins ?? []).map(ref) }));
  if (out.supplies) out.supplies = out.supplies.map((s) => ({ ...s, positive: ref(s.positive), negative: ref(s.negative) }));
  if (out.wires) out.wires = out.wires.map((w) => (w === from ? to : w));
  return out;
}
