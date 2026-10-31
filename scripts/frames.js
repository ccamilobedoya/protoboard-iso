#!/usr/bin/env node
// Golden frames of the live page (docs/en/stage-and-video.md, V0): each case in test/frames/*.json
// names a recipe, a window size and the calls to window.protoboardLive.tick(ms, steps) made after
// the page loads; the PNG that results must hash the same as the stored one.
//
// A move's case (V6) adds `tour` (a timeline file, from the repository's root): the page is opened
// as a recording (?director=1), the tour starts, and the ticks go through the director, so the
// frame is the move at that time.
//
//   node scripts/frames.js [names…] [--runs n] [--out dir]   compare (n renders of each, all equal)
//   node scripts/frames.js --write                            store the hashes now (an intended change)
//   node scripts/frames.js --determinism                      only that 2 (or --runs n) renders agree
//
// Exits 0 when every case matched, 1 when one differed, 2 when none differed but one could not run:
// no Playwright (npm install), no browser (npx playwright install chromium-headless-shell, and its
// system libraries), or hashes written by another browser. A case that did not run is never a pass.
// --determinism is for the CI (npm run verify sets it when CI is set): another machine has other
// fonts, so the stored hashes say nothing there, but the same page must still give the same image.
//
// The page's clocks are Playwright's fake clock, installed and paused before the page loads and
// never advanced: requestAnimationFrame never fires, performance.now() stands still (so the 8 ms budget
// of a frame never runs out), and only tick() moves the simulation and the dots.

import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { autoLayout } from '../src/layout.js';
import { expandRecipe } from '../src/recipes/index.js';
import { renderPage } from '../src/page.js';
import { CHROMIUM_ARGS } from './stage-shots.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const CASES = join(root, 'test/frames');
// Fields a case file gets from the script (and loadCases adds), not from its author.
const STORED = ['name', 'file', 'renderer', 'html', 'png'];
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

export const loadCases = (dir = CASES) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ name: basename(f, '.json'), file: join(dir, f), ...JSON.parse(readFileSync(join(dir, f), 'utf8')) }));

// The page of a case: the recipe laid out with its default values, as out/<name>.html would be.
export function casePage(c) {
  const r = autoLayout(expandRecipe(c.recipe, c.values).spec);
  if (r.status !== 'done') throw new Error(`recipe ${c.recipe}: ${r.status}`);
  const circuit = c.tour ? { ...r.circuit, page: { ...r.circuit.page, tour: JSON.parse(readFileSync(join(root, c.tour), 'utf8')) } } : r.circuit;
  const { html } = renderPage(circuit, { lang: c.lang ?? 'en' });
  return html;
}

// One field per line, each value on its line: the ticks read as the calls they are.
const caseJson = (c) => `{\n${Object.entries(c).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}\n`;

// What a case's run means against what is stored: { status: 'pass' | 'fail' | 'skip', detail }.
// pngs are the hashes of each run; renderer names the browser that made them.
export function verdict(c, { html, pngs, renderer }, { determinism = false } = {}) {
  if (new Set(pngs).size > 1) return { status: 'fail', detail: `${pngs.length} runs gave ${new Set(pngs).size} different images: the page is not deterministic` };
  if (determinism) return pngs.length > 1 ? { status: 'pass', detail: `${pngs.length} runs agree (not compared with the stored hash)` } : { status: 'skip', detail: 'one run proves nothing (--runs 2)' };
  if (!c.png) return { status: 'fail', detail: 'no stored hash (node scripts/frames.js --write)' };
  if (c.renderer !== renderer) return { status: 'skip', detail: `hashes written by ${c.renderer}, this is ${renderer} (--write to adopt this browser)` };
  if (pngs[0] === c.png) return { status: 'pass' };
  const why = html === c.html ? 'same page, different image (the browser or the system fonts changed?)' : 'the page changed';
  return { status: 'fail', detail: `${why}; after an intended change: node scripts/frames.js --write` };
}

export const exitCode = (results) => (results.some((r) => r.status === 'fail') ? 1 : results.some((r) => r.status === 'skip') ? 2 : 0);

// The browser, or why there is none.
async function openBrowser() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    return { missing: 'Playwright is not installed (npm install)' };
  }
  try {
    // The same compositor settings as a recording (stage-shots.js): without them a frame came out
    // a few colour units off now and then.
    const browser = await chromium.launch({ args: CHROMIUM_ARGS });
    return { browser, renderer: `chromium ${browser.version()} ${process.platform}-${process.arch}` };
  } catch (e) {
    const first = String(e.message).split('\n').find((l) => /not found|Executable|install|error while loading/i.test(l)) ?? String(e.message).split('\n')[0];
    return { missing: `Chromium could not start: ${first.trim()}` };
  }
}

async function shoot(browser, c, file) {
  const context = await browser.newContext({ viewport: c.viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'light', locale: c.lang ?? 'en' });
  try {
    const page = await context.newPage();
    // install alone lets time run; paused, it stands still until the page is gone.
    await page.clock.install({ time: 0 });
    await page.clock.pauseAt(1000);
    await page.goto(pathToFileURL(file).href + (c.tour ? '?director=1' : ''));
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.evaluate(({ ticks, tour }) => {
      if (!window.protoboardLive) throw new Error('the page has no live simulation');
      if (tour) window.protoboardLive.tour.play();
      for (const [ms, steps] of ticks) window.protoboardLive.tick(ms, steps);
    }, { ticks: c.ticks, tour: Boolean(c.tour) });
    return await page.screenshot({ animations: 'disabled', caret: 'hide' });
  } finally {
    await context.close();
  }
}

function parse(argv) {
  const args = { names: [], runs: 1, out: null, write: false, determinism: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write') args.write = true;
    else if (a === '--determinism') args.determinism = true;
    else if (a === '--runs') args.runs = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--out') args.out = resolve(argv[++i]);
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else args.names.push(a);
  }
  return args;
}

async function main() {
  const args = parse(process.argv.slice(2));
  if (args.determinism) args.runs = Math.max(2, args.runs);
  const cases = loadCases().filter((c) => !args.names.length || args.names.includes(c.name));
  if (!cases.length) throw new Error(`no case named ${args.names.join(', ')}`);
  const { browser, renderer, missing } = await openBrowser();
  if (missing) {
    for (const c of cases) console.log(`SKIPPED ${c.name}: ${missing}`);
    return 2;
  }
  const work = mkdtempSync(join(tmpdir(), 'frames-'));
  if (args.out) mkdirSync(args.out, { recursive: true });
  const results = [];
  try {
    for (const c of cases) {
      const html = casePage(c);
      const file = join(work, `${c.name}.html`);
      writeFileSync(file, html);
      const pngs = [];
      for (let k = 0; k < args.runs; k++) {
        const png = await shoot(browser, c, file);
        pngs.push(sha256(png));
        if (args.out && k === 0) writeFileSync(join(args.out, `${c.name}.png`), png);
      }
      const found = { html: sha256(html), pngs, renderer };
      if (args.write) {
        const kept = Object.fromEntries(Object.entries(c).filter(([k]) => !STORED.includes(k)));
        writeFileSync(c.file, caseJson({ ...kept, renderer, html: found.html, png: pngs[0] }));
        const r = new Set(pngs).size > 1 ? verdict(c, found) : { status: 'pass', detail: `written ${pngs[0].slice(0, 12)}…` };
        results.push(r);
        console.log(`${r.status === 'pass' ? '✔' : '✖'} ${c.name}: ${r.detail}`);
        continue;
      }
      const r = verdict(c, found, args);
      results.push(r);
      const mark = { pass: '✔', fail: '✖', skip: 'SKIPPED' }[r.status];
      console.log(`${mark} ${c.name} ${pngs[0].slice(0, 12)}…${r.detail ? `: ${r.detail}` : ''}`);
    }
  } finally {
    await browser.close();
    rmSync(work, { recursive: true, force: true });
  }
  return exitCode(results);
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
