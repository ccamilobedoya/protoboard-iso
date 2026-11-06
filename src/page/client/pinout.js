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

const NS = 'http://www.w3.org/2000/svg';
// Sizes in px at the format's width (1080 portrait, 1920 landscape), never under `min` on a small screen.
export const PINOUT = { row: 28, rowMany: 24, rowH: 52, rowHMany: 46, gap: 60, quiet: 24, dot: 9, line: 2, apart: 10, pad: 14, shrink: 0.65, min: 11 };
const HOLD_ROOM = 1.25; // how much farther apart the tips may end up while rows are held (a hook's push is about 1.2 times)
export const CHAR = 0.62; // a monospaced letter's width, in em (0.6 and a little room)
const FREE = { top: 0.1, right: 0.06, bottom: 0.1, left: 0.06 }; // in the page, outside a recording

export const fixed = (v) => String(Math.round(v * 100) / 100);
export function make(parent, tag, attrs) {
  const e = parent.ownerDocument.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === 'number' ? fixed(v) : v);
  parent.appendChild(e);
  return e;
}
// A row's text cut to `chars` letters, with "…" when it was longer.
const cut = (text, chars) => (text.length <= chars ? text : `${text.slice(0, Math.max(1, chars - 1))}…`);

// The rows of one part: for each pin, its tip on screen, the x of its leader and its row (column,
// y, text), and the font size they share. `tips`: [{ x, y }] px; `free`: { x0, x1, y1 } px.
// Two columns, each taking the pins on its side of the part's middle; when a row would still be cut
// there, all the rows in one column on the side with more room (the pins nearest it at the top: no
// leader crosses either), if that keeps every row whole.
// `whole`: rows never shrink or cut; each hugs its leader and runs past the screen's edge if it must (a
// part up close in the page, where the drawing can be dragged).
// `held`: the arrangement an earlier frame chose (the answer's `held`). While the camera moves the tips
// change a little on every frame, and choosing again would make the rows jump between arrangements and
// their letters change size: with `held`, each pin keeps its side, its text and the size, and only the
// leaders and the rows' height follow the tips. A move too large for it (a row over its leader, two
// leaders crossing) chooses again.
export function layoutRows(pins, tips, free, u, whole = false, held = null) {
  if (held && !whole) {
    const kept = arrange(pins, tips, free, u, 'two', false, held);
    if (stillClean(kept.rows, PINOUT.pad * u)) return { ...kept, held };
  }
  if (whole) return choose(pins, tips, free, u, true);
  // Chosen with room for the camera to push in (its leaders move outwards), so that it holds.
  const mid = tips.reduce((s, p) => s + p.x, 0) / tips.length;
  const chosen = choose(pins, tips.map((p) => ({ ...p, x: mid + (p.x - mid) * HOLD_ROOM })), free, u, false);
  const next = { left: new Set(chosen.rows.flatMap((r, i) => (r?.side === 'left' ? [i] : []))), size: chosen.size, texts: chosen.rows.map((r) => r?.text) };
  return { ...arrange(pins, tips, free, u, 'two', false, next), held: next };
}

// Whether rows held from an earlier frame still read: each text short of its own leader, and no leader
// over another's way: its tip's level to its corner, down to its row, along its row.
function stillClean(rows, pad) {
  const list = rows.filter(Boolean);
  const reach = (r) => (r.side === 'left' ? r.end + pad : r.end - pad);
  if (list.some((r) => (r.side === 'left' ? reach(r) > r.x : reach(r) < r.x))) return false;
  const segs = (r) => [[r.tip.x, r.tip.y, r.x, r.tip.y], [r.x, r.tip.y, r.x, r.y], [r.x, r.y, reach(r), r.y]];
  const meet = ([a, b, c, d], [e, f, g, h]) => Math.min(a, c) <= Math.max(e, g) && Math.min(e, g) <= Math.max(a, c) && Math.min(b, d) <= Math.max(f, h) && Math.min(f, h) <= Math.max(b, d);
  return !list.some((r, i) => list.slice(i + 1).some((o) => segs(r).some((s) => segs(o).some((q) => meet(s, q)))));
}

function choose(pins, tips, free, u, whole) {
  const two = arrange(pins, tips, free, u, 'two', whole);
  if (whole || !two.cut) return two;
  const mid = tips.reduce((s, p) => s + p.x, 0) / tips.length;
  const one = arrange(pins, tips, free, u, free.x1 - mid > mid - free.x0 ? 'right' : 'left');
  return one.cut < two.cut ? one : two;
}

function arrange(pins, tips, free, u, split, whole = false, held = null) {
  const many = pins.length > 4;
  const lowest = Math.max(...tips.map((p) => p.y));
  const mid = tips.reduce((s, p) => s + p.x, 0) / tips.length;
  const order = tips.map((p, i) => ({ i, x: p.x, y: p.y }));
  const onLeft = (p) => (held ? held.left.has(p.i) : split === 'two' ? p.x <= mid : split === 'left');
  const left = order.filter(onLeft).sort((a, b) => a.x - b.x || a.y - b.y);
  const right = order.filter((p) => !onLeft(p)).sort((a, b) => b.x - a.x || a.y - b.y);
  const rowH = (many ? PINOUT.rowHMany : PINOUT.rowH) * u;
  const n = Math.max(left.length, right.length);
  // Under the part, above the quiet lines kept at the bottom of the free area.
  const reserve = 2 * PINOUT.quiet * 1.4 * u + PINOUT.pad * u;
  const top = Math.min(lowest + PINOUT.gap * u, free.y1 - reserve - rowH * (n - 1));
  const apart = PINOUT.apart * u;
  const rows = [];
  for (const [side, list] of [['left', left], ['right', right]]) {
    // Leaders a few px apart, farther from the column a row lower. Walked from the lowest row up, so
    // of two pins at one x the one with the higher tip moves (a chip's pin behind the body): the
    // other's leader then starts clear of it, where moving that one would start it on the first's.
    let below = null;
    for (let k = list.length - 1; k >= 0; k--) {
      const p = list[k];
      let x = p.x;
      if (below != null) x = side === 'left' ? Math.min(x, below - apart) : Math.max(x, below + apart);
      below = x;
      rows[p.i] = { side, tip: tips[p.i], x, y: top + rowH * k };
    }
  }
  // The font: the format's size, smaller (down to `shrink` of it) when a row would reach its own leader.
  const pad = PINOUT.pad * u;
  const room = (r) => (r.side === 'left' ? r.x - pad - free.x0 : free.x1 - pad - r.x);
  const base = (many ? PINOUT.rowMany : PINOUT.row) * u;
  if (whole) {
    const size = Math.max(PINOUT.min, base);
    for (const [i, r] of rows.entries()) {
      r.text = pins[i].text;
      const width = r.text.length * size * CHAR;
      r.end = r.side === 'left' ? r.x - pad - width : r.x + pad + width;
      r.anchor = r.side === 'left' ? r.x - pad : r.x + pad;
    }
    return { rows, size, cut: 0 };
  }
  if (held) {
    for (const [i, r] of rows.entries()) {
      r.text = held.texts[i];
      r.end = r.side === 'left' ? free.x0 + r.text.length * held.size * CHAR : free.x1 - r.text.length * held.size * CHAR;
    }
    return { rows, size: held.size, cut: 0 };
  }
  let size = base;
  for (const [i, r] of rows.entries()) size = Math.min(size, Math.max(base * PINOUT.shrink, room(r) / (pins[i].text.length * CHAR)));
  size = Math.max(PINOUT.min, size);
  let cutBy = 0;
  for (const [i, r] of rows.entries()) {
    r.text = cut(pins[i].text, Math.floor(room(r) / (size * CHAR)));
    cutBy += pins[i].text.length - r.text.length + (r.text.length < pins[i].text.length ? 1 : 0);
    r.end = r.side === 'left' ? free.x0 + r.text.length * size * CHAR : free.x1 - r.text.length * size * CHAR;
  }
  return { rows, size, cut: cutBy };
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
// A pin's tips on screen, the part raised as it is now.
export function tipsOf(page, id, pins, screen) {
  const up = (page.lifted?.get(id) ?? 0) * (page.data.lift ?? 0);
  return pins.map((p) => screen.toScreen(p.x, p.y - up));
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
    for (const id of ids) {
      const pinout = data[id];
      const tips = tipsOf(page, id, pinout.pins, screen);
      // A step's own text takes the pin's row (and its room).
      const own = lit.get(id) ?? new Map();
      // With the symbol beside the part, each row starts with the symbol's name for its pin (a chip's
      // rows already start with its number).
      const named = pinout.pins.length <= 4 ? page.symbolIds?.[id] : null;
      const rowPins = pinout.pins.map((p, i) => ({ ...p, text: [named?.[p.name], own.get(i)?.text ?? p.text].filter(Boolean).join(' · ') }));
      const holdKey = JSON.stringify([page.state.view, screen.rect.width, screen.rect.height, rowPins.map((p) => p.text)]);
      const before = heldRows.get(id)?.key === holdKey ? heldRows.get(id).held : null;
      const laid = layoutRows(rowPins, tips, free, u, Boolean(page.focusing), before);
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
        // The quiet lines: the kind of part, then what the mark tells (each fitted to the width).
        const lines = [pinout.kind, pinout.mark.text];
        const width = free.x1 - free.x0;
        const qs = Math.max(PINOUT.min, Math.min(PINOUT.quiet * u, width / (Math.max(...lines.map((l) => l.length)) * CHAR)));
        lines.forEach((words, n) => {
          const [x, y] = at(free.x0, free.y1 - (lines.length - 1 - n) * qs * 1.4 - qs * 0.3);
          const t = make(under, 'text', { class: n ? 'quiet mark' : 'quiet', x, y, 'font-size': qs * k, opacity: e });
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
