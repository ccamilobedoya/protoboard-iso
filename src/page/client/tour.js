// The tour (stage and video, V2): the circuit's timeline (page.tour, read and checked by
// src/tour.js) played in the page by the director (director.js). *See how it works* in the ⋯ menu
// starts it; a tap anywhere, or Escape, stops it and leaves the page as it is. A recording
// (?director=1) starts it with protoboardLive.tour.play() and ticks it itself.
//
// Each step becomes a cue at its `at`. Moves are the named ones of moves.js; under reduced motion
// (not in a recording) they all become cuts: the camera, controls, ramps and counts arrive at once,
// while breaths and waits keep their time. Texts go in with textContent: a timeline is data.

import { moveTiming } from './moves.js';
import { applyFocus } from './focus.js';
import { select, selectNode } from './card.js';

const COUNT_MS = 500; // a value counts up to its reading (M9)
const WAIT_MS = 10_000; // a wait-until that never comes true gives up after this
const UNITS = { current: 'A', voltage: 'V', power: 'W', brightness: '%' };

function el(parent, tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent.appendChild(e);
  return e;
}

export function setupTour(page, { director, t, f, recording, reading, dots }) {
  const steps = page.data.tour.steps;
  const reduced = !recording && typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timing = (s) => (reduced ? { ms: 0, ease: () => 1 } : moveTiming(s.move, s.ms));
  const end = Math.max(0, ...steps.map((s) => s.at + (s.do === 'flow' ? s.ramp ?? 0 : timing(s).ms)));

  // The caption over the drawing: a text, a second line, a value; the way to stop it.
  const box = el(page.main, 'div', 'tour-caption');
  box.hidden = true;
  box.setAttribute('aria-live', 'polite');
  const text = el(box, 'p', 'text');
  const line = el(box, 'p', 'line');
  const value = el(box, 'p', 'value');
  const label = el(value, 'span', 'label');
  const number = el(value, 'span', 'number');
  line.hidden = true;
  value.hidden = true;
  const hint = el(box, 'small', 'stop');
  hint.textContent = t('page.tour.stop');
  hint.hidden = recording;

  let shown = null; // { part, field, k } the value on screen, k: share of its count
  const readingOf = (part, field) => reading()?.parts[part]?.[field];
  function showValue() {
    if (!shown) return;
    const v = readingOf(shown.part, shown.field);
    if (typeof v !== 'number') return;
    const unit = UNITS[shown.field];
    number.textContent = unit === '%' ? `${Math.round(v * shown.k * 100)} %` : f(v * shown.k, unit);
  }

  // In a recording the told part is the one the camera last went to, or the last one brought
  // forward: only its label stays in the frame (focus.js).
  const tell = (id) => {
    if (page.told === undefined) return;
    page.told = id ?? null;
    applyFocus(page);
  };
  const act = {
    frame: (s) => {
      if (page.data.parts[s.target]) tell(s.target);
      return director.frame(s.target, { ...timing(s), zoom: s.zoom ?? 1 });
    },
    focus: (s) => {
      page.state.node = null;
      page.state.focus = new Set(s.parts);
      if (page.told !== undefined) page.told = s.parts.at(-1) ?? null;
      applyFocus(page);
    },
    flip: (s) => {
      if (!page.svgs.some((svg) => svg.dataset.view === s.view) || page.state.view === s.view) return;
      page.state.view = s.view;
      page.show();
    },
    set: (s) => director.set(s.part, s.field, s.value, timing(s)),
    flow: (s) => {
      page.state.layer = s.on ? 'flow' : 'parts';
      page.show();
      if (!s.on || !(s.ramp > 0) || reduced) return dots(1);
      dots(0);
      director.tween(dots, { ms: s.ramp, ease: moveTiming('arrival').ease });
    },
    caption: (s) => {
      box.hidden = false;
      text.textContent = s.text;
      line.textContent = s.line ?? '';
      line.hidden = !s.line;
      shown = null;
      value.hidden = true;
    },
    value: (s) => {
      box.hidden = false;
      value.hidden = false;
      label.textContent = s.label ?? '';
      shown = { part: s.part, field: s.field, k: 0 };
      director.tween((e) => {
        if (shown) shown.k = e;
      }, { ms: reduced ? 0 : COUNT_MS, ease: (k) => k });
      showValue();
    },
    probe: (s) => (s.node != null ? selectNode(page, s.node) : select(page, s.part)),
    // The descent into the holes (M15) comes with the moves (V6): for now the part is in focus.
    insert: (s) => {
      page.state.focus.add(s.part);
      if (page.told !== undefined) page.told = s.part;
      applyFocus(page);
    },
    'wait-until': (s) => {
      const test = () => {
        const v = readingOf(s.part, s.field);
        return typeof v === 'number' && (s.above != null ? v > s.above : v < s.below);
      };
      director.hold(test, s.max ?? WAIT_MS);
    },
  };

  let playing = false;
  const log = []; // in a recording: each step as it ran, at the director's time (a wait moves the later ones)
  function stop() {
    if (!playing) return;
    playing = false;
    director.stop();
    dots(1);
    box.hidden = true;
    shown = null;
    document.body.classList.remove('touring');
    page.direct(false);
  }
  function play() {
    stop();
    playing = true;
    page.direct(true);
    document.body.classList.add('touring');
    select(page, null);
    log.length = 0;
    director.start(
      steps.map((s) => ({
        at: s.at,
        run: () => {
          if (recording) log.push({ t: director.time, step: s });
          act[s.do]?.(s);
        },
      })),
    );
    director.after(() => {
      showValue();
      // The last move has ended and nothing waits: the page stays as the tour left it.
      if (!director.busy && director.time >= end) {
        playing = false;
        director.stop();
        if (!recording) {
          box.hidden = true;
          document.body.classList.remove('touring');
        }
        page.direct(false);
      }
    });
  }

  // *See how it works* in the menu; a tap or Escape stops it. The tap that opened the menu came
  // before play, so it never stops the tour it started.
  const item = document.createElement('button');
  item.type = 'button';
  item.setAttribute('role', 'menuitem');
  item.className = 'tour-play';
  item.textContent = t('page.tour.play');
  item.addEventListener('click', () => play());
  page.menuAdd?.(item);
  if (!recording) {
    document.addEventListener('pointerdown', stop, true);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') stop();
    });
  }

  return {
    play,
    stop,
    get playing() {
      return playing;
    },
    // What ran and when, for the recorder's timeline.json (scripts/render-frames.js).
    get log() {
      return log;
    },
  };
}
