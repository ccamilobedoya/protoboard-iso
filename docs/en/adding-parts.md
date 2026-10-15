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

Register it in `src/parts/types/index.js`, add `type.<name>` to every file in `src/i18n/`
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
connected.

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
  build(part, h) {                   // add MNA elements (src/sim/mna.js); return what reading needs
    const mid = h.inner(part.id);
    h.add(resistor(h.at(0), mid, Math.max(h.e.dcr, 1e-3)));
    return { main: h.add(inductorEl(mid, h.at(1), h.e.inductance)), maxCurrent: h.e.maxCurrent };
  },
  read: (entry, h) => twoTerminal(entry, entry.main, h),          // its values
  limits: (entry, r) => [stress('SIM_OVER_CURRENT', 'current', Math.abs(r.current), entry.maxCurrent, 'A')],
  lines: twoTerminalLines,           // card lines, each with an explain.* text
  tag: currentTag,                   // the current tag on the board
};
```

Then list it in `DEVICES` (`src/sim/devices/index.js`). That is all: the simulator, the text
output, the result tags, the probes and the page find it there.

- **Limits are stresses**: `stress(code, quantity, value, max, unit)` is a value against the
  limit it must stay under. Over 1 it becomes the warning `code`; stage 3 shows the ratio as
  levels (fine, near the limit, exceeded). Things that are not limits are `note(...)`.
- **Typical values** go in `src/sim/models.js`, with their source; formulas a slider will need
  (sensors) in import-free modules such as `src/parts/sensors.js`.
- Devices that share a `kind` share their reading hooks (`lines`, `tag`, `probe`,
  `currentPins`); `test/devices.test.js` checks it.
- **One test against an independent reference** (a datasheet point or a formula solved apart)
  in `test/sim.test.js` or `test/sources.test.js`. Never tune a model to make an example look right.
- Give the package `paths` (section 3) so the conductor view follows its leads.

## Tests

`npm test`. Add a test for anything that has a right answer: colour codes, sizes, pin
rules. Every example must render from both sides without `NaN`.

## Agents

The `parts-librarian` agent (`.claude/agents/parts-librarian.md`) follows this page. If you
change the order of work or the checks here, update that agent too.
