# Agents

*[Español](../es/agentes.md)*

Three Claude Code subagents, defined in `.claude/agents/`, split the work so the main
conversation stays light. They share state **through the files** (the circuit, its history
with an author per change, the derived report), never through the chat. They use the MCP
tools ([mcp.md](mcp.md)) and fall back to the CLI.

| Agent | Does | Changes |
|---|---|---|
| `circuit-layout` | builds or changes a circuit from a brief: `suggest` → dry run → apply → `review` until approved | the circuit (through `apply_ops`) |
| `circuit-reviewer` | verdict from measurements (`review`, `inspect`, connections) with dry-run-checked fixes | nothing |
| `parts-librarian` | adds parts to the kit from datasheets: part numbers, packages, types, tests, docs | the kit's code |

## `review`: the shared definition of done

```bash
node bin/protoboard-iso.js review <target> [--profile lesson|draft] [--views front,back] [--json]
```

Turns `check` and `inspect` (both views) into a verdict, so every agent and every person
gets the same answer:

| Profile | Blocks |
|---|---|
| `lesson` (default) | errors and warnings, labels covering parts or each other, parts closer than `clearance`, a part hidden in **every** view |
| `draft` | errors and warnings only |

Everything else is advisory (unconnected pins, leader lines, small text, a part hidden from
one view only: use the other). Exit code 0 when approved, 2 when changes are needed. Also an
MCP tool (`review`).

## The loop (run by the main conversation)

```
user request
  → circuit-layout   (LAYOUT BRIEF)    → LAYOUT REPORT, circuit at revision n
  → circuit-reviewer (REVIEW BRIEF)    → REVIEW REPORT: APPROVED, or CHANGES with fixes
  → if CHANGES: send the fixes to the same circuit-layout (at most two rounds)
  → show the result: render with fit "parts" (and annotate when teaching holes)
  → to embed it in documentation: out/<name>.html, already rewritten (docs/en/embedding.md)
missing component at any point → parts-librarian (PARTS BRIEF) → PARTS REPORT
```

The reviewer also checks **intent**: it queries the groups the brief names and blocks a
missing or wrong connection even when the measurements pass.

## Briefs

An agent does not see the conversation: everything it needs goes in the brief.

```
LAYOUT BRIEF
Target: <name> (a folder under the MCP root, without a "circuits/" prefix; new | existing, revision n)
Goal: <what the circuit is for, one line>
Connections: <one line each: "R1 between rail T+ and the LED anode", "LED cathode to T- via W1">
Parts: <id, type, value or part number; positions only if the user fixed them>
Constraints: <clearance (default 3 for lessons), area of the board, view>
Fidelity: functional (default) | exact
Done when: review <profile> APPROVED
```

`Fidelity: functional` (the default, the maintainer's choice after the two-rail supply of
2026-10-16 took half a session's tokens to copy a photo): the same connections and the same
behaviour (it simulates when it has a supply), no part crossing another, review approved;
positions from a photo are a hint, not a target. `exact` only when the lesson is about where
things go on the board. Every part of the brief must exist in the kit (`catalog`) before the
layout starts; a missing one goes to `parts-librarian` first, not to a placeholder.

```
REVIEW BRIEF
Target: <name> · revision <n>
Profile: lesson | draft
Intent: <the connections the circuit must have, as in the layout brief>
```

```
PARTS BRIEF
Part: <part number> · <what it is used for>
Datasheet: <URL, if known>
Needed for: <circuit or lesson>
```

Replies follow the formats at the end of each agent file (`LAYOUT REPORT`, `REVIEW REPORT`,
`PARTS REPORT`).

## Keeping the agents up to date

The agents are part of the repository and **depend on the rest of it**: each file in
`.claude/agents/` names MCP tools, CLI commands, operations, review profiles, rules and the
brief and report formats. A change to any of those can require changing the agents:

| If you change… | Update |
|---|---|
| an MCP tool (name, inputs, what it returns) or a CLI command | the `tools:` list and the instructions of every agent that uses it |
| operations (`src/ops.js`) or review profiles (`src/review.js`) | `circuit-layout` and `circuit-reviewer` rules and loops |
| how parts are added (`docs/*/adding-parts.md`, registries, schemas) | `parts-librarian` order of work and checks |
| a brief or report format, or the loop | the agent files and this page (both languages) |

Do it in the same change. `npm run test:mcp` checks that every `mcp__protoboard-iso__…` tool
an agent lists exists in the server, so a renamed or removed tool is caught.

## Notes

- Agents are loaded when a Claude Code session starts in this repository; MCP tools too.
- Each agent writes its name as `author`, so `history` shows who did what.
- Keep agents short-lived: a new agent per task, reuse it only for the fix rounds of the same
  circuit.
