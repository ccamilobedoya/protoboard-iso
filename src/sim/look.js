// How the conductor view looks: voltage colours, dot speed, shading inside bodies. No imports:
// the static drawing (paths.js, Node) and the live page (page/client/, bundled) share it.

export const MIN_CURRENT = 1e-6; // below a microampere nothing moves
export const DOT_PERIOD = 9; // one dot every 9 px
export const MAX_SPEED = 60; // px/s of the largest current in the circuit (proportional scale)
export const FLOATING_COLOR = '#d9d7d2';

// Voltage colours, v / vmax from −1 to 1: the colours of the rails (red +, blue −), which also
// read with colour blindness; grey at 0 V.
export const VOLTAGE_COLORS = { negative: '#1f5fbf', zero: '#a3a19c', positive: '#d62828' };
// Inside a body the voltage changes along a steep S curve (tanh, this steepness): most of the
// change happens in the middle of the part, so it reads as "the drop is here", still shaded.
export const BODY_STEEPNESS = 7;

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

export function voltageColor(v, vmax) {
  const p = VOLTAGE_COLORS;
  if (v == null || !Number.isFinite(v)) return FLOATING_COLOR;
  const t = vmax > 0 ? Math.max(-1, Math.min(1, v / vmax)) : 0;
  const zero = rgb(p.zero);
  const end = rgb(t >= 0 ? p.positive : p.negative);
  return hex(zero.map((z, i) => z + (end[i] - z) * Math.abs(t)));
}

// Dot speed in px/s. Proportional: half the current, half the speed (the peak is the largest
// current in the circuit). Logarithmic: microamperes crawl and amperes race.
export function dotSpeed(current, peak, scale = 'linear') {
  const a = Math.abs(current);
  if (a < MIN_CURRENT) return 0;
  if (scale === 'log') return Math.min(150, 12 + 22 * Math.log10(a / MIN_CURRENT));
  return peak > 0 ? (MAX_SPEED * a) / peak : 0;
}

// Share of the way from a lead's voltage to the middle of the body, t from 0 (lead) to 1 (middle):
// the first half of an S curve across the whole body, scaled so the middle gets exactly 1.
export function bodyShare(t) {
  const s = (u) => Math.tanh(BODY_STEEPNESS * (u - 0.5));
  return (s(t / 2) - s(0)) / (s(0.5) - s(0));
}

// A body piece's voltage: from its lead's towards the middle of the part.
export const bodyVoltage = (pin, centre, share) => (pin == null || centre == null ? null : pin + (centre - pin) * share);

// The voltage at the middle of a part: the mean of its pins' (floating pins left out).
export function centreVoltage(pins) {
  const known = Object.values(pins ?? {}).filter((v) => v != null);
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
}

// A lit LED: opacity from its current against its rated current (brightness), on a square-root
// scale as the eye sees it: a tenth of the rated current still shows clearly, none shows nothing.
export function glowOpacity(brightness) {
  const b = Math.min(1, Math.max(0, brightness ?? 0));
  return b < 0.002 ? 0 : Math.min(1, 0.2 + 0.8 * Math.sqrt(b));
}
// Heat tint: nothing below a fifth of the rated power, full at the rating.
export const heatOpacity = (ratio) => Math.min(0.7, Math.max(0, ((ratio ?? 0) - 0.2) / 0.8) * 0.7);
