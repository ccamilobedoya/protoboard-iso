#!/usr/bin/env node
// The README's hero animation (docs/img/hero.gif and hero.es.gif), made by the kit from scratch: a
// request in a speech bubble, the breadboard built part by part, then the circuit running.
//
//   node scripts/readme-gif.js [--lang en|es|both] [--fps 15] [--width 960] [-o docs/img]
//
// 1. `layout` lays out the recipe below (9 V, a goal of 15 mA through the LED) in a scratch folder.
// 2. scripts/render-frames.js records examples/tours/readme-hero.json against it, horizontal, without
//    the caption layer: the board in the right half of the frame, the left half empty.
// 3. The bubble is drawn in that left half by the same browser, in the stage theme's colours and the
//    caption's face (Literata, src/page/fonts/, OFL): the timeline's first caption as its text, and
//    under it the reading the recording showed (timeline.json's `values`), never a number of its own.
// 4. ffmpeg holds the first frame (the empty board) while the bubble comes in, lays the bubble and
//    the reading over the frames, dissolves the end into the first frame (a loop without a jump) and
//    writes the GIF with a palette of its own (palettegen, paletteuse).
//
// Development only, like render-frames.js and assemble.js; not part of `npm run verify`. Exits 0
// when every GIF was written under its size cap, 1 when a step failed or a GIF is over the cap, 2
// when ffmpeg, Playwright or Chromium is missing (never a pass then).

import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openBrowser } from './render-frames.js';
import { tempDir } from './tmp.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const TIMELINE = join(root, 'examples/tours/readme-hero.json');
// The circuit the animation tells: what a request in those words lays out.
export const RECIPE = { name: 'led-resistor', values: { V1: 9, D1: { current: '15mA' } } };
const OUT = { en: 'hero.gif', es: 'hero.es.gif' };
const CAP = 3 * 1024 * 1024; // bytes: a README's first screen loads it
const HOLD = 1.2; // s on the empty board while the bubble comes in
const FADE = 0.5; // s of the dissolve back to the first frame, at the end of the loop
// The stage theme's colours (src/page/style.js, [data-theme="stage"]).
const STAGE = { card: '#1d232c', line: '#75808c', ink: '#efe9da', quiet: '#9aa3ad', value: '#ffcc5c' };
const usage = 'usage: node scripts/readme-gif.js [--lang en|es|both] [--fps 15] [--width 960] [-o docs/img]';

export function parseArgs(argv) {
  const args = { langs: ['en', 'es'], fps: 15, width: 960, out: join(root, 'docs/img') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value\n${usage}`);
      return argv[++i];
    };
    if (a === '--lang') {
      const l = next();
      if (!['en', 'es', 'both'].includes(l)) throw new Error(`--lang: en, es or both, not ${l}`);
      args.langs = l === 'both' ? ['en', 'es'] : [l];
    } else if (a === '--fps') args.fps = Number(next());
    else if (a === '--width') args.width = Number(next());
    else if (a === '-o') args.out = resolve(next());
    else throw new Error(`unknown argument ${a}\n${usage}`);
  }
  if (!(Number.isInteger(args.fps) && args.fps >= 5 && args.fps <= 30)) throw new Error('--fps: a whole number from 5 to 30');
  if (!(Number.isInteger(args.width) && args.width >= 320 && args.width <= 1920)) throw new Error('--width: a whole number of pixels from 320 to 1920');
  return args;
}

// ffmpeg's filter graph: [0] the frames, [1] the bubble, [2] the reading (each a full-frame PNG
// with a transparent ground), [3] the first frame again; `duration` s of frames, the reading from
// `valueAt` s of the frames. The end dissolves into the first frame (the empty board, no bubble yet),
// so the loop has no jump.
export function filterGraph({ duration, valueAt, width }) {
  const total = HOLD + duration;
  return [
    `[0:v]tpad=start_mode=clone:start_duration=${HOLD},format=rgb24[board]`,
    '[1:v]format=rgba,fade=in:st=0.15:d=0.45:alpha=1[bubble]',
    `[2:v]format=rgba,fade=in:st=${(HOLD + valueAt).toFixed(2)}:d=0.35:alpha=1[reading]`,
    '[board][bubble]overlay=shortest=1[a]',
    '[a][reading]overlay=shortest=1,format=rgb24,settb=AVTB[main]',
    '[3:v]format=rgb24,settb=AVTB[first]',
    `[main][first]xfade=transition=fade:duration=${FADE}:offset=${(total - FADE).toFixed(2)},scale=${width}:-2:flags=lanczos,split[s0][s1]`,
    '[s0]palettegen=max_colors=256:stats_mode=full[p]',
    '[s1][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle',
  ].join(';');
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// The overlay's page: the bubble (or the reading) alone on a transparent 1920 × 1080 frame, where a
// horizontal recording's caption goes (the left half, 90 px in).
function overlayHtml({ text, reading }) {
  const font = readFileSync(join(root, 'src/page/fonts/literata-latin-500.woff2')).toString('base64');
  const body = reading
    ? `<p class="reading"><span class="number">${escapeHtml(reading.shown)}</span> <span class="label">${escapeHtml(reading.label)}</span></p>`
    : `<svg class="shape"><path/></svg><p class="bubble">${escapeHtml(text)}</p>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Literata Caption"; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 500; }
html, body { margin: 0; width: 1920px; height: 1080px; background: transparent; overflow: hidden; }
body { position: relative; font-family: "Literata Caption"; font-weight: 500; }
.bubble { position: absolute; left: 96px; top: 140px; margin: 0; max-width: 700px; text-wrap: balance; padding: 30px 40px 34px; font-size: 54px; line-height: 1.22; color: ${STAGE.ink}; }
.shape { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; overflow: visible; }
.shape path { fill: ${STAGE.card}; stroke: ${STAGE.line}; stroke-width: 3; stroke-linejoin: round; }
.reading { position: absolute; left: 136px; top: 0; margin: 0; color: ${STAGE.value}; font-size: 60px; font-variant-numeric: tabular-nums; }
.reading .label { color: ${STAGE.quiet}; font-size: 40px; }
</style></head><body>${body}</body></html>`;
}

// The bubble's outline around the text as laid out: a rounded box with a tail under its left side.
function drawBubble() {
  const p = document.querySelector('.bubble');
  if (!p) return null;
  const r = p.getBoundingClientRect();
  const k = 10;
  const [x0, y0, x1, y1] = [r.left, r.top, r.right, r.bottom];
  const tail = `L ${x0 + 112} ${y1} L ${x0 + 60} ${y1 + 44} L ${x0 + 72} ${y1}`;
  document.querySelector('.shape path').setAttribute(
    'd',
    `M ${x0 + k} ${y0} H ${x1 - k} Q ${x1} ${y0} ${x1} ${y0 + k} V ${y1 - k} Q ${x1} ${y1} ${x1 - k} ${y1} ${tail} H ${x0 + k} Q ${x0} ${y1} ${x0} ${y1 - k} V ${y0 + k} Q ${x0} ${y0} ${x0 + k} ${y0} Z`,
  );
  return y1 + 44;
}

async function drawOverlays(browser, text, reading, dir) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  try {
    await page.setContent(overlayHtml({ text }));
    await page.evaluate(() => document.fonts.ready);
    const bottom = await page.evaluate(drawBubble);
    await page.screenshot({ path: join(dir, 'bubble.png'), omitBackground: true });
    await page.setContent(overlayHtml({ reading }));
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate((top) => {
      document.querySelector('.reading').style.top = `${top}px`;
    }, bottom + 28);
    await page.screenshot({ path: join(dir, 'reading.png'), omitBackground: true });
  } finally {
    await page.close();
  }
}

const node = (args, cwd) => spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
const hasFfmpeg = () => spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

// One language: the circuit, its frames, the overlays, the GIF. Returns the GIF's size in bytes.
async function one(lang, args, browser, work) {
  const dir = join(work, lang);
  const laid = node([join(root, 'bin/protoboard-iso.js'), 'layout', `hero-${lang}`, '--recipe', RECIPE.name, '--values', JSON.stringify(RECIPE.values), '--lang', lang], work);
  if (laid.status !== 0) throw new Error(`layout failed:\n${laid.stdout}${laid.stderr}`);
  const rec = node([join(root, 'scripts/render-frames.js'), TIMELINE, '--fps', String(args.fps), '--lang', lang, '--no-captions', '--tail', '800', '--circuit', join(work, `hero-${lang}`), '-o', dir], root);
  if (rec.status === 2) return { skipped: rec.stdout.trim() };
  if (rec.status !== 0) throw new Error(`render-frames failed:\n${rec.stdout}${rec.stderr}`);
  const report = JSON.parse(readFileSync(join(dir, 'timeline.json'), 'utf8'));
  const [caption] = report.captions;
  const [reading] = report.values;
  if (!caption || !reading) throw new Error('the recording has no caption or no reading (examples/tours/readme-hero.json)');
  await drawOverlays(browser, caption.text, reading, dir);
  const out = join(args.out, OUT[lang]);
  const graph = filterGraph({ duration: report.frames / report.fps, valueAt: reading.from / 1000, width: args.width });
  const ff = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(report.fps), '-i', join(dir, 'frames/%06d.png'), '-loop', '1', '-framerate', String(report.fps), '-i', join(dir, 'bubble.png'), '-loop', '1', '-framerate', String(report.fps), '-i', join(dir, 'reading.png'), '-loop', '1', '-framerate', String(report.fps), '-t', String(FADE), '-i', join(dir, 'frames/000000.png'), '-filter_complex', graph, '-loop', '0', out], { encoding: 'utf8' });
  if (ff.status !== 0) {
    rmSync(out, { force: true }); // never a half-written GIF in docs/img
    throw new Error(`ffmpeg failed:\n${ff.stderr}`);
  }
  const bytes = statSync(out).size;
  const seconds = HOLD + report.frames / report.fps;
  console.log(`${bytes > CAP ? '✖' : '✔'} ${out}: ${(bytes / 1024 / 1024).toFixed(2)} MB, ${seconds.toFixed(2)} s, ${args.width} px wide, "${caption.text}" → ${reading.shown} ${reading.label}`);
  return { bytes };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!hasFfmpeg()) {
    console.log('SKIPPED: ffmpeg is not installed (apt install ffmpeg, or a static build).');
    return 2;
  }
  const { browser, missing } = await openBrowser();
  if (missing) {
    console.log(`SKIPPED: ${missing}`);
    return 2;
  }
  const work = tempDir('readme-gif-');
  let failed = false;
  try {
    for (const lang of args.langs) {
      const r = await one(lang, args, browser, work);
      if (r.skipped) {
        console.log(r.skipped);
        return 2;
      }
      if (r.bytes > CAP) failed = true;
    }
  } finally {
    await browser.close();
  }
  return failed ? 1 : 0;
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
