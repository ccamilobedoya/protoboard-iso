// A part's pinout (a video about one part, F2; docs/en/component-focus.md): what each pin is called
// and does, where it goes into the board on screen, and how to tell the pins apart (the package's
// `mark`), as data for the page (a timeline's `pin` step) and the checks. Nothing is guessed from a
// row or written by hand: the order of the pins on screen and the side of the mark come from the
// camera of the view, so a part turned round says so.
//
//   pinIndex(part, name)            → index of the pin a step names ("B", "base", "2"), or -1
//   pinRole(part, i, lang)          → the pin's row of text ("collector · the load", "3 OUT · output")
//   pinList(part, lang)             → [{ ref, name, text }] what --parts lists
//   pinoutOf(part, camera, lang)    → { kind, pins: [{ name, text, node, x, y }], mark } for the page
//
// `part` is a built part (circuit/build.js); x, y are drawing units of that view, the point where the
// pin goes into the board (a raised part's tip is `lift` × mm above it, page/client/pinout.js).

import { t } from './i18n/index.js';
import { findPin } from './parts/pin-names.js';
import { dot } from './core/vec.js';

const round = (v) => Math.round(v * 10) / 10;
const has = (lang, key) => t(lang, key) !== key;
// A chip numbers its pins: its rows say the number and the name ("3 OUT · output").
const isChip = (part) => part.def?.package === 'dip';

export function pinIndex(part, name) {
  const names = part.pinNames ?? [];
  const found = findPin(names, name);
  if (found !== undefined) return names.indexOf(found);
  // A chip's pin by its number.
  const n = /^\d{1,3}$/.test(String(name)) ? Number(name) : 0;
  return isChip(part) && n >= 1 && n <= names.length ? n - 1 : -1;
}

// The pin's own word in the page's language, when there is one ("anode" → "ánodo").
const word = (name, lang) => (has(lang, `pin.${name}`) ? t(lang, `pin.${name}`) : name);

// What the pin does, by part number first, then by kind of part (src/i18n: pin.role.*), or null.
function role(part, name, lang) {
  for (const key of [`pin.role.${part.raw?.part}.${name}`, `pin.role.${part.type}.${name}`]) if (has(lang, key)) return t(lang, key);
  return null;
}

export function pinRole(part, i, lang = 'en') {
  const name = part.pinNames[i];
  const does = role(part, name, lang);
  if (isChip(part)) return does ? `${i + 1} ${name} · ${does}` : `${i + 1} ${name}`;
  return does ?? word(name, lang);
}

export function pinList(part, lang = 'en') {
  return (part.pinNames ?? []).map((name, i) => ({ ref: `${part.id}.${name}`, name, text: pinRole(part, i, lang) }));
}

// The package's name as a datasheet prints it, when it has one people say (TO-92, DIP-8).
function packageName(part) {
  const id = part.def?.package;
  if (id === 'dip') return `DIP-${part.holes.length}`;
  return /^TO-/.test(id ?? '') ? id : null;
}

// Where the mark is against the middle of the pins, on the board as this camera sees it (its height
// left out): left, right, at the back, in front.
function sideOf(at, holes, camera) {
  const n = holes.length;
  const d = { x: at.x - holes.reduce((s, h) => s + h.pos.x, 0) / n, y: at.y - holes.reduce((s, h) => s + h.pos.y, 0) / n, z: 0 };
  const across = dot(d, camera.right);
  const deep = dot(d, { x: camera.forward.x, y: camera.forward.y, z: 0 });
  if (Math.abs(across) >= Math.abs(deep)) return across < 0 ? 'left' : 'right';
  return deep > 0 ? 'back' : 'front';
}

// The mark's sentence: what it is, which way it faces or where it is, and what it tells.
function markText(part, mark, camera, points, lang) {
  const fromLeft = points.map((p, i) => ({ x: p.x, name: part.pinNames[i] })).sort((a, b) => a.x - b.x).map((p) => p.name).join(' ');
  const side = t(lang, `pinout.side.${sideOf(mark.at, part.holes, camera)}`);
  if (mark.kind === 'flat' || mark.kind === 'tab') {
    const toward = dot(mark.normal, camera.toViewer) > 0 ? 'front' : 'back';
    return t(lang, `pinout.${mark.kind}.${toward}`, { pins: fromLeft });
  }
  if (mark.kind === 'stripe' && part.type === 'capacitor') return t(lang, 'pinout.stripe.capacitor', { side });
  return t(lang, `pinout.${mark.kind}`, { side });
}

export function pinoutOf(part, camera, lang = 'en') {
  const points = part.holes.map((h) => camera.project(h.pos));
  const pins = points.map((p, i) => ({ name: part.pinNames[i], text: pinRole(part, i, lang), node: part.holes[i].node, x: round(p.x), y: round(p.y) }));
  const kind = [t(lang, `type.${part.def?.typeKey ?? part.type}`), packageName(part)].filter(Boolean).join(' · ');
  const mark = part.built?.mark;
  if (!mark) return { kind, pins, mark: null };
  return { kind, pins, mark: { text: markText(part, mark, camera, points, lang) } };
}
