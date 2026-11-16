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

## Every command

```bash
kit layout <folder> --recipe npn-switch [--values '{"R1":"470"}']
kit layout <folder> [spec.json] [--check] [--dry-run] [--expect-revision n]
kit apply <folder> --ops '<json>' --dry-run      # then --expect-revision n
kit review | check | netlist | nets | inspect | history | undo <folder>
kit query <folder> at c12 | node 9:a-e | free --near e10
kit suggest <folder> --part '<json>' --between <group>,<group>
kit simulate <folder> [--transient stop,step]
kit render <folder> -o out.svg [--view back] [--fit parts]
kit page <folder> · kit catalog [name]
```

A target is a circuit folder (`circuit.json`, `history.jsonl`, `out/`) or a circuit file. Exit
codes: 0 fine (`layout`: `DONE`, `WARNINGS` or `SPEC_OK`), 1 errors or refused (`layout`:
`FIX_SPEC`), 2 review `CHANGES` (`layout`: `CHANGES`). `layout`, `apply` and `undo` print where the page is (an
absolute path) as the line before `STATUS` (`layout`) or the last line. `--json` gives any answer
as JSON.
