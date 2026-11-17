// A potentiometer sets a DC motor's speed through a TIP120 Darlington as an emitter follower: the
// motor gets the wiper's voltage less about 1.3 V, with the current the transistor gives it. A 1N4007
// across the motor takes the winding's current when the voltage falls.
export default {
  name: 'motor-npn',
  group: 'transistors',
  title: { en: 'DC motor speed with a transistor', es: 'Velocidad de un motor DC con un transistor' },
  teaches: { en: 'Started, the motor draws nearly its stall current and speeds up with a time constant of its inertia; turning, its back-EMF rises with the speed until it nearly balances the supply, and the current falls', es: 'Al arrancar, el motor toma casi su corriente de bloqueo y acelera con una constante de tiempo de su inercia; girando, su fuerza contraelectromotriz sube con la velocidad hasta casi igualar la fuente, y la corriente baja' },
  parts: [
    { id: 'RV1', type: 'potentiometer', value: '10k', position: 0.8 },
    { id: 'R1', type: 'resistor', value: '1k' },
    { id: 'Q1', part: 'TIP120' },
    { id: 'M1', type: 'motor', load: 0 },
    { id: 'D1', part: '1N4007' },
  ],
  nets: [['T+', 'RV1.3', 'Q1.C'], ['RV1.1', 'T-'], ['RV1.W', 'R1.1'], ['R1.2', 'Q1.B'], ['Q1.E', 'M1.+', 'D1.K'], ['M1.-', 'D1.A', 'T-']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  values: {
    RV1: { field: 'position', min: 0, max: 1, role: { en: 'the speed (the wiper\'s position)', es: 'la velocidad (la posición del cursor)' } },
    M1: { field: 'load', min: 0, max: 3, role: { en: 'the load on its shaft (mN·m)', es: 'la carga en su eje (mN·m)' } },
  },
};
