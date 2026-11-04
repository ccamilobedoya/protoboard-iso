// The moves (stage and video, V6; docs/en/stage-and-video.md, "Moves"): each one built, played by
// the director in jsdom from the npn-switch-moves timeline, read at given times. The golden frame
// of each is in test/frames/move-*.json (scripts/frames.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderPage } from '../src/page.js';
import { loadTour } from '../src/tour.js';
import { CIRCUIT_FOLDER } from '../src/beside.js';
import { DOT_PERIOD } from '../src/sim/look.js';
import { timelineCircuit } from '../scripts/render-frames.js';
import { expandRecipe } from '../src/recipes/index.js';
import { autoLayout } from '../src/layout.js';
import { CAPTION, CARD, INSERT, LIGHT, RAISE, NUDGE, MOVES, ASSEMBLE, LAND } from '../src/page/client/moves.js';

const FRAME = 1000 / 30;
const examples = fileURLToPath(new URL('../examples/', import.meta.url));
const timeline = JSON.parse(readFileSync(`${examples}tours/npn-switch-moves.json`, 'utf8'));
const build = JSON.parse(readFileSync(`${examples}tours/npn-switch-build.json`, 'utf8'));
const npn = (tour = timeline) => ({ ...JSON.parse(readFileSync(`${examples}npn-switch.json`, 'utf8')), page: { tour } });
const at = (ms) => timeline.steps.find((s) => s.at === ms) && ms;

// The page in jsdom; `before(window)` runs before the page's script (a clock, a media query).
async function loadPage(html, { url = 'https://page.test/npn.html?director=1', before } = {}) {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    return null;
  }
  const { window } = new JSDOM(html, { runScripts: 'outside-only', url });
  const size = { width: 360, height: 640 };
  const rect = () => ({ left: 0, top: 0, right: size.width, bottom: size.height, x: 0, y: 0, ...size });
  window.document.querySelector('main').getBoundingClientRect = rect;
  for (const svg of window.document.querySelectorAll('svg')) svg.getBoundingClientRect = rect;
  before?.(window);
  window.eval(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  return window;
}

// A recording of the moves timeline, moved on frame by frame to each time asked.
async function recording(steps, from = timeline) {
  const window = await loadPage(renderPage(npn(steps ? { steps } : from), { lang: 'en' }).html);
  if (!window) return null;
  const live = window.protoboardLive;
  const doc = window.document;
  live.tour.play();
  live.tick(0);
  let now = 0;
  // Long stretches in steps of 100 ms (the director takes any step; jsdom repaints slowly), the
  // last 300 ms frame by frame, as a recording would.
  const to = (ms) => {
    while (now < ms - 300) {
      live.tick(100);
      now += 100;
    }
    while (now < ms - 1e-6) {
      live.tick(FRAME);
      now += FRAME;
    }
  };
  const svg = () => doc.querySelector('main > svg:not([hidden])');
  const layer = (name) => svg().querySelector(`:scope > .${name}`);
  const glow = () => Number(svg().querySelector('.lights > [data-glow="D1"]').style.opacity);
  return { window, live, doc, to, svg, layer, glow, get now() {
    return now;
  } };
}

test('moves: the timelines of the moves are the npn-switch circuit, without a warning', () => {
  for (const tour of [timeline, build]) assert.deepEqual(loadTour(Object.defineProperty(npn(tour), CIRCUIT_FOLDER, { value: examples })).issues, []);
  const codes = (steps) => loadTour(npn({ steps })).issues.map((i) => i.code);
  assert.deepEqual(codes([{ at: 0, do: 'probe', off: true }]), []);
  assert.deepEqual(codes([{ at: 0, do: 'probe', part: 'D1', off: true }]), ['TOUR_FIELD'], 'one of part, node or off');
  assert.deepEqual(codes([{ at: 0, do: 'assemble', parts: ['D1', 'X9'] }]), ['TOUR_UNKNOWN_PART']);
  assert.deepEqual(codes([{ at: 0, do: 'assemble', gap: 50 }]), ['TOUR_FIELD'], 'gap within its range');
  assert.deepEqual(codes([{ at: 595_000, do: 'assemble' }]), ['TOUR_TOO_LONG'], 'as long as its parts take');
});

test('moves: M1 arrival and M14 close bring the veil in with the camera and take it away', async (t) => {
  const r = await recording();
  if (!r) return t.skip('jsdom not installed');
  const focus = at(900);
  r.to(focus + 100);
  const veil = Number(r.layer('veil').style.opacity);
  assert.ok(veil > 0 && veil < 1, `halfway in: ${veil}`);
  assert.equal(r.layer('strips').style.opacity, r.layer('veil').style.opacity, 'the strips come with it');
  assert.ok(r.doc.body.classList.contains('focusing'));
  r.to(focus + 800);
  assert.equal(r.layer('veil').style.opacity, '', 'arrived');
  // M13: the coordinates of S1's leads are lit with the focus, on the clock.
  assert.match(r.doc.getElementById('dynamic').textContent, /\.coords > \[data-col="\d+"\]/);
  // M14: the current layer keeps the veil; the strips and coordinates leave with the travel.
  const close = at(12400);
  r.to(close + 750);
  const strips = Number(r.layer('strips').style.opacity);
  assert.ok(strips > 0 && strips < 1, `halfway out: ${strips}`);
  assert.ok(r.doc.body.classList.contains('focusing'), 'still in focus while it leaves');
  r.to(close + 1600);
  assert.ok(!r.doc.body.classList.contains('focusing'), 'gone');
  assert.equal(r.layer('strips').style.opacity, '');
});

test('moves: M2 push closes in slowly; M3 flip is a cut on the clock', async (t) => {
  // jsdom draws nothing, so a part has no box: the push closes in on the board here (the
  // timeline's push on D1 is in the golden frame, move-m02-push).
  const pushed = await recording([
    { at: 0, do: 'frame', target: 'board', move: 'cut' },
    { at: 500, do: 'frame', target: 'board', zoom: 1.6, move: 'push', ms: 4000 },
  ]);
  if (!pushed) return t.skip('jsdom not installed');
  const width = () => Number(pushed.svg().getAttribute('viewBox').split(' ')[2]);
  pushed.to(500);
  const start = width();
  pushed.to(2500);
  const middle = width();
  pushed.to(4600);
  const end = width();
  assert.ok(start > middle && middle > end, `${start} > ${middle} > ${end}`);
  assert.ok(start - middle > middle - end, 'cubic out: most of the way in the first half');
  assert.ok(Math.abs(end - start / 1.6) < 1, 'zoom 1.6');
  const r = await recording();
  r.to(at(8800) + FRAME);
  assert.equal(r.svg().dataset.view, 'back');
  r.to(at(10000) + FRAME);
  assert.equal(r.svg().dataset.view, 'front');
});

test('moves: M12 a caption leaves, then its lines rise into their masks one after the other', async (t) => {
  const r = await recording();
  if (!r) return t.skip('jsdom not installed');
  const caption = at(2100);
  const box = () => r.doc.querySelector('.tour-caption:not(.leaving)');
  const rise = (sel) => box().querySelector(`${sel} > .in`).style.transform;
  r.to(caption + 100);
  const old = r.doc.querySelector('.tour-caption.leaving');
  assert.ok(old, 'the caption before is still there');
  assert.match(old.querySelector('.text').textContent, /A transistor as a switch/);
  const fading = Number(old.style.opacity);
  assert.ok(fading > 0 && fading < 1, `fading: ${fading}`);
  assert.match(box().querySelector('.text').textContent, /Press S1/, 'the new text is in the page at once');
  assert.equal(rise('.text'), `translateY(${CAPTION.rise.toFixed(2)}%)`, 'below its mask until the old one has left');
  assert.equal(Number(box().querySelector('.text > .in').style.opacity), 0, 'and unseen: a line half under its mask is never seen cut');
  r.to(caption + CAPTION.out + 150);
  assert.equal(r.doc.querySelector('.tour-caption.leaving'), null, 'the old one is gone');
  const first = Number(rise('.text').match(/[\d.]+/)[0]);
  const second = Number(rise('.line').match(/[\d.]+/)[0]);
  assert.ok(first < second, `the second line follows: ${first} < ${second}`);
  r.to(caption + CAPTION.out + CAPTION.stagger + CAPTION.in + FRAME);
  assert.equal(rise('.text'), '');
  assert.equal(rise('.line'), '');
});

test('moves: M6 the dots start from rest, M8 the LED lights up in a hit, M9 the value counts', async (t) => {
  const r = await recording();
  if (!r) return t.skip('jsdom not installed');
  const press = at(2700);
  r.to(press - FRAME);
  assert.equal(r.glow(), 0, 'dark before the press');
  // How far the dots move in one frame.
  const speed = () => {
    const before = r.live.phases;
    r.live.tick(FRAME);
    const after = r.live.phases;
    return Math.max(...after.map((p, k) => Math.abs(((p - before[k] + 1.5 * DOT_PERIOD) % DOT_PERIOD) - DOT_PERIOD / 2)));
  };
  r.to(press + FRAME);
  const lit = r.glow();
  const early = speed();
  r.to(press + 2 * FRAME);
  const later = r.glow();
  assert.ok(lit > 0 && lit < later, `M8 rising: ${lit} < ${later}`);
  r.to(press + LIGHT.ms + FRAME);
  const full = r.glow();
  r.to(press + 900);
  const steady = speed();
  assert.ok(early < steady / 2, `M6 ramping: ${early} < ${steady}`);
  assert.equal(r.glow(), full, 'lit in 180 ms, then steady');
  const number = () => Number(r.doc.querySelector('.tour-caption .value .number').textContent.replace(/[^\d.]/g, ''));
  const value = at(3300);
  r.to(value + 250);
  const counting = number();
  r.to(value + 600);
  assert.ok(counting > 0 && counting < number(), `M9: ${counting} < ${number()}`);
});

test('moves: M15 a part comes down to its holes, the circuit dark until it lands', async (t) => {
  const r = await recording();
  if (!r) return t.skip('jsdom not installed');
  const insert = at(10400);
  r.to(insert - FRAME);
  assert.ok(r.glow() > 0, 'lit before');
  r.to(insert + FRAME);
  const lifted = r.svg().querySelectorAll(':scope > .spotlight > .lift[data-part="D1"]');
  assert.ok(lifted.length > 0);
  const dy = Number(lifted[0].getAttribute('transform').match(/translate\(0 (-[\d.]+)\)/)[1]);
  assert.ok(dy < -INSERT.mm * 3, `high up: ${dy}`);
  assert.ok(r.svg().querySelector(':scope > .spotlabels > .lift[data-part="D1"]')?.getAttribute('transform'), 'its label goes with it');
  assert.equal(r.svg().querySelector(':scope > .parts > [data-part="D1"]').style.opacity, '0', 'not in its holes');
  assert.equal(r.glow(), 0, 'no current in the air');
  r.to(insert + INSERT.ms / 2);
  const lower = Number(lifted[0].getAttribute('transform').match(/translate\(0 (-[\d.]+)\)/)[1]);
  assert.ok(lower > dy && lower < 0, `coming down: ${lower}`);
  r.to(insert + INSERT.ms + FRAME);
  assert.equal(lifted[0].getAttribute('transform'), null, 'landed');
  assert.equal(r.svg().querySelector(':scope > .parts > [data-part="D1"]').style.opacity, '');
  r.to(insert + INSERT.ms + LIGHT.ms + 2 * FRAME);
  assert.ok(r.glow() > 0, 'lit again');
});

test('moves: M16 a raise sets a part apart, slowly, and keeps it up, in the circuit, until a raise to 0', async (t) => {
  const r = await recording();
  if (!r) return t.skip('jsdom not installed');
  const up = at(5200);
  const down = at(7800);
  const copy = () => r.svg().querySelector(':scope > .spotlight > .lift[data-part="D1"]');
  const height = () => 0 - Number(copy()?.getAttribute('transform')?.match(/translate\(0 (-?[\d.]+)\)/)?.[1] ?? 0) || 0;
  r.to(up + MOVES.arrival.ms / 4);
  const rising = height();
  r.to(up + MOVES.arrival.ms + FRAME);
  const top = height();
  assert.ok(rising > 0 && rising < top, `rising: ${rising} < ${top}`);
  const lift = JSON.parse(r.doc.getElementById('page-data').textContent).lift;
  assert.ok(Math.abs(top - RAISE.mm * lift) < 0.01, `3 mm up: ${top}`);
  r.to(down - FRAME);
  assert.equal(height(), top, 'it stays up');
  assert.ok(r.glow() > 0, 'still in the circuit: the LED stays lit');
  assert.equal(r.svg().querySelector(':scope > .parts > [data-part="D1"]').style.opacity, '0');
  r.to(down + MOVES.arrival.ms + FRAME);
  assert.equal(height(), 0, 'back in its holes');
  assert.equal(r.svg().querySelector(':scope > .parts > [data-part="D1"]').style.opacity, '');
});

// A nudge (2026-11-02): a part the voice names as a cause rises a little and comes back, the focus
// and the told label left as they were; under the veil it is drawn over it only while it moves.
test('moves: a nudge lifts a part out of focus a little and back, keeping the focus and the told label', async (t) => {
  const r = await recording([
    { at: 0, do: 'frame', target: 'D1', move: 'cut' },
    { at: 0, do: 'focus', parts: ['D1'] },
    { at: 500, do: 'nudge', part: 'R1' },
  ]);
  if (!r) return t.skip('jsdom not installed');
  const lift = JSON.parse(r.doc.getElementById('page-data').textContent).lift;
  const copy = () => r.svg().querySelector(':scope > .spotlight > .lift[data-part="R1"]');
  const height = () => 0 - Number(copy()?.getAttribute('transform')?.match(/translate\(0 (-?[\d.]+)\)/)?.[1] ?? 0) || 0;
  r.to(400);
  assert.equal(r.svg().querySelector(':scope > .spotlight > [data-part="R1"]'), null, 'R1 under the veil before');
  r.to(500 + NUDGE.ms * NUDGE.rise * 0.4);
  const rising = height();
  r.to(500 + NUDGE.ms * 0.5);
  const top = height();
  assert.ok(rising > 0 && rising < top, `rising: ${rising} < ${top}`);
  assert.ok(Math.abs(top - NUDGE.mm * lift) < 0.01, `${NUDGE.mm} mm up: ${top}`);
  assert.ok(r.svg().querySelector(':scope > .spotlight > [data-part="D1"]'), 'the focus stays');
  const labels = [...r.svg().querySelectorAll(':scope > .spotlabels > [data-part]')].map((el) => el.getAttribute('data-part'));
  assert.deepEqual([...new Set(labels)], ['D1'], 'and so does the told label');
  assert.equal(r.doc.body.classList.contains('focusing'), true);
  r.to(500 + NUDGE.ms * 0.85);
  assert.ok(height() > 0 && height() < top, 'coming back');
  r.to(500 + NUDGE.ms + 2 * FRAME);
  assert.equal(r.svg().querySelector(':scope > .spotlight > [data-part="R1"]'), null, 'under the veil again');
  assert.equal(r.svg().querySelector(':scope > .parts > [data-part="R1"]').style.opacity, '', 'in its holes');
  const field = (step) => loadTour(npn({ steps: [{ at: 0, ...step }] })).issues.map((i) => `${i.code}:${i.params.field ?? i.params.part}`);
  assert.deepEqual(field({ do: 'nudge', part: 'R1', mm: 2, ms: 700, curve: [0.34, 1.56, 0.64, 1] }), []);
  assert.deepEqual(field({ do: 'nudge', part: 'R1', mm: 6 }), ['TOUR_FIELD:mm']);
  assert.deepEqual(field({ do: 'nudge', part: 'R1', ms: 2000 }), ['TOUR_FIELD:ms']);
  assert.deepEqual(field({ do: 'nudge', part: 'R1', move: 'travel' }), ['TOUR_FIELD:move']);
  assert.deepEqual(field({ do: 'nudge', part: 'X9' }), ['TOUR_UNKNOWN_PART:X9']);
  assert.deepEqual(field({ do: 'nudge' }), ['TOUR_FIELD:part']);
});

test('moves: a tap in the page lifts nothing', async (t) => {
  const window = await loadPage(renderPage({ ...npn(), page: {} }, { lang: 'en' }).html, { url: 'https://page.test/npn.html' });
  if (!window) return t.skip('jsdom not installed');
  const svg = window.document.querySelector('main > svg:not([hidden])');
  svg.querySelector('.parts > [data-part="D1"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.ok(window.document.body.classList.contains('focusing'), 'tapped');
  assert.equal(svg.querySelector('.lift'), null);
});

test('moves: under reduced motion a tour keeps every final state and moves nothing', async (t) => {
  const window = await loadPage(renderPage(npn(), { lang: 'en' }).html, {
    url: 'https://page.test/npn.html',
    before: (w) => {
      w.matchMedia = (q) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} });
    },
  });
  if (!window) return t.skip('jsdom not installed');
  const live = window.protoboardLive;
  window.document.querySelector('nav .menu .tour-play').click();
  let now = 0;
  const to = (ms) => {
    for (; now < ms - 1e-6; now += FRAME) live.tick(FRAME);
  };
  const svg = window.document.querySelector('main > svg:not([hidden])');
  to(900 + FRAME);
  assert.equal(svg.querySelector(':scope > .veil').style.opacity, '', 'the veil at once');
  to(2100 + FRAME);
  assert.equal(window.document.querySelector('.tour-caption .text > .in').style.transform, '');
  assert.equal(window.document.querySelector('.tour-caption.leaving'), null);
  to(10400 + FRAME);
  assert.equal(svg.querySelector(':scope > .spotlight > .lift'), null, 'nothing lifted');
  assert.ok(Number(svg.querySelector('.lights > [data-glow="D1"]').style.opacity) > 0, 'the LED stays lit');
});

const opacity = (svg, layer, id) => [...svg.querySelectorAll(`:scope > .${layer} > [data-part="${id}"]`)].map((el) => el.style.opacity);

test('moves: M4 the circuit builds itself one part after the other, M5 a wire drawn end to end', async (t) => {
  const r = await recording(null, build);
  if (!r) return t.skip('jsdom not installed');
  const step = build.steps.find((s) => s.do === 'assemble');
  const ids = Object.keys(JSON.parse(r.doc.getElementById('page-data').textContent).parts);
  const startOf = (id) => step.at + ids.indexOf(id) * step.gap;
  r.to(step.at - FRAME);
  assert.ok(opacity(r.svg(), 'parts', 'D1').every((o) => o === ''), 'all on the board before');
  r.to(step.at + FRAME);
  assert.ok(opacity(r.svg(), 'parts', 'D1').every((o) => o === '0'), 'then off it');
  // R1 on its way down: the part itself moves (it is not in focus), its label with it.
  r.to(startOf('R1') + ASSEMBLE.ms / 3);
  const lift = r.svg().querySelector(':scope > .parts > .lift[data-part="R1"]');
  assert.match(lift?.getAttribute('transform') ?? '', /translate\(0 -[\d.]+\)/);
  assert.ok(opacity(r.svg(), 'parts', 'S1').every((o) => o === ''), 'S1 is in');
  assert.equal(r.svg().querySelector(':scope > .parts > .lift[data-part="S1"]'), null, 'and unwrapped');
  assert.ok(opacity(r.svg(), 'parts', 'D1').every((o) => o === '0'), 'D1 not yet');
  // W1 drawn: the pieces near its start shown, those near its end not yet.
  r.to(startOf('W1') + ASSEMBLE.ms / 3);
  const pieces = [...r.svg().querySelectorAll(':scope > .parts > [data-part="W1"][data-along]')];
  const shown = pieces.filter((el) => el.style.opacity === '');
  assert.ok(shown.length > 0 && shown.length < pieces.length, `${shown.length} of ${pieces.length}`);
  assert.ok(Math.max(...shown.map((el) => Number(el.dataset.along))) < Math.min(...pieces.filter((el) => el.style.opacity === '0').map((el) => Number(el.dataset.along))), 'from one end');
  r.to(step.at + (ids.length - 1) * step.gap + ASSEMBLE.ms + FRAME);
  for (const id of ids) assert.ok(opacity(r.svg(), 'parts', id).every((o) => o === ''), `${id} in`);
  assert.equal(r.svg().querySelector('.lift'), null);
});

test('moves: M7 a flash runs the current path from + to −, M11 the oscilloscope in a box of its own', async (t) => {
  const r = await recording(null, build);
  if (!r) return t.skip('jsdom not installed');
  const pulse = build.steps.find((s) => s.do === 'pulse').at;
  const lit = () => [...r.svg().querySelectorAll(':scope > .pulse > *')].map((el) => Number(el.style.opacity));
  r.to(pulse + 300);
  const early = lit();
  assert.ok(early.length > 0 && early.some((o) => o > 0) && early.some((o) => o === 0), 'some pieces lit, not all');
  r.to(pulse + 1200);
  assert.notDeepEqual(lit(), early, 'the flash moved on');
  r.to(pulse + MOVES.travel.ms + FRAME);
  assert.equal(r.svg().querySelector(':scope > .pulse'), null, 'gone at the end');
  const probe = build.steps.find((s) => s.do === 'probe').at;
  r.to(probe + FRAME);
  assert.ok(r.doc.body.classList.contains('with-scope'));
  assert.ok(r.doc.querySelector('.scope-inset svg polyline.scope-trace.i'), 'the current, as asked');
  assert.equal(r.doc.querySelectorAll('.scope-inset .scope-trace').length, 1, 'one trace');
  const off = build.steps.find((s) => s.do === 'probe' && s.off).at;
  r.to(off + FRAME);
  assert.equal(r.doc.querySelector('.scope-inset'), null);
  assert.ok(!r.doc.body.classList.contains('with-scope'));
});

// M11 showing a change (2026-11-02): a probe's fixed `window` keeps the time axis still, so a set
// that slows the 555 shows as a longer tooth, and `marks` draws a line where the set came.
async function astable(steps) {
  const circuit = timelineCircuit('555-astable.json', {}, '555-astable');
  const window = await loadPage(renderPage({ ...circuit, page: { ...circuit.page, tour: { steps } } }, { lang: 'en' }).html);
  if (!window) return null;
  window.protoboardLive.tour.play();
  window.protoboardLive.tick(0);
  let now = 0;
  const to = (ms) => {
    for (; now < ms; now += 100) window.protoboardLive.tick(100);
  };
  const axis = () => [...window.document.querySelectorAll('.scope-inset .scope-time')].map((el) => el.textContent);
  return { doc: window.document, to, axis, live: window.protoboardLive };
}

test('moves: M11 a probe with a fixed window and marks shows the set that slowed the 555', async (t) => {
  const r = await astable([
    { at: 0, do: 'probe', part: 'C1', window: 0.2, marks: true },
    { at: 1000, do: 'set', part: 'R1', field: 'resistance', value: 100000, move: 'cut' },
    { at: 1000, do: 'set', part: 'R2', field: 'resistance', value: 12000, move: 'cut' },
  ]);
  if (!r) return t.skip('jsdom not installed');
  r.to(500);
  assert.equal(r.axis()[0], '0 s');
  assert.equal(r.axis().at(-1), '200 ms', 'the window asked, not the kit\'s');
  assert.equal(r.doc.querySelector('.scope-inset .scope-mark'), null, 'no set yet');
  r.to(1100);
  const marks = [...r.doc.querySelectorAll('.scope-inset .scope-mark-text')].map((el) => el.textContent);
  assert.deepEqual(marks, ['R1 → 100 kΩ', 'R2 → 12 kΩ'], 'a line at each set, with its new value');
  // The 555's time runs at 0.055 s a second (render-frames.js --parts): past the window at 3.6 s.
  r.to(4500);
  const [from, , end] = r.axis();
  assert.notEqual(from, '0 s', `scrolling once the time is past the window: ${from} … ${end}`);
  assert.ok(r.doc.querySelector('.scope-inset .scope-mark'), 'the mark scrolls with the trace');
  r.to(8000);
  assert.equal(r.doc.querySelector('.scope-inset .scope-mark'), null, 'and leaves the window');
});

test('moves: M11 without a window the box keeps the kit\'s own (it stretches), and no marks', async (t) => {
  const r = await astable([
    { at: 0, do: 'probe', part: 'C1' },
    { at: 300, do: 'set', part: 'R1', field: 'resistance', value: 100000, move: 'cut' },
  ]);
  if (!r) return t.skip('jsdom not installed');
  r.to(600);
  assert.equal(r.doc.querySelector('.scope-inset .scope-mark'), null);
  assert.notEqual(r.axis().at(-1), '200 ms');
});

// The compact box under the caption (2026-11-02): a probe placed on top leaves the circuit its whole
// band (the camera frames as without a box), drawn small: no title, no note, the value inside.
test('moves: M11 a compact box on top, under the caption, leaves the circuit its whole band', async (t) => {
  const top = { r: await recording([
    { at: 0, do: 'set', part: 'S1', field: 'pressed', value: true, move: 'cut' },
    { at: 100, do: 'probe', part: 'D1', field: 'current', place: 'top', size: 'compact' },
  ]) };
  if (!top.r) return t.skip('jsdom not installed');
  top.r.to(300);
  const under = { r: await recording([
    { at: 0, do: 'set', part: 'S1', field: 'pressed', value: true, move: 'cut' },
    { at: 100, do: 'probe', part: 'D1', field: 'current' },
  ]) };
  under.r.to(300);
  const doc = top.r.doc;
  assert.ok(doc.body.classList.contains('with-scope') && doc.body.classList.contains('scope-top'));
  const inset = doc.querySelector('.scope-inset');
  assert.ok(inset.classList.contains('top') && inset.classList.contains('compact'));
  assert.equal(inset.querySelector('h3'), null, 'no title');
  assert.equal(inset.querySelectorAll('.scope-time').length, 0, 'no note and no start of the window');
  assert.equal(inset.querySelectorAll('.scope-label.inside').length, 1, 'the value inside the trace');
  assert.equal(inset.querySelectorAll('.scope-scale').length, 2, 'two axis labels: the top of the scale and the end of the window');
  assert.ok(!under.r.doc.body.classList.contains('scope-top'));
  assert.ok(under.r.doc.querySelector('.scope-inset h3'), 'full size keeps its title');
  assert.match(doc.querySelector('style').textContent, /body\.director \.scope-inset\.top \{ top: 28%; height: 12%; \}/);
  const field = (step) => loadTour(npn({ steps: [{ at: 0, ...step }] })).issues.filter((i) => i.code === 'TOUR_FIELD').map((i) => i.params.field);
  assert.deepEqual(field({ do: 'probe', part: 'D1', place: 'top', size: 'compact' }), []);
  assert.deepEqual(field({ do: 'probe', part: 'D1', place: 'left', size: 'tiny' }), ['place', 'size']);
});

test('moves: M11 check knows a probe\'s window and marks', () => {
  const field = (step) => loadTour(npn({ steps: [{ at: 0, ...step }] })).issues.filter((i) => i.code === 'TOUR_FIELD').map((i) => i.params.field);
  assert.deepEqual(field({ do: 'probe', part: 'D1', window: 2, marks: true }), []);
  assert.deepEqual(field({ do: 'probe', part: 'D1', window: 0 }), ['window']);
  assert.deepEqual(field({ do: 'probe', part: 'D1', window: 7200 }), ['window']);
  assert.deepEqual(field({ do: 'probe', part: 'D1', marks: 'yes' }), ['marks']);
});

// A solid focus (2026-11-02): the part pointed at drawn whole over the current layer, until the
// next focus; by default the plan sees through it.
test('moves: a solid focus draws its parts whole over the current layer, until the next focus', async (t) => {
  const r = await recording([
    { at: 0, do: 'set', part: 'S1', field: 'pressed', value: true, move: 'cut' },
    { at: 0, do: 'flow', on: true },
    { at: 100, do: 'focus', parts: ['R1'] },
    { at: 300, do: 'focus', parts: ['R1'], solid: true },
    { at: 500, do: 'focus', parts: ['D1'], move: 'arrival' },
    { at: 1500, do: 'focus', parts: ['D1'], solid: true, move: 'arrival' },
    { at: 2500, do: 'focus', parts: [], solid: true },
  ]);
  if (!r) return t.skip('jsdom not installed');
  const solid = () => r.doc.body.classList.contains('focus-solid');
  r.to(200);
  assert.equal(solid(), false, 'seen through by default');
  r.to(400);
  assert.equal(solid(), true);
  assert.ok(r.svg().querySelector(':scope > .spotlight > [data-part="R1"]'), 'R1 in focus');
  r.to(600);
  assert.equal(solid(), false, 'the next focus without it');
  r.to(1600);
  assert.equal(solid(), true, 'with a move too');
  r.to(2600);
  assert.equal(solid(), false, 'nothing in focus, nothing solid');
  assert.match(r.doc.querySelector('style').textContent, /body\.layer-flow\.focus-solid\[data-flow="plan"\] \.spotlight \{ opacity: 1; \}/);
  const field = (step) => loadTour(npn({ steps: [{ at: 0, ...step }] })).issues.filter((i) => i.code === 'TOUR_FIELD').map((i) => i.params.field);
  assert.deepEqual(field({ do: 'focus', parts: ['R1'], solid: 'yes' }), ['solid']);
});

// The current on the focus (2026-11-02): with scope "focus" only the nets that touch the legs of
// the parts in focus keep their pieces of the current layer; the rest is plain board under the veil.
test('moves: a flow with scope focus draws the current only on the focused nets, following the focus', async (t) => {
  const r = await recording([
    { at: 0, do: 'set', part: 'S1', field: 'pressed', value: true, move: 'cut' },
    { at: 0, do: 'focus', parts: ['R1'] },
    { at: 100, do: 'flow', on: true, scope: 'focus' },
    { at: 300, do: 'focus', parts: ['D1'] },
    { at: 500, do: 'flow', on: true },
  ]);
  if (!r) return t.skip('jsdom not installed');
  const pieces = () => [...r.layer('flow').querySelectorAll(':scope > *')];
  const drawn = () => pieces().filter((el) => !el.hasAttribute('data-out'));
  const conductors = (els) => els.filter((el) => el.classList.contains('conductor'));
  r.to(50);
  assert.equal(pieces().filter((el) => el.hasAttribute('data-out')).length, 0, 'every piece before the scope');
  r.to(200);
  const all = conductors(pieces()).length;
  const kept = conductors(drawn());
  assert.ok(kept.length > 0 && kept.length < all / 2, `${kept.length} of ${all} conductors drawn`);
  const parts = new Set(kept.map((el) => el.dataset.flow).filter(Boolean));
  const nets = new Set(kept.map((el) => el.dataset.node).filter(Boolean));
  assert.deepEqual([...parts].filter((p) => !/^W/.test(p)), ['R1'], 'the focused part\'s own leads, and jumpers');
  assert.ok(nets.size >= 2, 'its two nets');
  assert.ok(drawn().some((el) => el.dataset.glow === 'D1'), 'the LED still glows');
  assert.ok(pieces().some((el) => el.dataset.flow === 'Q1' && el.hasAttribute('data-out')), 'another part\'s current is not drawn');
  r.to(400);
  assert.deepEqual([...new Set(conductors(drawn()).map((el) => el.dataset.flow).filter((p) => p && !/^W/.test(p)))], ['D1'], 'it follows the focus');
  r.to(600);
  assert.equal(pieces().filter((el) => el.hasAttribute('data-out')).length, 0, 'a flow without scope draws it all again');
  assert.match(r.doc.querySelector('style').textContent, /main > svg > \.flow > \[data-out\] \{ display: none; \}/);
});

test('moves: a timeline may draw the current along the leads; one style per recording', () => {
  const real = renderPage(npn({ steps: [{ at: 0, do: 'flow', on: true, style: 'real' }] }), { lang: 'en' }).html;
  assert.match(real, /<body[^>]* data-flow="real"/);
  const plain = renderPage(npn({ steps: [{ at: 0, do: 'flow', on: true }] }), { lang: 'en' }).html;
  assert.match(plain, /<body[^>]* data-flow="plan"/);
  const codes = (steps) => loadTour(npn({ steps })).issues.map((i) => i.code);
  assert.deepEqual(codes([{ at: 0, do: 'flow', on: true, style: 'real', scope: 'focus' }]), []);
  assert.deepEqual(codes([{ at: 0, do: 'flow', on: true, style: 'real' }, { at: 10, do: 'flow', on: false, style: 'plan' }]), ['TOUR_FLOW_STYLE']);
  assert.deepEqual(codes([{ at: 0, do: 'flow', on: true, style: 'neon' }]), ['TOUR_FIELD']);
  assert.deepEqual(codes([{ at: 0, do: 'flow', on: true, scope: 'net' }]), ['TOUR_FIELD']);
});

// The controls (2026-10-31): every move's way can be said in the timeline; left out, the default.
test('controls: check knows each field and its range', () => {
  const codes = (steps) => loadTour(npn({ steps })).issues.map((i) => i.code);
  const fine = [
    { at: 0, do: 'frame', target: ['R1', 'D1'], zoom: 0.8, pan: [0.2, -0.1], curve: [0.2, 0, 0.2, 1] },
    { at: 0, do: 'frame', target: 'here', pan: [0, 0.3], move: 'travel' },
    { at: 0, do: 'caption', text: 'a', enter: 'fade', in: 600, stagger: 0, out: 0 },
    { at: 900, do: 'caption', off: true },
    { at: 900, do: 'value', part: 'D1', field: 'current', count: 0, enter: 'cut' },
    { at: 900, do: 'insert', part: 'D1', enter: 'fade', height: 30, dark: false },
    { at: 900, do: 'assemble', parts: ['S1', { part: 'W1', wire: 'draw', from: 'end' }], ms: 300, enter: 'fade', wire: 'cut', height: 5, dark: false },
    { at: 900, do: 'pulse', through: ['D1', 'R1'], direction: 'back', color: '#ff00aa', width: 0.1, size: 8 },
    { at: 900, do: 'pulse', color: 'value' },
    { at: 900, do: 'label', part: 'D1', text: { en: 'The LED', es: 'El LED' } },
    { at: 900, do: 'probe', part: 'D1', title: '', label: 'I', note: 'model' },
  ];
  assert.deepEqual(codes(fine), []);
  const field = (step) => loadTour(npn({ steps: [{ at: 0, ...step }] })).issues.filter((i) => i.code === 'TOUR_FIELD').map((i) => i.params.field);
  assert.deepEqual(field({ do: 'insert', part: 'D1', enter: 'spin' }), ['enter']);
  assert.deepEqual(field({ do: 'frame', target: 'board', pan: [5, 0] }), ['pan']);
  assert.deepEqual(field({ do: 'pulse', color: 'red' }), ['color']);
  assert.deepEqual(field({ do: 'frame', target: 'board', curve: [2, 0, 1, 1] }), ['curve']);
  assert.deepEqual(field({ do: 'caption' }), ['text'], 'a text, or off');
  assert.deepEqual(field({ do: 'assemble', parts: [{ part: 'W1', from: 'middle' }] }), ['parts']);
});

test('controls: frame by a list of parts, from here, panned', async (t) => {
  const r = await recording([
    { at: 0, do: 'frame', target: 'board', move: 'cut' },
    { at: 100, do: 'frame', target: 'here', zoom: 2, pan: [0.25, 0], move: 'cut' },
  ]);
  if (!r) return t.skip('jsdom not installed');
  const box = () => r.svg().getAttribute('viewBox').split(' ').map(Number);
  r.to(50);
  const [x, y, w, h] = box();
  r.to(150);
  const [x2, y2, w2, h2] = box();
  assert.ok(Math.abs(w2 - w / 2) < 0.1 && Math.abs(h2 - h / 2) < 0.1, 'zoom 2 about the centre');
  assert.ok(Math.abs(x2 - (x + w / 4 + w2 / 4)) < 0.1, 'then a quarter of the frame to the right');
  assert.ok(Math.abs(y2 - (y + h / 4)) < 0.1);
});

test('controls: captions fade or cut, go off; a value shown as it is', async (t) => {
  const r = await recording([
    { at: 0, do: 'caption', text: 'one' },
    { at: 1000, do: 'caption', text: 'two', enter: 'fade', in: 600, out: 0 },
    { at: 2000, do: 'caption', text: 'three', enter: 'cut' },
    { at: 2000, do: 'value', part: 'D1', field: 'voltage', count: 0, enter: 'cut' },
    { at: 3000, do: 'caption', off: true },
  ]);
  if (!r) return t.skip('jsdom not installed');
  const row = () => r.doc.querySelector('.tour-caption:not(.leaving) .text > .in');
  r.to(1000 + 300);
  const o = Number(row().style.opacity);
  assert.ok(o > 0 && o < 1, `fading in: ${o}`);
  assert.equal(row().style.transform, '', 'no rise');
  r.to(2000 + FRAME);
  assert.equal(row().textContent, 'three');
  assert.equal(row().style.opacity, '');
  assert.equal(row().style.transform, '', 'at once');
  assert.match(r.doc.querySelector('.tour-caption .value .number').textContent, /^\d/, 'the reading, not a count from 0');
  const v = r.doc.querySelector('.tour-caption .value .number').textContent;
  r.to(2000 + 300);
  assert.equal(r.doc.querySelector('.tour-caption .value .number').textContent, v);
  r.to(3000 + 400);
  assert.ok(r.doc.querySelector('.tour-caption:not(.leaving)').hidden, 'off');
});

test('controls: insert fading in with the current on; assemble with a part of its own way and a wire drawn from its end', async (t) => {
  const r = await recording([
    { at: 0, do: 'set', part: 'S1', field: 'pressed', value: true, move: 'cut' },
    { at: 300, do: 'insert', part: 'D1', enter: 'fade', dark: false },
    { at: 2000, do: 'assemble', parts: ['R1', { part: 'W1', from: 'end' }, { part: 'Q1', enter: 'cut' }], gap: 400, ms: 600 },
  ]);
  if (!r) return t.skip('jsdom not installed');
  r.to(300 + 300);
  const copy = r.svg().querySelector(':scope > .spotlight > [data-part="D1"]');
  const o = Number(copy.style.opacity);
  assert.ok(o > 0 && o < 1, `fading: ${o}`);
  assert.equal(r.svg().querySelector('.lift'), null, 'not dropped');
  assert.ok(r.glow() > 0, 'the current stays on');
  r.to(2000 + 400 + 50); // W1 begun (an arrival: most of the way early)
  const pieces = [...r.svg().querySelectorAll(':scope > .parts > [data-part="W1"][data-along]')];
  const shown = pieces.filter((el) => el.style.opacity === '').map((el) => Number(el.dataset.along));
  assert.ok(shown.length > 0 && shown.length < pieces.length, `${shown.length} of ${pieces.length}`);
  assert.ok(Math.min(...shown) > 0.3 && Math.max(...shown) === Math.max(...pieces.map((el) => Number(el.dataset.along))), `from its end: ${Math.min(...shown)}`);
  r.to(2000 + 800 + FRAME); // Q1 at once
  assert.equal(r.svg().querySelector(':scope > .parts > .lift[data-part="Q1"]'), null);
  assert.ok(opacity(r.svg(), 'parts', 'Q1').every((x) => x === ''));
});

test('controls: a pulse through some parts only, back, in its own colour; a label and the oscilloscope in other words', async (t) => {
  const r = await recording([
    { at: 0, do: 'set', part: 'S1', field: 'pressed', value: true, move: 'cut' },
    { at: 0, do: 'flow', on: true },
    { at: 500, do: 'pulse', through: ['D1'], direction: 'back', color: 'value', size: 7 },
    { at: 500, do: 'label', part: 'D1', text: 'The LED' },
    { at: 500, do: 'probe', part: 'D1', title: 'Scope', label: 'Through D1', note: '' },
  ]);
  if (!r) return t.skip('jsdom not installed');
  r.to(500 + FRAME);
  const copies = [...r.svg().querySelectorAll(':scope > .pulse > *')];
  assert.ok(copies.length > 0 && copies.every((el) => el.getAttribute('data-part') === 'D1'), 'only D1');
  assert.ok(copies.every((el) => el.style.stroke === 'var(--cap-value)' && el.style.strokeWidth === '7'));
  assert.equal(r.svg().querySelector(':scope > .shortlabels > [data-part="D1"]').textContent, 'The LED');
  assert.equal(r.doc.querySelector('.scope-inset h3').textContent, 'Scope');
  assert.match(r.doc.querySelector('.scope-inset .scope-label').textContent, /^Through D1/);
  assert.equal(r.doc.querySelector('.scope-inset .scope-model').textContent, '');
});

// A video about one part (F1; docs/en/component-focus.md): M17 the pedestal, M18 the board rises.
const pedestal = [
  { at: 0, do: 'scene', mode: 'part', part: 'Q1' },
  { at: 0, do: 'label', part: 'Q1', text: '' },
  { at: 1000, do: 'land', part: 'Q1' },
  { at: 1000, do: 'assemble', gap: 300 },
];

test('moves: the timeline of a video about one part has no warning, and a pedestal takes a part only', () => {
  const focus = JSON.parse(readFileSync(`${examples}tours/focus-npn.json`, 'utf8'));
  assert.deepEqual(loadTour(Object.defineProperty(npn(focus), CIRCUIT_FOLDER, { value: examples })).issues, []);
  const codes = (steps) => loadTour(npn({ steps })).issues.map((i) => i.code);
  assert.deepEqual(codes(pedestal), []);
  assert.deepEqual(codes([{ at: 0, do: 'scene', mode: 'board' }]), [], 'back to the board names no part');
  assert.deepEqual(codes([{ at: 0, do: 'scene', mode: 'part' }]), ['TOUR_FIELD'], 'mode part needs its part');
  assert.deepEqual(codes([{ at: 0, do: 'scene', mode: 'part', part: 'W1' }]), ['TOUR_SCENE_PART'], 'a wire');
  assert.deepEqual(codes([{ at: 0, do: 'scene', mode: 'part', part: 'V1' }]), ['TOUR_SCENE_PART'], 'a supply');
  assert.deepEqual(codes([{ at: 0, do: 'scene', mode: 'part', part: 'X9' }]), ['TOUR_UNKNOWN_PART']);
  assert.deepEqual(codes([{ at: 0, do: 'scene', mode: 'part', part: 'Q1', zoom: 9 }]), ['TOUR_FIELD'], 'zoom 0.5…3');
  assert.deepEqual(codes([{ at: 0, do: 'land' }]), ['TOUR_FIELD'], 'land names its part');
  assert.deepEqual(codes([{ at: 0, do: 'land', part: 'Q1', ms: 200 }]), ['TOUR_MOVE_MS'], 'a travel by default');
});

test('moves: M17 a scene puts the part alone on a pedestal, raised, its copies seen after a later focus', async (t) => {
  const r = await recording(pedestal);
  if (!r) return t.skip('jsdom not installed');
  r.to(100);
  assert.equal(r.doc.querySelector('main').dataset.scene, 'part');
  const lift = JSON.parse(r.doc.getElementById('page-data').textContent).lift;
  const copy = r.svg().querySelector(':scope > .spotlight > .lift[data-part="Q1"]');
  assert.ok(copy, 'the part, raised');
  assert.ok(Math.abs(Number(copy.getAttribute('transform').match(/translate\(0 (-?[\d.]+)\)/)[1]) + 3 * lift) < 0.01, '3 mm up');
  // The label step after the scene focused the part again: its new copies must be seen.
  for (const el of r.svg().querySelectorAll(':scope > .spotlight [data-part="Q1"]')) assert.notEqual(el.style.opacity, '0');
  assert.equal(r.svg().querySelectorAll(':scope > .spotlight > :not([data-part="Q1"])').length, 0, 'only that part');
  assert.match([...r.doc.querySelectorAll('head style')].map((s) => s.textContent).join(''), /\.lights > :not\(\[data-glow="Q1"\]\)/, 'the other lights unseen');
});

test('moves: M18 a land keeps the part still on screen while the board rises, then an assemble brings the rest', async (t) => {
  const r = await recording(pedestal);
  if (!r) return t.skip('jsdom not installed');
  const main = r.doc.querySelector('main');
  // Where the part is on screen, in drawing units from the frame's top (the frame's size stays).
  const place = () => {
    const copy = r.svg().querySelector(':scope > .spotlight > .lift[data-part="Q1"]');
    const up = copy ? -Number(copy.getAttribute('transform').match(/translate\(0 (-?[\d.]+)\)/)[1]) : 0;
    const [, y, , h] = r.svg().getAttribute('viewBox').split(' ').map(Number);
    return { y: -up - y, h };
  };
  r.to(1000 - FRAME);
  const before = place();
  const px = before.h / 640; // a pixel of the 640-tall screen, in drawing units
  const veil = () => r.layer('veil').firstElementChild;
  const slid = (name) => Number(r.layer(name)?.getAttribute('transform')?.match(/translate\(0 (-?[\d.]+)\)/)?.[1] ?? 0);
  let last = Infinity;
  for (let ms = 1000; ms <= 1000 + MOVES.travel.ms; ms += 100) {
    r.to(ms);
    assert.equal(main.dataset.scene, ms < 1000 + MOVES.travel.ms ? 'land' : 'lit', `${ms} ms`);
    assert.ok(Math.abs(place().y - before.y) <= px, `${ms} ms: the part moved ${((place().y - before.y) / px).toFixed(2)} px`);
    // The board comes in opaque, sliding up from below, under the veil of the stage's colour.
    assert.equal(r.layer('board').style.opacity, '', `${ms} ms: the board is opaque`);
    assert.ok(slid('board') <= last, `${ms} ms: the board slides up`);
    last = slid('board');
    if (ms < 1000 + MOVES.travel.ms) assert.equal(Number(veil().style.fillOpacity), LAND.dim, `${ms} ms: the veil over the board`);
  }
  assert.equal(slid('board'), 0, 'in place');
  // Touched down, the board lightens in a ramp (no frame step after it: from the land's end).
  r.to(1000 + MOVES.travel.ms + LAND.ramp / 2);
  const k = Number(veil().style.fillOpacity);
  assert.ok(k > 0.05 && k < LAND.dim - 0.05, `half way the veil at ${k}`);
  r.to(1000 + MOVES.travel.ms + LAND.ramp + FRAME);
  assert.equal(main.dataset.scene, undefined, 'on the board');
  assert.equal(veil().style.fillOpacity, '', 'the veil gone');
  assert.ok(!r.doc.body.classList.contains('focusing'), 'the focus has gone with the pedestal');
  assert.equal(r.svg().querySelector(':scope > .parts > [data-part="Q1"]').style.opacity, '', 'the part in its holes, seen');
  // The assemble brings every other part; the one landed stays in place.
  const s1 = r.svg().querySelector(':scope > .parts > [data-part="S1"]');
  assert.equal(s1.style.opacity, '', 'S1 came in first');
  r.to(1000 + 9 * 300 + ASSEMBLE.ms + FRAME);
  for (const el of r.svg().querySelectorAll(':scope > .parts > [data-part]')) assert.equal(el.style.opacity, '', el.getAttribute('data-part'));
});

// A focus set while a part lands (a video focusing the landed part at the land's own time): the
// strips and coordinates of a focus belong to the board, which is still sliding in under the veil.
// They stay away for the whole land (the scene holds: main[data-scene] hides them, page/style.js)
// and fade in once the board is lit, never over the empty stage ahead of it with the part.
test('moves: a focus during a land waits for the board: its strips fade in once the board is lit', async (t) => {
  const r = await recording([
    { at: 0, do: 'scene', mode: 'part', part: 'Q1', light: '#ff3b2f' },
    { at: 1000, do: 'land', part: 'Q1' },
    { at: 1000, do: 'focus', parts: ['Q1'], move: 'travel' },
  ]);
  if (!r) return t.skip('jsdom not installed');
  const main = r.doc.querySelector('main');
  const strips = () => r.layer('strips');
  const shown = () => r.doc.getElementById('dynamic').textContent;
  const lit = 1000 + MOVES.travel.ms + LAND.ramp;
  for (let ms = 1000; ms < lit; ms += 100) {
    r.to(ms);
    // While the board comes in (and lightens) the scene holds, so no strip, coordinate or label floats.
    assert.ok(['land', 'lit'].includes(main.dataset.scene), `${ms} ms: the scene is ${main.dataset.scene}`);
  }
  r.to(lit + FRAME);
  assert.equal(main.dataset.scene, undefined, 'on the board');
  assert.ok(r.doc.body.classList.contains('focusing'), 'the focus the timeline set is kept');
  assert.match(shown(), /\.strips > \[data-node=/, 'its strips are asked for');
  const k = Number(strips().style.opacity);
  assert.ok(strips().style.opacity !== '' && k < 0.5, `the strips come in from unseen (${strips().style.opacity})`);
  r.to(lit + LAND.reveal + 2 * FRAME);
  assert.equal(strips().style.opacity, '', 'the strips whole');
  assert.equal(r.layer('coords').style.opacity, '', 'the coordinates whole');
  // The veil lightened to the focus's own, not to nothing and back.
  for (const el of r.layer('veil').children) assert.equal(el.style.fillOpacity, '');
});

// A video of a circuit may open on its lead part alone (the hook), then land it on the board with
// the other parts already there (no assemble): everything must come back as a video that opened on
// the board would have it, the current layer included.
test('moves: a circuit video opens on the pedestal and lands without an assemble: the board comes back whole', async (t) => {
  const r = await recording([
    { at: 0, do: 'set', part: 'S1', field: 'pressed', value: true, move: 'cut' },
    { at: 0, do: 'scene', mode: 'part', part: 'Q1', zoom: 1.6 },
    { at: 1000, do: 'land', part: 'Q1' },
    { at: 1000 + MOVES.travel.ms, do: 'frame', target: 'parts', move: 'travel' },
    { at: 1000 + MOVES.travel.ms, do: 'flow', on: true },
    { at: 1000 + MOVES.travel.ms + 200, do: 'focus', parts: ['R1'] },
  ]);
  if (!r) return t.skip('jsdom not installed');
  r.to(500);
  assert.equal(r.doc.querySelector('main').dataset.scene, 'part');
  assert.match([...r.doc.querySelectorAll('head style')].map((s) => s.textContent).join(''), /data-glow="Q1"/, 'the other lights unseen on the pedestal');
  // The focus comes while the board lightens: the land holds until its ramp is over (the end of the
  // frame after it, then LAND.ramp), and the focus's strips fade in after that.
  r.to(1000 + MOVES.travel.ms + 400);
  assert.equal(r.doc.querySelector('main').dataset.scene, 'lit', 'still lightening');
  r.to(1000 + 2 * MOVES.travel.ms + LAND.ramp + LAND.reveal + 2 * FRAME);
  assert.equal(r.doc.querySelector('main').dataset.scene, undefined, 'on the board');
  assert.equal(r.layer('strips').style.opacity, '', "the focus's strips whole");
  assert.equal([...r.doc.querySelectorAll('head style')].map((s) => s.textContent).join('').includes('data-glow'), false, 'no light kept unseen');
  for (const name of ['under', 'board', 'parts', 'labels', 'shortlabels', 'lights', 'flow', 'marks']) {
    const g = r.layer(name);
    if (g) assert.equal(g.style.opacity, '', `${name} whole`);
  }
  for (const el of r.svg().querySelectorAll(':scope > :is(.parts, .under) > [data-part]')) assert.equal(el.style.opacity, '', el.getAttribute('data-part'));
  assert.equal(r.svg().querySelector('.lift'), null, 'nothing in the air');
  assert.ok(r.doc.body.classList.contains('layer-flow'), 'the current layer on');
  assert.ok(r.glow() > 0, 'the LED lit again');
  assert.deepEqual([...r.svg().querySelectorAll(':scope > .spotlight > [data-part]')].map((el) => el.getAttribute('data-part')).filter((v, i, a) => a.indexOf(v) === i), ['R1'], 'the focus after it');
});

// The anatomy of a part on its pedestal (F2; docs/en/component-focus.md): M19 a pin lights, M20 its
// row comes in; `mark` lights the package's mark and writes what it tells.
const anatomy = [
  { at: 0, do: 'scene', mode: 'part', part: 'Q1' },
  { at: 100, do: 'pin', pin: 'Q1.E' },
  { at: 500, do: 'pin', pin: 'Q1.base' },
  { at: 900, do: 'pin', pin: 'Q1.C', text: 'the load' },
  { at: 1300, do: 'pin', mark: 'Q1' },
  { at: 3000, do: 'pin', off: true },
];

// The pinout drawn, back on screen (px of the 360 × 640 page): each lit pin's leader as segments,
// its row's text, where it starts and how it is anchored.
function pinoutOnScreen(r) {
  const [bx, by, bw, bh] = r.svg().getAttribute('viewBox').split(' ').map(Number);
  const k = Math.max(bw / 360, bh / 640);
  const sx = (x) => 180 + (x - bx - bw / 2) / k;
  const sy = (y) => 320 + (y - by - bh / 2) / k;
  return [...r.svg().querySelectorAll(':scope > .pinout > g[data-pin]')].map((g) => {
    const d = g.querySelector('.lead').getAttribute('d');
    const [, x0, y0, x1, y1, x2] = d.match(/^M(-?[\d.]+) (-?[\d.]+)H(-?[\d.]+)V(-?[\d.]+)H(-?[\d.]+)$/).map(Number);
    const text = g.querySelector('text');
    const size = Number(text.getAttribute('font-size')) / k;
    const points = [[x0, y0], [x1, y0], [x1, y1], [x2, y1]].map(([x, y]) => [sx(x), sy(y)]);
    return { pin: g.getAttribute('data-pin'), opacity: Number(g.getAttribute('opacity')), points, text: text.textContent, x: sx(Number(text.getAttribute('x'))), y: sy(Number(text.getAttribute('y'))), anchor: text.getAttribute('text-anchor'), size };
  });
}
// Two leaders cross: a segment of one meets a segment of the other (they are horizontal or vertical).
function cross(a, b) {
  const seg = (p) => p.points.slice(1).map((q, i) => [p.points[i], q]);
  const meets = ([[ax, ay], [bx, by]], [[cx, cy], [dx, dy]]) => {
    const [x0, x1, y0, y1] = [Math.min(ax, bx), Math.max(ax, bx), Math.min(ay, by), Math.max(ay, by)];
    const [u0, u1, v0, v1] = [Math.min(cx, dx), Math.max(cx, dx), Math.min(cy, dy), Math.max(cy, dy)];
    return x0 <= u1 + 0.01 && u0 <= x1 + 0.01 && y0 <= v1 + 0.01 && v0 <= y1 + 0.01;
  };
  return seg(a).some((s) => seg(b).some((t) => meets(s, t)));
}
// The rules of F0's findings for every lit row: inside the free area (STAGE_INSET of a portrait
// recording), its text ending before its own leader, no two leaders crossing.
function assertPinout(rows) {
  for (const p of rows) {
    const width = p.text.length * 0.62 * p.size;
    const [left, right] = p.anchor === 'end' ? [p.x - width, p.x] : [p.x, p.x + width];
    const end = p.points[3][0];
    assert.ok(left >= 0.0667 * 360 - 0.5 && right <= (1 - 0.0667) * 360 + 0.5, `${p.pin}: ${left.toFixed(1)}…${right.toFixed(1)} px, out of the free width`);
    assert.ok(p.y <= 0.75 * 640 && p.points[2][1] <= 0.75 * 640, `${p.pin}: below the free area`);
    assert.ok(p.anchor === 'end' ? left >= end - 0.5 : right <= end + 0.5, `${p.pin}: "${p.text}" runs over its leader`);
  }
  for (const [i, a] of rows.entries()) for (const b of rows.slice(i + 1)) assert.ok(!cross(a, b), `${a.pin} and ${b.pin} cross`);
}

test('moves: a pin step names a pin of a part, or its mark, or none', () => {
  const codes = (steps) => loadTour(npn({ steps })).issues.map((i) => i.code);
  assert.deepEqual(codes(anatomy), []);
  assert.deepEqual(codes([{ at: 0, do: 'pin', pin: 'Q1.X' }]), ['TOUR_UNKNOWN_PIN']);
  assert.deepEqual(codes([{ at: 0, do: 'pin', pin: 'Q1.2' }]), ['TOUR_UNKNOWN_PIN'], 'a number names a chip\'s pin only');
  assert.deepEqual(codes([{ at: 0, do: 'pin', pin: 'X9.B' }]), ['TOUR_UNKNOWN_PART']);
  assert.deepEqual(codes([{ at: 0, do: 'pin', mark: 'W1' }]), ['TOUR_NO_MARK'], 'a wire has no mark');
  assert.deepEqual(codes([{ at: 0, do: 'pin', mark: 'S1' }]), [], 'a button\'s tells its joined pairs');
  assert.deepEqual(codes([{ at: 0, do: 'pin', mark: 'R1' }]), [], 'a resistor\'s says it has no polarity');
  assert.deepEqual(codes([{ at: 0, do: 'pin', pin: 'Q1.E', off: true }]), ['TOUR_FIELD'], 'one of pin, mark or off');
  assert.deepEqual(codes([{ at: 0, do: 'pin' }]), ['TOUR_FIELD']);
  assert.deepEqual(codes([{ at: 0, do: 'pin', pin: 'Q1' }]), ['TOUR_FIELD'], 'part.pin');
  // The page gets the part and the pin's index (an alias read by the kit).
  const steps = loadTour(npn({ steps: anatomy }), 'en').tour.steps.filter((s) => s.do === 'pin' && s.pin);
  assert.deepEqual(steps.map((s) => [s.part, s.index]), [['Q1', 0], ['Q1', 1], ['Q1', 2]]);
  // A page carries the pinouts its steps name, and nothing more without them.
  const data = (tour) => JSON.parse(renderPage(npn(tour), { lang: 'en' }).html.match(/<script type="application\/json" id="page-data">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(Object.keys(data({ steps: anatomy }).pinouts.front), ['Q1']);
  assert.equal(data({ steps: pedestal }).pinouts, undefined);
});

test('moves: M19 a pin lights and M20 its row comes in, under the part, in the free area, no leaders crossing', async (t) => {
  const r = await recording(anatomy);
  if (!r) return t.skip('jsdom not installed');
  r.to(100 + 100);
  const coming = pinoutOnScreen(r);
  assert.deepEqual(coming.map((p) => p.pin), ['Q1.E']);
  assert.ok(coming[0].opacity > 0 && coming[0].opacity < 1, `arriving: ${coming[0].opacity}`);
  r.to(1300 + MOVES.arrival.ms + FRAME);
  const rows = pinoutOnScreen(r);
  assert.deepEqual(rows.map((p) => [p.pin, p.text, p.opacity]), [['Q1.E', 'emitter · common to both', 1], ['Q1.B', 'base · the small current', 1], ['Q1.C', 'the load', 1]]);
  assertPinout(rows);
  // Under the part's copy: a pin behind a body shows its leader from under it. The mark is its sentence
  // only (the mark itself shows in the drawing).
  const layers = [...r.svg().children].map((el) => el.getAttribute('class'));
  assert.equal(layers.indexOf('pinout'), layers.indexOf('spotlight') - 1, layers.join(' '));
  assert.deepEqual([...r.svg().querySelectorAll(':scope > .pinout > .quiet')].map((q) => q.textContent), ['Bipolar transistor · TO-92', 'Flat face toward you: E B C from the left']);
  // The part's label stays away while the pinout tells it.
  assert.match([...r.doc.querySelectorAll('head style')].map((s) => s.textContent).join(''), /\.shortlabels\) > \[data-part="Q1"\] \{ display: none/);
  r.to(3000 + FRAME);
  assert.equal(r.svg().querySelector(':scope > .pinout').children.length, 0, 'off');
});

test('moves: a chip\'s pinout keeps the rules: two leaders at the same x apart, rows whole, nothing crossing', async (t) => {
  const file = `${examples}tours/focus-555.json`;
  const timeline555 = JSON.parse(readFileSync(file, 'utf8'));
  const circuit = timelineCircuit(file, timeline555);
  assert.deepEqual(loadTour(Object.defineProperty({ ...circuit, page: { tour: timeline555 } }, CIRCUIT_FOLDER, { value: examples })).issues, []);
  const window = await loadPage(renderPage({ ...circuit, page: { tour: timeline555 } }, { lang: 'en' }).html);
  if (!window) return t.skip('jsdom not installed');
  const live = window.protoboardLive;
  live.tour.play();
  for (let ms = 0; ms < 7000; ms += 100) live.tick(100);
  // jsdom draws nothing, so the scene could not frame the part: frame it as a recording does, its
  // pins in the upper half of the free area, then let the pinout follow.
  const pins = JSON.parse(window.document.getElementById('page-data').textContent).pinouts.front.U1.pins;
  const [x0, x1] = [Math.min(...pins.map((p) => p.x)), Math.max(...pins.map((p) => p.x))];
  const w = (x1 - x0) * 4;
  const h = (w * 640) / 360;
  live.director.frame([(x0 + x1) / 2 - w / 2, pins[0].y - 0.5 * h, w, h]);
  live.tick(FRAME);
  const r = { svg: () => window.document.querySelector('main > svg:not([hidden])') };
  const rows = pinoutOnScreen(r);
  assert.equal(rows.length, 8);
  assertPinout(rows);
  // Pins 4 and 8 go into the same column of holes, one behind the other: their leaders apart.
  const x = (pin) => rows.find((p) => p.pin === pin).points[1][0];
  assert.ok(Math.abs(x('U1.RESET') - x('U1.VCC')) >= 3, `${x('U1.RESET')} and ${x('U1.VCC')}`);
  assert.deepEqual([...r.svg().querySelectorAll(':scope > .pinout > .quiet')].map((q) => q.textContent), ['Integrated circuit · DIP-8', 'Notch on the right: pin 1 beside it']);
});

// The bench (F3; docs/en/component-focus.md): M21 the part's pins joined to pads that read the
// circuit, a hidden part's change seen on them.
const benched = [
  { at: 0, do: 'scene', mode: 'part', part: 'Q1' },
  { at: 100, do: 'bench', part: 'Q1', on: true },
  { at: 100, do: 'set', part: 'S1', field: 'pressed', value: true, move: 'cut' },
  { at: 100, do: 'flow', on: true },
  { at: 2000, do: 'set', part: 'R1', field: 'resistance', value: 100000, move: 'cut' },
  { at: 3000, do: 'bench', on: false },
];
// Each pad on screen: its pin, the readings written under it, and its stub as segments (px).
function benchOnScreen(r) {
  const [bx, by, bw, bh] = r.svg().getAttribute('viewBox').split(' ').map(Number);
  const k = Math.max(bw / 360, bh / 640);
  const px = ([x, y]) => [180 + (x - bx - bw / 2) / k, 320 + (y - by - bh / 2) / k];
  return [...r.svg().querySelectorAll(':scope > .bench > g[data-bench]')].map((g) => ({
    pin: g.getAttribute('data-bench'),
    text: Object.fromEntries([...g.querySelectorAll('text')].map((t) => [t.getAttribute('class'), t.textContent])),
    points: g.querySelector('.stub').getAttribute('d').match(/-?[\d.]+ -?[\d.]+/g).map((p) => px(p.split(' ').map(Number))),
    dots: g.querySelector('.dots')?.getAttribute('stroke-dashoffset') ?? null,
  }));
}
// Two stubs cross: a segment of one meets a segment of the other (any slope).
function stubsCross(a, b) {
  const side = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const seg = (s) => s.points.slice(1).map((q, i) => [s.points[i], q]);
  return seg(a).some(([p, q]) => seg(b).some(([r, t]) => side(p, q, r) * side(p, q, t) < 0 && side(r, t, p) * side(r, t, q) < 0));
}

test('moves: a bench names a part of a simulated circuit', () => {
  const codes = (steps, circuit = npn({ steps })) => loadTour(circuit).issues.map((i) => i.code);
  assert.deepEqual(codes(benched), []);
  assert.deepEqual(codes([{ at: 0, do: 'bench', on: true }]), ['TOUR_FIELD'], 'on names its part');
  assert.deepEqual(codes([{ at: 0, do: 'bench' }]), ['TOUR_FIELD'], 'on or off');
  assert.deepEqual(codes([{ at: 0, do: 'bench', part: 'X9', on: true }]), ['TOUR_UNKNOWN_PART']);
  const dark = { ...npn({ steps: [{ at: 0, do: 'bench', part: 'Q1', on: true }] }), supplies: [] };
  assert.deepEqual(codes(null, dark), ['TOUR_BENCH_NOT_SIMULATED'], 'no source, nothing to read');
});

test('moves: M21 a bench joins each pin to a pad that reads the circuit; a hidden part\'s change shows on it', async (t) => {
  const r = await recording(benched);
  if (!r) return t.skip('jsdom not installed');
  r.to(100 + 300);
  const coming = benchOnScreen(r);
  assert.equal(coming.length, 3);
  assert.deepEqual(coming[0].text, {}, 'the stubs are traced first, the pads after');
  r.to(1900);
  const before = benchOnScreen(r);
  assert.deepEqual(before.map((p) => [p.pin, p.text.name, p.text.to]), [['Q1.E', 'E', '→ V1 −'], ['Q1.B', 'B', '→ R1 1 kΩ'], ['Q1.C', 'C', '→ D1 red']]);
  // The figures are the engine's: the base at a junction's drop, the collector near ground (saturated).
  const reading = r.live.engine.read().parts.Q1;
  const volts = (text) => Number.parseFloat(text) * (/mV/.test(text) ? 1e-3 : 1);
  assert.ok(Math.abs(volts(before[1].text.volts) - reading.pins.B) < 0.01, before[1].text.volts);
  assert.ok(volts(before[2].text.volts) < 0.2, `collector ${before[2].text.volts}`);
  assert.match(before[0].text.volts, /^0 V$/, 'under a millivolt reads 0 V');
  for (const [i, a] of before.entries()) for (const b of before.slice(i + 1)) assert.ok(!stubsCross(a, b), `${a.pin} and ${b.pin}`);
  // The dots run with the current layer on.
  r.to(1900 + 200);
  assert.notEqual(benchOnScreen(r)[1].dots, before[1].dots, 'the base\'s dots moved');
  // R1 is hidden on the pedestal, and still in the circuit: a hundred times more, the base current falls.
  r.to(2600);
  const after = benchOnScreen(r);
  const amps = (text) => Number.parseFloat(text) * { mA: 1e-3, µA: 1e-6, A: 1 }[text.split(' ')[1]];
  assert.ok(amps(after[1].text.amps) < amps(before[1].text.amps) / 20, `${before[1].text.amps} → ${after[1].text.amps}`);
  assert.equal(after[1].text.to, '→ R1 100 kΩ', 'the pad names the resistor\'s new value');
  // Under the part's copy; off at the end.
  const layers = [...r.svg().children].map((el) => el.getAttribute('class'));
  assert.ok(layers.indexOf('bench') < layers.indexOf('spotlight'), layers.join(' '));
  r.to(3000 + FRAME);
  assert.equal(r.svg().querySelector(':scope > .bench').children.length, 0);
});

test('moves: a chip\'s bench keeps its eight stubs apart, none crossing', async (t) => {
  const file = `${examples}tours/focus-555.json`;
  const timeline555 = JSON.parse(readFileSync(file, 'utf8'));
  const circuit = timelineCircuit(file, timeline555);
  const window = await loadPage(renderPage({ ...circuit, page: { tour: timeline555 } }, { lang: 'en' }).html);
  if (!window) return t.skip('jsdom not installed');
  const live = window.protoboardLive;
  live.tour.play();
  for (let ms = 0; ms < 10000; ms += 100) live.tick(100);
  const pins = JSON.parse(window.document.getElementById('page-data').textContent).pinouts.front.U1.pins;
  const [x0, x1] = [Math.min(...pins.map((p) => p.x)), Math.max(...pins.map((p) => p.x))];
  const w = (x1 - x0) * 4;
  live.director.frame([(x0 + x1) / 2 - w / 2, pins[0].y - (0.5 * w * 640) / 360, w, (w * 640) / 360]);
  live.tick(FRAME);
  const r = { svg: () => window.document.querySelector('main > svg:not([hidden])') };
  const pads = benchOnScreen(r);
  assert.equal(pads.length, 8);
  for (const [i, a] of pads.entries()) for (const b of pads.slice(i + 1)) assert.ok(!stubsCross(a, b), `${a.pin} and ${b.pin}`);
});

// The figure beside the part (F4): M22 its schematic symbol, the symbol's name for each pin said on the
// part (no lines between them); M23 what goes on inside it, from the simulation.
const figured = [
  { at: 0, do: 'scene', mode: 'part', part: 'Q1' },
  { at: 100, do: 'symbol', part: 'Q1', on: true },
  { at: 1500, do: 'pin', pin: 'Q1.B' },
  { at: 2800, do: 'pin', off: true },
  { at: 3000, do: 'inside', part: 'Q1', on: true },
  { at: 4000, do: 'set', part: 'S1', field: 'pressed', value: true, move: 'cut' },
  { at: 5000, do: 'inside', on: false },
];

test('moves: a symbol or an inside view names a part whose kind has one', () => {
  const codes = (steps) => loadTour(npn({ steps })).issues.map((i) => i.code);
  assert.deepEqual(codes(figured), []);
  assert.deepEqual(codes([{ at: 0, do: 'symbol', on: true }]), ['TOUR_FIELD'], 'on names its part');
  assert.deepEqual(codes([{ at: 0, do: 'symbol', part: 'W1', on: true }]), ['TOUR_NO_SYMBOL']);
  assert.deepEqual(codes([{ at: 0, do: 'inside', part: 'W1', on: true }]), ['TOUR_NO_INSIDE']);
  assert.deepEqual(codes([{ at: 0, do: 'symbol', part: 'S1', on: true }, { at: 2000, do: 'inside', part: 'S1', on: true }]), [], 'a button has both');
  assert.deepEqual(codes([{ at: 0, do: 'inside', part: 'X9', on: true }]), ['TOUR_UNKNOWN_PART']);
});

test('moves: M22 the symbol stands beside the part, its pins named on the part; M23 the inside follows the circuit', async (t) => {
  const r = await recording(figured);
  if (!r) return t.skip('jsdom not installed');
  const figure = () => r.svg().querySelector(':scope > .figure');
  const ids = () => [...figure().querySelectorAll('.pin-id')].map((j) => [j.getAttribute('data-id'), j.textContent]);
  r.to(100 + 400);
  assert.equal(figure().querySelectorAll('.symbol .stroke').length, 5, 'the NPN symbol');
  assert.deepEqual(ids(), [['Q1.E', 'E'], ['Q1.B', 'B'], ['Q1.C', 'C']], 'the symbol\'s names under the tips, left to right');
  assert.equal(figure().querySelectorAll('.join').length, 0, 'no line between the symbol and the part');
  // Inside the free area of a portrait recording, beside the part: its box in drawing units, on screen.
  const [bx, by, bw, bh] = r.svg().getAttribute('viewBox').split(' ').map(Number);
  const k = Math.max(bw / 360, bh / 640);
  const [, tx, ty, sc] = figure().querySelector('.symbol').getAttribute('transform').match(/translate\((-?[\d.]+) (-?[\d.]+)\) scale\(([\d.]+)\)/).map(Number);
  const left = 180 + (tx - bx - bw / 2) / k;
  const right = left + (100 * sc) / k;
  assert.ok(left >= 0.0667 * 360 && right <= (1 - 0.0667) * 360 + 0.5, `${left.toFixed(1)}…${right.toFixed(1)} px`);
  assert.ok(320 + (ty - by - bh / 2) / k >= 0.4 * 640 - 0.5, 'under the caption band');
  // A pin with its row in the pinout has the name at the row's start instead.
  r.to(1500 + MOVES.arrival.ms);
  assert.deepEqual(ids().map(([id]) => id), ['Q1.E', 'Q1.C'], 'B has its row');
  assert.match([...r.svg().querySelectorAll(':scope > .pinout g[data-pin="Q1.B"] text')].map((x) => x.textContent).join(''), /^B · base/);
  // One figure at a time: the inside view takes the symbol's place. Off, the transistor is in cut-off.
  r.to(3000 + MOVES.arrival.ms);
  assert.equal(figure().querySelectorAll('.symbol').length, 0);
  const inside = () => figure().querySelector('[data-inside="bjt"]');
  assert.ok(inside());
  assert.equal(inside().querySelectorAll('.flowing').length, 0, 'no current, no arrows');
  assert.equal(inside().querySelector('.state').textContent, 'off');
  // S1 pressed: the base and collector currents as arrows, the collector's the wider.
  r.to(4500);
  const widths = [...inside().querySelectorAll('.flowing')].map((p) => Number(p.getAttribute('stroke-width')));
  assert.equal(widths.length, 2);
  assert.ok(widths[0] > widths[1], `collector ${widths[0]} over base ${widths[1]}`);
  assert.match(inside().querySelector('.state').textContent, /^saturated/);
  r.to(5000 + FRAME);
  assert.equal(figure().children.length, 0, 'off');
});

// M23 for the parts with two leads: a resistor's film warming with its share of its power rating, a
// capacitor's charges following its voltage, an inductor's field following its current, a diode's
// depletion zone; each with its current as an arrow and the symbol's names for its pins; and a
// bridge's four diodes, the pair that conducts lit.
const rc = () => JSON.parse(readFileSync(`${examples}rc-square-wave.json`, 'utf8'));
const rl = () => ({
  ...rc(),
  supplies: [{ ...rc().supplies[0], frequency: 1000 }],
  parts: [
    { id: 'R1', type: 'resistor', value: '100', pins: ['T+24', 'h24'] },
    { id: 'L1', type: 'inductor', value: '47m', pins: ['f24', 'f30'] },
    { id: 'W1', type: 'wire', color: 'black', pins: ['j30', 'T-30'] },
  ],
});
test('moves: M23 a resistor, a capacitor, an inductor, a diode, a Zener, a bridge, a potentiometer, a thermistor, a photoresistor, a push button and a switch inside, from the circuit', async (t) => {
  const inside = async (circuit, id, more = []) => {
    const steps = [{ at: 0, do: 'scene', mode: 'part', part: id }, { at: 0, do: 'inside', part: id, on: true }, ...more];
    const window = await loadPage(renderPage({ ...circuit, page: { ...circuit.page, tour: { format: 'vertical', steps } } }, { lang: 'en' }).html);
    if (!window) return null;
    window.protoboardLive.tour.play();
    for (let ms = 0; ms <= 1500; ms += 100) window.protoboardLive.tick(100);
    const box = window.document.querySelector('main > svg:not([hidden]) > .figure [data-inside]');
    return { box, kind: box.getAttribute('data-inside'), state: box.querySelector('.state').textContent, names: [...box.querySelectorAll('.pin-name')].map((x) => x.textContent), count: (sel) => box.querySelectorAll(sel).length };
  };
  const r = await inside(rc(), 'R1');
  if (!r) return t.skip('jsdom not installed');
  assert.equal(r.kind, 'resistor');
  assert.deepEqual(r.names, ['1', '2']);
  assert.ok(r.count('.groove') > 0 && r.count('.film') === 1, 'the film cut in a spiral');
  assert.match(r.state, /^(<1|\d+) % of its power rating$/);
  assert.equal(r.count('.flowing'), 1, 'its current under it');
  const c = await inside(rc(), 'C1');
  assert.equal(c.kind, 'capacitor');
  assert.deepEqual(c.names, ['+', '−'], 'an electrolytic\'s pins as its symbol names them');
  assert.equal(c.count('.plate'), 2);
  assert.ok(c.count('.charge') >= 2 && c.count('.charge') % 2 === 0, 'as many − as + charges');
  assert.match(c.state, /^(charging|discharging|holding its charge)$/);
  const l = await inside(rl(), 'L1');
  assert.equal(l.kind, 'inductor');
  assert.deepEqual(l.names, ['1', '2']);
  assert.equal(l.count('.coil'), 1);
  assert.equal(l.count('.flowing'), 1);
  assert.ok(l.count('.field') >= 1, 'a field while current flows');
  assert.match(l.state, /^current (growing|falling)|^steady current$/);
  // A diode's and a Zener's junction, a bridge's four diodes with the pair that conducts.
  const example = (name) => JSON.parse(readFileSync(`${examples}${name}.json`, 'utf8'));
  const d = await inside(example('half-wave-rectifier'), 'D1');
  assert.equal(d.kind, 'diode');
  assert.deepEqual(d.names, ['A', 'K']);
  assert.equal(d.count('.depletion'), 1);
  assert.equal(d.count('.layer'), 2, 'its p and n sides');
  assert.match(d.state, /^(conducting|blocking)$/);
  const z = await inside(example('more-parts'), 'D1');
  assert.equal(z.kind, 'zener');
  assert.match(z.state, /^(conducting|blocking|in breakdown, holding Vz)$/);
  const br = await inside(example('rectifier'), 'BR1');
  assert.equal(br.kind, 'bridge');
  assert.deepEqual(br.names, ['+', '−', '~1', '~2']);
  assert.equal(br.count('.junction'), 4);
  assert.match(br.state, /^conducting (~1→\+ · −→~2|~2→\+ · −→~1)$|^all four blocking$/);
  assert.equal(br.count('.junction.on'), br.state.startsWith('all') ? 0 : 2, 'the pair that conducts lit');
  assert.equal(br.count('.flowing'), br.count('.junction.on'), 'and its current beside each');
  // A potentiometer's wiper where its control has it; a thermistor's and a photoresistor's resistance
  // with what they sense.
  const { spec } = expandRecipe('potentiometer-led');
  const pot = autoLayout(spec).circuit;
  const rv = await inside(pot, 'RV1');
  assert.equal(rv.kind, 'potentiometer');
  assert.deepEqual(rv.names, ['1', '3', 'W']);
  assert.equal(rv.count('.track'), 2, 'the wiper splits the track in two');
  assert.equal(rv.state, 'wiper at 50 % from 1 to 3');
  assert.match(rv.box.querySelector('.note').textContent, /^1–W 5 kΩ$/);
  const moved = await inside(pot, 'RV1', [{ at: 200, do: 'set', part: 'RV1', field: 'position', value: 0.8, move: 'cut' }]);
  assert.equal(moved.state, 'wiper at 80 % from 1 to 3', 'the wiper follows its control');
  const more = example('more-parts');
  const rt = await inside(more, 'RT1');
  assert.equal(rt.kind, 'thermistor');
  assert.equal(rt.count('.atom'), 6);
  assert.match(rt.state, /^10 kΩ at 25 °C$/);
  const hot = await inside(more, 'RT1', [{ at: 200, do: 'set', part: 'RT1', field: 'temperature', value: 60, move: 'cut' }]);
  assert.match(hot.state, /^2\.\d+ kΩ at 60 °C$/, 'warmer, lower');
  const ldr = await inside(more, 'LDR1');
  assert.equal(ldr.kind, 'ldr');
  assert.equal(ldr.count('.light'), 3, 'an arrow per decade of lux: 100 lx');
  assert.match(ldr.state, /^\d.* kΩ with 100 lx$/);
  const dark = await inside(more, 'LDR1', [{ at: 200, do: 'set', part: 'LDR1', field: 'light', value: 1, move: 'cut' }]);
  assert.equal(dark.count('.light'), 1);
  // A push button's dome, released or held down; a switch's blade on the contact its position closes.
  const pullup = autoLayout(expandRecipe('button-pullup').spec).circuit;
  const s1 = await inside(pullup, 'S1');
  assert.equal(s1.kind, 'button');
  assert.deepEqual(s1.names, ['1', '2', '3', '4']);
  assert.equal(s1.state, 'released: 1–2 and 3–4 apart');
  assert.equal(s1.count('.dome.on') + s1.count('.flowing'), 0, 'nothing crosses an open contact');
  assert.equal(s1.count('.dim'), 1, 'the voltage its gap holds');
  const held = await inside(pullup, 'S1', [{ at: 200, do: 'set', part: 'S1', field: 'pressed', value: true, move: 'cut' }]);
  assert.equal(held.state, 'pressed: 1–2 joined to 3–4');
  assert.equal(held.count('.dome.on'), 1);
  assert.equal(held.count('.flowing'), 1, 'its current across the contact');
  const sw = example('switches');
  const rocker = await inside(sw, 'S1');
  assert.equal(rocker.kind, 'switch');
  assert.equal(rocker.state, 'on (I): 1 joined to 2');
  assert.equal(rocker.count('.blade.on'), 1);
  assert.equal(rocker.count('.flowing'), 1);
  const off = await inside(sw, 'S1', [{ at: 200, do: 'set', part: 'S1', field: 'on', value: false, move: 'cut' }]);
  assert.equal(off.state, 'off (O): 1 and 2 apart', 'the blade follows its control');
  assert.equal(off.count('.flowing'), 0);
  const latch = await inside(sw, 'S2');
  assert.equal(latch.state, 'released: each C on its NC');
  assert.deepEqual(latch.names, ['C1', 'NC1', 'NO1'], 'the pins its circuit wires');
  assert.equal(latch.count('.flowing'), 1, 'the current of the contact that closes');
});

test('moves: M23 a regulator, a battery and a buzzer inside, from the circuit', async (t) => {
  const inside = async (circuit, id, more = []) => {
    const steps = [{ at: 0, do: 'scene', mode: 'part', part: id }, { at: 0, do: 'inside', part: id, on: true }, ...more];
    const window = await loadPage(renderPage({ ...circuit, page: { ...circuit.page, tour: { format: 'vertical', steps } } }, { lang: 'en' }).html);
    if (!window) return null;
    window.protoboardLive.tour.play();
    for (let ms = 0; ms <= 1500; ms += 100) window.protoboardLive.tick(100);
    const box = window.document.querySelector('main > svg:not([hidden]) > .figure [data-inside]');
    const text = (sel) => box.querySelector(sel)?.textContent ?? null;
    return { kind: box.getAttribute('data-inside'), state: text('.state'), warning: text('.warning'), names: [...box.querySelectorAll('.pin-name')].map((x) => x.textContent), count: (sel) => box.querySelectorAll(sel).length };
  };
  const example = (name) => JSON.parse(readFileSync(`${examples}${name}.json`, 'utf8'));
  const reg = await inside(example('battery-regulator'), 'U1');
  if (!reg) return t.skip('jsdom not installed');
  // A 7805 on a 9 V block: regulating, its divider inside, current in and out, its headroom over the mark.
  assert.equal(reg.kind, 'regulator');
  assert.deepEqual(reg.names, ['IN', 'OUT', 'GND']);
  assert.equal(reg.state, 'regulating: OUT steady');
  assert.equal(reg.count('.film'), 2, 'its own divider');
  assert.equal(reg.count('.flowing'), 2, 'the current in and the current out');
  assert.equal(reg.count('.headroom.low'), 0);
  // On 6 V a 7805 has less than its dropout to spare.
  const low = autoLayout(expandRecipe('regulator-7805').spec).circuit;
  const dropout = await inside({ ...low, supplies: low.supplies.map((s) => ({ ...s, voltage: 6 })) }, 'U1');
  assert.equal(dropout.state, 'in dropout: OUT follows IN');
  assert.equal(dropout.count('.headroom.low'), 1);
  const lm317 = await inside(example('more-parts'), 'U2');
  assert.deepEqual(lm317.names, ['IN', 'OUT', 'ADJ']);
  assert.equal(lm317.count('.film'), 0, 'an LM317\'s divider is outside it');
  // A 9 V block: six alkaline cells, EMF − I·R over them, giving energy.
  const bt = await inside(example('battery-regulator'), 'BT1');
  assert.equal(bt.kind, 'battery');
  assert.deepEqual(bt.names, ['−', '+']);
  assert.equal(bt.count('.cell'), 6);
  assert.equal(bt.state, 'giving energy');
  assert.equal(bt.count('.flowing'), 1);
  assert.equal(bt.warning, null);
  // Two AA cells shorted by a wire: the warning the simulator gives.
  const short = { version: 1, board: 'bb830', parts: [{ id: 'BT1', type: 'battery', format: 'AA', cells: 2, side: 'left', pins: { '+': 'B+3', '-': 'B-3' } }, { id: 'W1', type: 'wire', color: 'red', pins: ['B+10', 'B-10'] }] };
  assert.equal((await inside(short, 'BT1')).warning, 'short circuit!');
  // A buzzer on steady DC is silent: no sound, only its current.
  const dc = { version: 1, board: 'bb830', supplies: [{ id: 'V1', kind: 'bench', voltage: 5, positive: 'T+', negative: 'T-' }], parts: [{ id: 'BZ1', type: 'buzzer', pins: ['T+3', 'j5'] }, { id: 'R1', type: 'resistor', value: '100', pins: ['h5', 'T-7'] }] };
  const quiet = await inside(dc, 'BZ1');
  assert.equal(quiet.kind, 'buzzer');
  assert.deepEqual(quiet.names, ['+', '−']);
  assert.equal(quiet.state, 'silent: steady DC only heats it');
  assert.equal(quiet.count('.sound'), 0);
  assert.equal(quiet.count('.flowing'), 1);
  // Its supply changed: the current changes, and it sounds.
  const sounding = await inside(dc, 'BZ1', [{ at: 1400, do: 'set', part: 'V1', field: 'voltage', value: 9, move: 'cut' }]);
  assert.equal(sounding.state, 'sounding: the disc vibrates');
  assert.ok(sounding.count('.sound') >= 1 && sounding.count('.disc.on') === 1);
});

// A part's view up close in the page (F5; page/client/focus-view.js): only in a page made with it; the
// card's first row puts the part on its pedestal with its bar; taps on the drawing keep it there; Back
// lands it without the camera going anywhere else.
test('moves: a part up close in the page: the card\'s entry, the bar, outside taps kept, Back without a jump', async (t) => {
  const plain = renderPage(npn({ steps: [] }), { lang: 'en' }).html;
  assert.doesNotMatch(plain, /"focusView":true/);
  const circuit = { ...npn({ steps: [] }), page: { focusView: true } };
  const html = renderPage(circuit, { lang: 'en' }).html;
  const data = JSON.parse(html.match(/id="page-data">([\s\S]*?)<\/script>/)[1]);
  assert.equal(data.focusView, true, 'page.focusView in the circuit');
  assert.ok(data.pinouts.front.Q1.symbol && data.pinouts.front.Q1.inside && data.pinouts.front.R1.symbol);
  assert.equal(data.pinouts.front.W1, undefined, 'no wire');
  const window = await loadPage(html, { url: 'https://page.test/npn.html' });
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const live = window.protoboardLive;
  assert.equal(doc.querySelector('.tour-play')?.isConnected ?? false, false, 'no tour offered in the menu');
  const dock = doc.querySelector('.focus-dock');
  assert.ok(dock?.hidden, 'the dock waits');
  assert.deepEqual([...dock.querySelectorAll('.segmented button')].map((b) => b.textContent), ['Pins', 'Bench', 'Symbol', 'Inside']);
  assert.deepEqual([...dock.querySelectorAll('.segmented')].map((g) => g.getAttribute('aria-label')), ['Under the part', 'Beside the part']);
  // The card of Q1: its first row is the entry.
  const part = doc.querySelector('main > svg:not([hidden]) .parts [data-part="Q1"]');
  part.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const entry = doc.querySelector('.info .focus-open');
  assert.equal(entry?.previousElementSibling?.className, 'head', 'right under the card\'s head');
  assert.equal(entry.textContent, 'See the part up close');
  entry.click();
  for (let k = 0; k < 30; k++) live.tick(FRAME);
  assert.equal(doc.querySelector('main').dataset.scene, 'part');
  assert.equal(dock.hidden, false);
  assert.equal(doc.querySelector('.focus-title').textContent, data.parts.Q1.title);
  // A tap on the drawing keeps the part on its pedestal.
  doc.querySelector('main > svg:not([hidden])').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(doc.querySelector('main').dataset.scene, 'part');
  assert.ok(doc.querySelector('main > svg:not([hidden]) > .spotlight [data-part="Q1"]'), 'still in focus');
  // One room at a time: the bench takes the pins' place; the inside view brings its legend.
  const button = (label) => [...dock.querySelectorAll('button')].find((b) => b.textContent === label);
  button('Bench').click();
  button('Inside').click();
  for (let k = 0; k < 30; k++) live.tick(FRAME);
  assert.deepEqual(['Pins', 'Bench', 'Symbol', 'Inside'].map((l) => button(l).getAttribute('aria-pressed')), ['false', 'true', 'false', 'true']);
  const legend = doc.querySelector('.focus-legend');
  assert.equal(legend.hidden, false);
  assert.equal(legend.querySelector('h3').textContent, 'What you are seeing');
  assert.equal(legend.querySelectorAll('li').length, 4);
  // With the inside view, the pins' rows keep the letters it uses (B, C, E), as with the symbol.
  button('Pins').click();
  for (let k = 0; k < 30; k++) live.tick(FRAME);
  const rows = [...doc.querySelectorAll('main > svg:not([hidden]) > .pinout g[data-pin] text')].map((x) => x.textContent);
  assert.deepEqual(rows.map((x) => x.split(' · ')[0]), ['E', 'B', 'C'], rows.join(' | '));
  button('Inside').click();
  assert.equal(legend.hidden, true, 'the inside view off, its legend goes');
  // Back: the part lands, the camera keeps its size (no frame of the whole circuit after it).
  const width = () => Number(doc.querySelector('main > svg:not([hidden])').getAttribute('viewBox').split(' ')[2]);
  const before = width();
  doc.querySelector('.focus-back').click();
  for (let k = 0; k < 60; k++) live.tick(FRAME);
  assert.equal(doc.querySelector('main').dataset.scene, undefined, 'on the board');
  assert.ok(Math.abs(width() - before) < 0.01, `${before} → ${width()}`);
  assert.equal(dock.hidden, true);
});

test('moves: a part raised and then focused again stays seen (its copies keep their opacity)', async (t) => {
  const r = await recording([{ at: 0, do: 'raise', part: 'D1', move: 'cut' }, { at: 100, do: 'focus', parts: ['D1', 'R2'] }]);
  if (!r) return t.skip('jsdom not installed');
  r.to(300);
  const copies = [...r.svg().querySelectorAll(':scope > .spotlight [data-part="D1"]')];
  assert.ok(copies.length > 0);
  for (const el of copies) assert.notEqual(el.style.opacity, '0');
});

// v0.7.0: a recording opens on its first moment (never the circuit as the page opens), a scene may
// drop its part onto the pedestal, a caption may carry a data row, and the moments a sound may go
// with are listed.
test('moves: the first frame is the first moment: steps after 0 run at once, the caption whole', async (t) => {
  const r = await recording([
    { at: 200, do: 'scene', mode: 'part', part: 'Q1', enter: 'drop', push: 1.6 },
    { at: 200, do: 'caption', text: 'A transistor', data: '1 kΩ → 100 kΩ' },
    { at: 2500, do: 'land', part: 'Q1' },
    { at: 2500, do: 'set', part: 'R1', field: 'resistance', value: 2000, move: 'travel' },
  ]);
  if (!r) return t.skip('jsdom not installed');
  // Frame 0 (after the tick of no time): the pedestal and the caption, whole.
  assert.equal(r.doc.querySelector('main').dataset.scene, 'part', 'on the pedestal from frame 0');
  const caption = r.doc.querySelector('.tour-caption');
  assert.equal(caption.hidden, false);
  assert.equal(caption.querySelector('.text .in').style.transform, '', 'not rising');
  assert.equal(caption.querySelector('.data .in').textContent, '1 kΩ → 100 kΩ');
  assert.equal(caption.querySelector('.data').hidden, false);
  assert.equal(JSON.stringify(r.live.tour.log.filter((x) => x.step.primed).map((x) => [x.t, x.step.do])), '[[0,"scene"],[0,"caption"]]');
  // The drop: the part starts above its pedestal and comes down to it.
  const lift = () => {
    const g = r.svg().querySelector(':scope > .spotlight > .lift[data-part="Q1"]');
    return g ? -Number(g.getAttribute('transform').match(/translate\(0 (-?[\d.]+)\)/)[1]) : 0;
  };
  const high = lift();
  r.to(1000);
  assert.ok(high > lift() * 2, `dropped from ${high.toFixed(1)} to ${lift().toFixed(1)}`);
  // The events: the land touching down, and the count of the set.
  r.to(2500 + MOVES.travel.ms + 2 * FRAME);
  const kinds = r.live.tour.events.map((e) => e.kind);
  assert.ok(kinds.includes('land'), kinds.join(' '));
  assert.ok(kinds.filter((k) => k === 'count').length > 3, 'each figure of the set');
  const land = r.live.tour.events.find((e) => e.kind === 'land');
  assert.ok(Math.abs(land.t - (2500 + MOVES.travel.ms)) <= FRAME, `touch-down at ${land.t}`);
});

// A caption's emphasis (em): those words in a span of their own (in the accent and larger, page/style.js),
// the rest as text around it; in the second line when the text does not hold them; plain otherwise.
test('moves: a caption\'s emphasis is a span of its words, in the text or else the line', async (t) => {
  const codes = (steps) => loadTour(npn({ steps })).issues.map((i) => i.code);
  assert.deepEqual(codes([{ at: 0, do: 'caption', text: { en: 'It stays on longer', es: 'Dura más prendido' }, em: { en: 'on longer', es: 'más prendido' } }]), []);
  assert.deepEqual(codes([{ at: 0, do: 'caption', text: { en: 'It stays on longer', es: 'Dura más prendido' }, em: { en: 'on longer', es: 'más lento' } }]), ['TOUR_EM_MISSING'], 'the Spanish emphasis is not in its text');
  assert.deepEqual(codes([{ at: 0, do: 'caption', text: 'A', em: 7 }]), ['TOUR_FIELD']);
  const r = await recording([
    { at: 0, do: 'caption', text: 'It stays on longer', line: 'but off the same', em: 'on longer' },
    { at: 1000, do: 'caption', text: 'It stays on longer', line: 'but off the same', em: 'the same' },
    { at: 2000, do: 'caption', text: 'Plain', em: 'nowhere' },
  ]);
  if (!r) return t.skip('jsdom not installed');
  const text = () => r.doc.querySelector('.tour-caption:not(.leaving) .text > .in');
  const line = () => r.doc.querySelector('.tour-caption:not(.leaving) .line > .in');
  r.to(100);
  assert.equal(text().textContent, 'It stays on longer', 'the words as written');
  assert.equal(text().querySelector('.em').textContent, 'on longer');
  assert.equal(line().querySelector('.em'), null);
  r.to(1100);
  assert.equal(text().querySelector('.em'), null);
  assert.equal(line().querySelector('.em').textContent, 'the same', 'in the second line');
  r.to(2100);
  assert.equal(text().textContent, 'Plain');
  assert.equal(text().querySelector('.em'), null, 'not found: plain');
  // In the caption's own colour, bolder: the accent is the data's and the trace's.
  assert.match(r.doc.querySelector('style').textContent, /\.tour-caption \.em, \.tour-card \.em \{ color: var\(--cap-em, inherit\); font-size: 1\.15em; font-weight: 700; \}/);
});

// A comparing box in the timeline's own words: a text per language, checked as the other texts.
test('moves: a comparing probe takes its own words for the change (say), a text like the others', () => {
  const codes = (steps) => loadTour(npn({ steps })).issues.map((i) => i.code);
  const probe = { at: 0, do: 'probe', part: 'R1', compare: true };
  assert.deepEqual(codes([{ ...probe, say: { en: 'on {k}× longer · off the same', es: '{k} veces más tiempo encendido · apagado igual' } }]), []);
  assert.deepEqual(codes([{ ...probe, say: 5 }]), ['TOUR_FIELD'], 'a text');
  assert.deepEqual(codes([{ ...probe, say: 'x'.repeat(400) }]), ['TOUR_TEXT_TOO_LONG']);
  const { tour } = loadTour(npn({ steps: [{ ...probe, say: { en: 'on {k}×', es: '{k} veces' } }] }), 'es');
  assert.equal(tour.steps[0].say, '{k} veces', 'localized as the other texts');
});

// A card: the sentence alone over the screen, in along its fade, whole for its hold, then gone; the
// events say when it comes and goes.
test('moves: a card comes in over the screen, holds and leaves, and says so in the events', async (t) => {
  const codes = (steps) => loadTour(npn({ steps })).issues.map((i) => i.code);
  assert.deepEqual(codes([{ at: 0, do: 'card', text: '×5 on', line: 'off the same', em: '×5', hold: 1500 }]), []);
  assert.deepEqual(codes([{ at: 0, do: 'card' }]), ['TOUR_FIELD'], 'a card needs its text');
  assert.deepEqual(codes([{ at: 0, do: 'card', text: 'A', hold: 100 }]), ['TOUR_FIELD'], 'a hold within its range');
  const r = await recording([
    { at: 0, do: 'caption', text: 'Under it' },
    { at: 500, do: 'card', text: '×5 on', line: 'off the same', em: '×5' },
  ]);
  if (!r) return t.skip('jsdom not installed');
  const card = () => r.doc.querySelector('.tour-card');
  r.to(400);
  assert.equal(card().hidden, true, 'not before its time');
  r.to(500 + CARD.in / 2);
  assert.equal(card().hidden, false);
  const k = Number(card().style.opacity);
  assert.ok(k > 0 && k < 1, `fading in: ${k}`);
  assert.equal(card().querySelector('.text .em').textContent, '×5');
  assert.equal(card().querySelector('.line').textContent, 'off the same');
  r.to(500 + CARD.in + CARD.hold / 2);
  assert.equal(card().style.opacity, '', 'whole');
  assert.equal(r.doc.querySelector('.tour-caption').hidden, false, 'the caption stays under it');
  r.to(500 + CARD.in + CARD.hold + CARD.out + 2 * FRAME);
  assert.equal(card().hidden, true, 'gone');
  const cards = r.live.tour.events.filter((e) => e.kind === 'card');
  assert.equal(JSON.stringify(cards.map((e) => e.on)), '[true,false]');
  assert.ok(Math.abs(cards[0].t - 500) <= FRAME, `in at ${cards[0].t}`);
});

// A flow's sense: the dots take the colour of the way the current runs through C1 (charging,
// forward; discharging, back) and run on the nets of that side's parts only. And every blink of the
// LED is an event (a sound may go with each).
test('moves: a flow\'s sense colours the current by the way it runs, and each blink is an event', async (t) => {
  const circuit = timelineCircuit('555-astable.json', {}, '555-astable');
  const codes = (steps) => loadTour({ ...circuit, page: { tour: { steps } } }).issues.map((i) => i.code);
  const sense = { part: 'C1', forward: { color: '#ffb020', parts: ['R1', 'R2', 'C1'] }, back: { color: 'accent', parts: ['R2', 'C1'] } };
  assert.deepEqual(codes([{ at: 0, do: 'flow', on: true, scope: 'focus', sense }]), []);
  assert.deepEqual(codes([{ at: 0, do: 'flow', on: true, sense: { part: 'C1' } }]), ['TOUR_FIELD'], 'a side at least');
  assert.deepEqual(codes([{ at: 0, do: 'flow', on: true, sense: { part: 'C1', back: { color: 'nope' } } }]), ['TOUR_FIELD']);
  assert.deepEqual(codes([{ at: 0, do: 'flow', on: true, sense: { part: 'X9', back: { parts: ['R2'] } } }]), ['TOUR_UNKNOWN_PART']);
  const r = await astable([
    { at: 0, do: 'focus', parts: ['R1', 'R2', 'C1'] },
    { at: 0, do: 'flow', on: true, scope: 'focus', sense },
    { at: 9000, do: 'flow', on: false },
  ]);
  if (!r) return t.skip('jsdom not installed');
  const main = r.doc.querySelector('main');
  const drawn = () => [...r.doc.querySelectorAll('main > svg:not([hidden]) > .flow > [data-flow]')].filter((el) => !el.hasAttribute('data-out')).map((el) => el.dataset.flow);
  const seen = { forward: null, back: null };
  for (let ms = 100; ms <= 8000; ms += 100) {
    r.to(ms);
    const now = main.dataset.sense;
    if (now && !seen[now]) seen[now] = { color: main.style.getPropertyValue('--flow-sense'), parts: new Set(drawn().filter((p) => !/^W/.test(p))) };
  }
  assert.ok(seen.forward && seen.back, 'both ways within 8 s');
  assert.equal(seen.forward.color, '#ffb020');
  assert.equal(seen.back.color, 'var(--accent)', 'a theme colour by name');
  assert.ok(seen.forward.parts.has('R1'), 'charging: through R1 too');
  assert.ok(!seen.back.parts.has('R1') && seen.back.parts.has('R2'), 'discharging: R2 only');
  r.to(9100);
  assert.equal(main.dataset.sense, undefined, 'the current off: no sense');
  const leds = r.live.tour.events.filter((e) => e.kind === 'led' && e.part === 'D1');
  assert.ok(leds.length >= 4, `blinks: ${leds.length}`);
  for (let k = 1; k < leds.length; k++) assert.notEqual(leds[k].on, leds[k - 1].on, 'on and off in turn');
});

// A video may open on the board with the circuit working (its result first) and only then go to the
// pedestal and land: a scene after steps on the board, and a land after it, work as at the start.
test('moves: a scene after steps on the board, then a land: the pedestal and the board come back', async (t) => {
  const r = await astable([
    { at: 0, do: 'frame', target: 'D1', move: 'cut' },
    { at: 0, do: 'focus', parts: ['D1'] },
    { at: 600, do: 'set', part: 'R1', field: 'resistance', value: 47000, move: 'cut' },
    { at: 2000, do: 'scene', mode: 'part', part: 'U1', zoom: 1.4, move: 'travel', push: 1.6, light: '#ff3b2f' },
    { at: 2100, do: 'set', part: 'R1', field: 'resistance', value: 1000, move: 'cut' },
    { at: 5000, do: 'land', part: 'U1' },
    { at: 6500, do: 'frame', target: ['U1', 'D1'], move: 'travel' },
  ]);
  if (!r) return t.skip('jsdom not installed');
  const main = r.doc.querySelector('main');
  r.to(1000);
  assert.equal(main.dataset.scene, undefined, 'on the board first');
  r.to(2000 + MOVES.travel.ms + 200);
  assert.equal(main.dataset.scene, 'part', 'then the pedestal');
  r.to(9500);
  assert.equal(main.dataset.scene, undefined, 'and the board again');
  const sets = r.live.tour.log.filter((x) => x.step.do === 'set').map((x) => x.step.value);
  assert.equal(JSON.stringify(sets), '[47000,1000]', 'the hook\'s change, put back while on the pedestal');
});
