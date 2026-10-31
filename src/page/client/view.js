// Moving around the drawing: the visible frame (the SVG viewBox), drag to pan, pinch or wheel to
// zoom, double tap to zoom to a part, and the zoom buttons. A press that does not move is a tap,
// left to the click handler (page.dragged says which it was).
//
// Where the page lives decides what a finger and the wheel do (UX pass, U1). Alone, or full
// screen, the drawing takes every gesture. Inside an iframe (a lesson note) it behaves like an
// embedded map: one finger and the plain wheel scroll the note, two fingers move and zoom the
// drawing, and Ctrl/⌘ + wheel or a trackpad pinch (a wheel event with ctrlKey) zoom; a short
// hint says so when someone tries the other way. A mouse drag moves the drawing in both cases.

export const numbers = (text) => text.split(' ').map(Number);

// A frame kept on the board: zoom between a twelfth and three times the board (a landscape
// recording shows the whole board in its right half: a little more than twice), centre on it.
export function clampBox(page, [x, y, w, h]) {
  const [bx, by, bw, bh] = numbers(page.current().dataset.board);
  const f = Math.min(Math.max(w, bw / 12), bw * 3) / w;
  const cx = Math.min(Math.max(x + w / 2, bx), bx + bw);
  const cy = Math.min(Math.max(y + h / 2, by), by + bh);
  return [cx - (w * f) / 2, cy - (h * f) / 2, w * f, h * f];
}
// Result tags keep their size on screen (stage and video, V3): closer in, they shrink in the
// drawing, so they never grow over the part they measure; farther out than where they were placed
// they stay as drawn. Each tag (its text and the box before it) is scaled about the text's point,
// the box's centre, by a transform attribute: CSS transform-box measures a text's box differently
// in each browser (its font), and the text left its box in some.
const TAG_PX = 13; // the tags' letters on screen, px (8 drawing units in sim/overlay.js)
const tagsOf = new WeakMap(); // svg → [{ text, rect, x, y }]
function scaleTags(svg, k) {
  if (!tagsOf.has(svg)) {
    tagsOf.set(svg, [...svg.querySelectorAll('.results > text')].map((text) => ({ text, rect: text.previousElementSibling?.tagName.toLowerCase() === 'rect' ? text.previousElementSibling : null, x: Number(text.getAttribute('x')), y: Number(text.getAttribute('y')) })));
  }
  for (const t of tagsOf.get(svg)) {
    const transform = k === 1 ? null : `translate(${t.x} ${t.y}) scale(${k}) translate(${-t.x} ${-t.y})`;
    for (const el of [t.text, t.rect]) {
      if (!el) continue;
      if (transform) el.setAttribute('transform', transform);
      else el.removeAttribute('transform');
    }
  }
}
// The grid of holes (V4, render/hole-grid.js) is in the drawing and scales with it; its marks keep
// their size on screen (lines 1 px, dots of radius 1.8 and 2.6 px) and the minor ones fade out as they crowd
// (fully shown from 10 px apart, gone at 5), as a canvas's grid does. `k`: drawing units per pixel.
const gridOf = new WeakMap(); // svg → { step, minor, major, minorRect } or null
function scaleGrid(svg, k) {
  if (!gridOf.has(svg)) {
    const g = svg.querySelector(':scope > .holegrid');
    const marks = (name) => ({ line: g.querySelector(`pattern.grid-${name} .grid-line`), dot: g.querySelector(`pattern.grid-${name} .grid-dot`) });
    gridOf.set(svg, g ? { step: Number(g.dataset.step), minor: marks('minor'), major: marks('major'), minorRect: g.querySelector(':scope > rect.grid-minor') } : null);
  }
  const grid = gridOf.get(svg);
  if (!grid?.step) return;
  const px = k / grid.step; // a pixel, in the pattern's units (one pitch = 1)
  const r3 = (x) => String(Number(x.toPrecision(3)));
  for (const [m, dot] of [[grid.minor, 1.8], [grid.major, 2.6]]) {
    m.line?.setAttribute('stroke-width', r3(px));
    m.dot?.setAttribute('r', r3(px * dot));
  }
  const fade = Math.min(1, Math.max(0, (grid.step / k - 5) / 5));
  grid.minorRect?.setAttribute('opacity', r3(fade));
}
function apply(page, box) {
  page.box = box;
  const svg = page.current();
  svg.setAttribute('viewBox', box.map((n) => Math.round(n * 100) / 100).join(' '));
  const r = svg.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0)) return;
  scaleGrid(svg, Math.max(box[2] / r.width, box[3] / r.height));
  const k = Math.round(Math.min(1, (TAG_PX / 8) * Math.max(box[2] / r.width, box[3] / r.height)) * 1000) / 1000;
  if (svg.dataset.tagK === String(k)) return;
  svg.dataset.tagK = String(k);
  scaleTags(svg, k);
}
// Gestures set the frame at once (1:1 with the finger), and stop a frame that was moving.
export function setBox(page, box) {
  stopFrame(page);
  apply(page, clampBox(page, box));
}

// Motion (UX pass, U5). The frame moves to a new place in 220 ms (strong ease-out) when a button
// asks for it (fit, zoom, double tap, keeping a part in view); a gesture grabs it at once from
// where it is. The viewBox is not a CSS property, so this is a short requestAnimationFrame loop.
// Reduced motion, or no requestAnimationFrame (jsdom): at once. Under the director (?director=1,
// director.js) the same move runs on its clock instead, so a recording never reads the wall.
const winOf = (page) => page.main.ownerDocument.defaultView;
const reduced = (win) => Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const FRAME_MS = 220;
export const easeOut = (k) => 1 - (1 - k) ** 4; // close to cubic-bezier(0.23, 1, 0.32, 1)
export function stopFrame(page) {
  if (page.frameAnim) winOf(page).cancelAnimationFrame(page.frameAnim);
  page.frameAnim = null;
  page.director?.stopFrame();
}
// The frame a share `e` (already eased) of the way from one box to another: what frameTo draws on
// each animation frame and the director on each tick.
export function frameAt(page, from, to, e) {
  apply(page, from.map((f, i) => f + (to[i] - f) * e));
}
export function frameTo(page, target) {
  const win = winOf(page);
  if (page.director) return page.director.frame(target, { ms: FRAME_MS, ease: easeOut });
  const to = clampBox(page, target);
  stopFrame(page);
  if (!page.box || typeof win.requestAnimationFrame !== 'function' || reduced(win)) return apply(page, to);
  const from = page.box.slice();
  let t0 = null;
  const step = (now) => {
    t0 ??= now;
    const k = Math.min(1, (now - t0) / FRAME_MS);
    frameAt(page, from, to, easeOut(k));
    page.frameAnim = k < 1 ? win.requestAnimationFrame(step) : null;
  };
  page.frameAnim = win.requestAnimationFrame(step);
}

// What the parts take on screen, as they are drawn now, with the labels shown (boxes, or the short
// labels at rest: hidden ones measure nothing) and a small margin, in drawing units; or null.
export function partsBounds(page) {
  const els = [...page.current().querySelectorAll('.under [data-part], .parts [data-part], .labels [data-part], .shortlabels [data-part]')];
  const rects = els.map((el) => el.getBoundingClientRect()).filter((r) => r.width || r.height);
  if (!rects.length) return null;
  const [x0, y0] = toBox(page, Math.min(...rects.map((r) => r.left)), Math.min(...rects.map((r) => r.top)));
  const [x1, y1] = toBox(page, Math.max(...rects.map((r) => r.right)), Math.max(...rects.map((r) => r.bottom)));
  const pad = 0.06 * Math.max(x1 - x0, y1 - y0);
  return [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad];
}

// The reserved margin of a recording (stage and video, V4): the shares of the screen kept free,
// for the caption and for the buttons a platform draws over a video. Portrait (a vertical video):
// the caption from 16 % to 40 % of the height and the bottom 25 %, so the circuit lies between 40
// and 75 %; landscape: the left half, the caption's. At the sides, the caption's own margin
// (page/style.js, --cap-pad: 72 px at 1080 wide and at 1920 wide), so text and circuit line up;
// landscape keeps the caption's top (9 %) at the top and the bottom too.
export const STAGE_INSET = { vertical: { top: 0.4, right: 0.0667, bottom: 0.25, left: 0.0667 }, horizontal: { top: 0.09, right: 0.0375, bottom: 0.09, left: 0.5 } };
// With the oscilloscope's box (M11, body.with-scope; page/style.js) a portrait frame also leaves
// free the band it takes, from 56 % to 75 %; in landscape it lies under the caption, in the left half.
const SCOPE_BOTTOM = 0.44;
export function stageInset(page) {
  const m = page.main.getBoundingClientRect();
  if (m.width > m.height) return STAGE_INSET.horizontal;
  return document.body.classList.contains('with-scope') ? { ...STAGE_INSET.vertical, bottom: SCOPE_BOTTOM } : STAGE_INSET.vertical;
}
// The frame that shows `box` (drawing units), whole, in the part of the screen an inset leaves
// free, centred there. The frame has the screen's proportions, so the drawing is not letterboxed.
export function insetFrame(page, [x, y, w, h], { top = 0, right = 0, bottom = 0, left = 0 }) {
  const m = page.main.getBoundingClientRect();
  if (!(m.width > 0 && m.height > 0)) return [x, y, w, h];
  const fw = m.width * Math.max(0.05, 1 - left - right);
  const fh = m.height * Math.max(0.05, 1 - top - bottom);
  const k = Math.max(w / fw, h / fh); // drawing units per pixel
  const W = m.width * k;
  const H = m.height * k;
  // The free area's centre, as a share of the screen.
  const u = left + (1 - left - right) / 2;
  const v = top + (1 - top - bottom) / 2;
  return [x + w / 2 - u * W, y + h / 2 - v * H, W, H];
}

// The frame a button asks for (UX pass, U6). On a portrait screen the close-up frame (wide, made for
// a landscape page) is replaced by the parts and their labels as they are drawn, with a small
// margin, filling the width, centred in the area the bottom sheet leaves free. page.lastFit keeps
// the frame given, so the inspector can fit again when its sheet appears over an untouched frame.
// A recording (page.inset, V4) fits the same in the area its reserved margin leaves free.
export function fitFrame(page, base) {
  const inset = page.inset?.();
  if (inset) return insetFrame(page, (page.state.fit === 'parts' && partsBounds(page)) || base, inset);
  const m = page.main.getBoundingClientRect();
  if (page.state.fit !== 'parts' || !(m.height > m.width * 1.1)) return base;
  const bounds = partsBounds(page);
  if (!bounds) return base;
  const [bx, by, bw, bh] = bounds;
  const sheet = page.sheetHeight?.() ?? 0;
  const free = Math.max(m.height - sheet, m.height / 2);
  // Width first; if the parts are then taller than the free area, widen until they fit.
  let w = bw;
  const tall = (bh * m.width) / w;
  if (tall > free) w *= tall / free;
  const h = (w * m.height) / m.width;
  const k = w / m.width; // drawing units per pixel
  return [bx + bw / 2 - w / 2, by + bh / 2 + (sheet / 2) * k - h / 2, w, h];
}
export function fitTo(page, base, animate = false) {
  const box = fitFrame(page, base);
  page.lastFit = clampBox(page, box);
  (animate ? frameTo : setBox)(page, box);
}
export const isLastFit = (page) => Boolean(page.lastFit && page.box && page.lastFit.every((n, i) => Math.abs(n - page.box[i]) < 0.5));

// Taps (U6): the parts under a point, topmost first (a copy in the spotlight, a label, the part),
// and the part nearest to a tap that hit none, within a few pixels (more with a finger).
export function partsAt(page, x, y) {
  const doc = page.main.ownerDocument;
  if (typeof doc.elementsFromPoint !== 'function') return [];
  const svg = page.current();
  const ids = [];
  for (const el of doc.elementsFromPoint(x, y)) {
    if (!svg.contains(el)) continue;
    const id = el.closest('[data-part]')?.getAttribute('data-part');
    if (id && page.data.parts[id] && !ids.includes(id)) ids.push(id);
  }
  return ids;
}
export function partNear(page, x, y) {
  const coarse = Boolean(winOf(page).matchMedia?.('(pointer: coarse)').matches);
  for (const r of coarse ? [6, 12] : [3, 6]) {
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const [id] = partsAt(page, x + r * Math.cos(a), y + r * Math.sin(a));
      if (id) return id;
    }
  }
  return null;
}

// Turning the board over is immediate (the maintainer's choice, 2026-10-16: no transition): the
// new view shows at once, with the same zoom and the focused parts where they were. Both views lie
// over each other (main.flipping) only while `frame()` measures the new one.
export function flipView(page, from, to, frame) {
  page.main.classList.add('flipping');
  to.removeAttribute('hidden');
  frame();
  from.setAttribute('hidden', '');
  page.main.classList.remove('flipping');
}

// The new view's frame after a flip: the same zoom (a share of the board), with the focused parts
// where they were on screen (`anchor`, measured before the flip), else on the same place of the
// board seen from the other side (left and right swap).
export function flipFrame(page, from, old, anchor) {
  const [bx, by, bw, bh] = numbers(from.dataset.board);
  const [nx, ny, nw, nh] = numbers(page.current().dataset.board);
  const u = (old[0] + old[2] / 2 - bx) / bw;
  const v = (old[1] + old[3] / 2 - by) / bh;
  const w = (old[2] / bw) * nw;
  const h = (w * old[3]) / old[2];
  setBox(page, [nx + (1 - u) * nw - w / 2, ny + v * nh - h / 2, w, h]);
  const r = anchor && page.state.focus.size ? partsRect(page, [...page.state.focus]) : null;
  if (!r) return;
  // The parts' centre in the drawing, and the drawing point now under the anchor: move by the gap.
  const [cx, cy] = toBox(page, (r.left + r.right) / 2, (r.top + r.bottom) / 2);
  const [ax, ay] = toBox(page, anchor[0], anchor[1]);
  const b = page.box;
  setBox(page, [b[0] + cx - ax, b[1] + cy - ay, b[2], b[3]]);
}

// Screen point → drawing point, and drawing units per screen pixel (the SVG keeps its aspect ratio).
function toBox(page, px, py) {
  const { box } = page;
  const r = page.current().getBoundingClientRect();
  const k = Math.max(box[2] / r.width, box[3] / r.height);
  return [box[0] + box[2] / 2 + (px - r.left - r.width / 2) * k, box[1] + box[3] / 2 + (py - r.top - r.height / 2) * k, k];
}
// The strip in use under a screen point (page.js's `hits`: the holes of every strip on screen),
// or null: a tap that is on no part may still be on a strip (phase 9, the node's card).
export function stripAt(page, px, py) {
  const hits = page.data.hits?.[page.state.view];
  if (!hits?.r || !page.box) return null;
  const [x, y] = toBox(page, px, py);
  const { holes, r } = hits;
  let best = null;
  let near = r * r;
  for (let k = 0; k < holes.length; k += 3) {
    const d = (holes[k] - x) ** 2 + (holes[k + 1] - y) ** 2;
    if (d <= near) {
      near = d;
      best = holes[k + 2];
    }
  }
  return best == null ? null : page.data.strips[best];
}
// `animate`: a button or a double tap asked (the frame moves); a gesture did not (it follows).
function zoomAt(page, px, py, f, animate = false) {
  const [x, y] = toBox(page, px, py);
  const { box } = page;
  (animate ? frameTo : setBox)(page, [x - (x - box[0]) * f, y - (y - box[1]) * f, box[2] * f, box[3] * f]);
}
export function panBy(page, dx, dy, animate = false) {
  const k = toBox(page, 0, 0)[2];
  const { box } = page;
  (animate ? frameTo : setBox)(page, [box[0] - dx * k, box[1] - dy * k, box[2], box[3]]);
}

// Inside a frame of another page, unless the page is full screen.
export function isEmbedded(win) {
  if (win.document.fullscreenElement) return false;
  try {
    return win.self !== win.top;
  } catch {
    return true; // a cross-origin parent can deny even the comparison
  }
}

// Where some parts are drawn on screen (the union of their pieces), or null. Boards and panels
// beside the breadboard (an UNO, the e-paper adapter and its panel) are drawn in the `under` layer.
export function partsRect(page, ids, svg = page.current()) {
  const q = (id) => id.replace(/["\\]/g, '\\$&');
  const els = ids.flatMap((id) => [...svg.querySelectorAll(`.under [data-part="${q(id)}"], .parts [data-part="${q(id)}"]`)]);
  const rects = els.map((el) => el.getBoundingClientRect()).filter((r) => r.width || r.height);
  if (!rects.length) return null;
  return { left: Math.min(...rects.map((r) => r.left)), top: Math.min(...rects.map((r) => r.top)), right: Math.max(...rects.map((r) => r.right)), bottom: Math.max(...rects.map((r) => r.bottom)) };
}

// Frame a part: the box of what is drawn for it, a little more than twice its size, or null.
// `label`: with its short label too (a recording frames the told part and the label it keeps; the
// layer is hidden there by visibility, so it still measures).
export function partBox(page, id, { label = false } = {}) {
  let r = partsRect(page, [id]);
  if (!r) return null;
  const tag = label && page.current().querySelector(`.shortlabels [data-part="${id.replace(/["\\]/g, '\\$&')}"]`)?.getBoundingClientRect();
  if (tag && (tag.width || tag.height)) r = { left: Math.min(r.left, tag.left), top: Math.min(r.top, tag.top), right: Math.max(r.right, tag.right), bottom: Math.max(r.bottom, tag.bottom) };
  const [x0, y0] = toBox(page, r.left, r.top);
  const [x1, y1] = toBox(page, r.right, r.bottom);
  const w = Math.max(x1 - x0, 1) * 2.5;
  const h = Math.max(y1 - y0, 1) * 2.5;
  return [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h];
}
function zoomToPart(page, id) {
  const box = partBox(page, id);
  if (box) frameTo(page, box);
  return Boolean(box);
}

function doubleTap(page, target, x, y) {
  const hit = target.closest && target.closest('[data-part]');
  if (!hit || !zoomToPart(page, hit.getAttribute('data-part'))) zoomAt(page, x, y, 0.5, true);
}

// The hint over the drawing, shown for a moment when a gesture went to the page around it.
function hinter(page) {
  let timer = null;
  return (key) => {
    const el = page.gestureHint;
    if (!el) return;
    el.textContent = page.data.text[key];
    el.classList.add('on');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('on'), 1400);
  };
}

// Pointers: one moves the drawing, two also zoom (pinch). Embedded, touch goes through the touch
// events instead: one finger is left to the browser (it scrolls the note), two are ours.
export function setupView(page) {
  const { main } = page;
  const win = main.ownerDocument.defaultView;
  const pointers = new Map();
  const hint = hinter(page);
  page.dragged = false;
  const update = () => {
    page.embedded = isEmbedded(win);
    main.ownerDocument.body.classList.toggle('embedded', page.embedded);
  };
  update();
  main.ownerDocument.addEventListener('fullscreenchange', update);

  const centre = () => {
    const ps = [...pointers.values()];
    const x = ps.reduce((a, p) => a + p.x, 0) / ps.length;
    const y = ps.reduce((a, p) => a + p.y, 0) / ps.length;
    return { x, y, d: ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0 };
  };
  const touchByTouchEvents = (e) => page.embedded && e.pointerType === 'touch';
  // The zoom buttons show from the first touch of the drawing on (page/style.js).
  const touched = () => main.ownerDocument.body.classList.add('touched');
  for (const type of ['pointerdown', 'wheel', 'touchstart']) main.addEventListener(type, touched, { passive: true });
  main.addEventListener('pointerdown', (e) => {
    if (page.inChrome(e.target) || touchByTouchEvents(e)) return;
    if (!pointers.size) page.dragged = false;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
  });
  main.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (!page.dragged && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 5 && pointers.size < 2) return;
    if (!page.dragged && main.setPointerCapture) for (const id of pointers.keys()) main.setPointerCapture(id);
    page.dragged = true;
    main.classList.add('dragging');
    const before = centre();
    pointers.set(e.pointerId, { ...p, x: e.clientX, y: e.clientY });
    const after = centre();
    panBy(page, after.x - before.x, after.y - before.y);
    if (before.d && after.d) zoomAt(page, after.x, after.y, before.d / after.d);
  });
  const release = (e) => {
    pointers.delete(e.pointerId);
    if (!pointers.size) main.classList.remove('dragging');
  };
  main.addEventListener('pointerup', release);
  main.addEventListener('pointercancel', release);

  // Embedded touch: two fingers move and zoom; one finger scrolls the note (and a tap still taps).
  let pair = null;
  let one = null;
  const two = (e) => {
    const [a, b] = e.touches;
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2, d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
  };
  main.addEventListener('touchstart', (e) => {
    if (!page.embedded || page.inChrome(e.target)) return;
    if (e.touches.length >= 2) {
      pair = two(e);
      one = null;
      page.dragged = true;
    } else {
      pair = null;
      one = { x: e.touches[0].clientX, y: e.touches[0].clientY, hinted: false };
      page.dragged = false;
    }
  }, { passive: true });
  main.addEventListener('touchmove', (e) => {
    if (!page.embedded || page.inChrome(e.target)) return;
    if (e.touches.length >= 2 && pair) {
      if (e.cancelable) e.preventDefault();
      const now = two(e);
      panBy(page, now.x - pair.x, now.y - pair.y);
      if (pair.d && now.d) zoomAt(page, now.x, now.y, pair.d / now.d);
      pair = now;
    } else if (one && !one.hinted && Math.hypot(e.touches[0].clientX - one.x, e.touches[0].clientY - one.y) > 12) {
      one.hinted = true;
      hint('gestureTouch');
    }
  }, { passive: false });
  main.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) pair = null;
  });

  main.addEventListener('wheel', (e) => {
    if (page.inChrome(e.target)) return;
    if (page.embedded && !e.ctrlKey && !e.metaKey) return hint('gestureWheel'); // the note scrolls
    e.preventDefault();
    zoomAt(page, e.clientX, e.clientY, Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.002)));
  }, { passive: false });

  // Double tap (touch, either way) and double-click: zoom to the part, or in by two.
  let lastTap = null;
  let touchZoomed = 0;
  const downs = new Map();
  main.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') downs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  main.addEventListener('pointerup', (e) => {
    const d = downs.get(e.pointerId);
    downs.delete(e.pointerId);
    if (e.pointerType !== 'touch' || !d || page.inChrome(e.target) || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) return;
    const now = e.timeStamp;
    if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
      lastTap = null;
      touchZoomed = now;
      doubleTap(page, e.target, e.clientX, e.clientY);
    } else lastTap = { t: now, x: e.clientX, y: e.clientY };
  });
  main.addEventListener('dblclick', (e) => {
    if (page.inChrome(e.target) || e.timeStamp - touchZoomed < 600) return;
    doubleTap(page, e.target, e.clientX, e.clientY);
  });

  // The zoom buttons: in, out, fit the frame chosen in the bar, full screen (embedded only).
  const zoom = page.zoom;
  if (!zoom) return;
  const middle = () => {
    const r = page.current().getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };
  const doc = main.ownerDocument;
  const full = zoom.querySelector('[data-zoom="full"]');
  const canFull = Boolean(doc.fullscreenEnabled && doc.documentElement.requestFullscreen);
  const refresh = () => {
    if (!full) return;
    const on = Boolean(doc.fullscreenElement);
    full.hidden = !page.embedded && !on;
    full.setAttribute('aria-pressed', String(on));
    full.title = page.data.text[on ? 'fullscreenExit' : 'fullscreen'];
    full.setAttribute('aria-label', full.title);
  };
  refresh();
  doc.addEventListener('fullscreenchange', refresh);
  zoom.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-zoom]');
    if (!b) return;
    const what = b.dataset.zoom;
    if (what === 'in') zoomAt(page, ...middle(), 1 / 1.5, true);
    else if (what === 'out') zoomAt(page, ...middle(), 1.5, true);
    else if (what === 'fit') fitTo(page, numbers(page.current().dataset[page.state.fit]), true);
    else if (what === 'full') {
      if (doc.fullscreenElement) doc.exitFullscreen();
      else if (canFull) doc.documentElement.requestFullscreen().catch(() => win.open(win.location.href, '_blank', 'noopener'));
      else win.open(win.location.href, '_blank', 'noopener');
    }
  });
  zoom.hidden = false;
}
