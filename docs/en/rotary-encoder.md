# Rotary encoder: the KY-040 module

*[Español](../es/encoder-rotativo.md)*

A rotary encoder tells a program how far and which way a knob was turned. The kit has the ALPS EC11
on its usual module, the KY-040 (`rotary-encoder`): a shaft that turns with a click every 18°, two
contacts that close to ground in turn, and a push switch on the shaft. It is driven by the
environment's `angle` ([environment.md](environment.md)), so a learner sets an angle and the module
produces, in time, the train of pulses a hand would. The code is `src/sim/devices/encoder.js` (the
shaft and the table are pure functions), its numbers `ENCODER` in `src/sim/models.js`, the type
`src/parts/types/rotary-encoder.js` and the drawing `src/parts/packages/encoder-module.js`.

## The module

Pins `CLK`, `DT`, `SW`, `+`, `GND`, as the board prints them, 2.54 mm, standing on its five pins in
one row of the breadboard (the board is 19 × 26 mm; the encoder is 12 × 12 mm with a 6 mm shaft that
sticks 20 mm out towards the front). The module carries a 10 kΩ pull-up from `+` to `CLK`, to `DT`
and to `SW`. They hang from the `+` pin: with `+` connected to nothing the outputs float, the
classic mistake of the module (`SIM_ENCODER_FLOATING`; a pin set as `INPUT_PULLUP` still reads them cleanly through its own pull-up, so the note says both). CLK is channel A and DT channel B.

| Field | Default | |
|---|---|---|
| `part` | `"KY-040"` | the only part number |
| `pulses`, `detents` | 20, 20 | per revolution; another pair is refused with `BAD_VALUE`, because it would give a wrong wave |
| `speed` | 360 | degrees a second the shaft follows its target (a brisk human turn) |
| `bounce` | 0 (the recipes set 2) | milliseconds of chatter at each change of CLK and DT; 0 is clean |
| `pressed` | false | the push switch is held down |
| `swPullup` | true | the pull-up from `+` to `SW`; some clones leave it out |
| `angle` | | the part's own target angle; without it the part follows the environment |

## The quadrature table

With 20 pulses and 20 detents a click is one full cycle of each channel, 18°. A contact is closed to
ground (0.1 Ω) for half of the cycle, and the lines are pulled up, so a closed contact reads low.
Turning clockwise (the angle grows), CLK leads and DT lags by a quarter of a cycle, 4.5°:

| Position in the cycle (°, from the click) | CLK | DT | event at the start |
|---|---|---|---|
| −2.25 … 2.25 (at rest) | high | high | the click: both contacts open |
| 2.25 … 6.75 | low | high | CLK closes first |
| 6.75 … 11.25 | low | low | DT closes |
| 11.25 … 15.75 | high | low | CLK opens |
| 15.75 … 20.25 | high | high | DT opens: back at rest |

Counter-clockwise the order flips: DT falls first and CLK 4.5° later. The usual sketch rule follows
from it: at a falling edge of CLK, DT high means clockwise and DT low counter-clockwise.

## How the shaft follows the angle

`angle` is the **target**. The knob rests on a click, so the target is snapped to the nearest one
(18° steps; a tie rounds up), and the shaft, which the device keeps in its carried state, goes to it
at `speed` by the shortest arc (an exact half turn goes clockwise). The two contacts follow the table
at the shaft's position, so the pulses come out in the order and at the times a hand would give them:

- 0° → 90° at 360 °/s is five clicks, 0.25 s, clockwise: CLK falls at 6.25, 56.25, 106.25, 156.25 and
  206.25 ms; DT falls 12.5 ms after each; CLK rises at 31.25 + 50 k ms and DT at 43.75 + 50 k ms. Both
  lines are high again at 250 ms.
- 90° → 0° is the same train the other way round: DT first, CLK 12.5 ms later.
- 0° → 180° is clockwise (an exact half turn): ten cycles in half a second. 0° → 270° is five cycles
  counter-clockwise, the shorter way. 0° → 355° snaps to 360°, which is 0°: nothing moves.
- At the DC operating point the shaft is at the target, at rest, with both contacts open.

The absolute angle cannot say "270° clockwise"; for a lesson that counts clicks, move it by steps
smaller than half a turn. Two momentary controls "+1 click" and "−1 click" are on the roadmap.

### Why a jump of the slider still gives every edge

A control moved anywhere in the circuit rebuilds the whole system, so the device lists the keys of
its element that must survive (`state: ['shaft', 'ageA', 'ageB']`, as the timed sensors do, see
[timed-sensors.md](timed-sensors.md)). The shaft keeps turning from where it was, whatever the
slider does, and the target changes only where it points. The element asks the engine for short
steps while the shaft moves (`maxStep()`: a twenty-fifth of the time between two edges, 0.5 ms at
360 °/s) and for nothing when it is still, and it stamps the levels the contacts will have at the
**end** of the step being solved, so each edge is read in the step that ends on it, within a step of
its time. `span()` gives the time between two edges, so a page whose only clock is an encoder runs in
real time.

## What a sketch must do

The edges are 12.5 ms apart in a brisk turn. A program that sleeps longer than that between reads
misses clicks, exactly as on a real board. The usual polling loop reads CLK as often as it can, keeps
the last value, and on a falling edge reads DT once; the recipe `encoder-uno` does so with a
`delay(1)`, and `encoder-dimmer-uno` adds a LED whose brightness follows the count. A sketch that
uses an interrupt (`attachInterrupt`) is not simulated yet.

## Limits and the bounce

A contact carrying over 10 mA is `SIM_OVER_CURRENT` (an LED wired straight through a closed contact
with a 220 Ω resistor from 5 V takes about 15 mA through the contact, 14.4 mA of it in the LED; with 470 Ω, 7.5 mA, no warning); a contact holding over
12 V open is `SIM_SWITCH_VOLTAGE`. A sketch's pin pulling a line low against `+` takes 0.5 mA and
stresses nothing. The 10 mA and 12 V are the ratings of the EC11 at 5 V DC resistive load; the 12 V is
the kit's choice for where to warn.

With `bounce` above 0, each transition of a contact at time t0 shows, deterministically, the new
level for the first third of the bounce, the old one for the second third and the new one again from
then on: three edges instead of one. At 2 ms, 0° → 90° gives 30 edges on CLK instead of 10, the first
falling one still at 6.25 ms. The element then asks for steps of a twentieth of the bounce. The
first sketches of a course do not debounce, and with a bounce of a millisecond or so they miscount
(5 clicks clockwise and 5 back ended at −1 with 5 ms): a good exercise. The sketches of `encoder-uno`
and `encoder-dimmer-uno` filter by time instead: a change of CLK counts only if 8 ms have passed since
the last one accepted, and the three lines use the chip's pull-ups (`INPUT_PULLUP`), so the recipes
ship with `bounce` 2 and the count is exact with every value of the control, 0 to 5 ms. Measured over
five clicks each way, twice, the filter holds up to about 800 °/s (more than two turns a second; it
failed from 870 °/s) at every bounce from 0 to 5 ms; the 12.5 ms between edges is for 360 °/s. At a very fast turn (measured at 800 °/s) the filter can count a click too many if the shaft reverses right on an edge; at a hand's speed it is exact.
