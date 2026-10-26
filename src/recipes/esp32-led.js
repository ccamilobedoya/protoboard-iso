// An ESP32 DevKit lighting an LED from D13 (GPIO13). The board itself is not simulated yet.
export default {
  name: 'esp32-led',
  title: { en: 'ESP32 lighting an LED', es: 'ESP32 que enciende un LED' },
  teaches: { en: 'A GPIO pin as an output: digitalWrite(13, HIGH) lights D1', es: 'Un pin GPIO como salida: digitalWrite(13, HIGH) enciende D1' },
  parts: [
    { id: 'U1', part: 'ESP32-DEVKIT' },
    { id: 'R1', type: 'resistor', value: '220' },
    { id: 'D1', type: 'led', color: 'red' },
  ],
  nets: [['U1.D13', 'R1.1'], ['R1.2', 'D1.anode'], ['D1.cathode', 'U1.GND']],
  values: {
    R1: { field: 'value', role: { en: 'LED resistor', es: 'resistencia del LED' } },
    D1: { field: 'color' },
  },
};
