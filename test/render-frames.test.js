// The frames of a video (stage and video, V5): what scripts/render-frames.js reads and writes
// without a browser (the circuit a timeline tells, the subtitles, the rules of a frame in motion),
// the example timelines without a warning, and the tour's log of what ran when, in jsdom. The
// frames themselves are drawn in Chromium (node scripts/render-frames.js … --check).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timelineCircuit, timelineParts, toSrt, whatIf, payoffOf } from '../scripts/render-frames.js';
import { frameProblems } from '../scripts/stage-shots.js';
import { tourIssues } from '../src/tour.js';
import { renderPage } from '../src/page.js';

const tours = fileURLToPath(new URL('../examples/tours/', import.meta.url));
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));

test('render-frames: a timeline tells the circuit beside it, else the recipe of its name', () => {
  const npn = timelineCircuit(join(tours, 'npn-switch.json'), read(join(tours, 'npn-switch.json')));
  assert.ok(npn.parts.some((p) => p.id === 'Q1'), 'examples/npn-switch.json, one folder up');
  const dir = mkdtempSync(join(tmpdir(), 'tour-'));
  try {
    const file = join(dir, 'pot.json');
    writeFileSync(file, JSON.stringify({ circuit: 'potentiometer-led', steps: [] }));
    const pot = timelineCircuit(file, read(file));
    assert.ok(pot.parts.some((p) => p.id === 'RV1'), 'no file of that name: the recipe, laid out');
    assert.throws(() => timelineCircuit(file, { circuit: 'no-such-thing', steps: [] }), /no recipe named no-such-thing/);
    assert.throws(() => timelineCircuit(file, { steps: [] }), /names no circuit/);
    // The timeline itself is never taken for its circuit, even when they share a name.
    const same = join(dir, 'led-resistor.json');
    writeFileSync(same, JSON.stringify({ circuit: 'led-resistor', steps: [] }));
    assert.ok(timelineCircuit(same, read(same)).parts.some((p) => p.id === 'D1'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('render-frames --parts: what a timeline can name, from the simulation', () => {
  const file = join(tours, 'npn-switch.json');
  const { simulated, parts, supplies, nodes } = timelineParts(timelineCircuit(file, read(file)));
  assert.equal(simulated, true);
  const of = (id) => [...parts, ...supplies].find((p) => p.id === id);
  assert.deepEqual(of('D1').readings, ['current', 'voltage', 'power', 'brightness']);
  assert.deepEqual(of('W1').readings, [], 'a wire is framed and assembled, not read');
  assert.equal(of('Q1').pedestal, true, 'a part can stand on a pedestal (scene, land)');
  assert.equal(of('W1').pedestal, false, 'a wire cannot');
  // F2: a part's pins (what a pin step names) and whether its package has a mark.
  assert.deepEqual(of('Q1').pins.map((p) => p.ref), ['Q1.E', 'Q1.B', 'Q1.C']);
  assert.equal(of('Q1').pins[2].text, 'collector · the load');
  assert.equal(of('Q1').mark, true);
  assert.equal(of('R1').mark, true, 'a resistor\'s first band');
  assert.equal(of('S1').mark, false, 'a button has none');
  // F4: which parts have a symbol and an inside view.
  assert.deepEqual([of('Q1').symbol, of('Q1').inside, of('R1').symbol, of('R1').inside, of('S1').symbol], [true, true, true, true, false]);
  assert.deepEqual(of('S1').controls.map((c) => c.field), ['pressed']);
  assert.equal(of('R1').controls[0].scale, 'log');
  assert.ok(supplies.some((s) => s.controls.some((c) => c.field === 'voltage')), 'the bench supply is set, not drawn');
  assert.ok(nodes.some((n) => n.node === 'T+'), 'strips by the names a probe takes');
  // A probe's window: the oscilloscope's own and how fast time runs (the wall clock here: no C or L).
  assert.deepEqual(timelineParts(timelineCircuit(file, read(file))).scope, { window: 10, speed: 0 });
  assert.deepEqual(timelineParts(timelineCircuit('x.json', {}, '555-astable')).scope, { window: 0.55, speed: 0.055 });
});

test('render-frames: every example timeline plays its circuit without a warning', () => {
  const files = readdirSync(tours).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 3, 'the three of the test video');
  for (const f of files) {
    const timeline = read(join(tours, f));
    const circuit = timelineCircuit(join(tours, f), timeline);
    assert.deepEqual(tourIssues({ ...circuit, page: { ...circuit.page, tour: timeline } }), [], f);
  }
});

test('render-frames: captions as SubRip, the moving camera spares the told part', () => {
  assert.equal(
    toSrt([{ from: 0, to: 2400, text: 'A transistor' }, { from: 2400, to: 61_005.4, text: 'Press S1', line: 'and look' }]),
    '1\n00:00:00,000 --> 00:00:02,400\nA transistor\n\n2\n00:00:02,400 --> 00:01:01,005\nPress S1\nand look\n',
  );
  const m = { caption: { top: 0.16, bottom: 0.3 }, sizes: { text: 56 }, told: { id: 'D1', top: 0.8, bottom: 0.9, left: 0.3, right: 0.6 }, labels: 1, tags: 0, chrome: [] };
  assert.equal(frameProblems('vertical', m).length, 1, 'at rest: in the bottom band');
  assert.deepEqual(frameProblems('vertical', m, { moving: true }), [], 'passing through, while the camera moves');
  assert.equal(frameProblems('vertical', { ...m, labels: 2 }, { moving: true }).length, 1, 'never two labels');
  // A part's pinout keeps to the free area at rest (it may cross it while the camera moves).
  const pinned = { ...m, told: null, pinout: { top: 0.5, bottom: 0.8, left: 0.1, right: 0.9 } };
  assert.equal(frameProblems('vertical', pinned).length, 1, 'into the bottom band');
  assert.deepEqual(frameProblems('vertical', { ...pinned, pinout: { ...pinned.pinout, bottom: 0.74 } }), []);
  assert.deepEqual(frameProblems('vertical', pinned, { moving: true }), []);
});

test('render-frames: a recording logs each step when it ran; a wait moves the later ones', async (t) => {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    return t.skip('jsdom not installed');
  }
  const file = join(tours, 'npn-switch.json');
  const timeline = read(file);
  const circuit = timelineCircuit(file, timeline);
  // A wait that never comes true holds the steps after it for its `max`.
  const steps = [...timeline.steps.filter((s) => s.at < 3000), { at: 3000, do: 'wait-until', part: 'D1', field: 'brightness', above: 2, max: 500 }, { at: 3100, do: 'caption', text: 'after' }];
  const { html } = renderPage({ ...circuit, page: { ...circuit.page, tour: { ...timeline, steps } } });
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://page.test/npn.html?director=1' });
  const rect = () => ({ left: 0, top: 0, right: 1080, bottom: 1920, width: 1080, height: 1920 });
  dom.window.document.querySelector('main').getBoundingClientRect = rect;
  for (const svg of dom.window.document.querySelectorAll('svg')) svg.getBoundingClientRect = rect;
  dom.window.eval(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  const live = dom.window.protoboardLive;
  live.tour.play();
  for (let k = 0; k < 150; k++) live.tick(1000 / 30);
  const log = JSON.parse(JSON.stringify(live.tour.log.map(({ t, step }) => [Math.round(t), step.do])));
  assert.deepEqual(log.slice(0, 2), [[0, 'frame'], [0, 'caption']]);
  assert.deepEqual(log.find(([, d]) => d === 'wait-until'), [3000, 'wait-until']);
  const after = log.at(-1);
  assert.equal(after[1], 'caption');
  assert.ok(Math.abs(after[0] - 3600) < 40, `the caption after the wait at ${after[0]} ms, not 3100`);
});

test('assemble: clips that fit, their captions on one clock, ffmpeg\'s arguments', async () => {
  const { readClips, joinedCaptions, ffmpegArgs } = await import('../scripts/assemble.js');
  const dir = mkdtempSync(join(tmpdir(), 'clips-'));
  try {
    const clip = (name, t) => {
      const d = join(dir, name);
      mkdirSync(d);
      writeFileSync(join(d, 'timeline.json'), JSON.stringify(t));
      return d;
    };
    const a = clip('a', { fps: 30, size: { width: 1080, height: 1920 }, frames: 300, captions: [{ from: 0, to: 2000, text: 'one' }] });
    const b = clip('b', { fps: 30, size: { width: 1080, height: 1920 }, frames: 150, captions: [{ from: 500, to: 4000, text: 'two' }] });
    const clips = readClips([a, b]);
    assert.deepEqual(joinedCaptions(clips).map((c) => [c.from, c.to, c.text]), [[0, 2000, 'one'], [10500, 14000, 'two']], 'the second clip starts after 300 frames');
    const args = ffmpegArgs(clips, { out: 'v.mp4' });
    assert.deepEqual(args.filter((x) => x.endsWith('%06d.png')), [join(a, 'frames', '%06d.png'), join(b, 'frames', '%06d.png')]);
    assert.equal(args[args.indexOf('-filter_complex') + 1], '[0:v][1:v]concat=n=2:v=1:a=0,format=yuv420p[v]');
    assert.equal(args.at(-1), 'v.mp4');
    // Burnt captions: 56 px on 1920 lines is 8.4 in libass's 288, above the bottom band.
    assert.match(ffmpegArgs(clips, { out: 'v.mp4', srt: 'captions.srt' })[args.indexOf('-filter_complex') + 1], /subtitles=captions\.srt:force_style='FontSize=8\.4,MarginV=78,/);
    const wide = clip('c', { fps: 25, size: { width: 1920, height: 1080 }, frames: 10 });
    assert.throws(() => readClips([a, wide]), /fps/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// v0.7.0 (K7): a set's payoff, from the simulation: one whole cycle after it, in s of video.
test('render-frames: what a set does to the cycles, and whether the timeline holds one after it', () => {
  const circuit = timelineCircuit('x.json', {}, '555-astable');
  const r = whatIf(circuit, [{ id: 'R1', field: 'resistance', value: 100000 }], ['D1', 'C1']);
  assert.equal(r.speed, 0.055);
  const { before, after } = { before: r.before.D1, after: r.after.D1 };
  assert.ok(before.period > 0.12 && before.period < 0.18, `before ${before.period}`);
  assert.ok(after.period > 0.7 && after.period < 0.95, `after ${after.period}`);
  assert.ok(after.on > 8 * after.off, 'lit far longer than dark: the discharge does not go through R1');
  assert.ok(Math.abs(after.video.period - after.period / 0.055) < 0.05);
  const file = join(tours, '555-what-if.json');
  const tour = { steps: read(file).steps };
  const ok = payoffOf(circuit, tour);
  assert.deepEqual(ok.problems, []);
  assert.ok(ok.sets[0].holdMs >= ok.sets[0].needMs);
  // The same set held 8 s, as the first recording did: one cycle does not fit.
  const short = { steps: [...tour.steps.filter((s) => s.at <= 11700), { at: 19700, do: 'caption', off: true }] };
  assert.deepEqual(payoffOf(circuit, short).problems.map((p) => p.code), ['TOUR_PAYOFF_SHORT']);
  // A comparing probe's set carries the probed part's period before and after into the page.
  const { html } = renderPage({ ...circuit, page: { ...circuit.page, tour: read(file) } }, { lang: 'en' });
  const cycle = JSON.parse(`${html.match(/"cycle":(\{"before":[^,]+,"after":[^,}]+)/)[1]}}`);
  assert.ok(Math.abs(cycle.before - before.period) < 0.01 && Math.abs(cycle.after - after.period) < 0.02, JSON.stringify(cycle));
  // And the LED's time on and off, said in words by the box ("on 0.08 → 0.40 s · off the same").
  const led = JSON.parse(html.match(/"led":(\{"id":"D1","before":\{[^}]*\},"after":\{[^}]*\}\})/)[1]);
  assert.ok(Math.abs(led.before.on - before.on) < 0.01 && Math.abs(led.after.on - after.on) < 0.02 && Math.abs(led.after.off - led.before.off) < 0.15 * led.before.off, JSON.stringify(led));
  // A timeline's pace stands for the page's: the same cycles, other seconds of video.
  const fast = whatIf(circuit, [{ id: 'R1', field: 'resistance', value: 100000 }], ['D1'], 0.15);
  assert.equal(fast.speed, 0.15);
  assert.ok(Math.abs(fast.after.D1.video.period - fast.after.D1.period / 0.15) < 0.05);
  const paced = payoffOf(circuit, { pace: 0.15, steps: tour.steps });
  assert.ok(paced.sets[0].needMs < ok.sets[0].needMs * 0.5, 'a faster pace needs a shorter hold');
});
