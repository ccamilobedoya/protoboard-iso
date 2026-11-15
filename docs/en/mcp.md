# MCP server

*[Español](../es/mcp.md)*

`mcp/server.js` exposes the kit as [Model Context Protocol](https://modelcontextprotocol.io)
tools, so any compatible assistant (Claude Code, Claude Desktop, other agents) can resume,
inspect and change circuits with typed inputs and short structured answers. It is a thin
layer over the same functions as the CLI (see [agent-interface.md](agent-interface.md)).

It lives in its own package (`mcp/package.json`) because it needs the MCP SDK and Zod; the
kit itself stays dependency-free. The tools are defined in `mcp/tools.js`; `mcp/server.js`
registers them and runs their handlers in a worker thread (`mcp/kit-worker.js`); the server
itself is `mcp/core.js`. In a host with MCP Apps, `layout` also shows the circuit's live page in the
conversation: [mcp-apps.md](mcp-apps.md).

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
| `PROTOBOARD_APPS` | `auto` | the circuit's live page inside hosts with MCP Apps: `auto` to a client that announces the extension, `on` to every client, `off` to none ([mcp-apps.md](mcp-apps.md)) |
| `PROTOBOARD_DEV` | unset | `1`: the tools run in a worker restarted when the kit's code changes (for working on the kit; this repository's `.mcp.json` sets it) |
| `PROTOBOARD_APPS_DEBUG` | unset | `1`: the viewer reports what the host answers to `<root>/.protoboard/app-report.jsonl` ([mcp-apps.md](mcp-apps.md)) |

## Register it

**Claude Code, this repository:** `.mcp.json` at the root registers `node mcp/server.js`
with `PROTOBOARD_ROOT=.`. Claude Code asks to approve it the first time.

If `node` is not on the PATH Claude Code starts with (for example with nvm), register it
with absolute paths in your local scope instead; it takes precedence over `.mcp.json`:

```bash
claude mcp add --scope local protoboard-iso -e PROTOBOARD_ROOT="$HOME/circuits" -e PROTOBOARD_LANG=es \
  -- "$(command -v node)" "$PWD/mcp/server.js"
claude mcp get protoboard-iso     # should say: Connected
```

Run it from the clone (`$PWD/mcp/server.js`). `PROTOBOARD_ROOT` is a folder of your own for the
circuits (`mkdir "$HOME/circuits"` first), not the clone; to keep them with a project (for example a
course folder), point it at that folder.

**Other clients:** a stdio server with command `node`, argument the absolute path of
`mcp/server.js` and the environment above.

### Claude Desktop

Open the file from **Settings > Developer > Edit Config** (it creates `claude_desktop_config.json`
if it does not exist and shows where it is), add the server under `mcpServers`, save, and quit and
reopen Claude Desktop completely:

```json
{
  "mcpServers": {
    "protoboard-iso": {
      "command": "node",
      "args": ["/absolute/path/to/protoboard-iso/mcp/server.js"],
      "env": {
        "PROTOBOARD_ROOT": "/absolute/path/to/my-circuits",
        "PROTOBOARD_LANG": "en"
      }
    }
  }
}
```

- `args` holds the absolute path of `mcp/server.js` in the clone, after `cd mcp && npm install`.
- `PROTOBOARD_ROOT` is a folder of your own where the circuits will be saved (create it first).
  It is **not** the clone: the server reads and writes only inside it.
- `PROTOBOARD_LANG` is `en` or `es`.
- Claude Desktop starts the server with its own PATH. If `node` is installed with nvm (or any
  version manager) it may not be found: put the absolute path of `node` in `command`
  (`command -v node` prints it on macOS and Linux; `where node` on Windows).
- On Windows write the paths with doubled backslashes or with forward slashes:

```json
"command": "C:\\Program Files\\nodejs\\node.exe",
"args": ["C:\\protoboard-iso\\mcp\\server.js"],
"env": { "PROTOBOARD_ROOT": "C:/my-circuits" }
```

Each circuit is a folder under the root; the page of each is `out/<name>.html` inside it, and every
`layout`, `apply_ops` and `undo` answer says its absolute path: double-click it to open it.

## Tools

| Tool | Does | Changes files |
|---|---|---|
| `list_circuits` | circuits under the root (files with `parts`, folders with `circuit.json`) | no |
| `get_circuit` | the circuit JSON, its revision and placement issues; a circuit made by `layout` carries `spec` (the nets it was asked for) | no |
| `create_circuit` | new circuit folder from a full circuit with its holes, written by hand (refuses to overwrite); without fixed positions use `layout` | yes |
| `inspect` | the drawing in numbers; `part` for one part only | no |
| `query` | `kind: at \| node \| free` with `ref` | no |
| `netlist` | the circuit as nets: groups joined by wires, the pins on each (`R1.1@d20`), labels, pins alone on a net | no |
| `layout` | a usual lesson circuit by name: `recipe` and only the `values` that change ([recipes.md](recipes.md)); otherwise a whole circuit placed in one call from its parts (no holes, signal order; part numbers, modules and aliases) and nets (pins and rails; usual pin names work: `D1.K`, `U1.VIN`, `U1.GPIO4`): layers by distance from the source, rules per part kind, jumpers, ground nets to a − rail, the nets check and the lesson review, laid out again and repaired jumper by jumper. On an existing target, laid out again as one revision with the new nets and, if parts change, the full parts list (`expect_revision`; parts keep their holes; `undo` restores). The nets stay in the circuit (`spec`). Ends in `STATUS: DONE \| WARNINGS \| CHANGES \| FIX_SPEC \| SPEC_OK`; `check_only` only checks. The algorithm: [layout.md](layout.md) | yes |
| `suggest` | valid placements for a new part, each with its `add` operation and the nearest body (`nearest`: part and gap); `profile` also leaves out what that review blocks; `parts` places several in order and answers one batch | no |
| `apply_ops` | atomic batch; `dry_run` first, then `expect_revision`, `author`, `note` | yes |
| `try_ops` | the same batch as a dry run only: what it would fix and introduce; for read-only roles (the reviewer) | no |
| `undo` | undo the latest change (new revision) | yes |
| `review` | APPROVED, APPROVED WITH WARNINGS (`hazards`: parts the DC simulation takes past a maximum; they do not block) or CHANGES from measurements, profile `lesson` or `draft`; each blocking item names its `parts` and `views`; `explain: true` adds the profile's rules; a circuit with `spec` also gets its nets checked | no |
| `history` | revisions, authors, notes, operations | no |
| `render` | writes the SVG; `png_width` also returns a PNG image; `page: true` rewrites the embeddable page ([embedding.md](embedding.md)); `sim: true` draws the simulation results; `focus: [ids]` dims the rest; `flow: true` the current layer | outputs only |
| `simulate` | node voltages and part currents, a model ([simulation.md](simulation.md)); `analysis: dc \| transient`, `stop`, `step`, `start`; `falstad: true` adds the link that opens the circuit in Falstad ([falstad.md](falstad.md)) | no |
| `catalog` | without `name`: a compact list (types grouped by family, each with its pins and its first part numbers, `… (+N more)` for the rest; modules, batteries, boards, views, operations); and the recipes as names by group (`catalog` with the recipe's name gives its title, parts, nets and values); with `name` (a type, part number, module or recipe): pins, package, the fields it takes and a real part from `examples/` to copy, and for a part what its card in the page says it is (`about`), what each pin does (`pinRoles`) and the limits the simulator checks it against (`limits`: rated and maximum values with their units; `limitFields`, the fields they follow, as a resistor's `power`) (for a recipe, its parts, nets and values with their limits); `format: "json"` without `name`: every registry in full | no |

**Groups by pin.** Wherever a tool takes a group (`suggest`'s `between` and `connect`,
`query node`), a pin of a part already placed names the group it is in: `"R1.2"`, `"U1.OUT"`.

**Targets** are relative to the root, as `list_circuits` shows them. A target that starts with a
folder that does not exist there (`circuits/led` or `circuitos/led` when the root already is the
circuits folder) is read without it, so the circuit does not end up nested one level down.

Every tool answers in readable text, or JSON with `format: "json"`. Errors come back as tool
errors with a readable message (`isError`), never as a crash. Read-only tools are annotated
`readOnlyHint`, so clients can allow them without asking.

The server also sends **instructions**, the same guide as the plugin's skill (`plugin-src/SKILL.md`) in a few lines: which tool for
which task (recipes first: a usual lesson circuit → `layout` with `recipe`; another new circuit → `layout`; other connections in a circuit made by `layout` → `layout`
again; a value or a fix → `apply_ops`), what each `STATUS:` means, the operations loop, how to check
(`review`, `netlist`, `simulate`, never showing a value to predict), the holes, and the page's
simulation. Never rewrite circuit files; PNG only when style matters.

## What the server keeps and where

The server holds no state in memory that matters: a host may run two processes of it for one session
(Claude Desktop does), and any of them may die or be duplicated at any time. What it keeps is on disk, in
the root:

- **The circuits**: `circuit.json`, `history.jsonl` and `out/` of each folder, or a circuit file. Two
  processes may change one circuit: the change is made under a lock (a folder `circuit.json.lock`,
  taken over if older than 30 s), so `expect_revision` is honoured by exactly one of two simultaneous
  calls and the other gets `REVISION_MISMATCH`.
- **`.protoboard/`**, the server's own hidden folder (`list_circuits` and the root's circuit search
  ignore it), written with a temp file renamed into place:
  - `selection.json`: what the user last tapped in the live board (MCP Apps), at most the last 32
    circuits, nothing older than 24 hours ([mcp-apps.md](mcp-apps.md)).
  - `pages/<circuit hash>.<revision>.<id>.json`: the assembled page being handed to the viewer in chunks;
    the newest 2 revisions per circuit, at most 64 files and 64 MB in all, nothing older than 7 days,
    pruned whenever one is written.
  - `app-report.jsonl`, only with `PROTOBOARD_APPS_DEBUG=1`: at most 256 KB, one line per report.

Deleting `.protoboard/` at any time is safe: everything in it is rebuilt or only forgotten. By default the
tools run inside the server process; with `PROTOBOARD_DEV=1` (set in this repository's `.mcp.json`) they run
in a worker that is restarted when the kit's code changes, a convenience for working on the kit. The
server ends when its stdin ends or closes.

## Example session

```text
layout    {target: "blink", recipe: "555-astable", values: {C1: "22u"}}
                                     → … STATUS: DONE · rev 0
layout    {target: "switch", parts: [...], nets: [["R2.2", "D1.A"], ["D1.K", "Q1.C"], …]}
                                     → … STATUS: DONE · rev 0
get_circuit {target: "switch"}       → circuit with spec.nets
layout    {target: "switch", nets: <spec.nets with one change>, expect_revision: 0}
                                     → … STATUS: DONE · rev 1 (every other part where it was)
apply_ops {target, ops: [{op: "set", part: "R2", value: "470"}], dry_run: true} → what it fixes / introduces
apply_ops {target, ops, expect_revision: 1, author: "claude", note: "dimmer LED"} → rev 2
review    {target}                   → APPROVED (nets checked against the spec; APPROVED WITH WARNINGS when a part would burn)
undo      {target}                   → rev 3, R2 back to 330
```

A circuit made by hand goes through the operations loop instead: `inspect`, then `suggest`
(`parts` for a chain, `profile: "lesson"`), `apply_ops` with a dry run, `netlist`, `review`.

## Agents use these tools

The subagents in `.claude/agents/` list these tools by name ([agents.md](agents.md)). When a
tool is renamed, removed or changes its inputs, update the agents in the same change;
`npm run test:mcp` fails if an agent lists a tool the server no longer has.
