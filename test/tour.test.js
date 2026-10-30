// The timeline and its player (stage and video, V2): the moves as tokens, what check says about a
// timeline, and the npn-switch example's tour played in the page by the director, the same on a
// phone and on a desktop, stopped by a tap. Run in jsdom.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MOVES, bezier, moveTiming } from '../src/page/client/moves.js';
import { loadTour, tourIssues } from '../src/tour.js';
import { checkCircuit } from '../src/index.js';
import { renderPage } from '../src/page.js';
import { CIRCUIT_FOLDER } from '../src/beside.js';
import { STYLE } from '../src/page/style.js';

const FRAME = 1000 / 30;
const examples = fileURLToPath(new URL('../examples/', import.meta.url));
const npn = () => Object.defineProperty(JSON.parse(readFileSync(`${examples}npn-switch.json`, 'utf8')), CIRCUIT_FOLDER, { value: examples });
const codes = (issues) => issues.map((i) => i.code);
const withTour = (steps) => ({ ...npn(), page: { tour: { steps } } });

test('moves: seven, as tokens, along their curves', () => {
  assert.deepEqual(Object.keys(MOVES), ['cut', 'arrival', 'travel', 'push', 'hit', 'breath', 'anticipation']);
  for (const [name, m] of Object.entries(MOVES)) {
    assert.ok(m.min <= m.ms && m.ms <= m.max, name);
    assert.match(STYLE, new RegExp(`--move-${name}-ms: ${m.ms}ms;`), `${name} is a token`);
  }
  assert.match(STYLE, /--move-travel-ease: cubic-bezier\(0\.76, 0, 0\.24, 1\);/);
  // CSS's ease-in-out is symmetric: halfway in time is halfway along.
  const inOut = bezier([0.42, 0, 0.58, 1]);
  assert.ok(Math.abs(inOut(0.5) - 0.5) < 1e-6);
  const arrival = bezier(MOVES.arrival.curve);
  let before = 0;
  for (let k = 0.05; k <= 1; k += 0.05) {
    assert.ok(arrival(k) >= before, `monotone at ${k}`);
    before = arrival(k);
  }
  assert.ok(arrival(0.3) > 0.7, 'quint out: most of the way early');
  assert.equal(arrival(0), 0);
  assert.equal(arrival(1), 1);
  // Anticipation: back first (8 % at most), then the arrival; its time includes the recoil.
  const a = moveTiming('anticipation');
  assert.equal(a.ms, 250 + 750);
  assert.ok(Math.abs(a.ease(0.125) + 0.08) < 1e-9, 'halfway through the recoil');
  assert.equal(a.ease(1), 1);
  assert.equal(moveTiming('cut').ms, 0);
  assert.equal(moveTiming('push', 5000).ms, 5000);
});

test('tour: the npn-switch example has one, read beside it, in the page language', () => {
  const circuit = npn();
  assert.deepEqual(tourIssues(circuit), []);
  assert.deepEqual(codes(checkCircuit(circuit).issues).filter((c) => c.startsWith('TOUR')), []);
  const { tour } = loadTour(circuit, 'es');
  assert.equal(tour.format, 'vertical');
  assert.equal(tour.steps[1].text, 'Un transistor como interruptor');
  assert.ok(tour.steps.every((s, k) => !k || tour.steps[k - 1].at <= s.at), 'in order of time');
  assert.equal(tour.steps.find((s) => s.do === 'set').move, 'hit', 'a set hits by default');
  // Without its folder (a circuit given whole) the file is not found.
  assert.deepEqual(codes(tourIssues(JSON.parse(readFileSync(`${examples}npn-switch.json`, 'utf8')))), ['TOUR_FILE']);
});

test('tour: check names what a step cannot do and a rhythm broken, and the tour still plays', () => {
  const unknown = withTour([
    { at: 0, do: 'frame', target: 'X9' },
    { at: 0, do: 'set', part: 'R1', field: 'pressed', value: true },
    { at: 900, do: 'frame', target: 'board', move: 'push', ms: 10_000 },
  ]);
  assert.deepEqual(codes(tourIssues(unknown)), ['TOUR_UNKNOWN_PART', 'TOUR_UNKNOWN_CONTROL', 'TOUR_MOVE_MS']);
  assert.ok(loadTour(unknown).tour, 'still played');
  const slow = withTour([
    { at: 0, do: 'frame', target: 'board', move: 'push' },
    { at: 6000, do: 'frame', target: 'D1', move: 'push' },
  ]);
  assert.deepEqual(codes(tourIssues(slow)), ['TOUR_RHYTHM_SLOW']);
  const hits = (gap) => withTour([
    { at: 0, do: 'set', part: 'S1', field: 'pressed', value: true, move: 'hit' },
    { at: 150 + gap, do: 'set', part: 'S1', field: 'pressed', value: false, move: 'hit' },
  ]);
  assert.deepEqual(codes(tourIssues(hits(100))), ['TOUR_RHYTHM_HIT']);
  assert.deepEqual(codes(tourIssues(hits(MOVES.breath.min))), [], 'a breath between them');
  // Shape problems leave no tour.
  const broken = withTour([{ at: 0, do: 'frame', target: 'board', move: 'zoom-in' }]);
  assert.deepEqual(codes(tourIssues(broken)), ['TOUR_MOVE']);
  assert.equal(loadTour(broken).tour, null);
  assert.deepEqual(codes(tourIssues(withTour([{ at: 0, do: 'probe' }]))), ['TOUR_FIELD'], 'a probe names a part or a strip');
  assert.deepEqual(codes(tourIssues(withTour([{ at: 0, do: 'wait-until', part: 'D1', field: 'current' }]))), ['TOUR_FIELD'], 'above or below');
});

async function loadPage(html, size) {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    return null;
  }
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://page.test/npn-switch.html' });
  const { window } = dom;
  const rect = () => ({ left: 0, top: 0, right: size.width, bottom: size.height, ...size });
  window.document.querySelector('main').getBoundingClientRect = rect;
  for (const svg of window.document.querySelectorAll('svg')) svg.getBoundingClientRect = rect;
  window.eval(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  return window;
}

// What the tour shows at given times, sampled the way a viewer would see it.
async function playAt(size, times) {
  const window = await loadPage(renderPage(npn(), { lang: 'es' }).html, size);
  if (!window) return null;
  const live = window.protoboardLive;
  const doc = window.document;
  const caption = doc.querySelector('.tour-caption');
  const item = doc.querySelector('nav .menu .tour-play');
  item.click();
  assert.ok(live.tour.playing);
  const seen = [];
  let now = 0;
  for (const at of times) {
    while (now < at - 1e-6) {
      live.tick(FRAME);
      now += FRAME;
    }
    const D1 = live.reading.parts.D1;
    seen.push({
      at,
      playing: live.tour.playing,
      caption: caption.hidden ? null : caption.querySelector('.text').textContent,
      value: caption.querySelector('.value').hidden ? null : caption.querySelector('.value').textContent,
      pressed: live.engine.controls().find((c) => c.id === 'S1' && c.field === 'pressed').value,
      led: D1.current > 1e-4,
      layer: doc.body.classList.contains('layer-flow'),
      focus: doc.body.classList.contains('focusing'),
    });
  }
  return { window, seen, item };
}

test('tour: the page plays the npn-switch tour the same on a phone and on a desktop', async (t) => {
  const times = [100, 2500, 3100, 3500, 4500, 9000, 10100, 13000];
  const phone = await playAt({ width: 390, height: 760 }, times);
  if (!phone) return t.skip('jsdom not installed');
  const desktop = await playAt({ width: 1280, height: 800 }, times);
  assert.deepEqual(phone.seen, desktop.seen);
  const at = (ms) => phone.seen.find((s) => s.at === ms);
  assert.equal(phone.item.textContent, 'Ver cómo funciona');
  assert.equal(at(100).caption, 'Un transistor como interruptor');
  assert.equal(at(100).pressed, false);
  assert.equal(at(2500).caption, 'Al apretar S1, la corriente de base enciende el LED');
  assert.equal(at(2500).focus, true, 'S1 in focus');
  assert.equal(at(3100).pressed, true);
  assert.equal(at(3100).led, true, 'the LED is on');
  assert.equal(at(3100).layer, true, 'the current layer is on');
  assert.equal(at(3500).value.startsWith('por el LED'), true);
  assert.match(at(4500).value, /^por el LED\d+(,\d+)? mA$/, `${at(4500).value}`);
  assert.equal(at(10100).pressed, false);
  assert.equal(at(10100).led, false);
  assert.equal(at(10100).caption, 'Al soltarlo, sin corriente de base, el LED se apaga');
  // The end: the tour stops by itself and leaves the page as it is (no focus, the current layer on).
  assert.equal(at(13000).playing, false);
  assert.equal(at(13000).caption, null);
  assert.equal(at(13000).focus, false);
  assert.equal(at(13000).layer, true);
});

test('tour: a tap anywhere stops it where it is, and the page runs on its own clock again', async (t) => {
  const run = await playAt({ width: 390, height: 760 }, [3100]);
  if (!run) return t.skip('jsdom not installed');
  const { window } = run;
  const live = window.protoboardLive;
  window.document.querySelector('main').dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  assert.equal(live.tour.playing, false);
  assert.ok(window.document.querySelector('.tour-caption').hidden);
  const before = live.engine.controls().find((c) => c.id === 'S1' && c.field === 'pressed').value;
  for (let k = 0; k < 300; k++) live.tick(FRAME); // past the step that lets S1 go
  assert.equal(live.engine.controls().find((c) => c.id === 'S1' && c.field === 'pressed').value, before, 'nothing more happens');
  assert.equal(live.director, null, 'not a recording');
});

test('tour: only in a page that has one', async (t) => {
  const plain = { ...npn(), page: {} };
  const window = await loadPage(renderPage(plain).html, { width: 800, height: 500 });
  if (!window) return t.skip('jsdom not installed');
  assert.equal(window.document.querySelector('.tour-play'), null);
  assert.equal(window.protoboardLive.tour, null);
  assert.doesNotMatch(renderPage(plain).html, /"tour":/);
});
