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

// A frame kept on the board: zoom between a twelfth and twice the board, centre on it.
function clampBox(page, [x, y, w, h]) {
  const [bx, by, bw, bh] = numbers(page.current().dataset.board);
  const f = Math.min(Math.max(w, bw / 12), bw * 2) / w;
  const cx = Math.min(Math.max(x + w / 2, bx), bx + bw);
  const cy = Math.min(Math.max(y + h / 2, by), by + bh);
  return [cx - (w * f) / 2, cy - (h * f) / 2, w * f, h * f];
}
function apply(page, box) {
  page.box = box;
  page.current().setAttribute('viewBox', box.map((n) => Math.round(n * 100) / 100).join(' '));
}
// Gestures set the frame at once (1:1 with the finger), and stop a frame that was moving.
export function setBox(page, box) {
  stopFrame(page);
  apply(page, clampBox(page, box));
}

// Motion (UX pass, U5). The frame moves to a new place in 220 ms (strong ease-out) when a button
// asks for it (fit, zoom, double tap, keeping a part in view); a gesture grabs it at once from
// where it is. The viewBox is not a CSS property, so this is a short requestAnimationFrame loop.
// Reduced motion, or no requestAnimationFrame (jsdom): at once.
const winOf = (page) => page.main.ownerDocument.defaultView;
const reduced = (win) => Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const FRAME_MS = 220;
export function stopFrame(page) {
  if (page.frameAnim) winOf(page).cancelAnimationFrame(page.frameAnim);
  page.frameAnim = null;
}
export function frameTo(page, target) {
  const win = winOf(page);
  const to = clampBox(page, target);
  stopFrame(page);
  if (!page.box || typeof win.requestAnimationFrame !== 'function' || reduced(win)) return apply(page, to);
  const from = page.box.slice();
  let t0 = null;
  const step = (now) => {
    t0 ??= now;
    const k = Math.min(1, (now - t0) / FRAME_MS);
    const e = 1 - (1 - k) ** 4; // close to cubic-bezier(0.23, 1, 0.32, 1)
    apply(page, from.map((f, i) => f + (to[i] - f) * e));
    page.frameAnim = k < 1 ? win.requestAnimationFrame(step) : null;
  };
  page.frameAnim = win.requestAnimationFrame(step);
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

// Where some parts are drawn on screen (the union of their pieces), or null.
export function partsRect(page, ids, svg = page.current()) {
  const els = ids.flatMap((id) => [...svg.querySelectorAll(`.parts [data-part="${id.replace(/["\\]/g, '\\$&')}"]`)]);
  const rects = els.map((el) => el.getBoundingClientRect()).filter((r) => r.width || r.height);
  if (!rects.length) return null;
  return { left: Math.min(...rects.map((r) => r.left)), top: Math.min(...rects.map((r) => r.top)), right: Math.max(...rects.map((r) => r.right)), bottom: Math.max(...rects.map((r) => r.bottom)) };
}

// Frame a part: the box of what is drawn for it, a little more than twice its size.
function zoomToPart(page, id) {
  const r = partsRect(page, [id]);
  if (!r) return false;
  const [x0, y0] = toBox(page, r.left, r.top);
  const [x1, y1] = toBox(page, r.right, r.bottom);
  const w = Math.max(x1 - x0, 1) * 2.5;
  const h = Math.max(y1 - y0, 1) * 2.5;
  frameTo(page, [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h]);
  return true;
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
    else if (what === 'fit') frameTo(page, numbers(page.current().dataset[page.state.fit]));
    else if (what === 'full') {
      if (doc.fullscreenElement) doc.exitFullscreen();
      else if (canFull) doc.documentElement.requestFullscreen().catch(() => win.open(win.location.href, '_blank', 'noopener'));
      else win.open(win.location.href, '_blank', 'noopener');
    }
  });
  zoom.hidden = false;
}
