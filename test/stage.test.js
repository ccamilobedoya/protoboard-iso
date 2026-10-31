// The stage (stage and video, V4): the video's theme and the grid behind the drawing, a recording
// on the timeline's theme, one label in its frame (the told part's), the reserved margin that
// keeps the circuit out of the caption and the platforms' bands, and the rules a frame is
// measured by (scripts/stage-shots.js measures them in Chromium). Run in jsdom.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderPage } from '../src/page.js';
import { tourIssues, loadTour } from '../src/tour.js';
import { CIRCUIT_FOLDER } from '../src/beside.js';
import { STYLE } from '../src/page/style.js';
import { renderCircuit } from '../src/index.js';
import { buildCircuit } from '../src/circuit/build.js';
import { holeLattice } from '../src/render/hole-grid.js';
import { frameProblems, RULES } from '../scripts/stage-shots.js';

const FRAME = 1000 / 30;
const examples = fileURLToPath(new URL('../examples/', import.meta.url));
const npn = () => Object.defineProperty(JSON.parse(readFileSync(`${examples}npn-switch.json`, 'utf8')), CIRCUIT_FOLDER, { value: examples });
const numbers = (text) => text.split(' ').map(Number);

async function loadPage(html, search, size = { width: 1080, height: 1920 }, before = () => {}) {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    return null;
  }
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: `https://page.test/npn-switch.html${search}` });
  const { window } = dom;
  const rect = () => ({ left: 0, top: 0, right: size.width, bottom: size.height, ...size });
  window.document.querySelector('main').getBoundingClientRect = rect;
  for (const svg of window.document.querySelectorAll('svg')) svg.getBoundingClientRect = rect;
  before(window);
  window.eval(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  return window;
}
const play = (window, ms) => {
  window.protoboardLive.tour.play();
  for (let t = 0; t < ms; t += FRAME) window.protoboardLive.tick(FRAME);
};
const labelled = (window) => [...window.document.querySelectorAll('main > svg:not([hidden]) .spotlabels > [data-part]')];

test('stage: the notebook by day and at night, two more themes', () => {
  assert.match(STYLE, /:root\[data-theme="notebook"\] \{[^}]*color-scheme: light;[^}]*--canvas: #f4efe2;[^}]*--grid-line: rgba\(24, 79, 143/);
  assert.match(STYLE, /:root\[data-theme="stage"\] \{[^}]*--canvas: #151a21;[^}]*--cap-face: "Iowan Old Style"/);
  // The grid's marks per theme: dots on the bench (light and dark), lines on the stage.
  assert.match(STYLE, /:root\[data-theme="stage"\] \{[^}]*--grid-dot: transparent;[^}]*--grid-line: rgba/);
  assert.match(STYLE, /--grid-dot: rgba\(26, 26, 26/);
  // The caption's sizes at 1080 wide (portrait) and 1920 wide (landscape), as shares of the width.
  const vw = (name, block) => Number(block.match(new RegExp(`--cap-${name}: ([\\d.]+)vw`))[1]);
  const [portrait, landscape] = STYLE.match(/body\.director \{\s*--cap-text[^}]*\}/g);
  assert.equal(Math.round((vw('text', portrait) * 1080) / 100), 56);
  assert.equal(Math.round((vw('number', portrait) * 1080) / 100), 44);
  assert.equal(Math.round((vw('line', portrait) * 1080) / 100), 30);
  assert.equal(Math.round((vw('text', landscape) * 1920) / 100), 52);
  // No CSS filter anywhere in the page (decision of 2026-10-15).
  assert.doesNotMatch(STYLE, /filter:/);
  // A circuit may fix it for its page.
  assert.match(renderPage({ ...npn(), page: { ...npn().page, theme: 'stage' } }).html, /<html lang="en" data-theme="stage">/);
});

test('stage: the grid of holes is in the drawing, on the board\'s lattice, and keeps its marks\' size when zooming', async (t) => {
  const circuit = npn();
  const { html } = renderPage(circuit);
  // In every view, under the board; the static SVG has none.
  assert.equal(html.match(/<g class="holegrid"/g).length, 2);
  assert.ok(html.indexOf('class="holegrid"') < html.indexOf('<g class="board">'));
  assert.doesNotMatch(renderCircuit(circuit).svg, /holegrid/);
  // The minor pattern's steps are the projected steps to the next column and the next row.
  const scene = renderCircuit(circuit, { interactive: true }).scene;
  const board = buildCircuit(circuit).board;
  const lattice = holeLattice(scene, board);
  const hole = board.holes.get(lattice.origin);
  const p = (h) => scene.camera.project(h.pos);
  const near = (a, b) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
  const o = p(hole);
  const next = [...board.holes.values()].find((h) => h.row === hole.row && h.col === hole.col + 1);
  assert.equal(hole.col, 5, 'the major marks go through the columns the board numbers');
  assert.ok(near(lattice.u, { x: p(next).x - o.x, y: p(next).y - o.y }));
  const rowStep = [...board.holes.values()].filter((h) => h.col === hole.col && h.kind === 'main').map((h) => ({ x: p(h).x - o.x, y: p(h).y - o.y }));
  assert.ok(rowStep.some((s) => near(s, lattice.v)), 'one row over');
  const m = numbers(html.match(/id="grid-front-minor"[^>]*patternTransform="matrix\(([^)]*)\)"/)[1]);
  // A cell's centre (½, ½) lands on the hole.
  assert.ok(Math.abs(m[4] + 0.5 * (m[0] + m[2]) - o.x) < 0.01 && Math.abs(m[5] + 0.5 * (m[1] + m[3]) - o.y) < 0.01);
  // In the page: closer in, the marks shrink in the drawing (the same pixels on screen); farther
  // out, the minor marks fade.
  const window = await loadPage(html, '', { width: 800, height: 500 });
  if (!window) return t.skip('jsdom not installed');
  const svg = window.document.querySelector('main > svg:not([hidden])');
  const width = () => Number(svg.querySelector('pattern.grid-minor .grid-line').getAttribute('stroke-width'));
  const fade = () => Number(svg.querySelector(':scope > .holegrid > rect.grid-minor').getAttribute('opacity'));
  const zoom = (what) => window.document.querySelector(`.zoom [data-zoom="${what}"]`).click();
  const before = width();
  assert.ok(before > 0);
  zoom('in');
  assert.ok(width() < before, 'closer in: thinner in the drawing');
  const close = fade();
  for (let k = 0; k < 5; k++) zoom('out');
  assert.ok(width() > before, 'farther out: thicker in the drawing');
  assert.ok(fade() < close, 'farther out: the minor marks fade');
});

test('stage: a recording takes the timeline\'s theme, the stage by default; ?theme= wins', async (t) => {
  const html = renderPage(npn()).html;
  const plain = await loadPage(html, '');
  if (!plain) return t.skip('jsdom not installed');
  assert.equal(plain.document.documentElement.dataset.theme, undefined, 'a page follows the system');
  assert.equal((await loadPage(html, '?director=1')).document.documentElement.dataset.theme, 'stage');
  assert.equal((await loadPage(html, '?director=1&theme=dark')).document.documentElement.dataset.theme, 'dark');
  const light = { ...npn(), page: { ...npn().page, tour: { theme: 'light', steps: [{ at: 0, do: 'caption', text: 'x' }] } } };
  assert.equal((await loadPage(renderPage(light).html, '?director=1')).document.documentElement.dataset.theme, 'light');
  assert.equal(loadTour(npn()).tour.theme, 'stage');
  assert.deepEqual(tourIssues({ ...npn(), page: { tour: { theme: 'neon', steps: [] } } }).map((i) => i.code), ['TOUR_FIELD']);
});

test('stage: a recording keeps one label, the told part\'s short one; a tour in the page keeps every box', async (t) => {
  const html = renderPage(npn()).html;
  const rec = await loadPage(html, '?director=1');
  if (!rec) return t.skip('jsdom not installed');
  // 3400 ms: Q1 and D1 forward, the camera on its way to D1.
  play(rec, 3500);
  const one = labelled(rec);
  assert.ok(one.length > 0);
  assert.deepEqual([...new Set(one.map((el) => el.getAttribute('data-part')))], ['D1']);
  assert.ok(one.every((el) => el.classList.contains('short')), 'the short label, beside the part');
  // 1200…3400 ms: S1 alone.
  const early = await loadPage(html, '?director=1');
  play(early, 2000);
  assert.deepEqual([...new Set(labelled(early).map((el) => el.getAttribute('data-part')))], ['S1']);
  // The same tour in the page: both boxes come forward, as a tap would bring them.
  const page = await loadPage(html, '', { width: 800, height: 500 });
  play(page, 3500);
  assert.deepEqual([...new Set(labelled(page).map((el) => el.getAttribute('data-part')))].sort(), ['D1', 'Q1']);
  assert.ok(!labelled(page).some((el) => el.classList.contains('short')));
});

test('stage: the reserved margin frames a target in the area the caption and the platforms leave free', async (t) => {
  const html = renderPage(npn()).html;
  for (const [format, size, u, v] of [['vertical', { width: 1080, height: 1920 }, 0.5, 0.575], ['horizontal', { width: 1920, height: 1080 }, 0.75, 0.5]]) {
    const window = await loadPage(html, '?director=1', size);
    if (!window) return t.skip('jsdom not installed');
    const svg = window.document.querySelector('main > svg:not([hidden])');
    const [bx, by, bw, bh] = numbers(svg.dataset.board);
    const d = window.protoboardLive.director;
    d.start();
    assert.ok(d.frame('board'));
    const [x, y, w, h] = numbers(svg.getAttribute('viewBox'));
    // The screen's proportions; the board's centre at the free area's centre.
    assert.ok(Math.abs(w / h - size.width / size.height) < 1e-3, `${format}: proportions`);
    assert.ok(Math.abs((bx + bw / 2 - x) / w - u) < 2e-3, `${format}: across`);
    assert.ok(Math.abs((by + bh / 2 - y) / h - v) < 2e-3, `${format}: down`);
    // The whole board inside the free area.
    const free = RULES[format].free;
    assert.ok((bx - x) / w >= free.left - 1e-3 && (bx + bw - x) / w <= free.right + 1e-3, `${format}: board within the free width`);
    assert.ok((by - y) / h >= free.top - 1e-3 && (by + bh - y) / h <= free.bottom + 1e-3, `${format}: board within the free height`);
    // An explicit box is a frame as it is.
    const box = [bx, by, bw / 2, (bw / 2) * (size.height / size.width)];
    d.frame(box);
    numbers(svg.getAttribute('viewBox')).forEach((n, i) => assert.ok(Math.abs(n - box[i]) < 0.02, `${format}: box[${i}]`));
  }
  // Without ?director=1 a page keeps its own frames.
  const window = await loadPage(html, '', { width: 1080, height: 1920 });
  assert.equal(window.protoboardLive.director, null);
});

test('stage: the rules of a frame, as stage-shots.js checks them', () => {
  const good = {
    caption: { top: 0.16, bottom: 0.3, left: 0.07, right: 0.6 },
    sizes: { text: 56, number: 44, line: null },
    told: { id: 'D1', top: 0.45, bottom: 0.7, left: 0.3, right: 0.6 },
    label: { top: 0.6, bottom: 0.62, left: 0.4, right: 0.5 },
    labels: 1,
    tags: 0,
    chrome: [],
  };
  assert.deepEqual(frameProblems('vertical', good), []);
  const bad = (change) => frameProblems('vertical', { ...good, ...change });
  assert.equal(bad({ caption: { ...good.caption, top: 0.05 } }).length, 1, 'in the platforms\' top band');
  assert.equal(bad({ caption: { ...good.caption, bottom: 0.45 } }).length, 1, 'over the circuit');
  assert.equal(bad({ told: { ...good.told, bottom: 0.85 } }).length, 1, 'in the platforms\' bottom band');
  assert.equal(bad({ sizes: { text: 40 } }).length, 1, 'too small to read');
  assert.equal(bad({ labels: 3 }).length, 1);
  assert.equal(bad({ tags: 2, chrome: ['nav'] }).length, 2);
  const wide = { ...good, caption: { top: 0.09, bottom: 0.3, left: 0.04, right: 0.4 }, sizes: { text: 52 }, told: { id: 'D1', top: 0.2, bottom: 0.8, left: 0.55, right: 0.9 }, label: { top: 0.5, bottom: 0.52, left: 0.6, right: 0.7 } };
  assert.deepEqual(frameProblems('horizontal', wide), []);
  assert.equal(frameProblems('horizontal', { ...wide, told: { ...wide.told, left: 0.3 } }).length, 1, 'under the caption');
});

test('stage: the reader chooses the theme in the menu, kept for the next pages; the link still wins', async (t) => {
  const html = renderPage({ ...npn(), page: { ...npn().page, theme: 'light' } }).html;
  const window = await loadPage(html, '', { width: 800, height: 500 });
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const items = [...doc.querySelectorAll('nav .menu [data-key="theme"]')];
  assert.deepEqual(items.map((b) => b.dataset.value), ['auto', 'light', 'dark', 'notebook', 'stage']);
  assert.equal(doc.querySelector('[data-key="theme"][aria-checked="true"]').dataset.value, 'light', 'the circuit\'s');
  items.find((b) => b.dataset.value === 'notebook').click();
  assert.equal(doc.documentElement.dataset.theme, 'notebook');
  assert.equal(doc.querySelector('[data-key="theme"][aria-checked="true"]').dataset.value, 'notebook');
  assert.equal(window.localStorage.getItem('protoboard-iso.theme'), 'notebook');
  // The next page of the same site opens in it, over its own page.theme; a link still wins.
  const kept = (w) => w.localStorage.setItem('protoboard-iso.theme', 'notebook');
  assert.equal((await loadPage(html, '', { width: 800, height: 500 }, kept)).document.documentElement.dataset.theme, 'notebook');
  assert.equal((await loadPage(html, '?theme=dark', { width: 800, height: 500 }, kept)).document.documentElement.dataset.theme, 'dark');
  // A recording keeps the timeline's.
  assert.equal((await loadPage(html, '?director=1', { width: 1080, height: 1920 }, kept)).document.documentElement.dataset.theme, 'stage');
});
