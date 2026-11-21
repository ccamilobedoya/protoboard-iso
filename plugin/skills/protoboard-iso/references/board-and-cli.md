# The board, languages, circuit files and the commands

## The breadboard

Holes `a1`…`j63` (row letter + column); rails `T-`, `T+` (next to row j) and `B+`, `B-` (next to
row a) plus a column (`T+9`). Rows a–e of one column are connected, f–j too; each rail is one
connection. Buttons, DIP chips and a 7-segment display straddle the centre channel. Board `double`:
two boards side by side (rows k–o, p–t on the back one, rails `U-`, `U+` behind; no T rails) for a
DevKit across the joint; `layout` picks it when the DevKit would cover a pin's strip. `layout` and
`suggest` know all this; `kit catalog` lists every part type grouped by family with its pins and
part numbers, plus modules and boards (`kit catalog <name>` for one entry's fields).

## A circuit file written by hand

Only for a lesson about where things go (exact positions). Otherwise use `layout`. Write the file
with the parts in their holes, then `kit check <file.json>` and `kit review <file.json>`, and change
it afterwards with operations ([operations.md](operations.md)). The format, every type and its
fields: the kit's documentation, `docs/en/circuit-format.md` in its repository.

## Languages

Everything the kit writes (messages, drawing labels, the page and its cards) comes in English or
Spanish. In order of priority: the call's `--lang es` (`lang`); the circuit's own `"lang": "es"`
(pages rewritten after each change stay in it); `PROTOBOARD_LANG`, else English. Texts in the
circuit (`title`, each part's `description`) are one string, or one per language
`{ "en": "…", "es": "…" }`. A part's `description` says how it is used in this circuit and shows in
its card; leave it out when the learner should work it out.

## Change it, ask about it

`kit undo <folder>` takes the last change back and `kit history <folder>` lists them; a current or a
voltage: `kit simulate <folder>` (a model); the connections: `kit nets <folder>`; a part:
`kit catalog <name>`; drawings: `kit render` (below).

## Every command

```bash
kit layout <folder> --recipe npn-switch [--values '{"R1":"470"}']
kit layout <folder> [spec.json] [--check] [--dry-run] [--expect-revision n] [--budget seconds]
kit layout <folder> --fix [--dry-run]           # the kit's own "To fix it", as one change
kit apply <folder> --ops '<json>' --dry-run      # then --expect-revision n
kit review | check | netlist | nets | inspect | history | undo <folder>
kit query <folder> at c12 | node 9:a-e | free --near e10
kit suggest <folder> --part '<json>' --between <group>,<group>
kit simulate <folder> [--transient stop,step] [--env light=50] [--set RV1=0.8]
kit simulate <folder> --run <seconds> [--env …] [--set …] [--press S1@0.5+0.2] [--at 1:light=50]
kit render <folder> -o out.svg [--view back] [--fit parts]
kit page <folder> · kit catalog [name]
```

A target is a circuit folder (`circuit.json`, `history.jsonl`, `out/`, and a board's `.ino` beside
`circuit.json`) or a circuit file. `layout`, `apply` and `undo` print where the page is (an absolute
path) as the line before `STATUS` (`layout`) or the last line. `--json` gives any answer as JSON.

Exit codes: **0** done (`layout`: `DONE`, `WARNINGS` or `SPEC_OK`; review APPROVED or APPROVED WITH
WARNINGS); **1** an input mistake, nothing saved (`layout`: `FIX_SPEC`; a file that is missing or
not JSON; `apply` with something the kit cannot read); **2** review `CHANGES` (`layout`: `CHANGES`)
or an option the kit does not take (its name is on the last line); **3** a fault in the kit
(`internal error: …`): report it, do not work around it.

`layout` calculates before it places: "Too large for one board" (`FIX_SPEC`, nothing created) gives
the columns needed and how many parts fit one board, so split the circuit; a large circuit says
before it starts that one try takes longer than the budget. The search stops at `--budget` seconds
(60 by default, at most 300; connector: `budget_s`) with its best try, `STATUS: CHANGES` and a line
saying so. The same spec always gives the same circuit: running it again unchanged gives the same
answer. Nets that share a pin are joined into one, with a note.

`apply` refuses input the kit cannot read (a value, part, pin, field or hole it does not know):
nothing is saved, exit 1. A readable change that breaks the circuit (a short, a collision) is saved
with a line saying how many new errors it brings; `kit undo` takes it back. A circuit keeps the
language it was made in.
