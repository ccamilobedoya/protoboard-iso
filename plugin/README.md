# Protoboard ISO

Ask your assistant for an electronics circuit and get it built on a solderless breadboard: every
part in real holes, the jumper wires, a review, and a live page where the current flows, the LEDs
light and an oscilloscope shows the signals.

## Install

In Claude Code:

```text
/plugin marketplace add ccamilobedoya/protoboard-iso
/plugin install protoboard-iso@protoboard-iso
```

In the Claude app, add the marketplace by the repository's URL,
<https://github.com/ccamilobedoya/protoboard-iso>, and install the plugin `protoboard-iso`.

## Use it

Describe the circuit in your own words: "a red LED with its resistor on 9 V", "a 555 blinking an
LED", "an Arduino UNO reading a potentiometer". The assistant runs the kit and hands you a page to
open, with what the kit measured and what you can change. Ask for a change ("make the resistor 1k")
and you get the new page. It answers in English or Spanish.

## What it runs and what it sends

The skill runs the protoboard-iso kit, plain Node.js source included in this plugin under
`skills/protoboard-iso/scripts/`, where your assistant runs code. It needs Node.js 22 or later,
installs no packages, makes no network requests and sends no data anywhere. It writes only the
circuit files and pages it creates.

Source and documentation: <https://github.com/ccamilobedoya/protoboard-iso>. MIT licence.
