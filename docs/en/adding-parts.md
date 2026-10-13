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
- **Keep primitives convex.** If two pieces of one part sort wrongly, split them.
- Register the package in `src/parts/packages/index.js`, add it to
  `examples/parts-showcase.json`, render both views and look at them.

## Package hooks for special shapes

Besides `span` and `inline`, a package may define:

| Hook | For | Example |
|---|---|---|
| `validate(pos, part) → issues` | shapes the generic rules cannot check | the button's rectangle, the DIP's two rows |
| `footprints(board, params) → [[hole, …], …]` | every valid set of holes, so `suggest` can place it | button and DIP: every spot across the channel |
| `expandPin1(board, pin1, params) → [hole, …]` | placing with `pin1` instead of every hole | DIP chips |

And a type may declare `internal: [['1', '2'], ['3', '4']]`: pins joined inside the part.
The checker then lets those pins share a strip, warns when pins of different groups do
(`SWITCH_BYPASSED` for buttons), and does not call a pin floating when its partner is
connected.

## 4. A new board

Copy `src/board/boards/bb830.js`, change the dimensions, rows, strips and rails, and add it
to `BOARDS` in `src/board/board.js`. Rows are given in pitches from the back edge.
`split` is the last column of the left half when the rails are cut in the middle.

## Tests

`npm test`. Add a test for anything that has a right answer: colour codes, sizes, pin
rules. Every example must render from both sides without `NaN`.

## Agents

The `parts-librarian` agent (`.claude/agents/parts-librarian.md`) follows this page. If you
change the order of work or the checks here, update that agent too.
