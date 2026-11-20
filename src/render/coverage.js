// Coverage raster for measuring a scene, never for display. Polygons are filled into a
// grid in painting order, each cell remembering which part painted it last. From that:
// how much of each part is visible, which part hides it, what a label or a leader line
// passes over.
//
// One cell per screen pixel by default; `cell` makes it coarser for speed.

export function createCoverage(frame, { cell = 1 } = {}) {
  const cols = Math.max(1, Math.ceil(frame.width / cell));
  const rows = Math.max(1, Math.ceil(frame.height / cell));
  const owner = new Int16Array(cols * rows).fill(-1);
  const ids = [];
  const index = new Map();
  // Per part: the cells it painted, in painting order, repeats included (a typed list, not a Set:
  // a long board's parts paint millions of cells, and a Set takes ten times the memory).
  const footprints = [];

  const idOf = (part) => {
    if (!index.has(part)) {
      index.set(part, ids.length);
      ids.push(part);
      footprints.push({ cells: new Int32Array(64), n: 0 });
    }
    return index.get(part);
  };
  const toCol = (x) => (x - frame.x) / cell;
  const toRow = (y) => (y - frame.y) / cell;

  // Scanline fill at cell centres (even-odd rule).
  function fill(pts, visit) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      const r = toRow(p.y);
      if (r < minY) minY = r;
      if (r > maxY) maxY = r;
    }
    const r0 = Math.max(0, Math.ceil(minY - 0.5));
    const r1 = Math.min(rows - 1, Math.floor(maxY - 0.5));
    const xs = [];
    for (let r = r0; r <= r1; r++) {
      const y = r + 0.5;
      xs.length = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const ya = toRow(a.y);
        const yb = toRow(b.y);
        if ((ya <= y && yb > y) || (yb <= y && ya > y)) {
          xs.push(toCol(a.x) + ((y - ya) / (yb - ya)) * (toCol(b.x) - toCol(a.x)));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil(xs[k] - 0.5));
        const c1 = Math.min(cols - 1, Math.floor(xs[k + 1] - 0.5));
        for (let c = c0; c <= c1; c++) visit(r * cols + c);
      }
    }
  }

  return {
    cell,
    // Paint a polygon belonging to `part` (null = background, e.g. the board).
    paint(pts, part) {
      if (part == null) {
        fill(pts, (i) => (owner[i] = -1));
        return;
      }
      const id = idOf(part);
      const fp = footprints[id];
      fill(pts, (i) => {
        owner[i] = id;
        if (fp.n === fp.cells.length) {
          const more = new Int32Array(fp.cells.length * 2);
          more.set(fp.cells);
          fp.cells = more;
        }
        fp.cells[fp.n++] = i;
      });
    },
    // Part that is on top at a screen point, or null.
    at(x, y) {
      const c = Math.floor(toCol(x));
      const r = Math.floor(toRow(y));
      if (c < 0 || r < 0 || c >= cols || r >= rows) return null;
      const id = owner[r * cols + c];
      return id < 0 ? null : ids[id];
    },
    // For every part: area painted, visible share and who covers the rest.
    visibility() {
      const seen = ids.length < 65535 ? new Uint16Array(cols * rows) : new Int32Array(cols * rows); // part id + 1 that counted a cell already
      return ids.map((part, id) => {
        const { cells, n } = footprints[id];
        const hiddenBy = new Map();
        let shown = 0;
        let area = 0;
        for (let k = 0; k < n; k++) {
          const i = cells[k];
          if (seen[i] === id + 1) continue;
          seen[i] = id + 1;
          area++;
          const top = owner[i];
          if (top === id) shown++;
          else if (top >= 0) hiddenBy.set(ids[top], (hiddenBy.get(ids[top]) ?? 0) + 1);
        }
        return {
          part,
          area: area * cell * cell,
          visible: area ? shown / area : 1,
          hiddenBy: [...hiddenBy].map(([by, n]) => ({ part: by, share: n / area })).sort((a, b) => b.share - a.share),
        };
      });
    },
    // Parts under a screen rectangle, with the share of the rectangle each one fills.
    under(box) {
      const counts = new Map();
      let total = 0;
      const c0 = Math.max(0, Math.floor(toCol(box.x)));
      const c1 = Math.min(cols - 1, Math.ceil(toCol(box.x + box.width)) - 1);
      const r0 = Math.max(0, Math.floor(toRow(box.y)));
      const r1 = Math.min(rows - 1, Math.ceil(toRow(box.y + box.height)) - 1);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          total++;
          const id = owner[r * cols + c];
          if (id >= 0) counts.set(ids[id], (counts.get(ids[id]) ?? 0) + 1);
        }
      }
      return [...counts].map(([part, n]) => ({ part, share: total ? n / total : 0 })).sort((a, b) => b.share - a.share);
    },
  };
}
