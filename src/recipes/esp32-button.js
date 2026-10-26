// An ESP32 DevKit reading a button on D27 (GPIO27) with its internal pull-up. GND and D27 are on
// the same header, so the board leaves free holes for both (the other header is under the PCB).
export default {
  name: 'esp32-button',
  title: { en: 'ESP32 reading a button', es: 'ESP32 que lee un pulsador' },
  teaches: { en: 'A GPIO pin as an input with the internal pull-up: pinMode(27, INPUT_PULLUP) reads LOW while S1 is pressed', es: 'Un pin GPIO como entrada con el pull-up interno: pinMode(27, INPUT_PULLUP) lee LOW mientras S1 está presionado' },
  parts: [
    { id: 'U1', part: 'ESP32-DEVKIT' },
    { id: 'S1', type: 'button' },
  ],
  nets: [['U1.D27', 'S1.1'], ['S1.3', 'U1.GND']],
  values: {},
};
