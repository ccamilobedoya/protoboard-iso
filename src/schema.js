// JSON Schemas for the circuit file and for operation batches, built from the registries
// so they never drift from the code. `npm run schemas` writes them to schema/; a test
// fails if the files are out of date. Editors use them for completion, the MCP server for
// its tool input schemas.

import { PART_TYPES } from './parts/types/index.js';
import { BOARDS } from './board/board.js';
import { VIEWS } from './core/camera.js';
import { CIRCUIT_FIELDS } from './ops.js';
import { LANGUAGES } from './i18n/index.js';
import { BATTERY_FORMATS, BATTERY_CHEMISTRIES } from './parts/batteries.js';
import { LDR_PARTS } from './parts/types/more.js';

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
      power: { type: 'string', description: 'resistor: "1/8", "1/4", "1/2", "1"; "3", "5", "10" draw a cement resistor' },
      kind: { enum: ['ceramic', 'electrolytic'] },
      voltage: { type: 'number', description: 'electrolytic: rated volts; battery: measured open-circuit volts (wins over charge)' },
      diameter: { type: 'number' },
      height: { type: 'number' },
      color: { type: 'string' },
      size: { enum: [3, 5] },
      part: { type: 'string', description: 'Part number for diode, zener, bridge, mosfet, bjt, ic, regulator, ldr (see src/parts/db.js); module: ESP32-DEVKIT, ESP32-C3-SUPERMINI, UNO (see src/parts/modules.js)' },
      package: { type: 'string' },
      pinNames: { type: 'array', items: text },
      marking: { type: 'string' },
      style: { enum: ['arc', 'flat', 'knob', 'trimmer'], description: 'wire: "arc" | "flat"; potentiometer: "knob" (default) | "trimmer" (multi-turn 3296W)' },
      pin1: { type: 'string', description: 'DIP chips: hole of pin 1 (row e or f); the other pins follow. Header: first pin, the others towards higher columns. Module straddling the channel (ESP32): hole of pin 1, the other row rowSpacing holes away' },
      rowSpacing: { type: 'integer', minimum: 4, maximum: 12, description: 'module (ESP32 boards): holes between its two rows of pins; boards differ (DevKit default 9 = 0.9")' },
      wires: { type: 'object', additionalProperties: { type: 'string' }, description: 'module UNO: colour of the Dupont lead of each pin, e.g. { "D13": "yellow" }' },
      position: { type: 'number', minimum: 0, maximum: 1, description: 'potentiometer wiper position' },
      pressed: { type: 'boolean', description: 'button state' },
      format: { enum: Object.keys(BATTERY_FORMATS), description: 'battery: AA, AAA, 18650, 9V or pouch (LiPo)' },
      chemistry: { enum: BATTERY_CHEMISTRIES, description: 'battery: default by format (AA/AAA alkaline, 18650 li-ion, pouch lipo)' },
      cells: { type: 'integer', minimum: 1, maximum: 12, description: 'battery: cells (or 9 V blocks) in series; voltages add up' },
      charge: { type: 'number', minimum: 0, maximum: 1, description: 'battery: state of charge, 0 empty … 1 full; without it, the nominal voltage' },
      capacity: { oneOf: [text, { type: 'number' }], description: 'battery: "2000 mAh" (a number is mAh); default by format' },
      internalResistance: { type: 'number', minimum: 0, description: 'battery: ohms, for the whole pack' },
      switch: { enum: ['on', 'off'], description: 'battery: a holder with a slide switch, and its position' },
      side: { enum: ['left', 'right', 'back', 'front'], description: 'battery: board edge it lies beside (default: the nearer side edge); module UNO: back (default) or front' },
      offset: { type: 'number', description: 'battery, module UNO: shift along that edge, mm' },
      count: { type: 'integer', minimum: 1, maximum: 40, description: 'header: number of pins (place with pin1)' },
      beta: { type: 'number', description: 'thermistor: B constant in kelvin (default 3950)' },
      temperature: { type: 'number', description: 'thermistor: °C for the simulation (default 25)' },
      light: { type: 'number', minimum: 0, description: `ldr: illuminance in lux for the simulation (default 100). Parts: ${Object.keys(LDR_PARTS).join(', ')}` },
      dcr: { type: 'number', minimum: 0, description: 'inductor: winding resistance, ohms' },
      current: { type: 'number', exclusiveMinimum: 0, description: 'inductor: rated current, amperes' },
      resistance: { oneOf: [text, { type: 'number' }], description: 'buzzer: coil resistance (default 16 Ω)' },
      description: { ...localized, description: 'How the part is used in this circuit, shown in its card in the page. A plain string is shown as it is in every language; { "en": …, "es": … } is shown in the page language. Leave it out when the learner should find it out.' },
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
      lang: { enum: Object.keys(LANGUAGES), description: 'Language of everything made from this circuit: drawing labels, the page, messages. A language asked for explicitly (--lang, MCP lang) wins.' },
      board: { enum: Object.keys(BOARDS) },
      view: { enum: Object.keys(VIEWS) },
      clearance: { type: 'number', minimum: 0, description: 'Minimum gap between bodies, mm' },
      netLabels: { type: 'object', additionalProperties: text },
      supplies: {
        type: 'array',
        description: 'Simulation: where the power comes from, besides battery parts. The first supply\'s negative is ground (0 V); with none, the first battery part\'s.',
        items: {
          type: 'object',
          anyOf: [{ required: ['voltage'] }, { required: ['format'] }, { required: ['chemistry'] }],
          properties: {
            id: { type: 'string', description: 'e.g. V1' },
            kind: { enum: ['bench', 'battery'], description: 'battery: like a battery part (format, chemistry, cells, charge), or only a voltage (0.25 Ω per 1.5 V cell unless given)' },
            format: { enum: Object.keys(BATTERY_FORMATS) },
            chemistry: { enum: BATTERY_CHEMISTRIES },
            cells: { type: 'integer', minimum: 1, maximum: 12 },
            charge: { type: 'number', minimum: 0, maximum: 1 },
            capacity: { oneOf: [text, { type: 'number' }] },
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
        properties: {
          results: { type: 'boolean', description: 'Simulation always on in the page: the tapped part shows its values on the board and in its card' },
          flow: { type: 'boolean', description: 'Add the current layer: everything dimmed, strips shown, moving dots (needs supplies or a battery)' },
          focus: { type: 'array', items: text, description: 'Parts in focus when the page opens (the ones being explained)' },
          controls: {
            type: 'array',
            description: 'Live page: a panel with the controls a lesson puts in front (every adjustable part also has its own in its card). Each names a part or a supply and one of its controls: resistance (resistor), temperature (thermistor), light (photoresistor), position (potentiometer), pressed (push button, momentary), voltage (bench supply), charge (battery)',
            items: {
              type: 'object',
              properties: {
                part: { type: 'string', description: 'id of the part' },
                supply: { type: 'string', description: 'id of a supply (a drawn battery: use part)' },
                field: { enum: ['resistance', 'temperature', 'light', 'position', 'pressed', 'voltage', 'charge'] },
                min: { type: 'number', description: 'slider start, in the unit of the field (ohms, °C, lux, 0…1, volts)' },
                max: { type: 'number', description: 'slider end' },
                scale: { enum: ['linear', 'log'] },
                label: text,
              },
              required: ['field'],
              additionalProperties: false,
            },
          },
          start: { enum: ['dc', 'zero'], description: "Live simulation (with results or flow): 'dc' opens at the DC values (default); 'zero' switches on at t = 0 with capacitors discharged and runs" },
        },
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
