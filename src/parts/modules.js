// Development boards (modules): what each one is, its pins in order and a short note per pin.
// The drawing lives in packages/devboard.js (boards that straddle the channel, placed with
// "pin1"), packages/uno.js (an Arduino UNO lying beside the board, wired with Dupont
// leads) and packages/despi.js (the DESPI-C02 e-paper adapter, also beside the board). Electrically a module is not simulated yet: its pins only join the groups their
// holes are in. A microcontroller board (family in sim/models.js, MCUS) is simulated pin by pin
// (sim/devices/mcu.js, docs/en/microcontrollers.md): `power` names its supply pins (`usb`: where
// the USB's 5 V arrives, `logic`: the rail its GPIO work from, `v3`: a 3.3 V regulator output when
// the logic rail is not it, `ground`, `reset`) and `gpio` gives each pin's GPIO number (the number
// a program uses: digitalWrite(13, …)); `adc` and `inputOnly` list GPIO numbers.
//
// Sizes and pin data: Espressif datasheets (ESP32 v5.3, ESP32-C3 v2.4), the Arduino UNO R3
// reference design, and the boards on the maintainer's bench. Notes are short: what the pin
// is and what to watch out for. Pin names are the ones printed on the board.

// A note in both languages.
const n = (es, en) => ({ es, en });

const BOOT = n('⚠ pin de arranque: no forzarlo al reiniciar', '⚠ strapping pin: do not force it at reset');
const INPUT_ONLY = (gpio) => n(`GPIO${gpio} · solo entrada · ADC1`, `GPIO${gpio} · input only · ADC1`);
const GND = n('tierra (0 V)', 'ground (0 V)');

// GPIO numbers of pins printed "D13", "GPIO4" or "IO4", plus the ones printed otherwise.
const gpioOf = (pins, extra = {}) => Object.fromEntries([...pins.flatMap((p) => (/^(?:D|GPIO|IO)(\d+)$/.exec(p) ? [[p, Number(RegExp.$1)]] : [])), ...Object.entries(extra)]);

// ESP32 DevKit (ESP32-WROOM-32, CP2102, USB-C), 30 pins. Pins in the order of a DIP: down
// the side that starts at the antenna end (pin 1 = EN), then back up the other side. Seen
// from above with the USB at the bottom, pin 1 is the top of the left row.
const DEVKIT_LEFT = ['EN', 'VP', 'VN', 'D34', 'D35', 'D32', 'D33', 'D25', 'D26', 'D27', 'D14', 'D12', 'D13', 'GND', 'VIN'];
const DEVKIT_RIGHT = ['D23', 'D22', 'TX0', 'RX0', 'D21', 'D19', 'D18', 'D5', 'TX2', 'RX2', 'D4', 'D2', 'D15', 'GND2', '3V3'];

// ESP32-C3 SuperMini, 16 pins. Seen from above with the USB at the top and the parts facing
// you, pin 1 is 5V at the top of the left row. Variants with another order exist: check the
// print on the board.
const C3_LEFT = ['5V', 'GND', '3V3', 'GPIO4', 'GPIO3', 'GPIO2', 'GPIO1', 'GPIO0'];
const C3_RIGHT = ['GPIO5', 'GPIO6', 'GPIO7', 'GPIO8', 'GPIO9', 'GPIO10', 'GPIO20', 'GPIO21'];

export const MODULES = {
  'ESP32-DEVKIT': {
    family: 'esp32',
    mount: 'straddle',
    label: 'ESP32 DevKit',
    // [along the rows, across, PCB thickness] in mm.
    size: [52, 28, 1.6],
    // Distance between the two rows of pins, in holes. Boards differ: 0.9", 1.0" and 1.1"
    // all exist. Override per part with "rowSpacing".
    rowSpacing: 9,
    look: 'devkit',
    // Pin names are printed between each pad and the edge: the module covers the middle.
    labelSide: 'out',
    pins: [...DEVKIT_LEFT, ...[...DEVKIT_RIGHT].reverse()],
    internal: [['GND', 'GND2']],
    logic: 3.3,
    // USB 5 V reaches VIN (through a Schottky diode on most DevKits); an AMS1117 makes 3V3.
    power: { usb: 'VIN', logic: '3V3', ground: ['GND', 'GND2'], reset: 'EN' },
    gpio: gpioOf([...DEVKIT_LEFT, ...DEVKIT_RIGHT], { VP: 36, VN: 39, TX0: 1, RX0: 3, TX2: 17, RX2: 16 }),
    adc: [32, 33, 34, 35, 36, 39, 0, 2, 4, 12, 13, 14, 15, 25, 26, 27],
    inputOnly: [34, 35, 36, 39],
    notes: {
      EN: n('reinicio: a 0 V apaga el chip', 'reset: at 0 V the chip is off'),
      VP: INPUT_ONLY(36),
      VN: INPUT_ONLY(39),
      D34: INPUT_ONLY(34),
      D35: INPUT_ONLY(35),
      D32: n('GPIO32 · ADC1 · táctil', 'GPIO32 · ADC1 · touch'),
      D33: n('GPIO33 · ADC1 · táctil', 'GPIO33 · ADC1 · touch'),
      D25: n('GPIO25 · DAC (salida analógica)', 'GPIO25 · DAC (analog output)'),
      D26: n('GPIO26 · DAC (salida analógica)', 'GPIO26 · DAC (analog output)'),
      D27: n('GPIO27 · ADC2 (no con Wi-Fi) · táctil', 'GPIO27 · ADC2 (not with Wi-Fi) · touch'),
      D14: n('GPIO14 · ADC2 (no con Wi-Fi) · táctil', 'GPIO14 · ADC2 (not with Wi-Fi) · touch'),
      D12: n('GPIO12 · ⚠ pin de arranque: a 3,3 V al reiniciar, la placa no arranca', 'GPIO12 · ⚠ strapping pin: at 3.3 V on reset the board does not boot'),
      D13: n('GPIO13 · ADC2 (no con Wi-Fi) · táctil', 'GPIO13 · ADC2 (not with Wi-Fi) · touch'),
      GND,
      VIN: n('entrada de 5 V al regulador', '5 V input to the regulator'),
      D23: n('GPIO23 · SPI (MOSI)', 'GPIO23 · SPI (MOSI)'),
      D22: n('GPIO22 · I2C (SCL)', 'GPIO22 · I2C (SCL)'),
      TX0: n('GPIO1 · ocupado por el USB-serie', 'GPIO1 · used by the USB serial'),
      RX0: n('GPIO3 · ocupado por el USB-serie', 'GPIO3 · used by the USB serial'),
      D21: n('GPIO21 · I2C (SDA)', 'GPIO21 · I2C (SDA)'),
      D19: n('GPIO19 · SPI (MISO)', 'GPIO19 · SPI (MISO)'),
      D18: n('GPIO18 · SPI (SCK)', 'GPIO18 · SPI (SCK)'),
      D5: n('GPIO5 · ⚠ pin de arranque · SPI (CS)', 'GPIO5 · ⚠ strapping pin · SPI (CS)'),
      TX2: n('GPIO17 · segundo puerto serie', 'GPIO17 · second serial port'),
      RX2: n('GPIO16 · segundo puerto serie', 'GPIO16 · second serial port'),
      D4: n('GPIO4 · ADC2 (no con Wi-Fi) · táctil', 'GPIO4 · ADC2 (not with Wi-Fi) · touch'),
      D2: n('GPIO2 · ⚠ pin de arranque · LED de la placa', 'GPIO2 · ⚠ strapping pin · on-board LED'),
      D15: n('GPIO15 · ⚠ pin de arranque', 'GPIO15 · ⚠ strapping pin'),
      GND2: GND,
      '3V3': n('salida de 3,3 V del regulador', '3.3 V output of the regulator'),
    },
  },

  'ESP32-C3-SUPERMINI': {
    family: 'esp32c3',
    mount: 'straddle',
    label: 'ESP32-C3 SuperMini',
    size: [22.5, 18, 1.0],
    rowSpacing: 6,
    look: 'supermini',
    labelSide: 'in',
    // The board prints numbers only: "4" for GPIO4, "G" for ground, "3.3" for 3V3.
    printed: { GND: 'G', '3V3': '3.3' },
    printedGpio: true,
    pins: [...C3_LEFT, ...[...C3_RIGHT].reverse()],
    internal: [],
    logic: 3.3,
    // USB 5 V on the 5V pin; an ME6211 makes 3V3.
    power: { usb: '5V', logic: '3V3', ground: ['GND'] },
    gpio: gpioOf([...C3_LEFT, ...C3_RIGHT]),
    adc: [0, 1, 2, 3, 4, 5],
    inputOnly: [],
    notes: {
      '5V': n('entrada de 5 V (o salida, alimentada por USB)', '5 V input (or output, when powered by USB)'),
      GND,
      '3V3': n('salida de 3,3 V del regulador', '3.3 V output of the regulator'),
      GPIO4: n('ADC1', 'ADC1'),
      GPIO3: n('ADC1', 'ADC1'),
      GPIO2: n('⚠ pin de arranque · ADC1', '⚠ strapping pin · ADC1'),
      GPIO1: n('ADC1', 'ADC1'),
      GPIO0: n('ADC1', 'ADC1'),
      GPIO5: n('ADC2: evitarlo como entrada analógica', 'ADC2: avoid it as an analog input'),
      GPIO8: n('⚠ pin de arranque · LED azul (enciende a 0 V)', '⚠ strapping pin · blue LED (lit at 0 V)'),
      GPIO9: n('⚠ pin de arranque · botón BOOT', '⚠ strapping pin · BOOT button'),
      GPIO20: n('RX del puerto serie', 'serial RX'),
      GPIO21: n('TX del puerto serie', 'serial TX'),
    },
  },

  // Arduino UNO R3 (and its CH340 clones). Lies beside the board; only the pins listed in the
  // circuit are wired. Header positions in inches from the corner by the DC jack, USB on the
  // left, as in the reference design (note the 0.16" gap between D7 and D8).
  UNO: {
    family: 'uno',
    mount: 'beside',
    label: 'Arduino UNO',
    size: [68.6, 53.3, 1.6],
    look: 'uno',
    headers: [
      { y: 2.0, pins: [['SCL', 0.84], ['SDA', 0.94], ['AREF', 1.04], ['GND3', 1.14], ['D13', 1.24], ['D12', 1.34], ['D11', 1.44], ['D10', 1.54], ['D9', 1.64], ['D8', 1.74]] },
      { y: 2.0, pins: [['D7', 1.9], ['D6', 2.0], ['D5', 2.1], ['D4', 2.2], ['D3', 2.3], ['D2', 2.4], ['D1', 2.5], ['D0', 2.6]] },
      { y: 0.1, pins: [['IOREF', 1.2], ['RESET', 1.3], ['3V3', 1.4], ['5V', 1.5], ['GND', 1.6], ['GND2', 1.7], ['VIN', 1.8]], first: 1.1 },
      { y: 0.1, pins: [['A0', 2.0], ['A1', 2.1], ['A2', 2.2], ['A3', 2.3], ['A4', 2.4], ['A5', 2.5]] },
    ],
    internal: [['GND', 'GND2', 'GND3'], ['SDA', 'A4'], ['SCL', 'A5']],
    logic: 5,
    // USB 5 V is the logic rail (IOREF says so to shields); an LP2985 makes 3V3.
    power: { usb: '5V', logic: '5V', v3: '3V3', ground: ['GND', 'GND2', 'GND3'], reset: 'RESET', ioref: 'IOREF' },
    gpio: { ...gpioOf(['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13']), A0: 14, A1: 15, A2: 16, A3: 17, A4: 18, A5: 19, SDA: 18, SCL: 19 },
    adc: [14, 15, 16, 17, 18, 19],
    pwm: [3, 5, 6, 9, 10, 11],
    inputOnly: [],
    notes: {
      D0: n('RX: compartido con el USB, dejarlo libre al cargar', 'RX: shared with the USB, leave it free while uploading'),
      D1: n('TX: compartido con el USB, dejarlo libre al cargar', 'TX: shared with the USB, leave it free while uploading'),
      D2: n('interrupción externa', 'external interrupt'),
      D3: n('PWM (~) · interrupción externa', 'PWM (~) · external interrupt'),
      D5: n('PWM (~)', 'PWM (~)'),
      D6: n('PWM (~)', 'PWM (~)'),
      D9: n('PWM (~)', 'PWM (~)'),
      D10: n('PWM (~) · SPI (SS)', 'PWM (~) · SPI (SS)'),
      D11: n('PWM (~) · SPI (MOSI)', 'PWM (~) · SPI (MOSI)'),
      D12: n('SPI (MISO)', 'SPI (MISO)'),
      D13: n('SPI (SCK) · LED L de la placa', 'SPI (SCK) · on-board LED L'),
      A4: n('entrada analógica · I2C (SDA)', 'analog input · I2C (SDA)'),
      A5: n('entrada analógica · I2C (SCL)', 'analog input · I2C (SCL)'),
      SDA: n('I2C (SDA), el mismo A4', 'I2C (SDA), same as A4'),
      SCL: n('I2C (SCL), el mismo A5', 'I2C (SCL), same as A5'),
      AREF: n('referencia del convertidor analógico', 'reference of the analog converter'),
      IOREF: n('indica el voltaje de los pines (5 V)', 'tells the pin voltage (5 V)'),
      RESET: n('a 0 V reinicia el microcontrolador', 'at 0 V it resets the microcontroller'),
      '3V3': n('salida de 3,3 V, unos 50 mA como mucho', '3.3 V output, about 50 mA at most'),
      '5V': n('5 V regulados: no meter voltaje aquí con otra alimentación', 'regulated 5 V: do not feed it with another supply connected'),
      GND,
      GND2: GND,
      GND3: GND,
      VIN: n('entrada de 7 a 12 V al regulador', '7 to 12 V input to the regulator'),
    },
  },

  // GooDisplay DESPI-C02: adapter for 24-pin SPI e-paper panels (GDEY075T7 and others). It passes
  // the panel's 0.5 mm FPC to 8 right-angle male pins and makes the panel's high voltages with a
  // charge pump (L1, Q1, D1–D3). Lies beside the board, wired with Dupont leads; optionally with
  // its 7.5" panel (`panel: true`). The RESE switch (P3) must match the panel's controller:
  // 0.47 Ω for UltraChip (UC8179) and Fitipower, 2.2 Ω for SSD. Datasheet DESPI-C02 Rev 1.1.
  'DESPI-C02': {
    family: 'epaper',
    role: 'adapter',
    mount: 'beside',
    package: 'despi',
    label: 'DESPI-C02',
    size: [41, 22, 1.6],
    pins: ['BUSY', 'RES', 'D/C', 'CS', 'SCK', 'SDI', 'GND', '3.3V'],
    internal: [],
    logic: 3.3,
    notes: {
      BUSY: n('salida del panel: ocupado mientras refresca (en el UC8179, activo en bajo) · entrada en el micro', 'panel output: busy while refreshing (UC8179: active low) · an input on the micro'),
      RES: n('reinicio del panel, activo en bajo', 'panel reset, active low'),
      'D/C': n('alto = dato, bajo = comando', 'high = data, low = command'),
      CS: n('selección de chip del SPI, activo en bajo', 'SPI chip select, active low'),
      SCK: n('reloj del SPI', 'SPI clock'),
      SDI: n('datos del SPI hacia el panel (MOSI del micro)', 'SPI data into the panel (the micro\'s MOSI)'),
      GND,
      '3.3V': n('alimentación: solo 3,3 V, nunca 5 V', 'supply: 3.3 V only, never 5 V'),
    },
  },
};

// Other names for the same board.
const ALIASES = {
  ESP32: 'ESP32-DEVKIT',
  'ESP32-DEVKITC': 'ESP32-DEVKIT',
  'ESP32-DEVKIT-V1': 'ESP32-DEVKIT',
  'ESP32-WROOM-32': 'ESP32-DEVKIT',
  'ESP32-C3': 'ESP32-C3-SUPERMINI',
  'C3-SUPERMINI': 'ESP32-C3-SUPERMINI',
  'ARDUINO-UNO': 'UNO',
  'UNO-R3': 'UNO',
  'ARDUINO-UNO-R3': 'UNO',
  DESPI: 'DESPI-C02',
  DESPIC02: 'DESPI-C02',
  'DESPI-C02-ADAPTER': 'DESPI-C02',
};

export function lookupModule(name) {
  const key = String(name ?? '').toUpperCase().replace(/[\s_]+/g, '-');
  const id = MODULES[key] ? key : ALIASES[key];
  return id ? { id, module: MODULES[id] } : null;
}

// Every pin name of a beside-the-board module, in header order.
export const headerPins = (module) => (module.headers ? module.headers.flatMap((h) => h.pins.map(([name]) => name)) : module.pins);
