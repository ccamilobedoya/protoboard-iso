// Flat shading: one tone per face from its normal and the camera's key light.
// Anatomy uses four fixed tones (top, left, right, outline); here the tone follows the
// normal, so curved parts get a smooth ramp and any camera angle still works.

import { dot } from '../core/vec.js';

function parseHex(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (rgb) => `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;

// k < 1 darkens towards black, k > 1 lightens towards white.
export function tone(hex, k) {
  const rgb = parseHex(hex);
  if (k <= 1) return toHex(rgb.map((c) => c * k));
  const t = Math.min(1, k - 1);
  return toHex(rgb.map((c) => c + (255 - c) * t));
}

export const darker = (hex, amount = 0.3) => tone(hex, 1 - amount);

// Brightness factor for a face. Faces turned to the light reach 1.08, faces in shadow
// keep 0.62 so dark materials never turn pure black.
export function brightness(normal, camera) {
  const lambert = Math.max(0, dot(normal, camera.light));
  return 0.62 + 0.46 * lambert;
}

export const shade = (hex, normal, camera) => tone(hex, brightness(normal, camera));
