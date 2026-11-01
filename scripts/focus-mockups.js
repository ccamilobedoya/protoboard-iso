#!/usr/bin/env node
// Mock-ups of the pedestal (a video about one part, session F0; docs/en/component-focus.md): the
// real page of a circuit in a recording (?director=1, theme stage), the part alone and raised over
// the grid, in three directions (technical, showcase, bench) and the chosen one (technical with the symbol) at 1080 × 1920 and 1920 × 1080, and the
// measurements the design needs (how far a small part can be framed, how large its printing reads,
// where it lands against the frame's bands). Nothing here is part of the kit: the board and the
// other parts are hidden by CSS added to the page, and the callouts, the symbol and the bench's pads
// are HTML and SVG drawn over it by this script, for judging the look before building it (F1–F4).
// Every number on a pad is the page's own simulation, read from the engine; the texts of the pins
// are the mock-up's, to be moved to src/i18n in F2.
//
//   node scripts/focus-mockups.js [-o dir] [--lang en|es] [--jpeg]
//
// Writes into dir (default examples/out/focus-mockups): <case>-<direction>-<v|h>.png (and .jpg with
// --jpeg, smaller, for a gallery) and measurements.json. Exits 0, or 2 when it could not run (no
// Playwright or no browser): never a pass then.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveTarget, loadCircuit } from '../src/node/workspace.js';
import { renderPage } from '../src/page.js';
import { renderCircuit } from '../src/index.js';
import { buildCircuit } from '../src/circuit/build.js';
import { voltageColor } from '../src/sim/look.js';
import { formatValue } from '../src/core/units.js';
import { STAGE_INSET } from '../src/page/client/view.js';
import { RULES, CHROMIUM_ARGS } from './stage-shots.js';
import { timelineCircuit } from './render-frames.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const FRAME = 1000 / 30;
const RAISE_MM = 3;
const ZOOMS = [1, 1.5, 2, 2.5, 3, 4, 5];

// The two parts of the mock-ups: a TO-92 and a DIP-8, each in its recipe's circuit.
const CASES = [
  {
    name: 'npn',
    circuit: () => loadCircuit(resolveTarget(join(root, 'examples/npn-switch.json'))),
    part: 'Q1',
    press: 'S1',
    title: '2N2222A',
    idea: { en: 'A tap of current that a smaller current opens', es: 'Un grifo de corriente que abre otra más pequeña' },
    kind: { en: 'NPN transistor · TO-92', es: 'Transistor NPN · TO-92' },
    mark: { en: 'Flat face: E B C from the left', es: 'Cara plana: E B C desde la izquierda' },
    pins: {
      E: { en: 'emitter · out to ground', es: 'emisor · sale a tierra' },
      B: { en: 'base · the small current', es: 'base · la corriente pequeña' },
      C: { en: 'collector · the load', es: 'colector · la carga' },
    },
    symbol: 'npn',
  },
  {
    name: '555',
    circuit: () => timelineCircuit('555-astable.json', { circuit: '555-astable' }),
    part: 'U1',
    title: 'NE555',
    idea: { en: 'A clock in eight pins', es: 'Un reloj en ocho patas' },
    kind: { en: 'Timer · DIP-8', es: 'Temporizador · DIP-8' },
    mark: { en: 'Notch and dot: pin 1', es: 'Muesca y punto: la pata 1' },
    pins: {
      GND: { en: '1 GND · ground', es: '1 GND · tierra' },
      TRIG: { en: '2 TRIG · starts a cycle', es: '2 TRIG · dispara' },
      OUT: { en: '3 OUT · output', es: '3 OUT · salida' },
      RESET: { en: '4 RESET · stops it', es: '4 RESET · lo detiene' },
      CTRL: { en: '5 CTRL · threshold level', es: '5 CTRL · nivel del umbral' },
      THR: { en: '6 THR · ends a cycle', es: '6 THR · umbral' },
      DIS: { en: '7 DIS · discharges C', es: '7 DIS · descarga C' },
      VCC: { en: '8 VCC · supply', es: '8 VCC · alimentación' },
    },
    symbol: 'block',
  },
];
// `chosen`: the direction the maintainer chose (2026-11-01), the technical pinout with the showcase's
// schematic symbol beside the part.
const DIRECTIONS = ['technical', 'showcase', 'bench', 'chosen'];
const ZOOM_OF = { technical: 1, showcase: 1.6, bench: 1, chosen: 1 };

const tr = (x, lang) => (typeof x === 'string' ? x : (x[lang] ?? x.en));

// Where each pin of the part enters the board, in drawing units, and where its tip is once the part
// is raised: the hole projected by the page's own camera (the front view).
function pinPoints(circuit, id, lift) {
  const { scene } = renderCircuit(circuit, { view: 'front', interactive: true });
  const part = buildCircuit(circuit).parts.find((p) => p.id === id);
  return part.holes.map((h, i) => {
    const p = scene.camera.project(h.pos);
    return { name: part.pinNames[i], node: h.node, row: h.row, x: p.x, y: p.y - lift * RAISE_MM };
  });
}

// The page with a timeline that puts the part on the pedestal (as F1's `scene part` would) and,
// for the bench, presses the button so the part conducts.
function pageFor(c, lang, zoom) {
  const circuit = c.circuit();
  const steps = [
    { at: 0, do: 'focus', parts: [c.part] },
    { at: 0, do: 'raise', part: c.part, mm: RAISE_MM, move: 'cut' },
    { at: 0, do: 'label', part: c.part, text: '' },
    { at: 0, do: 'frame', target: c.part, zoom, move: 'cut' },
    { at: 0, do: 'caption', text: c.title, line: c.idea },
    ...(c.press ? [{ at: 0, do: 'set', part: c.press, field: 'pressed', value: true, move: 'cut' }] : []),
    { at: 60000, do: 'caption', off: true },
  ];
  const withTour = { ...circuit, page: { ...circuit.page, tour: { format: 'vertical', theme: 'stage', steps } } };
  return { circuit, html: renderPage(withTour, { lang }).html };
}

// Hides the board, the other parts and the focus's own layers: what F1 will do with data-scene.
const PEDESTAL_CSS = `
main > svg > :is(.under, .board, .parts, .labels, .shortlabels, .veil, .strips, .coords, .flow, .marks, .results, .probes) { display: none !important; }
main > svg > :is(.spotlight, .lights) > :not([data-part="__ID__"]) { display: none !important; }
main > svg > .spotlight [data-part="__ID__"] { opacity: 1 !important; } /* a raised part's copies, cloned while it was up (a bug F1 fixes in focus.js) */
.fm { position: absolute; inset: 0; pointer-events: none; z-index: 2; font-family: var(--sans); color: var(--ink); }
.fm svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.fm .t { position: absolute; white-space: nowrap; }
.fm.under { z-index: 0; }
main > svg { position: relative; z-index: 1; }
main > svg > rect:first-child { display: none; } /* the background: the leaders under the part show */
.fm .mono { font-family: var(--mono); letter-spacing: 0.02em; }
`;

// Runs in the page: the screen point of a drawing point, through the SVG's own matrix.
function toScreen(svgPoints) {
  const svg = document.querySelector('main > svg:not([hidden])');
  const m = svg.getScreenCTM();
  return svgPoints.map((p) => {
    const q = new DOMPoint(p.x, p.y).matrixTransform(m);
    return { ...p, sx: q.x, sy: q.y };
  });
}

// Runs in the page: what is measured on the pedestal, as shares of the screen and px.
function measurePedestal(id) {
  const W = innerWidth;
  const H = innerHeight;
  const svg = document.querySelector('main > svg:not([hidden])');
  const pieces = [...svg.querySelectorAll(`.spotlight > [data-part="${id}"]`)].map((el) => el.getBoundingClientRect()).filter((r) => r.width || r.height);
  const r = { left: Math.min(...pieces.map((p) => p.left)), right: Math.max(...pieces.map((p) => p.right)), top: Math.min(...pieces.map((p) => p.top)), bottom: Math.max(...pieces.map((p) => p.bottom)) };
  const texts = [...svg.querySelectorAll(`.spotlight > text[data-part="${id}"], .spotlight > [data-part="${id}"] text`)].map((el) => {
    // The printing's letters on screen: its font size through the drawing's matrix (an iso decal is
    // sheared; the square root of the determinant is its mean scale).
    const m = el.getScreenCTM();
    const size = parseFloat(el.getAttribute('font-size') ?? getComputedStyle(el).fontSize);
    return { text: el.textContent, px: Math.round(size * Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) * 10) / 10 };
  });
  const [, , vw] = svg.getAttribute('viewBox').split(' ').map(Number);
  const [, , bw] = svg.dataset.board.split(' ').map(Number);
  const cap = document.querySelector('.tour-caption');
  const c = cap && !cap.hidden ? cap.getBoundingClientRect() : null;
  return {
    part: { left: r.left / W, right: r.right / W, top: r.top / H, bottom: r.bottom / H, widthPx: Math.round(r.right - r.left), heightPx: Math.round(r.bottom - r.top) },
    caption: c ? { top: c.top / H, bottom: c.bottom / H } : null,
    texts,
    frameWidth: vw,
    boardWidth: bw,
    pxPerUnit: W / vw,
  };
}

// Runs in the page: each pin's node voltage (the engine's reading) and the scale's top.
function readVoltages(nodes) {
  const live = window.protoboardLive;
  const reading = live.engine.read();
  const data = JSON.parse(document.getElementById('page-data').textContent);
  return { volts: nodes.map((n) => reading?.nodes?.[n] ?? null), vmax: data.live?.flow?.vmax ?? data.live?.vmax ?? null };
}

// The overlay of one direction, as HTML, from the pins' screen points. Everything stays in the
// area the frame leaves free (stage-shots.js RULES), under the part: callouts as rows below it.
function overlay(direction, c, pins, part, { W, H, lang, volts, vmax, horizontal }) {
  const free = horizontal ? STAGE_INSET.horizontal : STAGE_INSET.vertical;
  const fx0 = free.left * W;
  const fx1 = (1 - free.right) * W;
  const fy1 = (1 - free.bottom) * H;
  const px = (k) => k * (horizontal ? W / 1920 : W / 1080); // a size at the format's reference width
  const cx = ((part.left + part.right) / 2) * W;
  const below = part.bottom * H;
  const lines = [];
  const labels = [];
  const many = pins.length > 4;
  const dot = (p, color = 'var(--accent)', r = px(7)) => `<circle cx="${p.sx}" cy="${p.sy}" r="${r}" fill="${color}"/>`;
  const stroke = (color, w = 2) => `stroke="${color}" stroke-width="${px(w)}" fill="none" stroke-linejoin="round" stroke-linecap="round"`;

  // A chip's back row is behind its body in this view: its numbers go above the body.
  const rows = [...new Set(pins.map((p) => p.row))];
  const meanY = (r) => pins.filter((p) => p.row === r).reduce((t, p) => t + p.sy, 0) / pins.filter((p) => p.row === r).length;
  const back = many && rows.length === 2 ? rows.reduce((a, b) => (meanY(a) < meanY(b) ? a : b)) : null;
  const leaders = [];
  const under = [];
  if (direction === 'technical' || direction === 'chosen') {
    // A pinout as a datasheet prints it: one row of text per pin under the part, a leader from each
    // pin's tip down and across to its text, drawn under the part (so a pin behind the body shows
    // its leader coming out from under it). The pins left of the centre go to the left column, the
    // nearest at the top, so no two leaders cross; the others to the right column.
    const left = pins.filter((p) => p.sx <= cx).sort((a, b) => a.sx - b.sx);
    const right = pins.filter((p) => p.sx > cx).sort((a, b) => b.sx - a.sx);
    const rowH = px(many ? 46 : 52);
    const lowest = Math.max(below, ...pins.map((p) => p.sy));
    const top = Math.min(lowest + px(60), fy1 - px(70) - rowH * (Math.max(left.length, right.length) - 1));
    for (const [side, list] of [['left', left], ['right', right]]) {
      list.forEach((p, i) => {
        const y = top + rowH * i;
        const at = side === 'right' ? `right:${W - fx1}px;text-align:right` : `left:${fx0}px`;
        leaders.push({ side, sx: p.sx, sy: p.sy, y, label: labels.length });
        labels.push(`<div class="t mono" style="${at};top:${y - px(many ? 17 : 19)}px;font-size:${px(many ? 24 : 28)}px">${tr(c.pins[p.name], lang)}</div>`);
        (p.row === back ? under : lines).push(dot(p));
      });
    }
    labels.push(`<div class="t mono" style="left:${fx0}px;top:${fy1 - px(40)}px;font-size:${px(24)}px;color:var(--ink-3)">${tr(c.kind, lang)} · ${tr(c.mark, lang)}</div>`);
    if (direction === 'chosen') {
      // The symbol beside the part, in the room the free area leaves on its right, centred on it.
      const room = fx1 - part.right * W - px(60);
      const s = Math.min(px(many ? 190 : 170), room, (part.bottom - part.top) * H * 1.2);
      const sx = part.right * W + px(60) + (room - s) / 2;
      const sy = ((part.top + part.bottom) / 2) * H - s / 2;
      labels.push(`<div style="position:absolute;left:${sx}px;top:${sy}px;width:${s}px;height:${s}px">${symbolSvg(c.symbol, s)}</div>`);
    }
  } else if (direction === 'showcase') {
    // The part large, each pin's name (a chip's number) at its tip, the symbol below or beside.
    for (const [i, p] of pins.entries()) {
      const text = many ? String(i + 1) : p.name;
      const hidden = p.row === back;
      if (!hidden) lines.push(dot(p, 'var(--accent)', px(8)));
      // A pin behind the body: its number above the body, over where it goes in.
      const y = hidden ? part.top * H - px(44) + (p.sy - Math.min(...pins.filter((q) => q.row === back).map((q) => q.sy))) : p.sy + px(14);
      labels.push(`<div class="t" style="left:${p.sx}px;top:${y}px;transform:translateX(-50%);font-size:${px(40)}px;font-weight:600;color:var(--accent)${hidden ? ';opacity:0.7' : ''}">${text}</div>`);
    }
    const s = px(many ? 190 : 170);
    const sx = horizontal ? fx1 - s : (fx0 + fx1) / 2 - s / 2;
    const sy = horizontal ? (part.top * H + below) / 2 - s / 2 : Math.min(fy1 - s, below + px(100));
    labels.push(`<div style="position:absolute;left:${sx}px;top:${sy}px;width:${s}px;height:${s}px">${symbolSvg(c.symbol, s)}</div>`);
  } else {
    // The bench: each pin's stub run down to a pad at a fixed length; the pad in the voltage's colour
    // (the current layer's scale), the reading beside it.
    const n = pins.length;
    const span = Math.min(fx1 - fx0 - px(100), px(many ? 860 : 560));
    const y = Math.min(fy1 - px(90), below + px(many ? 120 : 150));
    const order = [...pins].sort((a, b) => a.sx - b.sx || a.sy - b.sy);
    order.forEach((p, i) => {
      const x = n === 1 ? cx : cx - span / 2 + (span * i) / (n - 1);
      const v = volts[pins.indexOf(p)];
      const color = voltageColor(v, vmax);
      (p.row === back ? under : lines).push(`<path d="M${p.sx} ${p.sy}V${Math.max(p.sy + px(20), y - px(60))}L${x} ${y}" ${stroke(color, 5)}/>`, dot(p, color, px(6)));
      lines.push(`<rect x="${x - px(16)}" y="${y - px(16)}" width="${px(32)}" height="${px(32)}" rx="${px(4)}" fill="${color}"/>`);
      const reading = v == null ? '—' : formatValue(v, 'V', { decimal: lang === 'es' ? ',' : '.', digits: 2 });
      const drop = many ? (i % 2 ? px(64) : px(24)) : px(28);
      labels.push(`<div class="t mono" style="left:${x}px;top:${y + drop}px;transform:translateX(-50%);text-align:center;font-size:${px(many ? 24 : 32)}px;line-height:1.15"><span style="color:var(--ink-3)">${p.name}</span><br><b style="color:var(--cap-value);font-weight:600">${reading}</b></div>`);
    });
  }
  return { html: `<div class="fm under"><svg viewBox="0 0 ${W} ${H}"><g class="leaders"></g>${under.join('')}</svg></div><div class="fm"><svg viewBox="0 0 ${W} ${H}">${lines.join('')}</svg>${labels.join('')}</div>`, leaders, stroke: stroke('var(--accent)') };
}

// Runs in the page: the overlay put in, then each leader drawn under the part, from the pin's tip
// down to its text's row and across to the text's near end (measured here: the text's width).
function putOverlay({ html, leaders, stroke }) {
  const main = document.querySelector('main');
  main.insertAdjacentHTML('beforeend', html);
  const texts = [...main.querySelectorAll('.fm:not(.under) > .t')];
  main.querySelector('.fm.under .leaders').innerHTML = leaders.map((l) => {
    const r = texts[l.label].getBoundingClientRect();
    const end = l.side === 'left' ? r.right + 14 : r.left - 14;
    return `<path d="M${l.sx} ${l.sy}V${l.y}H${end}" ${stroke}/>`;
  }).join('');
}

// The schematic symbol, small and plain (F4 draws these for real, by type).
function symbolSvg(kind, s) {
  const st = 'stroke="var(--ink-2)" stroke-width="3" fill="none" stroke-linecap="round"';
  if (kind === 'npn') return `<svg viewBox="0 0 100 100" width="${s}" height="${s}"><circle cx="55" cy="50" r="34" ${st}/><path d="M10 50H42M42 30V70M42 40L68 22V8M42 60L68 78V92" ${st}/><path d="M68 78l-12 -2 6 -9z" fill="var(--ink-2)"/><text x="6" y="44" font-size="13" fill="var(--accent)">B</text><text x="74" y="14" font-size="13" fill="var(--accent)">C</text><text x="74" y="96" font-size="13" fill="var(--accent)">E</text></svg>`;
  const pin = (x1, y, x2, label, lx, anchor) => `<path d="M${x1} ${y}H${x2}" ${st}/><text x="${lx}" y="${y + 3}" font-size="8" text-anchor="${anchor}" fill="var(--accent)">${label}</text>`;
  const left = ['GND', 'TRIG', 'OUT', 'RESET'].map((l, i) => pin(0, 26 + i * 16, 18, l, 22, 'start'));
  const right = ['VCC', 'DIS', 'THR', 'CTRL'].map((l, i) => pin(82, 26 + i * 16, 100, l, 78, 'end'));
  return `<svg viewBox="0 0 100 100" width="${s}" height="${s}"><rect x="18" y="12" width="64" height="76" ${st}/><text x="50" y="98" font-size="8" text-anchor="middle" fill="var(--ink-3)">555</text>${left.join('')}${right.join('')}</svg>`;
}

async function openPage(browser, file, format) {
  const { width, height } = RULES[format];
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const page = await context.newPage();
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await page.goto(`${pathToFileURL(file).href}?director=1&theme=stage`);
  await page.evaluate(async (frame) => {
    await document.fonts.ready;
    window.protoboardLive.tour.play();
    // A second and a half: the cues run, the simulation settles.
    for (let t = 0; t < 1500; t += frame) window.protoboardLive.tick(frame);
  }, FRAME);
  return { context, page };
}

function parse(argv) {
  const args = { out: join(root, 'examples/out/focus-mockups'), lang: 'en', jpeg: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o') args.out = resolve(argv[++i]);
    else if (a === '--lang') args.lang = argv[++i];
    else if (a === '--jpeg') args.jpeg = true;
    else throw new Error(`unknown option ${a}`);
  }
  return args;
}

async function main() {
  const args = parse(process.argv.slice(2));
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.log('SKIPPED: Playwright is not installed (npm install)');
    return 2;
  }
  let browser;
  try {
    browser = await chromium.launch({ args: CHROMIUM_ARGS });
  } catch (e) {
    console.log(`SKIPPED: Chromium could not start: ${String(e.message).split('\n')[0]}`);
    return 2;
  }
  mkdirSync(args.out, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), 'focus-'));
  const report = { lang: args.lang, raise: RAISE_MM, cases: [] };
  try {
    for (const c of CASES) {
      const entry = { case: c.name, part: c.part, zooms: {}, shots: [] };
      for (const format of ['vertical', 'horizontal']) {
        const horizontal = format === 'horizontal';
        // How far the part can be framed: the camera's frame at each zoom, as the director gives it.
        // How far the part can be framed: the page with the timeline's frame at each zoom.
        const { circuit } = pageFor(c, args.lang, 1);
        const file = join(work, `${c.name}.html`);
        const zooms = [];
        for (const zoom of ZOOMS) {
          writeFileSync(file, pageFor(c, args.lang, zoom).html);
          const { context, page } = await openPage(browser, file, format);
          await page.addStyleTag({ content: PEDESTAL_CSS.replaceAll('__ID__', c.part) });
          const got = await page.evaluate(measurePedestal, c.part);
          const free = horizontal ? STAGE_INSET.horizontal : STAGE_INSET.vertical;
          const freeW = 1 - free.left - free.right;
          const freeH = 1 - free.top - free.bottom;
          zooms.push({
            zoom,
            widthOfFree: round((got.part.right - got.part.left) / freeW),
            heightOfFree: round((got.part.bottom - got.part.top) / freeH),
            partPx: [got.part.widthPx, got.part.heightPx],
            clamped: got.frameWidth <= got.boardWidth / 12 + 1e-6,
            framePerBoard: round(got.frameWidth / got.boardWidth),
            texts: got.texts,
            inFree: got.part.top >= free.top - 0.01 && got.part.bottom <= 1 - free.bottom + 0.01 && got.part.left >= free.left - 0.01 && got.part.right <= 1 - free.right + 0.01,
            captionBottom: got.caption ? round(got.caption.bottom) : null,
            part: Object.fromEntries(Object.entries(got.part).map(([k, v]) => [k, k.endsWith('Px') ? v : round(v)])),
          });
          await context.close();
        }
        entry.zooms[format] = zooms;

        for (const direction of DIRECTIONS) {
          const zoom = ZOOM_OF[direction];
          const { html: h2 } = pageFor(c, args.lang, zoom);
          writeFileSync(file, h2);
          const { context: ctx, page: pg } = await openPage(browser, file, format);
          try {
            await pg.addStyleTag({ content: PEDESTAL_CSS.replaceAll('__ID__', c.part) });
            const lift = JSON.parse(h2.match(/<script[^>]*id="page-data"[^>]*>([\s\S]*?)<\/script>/)[1]).lift;
            const points = await pg.evaluate(toScreen, pinPoints(circuit, c.part, lift));
            const got = await pg.evaluate(measurePedestal, c.part);
            const { volts, vmax } = await pg.evaluate(readVoltages, points.map((p) => p.node));
            const { width: W, height: H } = RULES[format];
            const drawn = overlay(direction, c, points, got.part, { W, H, lang: args.lang, volts, vmax: vmax ?? Math.max(...volts.filter(Number.isFinite), 1), horizontal });
            await pg.evaluate(putOverlay, drawn);
            const name = `${c.name}-${direction}-${format[0]}`;
            await pg.screenshot({ path: join(args.out, `${name}.png`) });
            if (args.jpeg) await pg.screenshot({ path: join(args.out, `${name}.jpg`), type: 'jpeg', quality: 82 });
            // The overlay's boxes against the frame's bands.
            const boxes = await pg.evaluate(() => [...document.querySelectorAll('.fm .t, .fm > div:not(.t)')].filter((el) => !el.classList.contains('fm')).map((el) => el.getBoundingClientRect()).map((r) => ({ top: r.top / innerHeight, bottom: r.bottom / innerHeight, left: r.left / innerWidth, right: r.right / innerWidth })));
            const free = horizontal ? STAGE_INSET.horizontal : STAGE_INSET.vertical;
            const out = boxes.filter((b) => b.top < free.top - 0.005 || b.bottom > 1 - free.bottom + 0.005 || b.left < free.left - 0.005 || b.right > 1 - free.right + 0.005).length;
            entry.shots.push({ name, zoom, part: Object.fromEntries(Object.entries(got.part).map(([k, v]) => [k, k.endsWith('Px') ? v : round(v)])), volts: direction === 'bench' ? volts : undefined, overlayBoxes: boxes.length, overlayOutOfFree: out });
            console.log(`${out ? '✖' : '✔'} ${name}: part ${got.part.widthPx}×${got.part.heightPx} px, ${boxes.length} overlay boxes, ${out} out of the free area`);
          } finally {
            await ctx.close();
          }
        }
      }
      report.cases.push(entry);
    }
    writeFileSync(join(args.out, 'measurements.json'), `${JSON.stringify(report, null, 2)}\n`);
    for (const e of report.cases) {
      for (const [format, list] of Object.entries(e.zooms)) {
        console.log(`${e.part} ${format}: ${list.map((z) => `×${z.zoom} → ${pctOf(z.widthOfFree)} of the free width${z.clamped ? ' (clamped)' : ''}${z.inFree ? '' : ' (out)'}`).join(', ')}`);
      }
    }
    console.log(`Mock-ups and measurements in ${args.out}`);
    return 0;
  } finally {
    await browser.close();
    rmSync(work, { recursive: true, force: true });
  }
}
const round = (v) => Math.round(v * 1000) / 1000;
const pctOf = (v) => `${Math.round(v * 100)} %`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(e.stack);
      process.exit(1);
    },
  );
}
