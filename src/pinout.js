// A part's pinout (a video about one part, F2; docs/en/component-focus.md): what each pin is called
// and does, where it goes into the board on screen, and how to tell the pins apart (the package's
// `mark`), as data for the page (a timeline's `pin` step) and the checks. Nothing is guessed from a
// row or written by hand: the order of the pins on screen and the side of the mark come from the
// camera of the view, so a part turned round says so.
//
//   pinIndex(part, name)            → index of the pin a step names ("B", "base", "2"), or -1
//   pinRole(part, i, lang)          → the pin's row of text ("collector · the load", "3 OUT · output")
//   pinList(part, lang)             → [{ ref, name, text }] what --parts lists
//   pinoutOf(part, camera, lang)    → { kind, pins: [{ name, word, text, id, node, x, y }], mark } for the page
//                                    (word: the pin's name in the page's language, "ánodo")
//
// `part` is a built part (circuit/build.js); x, y are drawing units of that view, the point where the
// pin goes into the board (a raised part's tip is `lift` × mm above it, page/client/pinout.js).

import { t } from './i18n/index.js';
import { findPin } from './parts/pin-names.js';
import { dot } from './core/vec.js';
import { symbolOf } from './parts/symbols.js';

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

// What the pin does, by part number first, then by its family (an AMS1117 module of either voltage),
// then by kind of part (src/i18n: pin.role.*), or null.
function role(part, name, lang) {
  const family = part.def?.electrical?.family;
  for (const key of [`pin.role.${part.raw?.part}.${name}`, family && `pin.role.${family}.${name}`, `pin.role.${part.type}.${name}`]) if (key && has(lang, key)) return t(lang, key);
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
  // Each pin by what the part prints for it, when the symbol says (a module's VIN), else its name.
  const ids = symbolOf(part)?.ids ?? {};
  const fromLeft = points.map((p, i) => ({ x: p.x, name: ids[part.pinNames[i]] ?? part.pinNames[i] })).sort((a, b) => a.x - b.x).map((p) => p.name).join(' ');
  const side = t(lang, `pinout.side.${sideOf(mark.at, part.holes, camera)}`);
  // A face that points one way (a flat face, a tab, a potentiometer's knob, a trimmer's printed face):
  // toward the viewer or away, and the pins as they are then from the left.
  if (['flat', 'tab', 'knob', 'face'].includes(mark.kind)) {
    const toward = dot(mark.normal, camera.toViewer) > 0 ? 'front' : 'back';
    return t(lang, `pinout.${mark.kind}.${toward}`, { pins: fromLeft });
  }
  if (mark.kind === 'stripe' && part.type === 'capacitor') return t(lang, 'pinout.stripe.capacitor', { side });
  return t(lang, `pinout.${mark.kind}`, { side });
}

export function pinoutOf(part, camera, lang = 'en') {
  const points = part.holes.map((h) => camera.project(h.pos));
  // `id`: what the symbol and the inside view call the pin (B, C, E; A, K; a chip's number), the letter
  // the part carries beside either figure.
  const ids = symbolOf(part)?.ids ?? {};
  const pins = points.map((p, i) => ({ name: part.pinNames[i], word: word(part.pinNames[i], lang), text: pinRole(part, i, lang), ...(ids[part.pinNames[i]] && { id: ids[part.pinNames[i]] }), node: part.holes[i].node, x: round(p.x), y: round(p.y) }));
  const kind = [t(lang, `type.${part.def?.typeKey ?? part.type}`), packageName(part)].filter(Boolean).join(' · ');
  const mark = part.built?.mark;
  if (!mark) return { kind, pins, mark: null };
  return { kind, pins, mark: { text: markText(part, mark, camera, points, lang) } };
}
