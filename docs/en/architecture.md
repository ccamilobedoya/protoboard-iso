# Architecture

*[Español](../es/arquitectura.md)*

## The pipeline

```text
circuit.json ──▶ types ──▶ packages ──▶ primitives ──▶ camera + painter ──▶ SVG
                   │                         ▲
                   └──▶ board holes ──▶ netlist ──▶ checks
```

| Layer | Folder | Knows about | Does not know about |
|---|---|---|---|
| Circuit file | `examples/` | which part goes in which hole | geometry |
| Types | `src/parts/types/` | what a part *is*: value → bands, capacitance → can size, pin names, electrical model | how to draw |
| Packages | `src/parts/packages/` | physical shape: body size, lead rules, how to build it from primitives | values, electricity |
| Primitives | `src/geometry/` | prisms, lathes (surfaces of revolution), tubes, flat marks and text on faces | parts |
| Board | `src/board/` | hole positions, which holes are connected | parts |
| Checks | `src/circuit/checks.js` | geometry and connectivity of placed parts | drawing |
| Render | `src/core/camera.js`, `src/render/` | projection, shading, sorting, SVG | parts, electricity |
| Messages | `src/i18n/` | every user-visible sentence | logic |

The split between **type** and **package** is what makes parts reusable: a 1N4007 diode
and a resistor share the axial package; an IRLZ44N MOSFET and a TIP120 transistor share
TO-220. A new part is usually one line in `src/parts/db.js`.

## World space

Millimetres, right-handed: **x** along the columns (column 1 → 63), **y** towards the back
of the board (the top rails), **z** up. The board surface is `z = 0`. Hole pitch 2.54 mm.

Every package builds its parts from the hole positions it receives, so its orientation
comes from the holes: a resistor from `c10` to `c14` lies along x, one from `a10` to `e10`
along y. Nothing in a package depends on the camera.

## Camera and views

`createCamera({ view })` returns an orthographic projection. With the default elevation
(35.264°) it is a true isometric view. Named views: `front` (from the front-right corner),
`back` (opposite corner), `front-left`, `back-right`, or any `azimuth` in degrees.

Because geometry is in 3D and the projection is linear, the back view needs no extra work.
Text printed on the board or on parts is laid on its 3D plane with an SVG `matrix`, so it
turns with the view like the real print.

## Drawing: the painter's algorithm

1. Pieces of off-board parts (a battery on the table) that lie entirely beyond a side face of
   the board, on the side the camera does not see, are painted first (`under` layer): the
   board stands between them and the viewer.
2. Then the board: one block, or the two blocks of a double board, the far one first for the
   camera (`sceneFor` in `src/index.js`), so the near block's edge at the joint covers the far one.
3. Every other primitive (a body, each segment of a lead or wire) is sorted by the depth of
   its centre and painted from far to near.
4. Inside a primitive, faces looking away from the camera are dropped (back-face culling)
   and the rest are painted far to near; then its decals (marks and text).

Primitives are kept convex or close to it so this stays correct. When two pieces of one
part sort badly, split them (see the TO-220 tab in `to220.js`).

Shading: each face gets a tone from its normal and a key light fixed relative to the
camera (`src/render/shading.js`), so both views are lit the same way.

## Labels

Labels are callouts in rows above the highest part (`src/render/scene.js`). Leaders are
vertical whenever the label box can sit right above its part without covering another
leader; the rest are slanted and placed afterwards in the row with the fewest crossings.
Printed rail labels are kept clear. `inspect` measures the result (overlaps, crossings,
leaders over parts) and tests keep it at zero crossings.

## Connectivity

`createBoard()` gives every hole a node name: `12:a-e` (column 12, rows a–e), `T+` (the
top + rail); on a double board also `12:k-o`, `12:p-t` and `U+` (rows and rails of the back board,
[circuit-format.md](circuit-format.md#two-boards-side-by-side)). The netlist is just "which part pins share a node". Checks and, later, the
simulator use it; drawing does not.

## Output

A self-contained SVG: fixed colours, explicit `width`/`height`, white background, no CSS
variables or scripts. It can go into documents, wikis and slides as an image.

## What comes next

- `src/sim/` (stage 2, done): modified nodal analysis over the netlist and each part's
  `electrical` description; see [simulation.md](simulation.md) and `src/sim/README.md`.
- Stage 3, live simulation in the page: conductors coloured by voltage, dots of conventional
  current along the real paths, sliders, limits made visible; the drawing stays what Node
  wrote, the page only moves its overlay. See [live-simulation.md](live-simulation.md).
