#!/usr/bin/env node
// The frames of a video (stage and video, V5; docs/en/stage-and-video.md): a timeline played by
// the page's director in headless Chromium, one PNG per frame, under one clock. The kit makes the
// frames; ffmpeg, outside the kit, makes the video (the command is in the guide and printed at the
// end).
//
//   node scripts/render-frames.js <timeline.json> [-o dir] [--format vertical|horizontal|both]
//        [--fps 30] [--lang en|es] [--theme t] [--tail ms] [--circuit target] [--no-captions] [--check]
//   node scripts/render-frames.js <timeline.json> --validate     the checks only, no browser
//   node scripts/render-frames.js --parts <recipe|circuit> [--what-if R1.resistance=100000 …] [--pace s] [--json]
//                                                                 what a timeline can name, and what a set does to the cycles
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
// (the told part only on a frame where the camera stands still; the caption's contrast read on the
// frame itself; frame 0 against the timeline's first moment), the moments a sound may go with
// (`events`: land, count, probe, mark, led, card) and the payoff of each set (`payoff`: the cycles before and
// after it, in simulated s and s of video, against the time the timeline holds after it), each
// LED's box on the frames measured at rest (`leds`) and each caption's lines as laid out (`lines`).
//
// --no-captions leaves the caption layer out of the frames (their times still go to timeline.json
// and captions.srt): for a video whose subtitles are added later (scripts/assemble.js --burn).
//
// --validate stops before the browser: the timeline's problems (shape, unknown parts and controls,
// moves, rhythm), exit 0 with none and 1 with any. --parts lists what a timeline of that circuit can
// name: the parts (for frame, focus, insert, assemble, raise, label), the readings of each (value,
// wait-until), the controls with their ranges (set), the strips (probe's node) and the frame's bands
// (where the circuit, the told part and the oscilloscope's box go), the environment's fields (a set's
// or a gauge's `environment`, with the parts that follow each); with --what-if, each LED's and
// capacitor's cycle before and after those sets (src/sim/cycle.js); --pace s, in seconds of video at
// that speed of time (a timeline's `pace`) instead of the page's; --json as data. Both are for
// whoever writes a timeline (docs/en/making-a-video.md): nothing is worked out by hand.
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
import { loadTour, onPedestal } from '../src/tour.js';
import { buildCircuit } from '../src/circuit/build.js';
import { compile } from '../src/sim/compile.js';
import { createEngine } from '../src/sim/engine.js';
import { paceOf } from '../src/sim/pace.js';
import { cycles } from '../src/sim/cycle.js';
import { pinList } from '../src/pinout.js';
import { symbolOf, insideOf } from '../src/parts/symbols.js';
import { CHROMIUM_ARGS, frameProblems, firstFrameProblems, captionContrast, measure, RULES } from './stage-shots.js';
import { SCOPE_BOX } from '../src/page/client/moves.js';

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
    // Beside a timeline there may be another one of that name (tours/npn-switch.json beside
    // tours/npn-switch-moves.json): a circuit has parts, a timeline steps.
    if (candidate !== self && existsSync(candidate) && !isTimeline(candidate)) return loadCircuit(resolveTarget(candidate));
  }
  return recipeCircuit(name);
}
function isTimeline(file) {
  try {
    const x = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(x?.steps) && !Array.isArray(x?.parts);
  } catch {
    return false;
  }
}
function recipeCircuit(name) {
  const { spec } = expandRecipe(name);
  if (!spec) throw new Error(`no circuit file and no recipe named ${name}`);
  const r = autoLayout(spec);
  if (r.status !== 'done') throw new Error(`recipe ${name}: ${r.status}`);
  return r.circuit;
}

const READINGS = ['current', 'voltage', 'power', 'brightness', 'vout'];

// What a timeline of this circuit can name, as data (--parts).
export function timelineParts(circuit, lang = 'en', perSecond = null) {
  const built = buildCircuit(circuit);
  const compiled = compile(circuit);
  const engine = compiled.fatal ? null : createEngine(compiled.program);
  const controls = engine?.controls() ?? [];
  // The readings a step can show: those the simulation gives this part, among the four a value takes.
  const reading = engine ? engine.dc().parts ?? {} : {};
  const control = (c) => ({ field: c.field, value: c.value, ...(c.min != null && { min: c.min, max: c.max }), ...(c.unit && { unit: c.unit }), ...(c.scale && { scale: c.scale }) });
  const readings = (id, type) => (type === 'wire' ? [] : READINGS.filter((f) => typeof reading[id]?.[f] === 'number'));
  const entry = (id, type, extra) => ({ id, type, ...extra, readings: readings(id, type), controls: controls.filter((c) => c.id === id).map(control) });
  // A part's pins (a pin step names them "Q1.B"; a chip's also by number) and whether its package has
  // a mark that tells them apart (a pin step's `mark`).
  const pinsOf = (id) => {
    const b = built.parts.find((x) => x.id === id);
    return b && b.type !== 'wire' ? { pins: pinList(b, lang), mark: Boolean(b.built?.mark), symbol: Boolean(symbolOf(b)), inside: Boolean(insideOf(b)) } : { pins: [], mark: false, symbol: false, inside: false };
  };
  const parts = (circuit.parts ?? []).map((p) => entry(p.id, p.type, { ...(p.value != null && { value: p.value }), ...(p.part && { part: p.part }), ...(p.color && { color: p.color }), pedestal: onPedestal(p), ...pinsOf(p.id) }));
  const supplies = (circuit.supplies ?? []).map((s) => entry(s.id, s.kind ?? 'supply', {}));
  const nodes = Object.entries(built.netlist.nodes).map(([node, members]) => ({ node, pins: members.map((m) => `${m.part}.${m.pin}`) }));
  // The oscilloscope's pace (a probe's `window`): the window it shows by default, and how many
  // seconds of simulated time a second of video shows (0: the circuit does not change by itself, the
  // box runs on the wall clock).
  const pace = engine ? paceOf(engine.timeConstants(), engine.periods(), Boolean(engine.hasProgram?.()), engine.stimuli?.() ?? []) : null;
  // A timeline's `pace` (--pace) stands for the page's own: `speed` is then that one, `natural` the page's.
  const speed = pace && perSecond > 0 && pace.perSecond > 0 ? perSecond : pace?.perSecond;
  const scope = pace ? { window: Number(pace.window.toPrecision(3)), speed: Number(speed.toPrecision(3)), ...(perSecond > 0 && { natural: Number(pace.perSecond.toPrecision(3)) }) } : null;
  // The environment's fields (a set's or a gauge's `environment`), with the parts that follow each.
  const environment = controls.filter((c) => c.id === 'environment').map((c) => ({ ...control(c), ...(c.programmed && { programmed: true }), followers: (compiled.program?.devices ?? []).filter((d) => d.follows?.includes(c.field)).map((d) => d.id) }));
  return { simulated: !compiled.fatal, parts, supplies, environment, nodes, scope, frame: FRAME_BANDS };
}

// The bands of a vertical recording, as shares of the height, for whoever estimates sizes before
// rendering: the circuit's band, where the told part must end, and the oscilloscope's box in each
// place (with the box under it, the circuit lies above the box).
export const FRAME_BANDS = {
  free: { top: RULES.vertical.free.top, bottom: RULES.vertical.free.bottom },
  told: { bottom: RULES.vertical.told.bottom },
  scope: { bottom: { ...SCOPE_BOX.bottom }, top: { ...SCOPE_BOX.top } },
};
const pctOf = (v) => `${Math.round(v * 100)} %`;

// What a change does to the circuit's cycles, as a video shows them (--parts --what-if, and the
// payoff of each set in a timeline): the period before and after in simulated s and in s of video
// (the page keeps the speed of time across a set), and an LED's time lit and dark.
const measured = new WeakMap(); // circuit → (sets and parts → whatIf): a payoff asks again for the same
// `pace`: a recording's speed of time (a timeline's `pace`), else the page's.
export function whatIf(circuit, sets, parts = null, pace = null) {
  const key = JSON.stringify([sets, parts, pace]);
  const known = measured.get(circuit)?.get(key);
  if (known) return known;
  const r = measureWhatIf(circuit, sets, parts, pace);
  if (!measured.has(circuit)) measured.set(circuit, new Map());
  measured.get(circuit).set(key, r);
  return r;
}
function measureWhatIf(circuit, sets, parts, pace) {
  const compiled = compile(circuit);
  if (compiled.fatal) return null;
  const r = cycles(compiled.program, { sets, start: circuit.page?.start === 'zero' ? 'zero' : 'dc', parts, perSecond: pace });
  const video = (c) => (c && r.perSecond > 0 ? { ...c, video: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number((v / r.perSecond).toFixed(2))])) } : c);
  const side = (x) => Object.fromEntries(Object.entries(x).map(([id, c]) => [id, video(c)]));
  return { speed: Number(r.perSecond.toPrecision(3)), before: side(r.before), after: side(r.after) };
}

// The payoff of each set that changes a number in a timeline: one whole cycle of every LED (and of
// the probed part) must fit between the set and the next set or the end, in ms of video; an
// oscilloscope's fixed window must hold one whole cycle after it. Problems as { code, step, text }.
export function payoffOf(circuit, tour) {
  const out = [];
  const problems = [];
  const sets = [];
  const end = Math.max(0, ...tour.steps.map((s) => s.at));
  let probe = null;
  tour.steps.forEach((s, i) => {
    if (s.do === 'probe') probe = s.off ? null : s;
    if (s.do !== 'set' || typeof s.value !== 'number') return;
    sets.push({ id: s.part, field: s.field, value: s.value });
    const next = tour.steps.slice(i + 1).find((x) => x.do === 'set');
    const hold = (next ? next.at : end) - s.at;
    const leds = (circuit.parts ?? []).filter((p) => p.type === 'led').map((p) => p.id);
    const r = whatIf(circuit, sets.slice(), [...new Set([...leds, ...(probe?.part ? [probe.part] : [])])], tour.pace ?? null);
    if (!r) return;
    const watched = Object.entries(r.after).filter(([id, c]) => c && (c.on != null || id === probe?.part));
    const need = Math.max(0, ...watched.map(([, c]) => c.video?.period ?? 0)) * 1000;
    out.push({ step: i + 1, at: s.at, set: `${s.part}.${s.field} = ${s.value}`, holdMs: hold, needMs: Math.round(need), ...r });
    const step = i + 1;
    if (need > hold) problems.push({ code: 'TOUR_PAYOFF_SHORT', step, text: `step ${step} (${s.part} → ${s.value}): one whole cycle after it takes ${(need / 1000).toFixed(1)} s of video, the timeline holds ${(hold / 1000).toFixed(1)} s` });
    const p = probe?.part && r.after[probe.part];
    if (probe?.window && p && p.period > probe.window) problems.push({ code: 'TOUR_SCOPE_WINDOW', step, text: `step ${step}: the oscilloscope's window (${probe.window} s) is shorter than one cycle after the set (${p.period.toFixed(2)} s)` });
    for (const [id, c] of Object.entries(r.after)) if (r.before[id] && !c) problems.push({ code: 'TOUR_PAYOFF_NO_CYCLE', step, text: `step ${step}: ${id} shows no whole cycle after the set` });
  });
  return { sets: out, problems };
}

function printParts(name, { simulated, parts, supplies, environment = [], nodes, scope, frame }) {
  const range = (c) => (c.min != null ? ` ${c.min}…${c.max}` : '');
  console.log(`${name}: ${simulated ? 'simulated (a timeline can play)' : 'NOT simulated: no source, no tour'}`);
  const show = (p) => {
    const what = [p.type, p.part, p.value, p.color].filter(Boolean).join(' ');
    console.log(`  ${p.id.padEnd(4)} ${what}${p.pedestal ? ' · pedestal (scene, land, bench)' : ''}${p.symbol ? ' · symbol' : ''}${p.inside ? ' · inside' : ''}`);
    if (p.readings.length) console.log(`       readings (value, wait-until): ${p.readings.join(', ')}`);
    for (const c of p.controls) console.log(`       set ${c.field} = ${c.value}${c.unit ? ` ${c.unit}` : ''}${range(c)}${c.scale === 'log' ? ' (log)' : ''}`);
    if (p.pedestal && p.pins?.length) console.log(`       pins (pin): ${p.pins.map((x) => `${x.ref} ${x.text === x.name ? '' : `(${x.text})`}`.trim()).join(' · ')}${p.mark ? ` · mark (pin "mark": "${p.id}")` : ''}`);
  };
  console.log('parts (frame, focus, insert, assemble, raise, nudge, label):');
  parts.forEach(show);
  if (supplies.length) console.log('supplies (not drawn on the board: only set):');
  supplies.forEach(show);
  if (environment.length) console.log('environment (set "environment", gauge):');
  for (const c of environment) console.log(`  ${c.field} = ${c.value}${c.unit ? ` ${c.unit}` : ''}${range(c)}${c.scale === 'log' ? ' (log)' : ''}${c.programmed ? ' · a program moves it' : ''} · followed by ${c.followers.join(', ') || 'no part'}`);
  console.log(`frame (vertical): the circuit from ${pctOf(frame.free.top)} to ${pctOf(frame.free.bottom)} of the height, the told part ending above ${pctOf(frame.told.bottom)}; the oscilloscope's box (probe "place") bottom ${pctOf(frame.scope.bottom.top)}…${pctOf(frame.scope.bottom.bottom)} (the circuit above it), or top ${pctOf(frame.scope.top.top)}…${pctOf(frame.scope.top.bottom)} (size "compact", the circuit keeps its band)`);
  if (scope) console.log(`oscilloscope (probe "window"): ${scope.window} s on screen by default; ${scope.speed ? `${scope.speed} s of simulated time per second of video` : 'the wall clock (nothing changes by itself)'}`);
  console.log('strips (probe "node"):');
  for (const n of nodes) console.log(`  ${n.node.padEnd(8)} ${n.pins.join(' ')}`);
}

function printWhatIf(sets, { speed, before, after }) {
  console.log(`what if ${sets.map((x) => `${x.id}.${x.field} = ${x.value}`).join(', ')} (${speed} s of simulated time per second of video, before and after):`);
  const s = (v) => `${Number(v.toPrecision(3))} s`;
  const one = (c) => (c ? `period ${s(c.period)} (${c.video.period} s of video)${c.on != null ? `, lit ${s(c.on)} (${c.video.on} s), dark ${s(c.off)} (${c.video.off} s)` : ''}` : 'no whole cycle');
  for (const id of Object.keys({ ...before, ...after })) console.log(`  ${id.padEnd(4)} before: ${one(before[id])}\n       after:  ${one(after[id])}`);
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
  // The lines the sentence takes on screen (its text and second line, as laid out): a box belongs to
  // the line whose band holds its middle (an emphasis is taller than the words beside it).
  const rects = [];
  for (const span of box.querySelectorAll(':scope > p.text:not([hidden]) > .in, :scope > p.line:not([hidden]) > .in')) {
    const range = document.createRange();
    range.selectNodeContents(span);
    for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) rects.push(r);
  }
  const bands = [];
  for (const r of rects.sort((a, b) => a.top - b.top)) {
    const mid = (r.top + r.bottom) / 2;
    const band = bands.find((b) => mid >= b.top && mid <= b.bottom);
    if (band) band.bottom = Math.max(band.bottom, r.bottom);
    else bands.push({ top: r.top, bottom: r.bottom });
  }
  const em = box.querySelector(':scope > p:not([hidden]) .em');
  return [{ text: text('.text'), line: text('.line'), ...(em && { em: em.textContent }), label: text('.value .label'), number: text('.value .number'), lines: bands.length }, view];
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
async function record(browser, file, { format, fps, tail, theme, captions: shown = true, first = [], captionLines = 2 }, dir) {
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
      // The caption's face loads when first used: load it now, so frame 0 never waits for it.
      if (document.getElementById('caption-face')) await document.fonts.load('500 56px "Literata Caption"');
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
      const problems = [...frameProblems(format, m, { moving, captionLines }), ...(at.frame === 0 ? firstFrameProblems(first, m) : [])];
      checks.push({ ...at, told: m.told?.id ?? null, moving, leds: m.leds ?? {}, ...(m.contrast != null && { contrast: Number(m.contrast.toFixed(2)) }), problems });
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
          const m = await page.evaluate(measure);
          // The caption's contrast on what is under it, measured on the frame itself.
          // Not while a caption comes in or the one before fades out over it: the text is part ink then.
          if (shown && m.ink?.length && !m.captionRising && !m.captionFading) {
            // The emphasis in its own colour: the caption's contrast is the lower of the two.
            const both = [captionContrast(png, m.ink, m.inkColor), m.emInk?.length && m.emColor ? captionContrast(png, m.emInk, m.emColor) : null].filter((x) => x != null);
            m.contrast = both.length ? Math.min(...both) : null;
          }
          pending = { t: Math.round(t), frame: k, m, before: lastBox, box };
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
    const events = dir ? await page.evaluate(() => window.protoboardLive.tour.events.slice()) : [];
    return { hashes, captions, checks, log, events, duration: (hashes.length - 1) * frame };
  } finally {
    await context.close();
  }
}

function parse(argv) {
  const args = { parts: null, whatIf: [], pace: null, json: false, validate: false, timeline: null, out: null, formats: null, fps: 30, lang: 'en', theme: null, tail: 1000, circuit: null, captions: true, check: false };
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
    else if (a === '--validate') args.validate = true;
    else if (a === '--parts') args.parts = argv[++i];
    else if (a === '--what-if') args.whatIf.push(argv[++i]);
    else if (a === '--pace') args.pace = Number(argv[++i]);
    else if (a === '--json') args.json = true;
    else if (a === '--no-captions') args.captions = false;
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else args.timeline = resolve(a);
  }
  if (args.pace != null && !(args.pace > 0 && args.pace <= 1000)) throw new Error('--pace: seconds of simulated time per second of video, above 0 and at most 1000');
  if (args.parts) return args;
  if (!args.timeline) throw new Error('usage: node scripts/render-frames.js <timeline.json> [-o dir] [--format vertical|horizontal|both] [--fps 30] [--lang en|es] [--theme t] [--tail ms] [--circuit target] [--no-captions] [--check] [--validate] | --parts <recipe|circuit>');
  if (!(args.fps > 0 && args.fps <= 120)) throw new Error('--fps: between 1 and 120');
  for (const f of args.formats ?? []) if (!RULES[f]) throw new Error(`--format: vertical, horizontal or both, not ${f}`);
  return args;
}

async function main() {
  const args = parse(process.argv.slice(2));
  if (args.parts) {
    const circuit = existsSync(args.parts) ? loadCircuit(resolveTarget(args.parts)) : recipeCircuit(args.parts);
    const parts = timelineParts(circuit, args.lang, args.pace);
    const sets = args.whatIf.map((w) => {
      const m = /^([^.=]+)\.([^=]+)=(.+)$/.exec(w ?? '');
      if (!m) throw new Error(`--what-if: part.field=value (R1.resistance=100000), not ${w}`);
      return { id: m[1], field: m[2], value: m[3] === 'true' ? true : m[3] === 'false' ? false : Number(m[3]) };
    });
    const cyc = sets.length ? whatIf(circuit, sets, null, args.pace) : null;
    if (args.json) console.log(JSON.stringify({ ...parts, ...(cyc && { whatIf: { sets, ...cyc } }) }, null, 2));
    else {
      printParts(args.parts, parts);
      if (cyc) printWhatIf(sets, cyc);
    }
    return 0;
  }
  const timeline = JSON.parse(readFileSync(args.timeline, 'utf8'));
  const circuit = timelineCircuit(args.timeline, timeline, args.circuit);
  // The timeline is the page's tour, whatever the circuit says.
  circuit.page = { ...circuit.page, tour: timeline };
  const { tour, issues } = loadTour(circuit, args.lang);
  for (const i of issues) console.log(`  ${i.severity} ${i.code} ${JSON.stringify(i.params)}`);
  if (!tour) throw new Error('the timeline cannot be played (see above)');
  const payoff = payoffOf(circuit, tour);
  for (const p of payoff.problems) console.log(`  warning ${p.code} ${p.text}`);
  if (args.validate) {
    const last = Math.max(0, ...tour.steps.map((s) => s.at)) / 1000;
    const count = issues.length + payoff.problems.length;
    console.log(count ? `✖ ${count} problem(s) above` : `✔ ${basename(args.timeline)}: ${tour.steps.length} steps, the last at ${last.toFixed(1)} s, no problems`);
    return count ? 1 : 0;
  }
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
      const firstAt = Math.min(...tour.steps.map((x) => x.at));
      const options = { format, fps: args.fps, tail: args.tail, theme: args.theme, captions: args.captions, first: tour.steps.filter((x) => x.at === firstAt) };
      const run = await record(browser, file, { ...options, captionLines: tour.captionLines ?? 2 }, dir);
      const names = run.hashes.map((_, k) => `frames/${String(k).padStart(6, '0')}.png`);
      writeFileSync(join(dir, 'frames.sha256'), run.hashes.map((h, k) => `${h}  ${names[k]}\n`).join(''));
      const captions = intervals(run.captions, (c) => `${c.text}\u0000${c.line}`, (c, last) => ({ text: c.text, ...(c.line && { line: c.line }), ...(c.em && { em: c.em }), lines: Math.max(c.lines ?? 0, last.lines ?? 0) }));
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
        // s of simulated time per s of video: the timeline's `pace`, else the page's own (null: no clock).
        pace: tour.pace ?? payoff.sets[0]?.speed ?? null,
        renderer,
        captions: captions.map((c) => ({ ...c, from: Math.round(c.from), to: Math.round(c.to) })),
        values: values.map((v) => ({ ...v, from: Math.round(v.from), to: Math.round(v.to) })),
        steps: run.log.map((s) => ({ ...s, t: Math.round(s.t) })),
        events: run.events.map((e) => ({ ...e, t: Math.round(e.t) })),
        payoff,
        // Each LED's box on screen (px) on the measured frames where the camera stood still: where
        // a check of the video reads whether it blinks.
        leds: run.checks.filter((c) => !c.moving).flatMap((c) => Object.entries(c.leds).map(([id, box]) => ({ t: c.t, id, box }))),
        checks: { measured: run.checks.length, problems: problems.map(({ leds, ...c }) => c) },
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
