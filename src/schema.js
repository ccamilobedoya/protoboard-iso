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
import { MOVES, RAISE, NUDGE, ASSEMBLE, CARD, PULSE_COLORS } from './page/client/moves.js';
import { READINGS, FORMATS, THEMES } from './tour.js';
import { LIMITS } from './limits.js';

export function buildSchemas() {
  const text = { type: 'string' };
  const localized = { oneOf: [text, { type: 'object', additionalProperties: text, description: 'One string per language code, e.g. { "en": "…", "es": "…" }' }] };
  const pins = {
    description: "Holes for the leads: a list in the part's pin order, or an object by pin name. Holes: a1…j63 (a1…t63 on a double board), rails T+3, B-12… (U+3 on a double board)",
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
      part: { type: 'string', description: 'Part number for diode, zener, bridge, mosfet, bjt, ic, regulator, ldr, seven-segment (5161AS common cathode, 5161BS common anode), slide-switch (SS12D00G3), tilt-switch (SW520D), temperature-sensor (LM35DZ default, LM35CZ), relay (SRD-05VDC-SL-C), motor (RE-140RA-12240 default, RE-140RA-2270) (see src/parts/db.js); module: ESP32-DEVKIT, ESP32-C3-SUPERMINI, UNO (see src/parts/modules.js)' },
      package: { type: 'string' },
      pinNames: { type: 'array', items: text },
      marking: { type: 'string' },
      style: { enum: ['arc', 'flat', 'knob', 'trimmer', 'rocker', 'latching'], description: 'wire: "arc" | "flat"; potentiometer: "knob" (default) | "trimmer" (multi-turn 3296W); switch: "rocker" (KCD1, default) | "latching" (7 × 7 push button)' },
      pin1: { type: 'string', description: 'DIP chips: hole of pin 1 (row e or f); the other pins follow. Header: first pin, the others towards higher columns. Module straddling the channel (ESP32): hole of pin 1, the other row rowSpacing holes away. Seven-segment display: hole of pin 1 (rows b–e, or f–i turned round), the other row 6 holes away (0.6") across the channel' },
      rowSpacing: { type: 'integer', minimum: 4, maximum: 12, description: 'module (ESP32 boards): holes between its two rows of pins; boards differ (DevKit default 9 = 0.9")' },
      wires: { type: 'object', additionalProperties: { type: 'string' }, description: 'module UNO, switch, relay: colour of the lead of each pin, e.g. { "D13": "yellow" }' },
      rese: { enum: ['2.2', '0.47'], description: 'module DESPI-C02: position of its RESE switch, ohms ("2.2" as sold, "0.47" for some panels)' },
      panel: { type: 'boolean', description: 'module DESPI-C02: also draw the 7.5" GDEY075T7 panel on its flat cable' },
      io: {
        type: 'object',
        additionalProperties: { enum: ['high', 'low', 'input', 'input_pullup', 'input_pulldown'] },
        description: 'module, microcontroller boards (ESP32 DevKit, ESP32-C3 SuperMini, UNO): the state of each GPIO for the simulation, by printed name, GPIO name or number ({"D13": "high", "D27": "input_pullup"}); unlisted pins are inputs (docs/en/microcontrollers.md)',
      },
      program: { type: 'string', description: 'module, microcontroller boards: its program for the simulation, the Arduino C++ subset a lesson uses: the sketch\'s text, or the name of a .ino file beside the circuit ("blink.ino"). setup() once, then loop(); delay() waits in simulated time (docs/en/microcontrollers.md)' },
      usb: { type: 'boolean', description: 'module, microcontroller boards: powered by USB (default true): the board is a 5 V source and its regulator makes the 3.3 V rail' },
      common: { enum: ['cathode', 'anode'], description: 'rgb-led: the common pin (COM, the longest lead) is the chips\' cathode (default) or their anode' },
      led: { type: 'string', description: 'regulator module (AMS1117): its power LED\'s resistor, "1k" (default), "200", or "none"' },
      position: { type: 'number', minimum: 0, maximum: 1, description: 'potentiometer wiper position' },
      pressed: { type: 'boolean', description: 'button state' },
      on: { type: 'boolean', description: 'switch: on (rocker on I, latching button down); default off' },
      slid: { type: 'boolean', description: 'slide-switch: the knob slid over to pin 2\'s side (COM joined to 2); default false (COM joined to 1)' },
      tilted: { type: 'boolean', description: 'tilt-switch: tipped over past its angle (open); default false (upright, closed)' },
      load: { type: 'number', minimum: 0, maximum: 100, description: 'motor: a load on its shaft in mN·m, against its turning (default 0); over its stall torque it holds the shaft still' },
      format: { enum: Object.keys(BATTERY_FORMATS), description: 'battery: AA, AAA, 18650, 9V or pouch (LiPo)' },
      chemistry: { enum: BATTERY_CHEMISTRIES, description: 'battery: default by format (AA/AAA alkaline, 18650 li-ion, pouch lipo)' },
      cells: { type: 'integer', minimum: 1, maximum: 12, description: 'battery: cells (or 9 V blocks) in series; voltages add up' },
      charge: { type: 'number', minimum: 0, maximum: 1, description: 'battery: state of charge, 0 empty … 1 full; without it, the nominal voltage' },
      capacity: { oneOf: [text, { type: 'number' }], description: 'battery: "2000 mAh" (a number is mAh); default by format' },
      internalResistance: { type: 'number', minimum: 0, description: 'battery: ohms, for the whole pack' },
      switch: { enum: ['on', 'off'], description: 'battery: a holder with a slide switch, and its position' },
      side: { enum: ['left', 'right', 'back', 'front'], description: 'battery: board edge it lies beside (default: the nearer side edge); module UNO: back (default) or front; switch, relay: front (default) or back; motor: as a battery' },
      offset: { type: 'number', description: 'battery, module UNO, switch, relay, motor: shift along that edge, mm' },
      count: { type: 'integer', minimum: 1, maximum: 40, description: 'header: number of pins (place with pin1)' },
      beta: { type: 'number', description: 'thermistor: B constant in kelvin (default 3950)' },
      temperature: { type: 'number', description: 'thermistor, temperature-sensor (LM35): °C for the simulation (default 25)' },
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
          focusView: { type: 'boolean', description: "A part's view up close (the live page): the card of a part offers it, and the part goes alone on its pedestal with its pins, bench, symbol and inside view a tap away (default false)" },
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
  // A side of a flow's sense: the dots' colour and the parts whose nets carry them while the current runs that way.
  const SIDE = { type: 'object', properties: { color: { type: 'string', description: `The dots' colour while the current runs this way: ${Object.keys(PULSE_COLORS).join(', ')} or #rrggbb (default: the dots' own)` }, parts: { type: 'array', items: { type: 'string' }, minItems: 1, description: 'While it runs this way, the current only on the nets of these parts (instead of the focus)' } }, additionalProperties: false };
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
      pace: { type: 'number', minimum: 1e-6, maximum: 1000, description: "Seconds of simulated time per second of video in this recording (default: the page's own, which render-frames.js --parts prints): a slower circuit shown faster so its cycles fit the shot; the oscilloscope, the compare figures and the payoff follow it" },
      steps: {
        type: 'array',
        maxItems: LIMITS.tourSteps,
        items: {
          oneOf: [
            action('frame', { target: { oneOf: [{ type: 'string' }, { type: 'array', items: id, minItems: 1 }], description: 'board, parts, here (the frame as it is), a part id or a list of part ids' }, zoom: { type: 'number', minimum: 0.05, maximum: 20, description: 'Closer in (above 1) or farther out (below 1), about the centre' }, pan: { type: 'array', items: { type: 'number', minimum: -3, maximum: 3 }, minItems: 2, maxItems: 2, description: 'Then moved by [x, y] shares of the frame: [0.2, 0] a fifth to the right, [0, -0.1] a tenth up' } }, ['target']),
            action('focus', { parts: { type: 'array', items: id, description: 'The parts brought forward; [] clears. With a move, the veil, strips and coordinates come in (or leave) along it' }, solid: { type: 'boolean', description: 'The parts in focus drawn whole and opaque even with the current layer on (by default the plan sees through them); until the next focus' } }, ['parts']),
            action('flip', { view: { type: 'string', description: 'A view of the page (front, back…)' } }, ['view']),
            action('set', { part: id, field: { type: 'string', description: 'A control of the part (resistance, pressed, voltage…)' }, value: { type: ['number', 'boolean'] } }, ['part', 'field', 'value']),
            action('flow', { on: { type: 'boolean' }, ramp: { type: 'number', minimum: 0, maximum: 10000, description: 'ms for the dots to reach their speed' }, scope: { enum: ['all', 'focus'], description: 'focus: the current only on the nets that touch the legs of the parts in focus (their strips, the jumpers between them, the focused parts), the rest plain board under the veil, following each focus until the next flow step (default all)' }, style: { enum: ['plan', 'real'], description: "The current layer's drawing in this timeline: plan (pads and straight lines) or real (along the strips, leads and jumpers); the first flow step that names one sets it for the whole recording (default: the page's, page.flow.style)" } , sense: { type: 'object', required: ['part'], properties: { part: { ...id, description: 'The part whose current says the way (a capacitor: forward while it charges, back while it discharges)' }, forward: { ...SIDE, description: 'While its current is forward (zero or more)' }, back: { ...SIDE, description: 'While its current is back' } }, additionalProperties: false, description: 'The dots coloured by the way the current runs through a part, and on the log scale so a small current is seen: charge in one colour, discharge in another' }}, ['on']),
            action('caption', { text, line: { ...text, description: 'A second line, drawn as the first (one idea in at most two lines)' }, em: { ...text, description: 'The emphasis: words of the text (else of the second line), drawn in the accent and 15 % larger; the lines are still measured as laid out' }, data: { ...text, description: 'A data row under the caption, only for a value or a before → after not already on screen ("1 kΩ → 100 kΩ"): sans with tabular figures, in the accent, 44 px at 1080 wide' }, off: { const: true, description: 'Takes the caption away' }, enter: show, in: ms(3000, 'ms each line takes to come in (default 400)'), stagger: ms(1000, 'ms between two lines (default 90)'), out: ms(2000, 'ms the caption before takes to leave (default 200)') }, [], { oneOf: [{ required: ['text'] }, { required: ['off'] }] }),
            action('value', { part: id, field: reading, label: text, count: ms(5000, 'ms it counts up to its reading (default 500; 0 shows it as it is)'), enter: show, in: ms(3000, 'ms it takes to come in (default 400)') }, ['part', 'field']),
            action('probe', { part: id, node: { type: 'string', description: 'A strip, as the page names it' }, field: { enum: ['voltage', 'current'], description: "In a recording, the trace in the oscilloscope's box (default voltage)" }, off: { const: true, description: 'Takes the oscilloscope (or the card) away' }, title: { ...text, description: "In a recording, the box's title instead of the kit's (\"\" for none)" }, label: { ...text, description: "The trace's name instead of the kit's" }, note: { ...text, description: 'The note under the trace instead of the kit\'s ("" for none)' }, window: { type: 'number', minimum: 1e-6, maximum: 3600, description: "In a recording, the time the box always shows, in s of the oscilloscope's time (simulated, or the wall clock in a circuit that does not change by itself): from t = 0, then scrolling, so a set that changes the pace shows as more or fewer cycles instead of a new scale (default: the kit's window, which stretches and rescales; render-frames.js --parts gives it and how fast time runs)" }, marks: { type: 'boolean', description: "In a recording, a dashed line in the box at each set from then on, with the control's new value, so before and after both read (default false)" }, place: { enum: ['bottom', 'top'], description: 'In a portrait recording, where the box lies: bottom, from 56 % to 75 % of the height, the circuit framed above it from 40 % to 56 % (default); top, from 28 % to 40 %, between a caption of at most two lines (and no value) and the circuit, which keeps the band from 40 % to 75 %' }, size: { enum: ['full', 'compact'], description: 'compact: no title and no note, the value inside the trace, two axis labels (the top of the scale and the end of the window), for a box of 12 % of the height (default full)' }, compare: { type: 'boolean', description: "In a recording, at each set: the cycles before it kept as a faint ghost trace laid over what comes after, and the change of period from the simulation, once the control has arrived (\"period 0.12 s → 0.86 s (×7)\"; with an LED in the circuit, in words: \"on 0.08 → 0.40 s · off the same\"), laid out in bands so no text crosses the trace; implies marks (default false)" }, change: { enum: ['ratio', 'times'], description: 'How a comparing box says the change: ratio, a proportion true at any pace ("on ×5 · off the same", default); times, in the oscilloscope\'s seconds ("on 0.08 → 0.40 s · off the same")' }, say: { ...text, description: 'A comparing box\'s own words for the change instead of the kit\'s, with {k} for how many times longer the LED stays on (the period without an LED) and {k2} for off, both from the simulation ("on {k}× longer · off the same")' }, reading: { type: 'boolean', description: "false: the trace's name without its value now (default true)" }, clock: { type: 'boolean', description: 'compact, false: without the time at the end of the window (default true)' } }, [], { description: "The page opens the part's or strip's card with its oscilloscope; a recording shows the oscilloscope in a box of its own, the camera leaving it room", oneOf: [{ required: ['part'] }, { required: ['node'] }, { required: ['off'] }] }),
            action('insert', { part: id, enter, height, dark }, ['part'], { description: 'The part comes into its holes along its move (an arrival of 700 ms by default); by default it drops 12 mm and the circuit has no current until it lands' }),
            action('nudge', { part: id, mm: { type: 'number', minimum: NUDGE.min, maximum: NUDGE.max, description: `How high, in mm (default ${NUDGE.mm})` }, ms: { type: 'number', minimum: NUDGE.msMin, maximum: NUDGE.msMax, description: `The whole nudge, up, a rest and down (default ${NUDGE.ms})` } }, ['part'], { description: 'A part the voice names as a cause, while the subject is another, rises a little in the first 30 % of ms (a quint out, or its curve), rests and comes back along the opposite curve; it keeps the focus and the told label as they are, and a part under the veil is drawn over it only while it moves. No move: it has its own', not: { required: ['move'] } }),
            action('raise', { part: id, mm: { type: 'number', minimum: 0, maximum: RAISE.max, description: 'How high, in mm (default 3); 0 puts it back' } }, ['part'], { description: 'The part rises along its move (an arrival by default) to set it apart, and stays up until a raise to 0; it stays in the circuit' }),
            action('assemble', { parts: { type: 'array', minItems: 1, items: { oneOf: [id, { type: 'object', required: ['part'], properties: { part: id, enter, wire, from }, additionalProperties: false }] }, description: "The parts, in the order they come in (default: all, in the circuit's order); one may be { part, enter, wire, from } with its own way in" }, gap: { type: 'number', minimum: ASSEMBLE.min, maximum: ASSEMBLE.max, description: 'ms from one part to the next (default 1100)' }, enter, wire, from, height, dark }, [], { description: 'The circuit builds itself: the parts leave the board, then each comes down to its holes and each wire is drawn end to end; the current starts when the last one is in' }),
            action('pulse', { through: { type: 'array', items: { type: 'string' }, minItems: 1, description: 'Only the pieces of these parts or strips (default: the whole path)' }, direction: { enum: ['forward', 'back'], description: 'forward: from + to −, as the current runs (default); back: the other way' }, color: { type: 'string', description: `${Object.keys(PULSE_COLORS).join(', ')} (the theme's colours; default pulse) or #rrggbb` }, width: { type: 'number', minimum: 0.05, maximum: 1, description: 'Share of the run each piece is lit (default 0.25): smaller is a sharper flash' }, size: { type: 'number', minimum: 1, maximum: 12, description: 'Thickness of the flash in drawing units (default 4.5)' } }, [], { description: 'A flash runs along the path of the current, from + to −, in its move (a travel); with the current layer on' }),
            action('label', { part: id, text }, ['part', 'text'], { description: "The part's short label (the one a recording keeps) in other words; \"\" for none" }),
            action('scene', { mode: { enum: ['part', 'board'], description: 'part: the part alone on a pedestal (the board and the other parts unseen, the part raised 3 mm over the hole grid, framed as a frame step on it frames); board: back to the board, the camera where it is' }, part: { ...id, description: 'The part on the pedestal (not a wire or a supply); required with mode part' }, zoom: { type: 'number', minimum: 0.5, maximum: 3, description: "Closer in or farther out than the part's frame (default 1)" }, enter: { enum: ['cut', 'drop'], description: 'How the part comes onto the pedestal: at once (default), or dropping from 8 mm with a small bounce (700 ms)' }, push: { type: 'number', minimum: 0.5, maximum: 3, description: 'A slow push: the camera keeps closing in to this zoom until the next step that moves it (a frame, a land, a scene), at most 8 s' }, light: { type: 'string', description: `Mode part: a soft light of this colour on the pedestal under the part, until the board comes back (${Object.keys(PULSE_COLORS).join(', ')} or #rrggbb; default none)` } }, ['mode'], { description: 'A video about one part (M17): a cut by default; with a move, the board fades along it', anyOf: [{ properties: { mode: { const: 'board' } } }, { required: ['part'] }] }),
            action('land', { part: id }, ['part'], { description: 'From the pedestal back to the board (M18), a travel by default: the part comes down while the camera follows it, so it stays still on screen and the board rises under it; an assemble after it brings the other parts and leaves this one in place' }),
            action('pin', { pin: { type: 'string', pattern: '\\.', description: 'A pin of a part, "part.pin": its name ("Q1.B"), a usual alias ("Q1.base", "D1.K") or a chip\'s number ("U1.2"); render-frames.js --parts lists them' }, mark: { ...id, description: "The part whose package's mark (a flat face, a notch, a stripe) lights, with what it tells on a quiet line" }, off: { const: true, description: 'Every pin and mark off' }, text: { ...text, description: "The pin's row in other words (default: the kit's, what the pin does)" } }, [], { description: 'A video about one part (M19, M20): the pin lights at its tip and its row comes in under the part, an arrival by default; lit pins add up until off', oneOf: [{ required: ['pin'] }, { required: ['mark'] }, { required: ['off'] }] }),
            action('bench', { part: { ...id, description: 'The part on the bench; required with on: true' }, on: { type: 'boolean', description: 'true: each pin of the part joined to a pad that reads the circuit (its voltage in the colour of the current layer, the current into it, what it is joined to); false: the bench goes' } }, ['on'], { description: 'A video about one part (M21): the stubs are traced to their pads along the move (an arrival by default); with the current layer on, dots run along them. The circuit keeps running hidden: a set on a part not shown changes the pads', anyOf: [{ properties: { on: { const: false } } }, { required: ['part'] }] }),
            action('symbol', { part: { ...id, description: 'The part whose schematic symbol stands beside it; required with on: true' }, on: { type: 'boolean', description: 'true: the symbol beside the part, the symbol\'s name for each pin said on the part (at its row\'s start, else under its tip); false: it goes' } }, ['on'], { description: 'A video about one part (M22), an arrival by default; one figure at a time beside the part (a symbol or an inside view)', anyOf: [{ properties: { on: { const: false } } }, { required: ['part'] }] }),
            action('inside', { part: { ...id, description: 'The part whose inside view stands beside it (a bipolar transistor, a MOSFET, an LED, a 555); required with on: true' }, on: { type: 'boolean', description: 'true: a teaching view of what goes on inside, drawn from the simulation; false: it goes' } }, ['on'], { description: 'A video about one part (M23), an arrival by default; one figure at a time beside the part', anyOf: [{ properties: { on: { const: false } } }, { required: ['part'] }] }),
            action('card', { text, line: { ...text, description: 'A second line, smaller' }, em: { ...text, description: 'The emphasis, as a caption\'s' }, hold: { type: 'number', minimum: CARD.min, maximum: CARD.max, description: `ms the card stays whole (default ${CARD.hold})` }, enter: show, in: ms(1000, `ms it takes to come in (default ${CARD.in})`), out: ms(1000, `ms it takes to leave (default ${CARD.out})`) }, ['text'], { description: 'A sentence alone over the whole screen for a moment (a figure to keep, "×5 on · off the same"): large, in the caption\'s face, between the platforms\' bands; it covers what is under it and leaves it as it was' }),
            action('wait-until', { part: id, field: reading, above: { type: 'number' }, below: { type: 'number' }, max: { type: 'number', minimum: 0, maximum: 60000, description: 'ms to wait at most (default 10000)' } }, ['part', 'field'], { oneOf: [{ required: ['above'] }, { required: ['below'] }] }),
          ],
        },
      },
    },
    additionalProperties: false,
  };
}
