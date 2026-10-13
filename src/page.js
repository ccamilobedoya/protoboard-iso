// One self-contained HTML page per circuit: the stable thing to embed in documentation
// (an iframe, a wiki "web view", a notes app). No dependencies, no network, no build.
//
// Today the page shows the drawing: two opposite views, close-up or whole board, labels on
// or off, drag to move and wheel or pinch to zoom. Later stages (simulation, animation, virtual multimeter) grow this same page, so
// an embed made today keeps working and gets the new features without changing its link.
//
//   renderPage(circuit, { lang, views, fit }) → { html, issues }   (html is null if nothing can be drawn)

import { renderCircuit, t } from './index.js';
import { escapeXml } from './render/svg.js';

const OPPOSITE = { front: 'back', back: 'front', 'front-left': 'back-right', 'back-right': 'front-left' };
const box = ({ x, y, width, height }) => `${x} ${y} ${width} ${height}`;
const titleOf = (circuit, lang) => (typeof circuit.title === 'object' ? circuit.title?.[lang] ?? circuit.title?.en : circuit.title);

// One view as an inline SVG that scales with the page: the size comes from CSS, the frame
// (whole board or close-up) from the viewBox, switched by the script.
function viewSvg(circuit, view, fit, lang) {
  const board = renderCircuit(circuit, { view, lang });
  if (!board.svg) return { issues: board.issues };
  const parts = renderCircuit(circuit, { view, lang, fit: 'parts' });
  const frames = { board: box(board.scene.frame), parts: box(parts.scene.frame) };
  const svg = board.svg
    .trim()
    .replace(/^<svg ([^>]*?)width="[^"]*" height="[^"]*" viewBox="[^"]*"/, `<svg $1viewBox="${frames[fit]}"`)
    .replace(/^<svg /, `<svg data-view="${view}" data-board="${frames.board}" data-parts="${frames.parts}" role="img" `);
  return { svg, issues: board.issues };
}

const STYLE = `
html, body { margin: 0; height: 100%; background: #ffffff; color: #333333; font-family: Helvetica, Arial, Lato, sans-serif; }
body { display: flex; flex-direction: column; }
nav { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 8px; font-size: 13px; }
nav[hidden] { display: none; }
nav .group { display: flex; gap: 4px; margin-right: 8px; }
nav button { font: inherit; color: #333333; background: #f6f5f2; border: 1px solid #c9c7c2; border-radius: 6px; padding: 4px 10px; cursor: pointer; }
nav button[aria-pressed="true"] { color: #ffffff; background: #444444; border-color: #444444; }
nav .hint { color: #8a8884; font-size: 12px; }
nav .revision { margin-left: auto; color: #8a8884; font-size: 12px; }
main { flex: 1; min-height: 0; display: flex; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none; cursor: grab; }
main.dragging { cursor: grabbing; }
main svg { display: block; width: 100%; height: 100%; }
main svg[hidden] { display: none; }
body.no-labels .labels { display: none; }`;

// Works without the script too: the first view, close-up, labels on.
// With it: buttons, drag to pan (mouse or one finger), wheel or pinch to zoom, double-click
// to zoom in. The view box is clamped to the board so the drawing never gets lost.
// Note: SVG elements have no `hidden` property (only HTML elements do): use the attribute.
const SCRIPT = `
const main = document.querySelector('main');
const svgs = [...main.querySelectorAll('svg')];
const buttons = [...document.querySelectorAll('nav button')];
const state = { view: svgs[0].dataset.view, fit: document.body.dataset.fit, labels: true };
const numbers = (text) => text.split(' ').map(Number);
const current = () => svgs.find((s) => s.dataset.view === state.view);
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

function show() {
  for (const s of svgs) s.toggleAttribute('hidden', s.dataset.view !== state.view);
  setBox(numbers(current().dataset[state.fit]));
  document.body.classList.toggle('no-labels', !state.labels);
  for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.key === 'labels' ? state.labels : state[b.dataset.key] === b.dataset.value));
}
for (const b of buttons) b.addEventListener('click', () => {
  if (b.dataset.key === 'labels') state.labels = !state.labels;
  else state[b.dataset.key] = b.dataset.value;
  show();
});

// Pointers: one moves the drawing, two also zoom (pinch). Same code for mouse, pen and touch.
const pointers = new Map();
function centre() {
  const ps = [...pointers.values()];
  const x = ps.reduce((a, p) => a + p.x, 0) / ps.length;
  const y = ps.reduce((a, p) => a + p.y, 0) / ps.length;
  return { x, y, d: ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0 };
}
main.addEventListener('pointerdown', (e) => {
  if (main.setPointerCapture) main.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  main.classList.add('dragging');
});
main.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const before = centre();
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
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
main.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.002)));
}, { passive: false });
main.addEventListener('dblclick', (e) => zoomAt(e.clientX, e.clientY, 0.5));

document.querySelector('nav').hidden = false;
show();`;

const button = (key, value, text) => `<button type="button" data-key="${key}"${value ? ` data-value="${value}"` : ''}>${escapeXml(text)}</button>`;

export function renderPage(circuit, options = {}) {
  const { lang = 'en', fit = 'parts' } = options;
  const first = circuit?.view ?? 'front';
  const views = options.views ?? [first, OPPOSITE[first]].filter(Boolean);
  const rendered = views.map((view) => ({ view, ...viewSvg(circuit, view, fit, lang) }));
  const issues = rendered[0]?.issues ?? [];
  if (!rendered.length || rendered.some((r) => !r.svg)) return { html: null, issues };

  const title = titleOf(circuit, lang) ?? t(lang, 'page.untitled');
  const svgs = rendered.map((r, i) => (i ? r.svg.replace(/^<svg /, '<svg hidden ') : r.svg));
  const nav = [
    views.length > 1 ? `<span class="group">${views.map((v) => button('view', v, t(lang, `page.view.${v}`))).join('')}</span>` : '',
    `<span class="group">${button('fit', 'parts', t(lang, 'page.fit.parts'))}${button('fit', 'board', t(lang, 'page.fit.board'))}</span>`,
    `<span class="group">${button('labels', null, t(lang, 'page.labels'))}</span>`,
    `<span class="hint">${escapeXml(t(lang, 'page.hint'))}</span>`,
    `<span class="revision">${escapeXml(t(lang, 'page.revision', { revision: circuit.revision ?? 0 }))}</span>`,
  ].join('');
  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="protoboard-iso">
<meta name="revision" content="${circuit.revision ?? 0}">
<title>${escapeXml(title)}</title>
<style>${STYLE}
</style>
</head>
<body data-fit="${fit}">
<nav hidden>${nav}</nav>
<main>
${svgs.join('\n')}
</main>
<script>${SCRIPT}
</script>
</body>
</html>
`;
  return { html, issues };
}
