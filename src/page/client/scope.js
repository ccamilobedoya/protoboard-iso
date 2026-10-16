// The oscilloscope in a part's card (stage 3, phase 7): its traces against time on a dark screen
// with a 10 × 4 grid, like the bench oscilloscope. One plot per trace, stacked, on one time axis:
// never two quantities on one plot with two axes. Each plot scales itself (always showing 0)
// and says its value now; the time axis gives the window's ends. Labelled as a model.
//
//   const scope = createScope(parent, { t, f })
//   scope.draw({ traces: [{ label, unit, color, ink, points: [[t, v], …] }], from, to })
//   (color: the line on the screen; ink: its name on the white card)
//
// Reusable for more channels and for probes on nodes (phase 9): it only draws what it is given.
// Each plot keeps the minimum and the maximum of every pixel column, so no peak is lost.

const NS = 'http://www.w3.org/2000/svg';
const W = 300; // plot width, px of the viewBox
const H = 84; // plot height
const GAP = 16; // above each plot, for its label
const AXIS = 16; // under the last plot, for the time
const LEFT = 4;

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
export function pathOf(points, from, to, lo, hi, width = W, height = H) {
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

export function createScope(parent, { t, f }) {
  const box = document.createElement('div');
  box.className = 'scope';
  parent.appendChild(box);
  const head = document.createElement('h3');
  head.textContent = t('page.scope.title');
  box.appendChild(head);
  const svg = el(box, 'svg', { role: 'img', 'aria-label': t('page.scope.title') });

  return {
    box,
    draw({ traces, from, to }) {
      const height = traces.length * (GAP + H) + AXIS;
      svg.setAttribute('viewBox', `0 0 ${W} ${height}`);
      svg.textContent = '';
      traces.forEach((trace, k) => {
        const top = k * (GAP + H) + GAP;
        const [lo, hi] = scaleOf(trace.points);
        const now = trace.points.length ? trace.points[trace.points.length - 1][1] : null;
        el(svg, 'text', { x: LEFT, y: top - 4, class: 'scope-label', fill: trace.ink ?? trace.color }, `${trace.label}${now != null ? `: ${f(now, trace.unit)}` : ''}`);
        const g = el(svg, 'g', { transform: `translate(0 ${top})` });
        el(g, 'rect', { x: 0, y: 0, width: W, height: H, class: 'scope-screen' });
        for (let i = 1; i < 10; i++) el(g, 'line', { x1: (W / 10) * i, y1: 0, x2: (W / 10) * i, y2: H, class: 'scope-grid' });
        for (let j = 1; j < 4; j++) el(g, 'line', { x1: 0, y1: (H / 4) * j, x2: W, y2: (H / 4) * j, class: 'scope-grid' });
        // The zero line, brighter: where the trace crosses from + to −.
        const zero = H - ((0 - lo) / (hi - lo)) * H;
        el(g, 'line', { x1: 0, y1: zero, x2: W, y2: zero, class: 'scope-zero' });
        el(g, 'text', { x: W - 3, y: 10, class: 'scope-scale' }, f(hi, trace.unit));
        el(g, 'text', { x: W - 3, y: H - 3, class: 'scope-scale' }, f(lo, trace.unit));
        if (trace.points.length) el(g, 'polyline', { points: pathOf(trace.points, from, to, lo, hi), stroke: trace.color, class: 'scope-trace' });
      });
      const base = traces.length * (GAP + H) + 12;
      el(svg, 'text', { x: LEFT, y: base, class: 'scope-time' }, f(from, 's'));
      el(svg, 'text', { x: W / 2, y: base, class: 'scope-time scope-model' }, t('page.scope.model'));
      el(svg, 'text', { x: W, y: base, class: 'scope-time scope-end' }, f(to, 's'));
    },
  };
}
