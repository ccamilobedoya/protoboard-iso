// Moving around the drawing: the visible frame (the SVG viewBox), drag to pan, pinch or wheel to
// zoom, double tap to zoom in. A press that does not move is a tap, left to the click handler
// (page.dragged says which it was).

export const numbers = (text) => text.split(' ').map(Number);

export function setBox(page, [x, y, w, h]) {
  const [bx, by, bw, bh] = numbers(page.current().dataset.board);
  const f = Math.min(Math.max(w, bw / 12), bw * 2) / w;
  const cx = Math.min(Math.max(x + w / 2, bx), bx + bw);
  const cy = Math.min(Math.max(y + h / 2, by), by + bh);
  page.box = [cx - (w * f) / 2, cy - (h * f) / 2, w * f, h * f];
  page.current().setAttribute('viewBox', page.box.map((n) => Math.round(n * 100) / 100).join(' '));
}

// Screen point → drawing point, and drawing units per screen pixel (the SVG keeps its aspect ratio).
function toBox(page, px, py) {
  const { box } = page;
  const r = page.current().getBoundingClientRect();
  const k = Math.max(box[2] / r.width, box[3] / r.height);
  return [box[0] + box[2] / 2 + (px - r.left - r.width / 2) * k, box[1] + box[3] / 2 + (py - r.top - r.height / 2) * k, k];
}
function zoomAt(page, px, py, f) {
  const [x, y] = toBox(page, px, py);
  const { box } = page;
  setBox(page, [x - (x - box[0]) * f, y - (y - box[1]) * f, box[2] * f, box[3] * f]);
}
function panBy(page, dx, dy) {
  const k = toBox(page, 0, 0)[2];
  const { box } = page;
  setBox(page, [box[0] - dx * k, box[1] - dy * k, box[2], box[3]]);
}

// Pointers: one moves the drawing, two also zoom (pinch).
export function setupView(page) {
  const { main, info } = page;
  const pointers = new Map();
  page.dragged = false;
  const centre = () => {
    const ps = [...pointers.values()];
    const x = ps.reduce((a, p) => a + p.x, 0) / ps.length;
    const y = ps.reduce((a, p) => a + p.y, 0) / ps.length;
    return { x, y, d: ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0 };
  };
  main.addEventListener('pointerdown', (e) => {
    if (info.contains(e.target)) return;
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
  main.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(page, e.clientX, e.clientY, Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.002)));
  }, { passive: false });
  main.addEventListener('dblclick', (e) => zoomAt(page, e.clientX, e.clientY, 0.5));
}
