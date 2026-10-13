# Agent interface: resume, inspect, change

*[Español](../es/interfaz-para-agentes.md)*

How an assistant, an agent or a script picks up an existing circuit and changes it safely.
Every command below also exists in the API; the planned MCP server will expose the same
functions as tools.

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
2. Propose a batch of operations; `apply --dry-run`.
3. If the diff introduces nothing unintended, apply with `--expect-revision`, an author and
   a note that says why.
4. Never edit `circuit.json` by hand while others work on it, and never edit outputs.

## Coming next (see ROADMAP.md, stage 1.5)

Queries (`at`, `node`, `free`, `suggest`) so placements are computed instead of guessed, an
MCP server exposing all of this as tools, and agent roles (layout, reviewer, parts
librarian) that share state through these files.
