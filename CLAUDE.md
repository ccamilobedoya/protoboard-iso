# CLAUDE.md

Guide for Claude Code (and any AI assistant) working **on** this repository. To *use* the
kit as a skill, see `SKILL.md`.

**If `CLAUDE.local.md` exists, read it first**: it holds the maintainer's personal context
(language, machine setup, course). It is not in git.

## Resuming a circuit (not the code)

Circuits are changed with operations, never by rewriting the file:
`history <target>` → `inspect <target> --json` → `apply … --dry-run` → `apply … --expect-revision n`.
See `docs/en/agent-interface.md`.

## Read before working

1. `ROADMAP.md`: what is done, what is next. Work on the first 🔜/⬜ item that matches the
   request; tick items when they are done.
2. `PLANNING.md`: architecture, considerations, best practices, decision log. Do not
   reopen a logged decision without a new reason; add new decisions to the log.
3. `docs/en/architecture.md` when touching geometry or rendering;
   `docs/en/adding-parts.md` when adding a part, package or board.

## Commands

```bash
npm test                      # unit + rendering tests (node:test, no dependencies)
npm run examples              # examples/*.json → examples/out/*.svg + index.html gallery
npm run examples -- --lang es # same, Spanish messages and labels
npm run preview [-- filter]   # examples/out/*.svg → examples/out/png/*.png (needs npm install)
node bin/protoboard-iso.js inspect <file.json> [--json]   # the drawing in numbers
node bin/protoboard-iso.js render <file.json> -o out.svg --annotate all
node bin/protoboard-iso.js apply <target> --ops '<json>' --dry-run   # then without --dry-run
node bin/protoboard-iso.js undo <target> · history <target>
npm run schemas               # after changing types, boards, views or operations
node bin/protoboard-iso.js check <file.json> [--lang es]
node bin/protoboard-iso.js render <file.json> -o out.svg [--view back] [--fit parts]
```

## How to verify a change

1. `npm test` passes.
2. `npm run examples` shows no new issues except the intended ones
   (`common-mistakes.json` is supposed to report problems; `parts-showcase.json` reports
   notes about unconnected pins).
3. **Measure before looking.** `node bin/protoboard-iso.js inspect <file> [--view back]
   [--fit parts] [--json]` gives positions, visibility, label and leader problems and text
   sizes for exactly what is drawn. Most layout and sorting questions are answered there.
4. **Look only when style matters** (shapes, colours, new packages): render a close-up and
   `node scripts/preview.js <name> --width 900`, then open that one PNG. Small and few:
   images are slow to read. `--annotate all` helps to see holes, nodes and part boxes.
5. Update `ROADMAP.md` (and its Spanish copy `docs/es/hoja-de-ruta.md`).

## Rules

- **Runtime has no dependencies.** Only dev dependencies for previews/tooling.
- **Never hand-edit generated SVG** and never compute geometry or colour codes in a reply;
  extend the kit.
- New part number → `src/parts/db.js`; new shape → `src/parts/packages/`; new meaning →
  `src/parts/types/`.
- Real dimensions from datasheets, in mm. Orientation from the holes, never assumed.
- Keep primitives convex; split pieces that sort wrongly.
- Every user-visible string through `t()`; add the key to **every** file in `src/i18n/`.
- Documentation: English is the reference; update the Spanish translation (`docs/es/`,
  `README.es.md`) in the same change.
- Code, identifiers and comments in English. One header comment per module saying what it
  is for; comments explain *why*, not *what*.
- Commit only when asked. Small commits, imperative subject line.

## Map

```
src/core/        vec.js (3D maths), camera.js (views, projection, light), units.js ("4k7")
src/geometry/    primitives.js: prism, box, lathe, cylinder, tube, decals, textDecal
src/render/      scene.js (display list: painter, labels, framing), svg.js (writer),
                 coverage.js (measuring raster), shading.js
src/inspect.js   numeric report of a scene; src/annotate.js annotation layers
src/ops.js       operations (pure, atomic, with inverses); src/diff.js evaluate + diff
src/schema.js    JSON Schemas (written to schema/ by npm run schemas)
src/node/        Node-only: workspace.js (targets, history, undo, outputs)
src/board/       board.js (holes, nodes), draw-board.js, boards/*.js (data)
src/parts/       types/ (meaning), packages/ (shape), db.js (part numbers), colors.js
src/circuit/     build.js (pipeline), checks.js (placement checks)
src/i18n/        en.js (reference), es.js, index.js (t)
src/sim/         stage 2, empty for now (see its README)
bin/             CLI
scripts/         render-examples.js (+ gallery), preview.js (PNG)
examples/        circuits; out/ is generated and ignored by git
test/            node:test suites
```
