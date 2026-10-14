// Shared palettes. Every part takes its colours from here, so a change in one place
// restyles the whole kit.

// Resistor colour code, IEC 60062. digit: value of the band; multiplier: power of ten.
export const BAND_COLORS = {
  silver: { hex: '#c0c4ca', multiplier: -2, tolerance: 10 },
  gold: { hex: '#c9a43b', multiplier: -1, tolerance: 5 },
  black: { hex: '#1d1d1f', digit: 0, multiplier: 0 },
  brown: { hex: '#7a4a24', digit: 1, multiplier: 1, tolerance: 1 },
  red: { hex: '#cc2f2b', digit: 2, multiplier: 2, tolerance: 2 },
  orange: { hex: '#ec7a26', digit: 3, multiplier: 3 },
  yellow: { hex: '#f3c62d', digit: 4, multiplier: 4 },
  green: { hex: '#2f9b4f', digit: 5, multiplier: 5, tolerance: 0.5 },
  blue: { hex: '#2d63c4', digit: 6, multiplier: 6, tolerance: 0.25 },
  violet: { hex: '#7a4bb3', digit: 7, multiplier: 7, tolerance: 0.1 },
  grey: { hex: '#8b8d91', digit: 8, multiplier: 8, tolerance: 0.05 },
  white: { hex: '#f5f5f2', digit: 9, multiplier: 9 },
};

export const DIGIT_COLORS = Object.entries(BAND_COLORS)
  .filter(([, c]) => c.digit !== undefined)
  .sort((a, b) => a[1].digit - b[1].digit)
  .map(([name]) => name);

export const MULTIPLIER_COLORS = Object.fromEntries(Object.entries(BAND_COLORS).map(([name, c]) => [c.multiplier, name]));

export const TOLERANCE_COLORS = Object.fromEntries(
  Object.entries(BAND_COLORS)
    .filter(([, c]) => c.tolerance !== undefined)
    .map(([name, c]) => [c.tolerance, name]),
);

export const MATERIALS = {
  lead: '#c8ccd2',
  tinned: '#d9dce0',
  carbonFilm: '#d8c398',
  metalFilm: '#8db6dc',
  cement: '#ecebe6',
  cementPrint: '#2b2b2b',
  epoxyBlack: '#2a2a2d',
  glass: '#e98b3a',
  aluminium: '#b9bdc4',
  capSleeve: '#22305a',
  capStripe: '#c7ccd8',
  ceramic: '#d88a3d',
  print: '#e6e6e6',
  tab: '#c4c8cd',
};

export const LED_COLORS = {
  red: '#e0353b',
  green: '#3cbf58',
  yellow: '#f4d23a',
  blue: '#3a7be0',
  white: '#eef1f5',
  orange: '#f28b27',
};

export const WIRE_COLORS = {
  red: '#d33a32',
  black: '#2b2b2e',
  blue: '#2f64c4',
  green: '#2f9b4f',
  yellow: '#f0c330',
  orange: '#ec7a26',
  white: '#f2f2ef',
  violet: '#7a4bb3',
  grey: '#8b8d91',
  brown: '#7a4a24',
};

// Annotation colours for connected groups (nodes): distinct, readable on the board.
export const NODE_COLORS = ['#2a78d6', '#eb6834', '#1f9d55', '#c2399b', '#c99a06', '#6b4fc8', '#0e9aa7', '#d6455d', '#5f7d1e', '#8a5a2b'];

// Bodies of switches, potentiometers and chips.
Object.assign(MATERIALS, {
  switchBase: '#2b2b2e',
  switchPlate: '#c4c8cd',
  potBody: '#2f63ad',
  knob: '#3b3b3f',
  knobMark: '#f2f2ef',
  chip: '#27272b',
  chipMark: '#55555b',
});

// Batteries: holders, cell wraps per chemistry (with the accent at the + end), 9 V block, pouch.
Object.assign(MATERIALS, {
  holder: '#232326',
  nickel: '#d7dadf',
  cellPrint: '#f2f2ef',
  slider: '#e8e8e4',
  trimmer: '#2d6fd1',
  brass: '#c8a24a',
  screwSlot: '#6b5420',
  ldrBody: '#f1ede4',
  ldrTrack: '#d9772b',
  buzzer: '#1f1f22',
  inductor: '#3f8f5a',
});
export const CELL_WRAPS = {
  alkaline: { body: '#2a2c31', accent: '#c9a43b' },
  nimh: { body: '#e9edf2', accent: '#3a7bd5', print: '#26292d' },
  'li-ion': { body: '#2f7d5b', accent: '#2f7d5b' },
  lifepo4: { body: '#3164b0', accent: '#3164b0' },
  lipo: { body: '#cdd2d9', accent: '#d9a43a', print: '#26292d' },
};
