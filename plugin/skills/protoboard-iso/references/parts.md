# What each part takes

<!-- generated: npm run parts-reference -- --write (from the kit's own data; do not edit) -->

For every part type: the fields a spec and a `set` operation take; then, for the type and each
part number, its pins, what a run changes on it (`kit simulate <folder> --run <s> --set
ID.field=value`, and the page's sliders; a single control can go as `--set ID=value`) and the
environment's fields it reads (`--env field=value`, or the circuit's `environment`). A field the
part gives itself wins over the environment. Ranges are what the kit accepts; units as printed.
`kit catalog <name>` says the same for one entry, with its limits.

## `resistor` · Resistor

- Fields (spec, or `set` in an operation): `value`: a resistance in ohms, such as 330, 4k7 or 1M · `tolerance`: "5%", "1%" · `bands`: 4 | 5 · `power`: "1/8", "1/4", "1/2", "1"; "3", "5", "10" draw a cement resistor
- No part number: pins `1`, `2`; while it runs: `resistance` 0.001 … 1e12 Ω; the slider 3.3 … 33000 Ω.
- What each pin does: 1 · by the first band; 2 · the other end.

## `capacitor` · Capacitor

- Fields (spec, or `set` in an operation): `value`: a capacitance in farads, such as 100n, 4u7 or 470u · `kind`: ceramic | electrolytic · `voltage`: electrolytic: rated volts · `diameter` · `height`
- No part number: pins `1`, `2`; nothing to change while it runs.
- What each pin does: 1 · one plate; 2 · the other plate.

## `potentiometer` · Potentiometer

- Fields (spec, or `set` in an operation): `value`: a resistance in ohms, such as 330, 4k7 or 1M · `style`: "knob" (default) | "trimmer" (multi-turn 3296W) · `position`: potentiometer wiper position
- No part number: pins `1`, `W`, `3`; while it runs: `position` 0 … 1, a share: 0.5 is half.
- What each pin does: 1 · one end of the track; W · wiper, slides on it; 3 · the other end.
- Position 0 puts the wiper (W) at pin 1 and 1 at pin 3: with pin 1 on the supply and pin 3 on ground, 0 gives W the whole voltage and 1 gives it 0 V.

## `diode` · Diode

- Fields (spec, or `set` in an operation): `part`: a part number below
- No part number, `1N4007`, `1N4148`, `1N5819`, `1N4001`, `1N4002`, `1N4003`, `1N4004`, `1N4005`, `1N4006`, `1N5399`, `1N5408`, `1N5822`, `FR107`, `FR207`: pins `A`, `K`; nothing to change while it runs.
- What each pin does: anode · current goes in; cathode · current comes out.

## `zener` · Zener diode

- Fields (spec, or `set` in an operation): `part`: a part number below · `value`: a Zener voltage from 0 to 200 V, such as 5V1 or 12
- No part number, `1N4728A`, `1N4729A`, `1N4730A`, `1N4731A`, `1N4732A`, `1N4733A`, `1N4734A`, `1N4735A`, `1N4736A`, `1N4737A`, `1N4738A`, `1N4739A`, `1N4740A`, `1N4741A`, `1N4742A`, `1N4743A`, `1N4744A`, `1N4745A`, `1N4746A`, `1N4747A`, `1N4748A`, `1N4749A`, `1N4750A`, `1N4751A`: pins `A`, `K`; nothing to change while it runs.
- What each pin does: anode · to the − side; cathode · held at Vz.

## `bridge` · Bridge rectifier

- Fields (spec, or `set` in an operation): `part`: a part number below
- No part number, `KBP2005`, `KBP201`, `KBP202`, `KBP204`, `KBP206`, `KBP207`, `KBP208`, `KBP210`, `KBP3005`, `KBP301`, `KBP302`, `KBP304`, `KBP306`, `KBP307`, `KBP308`, `KBP310`: pins `+`, `AC1`, `AC2`, `-`; nothing to change while it runs.
- What each pin does: + · DC out, to the load; ~1 · AC in; ~2 · AC in, the other end; − · DC back from the load.

## `led` · LED

- Fields (spec, or `set` in an operation): `color` · `size`: 3 | 5
- No part number: pins `anode`, `cathode`; nothing to change while it runs.
- What each pin does: anode · the + side, in; cathode · the − side, out.

## `mosfet` · MOSFET

- Fields (spec, or `set` in an operation): `part`: a part number below
- `IRLZ44N`, `IRF520`, `IRF9540`: pins `G`, `D`, `S`; nothing to change while it runs.
- `2N7000`: pins `S`, `G`, `D`; nothing to change while it runs.

## `bjt` · Bipolar transistor

- Fields (spec, or `set` in an operation): `part`: a part number below
- `2N2222A`, `2N3904`, `2N3906`, `2N2907A`, `S8050`, `S8550`, `S9012`, `S9013`, `S9014`, `S9015`, `S9018`, `2N5551`, `2N5401`: pins `E`, `B`, `C`; nothing to change while it runs.
- `BC547`, `BC557`, `BC548`, `BC549`, `BC550`, `BC558`, `BC337`, `BC327`, `BC517`: pins `C`, `B`, `E`; nothing to change while it runs.
- `C1815`, `A1015`: pins `E`, `C`, `B`; nothing to change while it runs.
- `TIP120`: pins `B`, `C`, `E`; nothing to change while it runs.

## `ic` · Integrated circuit

- Fields (spec, or `set` in an operation): `part`: a part number below · `package` · `pinNames` · `marking`. Only in a circuit written by hand: `pin1`
- `NE555`: pins `GND`, `TRIG`, `OUT`, `RESET`, `CTRL`, `THR`, `DIS`, `VCC`; nothing to change while it runs.
- `LM358`, `LM393`: pins `OUT1`, `IN1-`, `IN1+`, `GND`, `IN2+`, `IN2-`, `OUT2`, `VCC`; nothing to change while it runs.
- `74HC595`: drawn, not simulated: it gives no readings and no warnings, and a circuit with it ends `WARNINGS`; pins `QB`, `QC`, `QD`, `QE`, `QF`, `QG`, `QH`, `GND`, `QH'`, `SRCLR`, `SRCLK`, `RCLK`, `OE`, `SER`, `QA`, `VCC`.
- `CD4017`: drawn, not simulated: it gives no readings and no warnings, and a circuit with it ends `WARNINGS`; pins `Q5`, `Q1`, `Q0`, `Q2`, `Q6`, `Q7`, `Q3`, `VSS`, `Q8`, `Q4`, `Q9`, `CO`, `CE`, `CLK`, `MR`, `VDD`.
- `LM324`: pins `OUT1`, `IN1-`, `IN1+`, `VCC`, `IN2+`, `IN2-`, `OUT2`, `OUT3`, `IN3-`, `IN3+`, `GND`, `IN4+`, `IN4-`, `OUT4`; nothing to change while it runs.
- `UA741`: pins `NULL1`, `IN-`, `IN+`, `V-`, `NULL2`, `OUT`, `V+`, `NC`; nothing to change while it runs.
- `NE5532`: pins `OUT1`, `IN1-`, `IN1+`, `V-`, `IN2+`, `IN2-`, `OUT2`, `V+`; nothing to change while it runs.
- `LM386`: drawn, not simulated: it gives no readings and no warnings, and a circuit with it ends `WARNINGS`; pins `GAIN1`, `IN-`, `IN+`, `GND`, `OUT`, `VS`, `BYPASS`, `GAIN8`.
- `ULN2003`: drawn, not simulated: it gives no readings and no warnings, and a circuit with it ends `WARNINGS`; pins `IN1`, `IN2`, `IN3`, `IN4`, `IN5`, `IN6`, `IN7`, `GND`, `COM`, `OUT7`, `OUT6`, `OUT5`, `OUT4`, `OUT3`, `OUT2`, `OUT1`.
- `ULN2803`: drawn, not simulated: it gives no readings and no warnings, and a circuit with it ends `WARNINGS`; pins `IN1`, `IN2`, `IN3`, `IN4`, `IN5`, `IN6`, `IN7`, `IN8`, `GND`, `COM`, `OUT8`, `OUT7`, `OUT6`, `OUT5`, `OUT4`, `OUT3`, `OUT2`, `OUT1`.
- `PC817`: drawn, not simulated: it gives no readings and no warnings, and a circuit with it ends `WARNINGS`; pins `A`, `K`, `E`, `C`.

## `regulator` · Voltage regulator

- Fields (spec, or `set` in an operation): `part`: a part number below · `led`: regulator module (AMS1117): its power LED's resistor, "1k" (default), "200", or "none"
- `7805`, `7806`, `7808`, `7809`, `7810`, `7812`, `7815`, `7818`, `7824`: pins `IN`, `GND`, `OUT`; nothing to change while it runs.
- `LM317`: pins `ADJ`, `OUT`, `IN`; nothing to change while it runs.
- `AMS1117-3.3`, `AMS1117-5.0`: pins `IN`, `OUT`, `GND`; nothing to change while it runs.

## `button` · Push button

- Fields (spec, or `set` in an operation): `pressed`: button state · `color`
- No part number: pins `1`, `2`, `3`, `4`; while it runs: `pressed` on / off (held: `--press ID@t+dur`).
- What each pin does: 1 · joined to 2 inside; 2 · joined to 1 inside; 3 · joined to 4 inside; 4 · joined to 3 inside.
- Pins 1 and 2 are joined inside, and so are 3 and 4: the switch is between the two pairs, so a net on 1 (or 2) and a net on 3 (or 4) are joined while it is pressed.

## `wire` · Jumper wire

- Fields (spec, or `set` in an operation): `color` · `style`: "arc" | "flat" · `height`
- No part number: pins `1`, `2`; nothing to change while it runs.

## `battery` · Battery

- Fields (spec, or `set` in an operation): `format`: AA, AAA, 18650, 9V or pouch (LiPo) · `chemistry`: default by format (AA/AAA alkaline, 18650 li-ion, pouch lipo) · `cells`: cells (or 9 V blocks) in series; voltages add up · `charge`: state of charge, 0 empty … 1 full; without it, the nominal voltage · `capacity`: "2000 mAh" (a number is mAh); default by format · `voltage`: measured open-circuit volts (wins over charge) · `internalResistance`: ohms, for the whole pack · `switch`: a holder with a slide switch, and its position. Only in a circuit written by hand: `side`, `offset`
- No part number: pins `+`, `-`; while it runs: `charge` 0 … 1, a share: 0.5 is half.
- What each pin does: + · red lead, to the load; − · black lead, the return.

## `module` · Development board

- Fields (spec, or `set` in an operation): `part`: a part number below · `wires`: module UNO, switch, relay: colour of the lead of each pin, e.g. { "D13": "yellow" } · `rese`: module DESPI-C02: position of its RESE switch, ohms ("2.2" as sold, "0.47" for some panels) · `panel`: module DESPI-C02: also draw the 7.5" GDEY075T7 panel on its flat cable · `io`: module, microcontroller boards (ESP32 DevKit, ESP32-C3 SuperMini, UNO): the state of each GPIO for the simulation, by printed name, GPIO name or number ({"D13": "high", "D27": "input_pullup"}); unlisted pins are inputs · `usb`: module, microcontroller boards: powered by USB (default true): the board is a 5 V source and its regulator makes the 3.3 V rail · `program`: module, microcontroller boards: its program for the simulation, the Arduino C++ subset a lesson uses: the sketch's text, or the name of a .ino file beside the circuit ("blink.ino"); setup() once, then loop(); delay() waits in simulated time. Only in a circuit written by hand: `pin1`, `rowSpacing`, `side`, `offset`
- `ESP32-DEVKIT`: pins `EN`, `VP`, `VN`, `D34`, `D35`, `D32`, `D33`, `D25`, `D26`, `D27`, `D14`, `D12`, `D13`, `GND`, `VIN`, `3V3`, `GND2`, `D15`, `D2`, `D4`, `RX2`, `TX2`, `D5`, `D18`, `D19`, `D21`, `RX0`, `TX0`, `D22`, `D23`; nothing to change while it runs.
- `ESP32-C3-SUPERMINI`: pins `5V`, `GND`, `3V3`, `GPIO4`, `GPIO3`, `GPIO2`, `GPIO1`, `GPIO0`, `GPIO21`, `GPIO20`, `GPIO10`, `GPIO9`, `GPIO8`, `GPIO7`, `GPIO6`, `GPIO5`; nothing to change while it runs.
- `UNO`: pins `SCL`, `SDA`, `AREF`, `GND3`, `D13`, `D12`, `D11`, `D10`, `D9`, `D8`, `D7`, `D6`, `D5`, `D4`, `D3`, `D2`, `D1`, `D0`, `IOREF`, `RESET`, `3V3`, `5V`, `GND`, `GND2`, `VIN`, `A0`, `A1`, `A2`, `A3`, `A4`, `A5`; nothing to change while it runs.
- `DESPI-C02`: drawn, not simulated: it gives no readings and no warnings, and a circuit with it ends `WARNINGS`; pins `BUSY`, `RES`, `D/C`, `CS`, `SCK`, `SDI`, `GND`, `3.3V`.

## `switch` · Switch

- Fields (spec, or `set` in an operation): `style`: "rocker" (KCD1, default) | "latching" (7 × 7 push button) · `on`: on (rocker on I, latching button down); default off · `wires`: module UNO, switch, relay: colour of the lead of each pin, e.g. { "D13": "yellow" }. Only in a circuit written by hand: `side`, `offset`
- No part number: pins `1`, `2`; while it runs: `on` on / off.

## `inductor` · Inductor (coil)

- Fields (spec, or `set` in an operation): `value`: an inductance in henries, such as 10u, 100u or 1m · `dcr`: winding resistance, ohms · `current`: rated current, amperes
- No part number: pins `1`, `2`; nothing to change while it runs.
- What each pin does: 1 · by the first band; 2 · the other end.

## `thermistor` · NTC thermistor

- Fields (spec, or `set` in an operation): `value`: a resistance in ohms, such as 330, 4k7 or 1M · `beta`: B constant in kelvin (default 3950) · `temperature`: thermistor, temperature-sensor (LM35): °C for the simulation (default 25)
- No part number: pins `1`, `2`; while it runs: `temperature` -55 … 150 °C; the slider -20 … 100 °C; reads the environment's `temperature` in °C (`--env` -20 … 100 °C), unless the part gives its own value.
- What each pin does: 1 · one lead; 2 · the other lead.

## `ldr` · Photoresistor (LDR)

- Fields (spec, or `set` in an operation): `part`: a part number below · `light`: illuminance in lux for the simulation (default 100). Parts: GL5516, GL5528, GL5537, GL5539, GL5549
- No part number, `GL5516`, `GL5528`, `GL5537`, `GL5539`, `GL5549`: pins `1`, `2`; while it runs: `light` 0 … 1e6 lx; the slider 0.1 … 10000 lx; reads the environment's `light` in lx (`--env` 0.1 … 10000 lx), unless the part gives its own value.
- What each pin does: 1 · one lead; 2 · the other lead.

## `buzzer` · Buzzer

- Fields (spec, or `set` in an operation): `part`: a part number below · `resistance`: coil resistance (default 16 Ω)
- No part number, `TMB12A05`: pins `1`, `2`; nothing to change while it runs.
- What each pin does: + · under the + on top; − · the other lead.
- Pin 1 is + (under the + on top), pin 2 is −. With no part number it is the passive one: silent on steady DC (a button and a battery only heat its coil), it sounds with a square wave such as tone(); TMB12A05 is the active one, which sounds on steady DC, so a button that sounds a buzzer needs TMB12A05.

## `header` · Header pins

- Fields (spec, or `set` in an operation): `count`: number of pins (place with pin1) · `color`. Only in a circuit written by hand: `pin1`
- No part number: pins `1`, `2`, `3`, `4`; nothing to change while it runs.

## `rgb-led` · RGB LED

- Fields (spec, or `set` in an operation): `common`: the common pin (COM, the longest lead) is the chips' cathode (default) or their anode
- No part number: pins `R`, `COM`, `G`, `B`; nothing to change while it runs.
- What each pin does: R · red chip; common · the longest lead; G · green chip; B · blue chip.

## `seven-segment` · 7-segment display

- Fields (spec, or `set` in an operation): `part`: a part number below. Only in a circuit written by hand: `pin1`
- `5161AS`, `5161BS`: pins `e`, `d`, `COM1`, `c`, `DP`, `b`, `a`, `COM2`, `f`, `g`; nothing to change while it runs.

## `slide-switch` · Slide switch

- Fields (spec, or `set` in an operation): `part`: a part number below · `slid`: the knob slid over to pin 2's side (COM joined to 2); default false (COM joined to 1)
- No part number, `SS12D00G3`: pins `1`, `COM`, `2`; while it runs: `slid` on / off.
- What each pin does: 1 · to COM, knob at 1; COM · common, middle; 2 · to COM, knob at 2.

## `tilt-switch` · Tilt switch

- Fields (spec, or `set` in an operation): `part`: a part number below · `tilted`: tipped over past its angle (open); default false (upright, closed)
- No part number, `SW520D`: pins `1`, `2`; while it runs: `tilted` on / off; reads the environment's `tilt` (on / off), unless the part gives its own value.
- What each pin does: 1 · a lead; 2 · the other lead.

## `temperature-sensor` · Temperature sensor

- Fields (spec, or `set` in an operation): `part`: a part number below · `temperature`: thermistor, temperature-sensor (LM35): °C for the simulation (default 25)
- No part number, `LM35DZ`: pins `+VS`, `VOUT`, `GND`; while it runs: `temperature` -55 … 150 °C; the slider 0 … 100 °C; reads the environment's `temperature` in °C (`--env` -20 … 100 °C), unless the part gives its own value.
- `LM35CZ`: pins `+VS`, `VOUT`, `GND`; while it runs: `temperature` -55 … 150 °C; the slider 0 … 110 °C; reads the environment's `temperature` in °C (`--env` -20 … 100 °C), unless the part gives its own value.
- What each pin does: +VS · supply, 4–30 V; VOUT · 10 mV per °C; GND · ground, 0 V.

## `relay` · Relay

- Fields (spec, or `set` in an operation): `part`: a part number below · `wires`: module UNO, switch, relay: colour of the lead of each pin, e.g. { "D13": "yellow" }. Only in a circuit written by hand: `side`, `offset`
- `SRD-05VDC-SL-C`: pins `A1`, `A2`, `COM`, `NO`, `NC`; nothing to change while it runs.

## `motor` · DC motor

- Fields (spec, or `set` in an operation): `part`: a part number below · `load`: a load on its shaft in mN·m, against its turning (default 0); over its stall torque it holds the shaft still. Only in a circuit written by hand: `side`, `offset`
- No part number, `RE-140RA-12240`: pins `+`, `-`; while it runs: `load` 0 … 100 mN·m; the slider 0 … 3 mN·m.
- `RE-140RA-2270`: pins `+`, `-`; while it runs: `load` 0 … 100 mN·m; the slider 0 … 5 mN·m.
- What each pin does: + · red lead, by (+); − · black lead.

## `pir-sensor` · PIR motion sensor

- Fields (spec, or `set` in an operation): `delay`: seconds OUT stays high after motion (the trimmer Tx; default 5) · `sensitivity`: the sensitivity trimmer, 0…1 (default 0.5; the model has no range, so it only shows) · `mode`: "H" (default) motion during OUT high starts the delay again, "L" ignores it · `warmup`: seconds after power on with OUT low and motion ignored (default 30; 0 skips it) · `motion`: its own value of the environment field motion (a part that gives it does not follow the environment)
- No part number: pins `VCC`, `OUT`, `GND`; while it runs: `motion` on / off; `retrigger` on / off; `delay` 2.5 … 600 s; the slider 3 … 300 s; reads the environment's `motion` (on / off), unless the part gives its own value.
- What each pin does: VCC · supply, 4.5–20 V; OUT · 3.3 V while it sees motion; GND · ground, 0 V.

## `touch-sensor` · Touch sensor

- Fields (spec, or `set` in an operation): `mode`: "momentary" (default) SIG follows the touch, "toggle" each touch flips it · `activeLow`: SIG low while touched (or while a toggle is on); default false · `fast`: the 60 ms response instead of the 220 ms low-power one; default false · `touch`: its own value of the environment field touch
- No part number: pins `SIG`, `VCC`, `GND`; while it runs: `touch` on / off; `toggleMode` on / off; reads the environment's `touch` (on / off), unless the part gives its own value.
- What each pin does: SIG · the output, printed I/O; VCC · supply, 2–5.5 V; GND · ground, 0 V.

## `sensor-module` · Sensor module (LM393)

- Fields (spec, or `set` in an operation): `part`: a part number below · `threshold`: its trimmer, Vref = threshold · VCC (default 0.5); DO goes low while AO is under Vref · `wetness`: sensor-module MH-RD: its own share of the comb wet (0 dry … 1 all wet), instead of the environment's rain · `moisture`: sensor-module YL-69: its own soil moisture, %, instead of the environment's · `light`: sensor-module LDR-LM393: its own light, which wins over the environment's · `beam`: sensor-module SLOT-IR: its own beam, true (1) = something opaque in the slot, instead of the environment's · `reflectance`: sensor-module TCRT5000-M, FC-51: its own surface, % of white paper's reflectance (black ink 10), instead of the environment's · `distance`: sensor-module TCRT5000-M, FC-51, ultrasonic-sensor: its own distance to the surface or the object, cm, instead of the environment's · `field`: sensor-module KY-024, hall-sensor: its own magnetic field, G (+ a south pole at its face), instead of the environment's · `vibration`: sensor-module SW-420-M: its own vibration, true (1) = shaken, instead of the environment's · `transmittance`: sensor-module SLOT-IR: what reaches the receiver through the slot with the beam clear (default 1; paper about 0.3) · `slots`: sensor-module SLOT-IR: an encoder disc with this many slots, turned by the environment's angle · `duty`: sensor-module SLOT-IR with slots: the open share of each slot (default 0.5) · `seed`: sensor-module SW-420-M: the pattern of its chatter (default: from its id) · `sound`: sensor-module KY-037: its own sound level, dB SPL, instead of the environment's
- `MH-RD`: pins `VCC`, `GND`, `AO`, `DO`; while it runs: `threshold` 0 … 1, a share: 0.5 is half; `wetness` 0 … 1, a share: 0.5 is half; reads the environment's `rain` (on / off), unless the part gives its own value.
- `YL-69`: pins `AO`, `DO`, `GND`, `VCC`; while it runs: `threshold` 0 … 1, a share: 0.5 is half; `moisture` 0 … 100 %; reads the environment's `moisture` in % (`--env` 0 … 100 %), unless the part gives its own value.
- `LDR-LM393`: pins `DO`, `GND`, `VCC`; while it runs: `threshold` 0 … 1, a share: 0.5 is half; `light` 0 … 1e6 lx; the slider 0.1 … 10000 lx; reads the environment's `light` in lx (`--env` 0.1 … 10000 lx), unless the part gives its own value.
- `SLOT-IR`: pins `AO`, `DO`, `GND`, `VCC`; while it runs: `threshold` 0 … 1, a share: 0.5 is half; `beam` on / off; reads the environment's `beam` (on / off), unless the part gives its own value.
- `TCRT5000-M`: pins `AO`, `DO`, `GND`, `VCC`; while it runs: `threshold` 0 … 1, a share: 0.5 is half; `distance` 0 … 1000 cm; the slider 0 … 3 cm; `reflectance` 0 … 100 %; reads the environment's `distance` in cm (`--env` 2 … 400 cm), `reflectance` in % (`--env` 0 … 100 %), unless the part gives its own value.
- `KY-024`: pins `DO`, `VCC`, `GND`, `AO`; while it runs: `threshold` 0 … 1, a share: 0.5 is half; `field` -10000 … 10000 G; the slider -500 … 500 G; reads the environment's `field` in G (`--env` -500 … 500 G), unless the part gives its own value.
- `SW-420-M`: pins `DO`, `GND`, `VCC`; while it runs: `threshold` 0 … 1, a share: 0.5 is half; `vibration` on / off; reads the environment's `vibration` (on / off), unless the part gives its own value.
- `FC-51`: pins `OUT`, `GND`, `VCC`; while it runs: `threshold` 0 … 1, a share: 0.5 is half; `distance` 0 … 1000 cm; the slider 1 … 40 cm; `reflectance` 0 … 100 %; reads the environment's `distance` in cm (`--env` 2 … 400 cm), `reflectance` in % (`--env` 0 … 100 %), unless the part gives its own value.
- `KY-037`: pins `DO`, `VCC`, `GND`, `AO`; while it runs: `threshold` 0 … 1, a share: 0.5 is half; `sound` 0 … 140 dB; the slider 30 … 110 dB; reads the environment's `sound` in dB (`--env` 30 … 110 dB), unless the part gives its own value.

## `rotary-encoder` · Rotary encoder (KY-040)

- Fields (spec, or `set` in an operation): `part`: a part number below · `pulses`: pulses a turn; only 20 (the usual KY-040) is modelled · `detents`: clicks a turn; only 20 (the usual KY-040) is modelled · `speed`: degrees a second the shaft follows its target (default 360) · `bounce`: milliseconds of chatter at each change of CLK and DT, deterministic (default 0) · `pressed`: button state; its push switch is held down · `swPullup`: the 10 kΩ from + to SW is on the module (default true; some clones omit it) · `angle`: its own target angle, degrees (snapped to the nearest click), instead of the environment's
- No part number, `KY-040`: pins `CLK`, `DT`, `SW`, `+`, `GND`; while it runs: `angle` 0 … 360 °; `pressed` on / off (held: `--press ID@t+dur`); reads the environment's `angle` in ° (`--env` 0 … 360 °), unless the part gives its own value.
- What each pin does: CLK · channel A, low while its contact is closed; DT · channel B, a quarter cycle after A turning clockwise; SW · the push switch, low while pressed; + · supply of the pull-ups, 3.3–5 V; GND · ground, 0 V.

## `laser` · Laser module

- Fields (spec, or `set` in an operation): `part`: a part number below
- No part number, `KY-008`: pins `S`, `+`, `−`; nothing to change while it runs.
- What each pin does: S · the laser diode's +, through 100 Ω; + · not connected on the board; − · the diode's cathode, to ground.

## `ultrasonic-sensor` · Ultrasonic distance sensor

- Fields (spec, or `set` in an operation): `part`: a part number below · `distance`: sensor-module TCRT5000-M, FC-51, ultrasonic-sensor: its own distance to the surface or the object, cm, instead of the environment's · `temperature`: the air's, which sets the speed of sound (default 20)
- No part number, `HC-SR04`: pins `VCC`, `TRIG`, `ECHO`, `GND`; while it runs: `distance` 0 … 1000 cm; the slider 2 … 400 cm; reads the environment's `distance` in cm (`--env` 2 … 400 cm), `temperature` in °C (`--env` -20 … 100 °C), unless the part gives its own value.
- What each pin does: VCC · supply, 5 V; TRIG · a 10 µs pulse starts it; ECHO · high for the round trip; GND · ground, 0 V.

## `hall-sensor` · Linear Hall sensor

- Fields (spec, or `set` in an operation): `part`: a part number below · `field`: sensor-module KY-024, hall-sensor: its own magnetic field, G (+ a south pole at its face), instead of the environment's
- No part number, `KY-035`: pins `S`, `+`, `-`; while it runs: `field` -10000 … 10000 G; the slider -500 … 500 G; reads the environment's `field` in G (`--env` -500 … 500 G), unless the part gives its own value.
- `49E`: pins `VCC`, `GND`, `OUT`; while it runs: `field` -10000 … 10000 G; the slider -500 … 500 G; reads the environment's `field` in G (`--env` -500 … 500 G), unless the part gives its own value.
- What each pin does: S · output, half the supply with no magnet; + · supply, 2.7–6.5 V; − · ground, 0 V.

## `voltage-sensor` · Voltage sensor module

- Fields (spec, or `set` in an operation): `part`: a part number below
- No part number, `VOLT-25V`: pins `S`, `+`, `-`, `VIN`, `GND`; nothing to change while it runs.
- What each pin does: S · a fifth of the input voltage; + · not connected inside; − · ground, joined to the terminal's GND; VIN · the terminal's positive contact, the voltage to measure; GND · the terminal's negative contact, joined to −.

## `climate-sensor` · Climate sensor (library)

- Fields (spec, or `set` in an operation): `part`: a part number below · `temperature`: its own temperature, instead of the environment's · `humidity`: its own relative humidity, %RH, instead of the environment's · `pressure`: climate-sensor BME280, BME280-5V, BMP280: its own air pressure, hPa, instead of the environment's · `warmup`: climate-sensor DHT11: seconds after power before a good read (default 1, at most 60) · `address`: climate-sensor BME280, BME280-5V, BMP280: its I2C address, 0x76 (118, the default: SDO to ground) or 0x77 (119)
- `DHT11`: pins `S`, `+`, `−`; while it runs: `temperature` -55 … 150 °C; the slider -20 … 100 °C; `humidity` 0 … 100 %RH; reads the environment's `temperature` in °C (`--env` -20 … 100 °C), `humidity` in %RH (`--env` 0 … 100 %RH), unless the part gives its own value.
- `BME280`, `BME280-5V`: pins `VCC`, `GND`, `SCL`, `SDA`; while it runs: `temperature` -55 … 150 °C; the slider -20 … 100 °C; `humidity` 0 … 100 %RH; `pressure` 0 … 1500 hPa; the slider 300 … 1100 hPa; reads the environment's `temperature` in °C (`--env` -20 … 100 °C), `humidity` in %RH (`--env` 0 … 100 %RH), `pressure` in hPa (`--env` 300 … 1100 hPa), unless the part gives its own value.
- `BMP280`: pins `VCC`, `GND`, `SCL`, `SDA`; while it runs: `temperature` -55 … 150 °C; the slider -20 … 100 °C; `pressure` 0 … 1500 hPa; the slider 300 … 1100 hPa; reads the environment's `temperature` in °C (`--env` -20 … 100 °C), `pressure` in hPa (`--env` 300 … 1100 hPa), unless the part gives its own value.
