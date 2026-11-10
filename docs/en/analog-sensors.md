# Analog sensors: a linear Hall sensor and a voltage sensor module

*[Español](../es/sensores-analogicos.md)*

Some sensors answer with a **voltage that follows what they sense**, not with a yes or no: the
`hall-sensor` (a 49E, bare or on its KY-035 module) and the `voltage-sensor` module. A board reads
them with its ADC (`analogRead`). They are two types of the sensor family, not modules on the LM393
board ([sensor-modules.md](sensor-modules.md)): there is no comparator, no trimmer, no DO.

The code: `src/parts/types/analog-sensors.js` (the types), `src/sim/devices/hall-sensor.js` and
`voltage-sensor.js` (the simulation; the constants are `HALL_LINEAR` and `VOLTAGE_SENSOR` in
`src/sim/models.js`), `src/parts/packages/sensor-module.js` (the KY-035 and the voltage sensor are
its `bare` boards) and the TO-92 package (the bare 49E). Recipes: `hall-linear-uno`,
`voltage-sensor-uno` ([recipes.md](recipes.md)).

## The linear Hall sensor

```json
{ "id": "U1", "type": "hall-sensor", "part": "KY-035" }
{ "id": "U1", "type": "hall-sensor", "part": "49E", "field": 100 }
```

| Part | Pins | What it is |
|---|---|---|
| `KY-035` (default) | `S`, `+`, `−` | the 49E on a small board with three pins |
| `49E` | `VCC`, `GND`, `OUT` | the bare chip in a TO-92, pins seen from the flat face |

Either spelling of a pin finds it (`OUT` is `S`, `VCC` is `+`, `GND` is `−`), only on this type.

The output is half the supply plus a term that follows the field:

```text
Vout = Vs / 2 + 1.4 mV/G · (Vs / 5 V) · field          held inside [0.95 V, Vs − 0.95 V]
```

- With no magnet it is **half the supply**: 2.5 V at 5 V. A south pole facing the marked face
  (positive `field`, in gauss) raises it, a north pole lowers it. +100 G gives 2.640 V at 5 V; +1500 G
  hits the clamp at 4.05 V.
- It is **ratiometric**: the zero (Vs / 2) *and* the sensitivity scale with the supply. At 3.3 V,
  +100 G gives 1.742 V. A board whose ADC reference is its own supply (an UNO's 5 V, an ESP32's 3.3 V)
  reads the same fraction either way, which is why the sketch of `hall-linear-uno` works on both
  after changing only the supply it assumes.
- The output sits behind 50 Ω and is current-limited at about 5 mA (the class is good for ±1.5 mA); the chip takes about 6 mA from the supply, so a short on the output draws about 11 mA and never makes the supply current negative. The linear range
  is about ±650 G; the slider shows ±500 G, the field may be typed up to ±10 000 G.
- It senses the environment's `field` ([environment.md](environment.md)); a `field` on the part wins.

Limits and notes: `SIM_IC_SUPPLY` over 8 V (the sheets give no absolute maximum: the kit's figure),
`SIM_REVERSE_VOLTAGE` reversed (the chip is off then: its output stays at ground), `SIM_MODULE_LOW_SUPPLY` under the 2.7 V it is specified from (the
note every sensor uses), `SIM_HALL_LOAD` (a note) when more than 1.5 mA is taken from the output, `SIM_OVER_CURRENT`
when the output is asked for more than its 5 mA limit (what a 50 Ω would carry, before the limit: a short asks for 50 mA), and
`SIM_HALL_HIGH_SUPPLY` (a note) between 6.5 V, the end of its operating range, and the 8 V of the warning.
The card shows the field, the output, the supply, the current VOUT gives and the chip's own.

## Reading them with `analogRead`

An ADC turns a voltage into a number, a fraction of its reference:

- **5 V board** (UNO): `analogRead` is 0…1023 for 0…5 V, so 1.4 mV per gauss is 0.29 counts per gauss.
  `volts = reading * 5.0 / 1023.0`, then `(volts − 2.5) / 0.0014` is the field in gauss.
- **3.3 V board** (ESP32, 12 bits): 0…4095 for 0…3.3 V, the sensor must be powered from the 3.3 V
  rail so its output stays inside the pin's range. The zero is 1.65 V and the sensitivity 0.924 mV per
  gauss: `(volts − 1.65) / 0.000924`.

Powering a 49E from 5 V into a 3.3 V board's pin puts up to 4 V on it: the board's own check
(`SIM_PIN_OVERVOLTAGE`) says so.

## The voltage sensor module

```json
{ "id": "U2", "type": "voltage-sensor" }
```

Part `VOLT-25V`: a **5:1 divider**, 30 kΩ from the input terminal to `S` and 7.5 kΩ from `S` to
ground, so `S = VIN / 5` and an input of up to 25 V gives at most 5 V. On the board's header it
prints `S`, `+` and `−`; the `+` pin is **not connected inside**. The measured voltage goes to a
screw terminal: here the terminal's two contacts are two more pins, `VIN` and `GND`, in the same
row (a wire each; an off-board terminal that takes wires is a later improvement). `−` and `GND` are
the same copper trace (a milliohm between them in the model).

- 12 V in gives 2.40 V at `S` and 0.32 mA from the input (VIN over 37.5 kΩ); 25 V gives 5.00 V.
- `S` has an output resistance of 6 kΩ (30 kΩ ∥ 7.5 kΩ): the ratio is exactly 5 only into a
  high-impedance reader. An ADC that loads it (an ESP32's sampling capacitor) reads a little low.
- `SIM_OVER_POWER` on the 30 kΩ over 100 mW (a 68 V input). Whatever `S` reaches over a board's supply
  is that board's check (`SIM_PIN_OVERVOLTAGE`): 25 V in puts 5 V on a 3.3 V board's pin.
  Over the 25 V printed on the module a note (`SIM_VOLTAGE_SENSOR_RANGE`) says it is out of its range: 40 V in
  gives 8 V on `S`.

The card shows the input, `S`, the ratio and the input current. The recipe multiplies the reading by
five to give the volts.
