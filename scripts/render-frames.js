#!/usr/bin/env node
// The frames of a video (stage and video, V5; docs/en/stage-and-video.md): a timeline played by
// the page's director in headless Chromium, one PNG per frame, under one clock. The kit makes the
// frames; ffmpeg, outside the kit, makes the video (the command is in the guide and printed at the
// end).
//
//   node scripts/render-frames.js <timeline.json> [-o dir] [--format vertical|horizontal|both]
//        [--fps 30] [--lang en|es] [--theme t] [--tail ms] [--circuit target] [--no-captions] [--check]
//
// The circuit is the timeline's `circuit`: a circuit file of that name beside the timeline or in
// its parent folder (examples/tours/x.json → examples/x.json), else the recipe of that name laid
// out with its default values; --circuit names another. The page is the circuit's own
// (out/<name>.html) with the timeline as its tour, opened with ?director=1 at the format's size
// (vertical 1080 × 1920, horizontal 1920 × 1080). Then, per frame, tick(1000 / fps) and a
// screenshot, until the tour has ended and --tail ms more (default 1000).
//
// Writes into dir (default examples/out/video/<timeline>/<format>/): frames/000000.png…,
// frames.sha256 (sha256sum's format: `sha256sum -c frames.sha256` in that folder), captions.srt
// and timeline.json: the size, fps and length, each caption and value with the times it was on
// screen, each step with the time it ran (a wait moves the later ones) and its move, and the
// frame's rules measured on the DOM (scripts/stage-shots.js) at every caption and every second
// (the told part only on a frame where the camera stands still).
//
// --no-captions leaves the caption layer out of the frames (their times still go to timeline.json
// and captions.srt): for a video whose subtitles are added later (scripts/assemble.js --burn).
//
// --check renders it again in a fresh browser and compares every frame's hash: the same timeline
// must give the same frames. Exits 0 when the frames were written (and, with --check, agreed) and every rule held;
// 1 when a rule failed or two runs differed; 2 when it could not run (no Playwright or no
// browser): never a pass then. Time is Playwright's fake clock, paused: only tick() moves the page.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveTarget, loadCircuit } from '../src/node/workspace.js';
import { autoLayout } from '../src/layout.js';
import { expandRecipe } from '../src/recipes/index.js';
import { renderPage } from '../src/page.js';
import { loadTour } from '../src/tour.js';
import { CHROMIUM_ARGS, frameProblems, measure, RULES } from './stage-shots.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const LONGEST = 10 * 60 * 1000; // a tour is at most ten minutes (src/limits.js); a stuck one stops here

// The circuit a timeline tells: a file beside it or one folder up, else a recipe; or the one named.
export function timelineCircuit(file, timeline, named) {
  if (named) {
    if (existsSync(named)) return loadCircuit(resolveTarget(named));
    return recipeCircuit(named);
  }
  const name = timeline.circuit;
  if (!name) throw new Error(`${file}: the timeline names no circuit ("circuit"); use --circuit`);
  const self = resolve(file);
  for (const dir of [dirname(self), dirname(dirname(self))]) {
    const candidate = join(dir, `${name}.json`);
    if (candidate !== self && existsSync(candidate)) return loadCircuit(resolveTarget(candidate));
  }
  return recipeCircuit(name);
}
function recipeCircuit(name) {
  const { spec } = expandRecipe(name);
  if (!spec) throw new Error(`no circuit file and no recipe named ${name}`);
  const r = autoLayout(spec);
  if (r.status !== 'done') throw new Error(`recipe ${name}: ${r.status}`);
  return r.circuit;
}

// SubRip time: 00:00:01,234.
const srtTime = (ms) => {
  const t = Math.round(ms);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(t / 3_600_000))}:${p(Math.floor(t / 60_000) % 60)}:${p(Math.floor(t / 1000) % 60)},${p(t % 1000, 3)}`;
};
export function toSrt(captions) {
  return captions.map((c, k) => `${k + 1}\n${srtTime(c.from)} --> ${srtTime(c.to)}\n${[c.text, c.line].filter(Boolean).join('\n')}\n`).join('\n');
}

// What is on screen in the caption layer, and the camera (runs in the page).
function captionNow() {
  const view = document.querySelector('main > svg:not([hidden])')?.getAttribute('viewBox') ?? null;
  const box = document.querySelector('.tour-caption');
  if (!box || box.hidden) return [null, view]; // hidden by --no-captions is still read
  const text = (sel) => {
    const el = box.querySelector(sel);
    return el && !el.hidden && !el.closest('[hidden]') ? el.textContent : '';
  };
  return [{ text: text('.text'), line: text('.line'), label: text('.value .label'), number: text('.value .number') }, view];
}

// Intervals of what was shown: a change of `key(x)` closes one and opens the next.
function intervals(samples, key, make) {
  const out = [];
  let open = null;
  for (const { t, x } of samples) {
    const k = x ? key(x) : null;
    if (open && open.k === k) {
      open.last = x;
      continue;
    }
    if (open) out.push({ ...make(open.first, open.last), from: open.from, to: t });
    open = k ? { k, from: t, first: x, last: x } : null;
  }
  const end = samples.at(-1)?.t ?? 0;
  if (open) out.push({ ...make(open.first, open.last), from: open.from, to: end });
  return out;
}

async function openBrowser() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    return { missing: 'Playwright is not installed (npm install)' };
  }
  try {
    const browser = await chromium.launch({ args: CHROMIUM_ARGS });
    return { browser, renderer: `chromium ${browser.version()} ${process.platform}-${process.arch}` };
  } catch (e) {
    return { missing: `Chromium could not start: ${String(e.message).split('\n')[0]}` };
  }
}

// One run: every frame, its hash, and (when `dir` is given) the PNG, the samples and the rules.
async function record(browser, file, { format, fps, tail, theme, captions: shown = true }, dir) {
  const { width, height } = RULES[format];
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const frame = 1000 / fps;
  try {
    const page = await context.newPage();
    await page.clock.install({ time: 0 });
    await page.clock.pauseAt(1000);
    await page.goto(`${pathToFileURL(file).href}?director=1${theme ? `&theme=${encodeURIComponent(theme)}` : ''}`);
    // The layer stays in the page (its text is read below), only not drawn.
    if (!shown) await page.addStyleTag({ content: '.tour-caption { visibility: hidden !important; }' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      if (!window.protoboardLive?.tour) throw new Error('the page has no tour: is the circuit simulated (a source)?');
      window.protoboardLive.tour.play();
    });
    const hashes = [];
    const captions = [];
    const checks = [];
    let lastCaption;
    let lastCheck = -Infinity;
    let lastBox = null; // the camera on the frame before
    // A frame is checked once the next one is known: at rest means the same camera on the frame
    // before and the one after (the first frame of a move has not moved yet).
    let pending = null;
    const settle = (next) => {
      if (!pending) return;
      const { m, before, box, ...at } = pending;
      const moving = (before != null && before !== box) || (next != null && next !== box);
      checks.push({ ...at, told: m.told?.id ?? null, moving, problems: frameProblems(format, m, { moving }) });
      pending = null;
    };
    let left = null; // ms still to record once the tour has ended
    for (let k = 0; k * frame <= LONGEST; k++) {
      const t = k * frame;
      // Frame k shows the page at t: the first is t = 0, then each tick moves it on by one frame.
      // A tick of no time first: the cues at 0 run, so frame 0 already shows them.
      const state = await page.evaluate((ms) => {
        window.protoboardLive.tick(ms);
        return { playing: window.protoboardLive.tour.playing };
      }, k ? frame : 0);
      const png = await page.screenshot({ animations: 'disabled', caret: 'hide' });
      hashes.push(sha256(png));
      if (dir) {
        writeFileSync(join(dir, 'frames', `${String(k).padStart(6, '0')}.png`), png);
        const [now, box] = await page.evaluate(captionNow);
        settle(box);
        captions.push({ t, x: now });
        const changed = JSON.stringify(now) !== lastCaption;
        lastCaption = JSON.stringify(now);
        if (changed || t - lastCheck >= 1000) {
          lastCheck = t;
          pending = { t: Math.round(t), frame: k, m: await page.evaluate(measure), before: lastBox, box };
        }
        lastBox = box;
      }
      if (!state.playing) left ??= tail;
      if (left != null) {
        if (left <= 0) break;
        left -= frame;
      }
    }
    settle(null);
    const log = dir ? await page.evaluate(() => window.protoboardLive.tour.log.map(({ t, step }) => ({ t, ...step }))) : [];
    return { hashes, captions, checks, log, duration: (hashes.length - 1) * frame };
  } finally {
    await context.close();
  }
}

function parse(argv) {
  const args = { timeline: null, out: null, formats: null, fps: 30, lang: 'en', theme: null, tail: 1000, circuit: null, captions: true, check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o') args.out = resolve(argv[++i]);
    else if (a === '--format') args.formats = argv[++i] === 'both' ? ['vertical', 'horizontal'] : [argv[i]];
    else if (a === '--fps') args.fps = Number(argv[++i]);
    else if (a === '--lang') args.lang = argv[++i];
    else if (a === '--theme') args.theme = argv[++i];
    else if (a === '--tail') args.tail = Math.max(0, Number(argv[++i]) || 0);
    else if (a === '--circuit') args.circuit = argv[++i];
    else if (a === '--check') args.check = true;
    else if (a === '--no-captions') args.captions = false;
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else args.timeline = resolve(a);
  }
  if (!args.timeline) throw new Error('usage: node scripts/render-frames.js <timeline.json> [-o dir] [--format vertical|horizontal|both] [--fps 30] [--lang en|es] [--theme t] [--tail ms] [--circuit target] [--no-captions] [--check]');
  if (!(args.fps > 0 && args.fps <= 120)) throw new Error('--fps: between 1 and 120');
  for (const f of args.formats ?? []) if (!RULES[f]) throw new Error(`--format: vertical, horizontal or both, not ${f}`);
  return args;
}

async function main() {
  const args = parse(process.argv.slice(2));
  const timeline = JSON.parse(readFileSync(args.timeline, 'utf8'));
  const circuit = timelineCircuit(args.timeline, timeline, args.circuit);
  // The timeline is the page's tour, whatever the circuit says.
  circuit.page = { ...circuit.page, tour: timeline };
  const { tour, issues } = loadTour(circuit, args.lang);
  for (const i of issues) console.log(`  ${i.severity} ${i.code} ${JSON.stringify(i.params)}`);
  if (!tour) throw new Error('the timeline cannot be played (see above)');
  const { html } = renderPage(circuit, { lang: args.lang });
  if (!html) throw new Error('the circuit has no page');
  const name = basename(args.timeline).replace(/\.json$/, '');
  const formats = args.formats ?? [tour.format];
  const { browser, renderer, missing } = await openBrowser();
  if (missing) {
    console.log(`SKIPPED: ${missing}`);
    return 2;
  }
  const work = mkdtempSync(join(tmpdir(), 'frames-'));
  const file = join(work, `${name}.html`);
  writeFileSync(file, html);
  let failed = false;
  try {
    for (const format of formats) {
      const dir = args.out ? (formats.length > 1 ? join(args.out, format) : args.out) : join(root, 'examples/out/video', name, format);
      rmSync(join(dir, 'frames'), { recursive: true, force: true });
      mkdirSync(join(dir, 'frames'), { recursive: true });
      const options = { format, fps: args.fps, tail: args.tail, theme: args.theme, captions: args.captions };
      const run = await record(browser, file, options, dir);
      const names = run.hashes.map((_, k) => `frames/${String(k).padStart(6, '0')}.png`);
      writeFileSync(join(dir, 'frames.sha256'), run.hashes.map((h, k) => `${h}  ${names[k]}\n`).join(''));
      const captions = intervals(run.captions, (c) => `${c.text}\u0000${c.line}`, (c) => ({ text: c.text, ...(c.line && { line: c.line }) }));
      const values = intervals(run.captions, (c) => (c.number ? c.label : null), (_, last) => ({ label: last.label, shown: last.number }));
      writeFileSync(join(dir, 'captions.srt'), toSrt(captions));
      const problems = run.checks.filter((c) => c.problems.length);
      const { width, height } = RULES[format];
      const report = {
        circuit: timeline.circuit ?? null,
        format,
        size: { width, height },
        fps: args.fps,
        frames: run.hashes.length,
        duration: Math.round(run.duration),
        lang: args.lang,
        renderer,
        captions: captions.map((c) => ({ ...c, from: Math.round(c.from), to: Math.round(c.to) })),
        values: values.map((v) => ({ ...v, from: Math.round(v.from), to: Math.round(v.to) })),
        steps: run.log.map((s) => ({ ...s, t: Math.round(s.t) })),
        checks: { measured: run.checks.length, problems },
      };
      writeFileSync(join(dir, 'timeline.json'), `${JSON.stringify(report, null, 2)}\n`);
      console.log(`${problems.length ? '✖' : '✔'} ${name} ${format}: ${run.hashes.length} frames, ${(run.duration / 1000).toFixed(2)} s at ${args.fps} fps → ${dir}`);
      for (const p of problems) console.log(`    ${(p.t / 1000).toFixed(2)} s: ${p.problems.join('; ')}`);
      if (problems.length) failed = true;
      if (args.check) {
        // Another browser, as another run of the script would have.
        const other = await openBrowser();
        let again;
        try {
          again = await record(other.browser, file, options, null);
        } finally {
          await other.browser.close();
        }
        const k = run.hashes.findIndex((h, i) => h !== again.hashes[i]);
        if (k >= 0 || again.hashes.length !== run.hashes.length) {
          failed = true;
          console.log(`✖ two runs differ${k >= 0 ? ` from frame ${k}` : ` in length (${run.hashes.length} and ${again.hashes.length} frames)`}`);
        } else console.log(`✔ two runs gave the same ${run.hashes.length} frames`);
      }
      console.log(`  video: ffmpeg -framerate ${args.fps} -i "${join(dir, 'frames/%06d.png')}" -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart "${join(dir, `${name}-${format}.mp4`)}"`);
    }
  } finally {
    await browser.close();
    rmSync(work, { recursive: true, force: true });
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
