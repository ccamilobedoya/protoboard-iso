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
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveTarget, loadCircuit } from '../src/node/workspace.js';
import { renderPage } from '../src/page.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const FRAME = 1000 / 30;

// The rules of a frame (fractions of the screen; px at the format's width).
export const RULES = {
  vertical: { width: 1080, height: 1920, caption: { top: [0.15, 0.17], bottom: [0, 0.4] }, free: { top: 0.4, bottom: 0.75, left: 0.0667, right: 0.9333 }, sizes: { text: 56, number: 44, line: 30 } },
  horizontal: { width: 1920, height: 1080, caption: { top: [0, 1], bottom: [0, 1], right: [0, 0.5] }, free: { top: 0.09, bottom: 0.91, left: 0.5, right: 0.9625 }, sizes: { text: 52 } },
};
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
export function frameProblems(format, m, { moving = false } = {}) {
  const r = RULES[format];
  const out = [];
  const within = (v, [lo, hi]) => v >= lo - 1e-6 && v <= hi + 1e-6;
  if (m.caption) for (const [side, range] of Object.entries(r.caption)) if (!within(m.caption[side], range)) out.push(`caption ${side} at ${pct(m.caption[side])}, not within ${pct(range[0])}…${pct(range[1])}`);
  // Each size shown (a step may have no second line or no value).
  for (const [k, px] of Object.entries(r.sizes)) if (m.sizes?.[k] != null && !(Math.abs(m.sizes[k] - px) <= PX)) out.push(`caption ${k} ${m.sizes[k]} px, not ${px}`);
  // The told part, when there is one (a frame of the whole board may have none).
  if (m.told && !moving) {
    const f = r.free;
    if (m.told.top < f.top - TOLERANCE || m.told.bottom > f.bottom + TOLERANCE || m.told.left < f.left - TOLERANCE || m.told.right > f.right + TOLERANCE) out.push(`${m.told.id} at ${pct(m.told.left)}…${pct(m.told.right)} × ${pct(m.told.top)}…${pct(m.told.bottom)}, out of the free area ${pct(f.left)}…${pct(f.right)} × ${pct(f.top)}…${pct(f.bottom)}`);
  }
  if (m.labels > 1) out.push(`${m.labels} labels, not 1`);
  else if (m.label && !moving) {
    const f = r.free;
    if (m.label.top < f.top - TOLERANCE || m.label.bottom > f.bottom + TOLERANCE || m.label.left < f.left - TOLERANCE || m.label.right > f.right + TOLERANCE) out.push(`the label of ${m.told?.id} out of the free area`);
  }
  if (m.tags) out.push(`${m.tags} result tags shown`);
  if (m.chrome.length) out.push(`chrome shown: ${m.chrome.join(', ')}`);
  return out;
}
const pct = (v) => `${Math.round(v * 1000) / 10} %`;

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
  return {
    theme: document.documentElement.dataset.theme ?? null,
    viewBox: svg.getAttribute('viewBox'),
    caption: capRect ? frac(capRect) : null,
    sizes: { text: size('.text'), number: size('.value .number'), line: size('.line') },
    labelled: labels,
    label: tag ? frac(tag) : null,
    told,
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
