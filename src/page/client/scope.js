// The oscilloscope in a part's card (stage 3, phase 7): its traces against time on a dark screen
// with a 10 × 4 grid, like the bench oscilloscope. One plot per trace, stacked, on one time axis:
// never two quantities on one plot with two axes. Each plot scales itself (always showing 0)
// and says its value now; the time axis gives the window's ends. Labelled as a model.
//
//   const scope = createScope(parent, { t, f })
//   scope.draw({ traces: [{ label, unit, kind, color, ink, points: [[t, v], …] }], from, to, marks })
//   (kind 'v' or 'i': the colours of the page's theme, see page/style.js; or, without a kind,
//   color: the line on the screen and ink: its name on the card)
//
// `marks` (a recording's probe, M11): [{ t, text }], a dashed line across each plot at time t with
// its text near the top (under the scale's), beside the line on the side with more room (a set: "R1 → 100 kΩ").
//
// `compact` (a recording's probe with size "compact", a box of 12 % of the height): no title and no
// note, each trace's name and value inside its plot, and two axis labels, the top of the scale and
// the end of the window; the plots as wide as the box, so the box is filled, not letterboxed.
//
// `compare` (a recording's probe with compare): a mark may carry `ghost`, the cycles before it
// shifted by whole periods so they run on after it, faint, and `delta`, a text over the plot ("period
// 0.12 s → 0.86 s (×7)"). The marks' texts and the delta are drawn last, with a halo of the
// screen's colour, so the trace never crosses them. `title` in compact: before the trace's name.
//
// Reusable for more channels and for probes on nodes (phase 9): it only draws what it is given.
// Each plot keeps the minimum and the maximum of every pixel column, so no peak is lost.

const NS = 'http://www.w3.org/2000/svg';
const PLOT_W = 300; // plot width, px of the viewBox
const PLOT_H = 84; // plot height
const GAP = 16; // above each plot, for its label
const AXIS = 16; // under the last plot, for the time
const LEFT = 4;
const COMPACT_H = 56; // a compact plot's height: the box is short, the plot as wide as it

function el(parent, tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

// A tidy top of the scale just above |value| (5 V shows on a 6 V screen, not a 10 V one).
const STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
function niceTop(value) {
  if (!(value > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(value));
  for (const m of STEPS) if (m * p >= value * 1.02) return m * p;
  return 10 * p;
}

// The vertical range of a plot: always including 0, symmetric only when it crosses it.
export function scaleOf(points) {
  let lo = 0;
  let hi = 0;
  for (const [, v] of points) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  // The solver's rounding around 0 (1e-18 V when a switch is open) does not make a side.
  const big = Math.max(-lo, hi);
  if (-lo < big * 1e-6 || -lo < 1e-15) lo = 0;
  if (hi < big * 1e-6 || hi < 1e-15) hi = 0;
  const top = niceTop(Math.max(Math.abs(lo), Math.abs(hi), 1e-9));
  if (lo < 0 && hi > 0) return [-top, top];
  return lo < 0 ? [-top, 0] : [0, top];
}

// One polyline from the points: per pixel column, where the line enters, its minimum and maximum,
// and where it leaves (a step stays a step; a fast oscillation shows as a filled band).
export function pathOf(points, from, to, lo, hi, width = PLOT_W, height = PLOT_H) {
  const x = (t) => LEFT + ((t - from) / (to - from || 1)) * (width - LEFT);
  const y = (v) => height - ((v - lo) / (hi - lo || 1)) * height;
  const out = [];
  let col = null;
  let first = 0;
  let min = 0;
  let max = 0;
  let lastV = 0;
  const flush = () => {
    if (col == null) return;
    const cx = Math.max(LEFT, Math.min(width, col)).toFixed(1);
    out.push(`${cx},${y(first).toFixed(1)}`, `${cx},${y(min).toFixed(1)}`, `${cx},${y(max).toFixed(1)}`, `${cx},${y(lastV).toFixed(1)}`);
  };
  for (const [t, v] of points) {
    const c = Math.round(x(t));
    if (c !== col) {
      flush();
      col = c;
      first = min = max = v;
    }
    if (v < min) min = v;
    if (v > max) max = v;
    lastV = v;
  }
  flush();
  return out.join(' ');
}

// The times a trace rises through `level` (by default halfway between its lowest and highest).
export function risings(points, level) {
  if (points.length < 2) return [];
  let lo = Infinity;
  let hi = -Infinity;
  for (const [, v] of points) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const at = level ?? (lo + hi) / 2;
  if (!(hi - lo > 1e-9)) return [];
  const out = [];
  for (let k = 1; k < points.length; k++) {
    const [t0, v0] = points[k - 1];
    const [t1, v1] = points[k];
    if (v0 < at && v1 >= at) out.push(t0 + ((at - v0) / (v1 - v0 || 1)) * (t1 - t0));
  }
  return out;
}
// A comparing box's vertical range: the trace's own extremes with a little room, so its swing fills
// the band between the texts (0 need not show: the shape is what is compared).
export function rangeOf(points) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const [, v] of points) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!(hi > lo)) return scaleOf(points);
  const pad = (hi - lo) * 0.08;
  return [lo - pad, hi + pad];
}
// A trace's period: the last whole cycle between two risings (null with fewer than two).
export function periodOf(points, level) {
  const r = risings(points, level);
  return r.length >= 2 ? r[r.length - 1] - r[r.length - 2] : null;
}

// A comparing box (`compare`, a recording's probe with compare) is laid out in three bands so no text
// ever lies on the trace: on top its name and the set's mark, each on a plate of the screen's colour;
// the trace (and its ghost) in the middle; at the bottom the change, in words, large and in the accent
// ("on 0.08 → 0.40 s · off the same"). Its texts are sized in px on screen (BAND_PX, at the box's
// real size), not in units of the plot. `reading` false leaves the value now out of the name and
// `clock` false the window's end out (compact): what the video does not need to say.
export const BAND_PX = { label: 40, mark: 40, delta: 46 };
// The width of a text before it is laid out (jsdom, or to place one beside another): px per letter.
const ADVANCE = 0.56;
function textWidth(node, size) {
  try {
    const w = node.getBBox?.().width;
    if (w > 0) return w;
  } catch {
    // not laid out (jsdom): estimated below
  }
  return node.textContent.length * size * ADVANCE;
}
// A plate of the screen's colour behind a text (x, y: its anchor and baseline; `anchor` start, middle or end).
function plate(g, node, { x, y, size, anchor = 'start' }) {
  const w = textWidth(node, size);
  const pad = size * 0.25;
  const left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  const r = el(null, 'rect', { x: left - pad, y: y - size * 0.82, width: w + 2 * pad, height: size * 1.06, rx: pad, class: 'scope-plate' });
  g.insertBefore(r, node);
  return { left: left - pad, right: left + w + pad };
}

export function createScope(parent, { t, f, compact = false, title = null, compare = false, reading = true, clock = true }) {
  const box = document.createElement('div');
  box.className = 'scope';
  parent.appendChild(box);
  const head = document.createElement('h3');
  head.textContent = t('page.scope.title');
  if (!compact) box.appendChild(head);
  const svg = el(box, 'svg', { role: 'img', 'aria-label': t('page.scope.title') });
  const gap = compact ? 0 : GAP;
  const axis = compact ? 0 : AXIS;

  return {
    box,
    draw({ traces, from, to, marks = [] }) {
      // Compact, the plot takes the box's proportions (laid out: jsdom has none, the usual width).
      const H = compact ? COMPACT_H : PLOT_H;
      const r = compact ? svg.getBoundingClientRect() : null;
      const W = r?.width > 0 && r?.height > 0 ? Math.round((r.width / r.height) * (traces.length * H)) : PLOT_W;
      const height = traces.length * (gap + H) + axis;
      svg.setAttribute('viewBox', `0 0 ${W} ${height}`);
      svg.textContent = '';
      // Comparing: the bands, in units of the plot for BAND_PX on screen (the box's own scale when it
      // is laid out; jsdom has none: a portrait recording's).
      // BAND_PX are px at 1080 px of the frame's short side, as the caption's sizes.
      const short = Math.min(globalThis.innerWidth || 1080, globalThis.innerHeight || 1920);
      const unit = (r?.height > 0 ? height / r.height : 1 / 3.75) * (short / 1080);
      const band = compare ? { label: BAND_PX.label * unit, mark: BAND_PX.mark * unit, delta: BAND_PX.delta * unit } : null;
      const topBand = band ? Math.max(band.label, band.mark) * 1.2 : 0;
      const bottomBand = band ? band.delta * 1.25 : 0;
      traces.forEach((trace, k) => {
        const top = k * (gap + H) + gap;
        const [lo, hi] = band ? rangeOf(trace.points) : scaleOf(trace.points);
        const now = trace.points.length ? trace.points[trace.points.length - 1][1] : null;
        const name = `${compact && title ? `${title} · ` : ''}${trace.label}${now != null && reading ? `: ${f(now, trace.unit)}` : ''}`;
        const ink = trace.kind ? {} : { fill: trace.ink ?? trace.color };
        if (!compact) el(svg, 'text', { x: LEFT, y: top - 4, class: trace.kind ? `scope-label ${trace.kind}` : 'scope-label', ...ink }, name);
        const g = el(svg, 'g', { transform: `translate(0 ${top})` });
        el(g, 'rect', { x: 0, y: 0, width: W, height: H, class: 'scope-screen' });
        for (let i = 1; i < 10; i++) el(g, 'line', { x1: (W / 10) * i, y1: 0, x2: (W / 10) * i, y2: H, class: 'scope-grid' });
        for (let j = 1; j < 4; j++) el(g, 'line', { x1: 0, y1: (H / 4) * j, x2: W, y2: (H / 4) * j, class: 'scope-grid' });
        const shownMarks = marks.filter((m) => m.t >= from && m.t <= to);
        const xOf = (time) => LEFT + ((time - from) / (to - from || 1)) * (W - LEFT);
        for (const m of shownMarks) el(g, 'line', { x1: xOf(m.t), y1: 0, x2: xOf(m.t), y2: H, class: 'scope-mark' });
        // The trace's own band: the whole plot, or between a comparing box's text bands.
        const lane = el(g, 'g', band ? { transform: `translate(0 ${topBand.toFixed(2)})` } : {});
        const laneH = H - topBand - bottomBand;
        if (!band) {
          // The zero line, brighter: where the trace crosses from + to −.
          const zero = H - ((0 - lo) / (hi - lo)) * H;
          el(lane, 'line', { x1: 0, y1: zero, x2: W, y2: zero, class: 'scope-zero' });
          el(g, 'text', { x: W - 3, y: 10, class: 'scope-scale' }, f(hi, trace.unit));
          if (!compact) el(g, 'text', { x: W - 3, y: H - 3, class: 'scope-scale' }, f(lo, trace.unit));
        }
        // The cycles before a mark, run on after it (compare), under the trace.
        for (const m of marks) {
          const ghost = m.ghost?.filter(([gt]) => gt >= from && gt <= to);
          if (k === 0 && ghost?.length > 1) el(lane, 'polyline', { points: pathOf(ghost, from, to, lo, hi, W, laneH), class: trace.kind ? `scope-trace ghost ${trace.kind}` : 'scope-trace ghost', ...(trace.kind ? {} : { stroke: trace.color }) });
        }
        if (trace.points.length) el(lane, 'polyline', { points: pathOf(trace.points, from, to, lo, hi, W, laneH), class: trace.kind ? `scope-trace ${trace.kind}` : 'scope-trace', ...(trace.kind ? {} : { stroke: trace.color }) });
        const delta = k === 0 ? marks.findLast((m) => m.delta && m.t <= to)?.delta : null;
        if (band) {
          // Top band: the name on the left, each mark's text beside its line, never over the name.
          const y = topBand * 0.8;
          let taken = -Infinity;
          if (compact) {
            const label = el(g, 'text', { x: LEFT + 3, y, class: trace.kind ? `scope-label inside ${trace.kind}` : 'scope-label inside', style: `font-size:${band.label.toFixed(2)}px`, ...ink }, name);
            taken = plate(g, label, { x: LEFT + 3, y, size: band.label }).right;
          }
          for (const m of shownMarks) {
            const text = el(g, 'text', { y, class: 'scope-mark-text', style: `font-size:${band.mark.toFixed(2)}px` }, m.text);
            const w = textWidth(text, band.mark);
            const x = xOf(m.t);
            const gapX = band.mark * 0.4;
            // Right of its line when it fits there, else left of it; past the name either way.
            let at = x + gapX + w <= W ? x + gapX : x - gapX - w;
            if (at < taken + gapX) at = taken + gapX;
            text.setAttribute('x', at.toFixed(2));
            taken = plate(g, text, { x: at, y, size: band.mark }).right;
          }
          if (delta) {
            const text = el(g, 'text', { x: W / 2, y: H - bottomBand * 0.28, class: 'scope-delta', style: `font-size:${band.delta.toFixed(2)}px` }, delta);
            // Never wider than the box: smaller, then, rather than cut.
            let size = band.delta;
            const wide = textWidth(text, size);
            if (wide > W * 0.94) {
              size *= (W * 0.94) / wide;
              text.setAttribute('style', `font-size:${size.toFixed(2)}px`);
            }
            plate(g, text, { x: W / 2, y: H - bottomBand * 0.28, size, anchor: 'middle' });
          }
          if (compact && clock && k === traces.length - 1) el(g, 'text', { x: W - 3, y: H - 3, class: 'scope-scale scope-time-end' }, f(to, 's'));
          return;
        }
        // The marks' texts over the trace, on a halo of the screen (never crossed by it).
        for (const m of shownMarks) {
          const x = xOf(m.t);
          const right = x < W / 2;
          el(g, 'text', { x: right ? x + 3 : x - 3, y: 21, class: right ? 'scope-mark-text' : 'scope-mark-text scope-end' }, m.text);
        }
        if (delta) el(g, 'text', { x: W / 2, y: H - 6, class: 'scope-delta' }, delta);
        // Compact: the name and the value inside the plot, over the trace; the window's end at the bottom.
        if (compact) {
          el(g, 'text', { x: LEFT + 3, y: 12, class: trace.kind ? `scope-label inside ${trace.kind}` : 'scope-label inside', ...ink }, name);
          if (clock && k === traces.length - 1) el(g, 'text', { x: W - 3, y: H - 3, class: 'scope-scale scope-time-end' }, f(to, 's'));
        }
      });
      if (compact) return;
      const base = traces.length * (gap + H) + 12;
      el(svg, 'text', { x: LEFT, y: base, class: 'scope-time' }, f(from, 's'));
      el(svg, 'text', { x: W / 2, y: base, class: 'scope-time scope-model' }, t('page.scope.model'));
      el(svg, 'text', { x: W, y: base, class: 'scope-time scope-end' }, f(to, 's'));
    },
  };
}
