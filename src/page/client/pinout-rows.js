// The rows of a part's pinout (page/client/pinout.js draws them): which side each pin's row goes on,
// its text and the size they share. No DOM: it runs in Node too (test/pinout-rows.test.js).

// Sizes in px at the format's width (1080 portrait, 1920 landscape), never under `min` on a small screen.
export const PINOUT = { row: 28, rowMany: 24, rowH: 52, rowHMany: 46, gap: 60, quiet: 24, dot: 9, line: 2, apart: 10, pad: 14, shrink: 0.65, min: 11 };
const HOLD_ROOM = 1.25; // how much farther apart the tips may end up while rows are held (a hook's push is about 1.2 times)
export const CHAR = 0.62; // a monospaced letter's width, in em (0.6 and a little room)

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
