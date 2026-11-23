# Check what it does: `simulate --run`

`layout` says the circuit is built and nothing burns; it does not say the program or the sensor
does what the user asked. Before you say so, run the circuit with the user's conditions and quote
what the kit printed. `kit simulate <folder> --run <seconds>` runs it as the page does, from
its resting point (capacitors already charged; `--start zero` runs it from everything
discharged), and saves nothing (connector: `simulate` with `run_s`, `environment`, `set`, `press`,
`at`).

| Option | What it sets | Example |
|---|---|---|
| `--env field=value,…` | the environment the sensors read, in its unit ([parts.md](parts.md)) | `--env distance=10`, `--env light=50,temperature=30` |
| `--set ID=value` or `ID.field=value` | a part's own control (a potentiometer's `position` 0…1, a switch `on`) | `--set RV1=0.8`, `--set SW1=on` |
| `--press ID@start+duration` | a push button held for a while, in seconds | `--press S1@0.5+0.2` |
| `--at time:field=value` | the environment or a control changed at a time | `--at 1:distance=10` |

The answer has the program's `Serial` lines with their times, `Outputs over time` (each LED,
buzzer, relay, motor and program pin: its share of time on, its changes, and frequency and duty
when it toggles) and the readings at the end. A circuit with no program and nothing that changes
by itself is answered by `kit simulate <folder>` alone (the DC point).

## Worked example: the distance alarm at 10 cm and at 50 cm

"An Arduino that lights a LED when something is closer than 15 cm." The recipe is one call:

```bash
kit layout circuits/alarm --recipe distance-alarm-uno
```

It ends `STATUS: DONE` and its `Behaviour` line is for the environment as it is (nothing near):

```text
Behaviour, first 2 s from its resting point, as the page starts (simulated, a model): D1 off throughout · U1.D9 9.8 Hz, on 0 % of the time · U1.D13 off throughout
```

That does not show the LED lighting. Run it with something at 10 cm:

```bash
kit simulate circuits/alarm --run 1 --env distance=10
```

```text
Serial (10 lines, in order):
  844 µs     10
Outputs over time:
  D1 (LED): on > 99 % of the time · changes: 1 (on 922 µs → 1 s)
```

and at 50 cm:

```bash
kit simulate circuits/alarm --run 1 --env distance=50
```

```text
Serial (10 lines, in order):
  3.17 ms    50
Outputs over time:
  D1 (LED): off the whole time
```

Now say it, as the kit's: "the kit runs it with an object at 10 cm: the program prints 10 and D1
is on more than 99 % of the time; at 50 cm it prints 50 and D1 stays off". Something that moves
closer is one run with `--at`:

```bash
kit simulate circuits/alarm --run 2 --env distance=50 --at 1:distance=10
```

```text
  D1 (LED): on 48 % of the time · changes: 1 (on 1.03 s → 2 s)
```

## What a run starts from, and what it names

**The environment starts at the kit's defaults** unless `--env` (or the circuit's `environment`)
says otherwise: light 300 lx, temperature 25 °C, humidity 50 %RH, distance 50 cm, sound 40 dB,
moisture 30 %, reflectance 80 %, pressure 1013.25 hPa, field 0 G, water 0 mm, angle 0°, and the
switches off: no rain, motion, touch, vibration or tilt, the beam uncut. A sketch that turns an echo into centimetres with `t * 0.034 / 2` into an `int` prints 9 for
10 cm: at 25 °C sound is faster than the 340 m/s that 0.034 assumes, and the `int` drops the 0.8.

```json sonar.json
{
  "parts": [
    { "id": "U1", "part": "UNO", "program": "sonar.ino" },
    { "id": "U2", "part": "HC-SR04" }
  ],
  "nets": [["U1.5V", "U2.VCC"], ["U1.D9", "U2.TRIG"], ["U1.D10", "U2.ECHO"], ["U1.GND", "U2.GND"]]
}
```

```cpp circuits/sonar/sonar.ino
void setup() {
  Serial.begin(9600);
  pinMode(9, OUTPUT);
  pinMode(10, INPUT);
}

void loop() {
  digitalWrite(9, HIGH);
  delayMicroseconds(10);
  digitalWrite(9, LOW);
  long t = pulseIn(10, HIGH);
  int cm = t * 0.034 / 2;
  Serial.println(cm);
  delay(200);
}
```

```bash
kit layout circuits/sonar sonar.json
```

```bash
kit simulate circuits/sonar --run 0.5 --env distance=10
```

```text
  837 µs     9
```

Say it as the kit's: "at 10 cm and 25 °C the sketch prints 9".

**A laser's beam** is the environment's `beam`, a switch: `--env beam=on` cuts it for the whole run,
`--at 1:beam=on` at 1 s.

```bash
kit layout circuits/trip --recipe laser-tripwire
```

```bash
kit simulate circuits/trip --run 2 --at 1:beam=on
```

```text
  D1 (LED): on 50 % of the time · changes: 1 (on 1 s → 2 s)
```

**A push button** makes its switch between its two pairs: pins 1 and 2 are one side (joined inside),
3 and 4 the other, so a net on `S1.1` and one on `S1.3` are joined while it is pressed (`kit catalog
button` lists each pin's side).

**Parts are named by their id** in a run and in `layout`'s answer (`D1 (LED)`, `K1 (relay)`). Tell
the user which is which from the spec: its colour or role there, and where `layout` put it (its line
`D1: anode→j15, cathode→T-15`), never by a guess at the order.

**A recipe's supply is a bench supply** (`V1`: a set voltage that holds whatever the circuit draws,
up to its current limit). For a battery, lay the same circuit out from a spec with a battery part in
place of the supply (`{ "id": "BT1", "type": "battery", "format": "9V" }`, its `+` and `-` on the
rails' nets, `"supplies": []`): it sags under load as a battery does.

```json battery.json
{
  "supplies": [],
  "parts": [
    { "id": "BT1", "type": "battery", "format": "9V" },
    { "id": "R1", "type": "resistor", "value": "470" },
    { "id": "D1", "type": "led", "color": "red" }
  ],
  "nets": [["BT1.+", "T+"], ["T+", "R1.1"], ["R1.2", "D1.A"], ["D1.K", "T-"], ["BT1.-", "T-"]]
}
```

```bash
kit layout circuits/battery battery.json
```

```text
Readings (at rest, a model): battery BT1 8.97 V · D1 15.2 mA, brightness 76 % of 20 mA
```

**Trials are free; corrections are counted.** `layout … --dry-run` and `apply … --dry-run` save
nothing and are not corrections: try as many as the skill's trial rule allows. A correction is a
call that saves; the stop rule allows two per circuit, and after the second that does not end
`DONE` or `WARNINGS` you stop and say what is left.

<!-- serial-input: the sketch runner's option to send text to a board's Serial during a run goes here (its own session) -->

## When the run does not show what was asked

If the run shows the opposite of the request (the LED stays off at 10 cm), the circuit or the
sketch does not do it: say so with the run's lines, and do not say it works. Change the sketch or
the parts, lay it out again and run it again; the stop rule counts these as corrections. A run is
a model: a program with a doubt (⚠: a function the kit does not know, a part not simulated) runs
only as far as the kit can follow, so what it does there is not checked.

## How long a run covers, and from where

A run covers at most 60 s of simulated time, and stops earlier when it takes more than 15 s of the
machine's. Then the line under its header says so, and every figure after it is for the span it
covered, not for what was asked: say that span.

```bash
kit layout circuits/led --recipe led-resistor
```

```bash
kit simulate circuits/led --run 90
```

```text
warning: A run covers at most 60 s: it ran the first 60 s of the 90 s asked.
Every figure below covers the first 60 s of the 90 s asked, not the whole run.
Outputs over time in the first 60 s:
```

It starts where the page starts: its resting point, every capacitor already at its DC voltage (a
capacitor behind 22 kΩ that takes seconds to charge in a real circuit is charged already), unless
the circuit says `page.start: "zero"`. To see it from the moment it is switched on, `--start zero`
(connector: `start: "zero"`); the first line says which:

```bash
kit simulate circuits/led --run 1 --start zero
```

```text
Run from everything discharged (capacitors at 0 V when it is switched on; the page starts from its resting point) — a model, not a measurement: 1 s in steps of 5 ms (200 steps).
```

**Two resting states.** A latch (two transistors that hold each other) has two states it can rest
in, and its DC point is the balance between them, which a real circuit never sits in. The kit finds
both: `layout` prints them instead of the `Readings` line, and a run starts from the first and says
so. Tell the user both, and that a real circuit powers up in one of them and the kit cannot say
which; to show the other, press what sets it (`--press`):

> Two resting states (a model): the point at rest is a balance between them that a real circuit never stays in; it powers up in one of them, and the kit cannot say which (simulate --run starts from the first):
>
> 1. Q1 off, Q2 on · battery BT1 8.98 V · D1 4.54 mA, brightness 23 % of 20 mA
>
> 2. Q1 on, Q2 off · battery BT1 8.98 V · D1 0 mA, brightness 0 % of 20 mA

## When the kit checks only part of it

A request the kit simulates only in part (a part it only draws, a program that calls what the kit
does not know, a run cut short) is answered for that part: say which part was checked and which was
not, from the ⚠ lines and the `Checked` line. A ⚠ that says the kit cannot tell what an output does
(`nor what D1, D2, D3 do`) means unknown, never off.

## Sketches

A run of a board's program shows what the program printed on `Serial`, with the simulated time of
each line, and what each pin it drives did. Its timing is the board's: a `delay(300)` lasts 300 ms,
Serial output takes the time its baud rate gives (ten bits a character at the rate of
`Serial.begin`, once the board's buffer is full), and a mistake a real board would show is a ⚠ naming its line
([warnings.md](warnings.md)). A pin is named as `kit catalog <board>` lists it: an UNO's TX is `D1`
and its RX `D0`; an ESP32 DevKit's second port is `TX2` and `RX2`.

**A button pressed during a `delay`.** A sketch that reads a button with `digitalRead` sees it only
when it reads; a press that starts and ends inside a `delay` is missed, on the board and in the kit.
An interrupt sees it. Test it with presses shorter than the delay: here a button on D2 counted by an
interrupt (`attachInterrupt` works on an UNO's D2 and D3 and on any ESP32 GPIO; another pin is a ⚠).

```cpp circuits/counter/counter.ino
volatile int presses = 0;

void count() {
  presses++;
}

void setup() {
  Serial.begin(9600);
  pinMode(2, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(2), count, FALLING);
}

void loop() {
  delay(1000);
  Serial.println(presses);
}
```

```json counter.json
{
  "parts": [
    { "id": "U1", "part": "UNO", "program": "counter.ino" },
    { "id": "S1", "type": "button" }
  ],
  "nets": [["U1.D2", "S1.1"], ["S1.3", "U1.GND"]]
}
```

```bash
kit layout circuits/counter counter.json
```

```bash
kit simulate circuits/counter --run 3 --press S1@0.5+0.1 --press S1@1.5+0.1
```

```text
Serial (2 lines, in order):
  1 s        1
  2 s        2
```

Both presses are counted, each inside a `delay(1000)`. The same sketch with
`if (digitalRead(2) == LOW) presses++;` before the `delay` instead of the interrupt prints `0` twice:
say that a real board misses them too. The kit's buttons do not bounce: one press is one edge, so a
debounce is not tested by a run.

**Two boards.** The bytes one board sends on a TX pin reach the board whose RX pin is on the same
net, in the same run, at the sender's baud rate (two rates that differ pass nothing, a ⚠). Here an
ESP32 sends on `Serial2` (3.3 V into the UNO's `D0` reads high; an UNO's 5 V TX into an ESP32 pin is
a ⚠ over that pin's voltage):

```cpp circuits/link/sender.ino
int n = 0;

void setup() {
  Serial2.begin(9600, SERIAL_8N1, 16, 17);
}

void loop() {
  Serial2.println(n);
  n++;
  delay(500);
}
```

```cpp circuits/link/receiver.ino
void setup() {
  Serial.begin(9600);
}

void loop() {
  if (Serial.available()) {
    int n = Serial.parseInt();
    Serial.print("got ");
    Serial.println(n);
  }
}
```

```json link.json
{
  "parts": [
    { "id": "U1", "part": "ESP32-DEVKIT", "program": "sender.ino" },
    { "id": "U2", "part": "UNO", "program": "receiver.ino" }
  ],
  "nets": [["U1.TX2", "U2.D0"], ["U1.GND", "U2.GND"]]
}
```

```bash
kit layout circuits/link link.json
```

```bash
kit simulate circuits/link --run 1
```

```text
  0 s        U1: Serial2: 0
  3 ms       U2: got 0
```

Each line names its board, and a port other than `Serial` is named too.

**Deep sleep.** On an ESP32, `esp_deep_sleep_start()` after `esp_sleep_enable_timer_wakeup(µs)`
stops the program; after that time it starts again from `setup()`, its globals as at power-up, so a
run of several seconds shows `setup()`'s lines once per wake-up.
