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
import { CAPTION, INSERT, LIGHT, RAISE, MOVES, ASSEMBLE } from '../src/page/client/moves.js';

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
  assert.equal(rise('.text'), 'translateY(130.00%)', 'below its mask until the old one has left');
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
  for (let ms = 1000; ms <= 1000 + MOVES.travel.ms; ms += 100) {
    r.to(ms);
    assert.equal(main.dataset.scene, ms < 1000 + MOVES.travel.ms ? 'land' : undefined, `${ms} ms`);
    assert.ok(Math.abs(place().y - before.y) <= px, `${ms} ms: the part moved ${((place().y - before.y) / px).toFixed(2)} px`);
  }
  r.to(1000 + MOVES.travel.ms + FRAME);
  assert.equal(main.dataset.scene, undefined, 'on the board');
  assert.ok(!r.doc.body.classList.contains('focusing'), 'the focus has gone with the pedestal');
  assert.equal(r.svg().querySelector(':scope > .parts > [data-part="Q1"]').style.opacity, '', 'the part in its holes, seen');
  // The assemble brings every other part; the one landed stays in place.
  const s1 = r.svg().querySelector(':scope > .parts > [data-part="S1"]');
  assert.equal(s1.style.opacity, '', 'S1 came in first');
  r.to(1000 + 9 * 300 + ASSEMBLE.ms + FRAME);
  for (const el of r.svg().querySelectorAll(':scope > .parts > [data-part]')) assert.equal(el.style.opacity, '', el.getAttribute('data-part'));
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
  assert.deepEqual(codes([{ at: 0, do: 'pin', mark: 'R1' }]), ['TOUR_NO_MARK'], 'a resistor has no mark');
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

test('moves: a part raised and then focused again stays seen (its copies keep their opacity)', async (t) => {
  const r = await recording([{ at: 0, do: 'raise', part: 'D1', move: 'cut' }, { at: 100, do: 'focus', parts: ['D1', 'R2'] }]);
  if (!r) return t.skip('jsdom not installed');
  r.to(300);
  const copies = [...r.svg().querySelectorAll(':scope > .spotlight [data-part="D1"]')];
  assert.ok(copies.length > 0);
  for (const el of copies) assert.notEqual(el.style.opacity, '0');
});
