// The browser script of the embeddable page (see ../page.js), inlined as text. No modules,
// no dependencies: it must run inside an iframe or a wiki "web view" as it is.
//
// What it reads: the inline SVGs (one per view; data-board / data-parts hold the two frames),
// and #page-data, a JSON with per part { title, type, value, here, nodes, pins, sim }, the
// explanations (explain), the probe captions (probes), the initial focus and UI texts.
//
// State: view, fit, labels, results (on when the circuit asks), layer (parts | flow),
// direction (electrons | conventional), focus (set of part ids), ghost (see-through ids),
// pinned (the result tag whose probes stay shown).
//
// Flow of a tap: pointerdown/move decide drag vs tap → click: a result tag pins its probes
// (focus untouched), a part selects it (applyFocus clones it into .spotlight, writes #dynamic,
// opens the card), the board clears. Hover with a mouse shows probes or explanations in
// .tooltip. Everything visual is CSS classes or rules; the script never redraws the scene.
//
// Careful: SVG elements have no `hidden` property (only HTML elements do); use the attribute.

export const SCRIPT = `
const main = document.querySelector('main');
const svgs = [...main.querySelectorAll('svg')];
const buttons = [...document.querySelectorAll('nav button')];
const data = JSON.parse(document.getElementById('page-data').textContent);
const state = { view: svgs[0].dataset.view, fit: document.body.dataset.fit, labels: true, results: document.body.dataset.results === 'on', layer: 'parts', direction: 'electrons', focus: new Set(data.focus), ghost: new Set() };
const toggles = ['labels'];
const numbers = (text) => text.split(' ').map(Number);
const current = () => svgs.find((s) => s.dataset.view === state.view);
const dynamic = document.getElementById('dynamic');
const info = document.querySelector('.info');
let box;

function setBox([x, y, w, h]) {
  const [bx, by, bw, bh] = numbers(current().dataset.board);
  const f = Math.min(Math.max(w, bw / 12), bw * 2) / w;
  const cx = Math.min(Math.max(x + w / 2, bx), bx + bw);
  const cy = Math.min(Math.max(y + h / 2, by), by + bh);
  box = [cx - (w * f) / 2, cy - (h * f) / 2, w * f, h * f];
  current().setAttribute('viewBox', box.map((n) => Math.round(n * 100) / 100).join(' '));
}

// Screen point → drawing point, and drawing units per screen pixel (the SVG keeps its aspect ratio).
function toBox(px, py) {
  const r = current().getBoundingClientRect();
  const k = Math.max(box[2] / r.width, box[3] / r.height);
  return [box[0] + box[2] / 2 + (px - r.left - r.width / 2) * k, box[1] + box[3] / 2 + (py - r.top - r.height / 2) * k, k];
}
function zoomAt(px, py, f) {
  const [x, y] = toBox(px, py);
  setBox([x - (x - box[0]) * f, y - (y - box[1]) * f, box[2] * f, box[3] * f]);
}
function panBy(dx, dy) {
  const k = toBox(0, 0)[2];
  setBox([box[0] - dx * k, box[1] - dy * k, box[2], box[3]]);
}

// Focus: the veil dims everything; the focused parts are cloned (in painting order) into a
// .spotlight group above it, and CSS rules written on the fly show the strips under their
// leads. See-through lowers a part's opacity, in the drawing and in its copy.
const quote = (s) => String(s).replace(/["\\\\]/g, '\\\\$&');
const SVG = 'http://www.w3.org/2000/svg';
function spotlightOf(svg) {
  let g = svg.querySelector(':scope > .spotlight');
  if (!g) {
    g = document.createElementNS(SVG, 'g');
    g.setAttribute('class', 'spotlight');
    svg.insertBefore(g, svg.querySelector(':scope > .flow') || svg.querySelector(':scope > .results'));
  }
  return g;
}
function applyFocus() {
  const ids = [...state.focus].filter((id) => data.parts[id]);
  const nodes = new Set(ids.flatMap((id) => data.parts[id].nodes));
  const of = (layer) => ids.map((id) => ':scope > .' + layer + ' > [data-part="' + quote(id) + '"]').join(', ');
  for (const svg of svgs) {
    const g = spotlightOf(svg);
    g.textContent = '';
    if (ids.length) for (const el of [...svg.querySelectorAll(of('under')), ...svg.querySelectorAll(of('parts')), ...svg.querySelectorAll(of('labels'))]) g.appendChild(el.cloneNode(true));
  }
  // Strips under the focused parts; with the results on, their currents and the voltages
  // of their groups (and nothing else: all tags at once is too much to read).
  const shown = [...ids.map((id) => '.results > [data-part="' + quote(id) + '"]'), ...[...nodes].flatMap((n) => ['.strips > [data-node="' + quote(n) + '"]', '.results > [data-node="' + quote(n) + '"]'])];
  const ghosts = [...state.ghost].map((id) => '.under > [data-part="' + quote(id) + '"], .parts > [data-part="' + quote(id) + '"], .spotlight > [data-part="' + quote(id) + '"] { opacity: 0.2; }');
  dynamic.textContent = (shown.length ? shown.join(', ') + ' { display: inline; }' : '') + ghosts.join('');
  document.body.classList.toggle('focusing', ids.length > 0);
}

function item(parent, tag, text, cls) {
  const el = document.createElement(tag);
  if (text != null) el.textContent = text;
  if (cls) el.className = cls;
  parent.appendChild(el);
  return el;
}
// A value the learner can tap (or hover with a mouse) to read what it means.
function terms(parent, lines, open) {
  const list = item(parent, 'ul', null, 'terms');
  for (const line of lines) {
    const li = item(list, 'li');
    const text = data.explain[line.key];
    if (!text) {
      item(li, 'span', line.text);
      continue;
    }
    const button = item(li, 'button', line.text, 'term');
    button.type = 'button';
    button.dataset.explain = line.key;
    const explain = item(li, 'p', text, 'explain');
    explain.hidden = line.key !== open;
    button.setAttribute('aria-expanded', String(!explain.hidden));
    button.addEventListener('click', () => {
      explain.hidden = !explain.hidden;
      button.setAttribute('aria-expanded', String(!explain.hidden));
    });
  }
}
function card(title, subtitle) {
  info.textContent = '';
  item(info, 'h2', title);
  if (subtitle) item(info, 'p', subtitle, 'type');
}
function actions(buttons) {
  const row = item(info, 'div', null, 'actions');
  for (const [label, act, pressed] of buttons) {
    const b = item(row, 'button', label);
    b.type = 'button';
    if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed));
    b.addEventListener('click', () => act(b));
  }
}
function openInfo(id, open) {
  const p = data.parts[id];
  card(p.title);
  terms(info, [p.type, p.value].filter(Boolean), open);
  if (p.here) item(info, 'p', p.here, 'here');
  item(info, 'h3', data.text.pins);
  const pins = item(info, 'ul');
  for (const line of p.pins) item(pins, 'li', line);
  if (p.sim.length) {
    const sim = item(info, 'div', null, 'sim');
    item(sim, 'h3', data.text.results);
    terms(sim, p.sim, open);
  }
  item(info, 'p', data.text.explain, 'tip');
  actions([
    [data.text.ghost, (b) => {
      if (state.ghost.has(id)) state.ghost.delete(id);
      else state.ghost.add(id);
      b.setAttribute('aria-pressed', String(state.ghost.has(id)));
      applyFocus();
    }, state.ghost.has(id)],
    [data.text.close, () => select(null)],
  ]);
  info.hidden = false;
}
function select(id, open) {
  state.focus = new Set(id ? [id] : []);
  if (id) openInfo(id, open);
  else info.hidden = true;
  applyFocus();
}

function show() {
  for (const s of svgs) s.toggleAttribute('hidden', s.dataset.view !== state.view);
  setBox(numbers(current().dataset[state.fit]));
  document.body.classList.toggle('no-labels', !state.labels);
  document.body.classList.toggle('show-results', state.results);
  document.body.classList.toggle('layer-flow', state.layer === 'flow');
  document.body.classList.toggle('conventional', state.direction === 'conventional');
  for (const b of buttons) b.setAttribute('aria-pressed', String(toggles.includes(b.dataset.key) ? state[b.dataset.key] : state[b.dataset.key] === b.dataset.value));
}
for (const b of buttons) b.addEventListener('click', () => {
  if (toggles.includes(b.dataset.key)) state[b.dataset.key] = !state[b.dataset.key];
  else state[b.dataset.key] = b.dataset.value;
  show();
});

// Pointers: one moves the drawing, two also zoom (pinch). A press that does not move is a
// tap: it selects the part under it, or clears the selection on empty board.
const pointers = new Map();
let dragged = false;
function centre() {
  const ps = [...pointers.values()];
  const x = ps.reduce((a, p) => a + p.x, 0) / ps.length;
  const y = ps.reduce((a, p) => a + p.y, 0) / ps.length;
  return { x, y, d: ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0 };
}
main.addEventListener('pointerdown', (e) => {
  if (info.contains(e.target)) return;
  if (!pointers.size) dragged = false;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
});
main.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (!dragged && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 5 && pointers.size < 2) return;
  if (!dragged && main.setPointerCapture) for (const id of pointers.keys()) main.setPointerCapture(id);
  dragged = true;
  main.classList.add('dragging');
  const before = centre();
  pointers.set(e.pointerId, { ...p, x: e.clientX, y: e.clientY });
  const after = centre();
  panBy(after.x - before.x, after.y - before.y);
  if (before.d && after.d) zoomAt(after.x, after.y, before.d / after.d);
});
const release = (e) => {
  pointers.delete(e.pointerId);
  if (!pointers.size) main.classList.remove('dragging');
};
main.addEventListener('pointerup', release);
main.addEventListener('pointercancel', release);
// Result tags: hover with a mouse, or tap, to see where the value comes from: probes on the
// two points a voltage is read between, arrows where a current goes in and out, and a line
// that says it. A tap keeps it until the tag is tapped again or something else is.
const tooltip = document.querySelector('.tooltip');
const probeStyle = document.getElementById('probe');
let pinned = null;
function showProbe(tag) {
  const key = tag && tag.dataset.probe;
  probeStyle.textContent = key ? '.probes > [data-probe="' + quote(key) + '"] { display: inline; }' : '';
  const text = key && data.probes[key];
  if (!text) return (tooltip.hidden = true);
  tooltip.textContent = text;
  const r = main.getBoundingClientRect();
  const b = tag.getBoundingClientRect();
  tooltip.style.left = Math.max(4, Math.min(b.left - r.left, r.width - 270)) + 'px';
  tooltip.style.top = (b.bottom - r.top + 6) + 'px';
  tooltip.hidden = false;
}
const tagOf = (el) => (el && el.closest ? el.closest('.results > [data-probe]') : null);
function tagNamed(key) {
  return current().querySelector('.results > text[data-probe="' + quote(key) + '"]');
}
main.addEventListener('click', (e) => {
  if (dragged || info.contains(e.target)) return;
  // A result tag behaves like hovering it: probes and their line, pinned until tapped again.
  // The focus, the dimming and the card stay as they are.
  const tag = tagOf(e.target);
  if (tag) {
    pinned = pinned === tag.dataset.probe ? null : tag.dataset.probe;
    return showProbe(pinned ? tag : null);
  }
  pinned = null;
  showProbe(null);
  const hit = e.target.closest && e.target.closest('[data-part]');
  select(hit ? hit.getAttribute('data-part') : null);
});
main.addEventListener('pointerover', (e) => {
  if (e.pointerType && e.pointerType !== 'mouse') return;
  const tag = tagOf(e.target);
  if (tag) return showProbe(tag);
  // A value of the card: its explanation in the same small box.
  const term = e.target.closest && e.target.closest('.info [data-explain]');
  if (!term || term.getAttribute('aria-expanded') === 'true') return;
  probeStyle.textContent = '';
  tooltip.textContent = data.explain[term.dataset.explain];
  const r = main.getBoundingClientRect();
  const b = term.getBoundingClientRect();
  tooltip.style.left = Math.max(4, Math.min(b.left - r.left, r.width - 270)) + 'px';
  tooltip.style.top = (b.bottom - r.top + 6) + 'px';
  tooltip.hidden = false;
});
main.addEventListener('pointerout', (e) => {
  const to = e.relatedTarget;
  if (to && to.closest && to.closest('.results > [data-probe], .info [data-explain]')) return;
  showProbe(pinned ? tagNamed(pinned) : null);
});
main.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.002)));
}, { passive: false });
main.addEventListener('dblclick', (e) => zoomAt(e.clientX, e.clientY, 0.5));

document.querySelector('nav').hidden = false;
show();
if (state.focus.size === 1) select([...state.focus][0]);
else applyFocus();`;
