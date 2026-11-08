# Examples

*[Español](README.es.md)*

Circuit files to read, copy and change. The ones with a source (a supply, a battery or a board on
USB) also run in the [live demo](https://ccamilobedoya.github.io/protoboard-iso/).

```bash
node bin/protoboard-iso.js check examples/led-resistor.json        # what is connected, and any problem
node bin/protoboard-iso.js render examples/led-resistor.json -o led.svg --fit parts
node bin/protoboard-iso.js page examples/led-resistor.json -o led.html   # the live page
npm run examples                                                   # every example → examples/out/ (index.html)
```

## Three ways to describe a circuit

| How | When | Example |
|---|---|---|
| **By hand**: every part with its holes (`pins`) | You want each hole exactly where it is on your board | [`led-resistor.json`](led-resistor.json) |
| **Layout**: parts without holes and the nets that join them; `layout` places and wires them | Another new circuit | [`layout/regulator-led.json`](layout/regulator-led.json): `node bin/protoboard-iso.js layout my-regulator examples/layout/regulator-led.json` |
| **Recipe**: a usual lesson circuit by name, only the values that change | The circuit is one of the [37 recipes](../docs/en/recipes.md) | `node bin/protoboard-iso.js layout my-divider --recipe divider --values '{"R2":"4k7"}'` |

The format of each field: [circuit-format.md](../docs/en/circuit-format.md).

## First steps

| | |
|---|---|
| <img src="../docs/img/examples/led-resistor.png" width="280" alt="LED with a resistor"> | **[led-resistor.json](led-resistor.json)**: an LED with its current-limiting resistor on 5 V. The smallest circuit with a simulation; the README's pictures are drawn from it. |
| <img src="../docs/img/examples/voltage-divider.png" width="280" alt="Voltage divider"> | **[voltage-divider.json](voltage-divider.json)**: two 10 kΩ resistors split 9 V in half; the page shows the voltage where they meet. |
| <img src="../docs/img/examples/controls-and-ics.png" width="280" alt="Buttons, potentiometers and chips"> | **[controls-and-ics.json](controls-and-ics.json)**: push buttons across the centre channel, potentiometers and DIP chips (NE555, LM358) placed by their pin 1. Drawing only, no source. |
| <img src="../docs/img/examples/npn-switch.png" width="280" alt="NPN transistor switch"> | **[npn-switch.json](npn-switch.json)**: the `npn-switch` recipe as laid out, with a tour ([tours/npn-switch.json](tours/npn-switch.json)): *See how it works* in the page's ⋯ menu presses S1 and follows the current to the LED. |

## Power

| | |
|---|---|
| <img src="../docs/img/examples/battery-regulator.png" width="280" alt="9 V battery, 7805 regulator and an LED"> | **[battery-regulator.json](battery-regulator.json)**: a 9 V battery beside the board, a 7805 regulator with its capacitors and an LED. Batteries: chemistry, cells in series, state of charge. |
| <img src="../docs/img/examples/half-wave-rectifier.png" width="280" alt="Half-wave rectifier"> | **[half-wave-rectifier.json](half-wave-rectifier.json)**: one diode and a filter capacitor fed by a 50 Hz signal generator; the oscilloscope shows the ripple. |
| <img src="../docs/img/examples/rectifier.png" width="280" alt="Bridge rectifier"> | **[rectifier.json](rectifier.json)**: a bridge rectifier, a filter capacitor, a 5 W cement resistor as the load and an LED. |
| <img src="../docs/img/examples/switches.png" width="280" alt="Switches off the board"> | **[switches.json](switches.json)**: a rocker switch on alligator clips and a latching switch, off the board; *On/Off* in the page. |
| <img src="../docs/img/examples/layout-regulator-led.png" width="280" alt="5 V regulator with a pilot LED"> | **[layout/regulator-led.json](layout/regulator-led.json)**: a layout spec (parts and nets only): a 7805 and a pilot LED. |
| <img src="../docs/img/examples/layout-two-rail-supply.png" width="280" alt="Two-rail supply"> | **[layout/two-rail-supply.json](layout/two-rail-supply.json)**: a layout spec: 12 V through a protection diode and a power switch, a 7805 to 5 V, then an AMS1117 to 3.3 V, each with a pilot LED. |

## Signals in time

| | |
|---|---|
| <img src="../docs/img/examples/rc-square-wave.png" width="280" alt="RC with a square wave"> | **[rc-square-wave.json](rc-square-wave.json)**: a resistor and a capacitor charged by a square wave; compare the time constant with the period on the oscilloscope. |

## Sensors and the environment

| | |
|---|---|
| <img src="../docs/img/examples/environment.png" width="280" alt="Light and temperature sensors reading the environment"> | **[environment.json](environment.json)**: a photoresistor into an LM393 comparator that lights an LED in the dark, an NTC divider and an LM35, all reading the circuit's shared environment (light and temperature in the page's *Environment* panel, each with its indicator); a tour ([tours/environment.json](tours/environment.json)) dims the light and warms the room. See [environment.md](../docs/en/environment.md). |
| <img src="../docs/img/examples/environment-cycle.png" width="280" alt="The same circuit with the light in a cycle"> | **[environment-cycle.json](environment-cycle.json)**: the same circuit with the light in a slow cycle (a sine from 5 to 2000 lx every 8 s): the LED lights while it is dark; *Pause* and *Resume* in the panel. |

## Microcontrollers

| | |
|---|---|
| <img src="../docs/img/examples/esp32-led.png" width="280" alt="ESP32 lighting an LED"> | **[esp32-led.json](esp32-led.json)**: an ESP32 DevKit over the centre channel lights an LED from D13 (the pin's state set in `io`). On USB it is the source. |
| <img src="../docs/img/examples/esp32-two-boards.png" width="280" alt="ESP32 across two breadboards"> | **[esp32-two-boards.json](esp32-two-boards.json)**: an ESP32 DevKit with nets on both pin headers, laid out on two breadboards side by side (board `double`), across the joint, so each header keeps a free strip: an LED on D4, a button on D15, a potentiometer on D34. Made by `layout` from [layout/esp32-both-headers.json](layout/esp32-both-headers.json). |
| <img src="../docs/img/examples/uno-led.png" width="280" alt="Arduino UNO lighting an LED"> | **[uno-led.json](uno-led.json)**: an Arduino UNO beside the board, Dupont leads to an LED on D13. |
| <img src="../docs/img/examples/epaper-esp32.png" width="280" alt="ESP32 with an e-paper panel"> | **[epaper-esp32.json](epaper-esp32.json)**: an ESP32 driving a 7.5" e-paper panel through the DESPI-C02 adapter. |

Programs (Arduino sketches that run in the simulation) are in the microcontroller recipes:
[microcontrollers.md](../docs/en/microcontrollers.md).

## The catalog

| | |
|---|---|
| <img src="../docs/img/examples/parts-showcase.png" width="280" alt="Every part in the kit"> | **[parts-showcase.json](parts-showcase.json)**: resistors (5 % and 1 %), diodes, LEDs (one RGB), capacitors, transistors, an AMS1117 module, a 7-segment display, slide and tilt switches, an LM35, and beside the board a relay and a DC motor, with jumpers. Its notes about unconnected pins are expected. |
| <img src="../docs/img/examples/more-parts.png" width="280" alt="More parts"> | **[more-parts.json](more-parts.json)**: trimmer, Zener, inductor, thermistor, LDR, buzzer, header, LM324, LM317, PC817 and lithium cells. |

## Wrong on purpose

| | |
|---|---|
| <img src="../docs/img/examples/common-mistakes.png" width="280" alt="Common breadboard mistakes"> | **[common-mistakes.json](common-mistakes.json)**: **this circuit is wrong on purpose.** Each part makes a usual mistake, and `check` reports every one: two leads in one hole, a resistor shorted along one strip, a transistor with its three pins in one strip, a button that is always closed, leads too close for the body. Run `node bin/protoboard-iso.js check examples/common-mistakes.json` and compare. |

## Adding an example

A new example is a circuit file here that `check` passes (unless it shows mistakes on purpose)
with a `title` in English and Spanish. Then `node scripts/readme-images.js examples/` draws its
thumbnail, and it gets a row in this file and in [README.es.md](README.es.md).
