#!/usr/bin/env node
// The stage, measured (stage and video, V4; docs/en/stage-and-video.md, "The frame"): a circuit's
// page with its timeline, drawn by Chromium in the shots the mock-ups were made of, from the real
// page with no CSS added, and the rules of a video frame checked on the DOM of each recording.
//
//   node scripts/stage-shots.js [target] [-o dir] [--lang en|es] [--at ms]
//
// target: a circuit with page.tour (default examples/npn-switch.json). Writes into dir (default
// examples/out/stage): <name>-<theme>-phone.png 390×844 and <name>-<theme>-desk.png 1440×900 for
// the notebook at night and by day and the dark bench (at rest, and with the first focused part
// tapped, the current on),
// <name>-video-v.png 1080×1920 and <name>-video-h.png 1920×1080 (?director=1, the tour played to
// --at ms, default 6000), and stage-report.json with the measurements. For each recording: the
// caption between 16 % and 40 % of the height (vertical) or in the left half (horizontal), its
// sizes (56, 44, 30 px at 1080 wide; 52 at 1920 wide), the told part in the area the reserved
// margin leaves free (and so out of the platforms' bands: the top 15 %, the bottom 25 %), one
// label, its own, in that area too, no result tags, no chrome.
//
// Exits 0 when every rule holds, 1 when one does not, 2 when it could not run (no Playwright or no
// browser): never a pass then. Time is Playwright's fake clock, paused: only tick() moves the page.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveTarget, loadCircuit } from '../src/node/workspace.js';
import { renderPage } from '../src/page.js';
import { CAPTION_LAYOUTS, SCOPE_BOX } from '../src/page/client/moves.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const FRAME = 1000 / 30;

// The rules of a frame (fractions of the screen; px at the format's width). Vertical: the told part
// ends above 65 % of the height (the platforms' buttons and text cover the bottom 35 %; the context
// may still reach 75 %), and an oscilloscope's box on top (a probe's place "top") lies between the
// caption and 40 % (`scope`, moves.js SCOPE_BOX).
export const RULES = {
  vertical: { width: 1080, height: 1920, caption: { top: [0.15, 0.17], bottom: [0, 0.4] }, ink: { left: 90 / 1080, right: 1 - 90 / 1080 }, free: { top: 0.4, bottom: 0.75, left: 0.0667, right: 0.9333 }, told: { bottom: 0.65 }, scope: { ...SCOPE_BOX.top }, sizes: { text: 56, number: 44, data: 56 }, label: 48, lines: 2, card: { top: 0.15, bottom: 0.65 } },
  horizontal: { width: 1920, height: 1080, caption: { top: [0, 1], bottom: [0, 1], right: [0, 0.5] }, ink: { left: 90 / 1920, right: 0.5 }, free: { top: 0.09, bottom: 0.91, left: 0.5, right: 0.9625 }, sizes: { text: 52, data: 52 }, label: 48, lines: 2 },
};
// The caption's least contrast on what is under it (WCAG's ratio), and the first frame's checks.
export const CONTRAST = 4.5;

// Chromium's flags for frames that do not depend on timing: every compositor stage done before a
// frame is drawn, and a changed area repainted with its whole tile. Without them, about one run in
// five of a recording drew a frame or two a few colour units apart (a partial repaint of the parts
// seen through at 50 %); with them, twelve runs in a row gave the same frames.
export const CHROMIUM_ARGS = ['--disable-partial-raster', '--run-all-compositor-stages-before-draw', '--disable-checker-imaging'];
const TOLERANCE = 0.01; // of the screen: a part's antialiased edge
const PX = 1; // a font size, rounded by the browser

// What is wrong with a frame's measurements, as sentences (none: the frame keeps every rule).
// `moving`: the camera is between two frames; the told part and its label may cross the bands
// then (the rules are for a frame at rest), the caption and the labels may not.
export function frameProblems(format, m, { moving = false, captionLines = 2 } = {}) {
  const base = RULES[format];
  const layout = format === 'vertical' ? CAPTION_LAYOUTS[captionLines] : null;
  const r = layout ? { ...base, lines: captionLines, scope: { ...layout.scope }, free: { ...base.free, top: layout.freeTop }, told: { bottom: layout.toldBottom } } : base;
  const out = [];
  const within = (v, [lo, hi]) => v >= lo - 1e-6 && v <= hi + 1e-6;
  if (m.caption) for (const [side, range] of Object.entries(r.caption)) if (!within(m.caption[side], range)) out.push(`caption ${side} at ${pct(m.caption[side])}, not within ${pct(range[0])}…${pct(range[1])}`);
  // Each size shown (a step may have no second line or no value).
  for (const [k, px] of Object.entries(r.sizes)) if (m.sizes?.[k] != null && !(Math.abs(m.sizes[k] - px) <= PX)) out.push(`caption ${k} ${m.sizes[k]} px, not ${px}`);
  // The told part, when there is one (a frame of the whole board may have none).
  if (m.told && !moving) {
    const f = r.free;
    if (m.told.top < f.top - TOLERANCE || m.told.bottom > f.bottom + TOLERANCE || m.told.left < f.left - TOLERANCE || m.told.right > f.right + TOLERANCE) out.push(`${m.told.id} at ${pct(m.told.left)}…${pct(m.told.right)} × ${pct(m.told.top)}…${pct(m.told.bottom)}, out of the free area ${pct(f.left)}…${pct(f.right)} × ${pct(f.top)}…${pct(f.bottom)}`);
    else if (r.told && m.told.bottom > r.told.bottom + TOLERANCE) out.push(`${m.told.id} ends at ${pct(m.told.bottom)}, below ${pct(r.told.bottom)} (the told part stays above the platforms' bottom band)`);
  }
  // The oscilloscope's box: never over the caption; on top, ending at the circuit's band.
  if (m.scope && r.scope) {
    if (m.caption && m.caption.bottom > m.scope.top + TOLERANCE / 2) out.push(`the oscilloscope's box at ${pct(m.scope.top)} overlaps the caption (to ${pct(m.caption.bottom)})`);
    if (m.scope.place === 'top' && m.scope.bottom > r.scope.bottom + TOLERANCE / 2) out.push(`the oscilloscope's box ends at ${pct(m.scope.bottom)}, below ${pct(r.scope.bottom)}`);
  }
  if (m.labels > 1) out.push(`${m.labels} labels, not 1`);
  else if (m.label && !moving) {
    const f = r.free;
    if (m.label.top < f.top - TOLERANCE || m.label.bottom > f.bottom + TOLERANCE || m.label.left < f.left - TOLERANCE || m.label.right > f.right + TOLERANCE) out.push(`the label of ${m.told?.id} out of the free area`);
  }
  // A part's pinout and bench (a video about one part, F2, F3): leaders, rows, stubs, pads, readings.
  if (m.pinout && !moving) {
    const f = r.free;
    if (m.pinout.top < f.top - TOLERANCE || m.pinout.bottom > f.bottom + TOLERANCE || m.pinout.left < f.left - TOLERANCE || m.pinout.right > f.right + TOLERANCE) out.push(`the pinout at ${pct(m.pinout.left)}…${pct(m.pinout.right)} × ${pct(m.pinout.top)}…${pct(m.pinout.bottom)}, out of the free area`);
  }
  // The caption's ink within the safe width (90 px a side), its second line as large as the first by
  // default (a smaller one is the timeline's own choice of --cap-line-size, not checked), its contrast.
  if (m.inkBox && r.ink && (m.inkBox.left < r.ink.left - TOLERANCE / 4 || m.inkBox.right > r.ink.right + TOLERANCE / 4)) out.push(`the caption's text at ${pct(m.inkBox.left)}…${pct(m.inkBox.right)}, out of the safe width ${pct(r.ink.left)}…${pct(r.ink.right)}`);
  if (m.captionLines != null && r.lines && m.captionLines > r.lines) out.push(`the caption takes ${m.captionLines} lines, at most ${r.lines}`);
  // A card's text inside the safe width and between the platforms' bands (15 % to 65 % of a vertical frame).
  if (m.card && r.ink && (m.card.left < r.ink.left - TOLERANCE / 4 || m.card.right > r.ink.right + TOLERANCE / 4)) out.push(`the card's text at ${pct(m.card.left)}…${pct(m.card.right)}, out of the safe width ${pct(r.ink.left)}…${pct(r.ink.right)}`);
  if (m.card && r.card && (m.card.top < r.card.top - TOLERANCE / 4 || m.card.bottom > r.card.bottom + TOLERANCE / 4)) out.push(`the card's text at ${pct(m.card.top)}…${pct(m.card.bottom)} of the height, out of ${pct(r.card.top)}…${pct(r.card.bottom)}`);
  if (m.contrast != null && m.contrast < CONTRAST) out.push(`the caption's contrast ${m.contrast.toFixed(1)}:1 on what is under it, under ${CONTRAST}:1`);
  // The told part's label, never smaller than r.label px at 1080 (scaled by tour.js).
  if (r.label && m.labelPx != null && !moving && m.labelPx < (r.label * Math.min(r.width, r.height)) / 1080 - PX) out.push(`the label of ${m.told?.id} ${Math.round(m.labelPx)} px, under ${r.label} px`);
  if (m.tags) out.push(`${m.tags} result tags shown`);
  if (m.chrome.length) out.push(`chrome shown: ${m.chrome.join(', ')}`);
  return out;
}
const pct = (v) => `${Math.round(v * 1000) / 10} %`;

// The first frame of a recording shows its first moment (K1): with a scene on the pedestal first, the
// part alone; a caption, whole (not rising); a focus, the veil; the current, its layer. `first`: the
// steps of the timeline's first moment; `m`: frame 0 measured.
export function firstFrameProblems(first, m) {
  const out = [];
  const has = (pred) => first.some(pred);
  if (has((s) => s.do === 'scene' && s.mode === 'part') && m.scene !== 'part') out.push('first frame: the board as the page opens, not the scene of the first step (the part on its pedestal)');
  if (has((s) => s.do === 'caption' && !s.off) && (!m.caption || m.captionRising)) out.push('first frame: the first caption is not whole');
  if (has((s) => s.do === 'focus' && s.parts?.length) && !m.focusing) out.push('first frame: the focus of the first step is not on');
  if (has((s) => s.do === 'flow' && s.on) && !m.flow) out.push('first frame: the current layer of the first step is not on');
  return out;
}

// A PNG's pixels (8 bits, RGB or RGBA, not interlaced: what Chromium writes), as { width, height,
// channels, data } with the filters undone.
export function decodePng(buf) {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const depth = buf[24];
  const type = buf[25];
  if (depth !== 8 || (type !== 2 && type !== 6) || buf[28] !== 0) throw new Error('decodePng: 8-bit RGB or RGBA, not interlaced');
  const channels = type === 6 ? 4 : 3;
  const parts = [];
  for (let at = 8; at < buf.length; ) {
    const size = buf.readUInt32BE(at);
    const kind = buf.toString('ascii', at + 4, at + 8);
    if (kind === 'IDAT') parts.push(buf.subarray(at + 8, at + 8 + size));
    if (kind === 'IEND') break;
    at += 12 + size;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const data = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? data[y * stride + x - channels] : 0;
      const b = y > 0 ? data[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? data[(y - 1) * stride + x - channels] : 0;
      let v = row[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      data[y * stride + x] = v & 255;
    }
  }
  return { width, height, channels, data };
}

// WCAG's relative luminance of an sRGB colour (0…255 each).
export function luminance([r, g, b]) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// The caption's contrast on a frame: in the boxes of its lines (`rects`, px), the pixels far from the
// text's colour are what is under it; the lightest tenth of them (for light text; the darkest for dark
// text) against the text's colour. null when the boxes hold too little ground to say.
export function captionContrast(png, rects, color) {
  const img = decodePng(png);
  const text = luminance(color);
  const ground = [];
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.x));
    const y0 = Math.max(0, Math.floor(r.y));
    const x1 = Math.min(img.width, Math.ceil(r.x + r.width));
    const y1 = Math.min(img.height, Math.ceil(r.y + r.height));
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        const i = (y * img.width + x) * img.channels;
        const px = [img.data[i], img.data[i + 1], img.data[i + 2]];
        if (Math.hypot(px[0] - color[0], px[1] - color[1], px[2] - color[2]) > 120) ground.push(luminance(px));
      }
    }
  }
  if (ground.length < 50) return null;
  ground.sort((a, b) => a - b);
  const worst = text > 0.18 ? ground[Math.floor(ground.length * 0.9)] : ground[Math.floor(ground.length * 0.1)];
  return (Math.max(text, worst) + 0.05) / (Math.min(text, worst) + 0.05);
}

// Runs in the page: where the caption, the told part and the rest are, as shares of the screen.
export function measure() {
  const W = innerWidth;
  const H = innerHeight;
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && (r.width > 0 || r.height > 0) ? r : null;
  };
  const frac = (r) => ({ top: r.top / H, bottom: r.bottom / H, left: r.left / W, right: r.right / W });
  const svg = document.querySelector('main > svg:not([hidden])');
  const cap = document.querySelector('.tour-caption');
  const capRect = cap && !cap.hidden ? shown(cap) : null;
  const size = (sel) => {
    const el = cap?.querySelector(sel);
    return el && !el.hidden ? parseFloat(getComputedStyle(el).fontSize) : null;
  };
  // A label is several pieces (box, text, leader), each with its part's id.
  const labels = [...new Set([...svg.querySelectorAll('.spotlabels > [data-part]')].filter(shown).map((el) => el.getAttribute('data-part')))];
  const id = labels[0];
  const pieces = id ? [...svg.querySelectorAll(`.spotlight > [data-part="${id}"]`)].map(shown).filter(Boolean) : [];
  const tag = id ? [...svg.querySelectorAll(`.spotlabels > [data-part="${id}"]`)].map(shown).filter(Boolean)[0] : null;
  const told = pieces.length ? { id, ...frac({ top: Math.min(...pieces.map((r) => r.top)), bottom: Math.max(...pieces.map((r) => r.bottom)), left: Math.min(...pieces.map((r) => r.left)), right: Math.max(...pieces.map((r) => r.right)) }) } : null;
  const visible = (sel) => [...document.querySelectorAll(sel)].filter(shown);
  const pinned = [...svg.querySelectorAll(':scope > .pinout > *, :scope > .bench > *')].map(shown).filter(Boolean);
  const pinout = pinned.length ? frac({ top: Math.min(...pinned.map((r) => r.top)), bottom: Math.max(...pinned.map((r) => r.bottom)), left: Math.min(...pinned.map((r) => r.left)), right: Math.max(...pinned.map((r) => r.right)) }) : null;
  const box = document.querySelector('.scope-inset');
  const boxRect = box ? shown(box) : null;
  // The caption's ink: each of its lines' text as laid out (px), its colour, whether it is still rising.
  // An emphasis (.em, in the accent and larger) is read apart: its own colour against what is under it.
  const ink = [];
  const emInk = [];
  let inkColor = null;
  let emColor = null;
  let rising = false;
  const colorOf = (el) => (getComputedStyle(el).color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  // The boxes of an element's text as laid out, each text node apart (an emphasis is a node of its own).
  const textRects = (root, into, emInto) => {
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const to = n.parentNode.classList?.contains('em') ? emInto : into;
      for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) to.push({ x: r.left, y: r.top, width: r.width, height: r.height });
    }
  };
  if (capRect) {
    for (const span of cap.querySelectorAll(':scope > p:not([hidden]) > .in')) {
      if (!span.textContent || span.closest('[hidden]')) continue;
      textRects(span, ink, emInk);
      if (span.style.transform || (span.style.opacity && span.style.opacity !== '1')) rising = true;
      if (!inkColor && span.parentNode.classList.contains('text')) inkColor = colorOf(span);
      const em = span.querySelector('.em');
      if (em && !emColor) emColor = colorOf(em);
    }
  }
  // How many lines the caption's sentence takes as laid out (its text and its second line, not the
  // data row): the font's own widths, not a count of letters. At most two (RULES). A box belongs to
  // the line whose band holds its middle (an emphasis is taller than the words beside it).
  const bands = [];
  if (capRect) {
    const rects = [];
    for (const span of cap.querySelectorAll(':scope > p.text:not([hidden]) > .in, :scope > p.line:not([hidden]) > .in')) if (span.textContent) textRects(span, rects, rects);
    for (const r of rects.sort((a, b) => a.y - b.y)) {
      const mid = r.y + r.height / 2;
      const band = bands.find((b) => mid >= b.top && mid <= b.bottom);
      if (band) band.bottom = Math.max(band.bottom, r.y + r.height);
      else bands.push({ top: r.y, bottom: r.y + r.height });
    }
  }
  // A card (a timeline's card) over the screen: where its text lies.
  const cardEl = document.querySelector('.tour-card');
  const cardRect = cardEl && !cardEl.hidden ? shown(cardEl) : null;
  const cardInk = [];
  if (cardRect) for (const p of cardEl.querySelectorAll(':scope > p:not([hidden])')) textRects(p, cardInk, cardInk);
  const all = [...ink, ...emInk];
  const inkBox = all.length ? frac({ top: Math.min(...all.map((r) => r.y)), bottom: Math.max(...all.map((r) => r.y + r.height)), left: Math.min(...all.map((r) => r.x)), right: Math.max(...all.map((r) => r.x + r.width)) }) : null;
  // The told label's letter size on screen: its font size through its own scale and the camera.
  const labelEl = tag ? svg.querySelector(`.spotlabels > text[data-part="${id}"], .spotlabels > [data-part="${id}"] text`) : null;
  const ctm = labelEl?.getScreenCTM?.();
  const labelPx = labelEl && ctm ? Number(labelEl.getAttribute('font-size')) * Math.hypot(ctm.a, ctm.b) : null;
  const scope = boxRect ? { ...frac(boxRect), place: box.classList.contains('top') ? 'top' : 'bottom' } : null;
  // Where each LED is on screen (px): its shade's box, the copy over the veil when there is one. A
  // video's later check reads the LED's light there (does it blink in the frame?).
  // Not under a card: it covers them.
  const leds = {};
  if (!cardRect) for (const el of svg.querySelectorAll(':scope > .parts > .led-shade, :scope > .spotlight > .led-shade')) {
    const r = shown(el);
    if (r) leds[el.getAttribute('data-shade')] = { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
  }
  return {
    theme: document.documentElement.dataset.theme ?? null,
    viewBox: svg.getAttribute('viewBox'),
    caption: capRect ? frac(capRect) : null,
    sizes: { text: size('.text'), number: size('.value .number'), line: size('.line'), data: size('.data') },
    ink,
    inkColor,
    inkBox,
    captionRising: rising,
    // The caption before is still fading out over this one (tour.js, a copy with .leaving).
    captionFading: Boolean(document.querySelector('.tour-caption.leaving')),
    captionLines: capRect ? bands.length : null,
    emInk,
    emColor,
    card: cardRect ? frac({ top: Math.min(...cardInk.map((r) => r.y)), bottom: Math.max(...cardInk.map((r) => r.y + r.height)), left: Math.min(...cardInk.map((r) => r.x)), right: Math.max(...cardInk.map((r) => r.x + r.width)) }) : null,
    labelPx,
    scene: document.querySelector('main')?.dataset.scene ?? null,
    focusing: document.body.classList.contains('focusing'),
    flow: document.body.classList.contains('layer-flow'),
    labelled: labels,
    label: tag ? frac(tag) : null,
    told,
    pinout,
    scope,
    leds,
    labels: labels.length,
    tags: visible('main > svg:not([hidden]) .results > [data-q], main > svg:not([hidden]) .labels > *, main > svg:not([hidden]) .shortlabels > *').length,
    chrome: ['nav', '.zoom', '.inspector', '.first-hint'].filter((sel) => visible(sel).length),
  };
}

async function openBrowser() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    return { missing: 'Playwright is not installed (npm install)' };
  }
  try {
    return { browser: await chromium.launch({ args: CHROMIUM_ARGS }) };
  } catch (e) {
    return { missing: `Chromium could not start: ${String(e.message).split('\n')[0]}` };
  }
}

async function open(browser, file, { width, height }, query) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const page = await context.newPage();
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await page.goto(`${pathToFileURL(file).href}${query}`);
  await page.evaluate(async () => {
    // The caption's face loads when first used: load it now, so frame 0 never waits for it.
      if (document.getElementById('caption-face')) await document.fonts.load('500 56px "Literata Caption"');
      await document.fonts.ready;
  });
  return { context, page };
}

// The page as a learner sees it: at rest, then the part tapped, the current on, the buttons pressed.
async function pageShots(browser, file, name, dir, theme, tap) {
  const saved = [];
  for (const [size, width, height] of [['phone', 390, 844], ['desk', 1440, 900]]) {
    const { context, page } = await open(browser, file, { width, height }, `?theme=${theme}`);
    try {
      await page.evaluate(() => window.protoboardLive?.tick(16, 10));
      await page.screenshot({ path: join(dir, `${name}-${theme}-${size}-rest.png`) });
      saved.push(`${name}-${theme}-${size}-rest.png`);
      if (tap) {
        const el = page.locator(`main > svg:not([hidden]) .parts [data-part="${tap}"]`).first();
        const b = await el.boundingBox();
        if (b) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
        await page.locator('nav button[data-key="layer"]').first().click().catch(() => {});
        // Every push button pressed, as in the mock-ups; then the page's own frames (its camera
        // and sheet move by requestAnimationFrame) and the simulation.
        await page.evaluate(() => {
          const live = window.protoboardLive;
          for (const c of live?.engine.controls() ?? []) if (c.field === 'pressed') live.set(c.id, 'pressed', true);
        });
        await page.clock.runFor(800);
        await page.evaluate(() => window.protoboardLive?.tick(40, 10));
        await page.screenshot({ path: join(dir, `${name}-${theme}-${size}.png`) });
        saved.push(`${name}-${theme}-${size}.png`);
      }
    } finally {
      await context.close();
    }
  }
  return saved;
}

// A recording: the tour played to `at` ms, frame by frame, then measured.
async function videoShot(browser, file, name, dir, format, at) {
  const { width, height } = RULES[format];
  const { context, page } = await open(browser, file, { width, height }, '?director=1');
  try {
    await page.evaluate(({ at, frame }) => {
      const live = window.protoboardLive;
      if (!live?.tour) throw new Error('the page has no tour (page.tour)');
      live.tour.play();
      for (let t = 0; t < at; t += frame) live.tick(frame);
    }, { at, frame: FRAME });
    const png = `${name}-video-${format[0]}.png`;
    await page.screenshot({ path: join(dir, png) });
    const m = await page.evaluate(measure);
    return { png, format, ...m, problems: frameProblems(format, m) };
  } finally {
    await context.close();
  }
}

function parse(argv) {
  const args = { target: 'examples/npn-switch.json', out: join(root, 'examples/out/stage'), lang: 'en', at: 6000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o') args.out = resolve(argv[++i]);
    else if (a === '--lang') args.lang = argv[++i];
    else if (a === '--at') args.at = Math.max(0, Number(argv[++i]) || 0);
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else args.target = a;
  }
  return args;
}

async function main() {
  const args = parse(process.argv.slice(2));
  const circuit = loadCircuit(resolveTarget(args.target));
  const { html } = renderPage(circuit, { lang: args.lang });
  const name = basename(args.target).replace(/\.json$/, '');
  const { browser, missing } = await openBrowser();
  if (missing) {
    console.log(`SKIPPED: ${missing}`);
    return 2;
  }
  mkdirSync(args.out, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), 'stage-'));
  const file = join(work, `${name}.html`);
  writeFileSync(file, html);
  const tap = circuit.page?.focus?.[0] ?? circuit.parts.find((p) => p.type === 'led')?.id;
  try {
    const pages = [];
    for (const theme of ['stage', 'notebook', 'dark']) pages.push(...(await pageShots(browser, file, name, args.out, theme, tap)));
    const videos = [await videoShot(browser, file, name, args.out, 'vertical', args.at), await videoShot(browser, file, name, args.out, 'horizontal', args.at)];
    writeFileSync(join(args.out, 'stage-report.json'), `${JSON.stringify({ target: args.target, at: args.at, pages, videos }, null, 2)}\n`);
    for (const v of videos) {
      console.log(`${v.problems.length ? '✖' : '✔'} ${v.png} (${v.theme}): caption ${pct(v.caption?.top ?? 0)}…${pct(v.caption?.bottom ?? 0)}, ${v.told?.id ?? '—'} ${pct(v.told?.top ?? 0)}…${pct(v.told?.bottom ?? 0)} × ${pct(v.told?.left ?? 0)}…${pct(v.told?.right ?? 0)}, text ${v.sizes.text} px`);
      for (const p of v.problems) console.log(`    ${p}`);
    }
    console.log(`${pages.length + videos.length} images in ${args.out}`);
    return videos.some((v) => v.problems.length) ? 1 : 0;
  } finally {
    await browser.close();
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(e.message);
      process.exit(1);
    },
  );
}
