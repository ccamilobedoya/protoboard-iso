# Changelog

What changed in each version, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/) (before 1.0, a minor version may change the circuit
format or the tools). Each released version has a git tag `v<version>`; `test/changelog.test.js`
checks that the newest one is the version in `package.json`. The roadmap (`ROADMAP.md`) has the
detail.

## [Unreleased]

### Changed

- The sketch runner's warnings are doubts of the review wherever they are raised, also when the DC point does not solve: a pointer, a `struct` or `class`, a member, a `String` method or a macro the subset lacks, a bit macro on something that is not a variable and a reference parameter (`SIM_PROGRAM_POINTER`, `_TYPE_DECL`, `_MEMBER`, `_STRING_METHOD`, `_MACRO`, `_NOT_LVALUE`, `_REFERENCE`); a serial line that carries no data is one too (`SIM_SERIAL_LEVELS`, `SIM_SERIAL_NO_TX`). A program that still runs as written (a bit macro noted, a reference passed as a copy) keeps the review's visit of its run.
- The MCP `simulate` tool takes `serial` (a list, as `simulate --run … --serial`), only with `run_s`. `layout`'s `Behaviour` line of a sketch that waits for serial input says `U1 waits for serial input (simulate --run … --serial "text@seconds" types to it)` instead of its outputs `off throughout`; `references/run-it.md` shows a menu sketch typed to with `--serial`. A print at a run's last instant is in the run (a sketch printing every 500 ms prints at 0, 0.5 and 1 s in a run of 1 s; the last was lost).
- `simulate` and `review` on a circuit saved with parts left out say first `Not on the board: R2, R3…` (`unplaced` in `--json`; the circuit schema takes `spec.unplaced`). `layout --fix` with the `resupply` fix says `Applied the fix: U2 fed from U1.5V (its VCC moved there).` (it said `U2 = ? in series with {with}`).
- The skill's `references/run-it.md` says what three testers with only the packed skill had to guess: the environment a run starts from (every field's default; a distance sketch prints 9 for 10 cm at 25 °C), how to cut a laser's beam in a run, which pins of a button make the switch, that parts are named by their id and how to say which is which, that a recipe's supply is a bench supply and how to lay it out on a battery, and that `--dry-run` trials are free while two corrections end the stop rule; each command and quoted line is run by `test/skill-run-it.test.js`. A button's pin roles say which side of the switch each pin is, in `parts.md` and the page.
- The kit has no loudspeaker, said the same in `catalog speaker`, the LM386's catalog line and `references/chips.md`: an 8 Ω resistor stands in for it in the simulation; tell the user. An LM386 whose output is clipped against its rails for a fifth of a transient or a run or more gets one note with its swing (`SIM_AMP_CLIPPING`; gain 200 and 20 mV on 9 V said nothing).
- `catalog CD4017` and `references/chips.md` say what the kit computes for an LED straight on an output, about 3.3 mA at 5 V, 15 mA at 9 V (over the chip's power, a ⚠) and 28 mA at 12 V, and that above 10 V it likely overestimates a real chip's (chips.md said an output gives `only a few mA`).
- Small truths: `A change at 0.8 s comes after the run ends` (it printed `0.7999999999999999 s`), and a press that ends after the run is not a warning; a finding names the state it was seen in only when it is stronger there by more than 5 % (an ESP32's RX pin at 4.04 V ended `with the environment's temperature at its minimum`); `--transient`'s first line says the table shows 11 of its samples and `--json` has them all, and a line after the table gives each series' peak and, where it repeats, its frequency; a run's Serial cut in the text says so on its heading (`the first and last 5 here, --json has 30 of them`).
- `layout`'s `Readings` line for a circuit with nothing that lights or moves (a divider, a Zener regulator) gives the voltage of each net that is not a rail, named by its pins, at most four (`supply 5 V · R1.2 = R2.1 3.33 V`; `readings.nets` in `--json`): a divider's answer said only `supply 5 V`.
- A run says a tune note by note: each note's frequency, start and length in order (`· 6 notes: 262 Hz at 103 ms for 298 ms, …`, the first eight; `notes` and `notesTotal` in `--json`), one tone figure only when every note has it (six notes gave `beeps: 5 · tone 385 Hz`). A board's pin playing a PWM or a tone is followed by the level the program writes (a buzzer that loaded it under the half-rail line made it read `on < 1 %`), and a pin playing several notes says how many and their range.
- `COIL_NO_FLYBACK` on a load driven from both ends (an H-bridge) asks for four diodes, from each end to each rail, and says a diode across the motor would conduct when the bridge reverses (variants `motorBridge`, `relayBridge`); it told an H-bridge to put one across the motor.
- A board on USB past the 500 mA a USB 2.0 port gives (and the UNO's resettable fuse) is a hazard on its USB pin saying what happens (`U1.5V gives 721 mA from USB, more than the 500 mA a USB port gives: the board's 500 mA resettable fuse opens…`); an H-bridge with both transistors of a leg on drew it with no ⚠. An UNO's 3V3 pin past its LP2985's 150 mA is a hazard (`SIM_OVER_CURRENT` variants `usb` and `regulator`). The computed fix does not propose a resistor in the supply for these.
- A logic input over its chip's supply: every input a board drives is judged high too (a 74HC595's SRCLK, pulsed inside `shiftOut`, was missed); the warning says the chip is fed less than the signals that drive it and to feed it from theirs or drive it with signals of its supply (`SIM_IC_PIN_VOLTAGE` variant `fed`); a circuit with a rail at the signals' voltage gets the computed fix `resupply` (`To fix it: feed U2 from U1.5V …: move its VCC there`), which `specWithFix` applies.
- A run keeps a warning about a level that must last (`SIM_RELAY_UNDERDRIVEN`, `SIM_IC_INPUT_LEVEL`, a supply out of a part's range, `SIM_REG_DROPOUT`, `SIM_MOTOR_STALL` and the like, `LEVELS` in `src/sim/run.js`) only once the level has settled, or at the run's end; a coil whose current rises through the band on its way to pulling in is no longer under-driven, so runs of different lengths over the same events give the same warnings. Peaks that damage at once are kept at their strongest, as before.
- A run's step lets it finish: `simulate --run` (and MCP `run_s`) takes the page's step but never one shorter than the run's length over 20 000, the same as layout's Behaviour line, so the two give the same figures. `regulator-7805 --run 1` was 1.7 million steps of 100 ps and stopped at 173 µs after 15 s of the machine; `relay-npn` with a press stalled near 0.5 s; now every recipe runs 3 s in 20 000 steps or the page's own (the slowest, `c3-pot-pwm`, 3.9 s of the machine under load). Steps still end on every event, and on a 555's thresholds (`createEngine(…, { crossings: true })`). A time constant shorter than the step gets one note (`RUN_STEP_OVER`); an output faster than 100 steps a period is measured again in a shorter run from the same start and says so (`measured in the first 200 ms in steps of 10 µs`), or has no figure and a note (`RUN_TOO_FAST`). A run cut by the machine's time in steps of that floor says only `--budget` helps.
- A board's sketch computes what the board computes. Integers keep their type's size on the board in use (`byte` 8 bits, `int` and `unsigned int` 16 on an UNO and 32 on an ESP32, `long` 32): `byte b = 255; b++` was 256, `now - start` of two `unsigned long`s across the wrap was −4294967280 (now 16, as the idiom of every `millis()` timer needs), and `millis()`/`micros()` wrap at 2^32. `bitSet`, `bitClear`, `bitToggle` and `bitWrite` change their variable (they did nothing); on something that is not a variable they warn (`SIM_PROGRAM_NOT_LVALUE`). A reference parameter (`int &x`) warns that the kit passes a copy (`SIM_PROGRAM_REFERENCE`).
- `String`'s usual methods (`length`, `charAt`, `indexOf`, `substring`, `toInt`, `toFloat`, `equals`, `startsWith`, `trim`, `toUpperCase`, `toLowerCase`, `concat`…), a `char` or `float` joined to a String, `char *text`, `sprintf`/`snprintf` into a `char` buffer (an UNO has no `%f`) and simple function-like macros are read. Pointers, `struct`/`class`/`enum`, a `String` method the kit lacks, a member read with `.` and a macro it cannot expand each name the construct and what to write instead (`SIM_PROGRAM_POINTER`, `_TYPE_DECL`, `_STRING_METHOD`, `_MEMBER`, `_MACRO`); they said `does not read at line 5 (near ".")`. An untouched `char` buffer prints empty (it printed 33 zeros).
- A serial line between boards follows the wire, not the net's name: through a 1 kΩ/2 kΩ divider or a series resistor the bytes arrive (they never did, with `DONE`); a path that never gives the RX pin both levels, or an RX wired to no TX, is a doubt saying why (`SIM_SERIAL_LEVELS`, `SIM_SERIAL_NO_TX`). A received `\r` prints as nothing (it was U+FFFD).
- `simulate --run … --serial "U1:1\n@0.5"` types text to a board's serial port at a time (repeatable; `Serial2:` names the port). A sketch that reads its serial port with nothing typed and nothing wired to RX gets one note naming the option (`SIM_SERIAL_WAITS`); a DHT11 read in its first second gets a note saying it was still powering up (`SIM_LIBRARY_EARLY`). `references/sketch.md` says all of it, from probes.
- An unknown part that is a common ask says what the kit has near it: a stepper motor (`28BYJ-48`: a DC motor turns but does not step; a ULN2003 to four inductors only as a wiring exercise), an OLED, a keypad, a joystick, a Bluetooth or Wi-Fi module; an SD card, a real-time clock and a load cell say nothing is near. Matched by the words in the name, in English and Spanish.
- `layout` at its budget answers with its best try: a try cut short (parts left off the board) no longer ranks above a whole one; the line "Before this answer the kit also tried" is printed again (the list of changes tried, now `changesTried`, was overwritten by the budget's count `tried`).
- `layout` finds the order that works sooner: when the order given leaves something after its first search, each order of the nets gets one try (and a new one, from the part with most signal pins, such as a display or a shift register) and they are searched whole best start first; the order given goes on from its first search. An UNO with a 7-segment display and a button ends `DONE` in about 11 600 placements (was 67 146, 31 s); two 74HC595 with sixteen LEDs on the double board end `DONE` (they ended `CHANGES` at the budget). Recipes and layout examples keep their placements; the bench's placements tried fall from 128 410 to 47 507.
- `layout` places four relays on a driver chip (an ESP32, a ULN2003 and four SRD-05VDC relays ended `CHANGES` with two relays "found no place" in every order): a relay or a switch whose body lands on another slides along the edge by its own width; the elastic board grows when a part finds no place (a board placed by pin 1 did not grow it); a lead beside the board never picks a hole under a body; the trials before `CHANGES` start on the double board when layout moved there, try the parts that found no place first, and then the change the answer would offer, so it never offers one it tried. A circuit saved with parts left out keeps them in `spec.unplaced`, and `layout` again on it asks for them.
- `simulate --run` takes `--budget <s>`, the machine's time the run may take (15 s by default, at most 300 s, `LIMITS.runMsMax`; more is capped and said, `RUN_BUDGET_CAPPED`), and a run cut by its budget names it. The tests that are not about that limit run with the largest (`test/run-generous.js`, as `test/layout-generous.js` does for layouts): a 555 clocking a CD4017 for 2.5 s takes about 12 s of a free machine and more than 15 s under coverage, and was cut there.
- The skill says what the chips' physics review changed: logic inputs switch at half the supply and a level not guaranteed, or over the supply, is a ⚠; the review follows what chips latch; a run judges power on its average (`SKILL.md`, in its 8 KB). `references/chips.md` quotes what the LM386's transient from zero prints now (no power warning: the 220 µF's charging is the switch-on), a clipped LM386 run (`R1 dissipates 1.12 W … on average over the run`, the chip not flagged), the CD4017's 3 V to 18 V and 20 V, the LM386N-1's 4 V to 12 V and 15 V, and 3.3 V pins into a chip fed 5 V (a ⚠) and 5 V pins into one fed 3.3 V (damage).
- `catalog <part>` shows an example of that part, or of one of its type with the same pins (a 2N3904 shows a 2N2222A), or none: `catalog ULN2803` showed a 555. On a development board `TX` and `RX` name its serial pins (UNO `D1`/`D0`, ESP32-C3 `GPIO21`/`GPIO20`, DevKit `TX0`/`RX0`) and a DevKit's `GPIO17`/`GPIO16` its `TX2`/`RX2`. `undo` and `history` on a damaged history say to make the next change with `apply … --new-history` (they named `--new-history`, which they do not take).
- Wording after the chips' physics review: the LM386's supply lines name the variant their figures are for (`outside the 4 V to 12 V its datasheet gives for the LM386N-1 and N-3 (the N-4 goes from 5 V to 18 V)`, `more than the 15 V of the LM386N-1 and N-3 (the N-4 takes up to 22 V)`); a reading that rounds to its limit is shown with more figures (`carries 50.04 mA, more than its maximum 50 mA`, not `50 mA … 50 mA`); the PC817's catalog line says its 170 % is one value of the datasheet's 50 % to 600 % and that a real part's rank (A to D) fixes it within a factor of two.
- The skill says what is true after the trust work: `references/spec.md` no longer calls the 74HC595, the LM386 and the ULN2003 drawn only (the one part with no model is the DESPI-C02 adapter) and says how to see whether a part is simulated (`kit catalog <name>`, its `Simulated:` line); `references/run-it.md` fills its sketches section (what a run shows of a board's program, an interrupt counting presses made during a `delay` where `digitalRead` misses them, two boards over a serial line, deep sleep); `references/warnings.md` adds a sketch's mistakes, a chip with no supply, a logic input left open, a 3.3 V pin on a 5 V logic chip and a damaged history; new `references/chips.md`: for the 74HC595, CD4017, ULN2003, ULN2803, PC817 and LM386 the wiring a beginner gets wrong and a worked spec each, with their pins, model and limits written from the catalog (`npm run parts-reference -- --write`). Every command and quoted line in them is run by `test/skill-run-it.test.js`, `test/skill-warnings.test.js` and `test/skill-chips.test.js`.
- `test/skill-quotes.test.js` runs the one-call recipe commands of `SKILL.md` and `references/recipes.md` and the buzzer example of `references/beyond-the-kit.md`, and fails when a file of the skill quotes the kit's output with no test that runs it; the buzzer's quoted ⚠ said `with D10 high` where the kit prints `with D9 + D10 high`, now as printed. `references/operations.md`'s list of commands is a `bash` block (a `text` block is the kit's output).
- The skill after three requests made with only the packed skill: a `warning:` that `simulate --run` prints is a ⚠ to tell even after `DONE` (eight red LEDs on 330 Ω behind a 74HC595 end `DONE` and a run warns 71.3 mA through its 70 mA supply pin); `references/chips.md` says the 74HC595's total current, how the fill sketch counts for n LEDs, and how a board reads a PC817's output side.
- Docs: the agent interface's exit codes name a damaged history (1) and a value an option does not take (`--start foo`, 2) and show `undo --dry-run`; the simulation page says the kit has no loudspeaker and an LM386's transient runs `--start dc`; the layout page's buzzer quote says `with D9 + D10 high` as printed; the roadmap's trust section ticks this work and lists what is left; `PLANNING.md` logs the six chips' models, a sketch's mistakes as warnings, `apply` refusing on a damaged history and the budget counted in work (the wall-clock budget entry partly replaced), in both languages.
- `layout`'s budget is counted in placements tried, not time: the same spec stops at the same place on every run (a net of 250 resistors placed 203 and then 189 parts in 84 s; now all 251, the same twice, in about 45 s). A cut by the wall clock (a slow machine) says it is not repeatable. The answer has `tried`.
- Messages: `--run` echoes what was typed and takes 1 µs to 60 s (`1e-300` ran "0 s, 0 steps" while 0 was refused); `--transient 0` says above 0; a part id with a space says ids have no spaces; a resistance of 0, -100, 1e12, 1m, 1000G or 1T says which rule it breaks and the range, and `simulate --set R1=10M` reads values as the spec does; with `--json` every answer is one JSON value (`ok`, `code`, `message` on an error); `catalog parts | boards | modules | recipes` list one kind; `layout <folder>` with no circuit and no spec says so in one line.
- `layout --dry-run` says in its `STATUS` line that nothing was saved (it ended with the words of a real run, "the circuit is ready"); `undo --dry-run` changes nothing (it undid the last change for real).
- A development board alone in a spec (an UNO, no nets) is laid out, with its ground lead in a strip; it ended `✖ U1 found no place`.
- Two batteries in one spec are laid out: the second lies beside the first along the board's edge (it was given the same place and ended `CHANGES` with "BT2 found no place"); in series they simulate at 18 V.
- A chip whose supply pins are not both wired, or share a net, is a doubt (`SUPPLY_PINS_UNWIRED`, `src/circuit/checks.js` `checkSupplyPins`): an LM358 with VCC and GND left open and a 555 with every pin on one net ended `DONE`, `APPROVED`; now `WARNINGS` with `U1 has no supply: its supply pins VCC and GND are …`.
- `apply` and `undo` measure a change with the judgement `review` gives, less the run (`judge` in `src/diff.js`): the spec's connections (a part moved past its strips, `i100`/`i104`, was saved with only a note; now `✖ new: error: Net 1 of the spec …` and the saved-with-errors line) and the doubts found without solving (a `program` file missing or outside the folder, `⚠ new: warning`). The saved-with-errors line says `review says CHANGES` instead of "cannot be simulated".
- `apply` refuses to save on a damaged `history.jsonl` (it saved a revision that `undo` and `history` could then never read): `HISTORY_DAMAGED` names the file and the line and says the circuit is intact; `apply --new-history` (MCP `apply_ops` `new_history`) keeps the damaged file as `history.jsonl.damaged` and starts a new history from the current revision.
- A part with the id `__proto__`, `constructor`, `toString`, `hasOwnProperty` or `valueOf` opens its card in the page (`__proto__` was missing from the page's data and its tap threw `(stresses[…] ?? []).find is not a function`).
- `apply` with 850 or more `add` operations no longer ends `internal error: Maximum call stack size exceeded` (a list spread as arguments in `src/diff.js`); 3000 are refused by the parts cap.
- The skill: a `· note:` line is said to be about the drawing, the nets or a model detail (anything over a limit is a ⚠ now); with nobody to ask, the assistant says what the kit lacks and stops; swapping one kind of part for another (a MOSFET for an NPN) is laid out with `--dry-run` first and its ⚠ read before saving. `references/run-it.md` adds a run's 60 s cap and early stop, `--start zero`, a latch's two resting states, what to say when the kit checks only part of a request, and a marked place for what a board's program shows; `references/spec.md` no longer calls `shiftOut` unknown and says a chip only drawn names the outputs that hang from it.
- A circuit with two resting states (a transistor latch) no longer shows the balance point between them as its state at rest (both transistors half on, the LED off): after the DC point the kit pushes each transistor's base or gate with 1 nF on every node and sees whether it comes back (`restingStates` in `src/sim/run.js`). When it runs away, `layout` gives the readings of each state (`Two resting states (a model): … it powers up in one of them, and the kit cannot say which`), `simulate` adds the warning `SIM_TWO_STATES` and `states`, and `--run` starts from the first and says which. No recipe or example changes.
- Small truths: a transistor carrying current is no longer read `off` (a TIP120 at 0.9 V on its base carrying 1.7 mA said `off`; now `active`, and a MOSFET under its threshold carrying current `saturation`); `page .` and `layout .` name the files after the folder (they wrote `out/..html`); `catalog servo`, `catalog SG90` and `catalog speaker` (CLI and MCP) answer with the same "the kit does not know … Nearest it has: …" text `layout` gives, not the list of types; `review` (lesson) lists a part hidden in one view but seen in another as a note, so it no longer prints a warning on a circuit it and `layout` call APPROVED.
- A run that covers less than was asked (capped at 60 s, `RUN_CAPPED`; stopped by the machine's time, `RUN_BUDGET`, or its steps, `RUN_STEPS`) prints that warning as the first line under its header, then `Every figure below covers the first 12 ms of the 2 s asked, not the whole run.`, and its `Serial` and `Outputs` headings name the span; the warning is no longer at the bottom. In `--json`, `run.seconds` is the seconds asked and `run.ran` the seconds covered (`run.asked` is gone).
- A note that says a part is over a maximum is now a warning, so `layout` no longer ends `DONE` over it: a BME280 fed from 3.3 V on a 5 V UNO's I2C (`SIM_PIN_OVER_VDDIO`; with a program that runs, judged by its run, so `uno-bmp280-altitude`, whose sketch turns the pull-ups off, stays `DONE`), an active buzzer over 35 mA (`SIM_BUZZER_CURRENT`), a voltage sensor over its 25 V (`SIM_VOLTAGE_SENSOR_RANGE`), a 49E over its operating range or its output load (`SIM_HALL_HIGH_SUPPLY`, `SIM_HALL_LOAD`), a touch module's output past its spec (`SIM_TOUCH_OUTPUT_SPEC`). A bare BME280 over its supply names `BME280-5V`, the board with its own regulator; the VDDIO line names the sketch's fix (`digitalWrite(A4, LOW)` and `A5` after `Wire.begin()`).
- An output that hangs from a part the kit does not simulate (three LEDs behind a CD4017) is no longer called "never comes on … whatever should turn them on does not reach them": the part's `SIM_PART_NOT_SIMULATED` line names the outputs that depend on it (`params.drives`, variant `drives`); an output dark for a reason the kit simulated keeps `SIM_OUTPUT_NEVER_ON`.
- A run says where it starts, truly: `simulate --run` said "Run from switch-on" while it started at the DC point (a capacitor behind 22 kΩ already at 9 V) and ignored `--start zero`. It now takes `--start zero|dc` (MCP `start`), its first line says `Run from its resting point, as the page starts` or `Run from everything discharged`, the default stays the page's, `--json` has `start` (and `run.page`), and `layout`'s Behaviour line names its start (`Behaviour, first 2 s from its resting point, as the page starts …`). A `--start` other than `zero` or `dc` exits 2.
- `DONE` means checked. Beside the hazards (a part that would burn), `review` returns `doubts`: what the kit could not check (a part wired in with no simulation model, such as a 74HC595 or an LM386, `SIM_PART_NOT_SIMULATED`; any issue about a board's program, such as a file not found, a syntax error or `shiftOut()`; a program that never lets time pass, `SIM_PROGRAM_STUCK`, the runner's own flag, or that stopped with an error, `SIM_PROGRAM_STOPPED`; any other warning of the simulation that is not a hazard; a source whose DC point does not solve). One doubt makes the verdict APPROVED WITH WARNINGS and `layout` end `STATUS: WARNINGS`, with the doubts as ⚠ lines under their own heading and a `STATUS` line that asks to tell the user each point first. Hazards alone keep their words and the `To fix it` line. `summary.doubts` counts them.
- A push button whose joined pins carry two nets (`BUTTON_PINS_JOINED`) is a doubt, never a ✖: layout ends `WARNINGS`, `check` lists it as a warning, `apply` saves it and marks it ⚠ (`DOUBT_CODES` in `src/circuit/checks.js`).
- `layout` reads a board's `.ino` file from the circuit's folder when it judges the circuit it keeps (the tries had none), and a file not found says where the kit looked and that it goes beside `circuit.json`.
- `layout`'s answer says in one line each part under 50 % visible in every view (`review.hidden`), as information.
- The `Checked` line is truthful: a sensor set by its own value (an LDR's `light` without an environment) is `what the sensors read from the environment`; `what U2 does` for one part; `what the program of U1 does where the kit cannot run it` for a program with a doubt.
- `catalog` marks part numbers and modules the simulator only draws (`drawn, not simulated: 74HC595, …`; `74HC595 (not simulated: drawn only)` in the CLI list, `Not simulated: …` in an entry), and its field texts no longer name source or docs paths.

- `simulate <target> --run <seconds>` (MCP `simulate` with `run_s`): the circuit run as the page runs it, from switch-on, with stimuli (`--env light=0.5`, `--set RV1=0.8`, `--press S1@0.5+0.2`, `--at 1.0:light=0.1`), answering what the program printed with its times, each output's share of the time on, its changes, spans on, frequency and duty when it toggles, and the readings at the end; bounded (60 s simulated, 15 s of the machine), nothing saved. `--env` and `--set` also work with the DC point and `--transient`.
- `--transient` on a circuit whose board runs a program steps it as the page does (events landed, at most 1 ms a piece) and names `--run`; before, a 10 µs pulse was lost and the distance alarm's LED never lit.
- `layout`'s answer has a `Behaviour, first 2 s` line for a circuit that changes by itself: the frequency and duty of what toggles (`D1 1 Hz, on 50 % of the time`), from a run bounded at 25 000 steps of the simulation, so the same circuit gives the same line on any machine (it was 0.8 s of the machine's time, and a busy machine printed `not measured` for the 555 and the op-amp oscillator).
- The `Checked` line names the environment's fields visited at both ends (`Checked: at rest, light at both ends`).

- The skill says what the kit now does: `STATUS: WARNINGS` covers a part that would be damaged and what the kit cannot confirm works, both told to the user before saying the circuit works; a board's `.ino` goes in the circuit's folder, beside `circuit.json`; `catalog` first for a part not used before; a circuit with a program, a sensor or an oscillator is run with the user's conditions (`simulate --run`) before saying it works, with a worked example (`references/run-it.md`, the distance alarm at 10 cm and at 50 cm, checked by `test/skill-run-it.test.js`); the reply uses only the lines the answer printed; `FIX_SPEC` "Too large" means split, `CHANGES` at the budget means `--budget` or a smaller circuit, never the same call again; exit codes 0, 1, 2, 3.
- The skill, the agents and `docs/en/agents.md` say what the checks now find: an output that never comes on and a coil switched with no diode across it are ⚠ to tell; the fix of a part in backwards turns it round (`--fix` does it); a supply written negative prints a `Note:` to pass on; a figure said "about" is approximate; `shiftOut` runs and a two-dimensional array is refused. Each case, laid out: `references/warnings.md`, checked by `test/skill-warnings.test.js`. The refusal of a two-dimensional array names the array (`a[row * columns + column]`, it said `C[…]`).
- Before answering `CHANGES`, `layout` tries what a person would, from its best try and on the circuit already made: the orders the nets give, the double board when a development board covers a part or a strip (and the spec names no board), then the tallest and the widest parts first, a few tries each within the budget; it keeps the first that ends without `CHANGES`, with a note saying what changed from the spec, and when still `CHANGES` each ✖ names the next spec change (`→ next the kit would try: …`). What a place hides is measured once the first search ends blocked, not from a count of hidden parts.
- An unknown part is matched by the words in its name (`LED strip 12V`, `tira de LED`): what the kit has near is named as for the bare name.
- `references/sketch.md` in the skill: what a board's program may use (functions, `Serial`, constants, types and arrays, libraries), written from the simulator's own tables and a probe of each common Arduino name through the translator and the runner (`scripts/sketch-reference.js`, with `npm run parts-reference -- --write`); `test/sketch-reference.test.js` fails when it is stale or says what the simulator does not do.
- `references/sketch.md` also says, each from a probe through the translator and the runner, that a `char` prints as its letter, what `attachInterrupt`, `Serial1`/`Serial2` and ESP32 deep sleep do, and that the kit's buttons do not bounce, so a debounce is exercised only as a lockout.
- `references/parts.md` in the skill: for every part type and part number, its pins, the fields a spec and a `set` take, what a run changes on it and the environment's fields it reads, with units and ranges. Written from the kit's data by `npm run parts-reference -- --write` (`partReference` in `src/node/catalog.js`, `partControls` in `src/sim/ratings.js`); `test/parts-reference.test.js` fails when it is stale.

- The test suite lays the sixty recipes out once (`test/recipe-sweep.test.js`): the checks that each laid them all out again (ready in one call, no hazard and every output on, the visibility figures, simulating without stress, layout again with one net changed, the acceptance checks A4, B10 and E8) read that one sweep, with their assertions unchanged; A4 reads the answer in process instead of sixty CLI runs, and `kit-first` copies one CLI layout of its buzzer circuit instead of making it five times. `npm test` on a four-core machine at a load of about 4: 775 s → 661 s.

- `layout` judges each try of its search by its placement only (the drawing and the nets); the hazards over states, the doubts, the computed fix, the readings and the Behaviour run are worked out once, on the circuit kept (they never change which try wins). A measurement of the same circuit is reused (`evaluate`), and the sight search's polygons are scanned once. The laser and HC-SR04 on an UNO: 29 s → 15 s; the same placements, statuses and tries everywhere (the layout bench line by line, the frames, the golden file). The tests that are not about the budget lay out with the largest budget (`test/layout-generous.js`), so a busy machine never turns their result into `CHANGES`.
- The 74HC595 and the CD4017 are simulated (`src/sim/devices/logic.js`, `shift-register.js`, `counter.js`): no longer "drawn, not simulated", their LEDs are judged and a circuit with them can end `DONE`. The 74HC595 shifts on SRCLK, clears on SRCLR, latches on RCLK, opens its outputs with OE high and chains through QH'; the CD4017 counts on CLK with CE low, holds with CE high, resets with MR, and a Qn on MR makes it count to n. Inputs read high over 0.7 and low under 0.3 of the chip's supply; a chip hears each change of a board's pin in order, so `shiftOut` (whose clock pulse takes no simulated time) works from an UNO and an ESP32. Outputs are sources with the datasheet's drive (an LED straight on a CD4017 output at 5 V takes about 3 mA); limits per output, supply and power. New warnings: `SIM_IC_INPUT_OPEN` (an open input, taken as low), `SIM_IC_INPUT_LEVEL` (a 3.3 V pin on a chip fed 5 V), and `SIM_IC_SUPPLY_RANGE` under its minimum supply. `catalog <part>` says in a `Simulated: …` line what the model covers and leaves out. Examples `uno-74hc595-fill` and `555-cd4017-chaser`. A run no longer crashes on a warning about a chip's pin (`U2.QA`).
- A power limit is judged on the average over a run (from the first instant over it to the end) and over a `--transient`'s samples, not on the peak: a clipped LM386 at 2.5 W peaks and 0.56 W on average is no longer flagged against its 1.25 W; currents and voltages stay instantaneous. The line says `on average over the run, from … to …`.
- An open input of a logic chip says what the kit's low means for that pin (`OE … the outputs are enabled`, `SRCLR … the register is held clear, so the outputs never light`, `MR … no reset, it counts`, `CE … counting is enabled`) and that a real open input floats (undefined).
- A logic chip's input more than 0.5 V over its supply is a hazard naming the pin (`SIM_IC_PIN_VOLTAGE`, `U2.SER has 4.99 V on it, more than its maximum 3.8 V`): a UNO's 5 V pins into a 74HC595 fed 3.3 V ended `DONE`.
- A logic chip's input switches where a real one does, near half its supply (74HC595: NXP's typical 2.1 V to 2.4 V at 4.5 V; CD4017: its clock with a Schmitt band), no longer anywhere between 0.3 and 0.7 of it; a steady level inside that guaranteed band is the doubt `SIM_IC_INPUT_LEVEL`, now shown by `review` and `layout`, saying the chip reads it high or low there without the datasheet's guarantee and why (a 3.3 V pin into a 5 V chip; an output loaded by an LED). A CD4017 counting to seven with a white LED on Q7 now resets (Q7 at 2.9 V) and says so; a 74HC595 on 5 V driven by 3.3 V pins now latches, with the doubt.
- What a clocked chip latches is now one of the states the review visits: a run records, beside a board's pins, each 74HC595's and CD4017's state, and the hazard check holds the chip in it (`engine.hold`). Eight red LEDs on 330 Ω filled by a 74HC595 now end `WARNINGS` with `U2 carries 71.3 mA, more than its maximum 70 mA … with U2 QA…QH 11111111 latched`, where `layout` said `DONE`; a hazard seen in several states is said once, at its strongest. The example `uno-74hc595-fill` now has 1 kΩ resistors (inside the chip's 70 mA with margin). A logic chip's damage warning is at its absolute maximum supply (74HC595 7 V, CD4017 20 V), with `SIM_IC_SUPPLY_RANGE` past the recommended range (6 V, 18 V).
- Loose ends of the command line's work: a `program` that names a folder says it is a folder and where the kit looked (`SIM_PROGRAM_FOLDER`); a one-line `program` with a slash or an ending other than `.ino` is taken for a file name the kit does not read, says where it looked and what a sketch's text needs (`SIM_PROGRAM_NOT_SKETCH`), instead of "does not read at line 1"; a run adds "at its strongest in the run, at …" only to a warning with a quantity; a battery shorted (bare wires, or a second battery facing the other way) is also a hazard over its maximum current, beside the short-circuit doubt.
- A slow oscillation is followed before an output is called never on: the review's run grows, while outputs are still dark, to two periods of the slowest oscillation the time constants suggest and on while outputs keep coming on late, up to 30 s (a 555 at 0.3 Hz clocking a CD4017 now ends `DONE`); when it cannot cover them, no doubt is raised and the Checked line says the run was too short to tell (`short-run`).

### Fixed

- A sketch's `delay()` lasts what it says: after a `loop()` that ran a while without waiting (polling a button), the next `delay(300)` lasted 0 ms and the one after it seemed to end at the button's release (the time not waited was carried as a debt). The same fault was in the live page, which runs the same program runner.
- A sketch's `char` prints as its letter (`Serial.println('Z')`, a `char` variable, `(char) 65`, a function returning `char` printed the number), as a board's `Print` does; `char` arithmetic stays a number and `Serial.println(c, DEC)` prints it. `Serial.write(65)` prints `A` (it was noted as unknown and printed nothing), and `DEC`, `HEX`, `OCT`, `BIN` are known: an integer's second argument is its base (it was ignored), a float's its decimals.
- Mistakes in a sketch that a real board would show are warnings with their line, a ⚠ of the review, and the sketch goes on as a board would (`SIM_PROGRAM_PIN_UNKNOWN`, `SIM_PROGRAM_NOT_OUTPUT`, `SIM_PROGRAM_NO_PWM`, `SIM_PROGRAM_DIVIDE_ZERO`, `SIM_PROGRAM_OUT_OF_BOUNDS`, `SIM_PROGRAM_DELAY_NEGATIVE`, `SIM_PROGRAM_UNDECLARED`, `SIM_PROGRAM_BRACE`): before, `digitalWrite(99, HIGH)`, an index past an array, a division by zero and `delay(-1)` passed in silence, an undeclared name read as a limit of the kit and a missing brace as "does not read at line 9". An `#include` of a library the kit does not have is one line, and its objects (`Servo s;`, `LiquidCrystal lcd(…)`) and calls (`WiFi.begin(…)`) do nothing instead of stopping the sketch with "does not read … (near ".")". `int a[5] = {1, 2}` has five elements (it had two); an error that stops the program names its line; on an UNO `analogRead(0)` reads A0 (it read D0).
- A loop that ends is no longer called stuck: the turns a loop takes without time passing are counted across steps, and `SIM_PROGRAM_STUCK` comes at 200 000 of them, its text saying so instead of "a loop that never ends". Serial output takes time at the rate `Serial.begin` gave (ten bits a character, once the transmit buffer is full), so a loop printing 100 000 lines on an UNO at 9600 baud prints about 87 lines a second, as the board does (it printed two million in a second and was called stuck).
- `Serial.begin` makes the UART's TX pin an output that idles high (D1 on an UNO, GPIO1 on an ESP32), so a UNO's TX wired to an ESP32's RX is seen at 5 V on a 3.3 V pin (`SIM_PIN_OVERVOLTAGE`); it read 1.38 V.
- Two boards talk over a serial line: the bytes one sends on its TX pin arrive at the other's port whose RX pin is on the same net, each when its bits are through at the sender's rate, so `available()`, `read()`, `parseInt()` and `readStringUntil()` work between them in one run (`simulate --run` shows both boards' output); two rates that differ pass nothing (`SIM_PROGRAM_BAUD_MISMATCH`). `println` sends `\r\n`, `print("\n")` only `\n`.
- `Serial1` and `Serial2` on an ESP32 (`Serial1` on an ESP32-C3) are serial ports of their own, their output labelled in the run (`Serial2: …`); on an UNO `Serial2` stops the program with a line that names it (it said "does not read at line 3 (near ".")"). `Serial` and the ports read with `parseInt`, `parseFloat`, `readStringUntil`, `readString` (waiting their timeout), `peek`, `setTimeout`, `flush`, `end`. ESP32 deep sleep (`esp_sleep_enable_timer_wakeup`, `esp_deep_sleep_start`, `ESP.deepSleep`) is simulated: the program stops, its pins go to inputs, and after its timer it starts again from `setup()`.
- Interrupts run: `attachInterrupt(digitalPinToInterrupt(pin), handler, RISING | FALLING | CHANGE | LOW)`, `detachInterrupt`, `noInterrupts()` and `interrupts()` on the pins that have them (an UNO's D2 and D3, any ESP32 GPIO); the handler runs at the step that sees its pin cross, between two statements of the main program, also during a `delay`. A pin with no interrupt is warned (`SIM_PROGRAM_NO_INTERRUPT`). Before, `attachInterrupt` returned 0 and `RISING` stopped the program.
- An H-bridge driven by a sketch got "Q3 dissipates 3.65 W … with D4 high": each program output was raised alone. With a program that runs, the hazard check now visits the combinations of outputs its run reaches (`with D2 + D5 high`).
- Figures that disagreed: `layout`'s Behaviour line said 1.11 kHz where `simulate --run` said 1.04 kHz (a fast rhythm is now measured again in the page's step; `about` under five periods); a pin overloaded under the half-rail line read "off the whole time" beside LEDs on (a pin is reported by what the program writes); `--transient` gives the step solved and the spacing of the samples printed; a loaded pin's reading names its output resistance.
- `simulate --run` printed an empty `Supplies:` heading for a board on USB alone; a part wired to nothing is open, never a hazard.
- `shiftOut(DS, SH, MSBFIRST, c)` stopped with `$MSBFIRST is not defined`: `shiftOut`, `shiftIn`, `MSBFIRST`, `LSBFIRST`, `TWO_PI`, `HALF_PI`, `DEG_TO_RAD` and `RAD_TO_DEG` are in the kit's Arduino subset; an unknown name says it is not in that subset, by its own name; a two-dimensional array is refused with its line (`SIM_PROGRAM_ARRAY_DIMENSIONS`).
- A supply written `voltage: -5` read "supply 5 V": the readings and `simulate` now name it as written (`-5 V`, `written negative: T- is the positive rail`), and `layout`'s answer has a `Note:` line saying the rail named + is the lower one.
- The underdriven-relay line no longer prescribes "a smaller base resistor, a bigger driver" (that loaded a sensor's divider and made it worse): it says what the coil gets, what it needs, and that the stage driving it does not deliver it.
- A buzzer wired backwards got "To fix it: a 820 kΩ resistor in series", which silences it. For a reverse-voltage hazard the fix is now the part turned round or a supply's leads swapped (`fix.kind` `swap` / `swap-supply`, also through `specWithFix`); a series resistor is never offered for it.
- A relay's coil or a motor switched by a transistor, a MOSFET or a board's pin with no diode across it ended `DONE`; it is a doubt now (`COIL_NO_FLYBACK`): the switch can be damaged when it turns off, and a diode across the coil fixes it. A wiring check: it never blocks placement.
- An HC-SR04's ECHO (5 V) straight on an ESP32 pin got no warning: ECHO is low at rest. `SIM_PIN_OVERVOLTAGE` now comes from the highest voltage each board pin sees over the review's states and its run, with the moment (`D18 reaches 4.05 V at 262 µs of the kit's run`).
- An output that never comes on is a doubt (`SIM_OUTPUT_NEVER_ON`): a relay fed straight from a sensor module's output (3 mA in a coil that needs 54 mA), a joule thief of two uncoupled inductors and LEDs behind a chip the kit does not simulate ended `DONE`; now `WARNINGS`, naming the parts. The hazard check also visits a declared environment's other fields (a laser's `beam`), the page's controls and a run with each state held and released (a touch module in toggle mode).
- A board's `.ino` beside `circuit.json` was "not found" by `layout` and `review` when the circuit had a sensor that reads the world (an LDR, a DHT11): the environment's ends were compiled from a copy that lost the circuit's folder. `simulate` always found it.
- `layout` calculates before it tries and never runs away: a spec too large for the board is `STATUS: FIX_SPEC` at once (exit 1, nothing created) with the columns needed and available and how many parts fit one board; a spec beyond what one try of the search places within its budget is said in a first note; the search has a wall-clock budget, 60 s by default (CLI `--budget <seconds>`, MCP `budget_s`, at most 300 s, `LIMITS.layoutSeconds`), and when it runs out it answers with its best try so far, `STATUS: CHANGES`, and a line saying what is still open and that a larger budget or a smaller circuit are the options. `suggest` takes a `deadline` for it.
- Large circuits lay out in seconds, not minutes, and without running out of memory. The cause, profiled: every candidate placement rebuilt the whole circuit's geometry (the cost grew with the square of the parts), the memo kept a whole build per candidate (2.9 GB for ten LEDs), and the tries never converged on parts hidden in both views. A placement is now checked against the parts near it, what it hides is measured while placing (`src/layout-sight.js`), the memo is bounded and an order equal to the one already placed is not tried again. Ten LEDs with their resistors from one UNO pin: two tries, `WARNINGS` (the pin over its current), about 3 s (was 24 tries, `CHANGES`, about 60 s); twenty: about 8 s (did not end); two hundred resistors in series: `DONE` in about 6 s (was out of memory, exit 134). What a place hides is measured only once the first try leaves more than five parts hidden in every view, so recipes keep their placements. A review no longer builds the same circuit five times (`buildCircuit` keeps its last two results) and the inspector's raster keeps each part's cells in a typed list: the same figures, less memory.
- Four recipes (`uno-button`, `c3-pot-pwm`, `encoder-dimmer-uno`, `clap-switch`) and the example `esp32-both-headers.json` list their ground pins as one net.
- Nets that share a pin are one net (`["U1.D8","R1.1"]`, `["U1.D8","R2.1"]`…): joined where the first was, with a note naming them (`LAYOUT_NETS_JOINED`), the same circuit as the pins in one list. Before, a board's pin could find no place and was named twenty times.
- An op-amp with positive feedback (a relaxation oscillator) stopped at its first switch (`did not converge`): Newton now stops at the edges of its linear range at most twice per solve.
- A sketch's comparison stored in an `int` (`int pressed = digitalRead(2) == LOW;`) was always 0, so `uno-button`'s LED never lit.
- `--transient 1,1e-5`: a step written with an exponent was read as no step at all; a number the kit cannot read is now an error.
- Wording that overstated: reverse supply says it "can be destroyed" and that any reverse voltage on a supply is outside its ratings (a development board: "the board can be damaged"); a ceramic capacitor over its rating says its dielectric can break down, an electrolytic slightly reversed only degrades; a LED in reverse "can burn out"; a relay "may not pull in", and a coil under a quarter of its pull-in current (a leak) is not reported; a finding seen in several states is reported in the one that tells most.

- The `Readings` line named a battery part twice (`battery BT1 8.92 V · battery BT1 8.92 V`); a drawn battery is named once, by its id.
- A missing, empty, malformed or wrongly shaped spec, operations or circuit file is answered in one or two lines (exit 1; `STATUS: FIX_SPEC` for `layout`), never a stack trace; an unexpected error is `internal error: …` (exit 3; `PROTOBOARD_DEBUG=1` adds the stack).
- A spec with no parts is `STATUS: FIX_SPEC`, not a circuit of zero parts.
- The command line sets its exit code and lets the output drain: `simulate --json` through a pipe is no longer cut at 64 KiB, and `| head -1` ends quietly.
- `apply` no longer saves input the kit cannot read (a value the part does not understand, an unknown part, pin, field or hole): the batch is refused, nothing is saved, also in `--dry-run`. A change that is readable but wrong (a short, a collision) is still saved, now with a line saying `with K new error(s)` and that it cannot be simulated until fixed; the diff counts everything `check` reports, and `--json` carries `newErrors`.
- A language given with `layout --lang` stays with the circuit, so `apply`, `undo` and the rest answer in it.
- `layout` on an existing circuit with no spec says on its first line that it laid the circuit out again.
- A reader that closes the pipe (`check … | head -1`) no longer hides the command's exit code; any other write failure (a full disk) is one line and exit 3.
- A circuit over the size cap, or whose fields have the wrong shape (`"parts":"x"`), is an input error (exit 1) in the person's language, checked once where the circuit is loaded.
- `apply` refuses a field the part does not take (`UNKNOWN_FIELD`, a warning) like the other unreadable input; a part placed oddly (`DIP_SHAPE`…) stays an outcome.
- A number or language option that is not valid (`--expect-revision abc`, `--lang fr`) is refused by the argument parser with its name; JSON given on the command line (`--values`) is read like a file (exit 1); `layout --lang` replaces the language stored in the circuit.
- A missing field in an operation is named (`needs \`part\``), never "undefined".
- Trust: a circuit fed backwards is a hazard, not a silent APPROVED: regulators, op-amps, the 555 and development boards with the supply pin below the ground pin (`SIM_REVERSE_VOLTAGE`, the line names both pins), a bench supply with a negative `voltage` simulates as the same supply reversed, the hazard check also visits the bottom and top of each environment field a sensor follows, a relay driven but not pulled in says so (`SIM_RELAY_UNDERDRIVEN`), and a push button with different nets on two joined pins says so (`BUTTON_PINS_JOINED`).
- A computed fix leaves an LED lit and a motor above the bottom of its voltage range, or the kit says it has none; a lone overloaded resistor gets none. Damage lines end by saying what happens to the part; a brightness far over the rated one is said in words, not as thousands of per cent.

- `catalog buzzer` says which kind is which (no part number: the passive one, silent on steady DC; `TMB12A05`: the active one), and the active buzzer's card no longer starts by calling it passive.
- An unknown part with no close name says so and points to `catalog` (it printed `Closest: —.`); a speaker, an LED strip, a servo, a transformer or an LCD names what the kit has near (a passive buzzer, single LEDs, a DC motor, a signal generator, a 7-segment display).
- A resistor, potentiometer, capacitor, inductor or Zener with no value says the value is missing and what it takes (it printed `"undefined"`).
- An option the kit cannot read (`--expect-revision abc`) is named on the last line, with `See the options with --help.` after it.
- The doubts' heading says what is true of all of them, the ones the kit could not check and the ones it checked and found may not work: `The kit cannot confirm these work (so it cannot say the circuit works):`.

- A passive buzzer that beeps was said as its tone (`BZ1 2 kHz, on 50 % of the time`): `simulate --run` and the `Behaviour` line say the beeps and the tone apart (`BZ1 (buzzer): beeps 2 Hz (every 500 ms), sounding 20 % of the time · beeps: 4 · tone 2 kHz`), and `--json` adds `sound` and `tone` to the output (its other fields keep meaning the current's). A passive buzzer on a steady current is silent, not "on": `BZ1 never sounds` (`SIM_OUTPUT_NEVER_ON`, variant `passive`); an active buzzer on DC still sounds.
- A motor straight on a UNO pin had two figures for one pin (49.7 mA in `layout`, another in `simulate --run`): each names its state. The hazard of the DC point on a pin the program sets high says `with D9 high, as the program first sets it`; a run's warning is its strongest reading, with when and the pin's level then (`at its strongest in the run, at 10 ms, with D9 high`: the motor starting), not whichever came last.
- `catalog` of a development board says the output resistance the simulator uses for its pins and where it comes from (`behind 40 Ω (from the ATmega328P datasheet: 4.2 V out at 20 mA from 5 V)`; the ESP32-C3's is assumed; JSON `pinOutput`).
- The control of a supply written at −5 V showed 5 V: it is as written, from −30 V to 0 (`--set V1=-9`).
- `layout --fix` on a part in backwards said `Applied the fix: BZ1 = ? in series with {with}.`: the swap fixes say what they did (`Applied the fix: turned BZ1 round (its 1 and 2 swapped).`, `Applied the fix: swapped the leads of V1 (its + and −).`), and a bench supply with no rails of its own is really swapped (it stayed on T+ and T−, and the hazard stayed).
- `npm run parts-reference -- --write` threw since a two-dimensional array is refused by the translator; `references/sketch.md` lists `shiftOut`, `shiftIn`, `MSBFIRST` and `LSBFIRST` as known and says a two-dimensional array is refused by its line.
- A board's program in a `.ino` file beside `circuit.json` did not run in `simulate --run` with an environment given, nor in `layout`'s `Behaviour` line (the run's copy of the circuit lost its folder): the LED of a distance alarm stayed off at any distance.

### Added (C11b)

- The ULN2003 and ULN2803 Darlington arrays, the PC817 optocoupler and the LM386 audio amplifier are simulated (they were drawn only and a circuit with them ended `WARNINGS`): their outputs drive LEDs, relays and loads with the datasheet's voltages and limits, and `catalog <part>` says in two or three lines what each model covers and leaves out. A ULN's `COM` on the coil's supply counts as the coil's flyback diode. The PC817's two sides, with separate supplies and grounds, simulate in DC, in a run and in the page. The LM386's transient converges (its clip is smooth). Examples: `uln2003-relay`, `pc817-isolated-led`, `lm386-amplifier`.

### Fixed (C11b)

- A development board on USB with no connection to the circuit's supplies (an UNO reading the output side of a PC817 whose LED side has its own 12 V) was floating: `no DC path to the supply`, its pins unread and the circuit `WARNINGS`. Its side now takes the board's GND as its own reference, as a second supply's does (`SIM_SEPARATE_CIRCUIT`, variant `board`), and ends `DONE`. Five golden cases changed for the same reason: the examples whose board is off the rails the golden harness feeds (`encoder-uno`, `esp32-led`, `uln2003-relay`, `uno-74hc595-fill`, `epaper-esp32`) now read their board's side instead of leaving it floating.
- A regulator over its absolute maximum input is a hazard: 40 V into a 7805 ended `DONE` (35 V for the 7805 to 7818, 40 V for the 7824, 40 V from input to output for the LM317).
- A run with an over-current on a chip's pin (`U2.OUT1`) threw: it looked the pin up as a board's.

## [0.12.1] - 2026-11-18

A fix for videos: a part that lands stays seen when the focus moves on before it touches down.

### Fixed

- A video that lands its lead part and moves the focus to another part before it touches down no longer leaves the landed part unseen on the board: its own pieces stayed hidden under a copy that left with the focus. Touched down, the part is shown whole (`toBoard` in `src/page/client/tour.js`); test in `test/moves.test.js`.

## [0.12.0] - 2026-11-17

The kit inside a plugin: one short skill that carries the kit and runs where an assistant runs code, with a desktop extension for the live board in the conversation. `layout` answers with the readings, a board's program, what can change, what was checked, a goal solved with the simulator and the computed fix of a hazard; it takes any part order, a trial that saves nothing and `--fix`. Hazards are read with each control and each program output operated.

### Added

- The README (en/es) rewritten for people first: a centred header, an animation recorded by the kit (`docs/img/hero.gif`, `hero.es.gif`; `npm run readme-gif`, `scripts/readme-gif.js`, timeline `examples/tours/readme-hero.json`), *Start here* in three doors, what you can ask, what you get, and the developer material in collapsible sections. `render-frames.js --no-captions` no longer fails the first frame for a caption it does not draw.
- An icon for the plugin and the desktop extension: a green LED, `plugin-src/icon.svg`, packed as a 512 px PNG (`plugin/.claude-plugin/icon.png`, `icon.png` in the `.mcpb`).
- **Goals in a recipe's values**: `layout --values '{"D1": {"current": "15mA"}}'` (CLI and MCP, the same `values`) gives a result instead of a value, and the kit picks the standard value that reaches it with its own simulator (E24 resistors, E6 capacitors, within declared decades; one knob swept, several ranked by a named estimate in `src/recipes/estimates.js` and the best few measured; knobs moved in order). The nearest result wins, one that overstresses nothing when as near; a goal that burns a part is obeyed and ends in `STATUS: WARNINGS`; one out of reach gets the nearest value and says so. The answer's `Solved:` line (`Resuelto:`, JSON `solved`) gives the value, the simulated result, how far and on which side, and the neighbouring values. Only the values chosen are stored. Errors: `RECIPE_GOAL_UNKNOWN`, `RECIPE_GOAL_VALUE`, `RECIPE_GOAL_AND_VALUE`, `RECIPE_GOALS_SHARE`. Declared in `led-resistor`, `555-astable` (`U1.frequency`) and 14 more LED recipes; `catalog <recipe>` and the `Can change` line list them.
- The advisory: a recipe circuit with no goal whose part runs above its rated value without a hazard gets a `Worth checking:` line (`Para revisar:`, JSON `advice`) with the standard value that would bring it under; nothing is changed and `STATUS` stays `DONE`. Not shown when the page hides the results.
- `src/core/units.js`: the IEC 60063 series (`E_SERIES`, `standardValues`, `nearestStandard`, `valueText`); the page's E24 slider uses the same table. `src/sim/cycle.js`: `periodOf`.
- A desktop extension for Claude Desktop (`.mcpb`, an MCP Bundle): the MCP server in one file, installed with a double click, with a circuits folder chosen at install (`${DOCUMENTS}/Protoboard` by default) and the live board in the conversation (`PROTOBOARD_APPS=on`). `npm run pack-mcpb -- --out <dir>` (`scripts/pack-mcpb.js`) writes its folder: the server and `src/` in their own layout, the server's production dependencies from `mcp/package-lock.json` without the PNG rasteriser, and a manifest generated from `package.json` and the server's tools; `--pack <file>` validates and packs it with the official CLI, pinned (`@anthropic-ai/mcpb@2.1.2`). `test/mcpb.test.js` checks the manifest, the files and that every import resolves inside the bundle. Built in the release, never committed. Tried in Claude Desktop on Windows; it installs switched off (switch it on in the extension's settings), and the install warning about access to the computer is the app's, shown for every local extension.
- A release workflow (`.github/workflows/release.yml`): on a tag `v*` it checks the tag against `package.json`, `mcp/package.json` and `CHANGELOG.md` (`scripts/release-assets.js`) and that `plugin/` is fresh, builds `protoboard-iso-plugin-<version>.zip`, `protoboard-iso-skill-<version>.zip` (the skill alone, to upload as a skill), `protoboard-iso-<version>.mcpb` and `SHA256SUMS`, and creates the GitHub release with the version's changelog section as its notes; by hand with `dry_run` it only keeps the files as workflow artifacts. Write permission only on the job that publishes. Not run yet on GitHub.
- A plugin for the Claude apps with one skill and the kit inside (`plugin/`, committed, written by `npm run pack-skill` from `plugin-src/`; `--check`, `--out <dir>`), listed by `.claude-plugin/marketplace.json` at the root: `/plugin marketplace add ccamilobedoya/protoboard-iso` in Claude Code, or the repository's URL in the Claude app. The skill is short: recipes first, the `STATUS` table, a stop rule (at most two corrections, no calls after `DONE`), a fixed shape for the reply from what `layout` says, only the kit's facts; the long guide is in its `references/`. `test/plugin.test.js` checks that `plugin/` is fresh, within the public directory's limits, agrees with the kit (recipes, commands, `STATUS` values, links) and runs from a read-only copy.
- CLI: `render --png-width`; `catalog` as the name of the catalogue (`parts` still works); `layout`, `apply` and `undo` print the page's absolute path (a line before `STATUS` for `layout`); the MCP answers of `layout`, `apply_ops`, `undo` and `render` carry it too (`pagePath` in JSON).
- `scripts/clean-install-check.js` and the CI job `clean-install` (Linux, macOS, Windows): a fresh clone, the README's commands, `cd mcp && npm install`, the MCP server over stdio (layout, review, simulate, render with `png_width`).
- Docs: a Claude Desktop section (the exact `claude_desktop_config.json`, an absolute `node` path with nvm, Windows paths) in `docs/en/mcp.md` and `docs/es/mcp.md`; the README states Node 22, where the page is, how to open it, a PowerShell variant and a Windows way to link the skill.
- `review` lists electrical hazards (`hazards`): each stress the simulator's DC point takes past a maximum, as `simulate` reports it. They do not block; the verdict is `approved-with-warnings` (APPROVED WITH WARNINGS, «APROBADO CON AVISOS»), with a section "As wired, this would damage:" and a line of guidance. `layout` ends in `STATUS: WARNINGS` (exit 0) for it, and the agent reports use `WARNINGS` too. Transient peaks (PWM, a 555, a generator) are not found.
- MCP Apps, a pilot: in a host that supports the extension, `layout` shows the circuit's live page inside the conversation (resource `ui://protoboard-iso/board.html`, app-only tool `page_parts`, which rebuilds an older revision from the history). Tapping a part updates the model's context in one line; the card's "Ask about this part" sends a message. Offered only to a client that announces the extension (`PROTOBOARD_APPS=on|off|auto`); any other client gets the same tools and answers. `mcp/http.js` serves the server on 127.0.0.1 for testing, `scripts/app-host-check.js` drives the reference host. A board's sketch does not run under the specification's default CSP (it needs `unsafe-eval`). See `docs/en/mcp-apps.md`.
- MCP Apps diagnostics: with `PROTOBOARD_APPS_DEBUG=1` the app-only tool `app_report` appends the viewer's reports (the `ui/initialize` result, each model-context update with its result or error, viewer errors) to `<root>/.app-report.jsonl` (256 KB cap, 4 KB per detail).
- `layout`'s answer, when the circuit was built (`DONE` or `WARNINGS`), says what a reply needs, before the page and `STATUS:` lines (`src/layout-answer.js`): a readings line from the simulator's DC point (the source, then up to four driven parts: LEDs with current and brightness, then buzzers, motors, relay coils, lasers; left out with no source, no DC point, a board running a program, a generator, a timer wired as an astable (it never rests), or a page that hides the results); each board's program as stored (a `.ino` read inside the circuit's folder), indented, cut to 40 lines past 80 lines or 4 000 characters; and, for a recipe circuit, what the recipe lets change, with the current values, roles and limits. The JSON answer has `readings`, `programs` and `changeable`. A sketch's line breaks cannot fake the `STATUS:` line (`test/attack.test.js`).
- **The hazard review reads a board's program outputs**: besides at rest and each control operated, each pin a board's program has made an output (by its first wait: `pinMode`, and the `digitalWrite`, `tone`, `analogWrite`, `ledcWrite` that make one) is held high alone while the program runs on (`engine.drive`), the others at rest; a pin already high at rest adds nothing. A hazard found so says `with D10 high` (`con D10 en alto`; JSON `when: { part, pin, name, value }`), and a board's pin is named in the warning (`U1.D10`). The states cap (24) covers controls and pins. A board driving a passive buzzer straight from a pin used to end `DONE` while the page showed 88 mA on the pin; it now ends `WARNINGS`. Every recipe at its defaults and every example still ends without a hazard.
- **The computed fix** (`src/fix.js`): after the hazards, `review` and `layout` say the simplest change the kit's own simulator finds that clears every hazard in every state, as information: a resistor's new value (`To fix it: R1 = 360 Ω brings … D1 to 19.7 mA (maximum 30 mA).`) or one resistor added in series (`To fix it: a 200 Ω resistor in series with BZ1 brings U1's D10 to 19.4 mA (maximum 40 mA).`), searched in E24 with the goal solver's sweep and aimed at the part's rated value or half of its maximum; or the fixed sentence `The kit has no computed fix for this.` (`El kit no tiene un arreglo calculado para esto.`). JSON `review.fix: { kind: 'set' | 'add-series', part | with, pin?, value, brings }` or `fix: null` with `noFix: true`. It replaces the generic "add or raise a series resistance, or lower the supply".
- **The `Checked` line** in `review` and in `layout`'s answer (when the circuit was built): what the hazard check covered for this circuit and what it did not (`Checked: at rest, 2 controls, 3 program outputs. Not checked: peaks while switching, combinations of …`; JSON `checked: { rest, controls, outputs, notChecked }`).
- **A trial of `layout`**: `--dry-run` (CLI) and `dry_run: true` (MCP): the same answer and `STATUS` on the circuit as it would be after the call, ending `Trial: nothing was saved.` (`Ensayo: no se guardó nada.`), and nothing written (no file, history, page, revision or folder; no board shown in an MCP host). For trying an idea the kit did not compute before it reaches the circuit.
- The skill's `references/beyond-the-kit.md`: the kit's fixed sentences for where it has no answer, the trial with a worked example, and what to do with a part the kit does not have.
- `catalog <part>` (CLI and MCP; a type, a part number or a module) answers a question about the part from the kit: `about`, the text of its card in the page (`describePart`); `pinRoles`, what each pin does (the rows of its close-up); and `limits`, the rated and maximum values the simulator checks it against, with their units (`rated current 20 mA · maximum current 30 mA · maximum reverse voltage 5 V`), read from each device's own `limits` (`src/sim/ratings.js`), and `limitFields`, the fields they follow (a resistor's `power`, given at its default). A part the simulator has no limits for gets no line. `catalog <name> --json` prints the entry as JSON.
- **The kit applies its own fix when asked**: `layout <target> --fix` (CLI) and `fix: true` on the MCP `layout` tool, on a circuit made by `layout`, take the circuit's current computed fix (a resistor's new value, or a new resistor with the next R number in series at the pin, listed before the part it goes with) and lay it out as one revision (`undo` restores it), with the usual answer and one line more: `Applied the fix: R3 = 200 Ω in series with BZ1.` (`Arreglo aplicado: …`). With `--dry-run` it is a trial. No hazard: it says there is nothing to fix and changes nothing (exit 0); no computed fix, a circuit without `spec`, or a spec or values given too: refused with one sentence each (`LAYOUT_FIX_NO_FIX`, `LAYOUT_FIX_NO_SPEC`, `LAYOUT_FIX_AND_SPEC`).
- **`layout` no longer depends on the order the parts are listed in**: the order given is tried first, as before (every spec that ended `DONE` keeps its placement and its time); when it ends `CHANGES`, two orders read from the nets are tried (by distance from the source, and from the far end back) and the best result is kept, with a note saying so (`LAYOUT_ORDER_FROM_NETS`). A resistor added in series at the end of the parts used to leave `No jumper fits` on the circuit already placed; it now ends `DONE`, as does the transistor variant with its 5 V pin wired straight to the buzzer or with its own fix added. `test/layout-order.test.js` shuffles fourteen recipes three times each; `esp32-distance` is named there as still order-dependent.
- For a client that gets the viewer, `layout`'s text ends in one short line saying the user already sees the circuit as a live board (do not render an image), and `render`'s description no longer advises `png_width`. Other clients are unchanged.

### Changed

- The skill: the kit first; the assistant's own knowledge (or a search) only where the kit says it has no answer, and always tried with `layout --dry-run` before it reaches the circuit; "fix it" applies the kit's `To fix it` line as one change, never a redesign when one part fixes it; at most three trials per request; a reply labels what the kit says, what the assistant added and the kit confirmed, and what the kit cannot check. Its body may be up to 8 KB (was 7 KB).
- The fixed wordings where the kit has no answer say "the kit does not …": an unknown part type or part number (`UNKNOWN_TYPE`, `UNKNOWN_PART_NUMBER`), a part drawn but not simulated (`SIM_UNSUPPORTED`), a goal or field a recipe does not offer (`RECIPE_GOAL_UNKNOWN`), a value it cannot read (`BAD_VALUE`, `RECIPE_GOAL_VALUE`), in both languages.
- `STATUS: WARNINGS` tells the assistant to offer the kit's fix (its `To fix it` line), or to try an idea in a dry run of layout first when there is none; the review's line after the hazards keeps "Keep it if showing the failure is the point" and "say so to the user before changing anything".
- `catalog <board>`'s limits read the same with a board's pins named in its stresses (`maximum current 40 mA per pin`).
- A trial (`layout --dry-run`) that ends `CHANGES` says so in its own words (`as tried, the circuit would be left with … (nothing was created)`) instead of "the circuit was created". The skill's "fix it" after a `To fix it` line is `kit layout <folder> --fix`; the hand-written change, tried first, stays for when the kit has no computed fix. The MCP `layout` tool says parts go in any order.
- A frequency under 1 Hz prints in Hz with decimals, never with the milli prefix (`0.93 Hz`, `0,93 Hz`; was `933 mHz`), everywhere the kit formats one (`formatValue`): `layout`'s goal lines, the cards, the page's generator slider. Other units keep their prefixes.
- The hazard review (`review`, `layout`'s `STATUS: WARNINGS`, the MCP tools, the goal solver's choice between equally near values) also solves the DC point with each control operated alone: a push button (or a rotary encoder's) pressed, a switch in its other position (rocker, latching button, slide switch, tilt switch tipped), a potentiometer or trimmer at each end of its travel. A part that burns only so is reported with its state (`⚠ warning: D1 carries 178 mA, more than its maximum 30 mA, with S1 pressed.`, «con S1 oprimido»; JSON `hazards[].when: { part, field, value }`); one that burns at rest is listed once, at rest. At most 24 states (`STATES_MAX`), with `hazardStates: { checked, total }` and a line when some were not checked. Not checked: combinations of controls, sensors that follow the environment, board programs, other sliders.
- `catalog <part>`: every limit in "limits (the simulator's)" says what it belongs to when the quantity alone does not: a relay's `6 V (coil)` and `10 A (contacts)`, a motor's `140 mA (when stalled)`, a board's `800 mA (3.3 V regulator)`, a regulator's `(output)` and `(input)`, an IC's or sensor module's `(supply)`, a switch's voltage `across an open contact` (it showed an untranslated key). The UNO no longer lists a 150 mA regulator limit: its logic rail is the USB's 5 V and the simulator checks no regulator there. `catalog 555` and a layout part `555` are the NE555.
- The Arduino UNO's card says each pin is meant to give about 20 mA and that 40 mA is the absolute maximum (what the simulator warns at), instead of "about 20 mA each at most" next to a 40 mA limit.
- `layout`'s readings line prints a load whose current is under 1 µA (the model's leakage, an LED behind a transistor that is off) as `0 mA`, keeping its brightness; the JSON keeps the number and adds `off: true`.
- The message for a PNG output when the rasteriser is absent (`render -o x.png`, the MCP `render` with `png_width`) says PNG is not available in this install and that the SVG and the page are, instead of telling to run `cd mcp && npm install`, which makes no sense inside the desktop extension.
- `catalog <recipe>` shows a value's choices as `[a | b | c]` (was `[a, b, c]`) and a range in the language's decimals (`[1,5…15]` in Spanish), the same formatting as `layout`'s answer.

- `layout` is titled "Build a circuit on a breadboard" (the label a host shows). `scripts/trigger-bench.js` measures whether a model uses the kit on a natural request that never names it (Claude Code's CLI as host; plan only unless `--run`, which spends tokens). An opening line in the server's instructions saying when to use the kit was tried and taken out: it helped in that host (sonnet 9/12 → 12/12 new-circuit prompts) but did nothing in a chat host that does not show the model a server's instructions, and making room for it had cost accurate lines (`analogWrite`, `page.results`, `page.flow`). When to use the kit belongs in a skill's description; the instructions say how.
- The inspector is a side panel also on a landscape frame from 640 px wide (a chat widget), not only above 760 px, and the oscilloscope in a card is capped at 320 px wide: in a wide, short frame the sheet covered the board and the traces filled the width. `scripts/ux-shots.js` takes the page in frames of 1000×560, 1000×800 and 700×500.
- A part's view up close is on in every live page (`"page": { "focusView": false }` or `renderPage(…, { focusView: false })` turns it off; recordings and frames never have it), so the MCP viewer has it too. The eye in a part's card now opens it (a part without a close-up has no eye) and the card's first row is gone; the see-through toggle left the card (`ghost` stays for timelines). Pages grow 3 to 6 % (the pinouts).
- The page's background grid of dots (light and dark themes) is a quarter as strong, so it no longer competes with the board's own holes when the board is seen from afar (`GRID_STRENGTH` in `src/page/style.js`); the notebook and stage themes keep their paper lines.
- The MCP App viewer no longer has the button "Ask about this part" nor sends `ui/message`: hosts show a security warning when a message lands in the user's box. It talks to the model only through the silent model-context update.
- The README's "Try it in a minute" lays out `led-resistor` (an LED that is lit when simulated) instead of `npn-switch` (a button not pressed: the LED showed 0 %).
- `SKILL.md`'s CLI block lists `check`, `nets`, `catalog` and the PNG output; the circuit-layout agent points to `catalog` for the recipes instead of repeating a list.
- `mcp/package-lock.json` updated inside the current major (the SDK's transitive `hono` advisories are gone: `npm audit` reports none).
- `src/page.js`: `renderPageParts` returns a page's per-circuit pieces and `renderPage` composes the same document from them (byte-identical); the MCP server itself moved to `mcp/core.js` (`mcp/server.js` is its stdio entry).

### Removed

- The root `SKILL.md`, and the README's instructions to link the repository as a skill: the plugin's skill replaces both, and the npm package no longer ships it.

### Fixed

- The release's extension build failed with npm 10, which leaves the omitted rasteriser's scope folder behind, empty: only a folder with something in it counts, and the empty one is dropped. The CLI's message for PNG without the rasteriser says how to get it when run from a clone (`cd mcp && npm install`), and not from the plugin, which has no `mcp/`.
- MCP: `list_circuits` on a root that does not exist yet (a new circuits folder) answered with a raw `ENOENT` error; it now says there are no circuits yet and that the first circuit creates the folder, and a target prefixed with `circuits/` no longer reads the missing folder (`mcp/test/root.test.js`).
- `layout` with a value the kit cannot read (`--recipe led-resistor --values '{"R1":"abc"}'`, or a part `{ "type": "resistor", "value": "abc" }` in a spec) built a circuit with that part left unplaced (`STATUS: CHANGES`). The spec check now resolves every part, so such a value is a `FIX_SPEC` and nothing is created, and the message says what the field takes: a resistance such as `330`, `4k7` or `1M`, a capacitance, an inductance, a Zener voltage, the LED colours there are. A recipe's number that is not one (`"V1": "abc"`) says so (`RECIPE_VALUE_NUMBER`) instead of "out of range". A part whose fields cannot be read no longer adds net errors about pins it may not have.
- `catalog <part>` from the packed plugin, which has no `examples/`, left out the card's text, pin roles and limits of every part whose bare type does not resolve (a resistor, a capacitor, a Zener, an inductor, a header, a switch, a relay, a sensor module, the UNO, the DESPI-C02). They now come from the kit alone: such a type declares a typical instance (`typical`: a resistor's `330`, a module's `UNO`), and a part wired pin by name is described with every pin. The relay's part number `SRD-05VDC-SL-C` now has them too. A test compares the packed catalog with the repository's for every type, part number, module and board.
- The text of a development board (`catalog <board>`, the page's card) no longer says "Not simulated yet": boards are simulated pin by pin and run their program. Only the adapter board's text still says it.
- `docs/en/recipes.md`: the `npn-switch` row gave R1 = 22k and R2 = 470 (the recipe has 1k and 330), `lm393-comparator` R3 = 1k (330), `clap-switch` left out R1's and D1's defaults and `voltage-sensor-uno` V1's; a stray copy of a bullet in "Recipes with a real sensor" is gone. The Spanish document had the same rows and colours in Spanish where the field takes `green`. A test now checks every row's defaults against the recipe, in both languages.
- The MCP server keeps no state in memory that matters (a host may run two processes of it): the viewer's selection, the assembled pages handed over in chunks and the debug report live in `<root>/.protoboard/` (bounded, safe to delete, ignored by `list_circuits`; written with temp file + rename); the tools run in the server process by default, and in a restarting worker only with `PROTOBOARD_DEV=1` (set in this repository's `.mcp.json`). A change to a circuit (`apply_ops`, `undo`, `layout` on an existing one) is made under a lock, so two simultaneous calls with the same `expect_revision` give exactly one winner. Chunks of a page can be served by another process than the one that made the manifest.
- The stdio MCP server now exits when its stdin ends or closes, or its stdout breaks (the SDK does not watch for it; servers were left behind after a host over ssh went away).
- MCP App viewer: with a local connector Claude does not let the model read the widget, so a tapped part never reached it. The viewer now also tells the server (app-only `selection_set`), and the model reads it with the new tool `selection`, offered only to clients that get the viewer (about 450 bytes); `layout`'s final line for those clients says so. Kept in `.protoboard/selection.json` in the root (Claude Desktop runs two processes of the server, so process memory cannot be shared; last 32 circuits, 24 h, atomic writes, memory fallback on a read-only root). The model-context update is sent only where the host advertises `updateModelContext`.
- MCP App viewer: Claude Desktop refuses a tool result over 983,040 bytes (also for a viewer's calls), which `page_parts` passed once the close-up became the default (a UNO page). `page_parts` now returns a manifest and then chunks of at most 256 KB each, pinned by an id; the viewer fetches them four at a time, retries a failed one once, shows its progress and a readable error. A test checks every recipe and example (largest page 1.5 MB).
- PNG now works in the documented MCP install: `cd mcp && npm install` puts `@resvg/resvg-js` in `mcp/node_modules`, which the kit could not see from `src/`; the server now tells the kit where to look (`rasterSearchIn`). Before, `render` with `png_width` answered "PNG not available" on every fresh clone.
- `render -o x.png` no longer writes SVG text under a `.png` name: it writes a real PNG, or fails with exit 1 and says how to get PNG.
- The `claude mcp add` example and the MCP docs point `PROTOBOARD_ROOT` at a folder of circuits of your own, not the clone.
- Layout again on an existing circuit kept a part's old holes even when its new nets no longer wanted them (a cathode left on the ground rail), which made a short; a part now keeps its holes only when every pin still fits its net.
- `layout` printed a review that ignored the nets asked for, so it could say APPROVED beside a "nets joined" error; its review now reads them.
- SKILL.md, the layout tool's description and the agents said to give `parts` "only if parts change" when changing a circuit; a partial list fails with `FIX_SPEC`. They now say to give the full list and the supplies again.

## [0.11.1] - 2026-11-12

Recipe summaries short enough for a phone, and a touch module on a nominal 5 V supply no longer marked as near its limit.

### Changed

- Recipes: the paragraph each recipe's page opens with (`teaches`) is at most 280 characters for `encoder-uno`, `clap-switch`, `uno-bmp280-altitude`, `encoder-dimmer-uno`, `ldr-night-light`, `ntc-follower` and `obstacle-buzzer` (it was 300 to 650), so the drawing stays in the first screen of a phone; a test caps every recipe at 340. The caveats that were there (the encoder filter at a reversal, the ATmega328P's I2C high level, the KY-037's polarity, the night light's switching levels) are in each recipe's header comment and in `docs/en/recipes.md`.
- The thermistor's label reads "TH1 · 10 kΩ", not "TH1 · 10 kΩ NTC": the part's name already says NTC.

### Fixed

- Simulator: the TTP223 module's supply is marked "near its limit" from 95 % of its 5.5 V (5.225 V), not from 80 %, so the nominal 5 V of a UNO shows no mark and no note; a stress can carry its own start for "near" (`nearAt`). Over 5.5 V is still exceeded.
- Recipe `touch-toggle-led`: more `clearance`, so the leader line of R1's label no longer passes over a jumper (a mark beside "R1 · 470 Ω" in the page).

## [0.11.0] - 2026-11-12

More sensors: ultrasonic distance and `pulseIn`, Hall, voltage and sound modules, climate sensors read through their libraries, a rotary encoder, emitters and a laser; and the sensor recipes checked part by part against their limits.

### Fixed

- Recipes: `clap-switch` no longer depends on which way a KY-037's DO moves (not
  confirmed) nor on the pulse being long: it takes as rest the level most of 100 readings had in
  `setup`, acts on the change from rest and accepts the next clap only when DO is back at rest and 200 ms
  have passed, so a long noise counts once (tested with the board's DO falling and, through an inverter,
  rising, with pulses of 0.2 to 500 ms); `sound-level-led` leaves the recipes (it lit an LED
  straight from DO) and stays as `examples/sound-level-led.json` until the polarity is measured; the
  kit's `KY-024` is described as modelled with an A3144 while the real board is reported to carry a
  linear 49E; the HC-SR501's delay cannot go under 2.5 s (the trimmer's minimum; it was 0.3 s) and
  `pir-uno` says a real module needs about a minute to warm up; `laser-tripwire` (5), `pir-lamp`,
  `touch-toggle-led`, `light-switch-module`, `obstacle-buzzer` (3), `ldr-comparator` and
  `lm35-comparator` (5) get a wider `clearance`, so a standing module no longer hides a resistor in
  one of the two views (`laser-uno` stays at 2: 3, 4 and 5 fail to place its laser module).
- Recipes checked against the simulator and the datasheets (the limits are named in the recipes): `encoder-uno` and `encoder-dimmer-uno` debounce CLK by time (8 ms, `millis()`), use
  `INPUT_PULLUP` on the three lines and ship with 2 ms of bounce, so the count is exact with the whole
  control (0 to 5 ms) up to about 800 °/s (before, 5 ms of bounce counted −1 after five clicks back);
  `ldr-comparator` (V1 up to 12 V, R3 1 kΩ), `ldr-night-light` (V1 up to 9 V, R3 560 Ω) and
  `lm35-comparator` (R3 1 kΩ) keep the LED and the LM393's output inside their limits over their
  controls; `ntc-follower` takes 9 to 12 V and its temperature control ends at 65 °C, where an LM358
  follower stops copying; `uno-bmp280-altitude` turns Wire's pull-ups off after `begin()` so the bus
  idles at 3.3 V, not 3.68 V; `touch-uno` runs the TTP223 from 5 V; `hall-linear-uno` measures the
  49E's zero at start-up (the average of 32 readings); `uno-bmp280-altitude` says that 3.3 V on the UNO's
  I2C pins is below the 0.7 × VCC the ATmega328P asks for. Texts that claimed more than was known were corrected (`touch-toggle-led`
  3.45 mA with 330 Ω, `laser-tripwire` about 410 lx, the laser's 28 mA against a pin's 20 mA, the
  DHT11's 2 s as the library's limit, the voltage divider's 1/5) and the model's figures are said to
  vary with the real part.
- A UNO's ADC reads against its own solved 5 V rail (AVcc), not a fixed 5.0 V: a ratiometric sensor
  on USB reads the same count whatever the supply (`hall-linear-uno` at rest: −5.24 → −1.75 G, one
  count of its sketch's conversion). The ESP32 families keep their fixed reference.
- Library sensors, second round: each card tells only about the requests that were for it (two
  sensors), `SIM_LIBRARY_SHARED` for two at one place; Wire's AVR pull-ups (a 3.3 V I2C board on a
  UNO idles at about 3.68 V, `SIM_PIN_OVER_VDDIO`, a note) and `Wire.begin(sda, scl)` on an ESP32; a
  Bosch chip that lost its supply reads NaN until `begin()`; the start's rounds no longer use up the
  first DHT read; a DHT type not in the kit is told at run time; the regulated board in dropout is an
  info note; the cards give the sensors' response times; `setSampling` accepted (`SIM_PROGRAM_IGNORED`),
  `sensorID`, `takeForcedMeasurement`, `seaLevelForAltitude`, `convertCtoF`, `convertFtoC`.
- Programs: a comparison or a ternary of ints prints as an int; malformed input (`F()`, two values in
  a row, an object in a `#define`, an unclosed `{` in a `#define`) is `SIM_PROGRAM_ERROR` with its
  line; the generated code is strict (an undeclared name is an error, never a global; C's octal).

### Added

- Library-level climate sensors (sensors S6; `docs/en/library-sensors.md`): a board's program may
  declare `DHT dht(2, DHT11);`, `Adafruit_BME280 bme;` and `Adafruit_BMP280 bmp;` at the top level and
  call their usual methods (`readTemperature`, `readHumidity`, `computeHeatIndex`, `begin(addr)`,
  `readPressure` in Pa, `readAltitude`), plus `Wire.begin`, `isnan`, `NAN` and `F("…")`. The translator
  writes an object and its methods as numbers of its own table (`src/sim/libraries.js`), never as a
  member or a key; objects are capped (`LIMITS.libraryObjects`); `DHT22` is noted
  (`SIM_PROGRAM_NOT_IN_KIT`). A real DHT read waits 25 ms, a BME/BMP `begin()` 100 ms. A float prints
  with two decimals and `NaN` as `nan`.
- The `climate-sensor` type: `DHT11` (the usual 3-pin module, 10 kΩ pull-up), `BME280` (3.3 V only),
  `BME280-5V` (regulated) and `BMP280`. The board asks the sensor wired where the library looks (the
  sketch's pin, or its family's default I2C pins, through jumper wires: `I2C_PINS`), and the sensor's
  device answers from its carried state: the DHT11's 2 s cache and 1 s power-up, nearest whole numbers
  held to 0…50 °C and 20…90 %RH; the Bosch chips' 0.01 °C, 1 Pa and 0.01 %RH, address 0x76 or 0x77 and
  chip id (0x60, 0x58). Its card says what it would answer and why it did not (no power, warming up,
  another pin, swapped lines, another address or chip id). Up close with a symbol, an inside view and
  a legend. The engine hands every element to those that talk to others (`connect`).
- The environment's `pressure` (hPa, 300…1100 on the slider, default 1013.25), a barometer
  indicator and the altitude it means in its panel row.
- Recipes `uno-dht11`, `esp32-bme280`, `uno-bmp280-altitude`; the tour `uno-dht11`.

### Changed

- The compact catalog lists the recipes by group, names only (`basics`, `transistors`, `power`,
  `timing`, `op-amps`, `boards`, `sensors`, `sensor-modules`; a `group` in each recipe module, a test
  for a missing one): 4529 to 2825 characters in English. `catalog` with a recipe's name gives its
  title and group; the CLI `parts` still prints every title.

### Added

- Rotary encoder (sensors S7a; `docs/en/rotary-encoder.md`): the EC11 on its KY-040 module
  (`rotary-encoder`: pins `CLK`, `DT`, `SW`, `+`, `GND`, 10 kΩ pull-ups from `+`, a push switch) driven by
  the environment's `angle`. The target is snapped to the nearest click (18°) and the shaft, kept in the
  device's carried state, follows it at `speed` by the shortest arc; CLK and DT are contacts to ground
  in quadrature (clockwise: CLK first, DT a quarter of a cycle later), every edge within a step of
  its time while the shaft turns and across `engine.set` calls, with an optional deterministic
  `bounce`. `SIM_OVER_CURRENT` over 10 mA, `SIM_ENCODER_FLOATING` when `+` is not connected. Seen up
  close with a wheel, two fingers and a timing strip. Recipes `encoder-uno` and `encoder-dimmer-uno`,
  the example and tour `encoder-uno`.

### Added

- Emitters (sensors S7b; `docs/en/environment.md#emitters`): a part whose electrical state writes a
  field of the environment. A device declares `emits` and `emit(entry, reading)`; every sensor of that
  field sees the ambient value plus what the emitters add (a switch: either), and while the
  environment's `beam` is on the emitted light does not reach them (`blockedBy` in the registry). What
  a time step emits reaches the sensors in the next one; at the start, after a `set` and in DC the
  engine iterates until the emissions settle, and says `SIM_ENV_FEEDBACK` when a loop does not
  (8 rounds). An emitter in a circuit without `environment` is told (`ENV_EMITTER_ALONE`).
  `engine.ambient()` and `engine.emissions()`; an environment control's `emitted`; the panel's row says
  the share ("50 lx + 9.8 klx from LS1"), the indicator and a sensor's card show what the sensors see;
  `render-frames.js --parts` lists the emitters of each field.
- The KY-008 laser module (`laser`): a 650 nm laser diode behind 100 Ω between `S` and `−` (about
  28 mA and 3 mW at 5 V), lasing above 22 mA and adding 3.33·10⁶ lx/W of its optical power to
  `light` (a teaching simplification); `SIM_OVER_CURRENT` over 40 mA, `SIM_REVERSE_VOLTAGE` over 2 V in
  reverse, `SIM_LASER_DIM` under its threshold; its view up close (symbol, inside view with its
  mirrors, lens and beam, legend). Recipes `laser-tripwire` (an LDR-LM393 module and an NPN light an
  LED when the beam is cut) and `laser-uno` (a UNO blinks it at 1 Hz and prints a photoresistor on
  A0); the tour `examples/tours/laser-tripwire.json`. A pin may be written `−` for `-`.

### Added

- The HC-SR04 ultrasonic distance sensor and `pulseIn` (sensors S4; `docs/en/ultrasonic-sensor.md`,
  `docs/en/microcontrollers.md`): the type `ultrasonic-sensor` (part `HC-SR04`, pins VCC TRIG ECHO
  GND), standing on its four pins with its two capsules; its device is a state machine (TRIG high
  10 µs or more, a 250 µs burst, ECHO high for the round trip 2·d / v with v = 331.3 + 0.606·T,
  38 ms without an echo, 2 mA waiting and 15 mA measuring, no echo under 4.5 V) that reads the
  environment's `distance` and `temperature`. A board's program calls `pulseIn` and `pulseInLong`,
  which wait in simulated time and return whole microseconds (the timeout clamped to
  `LIMITS.pulseInMicros`, 3 s). Up close: symbol, inside view (the burst out, the echo back, the
  round trip) and legend. Recipes `uno-distance`, `esp32-distance` (a 1 kΩ / 2 kΩ divider brings
  ECHO's 5 V to 3.33 V for the 3.3 V pin) and `distance-alarm-uno`; the timeline
  `examples/tours/uno-distance.json`.

### Changed

- `engine.advance(h)` ends a step on each event an element names inside h (`until()`: a program
  waking from a delay, `pulseIn`'s timeout, a timed sensor's edge), at most 32 a call, so
  `delayMicroseconds(10)` is a 10 µs pulse on the pin and a program sees a sensor's edges at their
  time, without a finer step for the page (`uno-blink` stays at 1 000 steps a simulated second).

### Added

- Analog sensors (sensors S5; `docs/en/analog-sensors.md`): the **linear Hall sensor** 49E
  (`hall-sensor`: the `KY-035` module with pins `S + −` or the bare `49E` in a TO-92; ratiometric, half
  the supply plus 1.4 mV per gauss, clamped near the rails; it senses the environment's `field`) and the
  **voltage sensor module** (`voltage-sensor`, `VOLT-25V`: a 30 kΩ and 7.5 kΩ divider, 5:1; the screw
  terminal is two more pins, `VIN` and `GND`). Recipes `hall-linear-uno` and `voltage-sensor-uno`.
- The **KY-037** sound module, a ninth part number of `sensor-module` (an electret capsule: AO at half the
  supply, the signal's peak in the card and in the comparator, DO low above about 98 dB with the default
  trimmer; it senses `sound`). Recipes `clap-switch` and `sound-level-led`; the tour `clap-switch.json`.
- The **active buzzer** `TMB12A05`, a second part number of `buzzer` with its own device: silent under
  1.5 V, sounding at 2.3 kHz from 2.0 V across it (weakly on a 3.3 V pin, 19.8 mA) and taking 30 mA at 5 V, with a polarity. `rain-alarm`
  and `obstacle-buzzer` now use it through a PNP (they had a passive buzzer that only clicked).

### Changed

- `resolveRecipe` hands out a deep copy of the recipe's pieces (and takes a recipe name as a string): a
  caller that changes the circuit it got cannot change the recipe.
- `obstacle-buzzer` switches its buzzer with a PNP and a 1 kΩ base resistor (the LM393's output cannot
  carry an active buzzer's 30 mA); `rain-alarm` lost its series resistor.

## [0.10.0] - 2026-11-09

Sensors: a shared environment that every sensor reads, its panel and indicator, real sensor recipes, the LM393 modules, the PIR and touch modules.

### Added

- Ranges for the environment's slider and indicator (sensors S0b; `docs/en/environment.md`): a
  field of the circuit may declare `range: [min, max]` (`{ "distance": { "value": 30, "range": [2, 40] } }`),
  `page.controls` overrides it for one panel row, and a timeline's `gauge` takes `min` and `max`, so
  the needle crosses the dial for the values that matter (a hand from 30 to 5 cm hardly moved it on
  the default 2 to 400 cm). The indicator draws its dial between them and carries `data-pos` (0…1),
  `data-min` and `data-max` on its root; a panel row carries `data-min` and `data-max`. `check`
  reports `ENV_BAD_RANGE` and `TOUR_GAUGE_RANGE`; the tours of `obstacle-buzzer`, `ldr-comparator`,
  `lm35-comparator` and `environment` choose their ranges, and the `obstacle-buzzer` recipe declares
  its own.
- Recipes with real sensors (sensors S1; `docs/en/recipes.md`): `ldr-night-light` and
  `ldr-comparator` (a photoresistor switching an LED in the dark, with a transistor or an LM393),
  `lm35-comparator` (a temperature alarm), `ntc-follower` (an NTC divider through an LM358
  follower) and `thermistor-uno` (an Arduino UNO that prints °C from an NTC with the B equation).
  A recipe may now carry `environment` and `page`, copied into its circuit (also given beside a
  recipe, and in the MCP `layout` tool); these five declare the field they sense and its page
  control. Two tours, `ldr-comparator.json` and `lm35-comparator.json`. A board's program can call
  `log`.
- A timeline's `captionLines`: captions of 3 lines, with the oscilloscope and the circuit lower.
- Timed sensors (S3; `docs/en/timed-sensors.md`): the HC-SR501 PIR motion module (`pir-sensor`: 30 s
  warm-up, a delay, the H/L jumper, 2.5 s of rest) and the TTP223 touch module (`touch-sensor`:
  momentary or toggle, 220 or 60 ms response, 0.5 s of calibration) read the environment's `motion`
  and `touch`; their card says the phase and the time left, and up close a bar drains with it. A
  device lists the keys of its elements in `state` and `engine.set` carries them (a slider no
  longer restarts a timer); an element may give `maxStep()` and `span()` for the page's step and
  real-time pace. Recipes `pir-lamp`, `pir-uno`, `touch-toggle-led`, `touch-uno`; examples and tours
  `pir-lamp`, `touch-toggle-led`.
- The environment (sensors, S0; `docs/en/environment.md`): a circuit's `environment` (light,
  temperature, humidity, distance… 14 fields, each a value or a program: toggle, cycle, ramp,
  keyframes) that every sensor reads unless the part gives its own value. The thermistor, the
  photoresistor, the LM35 and the tilt switch follow it; their own control detaches them, and their
  card says which. `check` reports `ENV_*`. The engine's controls with the id `environment`,
  `engine.resume`, `engine.attach`, `engine.environment`; programs run on simulated time (in real
  time when nothing else in the circuit changes with time).
- The page's *Environment* section (`page.controls` entries `{ "environment": "light" }`, or all of
  it with `page.environment`), each field with its indicator (a gauge, a sun, a thermometer, a lamp;
  `page/client/gauge.js`) and *Pause* / *Resume* for a program; a sensor's card shows the indicator
  and *Follow the environment*.
- Timelines: `set` with `environment` (the indicator shows while it moves), the `gauge` step (the
  indicator in a corner of the video), `value` of `vout`; `render-frames.js --parts` lists the
  environment. Examples `environment.json`, `environment-cycle.json` and the tour
  `tours/environment.json`.
- LM393 sensor modules (`docs/en/sensor-modules.md`): one type, `sensor-module`, for eight part
  numbers on the usual comparator board (rain `MH-RD`, soil `YL-69`, light `LDR-LM393`, optical
  slot `SLOT-IR`, line follower `TCRT5000-M`, Hall `KY-024`, vibration `SW-420-M`, obstacle
  `FC-51`), standing on its pins with its element on top; simulated as its divider, trimmer
  (`threshold`), open-collector LM393, pull-up and LEDs, each element following the environment
  (the Hall switch with its hysteresis, the SW-420 in bursts). Up close with its symbol and inside
  view. The environment's `reflectance` and `beam`; a module's `A0`/`D0` read as its `AO`/`DO`; a recipe's
  `environment`. Recipes `rain-alarm`, `soil-led`, `light-switch-module`, `line-follower-uno`,
  `obstacle-buzzer`, `hall-counter-uno`; timelines `tours/soil-led.json` and
  `tours/obstacle-buzzer.json`.

### Changed

- The `soil-led` recipe puts its resistor between the LED and the module's DO: the part that
  shares DO's strip stands right behind the standing YL-69, and now that is the resistor, so the
  LED sits in view beside the module (same current, same circuit).
- The compact `catalog` groups part types by family (`family` in each type definition, `FAMILIES` in `parts/types/index.js`) and cuts a long list of part numbers to the first few with a count (`catalog name` has them all): and lists each recipe by name and title, without its values (`catalog` with the recipe's name gives them): about 3.3 KB instead of 5 KB, room for more types (budget 4600).
- A part's pin rows no longer jump while the camera moves: an arrangement holds while its pins stay
  lit, chosen with room for the push. The rows are in their own module, `page/client/pinout-rows.js`.
- The `mosfet-switch` and `npn-switch` recipes lay out with a clearance of 3, so their wires do not
  run into each other on screen.
- The READMEs' images drawn again with 0.9.1 (the shade of an LED that is off), the count of recipes
  (32) and the parts showcase's description with the new parts.

## [0.9.1] - 2026-11-04

Fixes found trying 0.9.0 on a phone and a tablet.

### Fixed

- **The part's view up close in the page**: Back is a short land of 350 ms (the part comes down its
  3 mm with the camera, the board already in place under a lightening veil) instead of the video's
  1.5 s, and entering takes 450 ms; the page's bar going or coming back no longer makes the drawing
  jump (`keepStill`: the view box keeps every point still on screen when the area changes), so the
  pinout's leaders are laid out on the final frame. A video's `land` is unchanged.
- **Lights follow the simulation at once**: LEDs and a 7-segment display's segments are painted on
  every frame (they lagged up to a quarter of a second, and a digit seemed to change in slow motion);
  PWM is still averaged, over the last 20 ms of simulated time.
- **An LED that is off**: its shade is the LED's own visible faces, so it sits exactly on the dome
  and flange (it overhung beside the flange).
- **The relay** sits on the table with its pins at its leads' ends, and its faces carry the print and
  the coil and contact diagram; **the motor's** pulley mark shows at all 16 angles.
- **Parts on one support keep their depth order** (the UNO's reset button was painted over its USB
  socket).
- **The 7-segment digit is drawn upright** on the case: the real 10° lean, added to the isometric
  skew, read as crooked (the inside view, face on, still leans).

## [0.9.0] - 2026-11-04

Every part type up close, seven parts a starter kit has, and a bridge rectifier that keeps running.

### Added

- **A part up close for every type** (`test/pinout.test.js` `COMPLETE`; only the wire, the
  development boards and pin headers stay pending, with their reasons): the text of each pin, the
  package's mark, a symbol and an inside view drawn from the simulation, with its legend, for the
  resistor, capacitor, inductor, diode, Zener, bridge rectifier, potentiometer, NTC thermistor,
  photoresistor, push button, switches, regulator, battery and buzzer. New mark kinds: `bands`,
  `either`, `knob`, `face`, `bevel`, `pairs`, `common`, `lead`, `plus`.
- **An RGB LED** (`rgb-led`, common cathode or anode) and **a one-digit 7-segment display**
  (`seven-segment`, 5161AS and 5161BS), one LED per chip or segment (device `LEDS`), each with its
  own stress (`D1.R`, `DS1.a`); recipes `uno-rgb-led` and `uno-seven-segment`.
- **A slide switch** (`slide-switch`, SS12D00G3), **a tilt switch** (`tilt-switch`, SW-520D) and
  **the LM35 temperature sensor** (`temperature-sensor`, 10 mV/°C, a temperature slider); recipes
  `slide-switch-leds`, `tilt-alarm` and `lm35-uno`.
- **A 5 V relay** (`relay`, SRD-05VDC-SL-C, beside the board): a coil with inductance, an armature
  with hysteresis and travel time, and the coil's kick when it is cut off without a diode
  (`SIM_RELAY_KICK`); recipe `relay-npn`.
- **A small DC motor** (`motor`, RE-140RA): back-EMF, inertia, friction and a load slider, its shaft
  a gyrator to a node whose voltage is its speed; start-up spike and stall (`SIM_MOTOR_STALL`);
  recipe `motor-npn`.

### Changed

- On a phone the page's pinout rows shrink together to 65 %, then a row still too long ends in "…",
  so none runs off the screen.

### Fixed

- **The live bridge rectifier no longer freezes** at its first zero crossing (9.85 ms): Newton
  accepts a solution whose every row balances once its updates stop shrinking, and
  `engine.advance(h)` splits a failed step instead of halving the step for good.
- The tests' throwaway repositories no longer inherit a git hook's variables (a commit from a linked
  worktree wrote into the real repository).

## [0.8.0] - 2026-11-03

A payoff the eye reads, and a video that opens on its result. Folds in the prereleases made on video
branches (0.8.0-b.1, c.1, c.2 and d.1); the fifth version of the same short was chosen, and this is
what it uses.

### Added

- **A recording's speed of time**: the timeline's `pace` (s of simulated time per s of video); the
  page, the oscilloscope, `compare`, the payoff, `timeline.json` (`pace`) and `render-frames.js
  --parts --pace` follow it.
- **The comparing box in words**: with an LED in the circuit it says the change as a proportion
  ("on ×5 · off the same"; `probe` `change`, `ratio` by default, `times` for the seconds), measured by
  `compareCycles`; laid out in bands, the name and the marks on plates on top, the trace in the
  middle, the change at the bottom in the accent. `probe` `reading` and `clock` leave out the value
  now and the window's end.
- **A comparing box in the timeline's own words** (`probe` `say`): `{k}` and `{k2}` filled from the
  simulation (how many times longer on, and off), so a script's sentence, checked with its other
  texts, replaces the kit's. Example `555-compare-say.json`.
- **A caption's emphasis** (`em`): words of its text or second line drawn bolder (700) and 15 %
  larger, in the caption's colour (the accent stays for data rows and traces); its contrast read in
  its own colour; `TOUR_EM_MISSING` when the words are not there.
- **Lines as laid out**: each caption's `lines` in `timeline.json` (counted by the bands of their
  boxes); a frame rule of two at most.
- `timeline.json` gives each LED's box on the frames measured at rest (`leds`), and an event per
  blink (`led`, with `part` and `on`) and per card (`card`), so a check of the video can read whether
  it blinks and a sound can go with each blink.
- **A pedestal's `light`**: `scene` with `light`, a soft glow of a colour under the part.
- **The current in two colours** (`flow`'s `sense`): the dots coloured by the way the current runs
  through a part (a capacitor's charge, forward; its discharge, back), each side with the parts whose
  nets carry it meanwhile; thicker and on the log scale. Tested (jsdom, golden frame M39) and
  documented; no published video uses it yet.
- **A card** (`card`): a sentence alone over the screen for a moment, within the safe width and the
  platforms' bands (a frame rule). Tested (golden frame M40) and documented; no published video uses
  it yet.
- Examples `555-result-first.json` (the result first on the board, then the chip on the pedestal)
  and `555-land-focus.json`. Golden frames M34 to M41.

### Changed

- An LED that is off is drawn dark: a shade over its dome and flange (`SHADE`, `shadeOps`), in the
  parts and in their copies, faded with its light in a page. Lit, it is drawn as before.
- The `data` row as large as the caption's text (56 px at 1080 wide, 52 at 1920); told labels at
  least 48 px (`LABEL_MIN_PX`).
- **A caption's lines rise fading in**, from 60 % of their height: no frame shows half a line cut by
  its mask. Golden frames M9, M12, M15, M23 and M34.
- A scene and a land may come after steps on the board.

### Fixed

- **A focus during a land waits for the board.** A `focus` at a `land`'s time ended the land: the
  focus's strips, their numbers and the part's label floated over the empty stage, the board's ramp
  never ran, and the scene stuck in `lit` hid the strips of every later focus. The land now keeps
  its scene and the focus; its strips and coordinates fade in over 300 ms (`LAND.reveal`) once the
  board is lit. Golden frame M37.
- The caption's contrast is not read while a caption comes in or the one before fades out over it
  (a false 2.8:1).

## [0.7.0] - 2026-11-03

### Added

- **A comparing oscilloscope**: `probe` with `"compare": true` keeps the cycles before a `set` as a
  faint ghost over what comes after and writes the change of period, from the simulation, once the set's control has arrived
  ("period 148 ms → 832 ms (×5.6)"); a mark's text sits on a halo over the trace; a `title` shows in a
  compact box, whose trace is thicker.
- **A pedestal that moves**: `scene` with `"enter": "drop"` (the part falls onto it) and `"push"` (a
  slow close-in until the next camera step).
- **A data row**: `caption` with `data`, for a value not already on screen ("1 kΩ → 100 kΩ"): sans,
  tabular figures, the accent, 44 px.
- **The payoff, measured**: `src/sim/cycle.js`; `render-frames.js --parts <circuit> --what-if
  R1.resistance=100000 [--json]` prints the cycles before and after a set in simulated s and s of
  video; `timeline.json` carries them (`payoff`); `TOUR_PAYOFF_SHORT` and `TOUR_SCOPE_WINDOW` warn when
  a timeline holds less than one whole cycle after a set.
- `timeline.json` lists the moments a sound may go with (`events`: land, count, probe, mark).
- Frame rules: the first frame shows the first moment, the caption's text within 90 px a side, its
  contrast at least 4.5:1 measured on the frame, the told label at least 40 px. Golden frames M30 to M33.
- Literata (SIL Open Font License, `src/page/fonts/`) embedded in pages with a tour, as the caption's serif.

### Changed

- A recording's first frame is its first moment's: steps of the first moment that set what is seen
  run at 0 as cuts, and the first caption is whole on frame 0.
- `land` brings the board in opaque, sliding up under a veil of the stage's colour, and lightens in
  a ramp of 700 ms once the camera has opened (no see-through layer, no flash).
- The caption is one block of one rank: `line` is drawn as `text` (its look as `--cap-line-*`
  variables), 90 px from each side, on a scrim of the stage's colour.
- A chip's marking reads left to right from the camera; a recording's told label is never under
  40 px at 1080.
- `examples/tours/555-what-if.json` uses the new options and holds one whole cycle after the set.

## [0.6.0] - 2026-11-02

### Added

- **The current on the focus**: `flow` with `"scope": "focus"` draws the current only on the nets of
  the parts in focus (their strips, jumpers and leads), the rest plain board under the veil; `style`
  (`plan` or `real`) in a timeline sets how a recording draws the layer.
- **A compact oscilloscope under the caption**: `probe` with `"place": "top"` puts the box between
  the caption and the circuit (28 % to 40 %), the circuit keeping its whole band, and
  `"size": "compact"` draws it without title or note, the value inside the trace.
- **`nudge`**: a part the voice names as a cause rises a little and comes back without taking the
  focus or the told label.
- The frame rules: the told part ends above 65 % of a vertical frame, and the oscilloscope's box never
  reaches into the caption (`RULES.vertical.told`, `RULES.vertical.scope`); `render-frames.js --parts`
  prints the frame's bands.
- `examples/tours/555-close.json` uses the four; golden frames M26 to M29.

### Changed

- Five example tours (`focus-led`, `focus-mosfet`, `focus-zener`, `mosfet-switch`,
  `zener-regulator`) frame their parts in focus, so the told part stays above 65 %.

## [0.5.0] - 2026-11-02

### Added

- **A video of a circuit can open on its main part alone**: `scene` on the pedestal and a `land` with
  the other parts already in their holes (no `assemble`) bring the board, lights, labels and current
  back as they were; the timeline guide says how to write it.
- **The oscilloscope shows a change**: a `probe` in a recording takes `window` (a fixed time axis,
  from t = 0 then scrolling) and `marks` (a dashed line with the control's new value at each `set`),
  so a set that slows a 555 reads as a longer tooth after the line. `render-frames.js --parts` prints
  the oscilloscope's default window and how fast simulated time runs.
- **A solid focus**: `focus` with `solid` draws the parts in focus whole over the current layer until
  the next focus, to point at the part a `set` changes.
- `examples/tours/555-what-if.json` uses the three; golden frames M24 and M25.

## [0.4.0] - 2026-11-01

### Added

- **A video about one part**: a timeline can put one part alone on a pedestal (`scene`), light its
  pins one by one with what each does and the package's orientation mark (`pin`), set it on a bench
  whose pads read the circuit (`bench`), draw its schematic symbol or a view of its inside beside it
  (`symbol`, `inside`), and bring the breadboard up under it (`land`) for the circuit to build itself
  around it. Four timelines (`focus-npn`, `focus-mosfet`, `focus-led`, `focus-555`) and a section of
  the video guide with the six beats and their rules; `--validate` names a pin, mark, symbol or inside
  view a part does not have.
- **The part up close in the page** (`page.focusView`): *See the part up close* in a part's card, with
  the same pins, bench, symbol and inside view behind two segmented controls, a legend for the inside
  view, and drag and zoom with the texts kept on the drawing.
- Every new part type comes with its view up close, or is listed as pending with a reason
  (`test/pinout.test.js`, `docs/en/adding-parts.md` §6).

### Fixed

- An LED on a bench keeps its light with the current layer on, and dims when its resistor grows.
- A bench's pad names the new value of the part its pin is joined to after a `set`.

## [0.3.1] - 2026-11-01

### Changed

- **A calmer landing** (`?director=landing`): its tour runs at 0.75, camera moves ease in and out,
  and at the end the camera glides back to the first frame and the current layer is turned off
  again and the controls it moved go back, so the loop has no jump and starts as it began; a
  landing frames a part without its label, so the part itself sits in the middle.

## [0.3.0] - 2026-10-31

### Added

- **`?director=landing`**: a live page with a tour as the background of a site's landing, dressed
  like a recording, framed closer, looping on its own clock and respecting reduced motion.
- **Live simulation in the page** (stage 3): the conductor view, current flowing along real paths,
  lit LEDs, sliders and buttons for the parts that can change, limits with three levels and a mark
  when a part was pushed past one, an oscilloscope in the part's card, a signal generator as a
  supply, probes on nodes, and a link that opens the circuit in Falstad's CircuitJS.
- **The user-experience pass**: gestures inside an embedded page, zoom buttons, full screen, theme
  tokens and a dark theme, the inspector, motion, larger tap targets for small parts.
- **Development boards**: ESP32 DevKit, ESP32-C3 SuperMini and Arduino UNO, drawn and simulated pin
  by pin, with their programs in Arduino's C++ subset (`.ino`), PWM, `tone` and the serial monitor.
- **More parts**: batteries beside the board, regulators (78xx, LM317, AMS1117 module), bridge
  rectifier, Zener diodes, op-amps and comparators, the NE555, inductors, NTC, LDR, buzzer,
  trimmer, headers, switches beside the board, the DESPI-C02 e-paper adapter.
- **`layout`**: a whole circuit placed by an algorithm from its parts and nets, on a board that grows
  in length; **recipes**: lesson circuits by name with only their values. Its second version takes
  the channel as the axis (parts split by side, scored candidates, jumpers by a spanning tree), is
  measured by a bench, and picks a **double breadboard** by itself when a development board would
  cover a pin's strip.
- **Stage and video**: deterministic frames of the live page, a director (`?director=1`) and tours
  (`page.tour`, a timeline JSON), the `stage` and `notebook` themes with a theme picker, the plan
  view of the current layer, moves (focus, insert, assemble, pulse, probe), `render-frames.js` and
  `assemble.js` for vertical and horizontal videos with subtitles, and a guide to make one.
- **Falstad export** of development boards and linear regulators as equivalents, and of any board's
  rails.
- **Publishing**: the READMEs with images drawn by the kit, a demo site on GitHub Pages, an index of
  the examples.
- **Repository tooling**: a rule and an attack test for external input, a stronger privacy scan,
  shared Claude Code settings, a dependency licence check, `npm run verify` with git hooks, lint,
  coverage, and CI on every push.

### Changed

- Node 22 or newer (Node 20 is out of support, and the page tests need Node 22).
- The command line refuses an unknown option or one without its value (exit 2).
- Every agent report ends in a `STATUS:` line.

### Fixed

- A board's program could run any JavaScript, and its `.ino` file could be read from outside the
  circuit's folder.
- `x / a[i]` with integers indexed the quotient in a board's program.

## [0.2.0] - 2026-10-13

### Added

- **Simulation**, DC and transient (stage 2): `simulate`, results drawn on the board
  (`render --sim`), values in the page.
- **The agent interface** (stage 1.5): operations with a dry run and history, queries, `suggest`,
  `review` with profiles, the MCP server and three agents.
- **An embeddable page** per circuit, rewritten with each change under the same name.
- Push button, potentiometer and DIP chips.

## [0.1.0] - 2026-10-12

### Added

- An isometric SVG of a breadboard circuit, with parts placed in real holes at real sizes, front and
  back views, checks of the placement, `inspect` and annotation layers (stage 1).

[Unreleased]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.12.1...HEAD
[0.12.1]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.11.1...v0.12.0
[0.11.1]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.11.0...v0.11.1
[0.11.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.9.1...v0.10.0
[0.9.1]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ccamilobedoya/protoboard-iso/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ccamilobedoya/protoboard-iso/releases/tag/v0.1.0
