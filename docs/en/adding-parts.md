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
the kit catches up (complete today: BJT, MOSFET, LED, a 555, resistor, capacitor, inductor, diode, Zener, bridge rectifier, potentiometer, NTC thermistor, photoresistor, push button, switch, regulator, battery, buzzer, RGB LED, 7-segment display, slide switch, tilt switch, LM35, relay, DC motor). Look at the result once: a video's frame (`render-frames.js`) and the page up close
on a phone.

## Tests

`npm test`. Add a test for anything that has a right answer: colour codes, sizes, pin
rules. Every example must render from both sides without `NaN`.

## Agents

The `parts-librarian` agent (`.claude/agents/parts-librarian.md`) follows this page. If you
change the order of work or the checks here, update that agent too.
