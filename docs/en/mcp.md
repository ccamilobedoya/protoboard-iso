# MCP server

*[Español](../es/mcp.md)*

`mcp/server.js` exposes the kit as [Model Context Protocol](https://modelcontextprotocol.io)
tools, so any compatible assistant (Claude Code, Claude Desktop, other agents) can resume,
inspect and change circuits with typed inputs and short structured answers. It is a thin
layer over the same functions as the CLI (see [agent-interface.md](agent-interface.md)).

It lives in its own package (`mcp/package.json`) because it needs the MCP SDK and Zod; the
kit itself stays dependency-free.

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
| `suggest` | valid placements for a new part, each with its `add` operation | no |
| `apply_ops` | atomic batch; `dry_run` first, then `expect_revision`, `author`, `note` | yes |
| `undo` | undo the latest change (new revision) | yes |
| `review` | APPROVED or CHANGES from measurements, profile `lesson` or `draft` | no |
| `history` | revisions, authors, notes, operations | no |
| `render` | writes the SVG; `png_width` also returns a PNG image; `page: true` rewrites the embeddable page ([embedding.md](embedding.md)); `sim: true` draws the simulation results; `focus: [ids]` dims the rest; `flow: true` the current layer | outputs only |
| `simulate` | node voltages and part currents, a model ([simulation.md](simulation.md)); `analysis: dc \| transient`, `stop`, `step`, `start`; `falstad: true` adds the link that opens the circuit in Falstad ([falstad.md](falstad.md)) | no |
| `catalog` | types, part numbers, packages, boards, views, operations, layers | no |

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
apply_ops {target, ops: <from suggest>, dry_run: true}         → what it fixes / introduces
apply_ops {target, ops, expect_revision: 0, author: "claude", note: "pull-down"} → rev 1
```

## Agents use these tools

The subagents in `.claude/agents/` list these tools by name ([agents.md](agents.md)). When a
tool is renamed, removed or changes its inputs, update the agents in the same change;
`npm run test:mcp` fails if an agent lists a tool the server no longer has.
