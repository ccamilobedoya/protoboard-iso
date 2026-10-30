# Agents

*[Español](../es/agentes.md)*

Three Claude Code subagents, defined in `.claude/agents/`, split the work so the main
conversation stays light. They share state **through the files** (the circuit, its history
with an author per change, the derived report), never through the chat. They use the MCP
tools ([mcp.md](mcp.md)) and fall back to the CLI.

| Agent | Does | Changes |
|---|---|---|
| `circuit-layout` | builds or changes a circuit from a brief: a recipe or a new one with `layout` (path A), changes and fixes with `suggest` → dry run → apply → `review` (path B); `simulate` for warnings at the end | the circuit (through `layout` and `apply_ops`) |
| `circuit-reviewer` | verdict from measurements (`review`, `inspect`, connections) with dry-run-checked fixes | nothing |
| `parts-librarian` | adds parts to the kit from datasheets: part numbers, packages, types, tests, docs | the kit's code |

## `review`: the shared definition of done

```bash
node bin/protoboard-iso.js review <target> [--profile lesson|draft] [--views front,back] [--explain] [--json]
```

Turns `check` and `inspect` (both views) into a verdict, so every agent and every person
gets the same answer:

| Profile | Blocks |
|---|---|
| `lesson` (default) | errors and warnings, labels covering parts or each other, parts closer than `clearance`, a part hidden in **every** view (less than 70 % of it seen from its best view), a net of the circuit's `spec` no longer connected |
| `draft` | errors and warnings only |

Errors and warnings include parts that take up the same space and, since 2026-10-16, a lead or
a jumper that passes through another part (`LEAD_THROUGH_PART`, `WIRE_THROUGH_PART`): a
resistor lead bent over a header, a jumper under a regulator. Everything else is advisory
(unconnected pins, leader lines, small text, a part hidden from one view only: use the other).
Each blocking item names the parts it is about and the views it shows in; `--explain`
(`explain: true`) adds the profile's rules. Exit code 0 when approved, 2 when changes are
needed. Also an MCP tool (`review`).

## Fewer calls per circuit

Measured on 2026-10-16: a layout agent rebuilding a two-rail supply took 68 calls and about
185 000 tokens. What cuts that down:

- `catalog` without `name` is a compact list (about 2 KB instead of 20); `name` gives one type's
  fields and a real example only when needed.
- `suggest` with `parts` places a chain of parts in one call, each given the ones before it,
  naming earlier pins as groups (`"R1.2"`); with `profile: "lesson"` it leaves out what review
  would block, so fewer review rounds. It also measures more candidates when the first ones all
  fail, instead of answering "no placement".
- `netlist` checks every connection against the brief in one call (it was one `query node` per
  strip).
- Since 2026-10-17 (after two runs with a smaller model got stuck): `suggest` keeps room for what
  comes next. A strip with a lone pin, and each group a later part of the chain names, keeps a
  usable hole per connection to come: not under a body, and a probe jumper from there passes the
  same evaluation as a placement. In a chain it also tries the parts that hang from the one being
  placed and, when none of its best six positions lets them fit, keeps the best one with a
  `DEPENDENT_BLOCKED` note. When nothing fits it says why (`reasons`), so the agent does not
  repeat the same call; parts beside the board (switch, UNO) are placed too; a part that hangs
  from one that failed says so. `create_circuit`, `inspect` and `catalog name: bb400` give the
  board layout (rail holes come in groups: `B-7` does not exist on a bb400), and a hole that is
  not on the board names the nearest ones. `between` takes `null` for a lead to a free strip, and
  `set` refuses fields the part type does not have (a `{"field": …, "value": …}` set used to be
  saved silently and left the description out). When a part does not fit on the group it is
  asked for, `suggest` puts it in a free strip nearby and joins it with a jumper in the same batch
  (note `VIA_WIRE`; `via: false` turns it off); a body crowding another pays in the score, and a
  lead with no group asked for never lands on a rail.
- The server reloads the kit when its code changes ([mcp.md](mcp.md)), so nobody has to
  reconnect it after a kit update.

## `layout`: the whole circuit in one call (since 2026-10-17)

For a new circuit without fixed positions the layout agent starts with `layout` (MCP tool or
`protoboard-iso layout <target> <spec.json>`): parts without pins in signal order, and nets as
lists of pins and rails. The algorithm places the parts by layers (distance from the source), by
rules per part kind, adds the jumpers and checks the nets and the lesson review, in about a second;
measured on the two-rail supply of `examples/layout/two-rail-supply.json` (10 parts, 10 nets): approved, 7 jumpers, 1.8 s. What it
cannot solve comes back as blocking items for the usual loop. Parts can be given by part number,
module or alias (`"part": "7805"`, `"KCD1"`, `"UNO"`, `"resistencia"`), so the agent does not look
them up first; a list with mistakes places nothing and answers every problem at once (unknown
names with the closest ones, nets naming a missing part or pin with the pins it has); `check_only`
only checks. Measured with a smaller model on the same supply: 13 calls and 52 s, nine of them
`catalog` lookups that this makes unnecessary. How the algorithm works, its limits and how to
change it: [layout.md](layout.md).

Since 2026-10-20 (aimed at small models): the agent's file starts with a choice of path (A: `layout`
for a new circuit; B: operations for changes and fixes) instead of one long loop; `layout` reads pin
names as people write them (`D1.K` for an LED's cathode, `U1.DISCH`, `U1.GPIO4`, `U1.VIN`); its
answer ends in one `STATUS:` line (`DONE`, `CHANGES`, `FIX_SPEC`) that says what to do next; and the
layout agent and the reviewer run `simulate` once for warnings (short, over a limit, floating),
reporting no values. Until then the layout agent's tools list lacked `layout` itself;
`npm run test:mcp` now fails when an agent's instructions name a tool its list does not have.

Also since 2026-10-20: a circuit made by `layout` keeps its nets (`spec`), `review` checks them, and
other connections or parts are one more `layout` call on the same target with the new nets (path A):
every part keeps its holes when it still fits, and `undo` brings the old layout back. Ground nets
go to a − rail by convention, and what the relayout loop leaves is tried once more jumper by jumper.
The lesson profile blocks a part as hidden when its best view shows less than 70 % of it (it was
85 % in every view): both bench circuits now pass at the first try. Details in [layout.md](layout.md).

Since 2026-10-26: **recipes** ([recipes.md](recipes.md)), the usual lesson circuits that
`layout` takes by name with only the values that change (`{"recipe": "npn-switch", "values":
{"R1": "470"}}`), each one tested to come out `DONE` in one call. A recipe circuit needs no agent:
the main conversation calls `layout` itself and keeps the layout agent for `CHANGES` (or passes
the recipe in the brief's `Recipe:` line). The agent's path A starts with the recipe when the brief
asks for one of those circuits.

## The loop (run by the main conversation)

```text
user request
  → a recipe? layout with recipe and values from here (STATUS: DONE → show it)
  → circuit-layout   (LAYOUT BRIEF)    → LAYOUT REPORT, circuit at revision n
  → circuit-reviewer (REVIEW BRIEF)    → REVIEW REPORT: APPROVED, or CHANGES with fixes
  → if CHANGES: send the fixes to the same circuit-layout (at most two rounds)
  → show the result: render with fit "parts" (and annotate when teaching holes)
  → to embed it in documentation: out/<name>.html, already rewritten (docs/en/embedding.md)
missing component at any point → parts-librarian (PARTS BRIEF) → PARTS REPORT
```

The reviewer also checks **intent**: it reads the `netlist` and blocks a missing or wrong
connection even when the measurements pass.

## Briefs

An agent does not see the conversation: everything it needs goes in the brief.

```text
LAYOUT BRIEF
Target: <name> (a folder under the MCP root, without a "circuits/" prefix; new | existing, revision n)
Goal: <what the circuit is for, one line>
Recipe: <name and values, {"R1": "470"}, when it is one; then no Connections or Parts>
Connections: <one line each: "R1 between rail T+ and the LED anode", "LED cathode to T- via W1">
Parts: <id, type, value or part number; positions only if the user fixed them>
Board: <bb400 | bb830 …>, may grow (when the layout may move to the elastic board, auto)
Constraints: <clearance (default 3 for lessons), area of the board, view>
Fidelity: functional (default) | exact
Page: live (default: simulation on, Current button) | no simulation (a value to predict: page.simulation false)
Done when: review <profile> APPROVED
```

`Fidelity: functional` (the default, the maintainer's choice after the two-rail supply of
2026-10-16 took half a session's tokens to copy a photo): the same connections and the same
behaviour (it simulates when it has a supply), no part crossing another, review approved;
positions from a photo are a hint, not a target. `exact` only when the lesson is about where
things go on the board. Every part of the brief must exist in the kit: `layout` checks the names
itself (unknown ones come back with the closest names, nothing created), and path B looks a type up
with `catalog` only when it has not used it. A missing part goes to `parts-librarian` first, not to a
placeholder.

```text
REVIEW BRIEF
Target: <name> · revision <n>
Profile: lesson | draft
Intent: <the connections the circuit must have, as in the layout brief>
```

```text
PARTS BRIEF
Part: <part number> · <what it is used for>
Datasheet: <URL, if known>
Needed for: <circuit or lesson>
```

Replies follow the formats at the end of each agent file (`LAYOUT REPORT`, `REVIEW REPORT`,
`PARTS REPORT`). Each ends in one `STATUS:` line, so the main conversation knows what comes next
without reading the rest: layout `DONE | CHANGES | BLOCKED`, review `APPROVED | CHANGES` (the same
word as its verdict), parts `DONE | BLOCKED`. `node scripts/report-status.js < report` checks the
line and that it agrees with the report.

## Keeping the agents up to date

The agents are part of the repository and **depend on the rest of it**: each file in
`.claude/agents/` names MCP tools, CLI commands, operations, review profiles, rules and the
brief and report formats. A change to any of those can require changing the agents:

| If you change… | Update |
|---|---|
| an MCP tool (name, inputs, what it returns) or a CLI command | the `tools:` list and the instructions of every agent that uses it |
| operations (`src/ops.js`) or review profiles (`src/review.js`) | `circuit-layout` and `circuit-reviewer` rules and loops |
| how parts are added (`docs/*/adding-parts.md`, registries, schemas) | `parts-librarian` order of work and checks |
| the privacy rules (`CLAUDE.md`, "Privacy"; `test/privacy.test.js`) | `parts-librarian`'s rule on what it writes |
| the layout algorithm (`src/layout.js`: its spec, what it answers, what it leaves to the loop) | `circuit-layout` step 0, the MCP `layout` description, [layout.md](layout.md) |
| a brief or report format, or the loop | the agent files and this page (both languages) |

Do it in the same change. `npm run test:mcp` checks that every `mcp__protoboard-iso__…` tool
an agent lists exists in the server, so a renamed or removed tool is caught.

## Notes

- Agents are loaded when a Claude Code session starts in this repository; MCP tools too.
- Each agent writes its name as `author`, so `history` shows who did what.
- Keep agents short-lived: a new agent per task, reuse it only for the fix rounds of the same
  circuit.
