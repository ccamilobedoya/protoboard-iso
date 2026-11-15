// A push button drives an NPN that drives a relay's coil; a 1N4007 across the coil takes its current
// when the transistor lets go. The relay's contact, a circuit of its own, lights an LED: pressing the
// button closes COM–NO a few milliseconds after the coil's current passes the pull-in current.
export default {
  name: 'relay-npn',
  group: 'transistors',
  title: { en: 'Relay with an NPN and a flyback diode', es: 'Relé con un NPN y su diodo de protección' },
  teaches: { en: 'A small base current lets the coil\'s 71 mA flow; the coil pulls the contact over and the LED lights. Released, the diode takes the coil\'s current (without it, its voltage would jump far past the supply)', es: 'Una corriente de base pequeña deja pasar los 71 mA de la bobina; la bobina mueve el contacto y el LED se enciende. Al soltar, el diodo recibe la corriente de la bobina (sin él, su voltaje saltaría muy por encima de la fuente)' },
  parts: [
    { id: 'S1', type: 'button' },
    { id: 'R1', type: 'resistor', value: '1k' },
    { id: 'Q1', part: '2N2222A' },
    { id: 'K1', type: 'relay' },
    { id: 'D1', part: '1N4007' },
    { id: 'R2', type: 'resistor', value: '330' },
    { id: 'D2', type: 'led', color: 'red' },
  ],
  nets: [['T+', 'S1.1', 'K1.A1', 'D1.K', 'K1.COM'], ['S1.3', 'R1.1'], ['R1.2', 'Q1.B'], ['K1.A2', 'D1.A', 'Q1.C'], ['Q1.E', 'T-'], ['K1.NO', 'R2.1'], ['R2.2', 'D2.anode'], ['D2.cathode', 'T-']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  values: {
    R1: { field: 'value', role: { en: 'base resistor', es: 'resistencia de base' } },
    R2: { field: 'value', role: { en: 'LED resistor (on the contact)', es: 'resistencia del LED (en el contacto)' } },
    Q1: { field: 'part', choices: ['2N2222A', 'BC337', 'S8050'] },
  },
};
