# MCP server

*[Español](../es/mcp.md)*

`mcp/server.js` exposes the kit as [Model Context Protocol](https://modelcontextprotocol.io)
tools, so any compatible assistant (Claude Code, Claude Desktop, other agents) can resume,
inspect and change circuits with typed inputs and short structured answers. It is a thin
layer over the same functions as the CLI (see [agent-interface.md](agent-interface.md)).

It lives in its own package (`mcp/package.json`) because it needs the MCP SDK and Zod; the
kit itself stays dependency-free. The tools are defined in `mcp/tools.js`; `mcp/server.js`
registers them and runs their handlers in a worker thread (`mcp/kit-worker.js`).

**It reloads the kit by itself.** Before each call the server checks whether the kit's code
(`src/`, `mcp/tools.js`) changed since its worker started; if so it starts a new worker, so the
answers and the pages it writes always come from the current code, and that answer ends with
a note saying so. A long-lived server used to keep writing pages with the old interface until
someone reconnected it. Renaming or adding a tool, or changing a tool's inputs, still needs a
reconnect (`/mcp` in Claude Code): the note says when.

## Install and run

```bash
cd mcp && npm install          # @modelcontextprotocol/sdk, zod (+ optional @resvg/resvg-js for PNG)
npm run test:mcp               # from the repository root: end-to-end tests with the MCP client
```

Environment:

| Variable | Default | Meaning |
|---|---|---|
| `PROTOBOARD_ROOT` | current directory | the only folder the server reads and writes; paths outside are refused |
| `PROTOBOARD_LANG` | `en` | default language of answers and files (`en`, `es`); a circuit's own `"lang"` and a tool's `lang` argument win over it |

## Register it

**Claude Code, this repository:** `.mcp.json` at the root registers `node mcp/server.js`
with `PROTOBOARD_ROOT=.`. Claude Code asks to approve it the first time.

If `node` is not on the PATH Claude Code starts with (for example with nvm), register it
with absolute paths in your local scope instead; it takes precedence over `.mcp.json`:

```bash
claude mcp add --scope local protoboard-iso -e PROTOBOARD_ROOT=$PWD -e PROTOBOARD_LANG=es \
  -- "$(command -v node)" "$PWD/mcp/server.js"
claude mcp get protoboard-iso     # should say: Connected
```

To use it from another project (for example a course folder with its own circuits), run the
same command from that project with `PROTOBOARD_ROOT` pointing at it.

**Claude Desktop / other clients:** a stdio server with command `node`, argument the absolute
path of `mcp/server.js` and the environment above.

## Tools

| Tool | Does | Changes files |
|---|---|---|
| `list_circuits` | circuits under the root (files with `parts`, folders with `circuit.json`) | no |
| `get_circuit` | the circuit JSON, its revision and placement issues | no |
| `create_circuit` | new circuit folder (refuses to overwrite) | yes |
| `inspect` | the drawing in numbers; `part` for one part only | no |
| `query` | `kind: at \| node \| free` with `ref` | no |
| `netlist` | the circuit as nets: groups joined by wires, the pins on each (`R1.1@d20`), labels, pins alone on a net | no |
| `layout` | a NEW circuit placed in one call from its parts (no pins, signal order) and nets: layers by distance from the source, rules per part kind, jumpers for what is left in several strips, then the nets check (missing, shorted) and the lesson review; lays itself out again a few times without the place of whatever the review blocks. Parts by part number, module or alias; a wrong list places nothing and answers every problem; `check_only` only checks. The algorithm: [layout.md](layout.md) | yes |
| `suggest` | valid placements for a new part, each with its `add` operation and the nearest body (`nearest`: part and gap); `profile` also leaves out what that review blocks; `parts` places several in order and answers one batch | no |
| `apply_ops` | atomic batch; `dry_run` first, then `expect_revision`, `author`, `note` | yes |
| `undo` | undo the latest change (new revision) | yes |
| `review` | APPROVED or CHANGES from measurements, profile `lesson` or `draft`; each blocking item names its `parts` and `views`; `explain: true` adds the profile's rules | no |
| `history` | revisions, authors, notes, operations | no |
| `render` | writes the SVG; `png_width` also returns a PNG image; `page: true` rewrites the embeddable page ([embedding.md](embedding.md)); `sim: true` draws the simulation results; `focus: [ids]` dims the rest; `flow: true` the current layer | outputs only |
| `simulate` | node voltages and part currents, a model ([simulation.md](simulation.md)); `analysis: dc \| transient`, `stop`, `step`, `start`; `falstad: true` adds the link that opens the circuit in Falstad ([falstad.md](falstad.md)) | no |
| `catalog` | without `name`: a compact list (types with their pins, part numbers by type, modules, batteries, boards, views, operations); with `name` (a type, part number or module): pins, package, the fields it takes and a real part from `examples/` to copy; `format: "json"` without `name`: every registry in full | no |

**Groups by pin.** Wherever a tool takes a group (`suggest`'s `between` and `connect`,
`query node`), a pin of a part already placed names the group it is in: `"R1.2"`, `"U1.OUT"`.

**Targets** are relative to the root, as `list_circuits` shows them. A target that starts with a
folder that does not exist there (`circuits/led` or `circuitos/led` when the root already is the
circuits folder) is read without it, so the circuit does not end up nested one level down.

Every tool answers in readable text, or JSON with `format: "json"`. Errors come back as tool
errors with a readable message (`isError`), never as a crash. Read-only tools are annotated
`readOnlyHint`, so clients can allow them without asking.

The server also sends **instructions** with the work loop: list → history/inspect →
query/suggest → apply_ops dry_run → apply_ops with expect_revision → undo if needed; never
rewrite circuit files directly; PNG only when style matters.

## Example session

```
list_circuits                       → circuits/led · rev 0 · 3 parts
inspect   {target: "circuits/led"}  → … De R1 se ve el 81 %; W1 tapa el 15 %.
suggest   {target, part: {type: "resistor", value: "1k"}, between: ["10:f-j", "T-"]}
suggest   {target, parts: [{part: {type: "led"}, between: ["20:f-j", "21:f-j"]},
                           {part: {type: "resistor", value: "330"}, between: ["D2.cathode", "T-"]}],
           profile: "lesson"}                                    → one batch of adds
netlist   {target}                   → every net with its pins, to check against the brief
apply_ops {target, ops: <from suggest>, dry_run: true}         → what it fixes / introduces
apply_ops {target, ops, expect_revision: 0, author: "claude", note: "pull-down"} → rev 1
```

## Agents use these tools

The subagents in `.claude/agents/` list these tools by name ([agents.md](agents.md)). When a
tool is renamed, removed or changes its inputs, update the agents in the same change;
`npm run test:mcp` fails if an agent lists a tool the server no longer has.
