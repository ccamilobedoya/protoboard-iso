// From what a person writes to a part the kit knows. A brief says "7805", "KCD1", "UNO",
// "GL5528" or "resistencia"; the kit already has the tables (part numbers, modules,
// photoresistors), so the type need not be looked up first:
//
//   resolvePart({ id: 'U1', part: '7805' })  → { part: { id: 'U1', type: 'regulator', part: '7805' } }
//   resolvePart({ id: 'S1', part: 'KCD1' })  → { part: { id: 'S1', type: 'switch', style: 'rocker' } }
//   resolvePart({ id: 'X', part: '1N4148W' }) → { error: { code: 'UNKNOWN_PART_NAME', params: { …, suggestions: '1N4148, …' } } }
//
// pinsOf(part) gives the pin names a resolved part takes (for parts beside the board, all the
// ones it can use), so a list of nets can be checked before anything is placed.

import { PART_TYPES } from './types/index.js';
import { PART_NUMBERS, lookupPartNumber } from './db.js';
import { MODULES, lookupModule, headerPins } from './modules.js';
import { LDR_PARTS } from './sensors.js';
import { SWITCH_STYLES } from './types/switch.js';

// Names that are neither types nor part numbers: what a part is called on the bench or in a
// brief, and the types in Spanish. Each one is the fields it stands for.
export const PART_ALIASES = {
  KCD1: { type: 'switch', style: 'rocker' },
  ROCKER: { type: 'switch', style: 'rocker' },
  BASCULANTE: { type: 'switch', style: 'rocker' },
  LATCHING: { type: 'switch', style: 'latching' },
  '7X7': { type: 'switch', style: 'latching' },
  ENCLAVAMIENTO: { type: 'switch', style: 'latching' },
  RESISTENCIA: { type: 'resistor' },
  CONDENSADOR: { type: 'capacitor' },
  DIODO: { type: 'diode' },
  PUENTE: { type: 'bridge' },
  INTERRUPTOR: { type: 'switch' },
  PULSADOR: { type: 'button' },
  REGULADOR: { type: 'regulator' },
  CABLE: { type: 'wire' },
  BATERIA: { type: 'battery' },
  PILA: { type: 'battery' },
  BOBINA: { type: 'inductor' },
  TERMISTOR: { type: 'thermistor' },
  NTC: { type: 'thermistor' },
  FOTORRESISTENCIA: { type: 'ldr' },
  ZUMBADOR: { type: 'buzzer' },
  POTENCIOMETRO: { type: 'potentiometer' },
  TRIMMER: { type: 'potentiometer', style: 'trimmer' },
  '3296W': { type: 'potentiometer', style: 'trimmer' },
  PINES: { type: 'header' },
  RGB: { type: 'rgb-led' },
  LEDRGB: { type: 'rgb-led' },
  DISPLAY: { type: 'seven-segment' },
  '7SEGMENT': { type: 'seven-segment' },
  '7SEGMENTOS': { type: 'seven-segment' },
  SIETESEGMENTOS: { type: 'seven-segment' },
  SLIDE: { type: 'slide-switch' },
  SLIDESWITCH: { type: 'slide-switch' },
  DESLIZANTE: { type: 'slide-switch' },
  TILT: { type: 'tilt-switch' },
  TILTSWITCH: { type: 'tilt-switch' },
  INCLINACION: { type: 'tilt-switch' },
  TEMPERATURA: { type: 'temperature-sensor' },
  TEMPERATURE: { type: 'temperature-sensor' },
  RELE: { type: 'relay' },
  MOTOR: { type: 'motor' },
  DCMOTOR: { type: 'motor' },
  MOTORDC: { type: 'motor' },
  PIR: { type: 'pir-sensor' },
  HCSR501: { type: 'pir-sensor' },
  'HC-SR501': { type: 'pir-sensor' },
  MOVIMIENTO: { type: 'pir-sensor' },
  TTP223: { type: 'touch-sensor' },
  TOUCH: { type: 'touch-sensor' },
  TACTIL: { type: 'touch-sensor' },
  ULTRASONIC: { type: 'ultrasonic-sensor' },
  ULTRASONICO: { type: 'ultrasonic-sensor' },
  DHT: { type: 'climate-sensor' },
  BME: { type: 'climate-sensor', part: 'BME280' },
  BMP: { type: 'climate-sensor', part: 'BMP280' },
};

const norm = (s) => String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '');

// Every name the kit answers to, for suggestions.
const ALL_NAMES = [...Object.keys(PART_TYPES), ...Object.keys(PART_NUMBERS), ...Object.keys(MODULES), ...Object.keys(LDR_PARTS), ...Object.keys(PART_ALIASES)];

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// The kit's names closest to one it does not know: the same start, contained, or a few edits away.
export function closestNames(name, count = 3, names = ALL_NAMES) {
  const n = norm(name);
  if (!n) return [];
  return names.map((candidate) => {
    const c = norm(candidate);
    const score = c === n ? 0 : c.startsWith(n) || n.startsWith(c) ? 1 : c.includes(n) || n.includes(c) ? 1.5 : distance(n, c);
    return { candidate, score };
  })
    .filter(({ score, candidate }) => score <= Math.max(2, Math.floor(norm(candidate).length / 3)))
    .sort((a, b) => a.score - b.score || a.candidate.localeCompare(b.candidate))
    .slice(0, count)
    .map(({ candidate }) => candidate);
}

// Common asks the kit does not have, by name, to what it has that comes nearest
// (check.UNKNOWN_PART_NAME.<variant>, in every language).
const NEAR = {
  speaker: ['SPEAKER', 'LOUDSPEAKER', 'ALTAVOZ', 'PARLANTE', 'BOCINA'],
  ledstrip: ['LEDSTRIP', 'STRIP', 'TIRALED', 'TIRALEDS', 'TIRADELED', 'TIRADELEDS', 'WS2812', 'WS2812B', 'NEOPIXEL', 'SK6812'],
  servo: ['SERVO', 'SERVOMOTOR', 'SG90', 'MG90S', 'MG996R'],
  transformer: ['TRANSFORMER', 'TRANSFORMADOR', 'TRAFO'],
  lcd: ['LCD', 'LCD1602', 'LCD16X2', 'LCD2004', 'LCD20X4', '1602', 'LCDI2C', 'PANTALLALCD'],
  stepper: ['STEPPER', 'STEPPERMOTOR', '28BYJ48', '28BYJ', 'NEMA17', 'PASOAPASO', 'MOTORPASOAPASO', 'MOTORDEPASOS', 'MOTORPAP'],
  oled: ['OLED', 'SSD1306', 'SH1106', 'PANTALLAOLED', 'OLEDI2C'],
  keypad: ['KEYPAD', 'KEYPAD4X4', 'KEYPAD4X3', 'TECLADO', 'TECLADOMATRICIAL', 'MEMBRANEKEYPAD', 'MATRIXKEYPAD'],
  joystick: ['JOYSTICK', 'KY023', 'PALANCA', 'PALANCADEMANDO'],
  bluetooth: ['BLUETOOTH', 'HC05', 'HC06', 'HM10', 'BLE'],
  wifi: ['WIFI', 'ESP01', 'ESP8266', 'NODEMCU', 'WEMOS', 'D1MINI'],
  sdcard: ['SD', 'SDCARD', 'MICROSD', 'MICROSDCARD', 'TARJETASD', 'TARJETAMICROSD', 'SDMODULE'],
  rtc: ['RTC', 'DS1307', 'DS3231', 'PCF8563', 'TINYRTC', 'REALTIMECLOCK', 'RELOJDETIEMPOREAL', 'RELOJRTC'],
  loadcell: ['LOADCELL', 'HX711', 'CELDADECARGA', 'GALGA', 'STRAINGAUGE', 'BALANZA'],
};
// Words that name a common ask only when they are the whole name ("strip" alone; "pin header strip"
// is no LED strip; "SD" alone, or as "SD card", is the card).
const WHOLE_ONLY = new Set(['STRIP', 'SD', 'BLE']);
// Matched on the whole name, then on the words it contains and the runs of words next to each other
// joined ("LED strip 12V" → LED, STRIP, 12V, LEDSTRIP…; "tira de LED" → TIRADELED), in English and
// Spanish: a size or a voltage written after the name does not hide what was asked.
const nearOf = (name) => {
  const key = norm(name).replace(/[-_.]/g, '');
  const whole = Object.keys(NEAR).find((k) => NEAR[k].includes(key));
  if (whole) return whole;
  const words = String(name ?? '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^A-Z0-9]+/).filter(Boolean);
  const runs = words.flatMap((_, i) => words.slice(i).map((__, j) => words.slice(i, i + j + 1).join(''))).filter((w) => !WHOLE_ONLY.has(w));
  return Object.keys(NEAR).find((k) => runs.some((w) => NEAR[k].includes(w)));
};

// A name the kit does not have: the near part for a common ask, else the closest names, else none
// (each says what to do: check.UNKNOWN_PART_NAME and its variants).
function unknownName(part, name) {
  const params = { part: part.id ?? '?', name: String(name ?? '—') };
  const near = nearOf(name);
  if (near) return { severity: 'error', code: 'UNKNOWN_PART_NAME', params: { ...params, suggestions: '—', variant: near } };
  const suggestions = closestNames(name).join(', ');
  return { severity: 'error', code: 'UNKNOWN_PART_NAME', params: { ...params, suggestions: suggestions || '—', ...(!suggestions && { variant: 'none' }) } };
}

// A part as written to a part the kit can build: { part } or { error }.
export function resolvePart(raw) {
  const part = { ...raw };
  if (PART_TYPES[part.type]) return { part };
  const name = part.type ?? part.part;
  const key = norm(name);
  const typeName = Object.keys(PART_TYPES).find((t) => norm(t) === key);
  if (typeName) {
    const out = { ...part, type: typeName };
    if (norm(part.part) === key) delete out.part;
    return { part: out };
  }
  const alias = PART_ALIASES[key];
  if (alias) {
    const out = { ...part, ...alias };
    if (norm(part.part) === key) delete out.part;
    return { part: out };
  }
  const number = lookupPartNumber(name);
  if (number) return { part: { ...part, type: number.entry.type, part: number.number } };
  const module = lookupModule(name);
  if (module) return { part: { ...part, type: 'module', part: module.id } };
  const ldr = Object.keys(LDR_PARTS).find((k) => norm(k) === key);
  if (ldr) return { part: { ...part, type: 'ldr', part: ldr } };
  return { error: unknownName(part, name) };
}

// The pin names a resolved part takes; for a switch or a board beside the breadboard, all the
// ones it has (a circuit lists only those it uses).
export function pinsOf(part) {
  const type = PART_TYPES[part.type];
  if (!type) return [];
  if (part.type === 'switch') return SWITCH_STYLES[part.style ?? 'rocker']?.pins ?? [];
  if (part.type === 'module') {
    const found = lookupModule(part.part);
    if (found) return found.module.mount === 'straddle' ? found.module.pins : headerPins(found.module);
  }
  const def = type.resolve(part);
  if (def.error) return type.pins ?? [];
  return def.pinNames ?? type.pins ?? [];
}
