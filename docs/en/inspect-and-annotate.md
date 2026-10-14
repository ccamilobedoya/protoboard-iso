# Inspecting and annotating a drawing

*[Español](../es/inspeccionar-y-anotar.md)*

Two tools to know exactly what a drawing contains, without having to look at it.

## `inspect`: the drawing in numbers

```bash
node bin/protoboard-iso.js inspect examples/led-resistor.json [--view back] [--fit parts] [--scale 8] [--lang es] [--json]
```

It builds the same scene that `render` would draw and reports:

| For every part | Meaning |
|---|---|
| pins | each lead: hole (`h9`), connected group (`9:f-j`), board position in mm, screen position in px |
| box | screen rectangle the part occupies, in px |
| visible | share of the part that is not covered by other parts, and who covers the rest |
| label | the callout text, its row and position |

| Problems found | Severity |
|---|---|
| `PART_HIDDEN`: a part is less than 85 % visible (less than 50 %: warning) | note / warning |
| `LABEL_COVERS_PART`, `LABEL_OVERLAP`: a label covers a part or another label | warning |
| `LABEL_HIDES_TEXT`: a label covers a printed rail label ("+5 V") | note |
| `LEADER_CROSSING`, `LEADER_OVER_PART`: leader lines that cross or pass over parts | note |
| `TEXT_TOO_SMALL`: markings on parts under 6 px tall at this scale | note |

The placement issues of `check` are included too. `--json` prints the full report for
tools and tests.

**How visibility is measured.** Every polygon of every part is filled, in painting order,
into a grid of one cell per pixel that remembers which part painted each cell last
(`src/render/coverage.js`). A part's visible share is the cells it painted that it still
owns at the end. What is measured is exactly what is drawn.

Thresholds live in `INSPECT_LIMITS` (`src/inspect.js`).

## `--annotate`: extra layers on the drawing

```bash
node bin/protoboard-iso.js render circuit.json -o out.svg --annotate pins,nodes
node bin/protoboard-iso.js render circuit.json -o out.svg --annotate all
```

| Layer | Draws |
|---|---|
| `pins` | the hole name at every lead, with a ring on the hole |
| `nodes` | every connected group in use tinted on the board, one colour per group (pin tags take the same colour) |
| `boxes` | a dashed box and the id around every part: its exact screen extent |
| `grid` | every column numbered, not only 1, 5, 10… |

Pin tags look for a free spot around their hole, so they never overlap each other or a
hole ring. Combine any layers; `all` turns on every one. They go into their own group,
`<g class="annotations">`; `nodes` and `grid` are printed on the board itself, under the
parts. Useful to point at an exact hole, to teach how strips connect, or to check a layout.

In the API: `renderCircuit(circuit, { annotate: ['pins', 'nodes'] })` and
`inspectCircuit(circuit, options)` / `formatReport(report, lang)`.
