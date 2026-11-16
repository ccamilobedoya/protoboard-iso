# Operations, checks and drawings

With the connector's tools, the same names: `apply_ops` for `kit apply`, `try_ops` for a dry run
that never saves, `inspect`, `query`, `suggest`, `review`, `netlist`, `simulate`, `render`.

## Operations: small, checked changes

For a value, a description, a small fix, or a circuit written by hand. Never rewrite the circuit
file: change it with operations.

```text
kit history / kit inspect <folder>           what happened, the drawing in numbers
kit query / kit suggest <folder> …           what is where; where a part fits (never compute holes)
kit apply <folder> --ops '<json>' --dry-run  what the change fixes and what it breaks
kit apply <folder> --ops '<json>' --expect-revision n [--author a] [--note t]   → a new revision
kit review <folder>                          until APPROVED · kit undo <folder> when needed
```

- `kit suggest <folder> --part '<json>' --between <group>,<group>` gives placements ready to
  apply: `--between` (groups in pin order) or `--connect '{"pin": "group"}'`, groups named by a
  placed pin (`R1.2`); `--parts '<json>'` places a chain in one call; `--profile lesson` leaves out
  what review would block. When nothing fits it says why (`reasons`): act on the reason, never
  repeat the call.
- `kit query <folder> at c12 | node 9:a-e | free --near e10`: what is in a hole, a group, free
  places near one.
- Operations: `add`, `remove`, `move`, `set`, `rename`, `circuit`. `set` changes a field
  (`{"op": "set", "part": "R1", "value": "4k7"}`); `circuit` the top-level ones (`supplies`,
  `environment`, `page`, `clearance`, `lang`…).
- A diff that introduces an error or a warning is not applied: find another placement.

## Check it

- **`kit review <folder>`** is the definition of done: APPROVED, APPROVED WITH WARNINGS or CHANGES,
  `--profile lesson` (teaching layouts, the default) or `--profile draft` (only errors and
  warnings). Each blocking item names its parts and views. A circuit made by `layout` also gets its
  nets checked against what was asked. It also runs the simulator's DC point (the one `simulate`
  prints) and lists as hazards the parts past a maximum (⚠): they do not block, because burning a
  part can be the lesson, but the verdict is never a plain APPROVED over them. It reads that point at
  rest and with each control moved alone (a button pressed, a switch in its other position, a
  potentiometer at each end), and a hazard found only so says when (`with S1 pressed`). Not found:
  combinations of controls, sensors that follow the environment, a board's program, and transient
  peaks (PWM, a 555, a generator).
- **`kit netlist <folder>`**: every net with its pins, one call to compare with what the circuit
  must do.
- **`kit simulate <folder> [--transient stop,step]`** (a model, not a measurement): node voltages
  and part currents, DC or transient; warnings for shorts, overloads and floating groups. It needs a
  source (a supply or a battery part). **Never show a value a learner is asked to predict.**

## Show it

- The page **`out/<name>.html`** is rewritten on every change under the same name: two views,
  zoom, labels, tap a part for its card. With a source it runs the simulation by itself (values of
  the tapped part, oscilloscope, lit LEDs, a Current button). While a learner must predict a value:
  `"page": {"simulation": false}` (a `circuit` operation). `kit page <folder>` writes it again.
- **Sensors** read the circuit's `environment` (`{"light": 300, "temperature": 25}`, set with a
  `circuit` operation): the page shows each field with an indicator in an *Environment* panel
  (`"page": {"controls": [{"environment": "light"}]}`); a value on the part wins.
- **`kit inspect <folder> [--json]`** answers placement, visibility and label questions in numbers.
  `kit render <folder> -o out.svg` draws it: `--view back`, `--fit parts` (close-up),
  `--annotate all` (holes, groups), `--focus Q1`, `--sim`. A PNG needs the optional
  `@resvg/resvg-js` package, which this skill does not include: hand over the page or an SVG.
