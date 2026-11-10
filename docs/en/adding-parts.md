# Adding a part, a package or a board

*[Español](../es/agregar-componentes.md)*

Start with the smallest change that works.

## 1. A new part number (most cases)

If the part uses a package that already exists, add one line to `src/parts/db.js`:

```js
LM7805: { type: 'regulator', package: 'TO-220', pins: ['IN', 'GND', 'OUT'], model: {} },
```

Take the pin order from the datasheet (pin 1, 2, 3). If the `type` is new, see step 2.

## 2. A new type

A type explains what the circuit file means. Create `src/parts/types/<type>.js`:

```js
export default {
  type: 'potentiometer',
  family: 'control',            // one of FAMILIES: the compact catalog groups the types by it
  pins: ['1', 'W', '3'],
  resolve(part) {
    // Read and validate the fields of the circuit file.
    // On a problem: return { error: { code: 'BAD_VALUE', params: { value: … } } };
    return {
      package: 'trimmer',          // which package draws it
      params: { … },               // drawing parameters for that package
      label: { value: 10e3, unit: 'Ω' },
      electrical: { kind: 'POT', resistance: 10e3 },  // for the simulator
    };
  },
};
```

Register it in `src/parts/types/index.js` (its `family` must be one of `FAMILIES` there; a test fails otherwise), add `type.<name>` to every file in `src/i18n/`
and a row to `docs/*/circuit-format.md`.

## 3. A new package

A package is geometry only. Create `src/parts/packages/<id>.js`:

```js
export default {
  id: 'trimmer',
  pinCount: 3,
  span: (params) => ({ min, max }),    // allowed distance between first and last hole, mm
  // or inline: { count: 3, pitch: 1 } for parts with rigid leads in a row
  build({ pins, params }) {
    // pins: hole positions (world mm, z = 0), in pin order
    return {
      primitives: [...],   // everything to draw
      body: [...],         // the subset used for collision checks
      anchor,              // where the label points (top of the part)
      paths,               // optional: where current flows, one per pin (conductor view)
    };
  },
};
```

Guidelines:

- **Use real dimensions** from a datasheet, in mm.
- **Orientation comes from the holes.** Use `directionBetween(pins[0], pins.at(-1))` and
  build in that frame; never assume the part lies along x.
- **Build from primitives** in `src/geometry/primitives.js`: `lathe` for anything round,
  `prism` / `box` for anything extruded, `tube` for leads (`lead()` in `common.js`),
  decals for marks and print.
- **Colours** come from `src/parts/colors.js`. Add new materials there.
- **Current paths** (`paths`, optional): per pin, `{ points, body }`, a 3D polyline from the hole
  (z = 0) up the lead to one point inside the part shared by every pin; `body` is the index of the
  point where the lead enters the body. The conductor view draws current along them
  (`src/sim/paths.js`); without them it uses straight lines at board level. Reuse the points you
  already built the leads from.
- **Keep primitives convex.** If two pieces of one part sort wrongly, split them.
- Register the package in `src/parts/packages/index.js`, add it to
  `examples/parts-showcase.json`, render both views and look at them.

## Package hooks for special shapes

Besides `span` and `inline`, a package may define:

| Hook | For | Example |
|---|---|---|
| `validate(pos, part) → issues` | shapes the generic rules cannot check | the button's rectangle, the DIP's two rows |
| `footprints(board, params) → [[hole, …], …]` | every valid set of holes, so `suggest` can place it | button and DIP: every spot across the channel |
| `expandPin1(board, pin1, params) → [hole, …]` | placing with `pin1` instead of every hole | DIP chips, header pins |

`build` also receives `board` (`build({ pins, params, board })`): a part that lies off the board
needs its edges (`board.spec.size`). The battery does this; its pieces beyond the far side of
the board go to the `under` layer by themselves (see `behindBoard` in `src/index.js`).

And a type may declare `internal: [['1', '2'], ['3', '4']]`: pins joined inside the part.
The checker then lets those pins share a strip, warns when pins of different groups do
(`SWITCH_BYPASSED` for buttons), and does not call a pin floating when its partner is
connected. `isolated: [['A1', 'A2'], ['COM', 'NO', 'NC']]` says the opposite: circuits inside the part
that are not joined (a relay's coil and its contact), so one pin of each may share a strip.

## 4. A new board

Copy `src/board/boards/bb830.js`, change the dimensions, rows, strips and rails, and add it
to `BOARDS` in `src/board/board.js`. Rows are given in pitches from the back edge.
`split` is the last column of the left half when the rails are cut in the middle.

## 5. Simulating it: a device

What the simulator knows about a kind of part lives in **one file** in `src/sim/devices/`
(the interface is described at the top of `src/sim/devices/index.js`). A device is a plain
object:

```js
// src/sim/devices/inductor.js
export const inductor = {
  types: ['inductor'],               // part types it handles
  kind: 'L',                         // the reading's kind
  params(part) {                     // compile time, Node: plain JSON from the resolved part
    const e = part.def.electrical;
    return { inductance: e.inductance, dcr: e.dcr, maxCurrent: e.maxCurrent };
  },
  elements(p, h) {                   // run time (Node or page): MNA elements (src/sim/mna.js), by name
    const mid = h.inner();
    h.add(resistor(h.at(0), mid, Math.max(p.dcr, 1e-3)));
    return { main: h.add(inductorEl(mid, h.at(1), p.inductance)) };
  },
  read: (entry, h) => twoTerminal(entry, entry.main, h),          // its values
  limits: (entry, r) => [stress('SIM_OVER_CURRENT', 'current', Math.abs(r.current), entry.maxCurrent, 'A')],
  lines: twoTerminalLines,           // card lines, each with an explain.* text
  tag: currentTag,                   // the current tag on the board
};
```

The reading hooks get the *entry*: `{ id, kind, pins, ...params, ...elements }`. `params` must
be plain JSON (it travels to the page inside the compiled program, see `src/sim/compile.js`);
`elements` and everything after it run in the browser too, so they import only from `src/sim`
and import-free modules such as `src/parts/sensors.js`.

Then list it in `DEVICES` (`src/sim/devices/index.js`). That is all: the simulator, the text
output, the result tags, the probes and the page find it there.

- **Limits are stresses**: `stress(code, quantity, value, max, unit)` is a value against the
  limit it must stay under. Over 1 it becomes the warning `code`; stage 3 shows the ratio as
  levels (fine, near the limit, exceeded). Things that are not limits are `note(...)`.
- **Typical values** go in `src/sim/models.js`, with their source; formulas a slider will need
  (sensors) in import-free modules such as `src/parts/sensors.js`.
- Devices that share a `kind` share their reading hooks (`lines`, `tag`, `probe`,
  `currentPins`); `test/devices.test.js` checks it.
- Several devices may share a part `type` (the ICs: timer, op-amps): each says which parts it
  takes with `accepts(part)`, and the program records its `kind`.
- **A new microcontroller board** needs no device: in `src/parts/modules.js` give it `power` (its
  USB, logic, ground and reset pins), `gpio` (each pin's GPIO number), `adc` and `inputOnly`; its
  family's numbers go in `MCUS` (`src/sim/models.js`), from its datasheet
  ([microcontrollers.md](microcontrollers.md)).
- **Oscilloscope**: `scope(reading)` says what the part plots in its card (`{ v, i }`, each
  `{ label, value }` or `null`). Without it, a two-lead part plots the voltage across it and its current.
- **Falstad**: `falstad(d, f)` says how the part goes to CircuitJS (the *Open in Falstad* button
  and the cross-check): the same element, or an equivalent with its note (`f.note`). Without it,
  the part is left out with a note. See [falstad.md](falstad.md).
- **One test against an independent reference** (a datasheet point or a formula solved apart)
  in `test/sim.test.js` or `test/sources.test.js`. Never tune a model to make an example look right.
- Give the package `paths` (section 3) so the conductor view follows its leads.
- **A part with a state of its own** (a relay's armature, a 555's latch) is an element that changes it
  in `accept(x, ctx)`, between steps, and stamps a linear stage for each state; `rest(x)` puts it where
  an operating point leaves it (true if it moved: the engine solves again), and `times` gives the page
  times of its own for its pace (a relay's coil L/R and its armature's travel). A mechanical side may
  be a node of its own (a motor's shaft: `motorCore`, a gyrator, its speed as the node's voltage).

## 6. A part up close (a requirement for every new part type)

A part goes on its own pedestal in two places: a video about one part (`scene`, `pin`, `bench`,
`symbol`, `inside` in a timeline, [timeline.md](timeline.md)) and the page's view up close
(`page.focusView`, [embedding.md](embedding.md)). Both show the same five things, so a new part type
comes with all of them, and the kit's types are built up to it:

| What | Where | Why |
|---|---|---|
| What each pin does | `pin.role.<type>.<pin>` (or `pin.role.<part number>.<pin>` when one part number differs) in **every** file of `src/i18n/` | the pinout's rows and `render-frames.js --parts` |
| How to tell its pins apart | the package's `mark` (`{ kind, at, normal }`: a flat face, a tab, a notch, a flange's flat, a stripe, a bevelled corner, a potentiometer's knob or a trimmer's printed face, a push button's joined pairs by its faces (`pairs`), a latching button's common in the middle of each row (`common`), a battery's red lead (`lead`), a buzzer's printed + (`plus`), an RGB LED's longest lead (`longest`), a display's decimal point's edge (`dp`), a slide switch's knob (`slide`), a relay's coil by its common (`coil`, no polarity); for a part with no polarity, `bands`, the first colour band a code is read from, or `either`) and its sentence in `pinout.*` | the quiet line under the pinout, written from the camera, never by hand; a part that goes in either way round says so, it never gets a polarity it does not have |
| Its schematic symbol | `symbolOf` in `src/parts/symbols.js`: strokes in a box of 100, a terminal (`pins`) and a **letter** (`ids`) for every pin | the symbol beside the part; its letters go at the start of the pins' rows or under their tips |
| What goes on inside | `insideOf` in `src/parts/symbols.js` (its kind), the drawer in `INSIDE` (`src/page/client/figure.js`, from the engine's reading: what the device's `reading` gives), its legend in `LEGENDS` (`src/page/client/focus-view.js`) and `page.tour.legend.<kind>.*` in every language | the inside view, and in the page the legend a video gives in its captions |
| The same letters everywhere | the inside view labels its pins with the symbol's `ids` (C, B, E; S, G, D; A, K; a chip's names, its rows numbered) | the pins' rows keep those letters with either figure beside the part |

`test/pinout.test.js` ("a part up close") holds the rule: every type in `PART_TYPES` is either in
`COMPLETE` (checked for all of the above) or in `PENDING` with its reason. A new type in neither fails
the test, so the choice is made, never forgotten; moving a type from `PENDING` to `COMPLETE` is how
the kit catches up (complete today: BJT, MOSFET, LED, a 555, resistor, capacitor, inductor, diode, Zener, bridge rectifier, potentiometer, NTC thermistor, photoresistor, push button, switch, regulator, battery, buzzer, RGB LED, 7-segment display, slide switch, tilt switch, LM35, relay, DC motor, PIR module, touch module, LM393 sensor module, laser module). Look at the result once: a video's frame (`render-frames.js`) and the page up close
on a phone.

## 7. A sensor: joining the environment

A sensor reads a magnitude of the world from the circuit's shared environment
([environment.md](environment.md)), never a value of its own that a learner has to find in its card.
To make a device a sensor:

1. Declare what it senses: `senses: ['light']` (one or more fields of `FIELDS` in
   `src/sim/environment.js`; a new magnitude is one line there first).
2. Read it in `params(part, c)`: `c.env('light')` is the environment's value at t = 0, or `undefined`
   when the part gives its own value (`"light": 50` on the part wins) or the circuit declares no
   environment; then keep what the part's type gave. The photoresistor:
   `const v = c?.env?.('light'); return v === undefined ? p : ldr.set(p, 'light', v);`.
3. Changing with it is the device's `set` (a pure formula) when the control and the field share a
   name; otherwise give `sense(p, field, value)`, and `ownField: { field: 'its own name' }` when the
   part calls it otherwise (the tilt switch: `{ tilt: 'tilted' }`), so a part that gives it does not
   follow and its own control, moved, makes it leave the field.

Nothing else in `src/sim` changes: the engine moves every part that follows a field when it changes
(a slider, a timeline's set, a program), its card says whether it follows the environment, and the
page shows the field's indicator. Test it against the sensor's own formula at two values of the
field, and that a value on the part wins (`test/environment.test.js`).

A sensor that answers in time (a PIR's delay, a touch module's response) has memory of its own:
it lists the keys of its elements in `state: [...]` so `engine.set` carries them, and may give
`maxStep()` and `span()`; see [timed-sensors.md](timed-sensors.md). A sensor that follows a
field through a moving part (the rotary encoder's shaft, which chases the environment's `angle`
at a bounded speed) keeps that part in the same carried state and writes its motion as a pure
function first: [rotary-encoder.md](rotary-encoder.md). One whose output a program
times to the microsecond (the HC-SR04's echo) names its next edge with `until()`, and the engine ends
a step there; see [ultrasonic-sensor.md](ultrasonic-sensor.md).
A sensor on the usual comparator board (rain, soil, light, an infrared slot or pair, a Hall switch,
a vibration contact) is not a new type: it is one row of the `sensor-module` table, its element and
a glyph ([sensor-modules.md](sensor-modules.md#adding-a-tenth-part)). A sensor whose output is a
voltage that follows the field (the linear Hall sensor, the voltage sensor module) is a type of its own
with a behavioural device ([analog-sensors.md](analog-sensors.md)); two devices may share a type
(the active and the passive buzzer) when each one says which part numbers it `accepts`.

An **emitter** is the other way round: a part whose electrical state writes a field (a laser adds
light, [environment.md](environment.md#emitters)). Its device declares `emits: ['light']` and a pure
`emit(entry, reading)` that returns what it adds now from its own reading (`{ light: lux }`, 0 when it
is off); the engine sums it over the ambient for every sensor of the field, a time step later, and
solves the fixed point where there is no step (the start, a `set`, DC). Nothing else changes: no
link to a sensor, no geometry. Give the reading what its card says about it (the engine puts
`emission` on the reading: the value it adds and whether it is blocked), test what it adds at two
operating points, and that a circuit without `environment` gets `ENV_EMITTER_ALONE`
(`test/emitters.test.js`). A field that something may block names its blocker in `FIELDS`
(`blockedBy`).

## Tests

`npm test`. Add a test for anything that has a right answer: colour codes, sizes, pin
rules. Every example must render from both sides without `NaN`.

## Agents

The `parts-librarian` agent (`.claude/agents/parts-librarian.md`) follows this page. If you
change the order of work or the checks here, update that agent too.
