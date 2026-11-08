// A PIR motion module that switches a lamp: its OUT (3.3 V behind 500 Ω, a weak output) feeds the base
// of an NPN through a resistor, and the transistor carries the LED's current, which OUT could not. The
// module is set to skip its 30 s warm-up so the lamp reacts at once (leave `warmup` out of the recipe's
// values to keep it: it is the module's best known trap), and to hold OUT for 5 s after the last
// motion. Move the motion switch in the page: the lamp lights, stays on for the delay, and goes out.
export default {
  name: 'pir-lamp',
  title: { en: 'PIR motion sensor lights a lamp', es: 'Sensor PIR de movimiento enciende una lámpara' },
  teaches: { en: 'A PIR module holds OUT high for its delay after motion and then rests; OUT is too weak for a lamp, so it drives a transistor that carries the LED\'s current', es: 'Un módulo PIR mantiene OUT alto durante su retardo tras el movimiento y luego descansa; OUT es muy débil para una lámpara, así que maneja un transistor que lleva la corriente del LED' },
  parts: [
    { id: 'U1', type: 'pir-sensor', delay: 5, warmup: 0 },
    { id: 'R1', type: 'resistor', value: '4.7k' },
    { id: 'Q1', part: '2N2222A' },
    { id: 'R2', type: 'resistor', value: '330' },
    { id: 'D1', type: 'led', color: 'yellow' },
  ],
  nets: [['T+', 'U1.VCC', 'R2.1'], ['U1.OUT', 'R1.1'], ['R1.2', 'Q1.B'], ['R2.2', 'D1.anode'], ['D1.cathode', 'Q1.C'], ['Q1.E', 'U1.GND', 'T-']],
  supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }],
  environment: { motion: false },
  page: { controls: [{ environment: 'motion' }, { part: 'U1', field: 'delay' }] },
  values: {
    U1: { field: 'delay', min: 0.3, max: 60, extra: ['mode', 'warmup'], role: { en: 'seconds OUT stays high after the last motion (the delay trimmer); mode H repeats, L ignores motion while high; warmup in seconds', es: 'segundos que OUT queda alto tras el último movimiento (el trimmer de retardo); modo H repite, L ignora el movimiento mientras está alto; warmup en segundos' } },
    R1: { field: 'value', role: { en: 'base resistor: OUT gives (3.3 V − 0.7 V) / (500 Ω + R1), far under its 2 mA', es: 'resistencia de base: OUT da (3,3 V − 0,7 V) / (500 Ω + R1), muy por debajo de sus 2 mA' } },
    R2: { field: 'value', role: { en: 'lamp resistor', es: 'resistencia de la lámpara' } },
    D1: { field: 'color' },
  },
};
