# Recipes: lesson circuits by name

*[Español](../es/recetas.md)*

A recipe is a `layout` spec the kit keeps for a usual lesson circuit: its parts with default values,
in signal order, its nets and its supply. It is called by name with only the values that change, and
it comes out ready (`STATUS: DONE`) in one call: every recipe is a case of `npm run layout-bench` and
of `test/recipes.test.js`. Nothing is worked out by whoever calls it, so a small model, or an
assistant that has never seen the kit, gets a reviewed circuit at the first try.

```json
{ "target": "switch", "recipe": "npn-switch", "values": { "R1": "470", "D1": "green", "V1": 9 } }
```

```bash
node bin/protoboard-iso.js layout switch --recipe npn-switch --values '{"R1":"470","V1":9}'
```

## The recipes

| Recipe | Circuit | Values (default, choices or range) |
|---|---|---|
| `led-resistor` | LED with a series resistor | R1 = 330, D1 = red, V1 = 5 V (1.5–15) |
| `divider` | Voltage divider (output where R1 and R2 meet) | R1 = 10k, R2 = 10k, V1 = 9 V (1–30) |
| `npn-switch` | Button → base resistor → NPN transistor switching an LED | R1 = 1k (base), R2 = 330, D1 = red, Q1 = 2N2222A (2N2222A, 2N3904, BC547, BC337, S8050), V1 = 5 V (3–12) |
| `potentiometer-led` | Potentiometer's wiper dimming an LED | RV1 = 10k, R1 = 330, D1 = red, V1 = 5 V (3–12) |
| `mosfet-switch` | Button → logic-level MOSFET switching an LED, gate pull-down | R1 = 220 (gate), R2 = 10k (pull-down), R3 = 330, D1 = red, Q1 = IRLZ44N (IRLZ44N, 2N7000), V1 = 5 V (3–12) |
| `button-pullup` | Button to ground with a pull-up; an LED shows the output | R1 = 1k (pull-up), R2 = 330, D1 = green, V1 = 5 V (3–12) |
| `button-pulldown` | Button to the supply with a pull-down; an LED shows the output | R1 = 10k (pull-down), R2 = 330, D1 = green, V1 = 5 V (3–12) |
| `rc-square` | RC charged by a square wave from a signal generator | R1 = 1k, C1 = 1u, G1 = 100 Hz (0.1–100000) |
| `555-astable` | NE555 astable blinking an LED | R1 = 1k, R2 = 10k, C1 = 10u, R3 = 330, D1 = red, V1 = 9 V (4.5–15) |
| `regulator-7805` | 78xx regulator, its capacitors and a pilot LED | U1 = 7805 (7805, 7806, 7808, 7809), R1 = 1k, D1 = red, V1 = 9 V (7–35) |
| `regulator-ams1117` | AMS1117 module feeding an LED | U1 = AMS1117-3.3 (AMS1117-3.3, AMS1117-5.0), R1 = 220, D1 = red, V1 = 5 V (4.5–15) |
| `bridge-rectifier` | Bridge, filter capacitor and an LED, from a sine on the top rails | C1 = 470u, R1 = 1k, D1 = red, G1 = 12 V peak (3–30) |
| `zener-regulator` | Zener and its series resistor holding a load | R1 = 470, D1 = 1N4733A (any 1N47xx), R2 = 1k (load), V1 = 9 V (3–30) |
| `esp32-led` | ESP32 DevKit lighting an LED from D13 | R1 = 220, D1 = red |
| `esp32-button` | ESP32 DevKit reading a button on D27 (internal pull-up) | — |

`catalog` (MCP) or `parts` (CLI) lists them with their values; `catalog` with a recipe's name (`parts
<name>` in the CLI) shows what it teaches, its parts, nets, supply, and each value's role and limits.

## Values

- **Short form**: the item's main field. `"R1": "470"` (a resistor's value), `"D1": "green"` (an
  LED's colour), `"Q1": "BC547"` (a part number), `"V1": 9` (a supply's voltage), `"G1": 1000` (a
  generator's frequency or amplitude, as the recipe says).
- **Long form**: some fields of the item, `"R1": { "value": "470", "tolerance": "1%" }`. Allowed
  besides the main field: `tolerance` and `power` on resistors, `kind` and `voltage` on capacitors,
  `color` on LEDs and buttons, `style` and `position` on potentiometers, and a supply's fields.
- **Only what the recipe lists can change.** Anything else, a value outside the choices or the
  range, or a field not allowed, is a `FIX_SPEC` that says what is allowed (`RECIPE_VALUE_UNKNOWN`,
  `RECIPE_VALUE_CHOICE`, `RECIPE_VALUE_RANGE`, `RECIPE_VALUE_FIELD`; an unknown recipe,
  `RECIPE_UNKNOWN`, comes with the closest names). Ids and nets never change: they are what makes a
  recipe come out ready.
- Beside a recipe, `title`, `board`, `clearance`, `netLabels`, `page` and `lang` may be given and
  replace the recipe's. `parts` and `nets` never (`RECIPE_AND_PARTS`).

## After it is laid out

The circuit keeps `spec.recipe` (`{ name, values }`) beside its nets. Another value later is the same
call on the same target with the new values (and `expect_revision`): every part keeps its holes,
and `undo` brings the old values back. To add parts or connections, call `layout` on it with the
full `parts` and `nets` (`get_circuit` shows them): it is then a circuit of its own and loses
`spec.recipe`. A value or a description alone can also be changed with `apply_ops`.

What a recipe does not do yet: the ESP32 DevKit is drawn and checked but not simulated (its recipes
have no source), and its pins are fixed (D13, D27). The 555 is simulated since 2026-10-26: its page
blinks, in slow motion (the page's time follows the slowest time constant).

## Adding a recipe

1. Try the spec first as a plain `layout` call (or a JSON file with `npm run layout-bench --
   file.json`) until it comes out `DONE`, with parts in signal order. When it does not, decide
   whether the recipe or the algorithm is at fault ([layout.md](layout.md#changing-the-algorithm)):
   a recipe works around a limit only when the circuit is still the usual one.
2. `src/recipes/<name>.js`: one module of data, with a header comment saying what the circuit is.
   `name`, `title` and `teaches` (`{ en, es }`), `parts`, `nets`, `supplies`, optionally
   `netLabels`, `page`, `clearance`, and `values`: for each id that may change, `field` (what the
   short form sets), and optionally `role` (`{ en, es }`), `choices`, `min`/`max`, `extra` (the
   allowed fields, when the defaults by kind do not fit).
3. Register it in `src/recipes/index.js` and `npm run schemas` (the schema lists the names).
4. Add it to the tables in this page, [recetas.md](../es/recetas.md) and `SKILL.md`, and to the list
   in the `circuit-layout` agent. `npm test` checks that it comes out `DONE` with its defaults and
   with every choice, that it simulates without stressing a part, that its name is no part's name,
   and that both pages name it; `npm run layout-bench` shows its tries and time.

## See also

- [layout.md](layout.md): the algorithm behind every recipe.
- [agents.md](agents.md): a recipe circuit needs no agent; the main conversation calls `layout`.
