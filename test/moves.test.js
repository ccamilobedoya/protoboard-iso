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
import { CAPTION, INSERT, LIGHT, RAISE, MOVES } from '../src/page/client/moves.js';

const FRAME = 1000 / 30;
const examples = fileURLToPath(new URL('../examples/', import.meta.url));
const timeline = JSON.parse(readFileSync(`${examples}tours/npn-switch-moves.json`, 'utf8'));
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
async function recording(steps) {
  const window = await loadPage(renderPage(npn(steps ? { steps } : timeline), { lang: 'en' }).html);
  if (!window) return null;
  const live = window.protoboardLive;
  const doc = window.document;
  live.tour.play();
  live.tick(0);
  let now = 0;
  const to = (ms) => {
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

test('moves: the timeline of the moves is the npn-switch circuit, without a warning', () => {
  const circuit = Object.defineProperty(npn(), CIRCUIT_FOLDER, { value: examples });
  assert.deepEqual(loadTour(circuit).issues, []);
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
