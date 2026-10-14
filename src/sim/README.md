# Simulator

Modified nodal analysis (MNA) over the netlist the drawing already builds. Guide for users:
[docs/en/simulation.md](../../docs/en/simulation.md).

| File | What it does |
|---|---|
| `models.js` | typical device values (diodes, LEDs, MOSFETs, BJTs, ratings), each with its source |
| `mna.js` | dense linear solver, stamping, element companions (resistor, capacitor, sources, junction, MOSFET, BJT), Newton with junction limiting, source stepping |
| `index.js` | circuit → elements (supplies, parts, internal nodes, floating groups), DC and transient analyses, readings and warnings |
| `format.js` | results as text, in any language of `src/i18n` |
| `overlay.js` | results drawn on the board in the `results` layer |

Rules:

- **Drawing never depends on the simulator.** It reads `netlist.nodes` and each part's
  `def.electrical`; `render` only adds the `results` layer when asked (`sim: true`).
- **A new part kind** = a case in `prepare()` (index.js), its reading in `partReading()`, its
  limits in `limitIssues()`, typical values in `models.js`, and **one test against an
  independent reference** in `test/sim.test.js` (a formula solved apart, or the datasheet).
  Never tune a model to make one example look right.
- **Results are a model.** Every output says so; pages show them only when the circuit asks.

---

# Simulador

Análisis nodal modificado (MNA) sobre la netlist que ya construye el dibujo. Guía:
[docs/es/simulacion.md](../../docs/es/simulacion.md). Un tipo de componente nuevo lleva su caso en
`prepare()`, su lectura en `partReading()`, sus límites en `limitIssues()`, sus valores típicos en
`models.js` y **una prueba contra una referencia independiente** en `test/sim.test.js`.
