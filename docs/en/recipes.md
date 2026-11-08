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
| `esp32-led` | ESP32 DevKit blinking an LED on D13, with its program | R1 = 220, D1 = red, U1 = its sketch (`program`) |
| `esp32-button` | ESP32 DevKit reading a button on D27 (internal pull-up), printing what it reads | U1 = its sketch (`program`) |
| `uno-blink` | Arduino UNO blinking an LED on D13 | R1 = 220, D1 = red, U1 = its sketch (`program`) |
| `uno-button` | Arduino UNO: a button on D2 (internal pull-up) lights an LED on D13 | R1 = 220, D1 = green, U1 = its sketch |
| `uno-pot-pwm` | Arduino UNO: a potentiometer on A0 dims an LED on D9 (ADC and PWM at 490 Hz) | RV1 = 10k, R1 = 220, D1 = red, U1 = its sketch |
| `uno-rgb-led` | Arduino UNO mixing the colours of an RGB LED (common cathode) with PWM on D9, D10 and D11, a resistor per chip | R1, R2, R3 = 220 (red, green, blue), U1 = its sketch |
| `uno-seven-segment` | Arduino UNO counting 0 to 9 on a 7-segment display (5161AS, common cathode), segments a–g on D2–D8 through a resistor each | R1 … R7 = 220 (segments a … g), U1 = its sketch |
| `slide-switch-leds` | A slide switch (SPDT) choosing which of two LEDs lights: the supply on its common, a red LED on pin 1, a green one on pin 2 | R1, R2 = 330 (red, green LED) |
| `tilt-alarm` | A tilt switch (SW-520D) that shorts an LED while upright; tipped over it opens and the LED lights | R1 = 330 |
| `relay-npn` | A push button drives an NPN that drives a relay's coil, a 1N4007 across the coil; the relay's contact lights an LED | R1 = 1k (base), R2 = 330 (LED, on the contact), Q1 = 2N2222A (2N2222A, BC337, S8050) |
| `motor-npn` | A potentiometer sets a DC motor's speed through a TIP120 emitter follower, a 1N4007 across the motor | RV1 = 0.8 (the wiper's position, 0–1), M1 = 0 (load, mN·m, 0–3) |
| `lm35-uno` | Arduino UNO reading an LM35 on A0 and printing the temperature on the serial monitor (10 mV per °C) | U2 = 25 (°C), U1 = its sketch |
| `c3-blink` | ESP32-C3 SuperMini blinking an LED on GPIO3 | R1 = 220, D1 = red, U1 = its sketch |
| `c3-pot-pwm` | ESP32-C3: a potentiometer on GPIO4 dims an LED on GPIO3 (ADC and PWM at 1 kHz) | RV1 = 10k, R1 = 220, D1 = red, U1 = its sketch |
| `opamp-comparator` | LM358 comparing a potentiometer with half the supply; an LED on its output | RV1 = 10k (wiper at 30 %), R1 = 10k, R2 = 10k, R3 = 330, D1 = red, U1 = LM358 (LM358, LM324), V1 = 5 V (5–30) |
| `lm393-comparator` | LM393 comparator: its open collector sinks an LED fed from the supply | RV1 = 10k (wiper at 30 %), R1 = 10k, R2 = 10k, R3 = 330, D1 = red, V1 = 5 V (3–30) |
| `opamp-follower` | LM358 voltage follower: the output copies a potentiometer and drives an LED | RV1 = 100k, R1 = 330, D1 = red, U1 = LM358 (LM358, LM324), V1 = 9 V (5–30) |
| `opamp-noninverting` | LM358 non-inverting amplifier, gain 1 + R2/R1, a sine from the generator on V+ | R1 = 10k, R2 = 20k, U1 = LM358 (LM358, LM324), V1 = 9 V (5–30), G1 = 0.5 V peak (0.01–5) |
| `opamp-inverting` | LM358 inverting amplifier, gain −R2/R1 around half the supply (a divider on V+) | R1 = 10k, R2 = 20k, U1 = LM358 (LM358, LM324), V1 = 9 V (5–30), G1 = 0.5 V peak (0.01–3) |
| `ldr-night-light` | A photoresistor and a resistor in a divider drive an NPN's base; the LED lights in the dark (senses `light`) | R1 = 10k (divider), R2 = 10k (base), R3 = 330, D1 = red, V1 = 5 V (3–12) |
| `ldr-comparator` | LM393 comparing a photoresistor divider with a potentiometer's reference; the LED lights in the dark (senses `light`) | RV1 = 0.5 (the reference's position, 0–1), R1 = 10k, R2 = 10k (pull-up), R3 = 330, D1 = red, V1 = 5 V (3–30) |
| `lm35-comparator` | LM393 comparing an LM35 with a reference of about 0.42 V from a divider; the LED lights above about 42 °C (senses `temperature`) | R1 = 10k, R2 = 910, R3 = 330, D1 = red |
| `ntc-follower` | NTC thermistor divider copied by an LM358 follower into a 10k load (senses `temperature`) | TH1 = 10k, R1 = 10k, R2 = 10k (load), V1 = 9 V (5–30) |
| `thermistor-uno` | Arduino UNO reading an NTC divider on A0 and printing `T=<°C>` every second with the B equation (senses `temperature`) | TH1 = 10k, R1 = 10k, U1 = its sketch (`program`) |

`catalog` (MCP) or `parts` (CLI) lists them with their titles (the compact list `catalog` leaves the values out); `catalog` with a recipe's name (`parts
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
- Beside a recipe, `title`, `board`, `clearance`, `netLabels`, `environment`, `page` and `lang` may be
  given and replace the recipe's. `parts` and `nets` never (`RECIPE_AND_PARTS`).

## Recipes with a real sensor

A recipe may carry an `environment` and a `page` ([environment.md](environment.md)), copied into the
circuit it produces like its title and its supplies. The five sensor recipes (`ldr-night-light`,
`ldr-comparator`, `lm35-comparator`, `ntc-follower`, `thermistor-uno`) each declare the field they
sense at its default (`light` 300 lx or `temperature` 25 °C) and a `page.controls` entry
`{ "environment": "light" }` (or `temperature`): the page offers that slider with its indicator, a
timeline can `set` it, and no part carries a value of its own, so the circuit follows the
environment. Nothing in them stands for a sensor: the photoresistor is a GL5528, the thermometer an
LM35 or a 10k NTC (B 3950).

| Recipe | What it does at the defaults |
|---|---|
| `ldr-night-light` | The photoresistor is on the ground side of the divider, so the base voltage rises as the light falls. The LED has about 9 mA up to 100 lx, dims between 100 and 300 lx (about 2 mA at 200 lx, where the photoresistor falls to about 2 kΩ) and is out (about 0.1 mA) at 300 lx |
| `ldr-comparator` | The photoresistor is over the 10k, so the divider falls with the light; with the reference at half the supply the output sinks below about 18 lx (the photoresistor equal to 10k) and the LED lights (about 8 mA at 10 lx, none at 300 lx) |
| `lm35-comparator` | The LM35 gives 10 mV per °C into IN+; the reference is 0.417 V (about 42 °C). Above it the output is released and R3, the output's pull-up, feeds the LED to ground (about 10 mA); below it the output sinks and the LED sees under 1 V (off). The LED is not "as in the potentiometer recipes" (fed from the supply, on when the output is low) because here the alarm must light when the input is *higher* |
| `ntc-follower` | The NTC is on the supply side, so the voltage rises as it warms; the follower copies it into 10k. The supply is 9 V: an LM358's output stops about 1.5 V under it, and from 5 V it would cut the voltage the divider gives at 60 °C |
| `thermistor-uno` | The same NTC over 10k on the UNO's 5 V, read on A0; the sketch gets the resistance from the ADC count and the temperature from `1/T = 1/T0 + ln(R/R0)/B`, and prints `T=<value>` every second (within 1.5 °C of the environment at 25 and at 60 °C) |

## After it is laid out

The circuit keeps `spec.recipe` (`{ name, values }`) beside its nets. Another value later is the same
call on the same target with the new values (and `expect_revision`): every part keeps its holes,
and `undo` brings the old values back. To add parts or connections, call `layout` on it with the
full `parts` and `nets` (`get_circuit` shows them): it is then a circuit of its own and loses
`spec.recipe`. A value or a description alone can also be changed with `apply_ops`.

The microcontroller recipes (ESP32, UNO, C3) run a program ([microcontrollers.md](microcontrollers.md));
`values: { "U1": "blink.ino" }` puts one's own sketch in its place (a file beside the circuit, or its
text). Their pins are fixed; the C3 ones keep everything on its left header (5V, GND, 3V3, GPIO0–4). The 555 is simulated since 2026-10-26: its page
blinks, in slow motion (the page's time follows the slowest time constant).

## Adding a recipe

1. Try the spec first as a plain `layout` call (or a JSON file with `npm run layout-bench --
   file.json`) until it comes out `DONE`, with parts in signal order. When it does not, decide
   whether the recipe or the algorithm is at fault ([layout.md](layout.md#changing-the-algorithm)):
   a recipe works around a limit only when the circuit is still the usual one.
2. `src/recipes/<name>.js`: one module of data, with a header comment saying what the circuit is.
   `name`, `title` and `teaches` (`{ en, es }`), `parts`, `nets`, `supplies`, optionally
   `netLabels`, `environment`, `page`, `clearance`, and `values`: for each id that may change, `field` (what the
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
