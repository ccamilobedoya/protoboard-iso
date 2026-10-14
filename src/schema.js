// JSON Schemas for the circuit file and for operation batches, built from the registries
// so they never drift from the code. `npm run schemas` writes them to schema/; a test
// fails if the files are out of date. Editors use them for completion, the MCP server for
// its tool input schemas.

import { PART_TYPES } from './parts/types/index.js';
import { BOARDS } from './board/board.js';
import { VIEWS } from './core/camera.js';
import { CIRCUIT_FIELDS } from './ops.js';

export function buildSchemas() {
  const text = { type: 'string' };
  const localized = { oneOf: [text, { type: 'object', additionalProperties: text, description: 'One string per language code, e.g. { "en": "…", "es": "…" }' }] };
  const pins = {
    description: "Holes for the leads: a list in the part's pin order, or an object by pin name. Holes: a1…j63, rails T+3, B-12…",
    oneOf: [{ type: 'array', items: text, minItems: 2 }, { type: 'object', additionalProperties: text, minProperties: 2 }],
  };
  const part = {
    type: 'object',
    required: ['id', 'type'],
    anyOf: [{ required: ['pins'] }, { required: ['pin1'] }],
    properties: {
      id: { type: 'string', description: 'Unique name, e.g. R1' },
      type: { enum: Object.keys(PART_TYPES) },
      pins,
      value: { oneOf: [text, { type: 'number' }], description: '"330", "4k7", "100n", "470u"' },
      tolerance: { oneOf: [text, { type: 'number' }], description: 'resistor: "5%", "1%"' },
      bands: { enum: [4, 5] },
      power: { type: 'string', description: 'resistor: "1/8", "1/4", "1/2", "1"' },
      kind: { enum: ['ceramic', 'electrolytic'] },
      voltage: { type: 'number' },
      diameter: { type: 'number' },
      height: { type: 'number' },
      color: { type: 'string' },
      size: { enum: [3, 5] },
      part: { type: 'string', description: 'Part number for diode, mosfet, bjt (see src/parts/db.js)' },
      package: { type: 'string' },
      pinNames: { type: 'array', items: text },
      marking: { type: 'string' },
      style: { enum: ['arc', 'flat'] },
      pin1: { type: 'string', description: 'DIP chips: hole of pin 1 (row e or f); the other pins follow' },
      position: { type: 'number', minimum: 0, maximum: 1, description: 'potentiometer wiper position' },
      pressed: { type: 'boolean', description: 'button state' },
      model: { type: 'object', description: 'Simulation: overrides the typical model, e.g. an LED measured at 20 mA { "vf": 2.95 } (see src/sim/models.js)' },
    },
    additionalProperties: true,
  };
  const circuit = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'circuit.schema.json',
    title: 'protoboard-iso circuit',
    type: 'object',
    required: ['parts'],
    properties: {
      version: { const: 1 },
      revision: { type: 'integer', minimum: 0, description: 'Bumped by every change made through apply/undo' },
      title: localized,
      board: { enum: Object.keys(BOARDS) },
      view: { enum: Object.keys(VIEWS) },
      clearance: { type: 'number', minimum: 0, description: 'Minimum gap between bodies, mm' },
      netLabels: { type: 'object', additionalProperties: text },
      supplies: {
        type: 'array',
        description: 'Simulation: where the power comes from. The first supply\'s negative is ground (0 V).',
        items: {
          type: 'object',
          required: ['voltage'],
          properties: {
            id: { type: 'string', description: 'e.g. V1' },
            kind: { enum: ['bench', 'battery'], description: 'battery: internal resistance 0.25 Ω per 1.5 V cell unless given' },
            voltage: { type: 'number', minimum: 0, description: 'volts' },
            positive: { type: 'string', description: 'hole or node of the + lead, default "T+"' },
            negative: { type: 'string', description: 'hole or node of the − lead, default "T-"' },
            currentLimit: { type: 'number', exclusiveMinimum: 0, description: 'bench supply current limit, amperes (constant current above it)' },
            internalResistance: { type: 'number', minimum: 0, description: 'ohms' },
          },
          additionalProperties: false,
        },
      },
      page: {
        type: 'object',
        description: 'The embeddable page out/<name>.html',
        properties: { results: { type: 'boolean', description: 'Add a button that shows the simulation results (hidden until pressed)' } },
        additionalProperties: false,
      },
      parts: { type: 'array', items: { $ref: '#/$defs/part' } },
    },
    $defs: { part },
    additionalProperties: false,
  };
  const partRef = { type: 'string', description: 'id of an existing part' };
  const ops = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'ops.schema.json',
    title: 'protoboard-iso operations',
    description: 'A batch of operations, applied atomically (all or none).',
    type: 'array',
    minItems: 1,
    items: {
      oneOf: [
        { type: 'object', required: ['op', 'part'], properties: { op: { const: 'add' }, part: { $ref: 'circuit.schema.json#/$defs/part' }, index: { type: 'integer', minimum: 0 } }, additionalProperties: false },
        { type: 'object', required: ['op', 'part'], properties: { op: { const: 'remove' }, part: partRef }, additionalProperties: false },
        { type: 'object', required: ['op', 'part'], properties: { op: { const: 'move' }, part: partRef, pins, pin1: text }, minProperties: 3, additionalProperties: false },
        {
          type: 'object',
          required: ['op', 'part'],
          properties: { op: { const: 'set' }, part: partRef },
          not: { anyOf: [{ required: ['id'] }, { required: ['pins'] }, { required: ['pin1'] }] },
          minProperties: 3,
          additionalProperties: true,
          description: 'Any part field except id and pins; null deletes the field',
        },
        { type: 'object', required: ['op', 'part', 'to'], properties: { op: { const: 'rename' }, part: partRef, to: text }, additionalProperties: false },
        {
          type: 'object',
          required: ['op'],
          properties: { op: { const: 'circuit' }, ...Object.fromEntries(CIRCUIT_FIELDS.map((f) => [f, circuit.properties[f]])) },
          minProperties: 2,
          additionalProperties: false,
        },
      ],
    },
  };
  return { 'circuit.schema.json': circuit, 'ops.schema.json': ops };
}
