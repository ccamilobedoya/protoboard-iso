// The pinout over a part (a video about one part, F2; docs/en/component-focus.md): the pins a
// timeline's `pin` steps light, each a dot at its tip and a leader down and across to its row of text
// under the part, as a datasheet prints it; and the package's mark (`pin` with `mark`): its sentence on
// a quiet line at the bottom of the free area (the mark itself shows in the drawing). The data is page.js's `pinouts`
// (src/pinout.js): names, texts and where each pin goes into the board, per view.
//
// Laid out on screen, in px, inside the area a recording leaves free (page.inset), and drawn in the
// drawing: the leaders, dots and rows in a layer just under the spotlight, so a pin behind a chip's
// body shows its leader coming out from under it (F0's finding). It is drawn again
// whenever the frame, the view or the part's height changes, so it stays on the part.
//
// The rules of F0's findings: each column takes the pins on its side of the part's middle, the one
// nearest the column at the top, so no two leaders cross; two pins at the same x on screen (a DIP's
// pins one behind the other) get leaders a few px apart; a row's text ends before its own leader (the
// rows shrink together, and a row still too long ends in "…"). The rows are placed for every pin of
// the part, lit or not, so they do not move as more pins light.

import { partsRect } from './view.js';
import { CHAR, PINOUT, layoutRows } from './pinout-rows.js';

const NS = 'http://www.w3.org/2000/svg';
const FREE = { top: 0.1, right: 0.06, bottom: 0.1, left: 0.06 }; // in the page, outside a recording

export const fixed = (v) => String(Math.round(v * 100) / 100);
export function make(parent, tag, attrs) {
  const e = parent.ownerDocument.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === 'number' ? fixed(v) : v);
  parent.appendChild(e);
  return e;
}
// A line broken at its spaces into lines of at most `chars` letters (a word longer than that stays whole).
function wrap(text, chars) {
  const out = [];
  for (const word of text.split(' ')) {
    if (out.length && out.at(-1).length + 1 + word.length <= chars) out[out.length - 1] += ` ${word}`;
    else out.push(word);
  }
  return out;
}

// The screen of the current view for a layer drawn in the drawing in px (this pinout, the bench):
// `k` drawing units per px, `toScreen`/`at` between the two (px from the SVG's corner), `u` the
// format's px (1 at 1080 portrait or 1920 landscape), `free` the area a recording leaves free. Null
// when there is nothing to measure yet.
// A part up close in the page (focus-view.js) pins the layout to the frame the view chose
// (`page.layoutBox`): the learner then drags and zooms the drawing, and the texts go with it.
export function screenOf(page) {
  const svg = page.current();
  const r = svg.getBoundingClientRect();
  const box = page.layoutBox ?? page.box;
  if (!box || !(r.width > 0 && r.height > 0)) return null;
  const k = Math.max(box[2] / r.width, box[3] / r.height);
  const toScreen = (x, y) => ({ x: r.width / 2 + (x - box[0] - box[2] / 2) / k, y: r.height / 2 + (y - box[1] - box[3] / 2) / k });
  const at = (x, y) => [box[0] + box[2] / 2 + (x - r.width / 2) * k, box[1] + box[3] / 2 + (y - r.height / 2) * k].map(fixed);
  // In the page (the trial of the part's view) a phone is far narrower than a video: sizes keep a floor.
  const u = Math.max(r.width / (r.width > r.height ? 1920 : 1080), document.body.classList.contains('focus-view') ? 0.6 : 0);
  const inset = page.inset?.() ?? FREE;
  const free = { x0: inset.left * r.width, x1: (1 - inset.right) * r.width, y1: (1 - inset.bottom) * r.height };
  // The key changes when the drawing moves or the free area does (a legend coming in under the part).
  return { svg, rect: r, key: [page.state.view, box, r.width, r.height, Math.round(free.y1)], k, toScreen, at, u, free: { ...free, y0: inset.top * r.height } };
}
// A layer of the current view, just under the spotlight (a pin behind a body shows its line coming
// out from under it), or just over it (`above`: a figure beside the part, never hidden by it), made once
// per view.
export function layerOf(page, name, layers, above = false) {
  const svg = page.current();
  if (!layers.has(svg)) {
    const g = svg.ownerDocument.createElementNS(NS, 'g');
    g.setAttribute('class', name);
    const spot = svg.querySelector(':scope > .spotlight');
    if (spot && above) spot.after(g);
    else if (spot) spot.before(g);
    else svg.append(g);
    layers.set(svg, g);
  }
  return layers.get(svg);
}
// The bottom of what is drawn for a part, px in the layout's screen (the drawing measured as it is now,
// then laid in the frame the texts were set in), or null.
function bodyBottom(page, id, screen) {
  const drawn = partsRect(page, [id]);
  const box = page.box;
  const r = screen.rect;
  if (!drawn || !box) return null;
  const kNow = Math.max(box[2] / r.width, box[3] / r.height);
  return screen.toScreen(0, box[1] + box[3] / 2 + (drawn.bottom - r.top - r.height / 2) * kNow).y;
}

// A pin's tips on screen, the part raised as it is now.
export function tipsOf(page, id, pins, screen) {
  const up = (page.lifted?.get(id) ?? 0) * (page.data.lift ?? 0);
  return pins.map((p) => screen.toScreen(p.x, p.y - up));
}

// A row's letter width in em, measured in the page's own font (up close, so a row is cut only where it
// would really reach the edge: CHAR is a little wider than most monospaced fonts); CHAR when the
// browser cannot measure. A video keeps CHAR, so its frames do not depend on the machine's fonts.
function charOf(layer) {
  const probe = make(layer, 'text', { class: 'row', 'font-size': 100 });
  probe.textContent = 'M'.repeat(20);
  const width = typeof probe.getComputedTextLength === 'function' ? probe.getComputedTextLength() : 0;
  probe.remove();
  return width > 0 ? Math.min(CHAR, width / 2000 + 0.02) : CHAR;
}

export function setupPinout(page) {
  const lit = new Map(); // part → Map(index → { text, k })
  const marks = new Map(); // part → k
  const layers = new WeakMap(); // svg → its layer
  const heldRows = new Map(); // part → the arrangement of its rows while its pins stay lit
  let drawn = '';

  function draw() {
    const data = page.data.pinouts?.[page.state.view] ?? {};
    const screen = screenOf(page);
    const ids = [...new Set([...lit.keys(), ...marks.keys()])].filter((id) => data[id]);
    // The pins with a row, for the symbol's identifiers (figure.js): those go at the row's start.
    page.litPins = new Set([...lit].flatMap(([id, pins]) => [...pins.keys()].map((i) => `${id}.${data[id]?.pins[i]?.name}`)));
    const key = JSON.stringify([screen?.key, page.symbolIds, ids.map((id) => [id, page.lifted?.get(id) ?? 0, [...(lit.get(id) ?? [])].map(([i, p]) => [i, p.k, p.text]), marks.get(id) ?? null])]);
    if (key === drawn) return;
    drawn = key;
    for (const s of page.svgs) layers.get(s)?.replaceChildren();
    page.rowsTop = null;
    for (const id of heldRows.keys()) if (!lit.get(id)?.size) heldRows.delete(id);
    if (!ids.length || !screen) return;
    const under = layerOf(page, 'pinout', layers);
    const { k, at, u, free } = screen;
    const char = page.focusing ? charOf(under) : CHAR;
    for (const id of ids) {
      const pinout = data[id];
      const tips = tipsOf(page, id, pinout.pins, screen);
      // A step's own text takes the pin's row (and its room).
      const own = lit.get(id) ?? new Map();
      // With the symbol beside the part, each row starts with the symbol's name for its pin, unless it
      // already does (a chip's number, a resistor's 1, a capacitor's +).
      const named = pinout.pins.length <= 4 ? page.symbolIds?.[id] : null;
      const withId = (p, text) => (named?.[p.name] && !text.startsWith(`${named[p.name]} · `) ? `${named[p.name]} · ${text}` : text);
      const rowPins = pinout.pins.map((p, i) => ({ ...p, text: withId(p, own.get(i)?.text ?? p.text) }));
      const holdKey = JSON.stringify([page.state.view, screen.rect.width, screen.rect.height, rowPins.map((p) => p.text)]);
      const before = heldRows.get(id)?.key === holdKey ? heldRows.get(id).held : null;
      const laid = layoutRows(rowPins, tips, free, u, Boolean(page.focusing), bodyBottom(page, id, screen), char, before);
      if (laid.held && laid.held !== before) heldRows.set(id, { key: holdKey, held: laid.held });
      const { rows, size } = laid;
      const stroke = PINOUT.line * Math.max(u, 0.5) * k;
      // Where the rows begin on screen: the figure beside the part stays above them (figure.js).
      if (lit.get(id)?.size) page.rowsTop = Math.min(page.rowsTop ?? Infinity, Math.round(Math.min(...rows.filter(Boolean).map((r) => r.y)) - size));
      for (const [i, p] of lit.get(id) ?? []) {
        const row = rows[i];
        if (!row) continue;
        // M19: the dot lights in the first quarter of the arrival; M20: its leader and row come in.
        const g = make(under, 'g', { 'data-pin': `${id}.${pinout.pins[i].name}`, opacity: Math.min(1, p.k * 1.6) });
        const [tx, ty] = at(row.tip.x, row.tip.y);
        const [lx, ly] = at(row.x, row.y);
        const [ex] = row.anchor != null ? at(row.anchor, row.y) : at(row.side === 'left' ? row.end + PINOUT.pad * u : row.end - PINOUT.pad * u, row.y);
        make(g, 'path', { class: 'lead', d: `M${tx} ${ty}H${lx}V${ly}H${ex}`, 'stroke-width': stroke });
        make(g, 'circle', { class: 'tip', cx: tx, cy: ty, r: PINOUT.dot * Math.max(u, 0.5) * k * Math.min(1, p.k * 4) });
        // Rows set whole hug their leader (anchored at its end, running outwards); the others sit at the
        // free area's edges.
        const hug = row.anchor != null;
        const [x, y] = at(hug ? row.anchor + (row.side === 'left' ? -0.3 : 0.3) * size : row.side === 'left' ? free.x0 : free.x1, row.y + size * 0.35 + (1 - p.k) * size * 0.4);
        const text = make(g, 'text', { class: 'row', x, y, 'font-size': size * k, 'text-anchor': (row.side === 'left') === hug ? 'end' : 'start' });
        text.textContent = row.text;
      }
      if (marks.has(id) && pinout.mark) {
        const e = marks.get(id);
        // The quiet lines: the kind of part, then what the mark tells (each fitted to the width; at the
        // smallest size a sentence still too long goes on as many lines as it needs, broken at its spaces:
        // a phone's, where cutting it would lose what it tells).
        const width = free.x1 - free.x0;
        const told = [pinout.kind, pinout.mark.text];
        const qs = Math.max(PINOUT.min, Math.min(PINOUT.quiet * u, width / (Math.max(...told.map((l) => l.length)) * char)));
        const fits = Math.floor(width / (qs * char));
        const lines = told.flatMap((line, n) => (fits >= 12 ? wrap(line, fits) : [line]).map((words) => ({ words, mark: n > 0 })));
        lines.forEach(({ words, mark }, n) => {
          const [x, y] = at(free.x0, free.y1 - (lines.length - 1 - n) * qs * 1.4 - qs * 0.3);
          const t = make(under, 'text', { class: mark ? 'quiet mark' : 'quiet', x, y, 'font-size': qs * k, opacity: e });
          t.textContent = words;
        });
      }
    }
  }

  return {
    // A pin lit (its index in the part), with the step's own text or the kit's; `k`: share of its arrival.
    light(id, index, text) {
      if (!lit.has(id)) lit.set(id, new Map());
      const p = { text: text ?? null, k: 0 };
      lit.get(id).set(index, p);
      return (k) => {
        p.k = k;
        draw();
      };
    },
    mark(id) {
      marks.set(id, 0);
      return (k) => {
        marks.set(id, k);
        draw();
      };
    },
    // The parts with something lit: their short labels stay away (the pinout is what is told).
    get parts() {
      return [...new Set([...lit.keys(), ...marks.keys()])];
    },
    clear() {
      lit.clear();
      marks.clear();
      draw();
    },
    draw,
  };
}
