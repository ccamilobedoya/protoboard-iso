# Timed sensors: a PIR and a touch module

*[Español](../es/sensores-temporizados.md)*

Most sensors answer at once: change the light and the resistance changes. Two modules of the kit
answer **in time**: they wait, hold, rest and ignore, and a learner who does not know it thinks the
module is broken. The HC-SR501 PIR motion sensor (`pir-sensor`) and the TTP223 touch sensor
(`touch-sensor`) are simulated with a small state machine each, so the waiting is there to see: in
the card (a phase in words and the time left), in the part up close (a bar that drains) and in a
video. They read the environment's `motion` and `touch` ([environment.md](environment.md)); each has
its own switch too, which detaches it from the field.

The code is `src/sim/devices/pir.js` and `touch.js` (the machines are the pure functions
`pirAdvance` and `touchAdvance`), their numbers `PIR` and `TOUCH` in `src/sim/models.js`, the types
`src/parts/types/timed-sensors.js` and the drawings `src/parts/packages/timed-sensors.js`.

## The PIR (HC-SR501)

Pins `VCC`, `OUT`, `GND`, as the board prints them. It runs from 4.5 to 20 V; `OUT` is 3.3 V behind
500 Ω while active and 0 V otherwise, whatever the supply; the module takes 65 µA at 5 V.

| Field | Default | |
|---|---|---|
| `delay` | 5 | seconds `OUT` stays high (the trimmer Tx); 0.3 to 600, the slider 3 to 300 s |
| `mode` | `"H"` | the jumper: `H` motion during the delay starts it again, `L` motion is ignored while high |
| `warmup` | 30 | seconds after power on with `OUT` low and motion ignored; 0 skips it |
| `sensitivity` | 0.5 | the other trimmer; informative, the model has no range |
| `motion` | | the part's own value of the field `motion` (true or false); without it the part follows the environment |

```text
power on (VCC ≥ 4.5 V)
   │
   ▼
warm-up ──(Tw)──▶ idle ──motion──▶ high ──(Tx)──▶ rest ──(2.5 s)──▶ idle
 OUT low           OUT low          OUT high       OUT low, motion ignored
 motion ignored    waiting          H: motion restarts Tx · L: motion ignored
```

- Motion in `idle` starts `high` at once, in the step it arrives.
- In `H`, motion held keeps `OUT` high for ever; it falls Tx after the last motion.
- In `L`, `OUT` falls Tx after the first motion whatever happens; with motion held, it is high Tx,
  low 2.5 s, high Tx… (the behaviour that surprises learners).
- After the fall the module rests 2.5 s and ignores motion; if motion is still on when the rest
  ends, it goes high again at once.
- The warm-up counts from the moment `VCC` first reaches 4.5 V; a supply switched off and on
  begins it again. Under 4.5 V the module does not start (`SIM_MODULE_LOW_SUPPLY`).
- Over 20 V is `SIM_IC_SUPPLY`; `OUT` asked for more than 2 mA is `SIM_OVER_CURRENT` (it is a weak
  output: a logic input or a transistor's base, never a lamp). The warm-up is a note,
  `SIM_PIR_WARMUP`.

Its controls: `motion` (a switch), `retrigger` (the jumper: true is `H`) and `delay` (log slider).

## The touch sensor (TTP223)

Pins `SIG` (printed `I/O`), `VCC`, `GND`. It runs from 2 to 5.5 V and its output is a push-pull
stage: `SIG` joins `VCC` through 150 Ω when high and `GND` through 75 Ω when low, so its high
level is the module's own supply. The board's indicator LED is not modelled (it would take about a
milliampere from `SIG`).

| Field | Default | |
|---|---|---|
| `mode` | `"momentary"` | `momentary`: `SIG` follows the touch; `toggle`: each touch flips it, letting go does nothing |
| `activeLow` | false | the polarity: `SIG` low while touched (or while a toggle is on) |
| `fast` | false | the 60 ms response instead of the 220 ms low-power one (and 7 µA instead of 3 µA) |
| `touch` | | the part's own value of the field `touch` |

- For 0.5 s after power on the chip calibrates the pad and ignores it. A finger on the pad at that
  moment is the baseline: it counts only once it has been lifted (`held` in the card).
- A change of `touch` is registered once it has lasted the response time; a shorter touch is not
  registered at all. A toggle flips when the touch is registered, not when it is released.
- `SIG` over 10 mA is `SIM_OVER_CURRENT`; between the 4 mA sourced or 8 mA sunk its levels are
  guaranteed at and 10 mA, `SIM_TOUCH_OUTPUT_SPEC` (a note). Over 5.5 V is `SIM_IC_SUPPLY`, under 2 V
  `SIM_TOUCH_LOW_SUPPLY`.

Its controls: `touch` (a switch) and `toggleMode`.

## How the engine carries a device's state

A slider on another part rebuilds the whole system ([live-simulation.md](live-simulation.md)): a
new element for every part. A capacitor's voltage or a latch survives because `engine.js` copies the
keys listed in its `STATE` between the old elements and the new ones. A device with memory of its
own lists the keys of its elements in `state`:

```js
export const pir = {
  types: ['pir-sensor'],
  state: ['phase', 'clock', 'powered'],   // carried, with the built-in list, by engine.set
  …
};
```

A key is carried only if the new element defines it from the start (`phase: 0` in the element's
literal). The old elements accept the step that was pending before the copy, so the clock loses no
time; the new ones start from it.

Two more optional methods of an element serve the page:

- `maxStep()` (seconds, or `null`): a step the element needs while it is timing; `engine.stepHint()`
  gives the smallest of them and the PWM's, and the page shortens its step to it. The PIR asks
  10 ms while it times, nothing while it waits for motion.
- `span()` (seconds): the shortest time that matters. `engine.stimuli()` lists it with the
  environment's programs, so a circuit whose only clock is a timed sensor runs in real time
  (steps of a two-hundredth of the span, 1 to 20 ms) instead of staying a still page.

## Stamping the end of the step

An element changes its memory in `accept(x, { h })`, at the start of the next step. If it stamped
the state it has, an output would change one step after its time. These two stamp the state it
**will** have at the end of the step being solved (`ahead(x, ctx)`: the pure function applied to
`ctx.h`), so the fall of `OUT` is read in the step that ends on it. A control that moves the input
(`motion`, `touch`) rebuilds the element and solves with a very short step, so a rising edge shows
at once. At the operating point (`ctx.h` missing) no time passes.

## Adding another timed sensor

1. The state machine as a pure function `(state, h, powered, params) → state`, with a test of each
   time the sheet gives (a few steps of `h`, as `test/timed-sensors.test.js` does).
2. An element with `phase`/`clock` (and what else it keeps) set in its literal, `accept` that applies
   the function, `ahead` that applies it to `ctx.h` for `stamp`/`currents`, and `maxStep`/`span`.
3. The device with `state: [...]`, `senses` and `controls`/`set` like any sensor
   ([adding-parts.md](adding-parts.md#7-a-sensor-joining-the-environment)).
4. The reading carries the phase in words and `left` (seconds) for the card, and a `length` for a bar.
