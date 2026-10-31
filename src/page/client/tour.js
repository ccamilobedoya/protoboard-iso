// The tour (stage and video, V2): the circuit's timeline (page.tour, read and checked by
// src/tour.js) played in the page by the director (director.js). *See how it works* in the ⋯ menu
// starts it; a tap anywhere, or Escape, stops it and leaves the page as it is. A recording
// (?director=1) starts it with protoboardLive.tour.play() and ticks it itself.
//
// Each step becomes a cue at its `at`. Moves are the named ones of moves.js; under reduced motion
// (not in a recording) they all become cuts: the camera, controls, ramps and counts arrive at once,
// while breaths and waits keep their time. Texts go in with textContent: a timeline is data.
//
// The moves of V6 (the plan's table) that live here: a focus with a move brings the veil, the strips
// and the coordinates in with it, or takes them away (M1 arrival, M14 close); a caption's lines rise
// from their baseline after the caption before has left (M12); an insert brings a part down to its
// holes, the circuit without current until it lands (M15); a raise lifts a part to set it apart and
// keeps it up, in the circuit (M16); an assemble builds the circuit one part after the other, the
// wires drawn end to end (M4, M5); a pulse runs a flash along the current's path (M7). Only transform
// and opacity move.

import { moveTiming, bezier, CAPTION, INSERT, RAISE, ASSEMBLE, PULSE } from './moves.js';
import { applyFocus, liftPart, hidePart, isWire, traceWire } from './focus.js';
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

// How long a step moves things, from its `at`: its move, a ramp, a caption coming in, a landing.
const CAPTION_MS = CAPTION.out + 2 * CAPTION.stagger + CAPTION.in;
const assembleMs = (s, count) => Math.max(0, (s.parts?.length ?? count) - 1) * (s.gap ?? ASSEMBLE.gap) + ASSEMBLE.ms;
function stepMs(s, timing, count) {
  if (s.do === 'flow') return s.ramp ?? 0;
  if (s.do === 'assemble') return assembleMs(s, count) + INSERT.ramp;
  if (s.do === 'caption' || s.do === 'value') return CAPTION_MS;
  if (s.do === 'insert') return (s.ms ?? INSERT.ms) + INSERT.ramp;
  return timing(s).ms;
}

export function setupTour(page, { director, t, f, recording, reading, dots, lights = () => {}, carrying = () => [] }) {
  const steps = page.data.tour.steps;
  const reduced = !recording && typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timing = (s) => (reduced ? { ms: 0, ease: () => 1 } : moveTiming(s.move, s.ms));
  const end = Math.max(0, ...steps.map((s) => s.at + (reduced ? 0 : stepMs(s, timing, Object.keys(page.data.parts).length))));

  // The caption over the drawing: a text, a second line, a value; the way to stop it.
  const box = el(page.main, 'div', 'tour-caption');
  box.hidden = true;
  box.setAttribute('aria-live', 'polite');
  // Each line is a mask (page/style.js) around what rises in it (M12).
  const text = el(el(box, 'p', 'text'), 'span', 'in');
  const line = el(el(box, 'p', 'line'), 'span', 'in');
  const value = el(box, 'p', 'value');
  const rise = el(value, 'span', 'in');
  const label = el(rise, 'span', 'label');
  const number = el(rise, 'span', 'number');
  const lineRow = line.parentNode;
  lineRow.hidden = true;
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
  // M1, M14: what a focus brings with it (the veil, unless the current layer keeps it; the strips;
  // the coordinates) at `k` of its opacity.
  const fade = (k) => {
    const layers = page.state.layer === 'flow' ? ['strips', 'coords'] : ['veil', 'strips', 'coords'];
    for (const svg of page.svgs) {
      for (const name of layers) {
        const g = svg.querySelector(':scope > .' + name);
        if (g) g.style.opacity = k < 1 ? k.toFixed(3) : '';
      }
    }
  };
  const focusOn = (parts) => {
    page.state.node = null;
    page.state.focus = new Set(parts);
    if (page.told !== undefined) page.told = parts.at(-1) ?? null;
    applyFocus(page);
  };

  // M12: lines rise into their masks, one after the other, once the caption before has left (a
  // copy of it fades out on top). `rows`: the elements that rise, top to bottom.
  const rising = bezier(CAPTION.curve);
  const leaving = () => {
    if (reduced || box.hidden) return null;
    const old = box.cloneNode(true);
    old.classList.add('leaving');
    return old;
  };
  function riseIn(rows, old) {
    if (reduced) return;
    const after = Boolean(old);
    if (old) {
      old.setAttribute('aria-hidden', 'true');
      box.after(old);
      director.tween((e) => {
        old.style.opacity = (1 - e).toFixed(3);
        if (e >= 1) old.remove();
      }, { ms: CAPTION.out, ease: (k) => k });
    }
    const wait = after ? CAPTION.out : 0;
    const total = wait + (rows.length - 1) * CAPTION.stagger + CAPTION.in;
    const place = (e) => {
      const ms = e * total;
      rows.forEach((row, k) => {
        const local = Math.min(1, Math.max(0, (ms - wait - k * CAPTION.stagger) / CAPTION.in));
        row.style.transform = local >= 1 ? '' : 'translateY(' + (130 * (1 - rising(local))).toFixed(2) + '%)';
      });
    };
    place(0);
    director.tween(place, { ms: total, ease: (k) => k });
  }

  // Every part back on the board as it is (lifted ones in their holes, parts and wires an assemble
  // had not brought yet in place): the tour stopped, or a tour in the page ended.
  const building = new Set();
  const lower = () => {
    for (const id of [...(page.lifted?.keys() ?? [])]) liftPart(page, id, 0);
    for (const id of building) {
      hidePart(page, id, false);
      traceWire(page, id, 1);
    }
    building.clear();
  };

  // M15, M4: parts in the air or a circuit being built; it has no current until the last one lands.
  const aloft = new Set();
  function release(key) {
    aloft.delete(key);
    if (aloft.size) return;
    lights(true);
    if (reduced) return dots(1);
    director.tween(dots, { ms: INSERT.ramp, ease: moveTiming('arrival').ease });
  }
  function land(id) {
    liftPart(page, id, 0);
    release(id);
  }

  // M7: a copy of each piece the current runs through, lit in turn from the highest voltage to the
  // lowest, over the drawing; gone at the end.
  function pulse(ms) {
    const pieces = carrying();
    if (!pieces.length || page.state.layer !== 'flow') return;
    const svg = page.current();
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'pulse');
    svg.querySelector(':scope > .flow')?.after(g);
    const top = Math.max(...pieces.map((p) => p.v));
    const span = top - Math.min(...pieces.map((p) => p.v)) || 1;
    const lit = pieces.map((p) => {
      const copy = p.el.cloneNode(false);
      copy.removeAttribute('style');
      copy.style.opacity = '0';
      g.appendChild(copy);
      return { copy, at: ((top - p.v) / span) * (1 - PULSE.width) + PULSE.width / 2 };
    });
    director.tween((e) => {
      for (const p of lit) p.copy.style.opacity = Math.max(0, 1 - Math.abs(e - p.at) / (PULSE.width / 2)).toFixed(3);
      if (e >= 1) g.remove();
    }, { ms, ease: (k) => k });
  }

  let framed = null; // the last frame step, for a probe to frame again
  const act = {
    frame: (s) => {
      framed = s;
      if (page.data.parts[s.target]) tell(s.target);
      return director.frame(s.target, { ...timing(s), zoom: s.zoom ?? 1 });
    },
    focus: (s) => {
      const { ms, ease } = timing(s);
      const was = document.body.classList.contains('focusing');
      const on = s.parts.some((id) => page.data.parts[id]);
      if (!(ms > 0) || on === was) return focusOn(s.parts);
      if (on) {
        focusOn(s.parts);
        fade(0);
        return director.tween(fade, { ms, ease });
      }
      director.tween((e) => {
        fade(1 - e);
        if (e < 1) return;
        focusOn(s.parts);
        fade(1);
      }, { ms, ease });
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
      const old = leaving();
      box.hidden = false;
      text.textContent = s.text;
      line.textContent = s.line ?? '';
      lineRow.hidden = !s.line;
      shown = null;
      value.hidden = true;
      riseIn(s.line ? [text, line] : [text], old);
    },
    value: (s) => {
      box.hidden = false;
      value.hidden = false;
      riseIn([rise], null);
      label.textContent = s.label ?? '';
      shown = { part: s.part, field: s.field, k: 0 };
      director.tween((e) => {
        if (shown) shown.k = e;
      }, { ms: reduced ? 0 : COUNT_MS, ease: (k) => k });
      showValue();
    },
    // In the page, the card with its oscilloscope; in a recording, the oscilloscope in a box of its
    // own (M11), the camera bringing the last thing it framed back into the room it leaves.
    probe: (s) => {
      if (!recording) {
        if (s.off) return select(page, null);
        return s.node != null ? selectNode(page, s.node) : select(page, s.part);
      }
      page.insetScope?.(s.off ? null : s.node != null ? 'node:' + s.node : s.part, s.field === 'current' ? 'i' : 'v');
      if (framed) director.frame(framed.target, { ...moveTiming('arrival'), zoom: framed.zoom ?? 1 });
    },
    // M15: in focus, 12 mm up, then down to its holes along an arrival; landed, a hit.
    insert: (s) => {
      if (!page.data.parts[s.part]) return;
      page.state.node = null;
      page.state.focus.add(s.part);
      if (page.told !== undefined) page.told = s.part;
      applyFocus(page);
      if (reduced) return;
      aloft.add(s.part);
      lights(false);
      dots(0);
      const ease = moveTiming('arrival').ease;
      director.tween((e) => {
        if (e < 1) liftPart(page, s.part, INSERT.mm * (1 - ease(e)));
        else land(s.part);
      }, { ms: s.ms ?? INSERT.ms, ease: (k) => k });
    },
    // M4, M5: every part listed (all, in the circuit's order, by default) leaves the board, then
    // each comes in `gap` ms after the one before: down to its holes, or a wire drawn end to end.
    assemble: (s) => {
      const ids = (s.parts ?? Object.keys(page.data.parts)).filter((id) => page.data.parts[id]);
      if (reduced || !ids.length) return;
      const gap = s.gap ?? ASSEMBLE.gap;
      const total = (ids.length - 1) * gap + ASSEMBLE.ms;
      const ease = moveTiming('arrival').ease;
      const state = ids.map(() => 'out');
      const key = {};
      aloft.add(key);
      lights(false);
      dots(0);
      for (const id of ids) {
        building.add(id);
        hidePart(page, id, true);
      }
      director.tween((e) => {
        const t = e * total;
        ids.forEach((id, k) => {
          const local = (t - k * gap) / ASSEMBLE.ms;
          if (local < 0 || state[k] === 'in') return;
          const done = local >= 1;
          if (isWire(page, id)) {
            hidePart(page, id, false);
            traceWire(page, id, done ? 1 : ease(local));
          } else {
            hidePart(page, id, false);
            liftPart(page, id, done ? 0 : INSERT.mm * (1 - ease(local)));
          }
          if (done) {
            state[k] = 'in';
            building.delete(id);
          }
        });
        if (e >= 1) release(key);
      }, { ms: total, ease: (k) => k });
    },
    pulse: (s) => pulse(timing(s).ms),
    // M16: up (or back down, mm 0) along its move, from where it is; in focus while it is up.
    // The simulation goes on: raised is not taken out.
    raise: (s) => {
      if (!page.data.parts[s.part]) return;
      const to = s.mm ?? RAISE.mm;
      if (to > 0) {
        page.state.node = null;
        page.state.focus.add(s.part);
        if (page.told !== undefined) page.told = s.part;
        applyFocus(page);
      }
      const from = page.lifted?.get(s.part) ?? 0;
      const { ms, ease } = timing(s);
      director.tween((e) => liftPart(page, s.part, from + (to - from) * e), { ms, ease });
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
    lower();
    aloft.clear();
    lights(true);
    dots(1);
    fade(1);
    for (const old of page.main.querySelectorAll('.tour-caption.leaving, svg > .pulse')) old.remove();
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
          lower();
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
