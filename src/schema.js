// JSON Schemas for the circuit file and for operation batches, built from the registries
// so they never drift from the code. `npm run schemas` writes them to schema/; a test
// fails if the files are out of date. Editors use them for completion, the MCP server for
// its tool input schemas.

import { WAVEFORMS } from './sim/generator.js';
import { PART_TYPES } from './parts/types/index.js';
import { BOARDS } from './board/board.js';
import { VIEWS } from './core/camera.js';
import { CIRCUIT_FIELDS } from './ops.js';
import { LANGUAGES } from './i18n/index.js';
import { BATTERY_FORMATS, BATTERY_CHEMISTRIES } from './parts/batteries.js';
import { LDR_PARTS } from './parts/types/more.js';
import { RECIPES } from './recipes/index.js';
import { MOVES, RAISE, ASSEMBLE, PULSE_COLORS } from './page/client/moves.js';
import { READINGS, FORMATS, THEMES } from './tour.js';
import { LIMITS } from './limits.js';

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
      style: { enum: ['arc', 'flat', 'knob', 'trimmer', 'rocker', 'latching'], description: 'wire: "arc" | "flat"; potentiometer: "knob" (default) | "trimmer" (multi-turn 3296W); switch: "rocker" (KCD1, default) | "latching" (7 × 7 push button)' },
      pin1: { type: 'string', description: 'DIP chips: hole of pin 1 (row e or f); the other pins follow. Header: first pin, the others towards higher columns. Module straddling the channel (ESP32): hole of pin 1, the other row rowSpacing holes away' },
      rowSpacing: { type: 'integer', minimum: 4, maximum: 12, description: 'module (ESP32 boards): holes between its two rows of pins; boards differ (DevKit default 9 = 0.9")' },
      wires: { type: 'object', additionalProperties: { type: 'string' }, description: 'module UNO, switch: colour of the lead of each pin, e.g. { "D13": "yellow" }' },
      rese: { enum: ['2.2', '0.47'], description: 'module DESPI-C02: position of its RESE switch, ohms ("2.2" as sold, "0.47" for some panels)' },
      panel: { type: 'boolean', description: 'module DESPI-C02: also draw the 7.5" GDEY075T7 panel on its flat cable' },
      io: {
        type: 'object',
        additionalProperties: { enum: ['high', 'low', 'input', 'input_pullup', 'input_pulldown'] },
        description: 'module, microcontroller boards (ESP32 DevKit, ESP32-C3 SuperMini, UNO): the state of each GPIO for the simulation, by printed name, GPIO name or number ({"D13": "high", "D27": "input_pullup"}); unlisted pins are inputs (docs/en/microcontrollers.md)',
      },
      program: { type: 'string', description: 'module, microcontroller boards: its program for the simulation, the Arduino C++ subset a lesson uses: the sketch\'s text, or the name of a .ino file beside the circuit ("blink.ino"). setup() once, then loop(); delay() waits in simulated time (docs/en/microcontrollers.md)' },
      usb: { type: 'boolean', description: 'module, microcontroller boards: powered by USB (default true): the board is a 5 V source and its regulator makes the 3.3 V rail' },
      led: { type: 'string', description: 'regulator module (AMS1117): its power LED\'s resistor, "1k" (default), "200", or "none"' },
      position: { type: 'number', minimum: 0, maximum: 1, description: 'potentiometer wiper position' },
      pressed: { type: 'boolean', description: 'button state' },
      on: { type: 'boolean', description: 'switch: on (rocker on I, latching button down); default off' },
      format: { enum: Object.keys(BATTERY_FORMATS), description: 'battery: AA, AAA, 18650, 9V or pouch (LiPo)' },
      chemistry: { enum: BATTERY_CHEMISTRIES, description: 'battery: default by format (AA/AAA alkaline, 18650 li-ion, pouch lipo)' },
      cells: { type: 'integer', minimum: 1, maximum: 12, description: 'battery: cells (or 9 V blocks) in series; voltages add up' },
      charge: { type: 'number', minimum: 0, maximum: 1, description: 'battery: state of charge, 0 empty … 1 full; without it, the nominal voltage' },
      capacity: { oneOf: [text, { type: 'number' }], description: 'battery: "2000 mAh" (a number is mAh); default by format' },
      internalResistance: { type: 'number', minimum: 0, description: 'battery: ohms, for the whole pack' },
      switch: { enum: ['on', 'off'], description: 'battery: a holder with a slide switch, and its position' },
      side: { enum: ['left', 'right', 'back', 'front'], description: 'battery: board edge it lies beside (default: the nearer side edge); module UNO: back (default) or front; switch: front (default) or back' },
      offset: { type: 'number', description: 'battery, module UNO, switch: shift along that edge, mm' },
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
      spec: {
        type: 'object',
        description: 'What layout was asked for, kept so the circuit can be laid out again (layout on an existing target) and so review can check the connections: nets of pin references, supplies that name pins, and the ids of the jumpers layout added',
        properties: {
          nets: { type: 'array', items: { oneOf: [{ type: 'array', items: { type: 'string' } }, { type: 'object', properties: { pins: { type: 'array', items: { type: 'string' } }, color: { type: 'string' } }, required: ['pins'] }] } },
          supplies: { type: 'array', items: { type: 'object' } },
          wires: { type: 'array', items: { type: 'string' }, description: 'jumpers added by layout (not parts of the spec)' },
          recipe: {
            type: 'object',
            description: 'The recipe the circuit was laid out from (src/recipes/), with the values given; gone once it is laid out again with other parts or nets',
            properties: { name: { enum: Object.keys(RECIPES) }, values: { type: 'object' } },
            required: ['name'],
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
      supplies: {
        type: 'array',
        description: 'Simulation: where the power comes from, besides battery parts. The first supply\'s negative is ground (0 V); with none, the first battery part\'s.',
        items: {
          type: 'object',
          anyOf: [{ required: ['voltage'] }, { required: ['format'] }, { required: ['chemistry'] }, { required: ['frequency'] }],
          properties: {
            id: { type: 'string', description: 'e.g. V1' },
            kind: { enum: ['bench', 'battery', 'generator'], description: 'battery: like a battery part (format, chemistry, cells, charge), or only a voltage (0.25 Ω per 1.5 V cell unless given); generator: a signal generator (waveform, frequency, amplitude, offset, resistance)' },
            waveform: { enum: WAVEFORMS, description: 'generator: sine (default), square or triangle' },
            frequency: { type: 'number', exclusiveMinimum: 0, description: 'generator: hertz' },
            amplitude: { type: 'number', minimum: 0, description: 'generator: peak volts (half of peak to peak), default 1' },
            offset: { type: 'number', description: 'generator: DC offset, volts, default 0' },
            resistance: { type: 'number', minimum: 0, description: 'generator: output resistance, ohms, default 50' },
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
          simulation: { type: 'boolean', description: 'false: no simulation in the page at all (a value the learner must predict first). By default a circuit with a source gets it' },
          results: { type: 'boolean', description: 'Simulation results always on in the page (default: true with a source): the tapped part shows its values on the board and in its card, its oscilloscope and limits; LEDs light up. false turns them off' },
          flow: {
            description: "The current layer as a button in the bar, not pressed (default: true with a source): everything dimmed, conductors coloured by voltage, moving dots. false leaves it out; { style } keeps it and chooses how it is drawn: 'plan' (default: at board level, a pad at every landing, a line through two-pin parts and jumpers, a stub per pin on the others) or 'real' (along the leads and through the bodies)",
            oneOf: [{ type: 'boolean' }, { type: 'object', properties: { style: { enum: ['plan', 'real'] } }, additionalProperties: false }],
          },
          focus: { type: 'array', items: text, description: 'Parts in focus when the page opens (the ones being explained)' },
          controls: {
            type: 'array',
            description: 'Live page: a panel with the controls a lesson puts in front (every adjustable part also has its own in its card). Each names a part or a supply and one of its controls: resistance (resistor), temperature (thermistor), light (photoresistor), position (potentiometer), pressed (push button, momentary), voltage (bench supply), charge (battery), frequency and amplitude (signal generator)',
            items: {
              type: 'object',
              properties: {
                part: { type: 'string', description: 'id of the part' },
                supply: { type: 'string', description: 'id of a supply (a drawn battery: use part)' },
                field: { enum: ['resistance', 'temperature', 'light', 'position', 'pressed', 'voltage', 'charge', 'frequency', 'amplitude'] },
                min: { type: 'number', description: 'slider start, in the unit of the field (ohms, °C, lux, 0…1, volts)' },
                max: { type: 'number', description: 'slider end' },
                scale: { enum: ['linear', 'log'] },
                label: text,
              },
              required: ['field'],
              additionalProperties: false,
            },
          },
          theme: { enum: ['auto', ...THEMES], description: "Colours of the page: 'auto' follows the system (default); 'light' or 'dark' (the bench), 'notebook' (cream paper, a blue grid) or 'stage' (the notebook at night, the videos') fix them. The reader's choice in the page's menu and a link's ?theme= win over this" },
          tour: {
            description: 'The timeline the page plays as *See how it works* (and a video is made from): the name of a JSON file beside the circuit (timeline.schema.json), read only from its folder, or the timeline itself',
            oneOf: [{ type: 'string', pattern: '\\.json$' }, { $ref: 'timeline.schema.json' }],
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
  return { 'circuit.schema.json': circuit, 'ops.schema.json': ops, 'timeline.schema.json': timelineSchema(localized) };
}

// A timeline (docs/en/stage-and-video.md, "The timeline"): steps at a time in ms, each an action
// and, for what moves, one of the seven named moves. The rhythm (no two slow moves in a row, no
// two hits without a breath) needs the order of the steps: check reports it (src/tour.js).
function timelineSchema(localized) {
  const text = { allOf: [localized], description: `At most ${LIMITS.tourText} characters` };
  const id = { type: 'string', description: 'id of a part (or a supply)' };
  const reading = { enum: Object.keys(READINGS), description: 'What is read from the part: current (A), voltage (V), power (W), brightness (0…1)' };
  const common = {
    at: { type: 'number', minimum: 0, description: 'ms from the start; steps with the same at start together' },
    move: { enum: Object.keys(MOVES), description: Object.entries(MOVES).map(([n, m]) => `${n} ${m.min === m.max ? `${m.ms} ms` : `${m.min}…${m.max} ms`}`).join(', ') },
    ms: { type: 'number', minimum: 0, description: "The move's duration, within its range (push needs it most); in an assemble, each part's" },
    curve: { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4, description: "The move's own cubic-bezier [x1, y1, x2, y2] (x between 0 and 1), instead of the move's curve" },
  };
  const bool = { type: 'boolean' };
  const ms = (max, what) => ({ type: 'number', minimum: 0, maximum: max, description: what });
  const enter = { enum: ['drop', 'fade', 'cut'], description: 'How a part comes in: drop (down from height mm, default), fade, cut' };
  const wire = { enum: ['draw', 'fade', 'cut'], description: 'How a wire comes in: draw (end to end, default), fade, cut' };
  const from = { enum: ['start', 'end'], description: "The wire's end it is drawn from: start (its first pin, default) or end" };
  const show = { enum: ['rise', 'fade', 'cut'], description: 'How the lines come in: rise (from their baseline, default), fade, cut' };
  const height = { type: 'number', minimum: 0, maximum: 40, description: 'mm above the board a part starts from (default 12)' };
  const dark = { type: 'boolean', description: 'No current while it comes in (default true)' };
  const action = (name, properties, required = [], extra = {}) => ({ type: 'object', required: ['at', 'do', ...required], properties: { ...common, do: { const: name }, ...properties }, additionalProperties: false, ...extra });
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'timeline.schema.json',
    title: 'protoboard-iso timeline',
    description: 'A tour of a circuit\'s page and the script of a video: written once, played the same every time.',
    type: 'object',
    required: ['steps'],
    properties: {
      $schema: { type: 'string' },
      circuit: { type: 'string', description: 'The circuit (or recipe) it tells' },
      format: { enum: FORMATS, description: 'The video: vertical 1080 × 1920 (default) or horizontal 1920 × 1080' },
      theme: { enum: THEMES, description: "The page's theme in a recording: stage (default, the notebook at night), notebook (by day), light or dark (the bench). A link's ?theme= wins over this" },
      steps: {
        type: 'array',
        maxItems: LIMITS.tourSteps,
        items: {
          oneOf: [
            action('frame', { target: { oneOf: [{ type: 'string' }, { type: 'array', items: id, minItems: 1 }], description: 'board, parts, here (the frame as it is), a part id or a list of part ids' }, zoom: { type: 'number', minimum: 0.05, maximum: 20, description: 'Closer in (above 1) or farther out (below 1), about the centre' }, pan: { type: 'array', items: { type: 'number', minimum: -3, maximum: 3 }, minItems: 2, maxItems: 2, description: 'Then moved by [x, y] shares of the frame: [0.2, 0] a fifth to the right, [0, -0.1] a tenth up' } }, ['target']),
            action('focus', { parts: { type: 'array', items: id, description: 'The parts brought forward; [] clears. With a move, the veil, strips and coordinates come in (or leave) along it' } }, ['parts']),
            action('flip', { view: { type: 'string', description: 'A view of the page (front, back…)' } }, ['view']),
            action('set', { part: id, field: { type: 'string', description: 'A control of the part (resistance, pressed, voltage…)' }, value: { type: ['number', 'boolean'] } }, ['part', 'field', 'value']),
            action('flow', { on: { type: 'boolean' }, ramp: { type: 'number', minimum: 0, maximum: 10000, description: 'ms for the dots to reach their speed' } }, ['on']),
            action('caption', { text, line: text, off: { const: true, description: 'Takes the caption away' }, enter: show, in: ms(3000, 'ms each line takes to come in (default 400)'), stagger: ms(1000, 'ms between two lines (default 90)'), out: ms(2000, 'ms the caption before takes to leave (default 200)') }, [], { oneOf: [{ required: ['text'] }, { required: ['off'] }] }),
            action('value', { part: id, field: reading, label: text, count: ms(5000, 'ms it counts up to its reading (default 500; 0 shows it as it is)'), enter: show, in: ms(3000, 'ms it takes to come in (default 400)') }, ['part', 'field']),
            action('probe', { part: id, node: { type: 'string', description: 'A strip, as the page names it' }, field: { enum: ['voltage', 'current'], description: "In a recording, the trace in the oscilloscope's box (default voltage)" }, off: { const: true, description: 'Takes the oscilloscope (or the card) away' }, title: { ...text, description: "In a recording, the box's title instead of the kit's (\"\" for none)" }, label: { ...text, description: "The trace's name instead of the kit's" }, note: { ...text, description: 'The note under the trace instead of the kit\'s ("" for none)' } }, [], { description: "The page opens the part's or strip's card with its oscilloscope; a recording shows the oscilloscope in a box of its own, the camera leaving it room", oneOf: [{ required: ['part'] }, { required: ['node'] }, { required: ['off'] }] }),
            action('insert', { part: id, enter, height, dark }, ['part'], { description: 'The part comes into its holes along its move (an arrival of 700 ms by default); by default it drops 12 mm and the circuit has no current until it lands' }),
            action('raise', { part: id, mm: { type: 'number', minimum: 0, maximum: RAISE.max, description: 'How high, in mm (default 3); 0 puts it back' } }, ['part'], { description: 'The part rises along its move (an arrival by default) to set it apart, and stays up until a raise to 0; it stays in the circuit' }),
            action('assemble', { parts: { type: 'array', minItems: 1, items: { oneOf: [id, { type: 'object', required: ['part'], properties: { part: id, enter, wire, from }, additionalProperties: false }] }, description: "The parts, in the order they come in (default: all, in the circuit's order); one may be { part, enter, wire, from } with its own way in" }, gap: { type: 'number', minimum: ASSEMBLE.min, maximum: ASSEMBLE.max, description: 'ms from one part to the next (default 1100)' }, enter, wire, from, height, dark }, [], { description: 'The circuit builds itself: the parts leave the board, then each comes down to its holes and each wire is drawn end to end; the current starts when the last one is in' }),
            action('pulse', { through: { type: 'array', items: { type: 'string' }, minItems: 1, description: 'Only the pieces of these parts or strips (default: the whole path)' }, direction: { enum: ['forward', 'back'], description: 'forward: from + to −, as the current runs (default); back: the other way' }, color: { type: 'string', description: `${Object.keys(PULSE_COLORS).join(', ')} (the theme's colours; default pulse) or #rrggbb` }, width: { type: 'number', minimum: 0.05, maximum: 1, description: 'Share of the run each piece is lit (default 0.25): smaller is a sharper flash' }, size: { type: 'number', minimum: 1, maximum: 12, description: 'Thickness of the flash in drawing units (default 4.5)' } }, [], { description: 'A flash runs along the path of the current, from + to −, in its move (a travel); with the current layer on' }),
            action('label', { part: id, text }, ['part', 'text'], { description: "The part's short label (the one a recording keeps) in other words; \"\" for none" }),
            action('wait-until', { part: id, field: reading, above: { type: 'number' }, below: { type: 'number' }, max: { type: 'number', minimum: 0, maximum: 60000, description: 'ms to wait at most (default 10000)' } }, ['part', 'field'], { oneOf: [{ required: ['above'] }, { required: ['below'] }] }),
          ],
        },
      },
    },
    additionalProperties: false,
  };
}
