// A TTP223 touch module in toggle mode lighting an LED straight from its I/O pin, from a 3.3 V supply
// (a bench supply here; an AMS1117 module gives the same). Each touch flips the LED and letting go
// does nothing. The chip's output is a small push-pull: its high level is guaranteed up to 4 mA, so the
// resistor is 470 Ω: a red LED at about 1.8 V takes (3.3 V − 1.8 V) / 470 Ω = 3.2 mA by the plain sum, under the 4 mA
// (2.7 mA in the simulation, where the output's own resistance and the LED's voltage also count).
// With 330 Ω the plain sum gives 4.5 mA, over the 4 mA the datasheet promises (3.45 mA in the simulation,
// which is why the margin matters: the sum is the safe way to choose).
export default {
  name: 'touch-toggle-led',
  group: 'sensors',
  title: { en: 'Touch module toggles an LED', es: 'Módulo táctil alterna un LED' },
  teaches: { en: 'In toggle mode each touch flips the TTP223\'s output; its pin can drive a small LED directly, if the resistor keeps the current under the 4 mA its high level is guaranteed at', es: 'En modo alterna cada toque invierte la salida del TTP223; su pin puede manejar un LED pequeño directamente, si la resistencia mantiene la corriente bajo los 4 mA con que se garantiza su nivel alto' },
  parts: [
    { id: 'U1', type: 'touch-sensor', mode: 'toggle' },
    { id: 'R1', type: 'resistor', value: '470' },
    { id: 'D1', type: 'led', color: 'red' },
  ],
  nets: [['T+', 'U1.VCC'], ['U1.SIG', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'U1.GND', 'T-']],
  // Room between the groups: without it a standing module or the LED hides a resistor in one of the two views.
  clearance: 4,
  supplies: [{ id: 'V1', kind: 'bench', voltage: 3.3, positive: 'T+', negative: 'T-' }],
  environment: { touch: false },
  page: { controls: [{ environment: 'touch' }] },
  values: {
    U1: { field: 'mode', choices: ['toggle', 'momentary'], extra: ['activeLow', 'fast'], role: { en: 'toggle: each touch flips the output; momentary: it follows the touch; activeLow and fast as the module\'s solder pads', es: 'toggle: cada toque invierte la salida; momentary: la sigue; activeLow y fast como los pads de soldadura del módulo' } },
    R1: { field: 'value', role: { en: 'LED resistor: keep the current under 4 mA, the output\'s guaranteed high level (470 Ω gives 3.2 mA by the plain sum, 2.7 mA in the simulation)', es: 'resistencia del LED: mantén la corriente bajo 4 mA, el nivel alto garantizado de la salida (470 Ω da 3,2 mA por la suma simple, 2,7 mA en la simulación)' } },
    D1: { field: 'color' },
  },
};
