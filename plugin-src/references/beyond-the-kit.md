# Where the kit has no answer

The kit answers first. Where it says it has none, use your own knowledge or a search; and nothing
reaches the person's circuit before the kit has tried it.

## The kit's fixed sentences

Each situation where the kit has no answer prints one sentence that does not change (English, then
Spanish). Only these, a `STATUS` you cannot get past and what the `Checked` line lists under
`Not checked` open the door to your own knowledge:

| The kit prints | Means | You |
|---|---|---|
| "The kit has no computed fix for this." · "El kit no tiene un arreglo calculado para esto." | a hazard (⚠) that no single resistor clears (`--fix` refuses too) | think of the smallest change, try it (below) |
| "… the kit does not know “<name>”. Closest: …" · "… el kit no conoce «<name>». Lo más parecido: …" (also "the kit does not know the part type", `… in its <type> table`) | a part the kit does not have | say so; use the closest part only if the person agrees |
| "… the kit does not simulate this part yet: it is drawn, …" · "… el kit todavía no simula este componente: se dibuja, …" | drawn, not simulated: no reading or warning covers it | say what is then not checked |
| "… the kit does not offer “<field>” in recipe <name> …" · "… el kit no ofrece «<field>» en la receta <name> …" | a value or goal the recipe does not have | use a listed one, or a spec of your own |
| "… the kit does not understand the value “<value>” …" · "… el kit no entiende el valor «<value>» …" | a value it cannot read | write it as the line says |

The `Checked` line (`Revisado`) says what the hazard check covered for this circuit: at rest, each
control alone, each output of a board's program high alone. What it does not cover (`Not
checked`): peaks while something switches, combinations, what sensors read from the environment,
states past the limit, parts not simulated. Tell the person the part that matters to their request
or to a warning (a coil switched by a program: its switching peaks are not checked).

## A trial: `layout --dry-run`

`kit layout <folder> <spec.json> --dry-run` (connector: `layout` with `dry_run: true`) does all of
`layout` (placement, nets, review, hazards in every state, readings, the fix and the `Checked`
line) and saves nothing: no file, no history, no page. On an existing folder it tries the circuit
as it would be after the call; the circuit stays as it was. The answer ends
`Trial: nothing was saved.` (`Ensayo: no se guardó nada.`) and the same `STATUS:`. Trials are not
changes to the person's circuit: do not count them as corrections, and do not show them one by
one. At most three for one request.

## Worked example: a buzzer on a pin

An UNO blinks two LEDs (220 Ω each, on D8 and D9) and beeps a passive buzzer wired straight from
D10 to ground. `layout` ends:

```text
As wired, this would damage:
  ⚠ warning: U1.D10 carries 88.3 mA, more than its maximum 40 mA, with D10 high.
To fix it: a 200 Ω resistor in series with BZ1 brings U1's D10 to 19.4 mA (maximum 40 mA).
…
STATUS: WARNINGS · …
```

Tell the person which part burns and why, and the kit's fix. If they want it fixed, the kit applies
its own fix in one call, as one change (`kit undo` restores it):

```bash
kit layout circuits/two-leds --fix
```

(connector: `layout` with `fix: true`; add `--dry-run` to try it first). The kit adds `R3` (200 Ω)
between `U1.D10` and `BZ1.1`, lays the circuit out again and ends
`Applied the fix: R3 = 200 Ω in series with BZ1.` (`Arreglo aplicado: …`) and `STATUS: DONE`, with
no ⚠. Say what the kit confirmed: "with the 200 Ω resistor the kit finds no part past its limit, in
any state it checks (D10 at 19.4 mA)". `--fix` takes nothing else (no spec, no values); with no
hazard it says there is nothing to fix and changes nothing.

Write the change yourself only when the kit has no computed fix: the same spec with your change
(the parts in any order), tried first with `kit layout <folder> spec.json --dry-run`, then the same
call without `--dry-run` if it ends `DONE`. A redesign, a transistor driving the buzzer from 5 V,
was not asked for; tried, it ends `WARNINGS`: the buzzer straight across 5 V dissipates 1.4 W, more
than its 500 mW, with D10 high. One trial shows it; three changes to the person's circuit would not
have been needed.

## A part the kit does not have

Say so, with the kit's sentence. Offer the closest part the kit has, and use it only if the person
agrees; say what is then not the same (its values, its pins) and what is not simulated. A part
drawn but not simulated gives no readings and no warnings: say that nothing about it is checked.
Never draw it yourself.
