# Six chips: how to wire them so they work

The kit simulates the 74HC595, the CD4017, the ULN2003, the ULN2803, the PC817 and the LM386. For
each: its pins, what the kit models and its limits (as `kit catalog <part>` prints them), the wiring a
beginner gets wrong, and a worked spec that `layout` builds to `STATUS: DONE`. A pin left out of the
nets is open: on the 74HC595 and the CD4017 an open input is a ⚠ (the kit reads it low), so tie
every control input to a rail. A chip whose supply pins are not wired is a ⚠ too ("has no supply").

## 74HC595 shift register: eight outputs from three board pins

<!-- generated: 74HC595 (npm run parts-reference -- --write) -->
- Pins, from pin 1 round the chip (`kit catalog 74HC595`): `QB` `QC` `QD` `QE` `QF` `QG` `QH` `GND` `QH'` `SRCLR` `SRCLK` `RCLK` `OE` `SER` `QA` `VCC`
- Simulated: SRCLK shifts SER in at QA, SRCLR clears the register, RCLK copies it to the outputs, OE high leaves them open, QH' chains a second chip; inputs high above 0.7·VCC and low under 0.3·VCC; each output 30 Ω to VCC or 25 Ω to GND (6 mA is its recommended drive). At power-up the kit holds zeros (a real chip's are undefined: write it before relying on it). Not modelled: propagation delays and timing limits (the kit sees every edge of a sketch).
- Limits (the simulator's): maximum voltage 7 V (supply) · maximum current 35 mA (QA, QB, QC, QD, QE, QF, QG, QH, QH') (output) · maximum current 70 mA (supply) · maximum power 750 mW · maximum reverse voltage 500 mV (supply)
<!-- /generated -->

Wire it right:

- `SRCLR` to `VCC`: low clears the register. Left open, the kit warns and reads it low, and no LED
  lights.
- `OE` to `GND`: high leaves the outputs open.
- Three board pins: `SER` (data), `SRCLK` (shift clock), `RCLK` (latch). In the sketch:
  `digitalWrite(latch, LOW)`, `shiftOut(data, clock, MSBFIRST, value)`, `digitalWrite(latch, HIGH)`;
  with `MSBFIRST` bit 0 of `value` lands on `QA`.
- Each output through its own resistor to its LED. `QA` is on the other side of the chip from
  `QB`…`QH`: name the pins, `layout` places them.
- The chip takes at most 70 mA through `VCC` for all its outputs together. Eight red LEDs on
  330 Ω from 5 V go over it when all are on: the review visits the states the program latches into
  the chip, so `layout` ends `WARNINGS` with `U2 carries 71.3 mA, more than its maximum 70 mA: it can
  be damaged, with U2 QA…QH 11111111 latched …`, and `kit simulate <folder> --run 3` warns the same.
  With 1 kΩ each (the kit's example) there is no warning.
- From an ESP32 (3.3 V pins) feed the chip from `3V3`, not 5 V: at 5 V its inputs do not reach
  their high level (a ⚠).
- `QH'` to the next chip's `SER` (same `SRCLK` and `RCLK`) chains a second one.

Worked spec: an UNO filling four LEDs one by one (`QE`…`QH` take four more the same way; for n
LEDs the sketch counts `% (n + 1)`). The sketch, written first, beside where `circuit.json` will
be:

```cpp circuits/shift/fill.ino
const int DATA = 11;   // to SER
const int CLOCK = 12;  // to SRCLK
const int LATCH = 8;   // to RCLK
int lit = 0;

void setup() {
  pinMode(DATA, OUTPUT);
  pinMode(CLOCK, OUTPUT);
  pinMode(LATCH, OUTPUT);
}

void loop() {
  digitalWrite(LATCH, LOW);
  shiftOut(DATA, CLOCK, MSBFIRST, (1 << lit) - 1);
  digitalWrite(LATCH, HIGH);
  lit = (lit + 1) % 5;
  delay(250);
}
```

```json shift.json
{
  "parts": [
    { "id": "U1", "part": "UNO", "program": "fill.ino" },
    { "id": "U2", "part": "74HC595" },
    { "id": "R1", "type": "resistor", "value": "330" },
    { "id": "D1", "type": "led", "color": "red" },
    { "id": "R2", "type": "resistor", "value": "330" },
    { "id": "D2", "type": "led", "color": "red" },
    { "id": "R3", "type": "resistor", "value": "330" },
    { "id": "D3", "type": "led", "color": "green" },
    { "id": "R4", "type": "resistor", "value": "330" },
    { "id": "D4", "type": "led", "color": "green" }
  ],
  "nets": [
    ["U1.5V", "U2.VCC", "U2.SRCLR"],
    ["U1.GND", "U2.GND", "U2.OE", "D1.K", "D2.K", "D3.K", "D4.K"],
    ["U1.D11", "U2.SER"], ["U1.D12", "U2.SRCLK"], ["U1.D8", "U2.RCLK"],
    ["U2.QA", "R1.1"], ["R1.2", "D1.A"], ["U2.QB", "R2.1"], ["R2.2", "D2.A"],
    ["U2.QC", "R3.1"], ["R3.2", "D3.A"], ["U2.QD", "R4.1"], ["R4.2", "D4.A"]
  ]
}
```

```bash
kit layout circuits/shift shift.json
```

It ends `STATUS: DONE`; a run shows the LEDs coming on one after another:

```bash
kit simulate circuits/shift --run 1.25
```

```text
  D1 (LED): on 80 % of the time · changes: 1 (on 251 ms → 1.25 s)
  D4 (LED): on 20 % of the time · changes: 1 (on 1 s → 1.25 s)
```

## CD4017 decade counter: a running light

<!-- generated: CD4017 (npm run parts-reference -- --write) -->
- Pins, from pin 1 round the chip (`kit catalog CD4017`): `Q5` `Q1` `Q0` `Q2` `Q6` `Q7` `Q3` `VSS` `Q8` `Q4` `Q9` `CO` `CE` `CLK` `MR` `VDD`
- Simulated: CLK rising (CE low) advances the count, CE high holds it, MR high resets it to 0 at once; one of Q0…Q9 high, CO high for counts 0 to 4; a Qn wired to MR makes it count to n (the reset takes one time step); inputs low under 0.3·VDD and high over 0.7·VDD, keeping their level in between (the clock's Schmitt action); outputs about 400 Ω near the rail at 5 V (192 Ω at 10 V), levelling off at about 3 mA at 5 V, so an LED straight on an output takes about 3 mA. At power-up the kit counts from 0 (a real chip's count is undefined until MR is pulsed); the kit's buttons do not bounce, a real one on CLK needs a debounce. Not modelled: propagation delays and the maximum clock rate.
- Limits (the simulator's): maximum voltage 20 V (supply) · maximum power 100 mW (Q0, Q1, Q2, Q3, Q4, Q5, Q6, Q7, Q8, Q9, CO) (output) · maximum power 500 mW · maximum reverse voltage 500 mV (supply)
<!-- /generated -->

Wire it right:

- `CE` to `VSS` (ground): high holds the count.
- `MR` to `VSS` to count to ten, or an output to `MR` to count to fewer: `Q3` on `MR` lights
  `Q0`, `Q1`, `Q2` in turn (`Q6` on `MR`: six LEDs on `Q0`…`Q5`).
- `CLK` from a 555's `OUT` (an astable) or a board pin. A real button on `CLK` needs a debounce;
  the kit's buttons do not bounce, so the kit does not show that.
- `VDD` to + (3 to 15 V), `VSS` to −. An output gives only a few mA; a resistor in series with each
  LED keeps it in its rating.

Worked spec: a 555 clocking three LEDs.

```json counter.json
{
  "supplies": [{ "id": "V1", "voltage": 9 }],
  "parts": [
    { "id": "U1", "part": "NE555" },
    { "id": "R1", "type": "resistor", "value": "1k" },
    { "id": "R2", "type": "resistor", "value": "10k" },
    { "id": "C1", "type": "capacitor", "kind": "electrolytic", "value": "10u" },
    { "id": "C2", "type": "capacitor", "value": "10n" },
    { "id": "U2", "part": "CD4017" },
    { "id": "R3", "type": "resistor", "value": "470" },
    { "id": "D1", "type": "led", "color": "red" },
    { "id": "R4", "type": "resistor", "value": "470" },
    { "id": "D2", "type": "led", "color": "yellow" },
    { "id": "R5", "type": "resistor", "value": "470" },
    { "id": "D3", "type": "led", "color": "green" }
  ],
  "nets": [
    ["T+", "U1.VCC", "U1.RESET", "R1.1", "U2.VDD"],
    ["R1.2", "R2.1", "U1.DIS"], ["R2.2", "U1.THR", "U1.TRIG", "C1.+"],
    ["U1.CTRL", "C2.1"],
    ["T-", "C1.-", "C2.2", "U1.GND", "U2.VSS", "U2.CE", "D1.K", "D2.K", "D3.K"],
    ["U1.OUT", "U2.CLK"], ["U2.Q3", "U2.MR"],
    ["U2.Q0", "R3.1"], ["R3.2", "D1.A"], ["U2.Q1", "R4.1"], ["R4.2", "D2.A"],
    ["U2.Q2", "R5.1"], ["R5.2", "D3.A"]
  ]
}
```

```bash
kit layout circuits/counter counter.json
```

```text
Behaviour, first 2 s from its resting point, as the page starts (simulated, a model): D1 2.24 Hz, on 33 % of the time · D2 2.24 Hz, on 33 % of the time · D3 2.24 Hz, on 33 % of the time
```

## ULN2003 and ULN2803 Darlington arrays: loads from a weak pin

<!-- generated: ULN2003 (npm run parts-reference -- --write) -->
- Pins, from pin 1 round the chip (`kit catalog ULN2003`): `IN1` `IN2` `IN3` `IN4` `IN5` `IN6` `IN7` `GND` `COM` `OUT7` `OUT6` `OUT5` `OUT4` `OUT3` `OUT2` `OUT1`
- Simulated: each channel as the datasheet draws it (2.7 kΩ in, a Darlington pair to GND, a clamp diode from OUT to COM): on from about 2 V at its input, OUT saturates at 0.7 to 1.2 V, an open input is off. Not modelled: switching times, temperature. Up to 500 mA per channel and 2.5 A through GND.
- Limits (the simulator's): maximum current 500 mA (OUT1, OUT2, OUT3, OUT4, OUT5, OUT6, OUT7) (output) · maximum current 500 mA (OUT1, OUT2, OUT3, OUT4, OUT5, OUT6, OUT7) (clamp diode) · maximum voltage 50 V (OUT1, OUT2, OUT3, OUT4, OUT5, OUT6, OUT7) (output) · maximum voltage 30 V (IN1, IN2, IN3, IN4, IN5, IN6, IN7) (input) · maximum current 2.5 A (GND, all channels) · maximum power 1.8 W
<!-- /generated -->

The ULN2803 is the same with eight channels:

<!-- generated: ULN2803 (npm run parts-reference -- --write) -->
- Pins, from pin 1 round the chip (`kit catalog ULN2803`): `IN1` `IN2` `IN3` `IN4` `IN5` `IN6` `IN7` `IN8` `GND` `COM` `OUT8` `OUT7` `OUT6` `OUT5` `OUT4` `OUT3` `OUT2` `OUT1`
- Simulated: each channel as the datasheet draws it (2.7 kΩ in, a Darlington pair to GND, a clamp diode from OUT to COM): on from about 2 V at its input, OUT saturates at 0.7 to 1.2 V, an open input is off. Not modelled: switching times, temperature. Up to 500 mA per channel and 2.5 A through GND.
- Limits (the simulator's): maximum current 500 mA (OUT1, OUT2, OUT3, OUT4, OUT5, OUT6, OUT7, OUT8) (output) · maximum current 500 mA (OUT1, OUT2, OUT3, OUT4, OUT5, OUT6, OUT7, OUT8) (clamp diode) · maximum voltage 50 V (OUT1, OUT2, OUT3, OUT4, OUT5, OUT6, OUT7, OUT8) (output) · maximum voltage 30 V (IN1, IN2, IN3, IN4, IN5, IN6, IN7, IN8) (input) · maximum current 2.5 A (GND, all channels) · maximum power 1.8 W
<!-- /generated -->

Wire it right:

- The load goes from its supply's + to `OUTn`: the chip sinks the current (`OUTn` goes low when
  `INn` is high). Never `OUTn` to the load to ground.
- `GND` to the ground of the board and of the load's supply: one ground for both.
- `COM` to the load's supply + when the load is a coil (a relay, a motor): that is its flyback
  diode. Without it the kit warns that the coil is switched with no diode across it.
- `INn` straight from a board pin (the resistor is inside); an unused input left open is off.

Worked spec (ULN2003): an UNO pin switching a relay.

```cpp circuits/relay/relay.ino
void setup() {
  pinMode(8, OUTPUT);
}

void loop() {
  digitalWrite(8, HIGH);
  delay(1000);
  digitalWrite(8, LOW);
  delay(1000);
}
```

```json relay.json
{
  "parts": [
    { "id": "U1", "part": "UNO", "program": "relay.ino" },
    { "id": "U2", "part": "ULN2003" },
    { "id": "K1", "part": "SRD-05VDC-SL-C" }
  ],
  "nets": [
    ["U1.D8", "U2.IN1"], ["U2.OUT1", "K1.A2"],
    ["U1.5V", "K1.A1", "U2.COM"], ["U2.GND", "U1.GND"]
  ]
}
```

```bash
kit layout circuits/relay relay.json
```

```text
Behaviour, first 2 s from its resting point, as the page starts (simulated, a model): K1 on 50 % of the time (changes: 2) · U1.D8 on 50 % of the time (changes: 1)
```

Worked spec (ULN2803): a button on `IN1` lighting an LED on `OUT1`.

```json darlington.json
{
  "parts": [
    { "id": "BT1", "type": "battery", "format": "9V" },
    { "id": "S1", "type": "button" },
    { "id": "U1", "part": "ULN2803" },
    { "id": "R1", "type": "resistor", "value": "1k" },
    { "id": "D1", "type": "led", "color": "red" }
  ],
  "nets": [
    ["BT1.+", "S1.1", "R1.1", "U1.COM"], ["S1.3", "U1.IN1"],
    ["R1.2", "D1.A"], ["D1.K", "U1.OUT1"], ["U1.GND", "BT1.-"]
  ]
}
```

```bash
kit layout circuits/darlington darlington.json
```

```bash
kit simulate circuits/darlington --set S1=on
```

```text
  D1     1.71 V     6.61 mA    11.3 mW · brightness 33 % of 20 mA
```

## PC817 optocoupler: two circuits joined by light

<!-- generated: PC817 (npm run parts-reference -- --write) -->
- Pins, from pin 1 round the chip (`kit catalog PC817`): `A` `K` `E` `C`
- Simulated: the infrared LED (1.2 V at 20 mA) and a phototransistor whose collector takes 170 % of the LED's current (the middle of the datasheet's 50 % to 600 %: real parts vary several times over) until it saturates at about 0.1 V. The two sides share no node: each is read against its own ground. Not modelled: switching speed, the CTR's change with current and temperature.
- Limits (the simulator's): maximum current 50 mA (LED) · maximum reverse voltage 6 V (LED) · maximum power 70 mW (LED) · maximum current 50 mA (output) · maximum voltage 35 V (output) · maximum reverse voltage 6 V (output) · maximum power 150 mW (output) · maximum power 200 mW
<!-- /generated -->

Wire it right:

- `A` and `K` are the LED of the input side: `A` through a resistor to that side's +, `K` to that
  side's −. With no resistor the LED is over its current (a ⚠).
- `C` and `E` are the transistor of the output side: `E` to that side's ground, `C` to a pull-up
  (a resistor to that side's +, or a board pin set `INPUT_PULLUP`). Lit LED: `C` is pulled down, so
  the pin reads `LOW`.
- Keep the two sides' grounds apart (two supplies, or a battery and a board): that is what isolates
  them. The kit reads each side against its own ground.
- The kit takes a transfer ratio of 170 %; real parts go from 50 % to 600 %. Size the output's
  pull-up so it still pulls down at 50 %, and say the figure is the kit's typical one.

Worked spec: a button on a 9 V battery lighting an LED on a separate 5 V supply.

```json opto.json
{
  "supplies": [{ "id": "V1", "voltage": 5, "positive": "R2.1", "negative": "U1.E" }],
  "parts": [
    { "id": "BT1", "type": "battery", "format": "9V" },
    { "id": "S1", "type": "button" },
    { "id": "R1", "type": "resistor", "value": "680" },
    { "id": "U1", "part": "PC817" },
    { "id": "R2", "type": "resistor", "value": "330" },
    { "id": "D1", "type": "led", "color": "green" }
  ],
  "nets": [
    ["BT1.+", "S1.1"], ["S1.3", "R1.1"], ["R1.2", "U1.A"], ["U1.K", "BT1.-"],
    ["R2.2", "D1.A"], ["D1.K", "U1.C"]
  ]
}
```

```bash
kit layout circuits/opto opto.json
```

```bash
kit simulate circuits/opto --set S1=on
```

```text
  D1     2.04 V     8.4 mA     17.1 mW · brightness 42 % of 20 mA
```

A board reading the output side (a button on a 12 V side read by an UNO): `C` to a pin set
`INPUT_PULLUP`, `E` to the board's `GND`; the board on USB is that side's supply, so no supply is
named for it. The pin reads `LOW` while the button is pressed.

```cpp circuits/isolated/read.ino
void setup() {
  Serial.begin(9600);
  pinMode(2, INPUT_PULLUP);
}

void loop() {
  Serial.println(digitalRead(2));
  delay(500);
}
```

```json isolated.json
{
  "supplies": [{ "id": "V1", "voltage": 12, "positive": "S1.1", "negative": "U1.K" }],
  "parts": [
    { "id": "S1", "type": "button" },
    { "id": "R1", "type": "resistor", "value": "1k" },
    { "id": "U1", "part": "PC817" },
    { "id": "U2", "part": "UNO", "program": "read.ino" }
  ],
  "nets": [["S1.3", "R1.1"], ["R1.2", "U1.A"], ["U1.C", "U2.D2"], ["U1.E", "U2.GND"]]
}
```

```bash
kit layout circuits/isolated isolated.json
```

```bash
kit simulate circuits/isolated --run 1 --press S1@0.2+0.5
```

```text
  0 s        1
  500 ms     0
  note: Board U2, on USB, powers a separate circuit: its voltages are measured from its own GND.
```

## LM386 audio amplifier

<!-- generated: LM386 (npm run parts-reference -- --write) -->
- Pins, from pin 1 round the chip (`kit catalog LM386`): `GAIN1` `IN-` `IN+` `GND` `OUT` `VS` `BYPASS` `GAIN8`
- Simulated: the output at half the supply, a gain of 20 with pins 1 and 8 open and 200 with a capacitor between them (the datasheet's 1.35 kΩ and 15 kΩ), 50 kΩ inputs, a swing to about 1 V from each rail, 4 mA of its own. Not modelled: bandwidth, distortion, noise, the bass boost from pin 1 to pin 5. The kit has no loudspeaker yet: an 8 Ω resistor stands for it.
- Limits (the simulator's): maximum voltage 15 V (supply) · maximum voltage 400 mV (IN+, IN-) (input) · maximum power 1.25 W · maximum reverse voltage 500 mV (supply)
<!-- /generated -->

Wire it right:

- `VS` to + (at most 15 V), `GND` to −.
- The signal through a capacitor to `IN+`; `IN-` to ground.
- `OUT` through a large capacitor (220 µF) to the loudspeaker. The kit has no loudspeaker: an 8 Ω
  resistor of 1 W stands for it. Say so to the user.
- `GAIN1` and `GAIN8` open: a gain of 20; a capacitor between them: 200.
- `BYPASS` may stay open.
- Run its transient from its resting point, `--start dc`. Run from everything discharged, the
  220 µF charges through the 8 Ω at switch-on and the run warns that the chip and the resistor
  overheat: that is the switch-on of a discharged circuit, not the amplifier at work.

Worked spec: a 1 kHz, 50 mV signal from a generator.

```json amp.json
{
  "supplies": [
    { "id": "V1", "voltage": 9 },
    { "id": "G1", "kind": "generator", "waveform": "sine", "frequency": 1000, "amplitude": 0.05, "positive": "C1.+", "negative": "T-" }
  ],
  "parts": [
    { "id": "C1", "type": "capacitor", "kind": "electrolytic", "value": "10u" },
    { "id": "U1", "part": "LM386" },
    { "id": "C2", "type": "capacitor", "kind": "electrolytic", "value": "220u" },
    { "id": "R1", "type": "resistor", "value": "8", "power": 1 }
  ],
  "nets": [
    ["C1.-", "U1.IN+"], ["U1.IN-", "T-"], ["U1.GND", "T-"], ["U1.VS", "T+"],
    ["U1.OUT", "C2.+"], ["C2.-", "R1.1"], ["R1.2", "T-"]
  ]
}
```

```bash
kit layout circuits/amp amp.json
```

```bash
kit simulate circuits/amp --transient 5m,10u --start dc
```

```text
Transient from the DC operating point — a model, not a measurement: 5 ms solved in steps of 10 µs; 251 samples printed, 20 µs apart.
```

and without `--start dc`:

```bash
kit simulate circuits/amp --transient 5m,10u
```

```text
  warning: U1 dissipates 1.27 W, more than its 1.25 W: it overheats.
```
