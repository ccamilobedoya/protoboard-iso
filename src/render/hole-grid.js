// The grid of holes continued past the board (stage and video, V4; docs/en/stage-and-video.md):
// the page's background is the breadboard's own lattice, 2.54 mm along its columns and rows, on
// its plane, projected like the board. It is drawn in the drawing (an SVG pattern), so it moves
// and scales with the camera as the board does: a grid fixed on the screen while the board moves
// over it reads as the board floating (the convention of canvases and maps: the grid is the
// ground). Minor marks on every hole, major ones every five, through the columns the board numbers
// (5, 10, 15…); the page fades the minor ones when they crowd (page/client/view.js) and the theme
// chooses dots (the bench) or lines (the stage) (page/style.js). Page only: the static SVG has none.

// The board's lattice on screen: one column step `u`, one row step `v` and the hole the major
// marks go through (`origin`, its id; `o`, where it is), or null. Holes lie at z = 0, so their projections are a lattice too.
export function holeLattice(scene, board) {
  const holes = [...board.holes.values()].filter((h) => h.kind === 'main');
  const at = (col, row) => holes.find((h) => h.col === col && h.row === row);
  const rows = [...new Set(holes.map((h) => h.row))];
  const origin = at(5, rows[0]) ?? holes[0];
  if (!origin) return null;
  const next = at(origin.col + 1, origin.row);
  // The nearest other row in the same column: one pitch away inside a block of rows.
  const across = holes.filter((h) => h.col === origin.col && h.row !== origin.row).sort((a, b) => Math.abs(a.pos.y - origin.pos.y) - Math.abs(b.pos.y - origin.pos.y))[0];
  if (!next || !across) return null;
  const pitch = Math.hypot(next.pos.x - origin.pos.x, next.pos.y - origin.pos.y);
  const p = (h) => scene.camera.project(h.pos);
  const o = p(origin);
  const a = p(next);
  const b = p(across);
  // `across` may be more than one pitch away (a board with one row per block): one pitch of it.
  const k = pitch / Math.hypot(across.pos.x - origin.pos.x, across.pos.y - origin.pos.y);
  return { origin: origin.id, o, u: { x: a.x - o.x, y: a.y - o.y }, v: { x: (b.x - o.x) * k, y: (b.y - o.y) * k } };
}

const n = (x) => Math.round(x * 1000) / 1000;

// The grid's SVG: two patterns (minor, one pitch; major, five) in the lattice's coordinates and two
// rectangles filled with them, as large as the veil (pages pan and zoom out). In pattern units a
// cell is 1 × 1 (or 5 × 5) with its hole at the centre; mark sizes are set by the page per zoom.
export function holeGridSvg(lattice, frame, id) {
  if (!lattice) return '';
  const { o, u, v } = lattice;
  const pattern = (name, size) => {
    const c = size / 2;
    // The cell's centre on the hole: the pattern's origin half a cell back along both steps.
    const m = [u.x, u.y, v.x, v.y, o.x - c * (u.x + v.x), o.y - c * (u.y + v.y)].map(n).join(' ');
    return `<pattern id="${id}-${name}" class="grid-${name}" patternUnits="userSpaceOnUse" width="${size}" height="${size}" patternTransform="matrix(${m})"><path class="grid-line" d="M0 ${c}H${size}M${c} 0V${size}" fill="none" stroke-width="0.04"/><circle class="grid-dot" cx="${c}" cy="${c}" r="0.08"/></pattern>`;
  };
  const m = Math.max(frame.width, frame.height) * 4;
  const rect = (name) => `<rect class="grid-${name}" x="${n(frame.x - m)}" y="${n(frame.y - m)}" width="${n(frame.width + 2 * m)}" height="${n(frame.height + 2 * m)}" fill="url(#${id}-${name})"/>`;
  const step = n(Math.min(Math.hypot(u.x, u.y), Math.hypot(v.x, v.y))); // one pitch, drawing units
  return `<g class="holegrid" data-step="${step}"><defs>${pattern('minor', 1)}${pattern('major', 5)}</defs>${rect('minor')}${rect('major')}</g>`;
}
