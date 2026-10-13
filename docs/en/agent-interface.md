# Agent interface: resume, inspect, change

*[Español](../es/interfaz-para-agentes.md)*

How an assistant, an agent or a script picks up an existing circuit and changes it safely.
Every command below also exists in the API and as a tool of the MCP server
([mcp.md](mcp.md)).

## Targets

A **target** is where a circuit lives:

| Target | Circuit | History | Outputs |
|---|---|---|---|
| a folder, `circuits/led/` | `circuit.json` | `history.jsonl` | `out/` |
| a file, `examples/led.json` | the file | `led.history.jsonl` beside it | `out/` beside it |

The circuit file is the **only source of truth**. History and outputs are derived; outputs
(`<name>.front.svg`, `<name>.report.json`) can be deleted and regenerated at any time.

## Resuming work

```bash
node bin/protoboard-iso.js history <target>            # what happened, who, why
node bin/protoboard-iso.js inspect <target> --json     # the drawing in numbers (or read out/<name>.report.json)
node bin/protoboard-iso.js check <target>              # placement issues and connected groups
```

Read numbers, not pictures: `inspect` gives every lead's hole and position, visibility and
label problems (see [inspect-and-annotate.md](inspect-and-annotate.md)).

## Queries: ask instead of computing

```bash
node bin/protoboard-iso.js query <target> at c12                     # who is in the hole, its group
node bin/protoboard-iso.js query <target> node 9:a-e                 # a group by name or by any hole (c9)
node bin/protoboard-iso.js query <target> free --near e10 --limit 10 [--empty]
node bin/protoboard-iso.js suggest <target> --part '{"type":"resistor","value":"1k"}' --between 10:a-e,T-
node bin/protoboard-iso.js suggest <target> --part '{"type":"mosfet","part":"IRLZ44N"}' --connect '{"D":"c20"}'
```

- **`at`**: the hole's group, who holds it, the used and free holes of the group.
- **`node`**: every hole of a group (`9:a-e`, `T+`, or any hole of it), used and free, and
  the rail label if any.
- **`free`**: free holes, nearest to `--near` first (a hole, a group or a column number);
  `--empty` keeps only groups nobody uses yet.
- **`suggest`**: valid placements for a **new** part, best first. `--between a,b` gives the
  groups of a two-lead part in pin order; `--connect '{"pin":"group or hole"}'` names the
  groups of some pins (the others go to free, empty strips). `--near` centres the search,
  `--window` (mm, default 20) widens it.

How `suggest` works: a fast geometric pass over every set of holes that respects the lead
rules and the requested groups, then the best dozen are measured exactly like a dry run.
Placements that add an error or a warning are dropped; the rest are ranked by span close to
the ideal, straight along the grid, distance to the centre, notes added (leader crossings,
parts too close) and the least visible part. Three-lead parts prefer pin 1 on the left so
their print faces the front view. Each placement carries the `add` operation to apply:

```
Placements for R2 (Resistor, axial), best first; 12 measured:
  1. 1→b10, 2→T-11 · span 10.5 mm · score 5.3 · least visible part 81 %
To use the first one (check with a dry run, then apply):
  protoboard-iso apply <target> --ops '[{"op":"add","part":{…,"pins":["b10","T-11"]}}]' --dry-run
```

When nothing fits, it says why: `NO_PLACEMENT`, or `NO_PLACEMENT_RAIL` when a three-lead
part is asked to reach a rail directly (it cannot: put it in free strips and add a wire).

## Operations

Change a circuit with small operations instead of rewriting the file. A batch is
**atomic**: all operations apply or none does.

| Operation | Example | Inverse |
|---|---|---|
| `add` | `{ "op": "add", "part": { "id": "C1", "type": "capacitor", "value": "100n", "pins": ["d12", "d13"] } }` | `remove` |
| `remove` | `{ "op": "remove", "part": "D2" }` | `add` (same position) |
| `move` | `{ "op": "move", "part": "W1", "pins": ["a11", "T-11"] }` | `move` back |
| `set` | `{ "op": "set", "part": "R1", "value": "4k7", "tolerance": null }` (`null` deletes) | `set` old values |
| `rename` | `{ "op": "rename", "part": "R1", "to": "R10" }` | `rename` back |
| `circuit` | `{ "op": "circuit", "clearance": 3 }` (title, board, view, clearance, netLabels) | `circuit` old values |

`id` changes only with `rename`, `pins` only with `move`. Schema: `schema/ops.schema.json`.

## Dry run, then apply

```bash
node bin/protoboard-iso.js apply <target> --ops '<json>' --dry-run --lang es
node bin/protoboard-iso.js apply <target> --ops '<json>' --author claude --note "why" --expect-revision 3
node bin/protoboard-iso.js apply <target> ops.json        # or "-" to read standard input
```

Both answer with a **diff**: which issues and drawing problems the change fixes, which it
introduces, and how part visibility moves. Example:

```
Dry run (nothing saved): revision 0 → 1 would change:
  ✔ fixed: note: R1 is 81 % visible; W1 covers 15 % of it.
  ✖ new: note: D1: pin cathode is in column 10 (rows a–e), which nothing else touches.
  visibility: R1 81 % → 96 %
```

Here the move would have hidden less of R1 but disconnected the LED: the dry run shows it
before anything is saved. `--views front,back` measures both views.

**Revisions.** Every saved change bumps `revision` in the circuit and appends a line to
the history. `--expect-revision n` refuses to apply if the circuit is no longer at `n`, so
two agents never overwrite each other: on `REVISION_MISMATCH`, read again and retry.

## History and undo

```bash
node bin/protoboard-iso.js history <target> [--json]
node bin/protoboard-iso.js undo <target> --author claude
```

Each history line: `{ revision, time, author, note, ops, inverse, undoes? }`. `undo`
applies the inverse of the latest change not yet undone and records it as a new revision;
calling it again walks further back.

## In the API

```js
import { applyOps, evaluate, diffEvaluations } from 'protoboard-iso';        // pure, also in the browser
import { applyToTarget, undoTarget, readHistory } from 'protoboard-iso/workspace'; // files
```

## A good loop for an agent

1. `history` and `inspect --json` to understand the current state.
2. Ask instead of computing: `query` for holes and groups, `suggest` for where a new part
   goes. Then propose a batch of operations; `apply --dry-run`.
3. If the diff introduces nothing unintended, apply with `--expect-revision`, an author and
   a note that says why.
4. `review <target>` until it says APPROVED (see [agents.md](agents.md) for profiles).
5. Never edit `circuit.json` by hand while others work on it, and never edit outputs.

## Agents

Layout, reviewer and parts librarian roles built on these tools: [agents.md](agents.md).

## Exit codes (CLI)

| Code | Meaning |
|---|---|
| 0 | fine |
| 1 | errors in the circuit, a refused change (`REVISION_MISMATCH`, bad operations), nothing to undo, or no placement found |
| 2 | `review` says CHANGES |

Every command that reports something also takes `--json` (`check`, `inspect`, `apply`, `undo`, `history`, `query`, `suggest`, `review`).
