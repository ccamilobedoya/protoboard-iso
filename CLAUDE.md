# CLAUDE.md

Guide for Claude Code (and any AI assistant) working **on** this repository. To *use* the
kit as a skill, see `SKILL.md`.

**If `CLAUDE.local.md` exists, read it first**: it holds the maintainer's personal context
(language, machine setup, course). It is not in git.

## Resuming a circuit (not the code)

If the `protoboard-iso` MCP server is connected, use its tools (same loop, typed). Setup and
tools: `docs/en/mcp.md`. Otherwise the CLI:


Circuits are changed with operations, never by rewriting the file:
`history <target>` → `inspect <target> --json` → `query`/`suggest` (never compute holes by
hand) → `apply … --dry-run` → `apply … --expect-revision n`.
See `docs/en/agent-interface.md`.

## Agents (for circuit work)

`.claude/agents/`: `circuit-layout` builds or changes circuits, `circuit-reviewer` judges them
(read-only), `parts-librarian` adds components to the kit. Run the loop from the main
conversation: layout → reviewer → fixes back to the same layout agent (two rounds at most) →
show a close-up. Brief formats and the loop: `docs/en/agents.md`. Definition of done:
`review <target>` (profile `lesson`) says APPROVED.

**The agents depend on the kit.** Their files (`.claude/agents/*.md`) name MCP tools, CLI
commands, operation names, review profiles, brief/report formats and rules from the docs.
When you change any of those (rename or add a tool or command, change an operation, a
profile, a workflow rule or a brief format), update the agent files in the same change and
`docs/en/agents.md` / `docs/es/agentes.md`. `npm run test:mcp` fails if an agent lists an
MCP tool that no longer exists.

## Read before working

0. `docs/en/code-map.md`: where everything lives, the three pipelines (drawing, simulation,
   page) and the conventions that are easy to break (language, texts, layers, data attributes).
   Keep it up to date when you add a module or a convention.
1. `ROADMAP.md`: what is done, what is next. Work on the first 🔜/⬜ item that matches the
   request; tick items when they are done.
2. `PLANNING.md`: architecture, considerations, best practices, decision log. Do not
   reopen a logged decision without a new reason; add new decisions to the log.
3. `docs/en/live-simulation.md` when working on stage 3 (live simulation in the page): design,
   decisions and the plan by phases and sessions.
4. `docs/en/architecture.md` when touching geometry or rendering;
   `docs/en/adding-parts.md` when adding a part, package or board.

## Commands

```bash
npm test                      # unit + rendering tests (node:test, no dependencies)
npm run examples              # examples/*.json → examples/out/*.svg + index.html gallery
npm run examples -- --lang es # same, Spanish messages and labels
npm run preview [-- filter]   # examples/out/*.svg → examples/out/png/*.png (needs npm install)
node bin/protoboard-iso.js inspect <file.json> [--json]   # the drawing in numbers
node bin/protoboard-iso.js render <file.json> -o out.svg --annotate all
node bin/protoboard-iso.js simulate <target> [--transient 5,1m] [--json]   # voltages and currents, a model (docs/en/simulation.md)
node bin/protoboard-iso.js render <target> --sim   # results drawn on the board
node bin/protoboard-iso.js render <target> --focus Q1 | --flow   # dim the rest / current layer (docs/en/focus-and-flow.md)
node bin/protoboard-iso.js page <target>                  # out/<name>.html, the page to embed (docs/en/embedding.md)
node bin/protoboard-iso.js apply <target> --ops '<json>' --dry-run   # then without --dry-run
node bin/protoboard-iso.js undo <target> · history <target>
node bin/protoboard-iso.js query <target> at c12 | node 9:a-e | free --near e10
node bin/protoboard-iso.js suggest <target> --part '<json>' --between <node>,<node>
node bin/protoboard-iso.js review <target> [--profile lesson|draft]   # APPROVED or CHANGES
npm run schemas               # after changing types, boards, views or operations
npm run test:mcp              # MCP server end-to-end (needs: cd mcp && npm install)
node scripts/golden.js [--write]  # simulator output against test/fixtures/sim-golden.json (--write after an intended change)
node scripts/ux-shots.js <targets…> -o <dir> [--browser-dir d] [--tap ID]  # page screenshots at five sizes, alone and in a note (docs/en/ux-pass.md)
node scripts/mockups.js [--lang es]  # conductor view mock-ups → examples/out/mockups/
node bin/protoboard-iso.js check <file.json> [--lang es]
node bin/protoboard-iso.js render <file.json> -o out.svg [--view back] [--fit parts]
```

## How to verify a change

1. `npm test` passes (and `npm run test:mcp` when `src/` APIs or `mcp/` changed).
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
- Commit only when asked. **Commit messages in English**, even when the conversation is in
  another language. Small commits, imperative subject line ("Add query commands").

## Map

```
src/core/        vec.js (3D maths), camera.js (views, projection, light), units.js ("4k7")
src/geometry/    primitives.js: prism, box, lathe, cylinder, tube, decals, textDecal
src/render/      scene.js (display list: painter, labels, framing), svg.js (writer),
                 coverage.js (measuring raster), shading.js
src/inspect.js   numeric report of a scene; src/annotate.js annotation layers
src/ops.js       operations (pure, atomic, with inverses); src/diff.js evaluate + diff
src/query.js     at, node, free, suggest, suggestMany (placements); src/query-format.js text output
src/nets.js      nets: groups joined by wires, with their pins
src/review.js    verdict from measurements, profiles lesson/draft
.claude/agents/  circuit-layout, circuit-reviewer, parts-librarian
src/schema.js    JSON Schemas (written to schema/ by npm run schemas)
src/node/        Node-only: workspace.js (targets, history, undo, create, outputs), raster.js (PNG),
                 bundle.js (ES modules → one script for the page)
mcp/             MCP server (own package: SDK + zod); tools.js (the tools), server.js (registers them,
                 runs them in kit-worker.js, reloaded when src/ changes), test/; .mcp.json registers it
src/board/       board.js (holes, nodes), draw-board.js, boards/*.js (data)
src/parts/       types/ (meaning), packages/ (shape), db.js (part numbers), colors.js
src/circuit/     build.js (pipeline), checks.js (placement checks)
src/i18n/        en.js (reference), es.js, index.js (t)
src/sim/         simulator: compile.js (circuit → program), engine.js (runs it, bundled into pages),
                 mna.js, models.js, devices/ (one file per kind of part), paths.js (conductor view);
                 see its README
src/page/        page.js's browser side: client/ (script modules), style.js
bin/             CLI
scripts/         render-examples.js (+ gallery), preview.js (PNG)
examples/        circuits; out/ is generated and ignored by git
test/            node:test suites
```
