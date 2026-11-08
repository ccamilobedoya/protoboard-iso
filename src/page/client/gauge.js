// The indicator of a field of the environment (sensors, S0; docs/en/environment.md): a small SVG,
// 44 × 44 CSS px in the panel and the card, larger in a recording's box. Nothing is drawn on the
// board: light is "on at a level", and every sensor of that field receives it; this icon is where
// the learner sees the level.
//
// - The default is a gauge: an arc from min to max, a needle, the value under it (a log field moves
//   along its log scale, as its slider does).
// - light: a sun whose halo and rays grow with the log of the light (0.1 lx dark … 10 klx full).
// - temperature: a thermometer whose column rises from min to max.
// - a switch (rain, motion, touch, vibration, tilt, beam): a lamp that lights. The rest (reflectance
//   among them) take the default arc.
//
// The dial spans def.min…def.max: the field's slider range, which a circuit (`environment.<field>.range`),
// `page.controls` or a timeline's gauge step may narrow so the change is seen (docs/en/environment.md).
// A value outside it pins the needle (or fill) at the end; the words under it still say the value.
// The root carries `data-pos` (the position, 0…1, on the field's scale) with `data-min` and
// `data-max`, kept in step by update().
//
// createGauge(field, def, { text }) → { el, update(value) }: `def` is the field's registry entry
// (sim/environment.js FIELDS) with the dial's min and max, text(value) the words under it. update() only writes attributes and
// text that changed: no node is rebuilt, nothing is laid out again, no CSS filter.

const NS = 'http://www.w3.org/2000/svg';
const SIZE = 44;
const C = { x: 22, y: 21 }; // the dial's centre
const R = 15; // its radius
const SWEEP = 1.5 * Math.PI; // 270°, open at the bottom
const ARC = R * SWEEP; // the arc's length

function node(parent, tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (parent) parent.appendChild(e);
  return e;
}
// Where a value sits between the field's min and max, 0…1, on its scale.
export function gaugePosition(def, v) {
  if (!Number.isFinite(v)) return 0;
  const u = def.scale === 'log' ? Math.log(Math.max(v, def.min) / def.min) / Math.log(def.max / def.min) : (v - def.min) / (def.max - def.min);
  return Math.min(1, Math.max(0, u));
}
const at = (angle, r) => [C.x + r * Math.cos(angle), C.y + r * Math.sin(angle)];
const round = (n) => Math.round(n * 100) / 100;

export function createGauge(field, def, { text = (v) => String(v), label = '' } = {}) {
  const el = node(null, 'svg', { class: `gauge gauge-${field}`, viewBox: `0 0 ${SIZE} ${SIZE}`, width: SIZE, height: SIZE, role: 'img' });
  const title = node(el, 'title');
  const words = node(el, 'text', { x: 22, y: 41.5 });
  const writes = new Map(); // what update() last wrote, by key: only changes reach the DOM
  const write = (key, e, attr, value) => {
    if (writes.get(key) === value) return;
    writes.set(key, value);
    if (attr === 'text') e.textContent = value;
    else e.setAttribute(attr, value);
  };
  write('min', el, 'data-min', String(def.min));
  write('max', el, 'data-max', String(def.max));
  let paint;
  if (def.kind === 'switch') {
    const lamp = node(el, 'circle', { class: 'lamp', cx: 22, cy: 18, r: 9 });
    const ring = node(el, 'circle', { class: 'lamp-ring', cx: 22, cy: 18, r: 13 });
    paint = (v) => {
      write('lamp', lamp, 'fill-opacity', v ? '1' : '0.12');
      write('ring', ring, 'stroke-opacity', v ? '0.6' : '0');
    };
  } else if (field === 'light') {
    const halo = node(el, 'circle', { class: 'sun-halo', cx: 22, cy: 18, r: 14 });
    const rays = node(el, 'g', { class: 'sun-rays' });
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      node(rays, 'line', { x1: round(22 + 8.5 * Math.cos(a)), y1: round(18 + 8.5 * Math.sin(a)), x2: round(22 + 13 * Math.cos(a)), y2: round(18 + 13 * Math.sin(a)) });
    }
    const core = node(el, 'circle', { class: 'sun-core', cx: 22, cy: 18, r: 6 });
    paint = (v, u) => {
      write('halo', halo, 'fill-opacity', (0.35 * u).toFixed(2));
      write('rays', rays, 'stroke-opacity', u.toFixed(2));
      write('core', core, 'fill-opacity', (0.15 + 0.85 * u).toFixed(2));
    };
  } else if (field === 'temperature') {
    node(el, 'rect', { class: 'glass', x: 18.5, y: 3, width: 7, height: 26, rx: 3.5 });
    const column = node(el, 'rect', { class: 'mercury', x: 20.25, width: 3.5, rx: 1.5 });
    node(el, 'circle', { class: 'mercury', cx: 22, cy: 29.5, r: 4.5 });
    const top = 5;
    const bottom = 29;
    paint = (v, u) => {
      const y = bottom - (bottom - top) * u;
      write('y', column, 'y', y.toFixed(2));
      write('h', column, 'height', (bottom - y).toFixed(2));
    };
  } else {
    const [a0, a1] = [0.75 * Math.PI, 2.25 * Math.PI];
    const [x0, y0] = at(a0, R);
    const [x1, y1] = at(a1, R);
    const arc = `M ${round(x0)} ${round(y0)} A ${R} ${R} 0 1 1 ${round(x1)} ${round(y1)}`;
    node(el, 'path', { class: 'track', d: arc });
    const fill = node(el, 'path', { class: 'fill', d: arc, 'stroke-dasharray': `0 ${round(ARC)}` });
    const needle = node(el, 'line', { class: 'needle', x1: C.x, y1: C.y, x2: C.x + R - 3, y2: C.y });
    node(el, 'circle', { class: 'hub', cx: C.x, cy: C.y, r: 2 });
    paint = (v, u) => {
      write('fill', fill, 'stroke-dasharray', `${round(u * ARC)} ${round(ARC)}`);
      write('needle', needle, 'transform', `rotate(${round(((a0 + u * SWEEP) * 180) / Math.PI)} ${C.x} ${C.y})`);
    };
  }
  const gauge = {
    el,
    value: null,
    update(v) {
      gauge.value = v;
      const u = def.kind === 'switch' ? (v ? 1 : 0) : gaugePosition(def, v);
      write('pos', el, 'data-pos', String(Math.round(u * 10000) / 10000));
      paint(v, u);
      const said = text(v);
      write('text', words, 'text', said);
      write('title', title, 'text', label ? `${label}: ${said}` : said);
    },
  };
  return gauge;
}
