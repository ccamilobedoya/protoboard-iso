# Check what it does: `simulate --run`

`layout` says the circuit is built and nothing burns; it does not say the program or the sensor
does what the user asked. Before you say so, run the circuit with the user's conditions and quote
what the kit printed. `kit simulate <folder> --run <seconds>` runs it as the page does, from
switch-on, and saves nothing (connector: `simulate` with `run_s`, `environment`, `set`, `press`,
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
Behaviour, first 2 s (simulated, a model): D1 off throughout · U1.D9 9.8 Hz, on 0 % of the time · U1.D13 off throughout
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

## When the run does not show what was asked

If the run shows the opposite of the request (the LED stays off at 10 cm), the circuit or the
sketch does not do it: say so with the run's lines, and do not say it works. Change the sketch or
the parts, lay it out again and run it again; the stop rule counts these as corrections. A run is
a model: a program with a doubt (⚠: a function the kit does not know, a part not simulated) runs
only as far as the kit can follow, so what it does there is not checked.
