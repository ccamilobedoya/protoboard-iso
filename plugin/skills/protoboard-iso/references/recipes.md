# Recipes

A recipe is a lesson circuit the kit already knows: proven parts, nets and supply, laid out ready
(`STATUS: DONE`) in one call. Give its name and only what changes, by id:

```bash
kit layout circuits/switch --recipe npn-switch --values '{"R1": "470", "D1": "green", "V1": 9}'
```

With the connector's tools: `layout` with `{"target": "switch", "recipe": "npn-switch", "values": {…}}`.

| Recipe | What it is |
|---|---|
| `led-resistor` | LED with its series resistor |
| `divider` | two resistors, the output where they meet |
| `npn-switch` | button → base resistor → NPN transistor switching an LED |
| `potentiometer-led` | potentiometer's wiper dimming an LED |
| `mosfet-switch` | button → logic-level MOSFET switching an LED, with a gate pull-down |
| `button-pullup`, `button-pulldown` | button with a pull-up / pull-down, an LED showing the output |
| `rc-square` | RC charged by a square wave (see τ against the period) |
| `555-astable` | NE555 blinking an LED |
| `regulator-7805`, `regulator-ams1117` | linear regulator with an LED on its output |
| `bridge-rectifier` | bridge, filter capacitor and an LED, from a sine on the top rails |
| `zener-regulator` | Zener and its series resistor holding a load |
| `esp32-led`, `esp32-button` | ESP32 DevKit blinking an LED (D13) / reading a button (D27), with their program |
| `uno-blink`, `uno-button`, `uno-pot-pwm` | Arduino UNO: blink, a button lights an LED, a potentiometer dims an LED (ADC, PWM) |
| `uno-rgb-led`, `uno-seven-segment` | Arduino UNO: an RGB LED mixing colours with PWM; a 7-segment display counting 0–9 |
| `slide-switch-leds`, `tilt-alarm` | a slide switch choosing one of two LEDs; a tilt switch lighting an LED when tipped over |
| `lm35-uno` | Arduino UNO reading an LM35 temperature sensor, °C on the serial monitor |
| `pir-lamp`, `pir-uno` | a PIR motion module lighting an LED through an NPN after its delay; a UNO printing the time of each motion |
| `touch-toggle-led`, `touch-uno` | a TTP223 touch module in toggle mode flipping an LED from its I/O pin; a UNO printing TOUCH and RELEASE |
| `relay-npn`, `motor-npn` | a button → NPN → relay coil with its flyback diode, the contact lighting an LED; a potentiometer setting a DC motor's speed through a TIP120 |
| `c3-blink`, `c3-pot-pwm` | ESP32-C3 SuperMini: blink, a potentiometer dims an LED (ADC, PWM) |
| `opamp-comparator`, `lm393-comparator` | potentiometer against a reference, an LED on the output (LM358; LM393 open collector) |
| `opamp-follower` | LM358 copying a potentiometer and driving an LED |
| `ldr-night-light`, `ldr-comparator` | a photoresistor (reads the environment's `light`) switching an LED in the dark: with a transistor / with an LM393 and a reference |
| `lm35-comparator`, `ntc-follower`, `thermistor-uno` | temperature from the environment: an LM35 against a reference with an alarm LED; an NTC divider through an LM358 follower; an NTC read by an Arduino UNO that prints °C |
| `opamp-noninverting`, `opamp-inverting` | LM358 amplifiers, gain from R1 and R2, a sine from the generator |
| `rain-alarm`, `soil-led`, `light-switch-module`, `obstacle-buzzer` | LM393 sensor modules (rain, soil, light, obstacle) whose DO drives a buzzer or an LED |
| `line-follower-uno`, `hall-counter-uno` | Arduino UNO reading a TCRT5000 line follower; counting a magnet's passes with a KY-024 |
| `encoder-uno`, `encoder-dimmer-uno` | a KY-040 rotary encoder on a UNO counting clicks (CLK falls, DT gives the direction); the same dimming a LED with the count |
| `laser-tripwire`, `laser-uno` | a KY-008 laser whose light reaches every light sensor (an emitter): a tripwire with an LDR-LM393 module; a UNO blinking it and reading a photoresistor |
| `uno-distance`, `esp32-distance`, `distance-alarm-uno` | an HC-SR04 ultrasonic module read with `pulseIn` (the environment's `distance`): on an UNO; on an ESP32 with a divider on ECHO; with an LED under 15 cm |
| `hall-linear-uno`, `voltage-sensor-uno` | Arduino UNO reading analog sensors on A0: a KY-035 linear Hall sensor (gauss), a voltage sensor module measuring a 9 V supply |
| `clap-switch` | A KY-037 sound module: an Arduino UNO toggling an LED at each clap, whichever way DO moves |
| `uno-dht11`, `esp32-bme280`, `uno-bmp280-altitude` | climate sensors read through their library (the environment's `temperature`, `humidity`, `pressure`): a DHT11 on an UNO; a BME280 on an ESP32's I2C; a BMP280 on an UNO's 3.3 V printing the altitude |

- **values**: the main field by id (`"R1": "470"`, `"D1": "green"`, `"Q1": "BC547"`, `"V1": 9`) or
  some fields (`"R1": {"value": "470", "tolerance": "1%"}`). Only the ids a recipe lists can change,
  some within choices or a range: `kit catalog` lists every recipe name by group, `kit catalog
  <recipe>` shows its title, values with defaults, parts, nets and limits. An id the recipe does not
  list, a value outside its choices or range, or a value the kit cannot read (`"R1": "abc"`, a
  colour there is none of), is a `FIX_SPEC` that says what is accepted (a resistance such as `330`
  or `4k7`); nothing is built.
- `title`, `board`, `clearance`, `netLabels`, `page` and `lang` may be given beside the recipe (in a
  spec file with `"recipe"`). Never `parts` or `nets`: to add to a recipe circuit, call `layout` on
  it again with the full parts and nets ([spec.md](spec.md)).
