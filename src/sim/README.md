# Simulator

Modified nodal analysis (MNA) over the netlist the drawing already builds. Guide for users:
[docs/en/simulation.md](../../docs/en/simulation.md).

| File | What it does |
|---|---|
| `models.js` | typical device values (diodes, LEDs, MOSFETs, BJTs, ratings), each with its source |
| `mna.js` | dense linear solver, stamping, element companions (resistor, capacitor, sources, junction, MOSFET, BJT), Newton with junction limiting, source stepping |
| `index.js` | `simulate(circuit, options)`: compile, then run the engine |
| `compile.js` | Node only: circuit → *program* (plain JSON): groups, supplies, each part's device and parameters |
| `engine.js` | runs a program: elements, floating groups, DC and transient analyses, readings and warnings. No dependencies outside `src/sim`: the page bundles it (`src/node/bundle.js`) |
| `devices/` | one file per kind of part: elements, reading, limits (stresses), card lines, tag; the interface is at the top of `devices/index.js` |
| `paths.js` | the conductor view: current paths, strip currents, voltage colours, dots |
| `format.js` | results as text, in any language of `src/i18n` |
| `overlay.js` | results drawn on the board in the `results` layer |

Rules:

- **The engine stays bundleable.** `engine.js`, `mna.js`, `models.js` and `devices/` import only
  from each other and from import-free modules (`src/parts/sensors.js`, `src/parts/batteries.js`);
  `test/bundle.test.js` runs the bundled engine alone and compares it with `simulate()`.
- **Drawing never depends on the simulator.** It reads `netlist.nodes` and each part's
  `def.electrical`; `render` only adds the `results` layer when asked (`sim: true`).
- **A new part kind** = one device file in `devices/` listed in `devices/index.js`, typical
  values in `models.js`, and **one test against an independent reference** in
  `test/sim.test.js` (a formula solved apart, or the datasheet). Never tune a model to make one
  example look right. Guide: docs/en/adding-parts.md §5.
- **The golden file** (`test/fixtures/sim-golden.json`) holds today's output; refactors must
  leave it identical (`node scripts/golden.js`), intended changes rewrite it (`--write`).
- **Results are a model.** Every output says so; pages show them only when the circuit asks.

---

# Simulador

Análisis nodal modificado (MNA) sobre la netlist que ya construye el dibujo. Guía:
[docs/es/simulacion.md](../../docs/es/simulacion.md). Un tipo de componente nuevo es un archivo
en `devices/` (anotado en `devices/index.js`), sus valores típicos en `models.js` y **una prueba
contra una referencia independiente** en `test/sim.test.js` (guía: docs/es/agregar-componentes.md §5).
