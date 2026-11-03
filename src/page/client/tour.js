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
// wires drawn end to end (M4, M5); a pulse runs a flash along the current's path (M7); a scene puts
// one part alone on a pedestal (M17) and a land brings the board up under it (M18); a pin lights a
// pin of it with its row of text (M19, M20; pinout.js); a bench connects its pins to pads that read the
// circuit (M21; bench.js); a symbol (M22) or an inside view (M23) stands beside it (figure.js). Only
// transform and opacity move.

import { moveTiming, bezier, CAPTION, CARD, LED_EVENT, INSERT, RAISE, NUDGE, SCENE, SCENE_ENTER, LAND, LABEL_MIN_PX, MOVES, ASSEMBLE, PULSE, PULSE_COLORS } from './moves.js';
import { applyFocus, liftPart, showPart, isWire, traceWire, quote, scopeFlow } from './focus.js';
import { select, selectNode } from './card.js';
import { setupPinout } from './pinout.js';
import { setupBench } from './bench.js';
import { setupFigure } from './figure.js';
import { partsRect } from './view.js';

// A step run on its own (`run`) takes the move a timeline's step takes by default (src/tour.js).
const DEFAULT_MOVES = { frame: 'arrival', scene: 'arrival', land: 'travel', pin: 'arrival', bench: 'arrival', symbol: 'arrival', inside: 'arrival' };
const COUNT_MS = 500; // a value counts up to its reading (M9), unless a step says otherwise
const WAIT_MS = 10_000; // a wait-until that never comes true gives up after this
export const LANDING_PAUSE = 1800; // ms a landing rests on its first frame before it plays again
// A landing is calmer than a video (which must catch the eye): its clock runs at `rate` (every step,
// move and caption takes 1 / rate as long), its camera moves ease in and out instead of arriving
// fast, and at the end the camera goes back to where the tour starts in `back` ms, so the next play
// begins without a jump.
export const LANDING = { rate: 0.75, curve: [0.45, 0, 0.55, 1], back: 1800 };
const CAMERA_MOVES = new Set(['arrival', 'travel', 'push', 'anticipation']);
const UNITS = { current: 'A', voltage: 'V', power: 'W', brightness: '%' };

function el(parent, tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent.appendChild(e);
  return e;
}

// How long a step moves things, from its `at`: its move, a ramp, a caption coming in, a landing.
const captionMs = (s) => (s.out ?? CAPTION.out) + 2 * (s.stagger ?? CAPTION.stagger) + (s.in ?? CAPTION.in) + (s.count ?? COUNT_MS);
export const cardMs = (s) => (s.in ?? CARD.in) + (s.hold ?? CARD.hold) + (s.out ?? CARD.out);
const assembleMs = (s, count) => Math.max(0, (s.parts?.length ?? count) - 1) * (s.gap ?? ASSEMBLE.gap) + (s.ms ?? ASSEMBLE.ms);
function stepMs(s, timing, count) {
  if (s.do === 'flow') return s.ramp ?? 0;
  if (s.do === 'assemble') return assembleMs(s, count) + INSERT.ramp;
  if (s.do === 'caption' || s.do === 'value') return captionMs(s);
  if (s.do === 'insert') return timing(s).ms + INSERT.ramp;
  if (s.do === 'nudge') return s.ms ?? NUDGE.ms;
  if (s.do === 'card') return cardMs(s);
  return timing(s).ms;
}

export function setupTour(page, { director, t, f, recording, landing = false, reading, dots, lights = () => {}, carrying = () => [], look = () => ({ vmax: 0, peak: 0, speed: 'linear', scale: 1, flowing: false }) }) {
  const steps = page.data.tour.steps;
  const reduced = !recording && typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const calm = bezier(LANDING.curve);
  const timing = (s) => {
    if (reduced) return { ms: 0, ease: () => 1 };
    const t = moveTiming(s.move, s.ms ?? (s.do === 'insert' ? INSERT.ms : undefined), s.curve);
    return landing && !s.curve && CAMERA_MOVES.has(s.move ?? (s.do === 'frame' ? 'arrival' : '')) ? { ...t, ease: calm } : t;
  };
  const end = Math.max(0, ...steps.map((s) => s.at + (reduced ? 0 : stepMs(s, timing, Object.keys(page.data.parts).length))));

  // The caption over the drawing: a text, a second line, a value; the way to stop it.
  const box = el(page.main, 'div', 'tour-caption');
  box.hidden = true;
  box.setAttribute('aria-live', 'polite');
  // Each line is a mask (page/style.js) around what rises in it (M12).
  const text = el(el(box, 'p', 'text'), 'span', 'in');
  const line = el(el(box, 'p', 'line'), 'span', 'in');
  const datum = el(el(box, 'p', 'data'), 'span', 'in');
  const value = el(box, 'p', 'value');
  const rise = el(value, 'span', 'in');
  const label = el(rise, 'span', 'label');
  const number = el(rise, 'span', 'number');
  const lineRow = line.parentNode;
  lineRow.hidden = true;
  const dataRow = datum.parentNode;
  dataRow.hidden = true;
  value.hidden = true;
  const hint = el(box, 'small', 'stop');
  hint.textContent = t('page.tour.stop');
  hint.hidden = recording || landing;
  // A card (`card`): a sentence alone over the whole screen, for a moment (page/style.js).
  const card = el(page.main, 'div', 'tour-card');
  card.hidden = true;
  card.setAttribute('aria-live', 'polite');
  const cardText = el(card, 'p', 'text');
  const cardLine = el(card, 'p', 'line');
  let cardTween = 0; // the card on screen: a later card replaces it, its own fades stop

  // A text with its emphasis (`em`, the words of it drawn in the accent and larger): text nodes
  // around a span, never markup. `em` that the text does not hold leaves it plain.
  function emphasize(target, words, em) {
    target.textContent = '';
    const at = em ? words.indexOf(em) : -1;
    if (at < 0) {
      target.textContent = words;
      return false;
    }
    if (at > 0) target.append(words.slice(0, at));
    const span = document.createElement('span');
    span.className = 'em';
    span.textContent = em;
    target.append(span);
    if (at + em.length < words.length) target.append(words.slice(at + em.length));
    return true;
  }

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
  // `solid`: the parts in focus drawn whole over the current layer (page/style.js), until the next focus.
  const focusOn = (parts, solid = false) => {
    document.body.classList.toggle('focus-solid', solid && parts.length > 0);
    page.state.node = null;
    page.state.focus = new Set(parts);
    if (page.told !== undefined) page.told = parts.at(-1) ?? null;
    applyFocus(page);
  };

  // M12: a caption's lines come in one after the other (`enter`: rise into their masks, the
  // default; fade; or cut), once the caption before has left (a copy of it fading out on top).
  // `rows`: the elements that come in, top to bottom; `s`: the step, with its own times.
  const rising = bezier(CAPTION.curve);
  const leaving = () => {
    if (reduced || box.hidden) return null;
    const old = box.cloneNode(true);
    old.classList.add('leaving');
    return old;
  };
  function comeIn(rows, old, s) {
    const enter = s.enter ?? 'rise';
    for (const row of rows) {
      row.style.transform = '';
      row.style.opacity = '';
    }
    const out = s.out ?? CAPTION.out;
    if (old) {
      old.setAttribute('aria-hidden', 'true');
      box.after(old);
      director.tween((e) => {
        old.style.opacity = (1 - e).toFixed(3);
        if (e >= 1) old.remove();
      }, { ms: reduced ? 0 : out, ease: (k) => k });
    }
    if (reduced || enter === 'cut') return;
    const wait = old ? out : 0;
    const each = s.in ?? CAPTION.in;
    const stagger = s.stagger ?? CAPTION.stagger;
    const total = wait + (rows.length - 1) * stagger + each;
    const place = (e) => {
      const ms = e * total;
      rows.forEach((row, k) => {
        const local = each > 0 ? Math.min(1, Math.max(0, (ms - wait - k * stagger) / each)) : ms >= wait + k * stagger ? 1 : 0;
        // A rise fades in as it comes: a line half under its mask is never seen cut.
        row.style.opacity = local >= 1 ? '' : rising(local).toFixed(3);
        if (enter !== 'fade') row.style.transform = local >= 1 ? '' : 'translateY(' + (CAPTION.rise * (1 - rising(local))).toFixed(2) + '%)';
      });
    };
    place(0);
    director.tween(place, { ms: total, ease: (k) => k });
  }

  // A part's short label (the one a recording keeps) said otherwise: the original kept to put back.
  const relabelled = new Map(); // element → its text
  function relabel(id, words) {
    for (const svg of page.svgs) {
      for (const el of svg.querySelectorAll(':scope > .shortlabels > [data-part="' + id.replace(/["\\]/g, '\\$&') + '"]')) {
        if (!relabelled.has(el)) relabelled.set(el, el.textContent);
        el.textContent = words;
        el.style.display = words ? '' : 'none';
      }
    }
    applyFocus(page);
  }

  // Every part back on the board as it is (lifted ones in their holes, parts and wires an assemble
  // had not brought yet in place): the tour stopped, or a tour in the page ended.
  const building = new Set();
  const lower = () => {
    for (const id of [...(page.lifted?.keys() ?? [])]) liftPart(page, id, 0);
    for (const id of building) {
      showPart(page, id, 1);
      traceWire(page, id, 1);
    }
    building.clear();
    for (const [el, words] of relabelled) {
      el.textContent = words;
      el.style.display = '';
    }
    relabelled.clear();
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

  // M7: a copy of each piece the current runs through, lit in turn by voltage (`direction`:
  // forward, from the highest to the lowest, as the current runs; back, the other way), over the
  // drawing, gone at the end. `through`: only the pieces of these parts or strips. `color`: a
  // name of PULSE_COLORS or #rrggbb; `width`: the share of the run each piece is lit; `size`: its
  // stroke, in drawing units.
  function pulse(s, ms) {
    const only = s.through ? new Set(s.through) : null;
    const pieces = carrying().filter((p) => !only || only.has(p.part) || only.has(p.node));
    if (!pieces.length || page.state.layer !== 'flow') return;
    const svg = page.current();
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'pulse');
    svg.querySelector(':scope > .flow')?.after(g);
    const width = s.width ?? PULSE.width;
    const top = Math.max(...pieces.map((p) => p.v));
    const low = Math.min(...pieces.map((p) => p.v));
    const span = top - low || 1;
    const lit = pieces.map((p) => {
      const copy = p.el.cloneNode(false);
      copy.removeAttribute('style');
      copy.style.opacity = '0';
      if (s.color) copy.style.stroke = PULSE_COLORS[s.color] ?? s.color;
      if (s.size) copy.style.strokeWidth = String(s.size);
      g.appendChild(copy);
      const along = s.direction === 'back' ? (p.v - low) / span : (top - p.v) / span;
      return { copy, at: along * (1 - width) + width / 2 };
    });
    director.tween((e) => {
      for (const p of lit) p.copy.style.opacity = Math.max(0, 1 - Math.abs(e - p.at) / (width / 2)).toFixed(3);
      if (e >= 1) g.remove();
    }, { ms, ease: (k) => k });
  }

  // How a part comes in, `k` of the way (M15, M4): down from `height` mm, fading in, or at once.
  function enterPart(id, enter, k, height) {
    if (enter === 'fade') {
      showPart(page, id, k);
      return;
    }
    showPart(page, id, 1);
    liftPart(page, id, enter === 'drop' && k < 1 ? height * (1 - k) : 0);
  }

  // M17, M18: a part alone on a pedestal (a video about one part; docs/en/component-focus.md). The
  // board and the other parts are not drawn (main[data-scene="part"], page/style.js); their lights
  // are hidden by a rule with the part's id. The layers fade along a scene's move and come back
  // along a land's.
  const sceneRule = el(document.head, 'style');
  let pedestal = null; // the part on the pedestal
  const landed = new Set(); // parts brought down by a land: an assemble after it leaves them in place
  // Everything of the board that goes away on a pedestal, the parts' labels (boxes or short ones) included:
  // they fade with the rest instead of vanishing at the end.
  const BOARD_LAYERS = ['under', 'board', 'parts', 'labels', 'shortlabels', 'lights', 'veil', 'strips', 'coords', 'flow', 'marks'];
  const sceneFade = (k) => {
    for (const svg of page.svgs) {
      for (const name of BOARD_LAYERS) {
        const g = svg.querySelector(':scope > .' + name);
        if (g) g.style.opacity = k < 1 ? k.toFixed(3) : '';
      }
    }
  };
  // A pedestal's light: an ellipse of the colour fading out, on the ground under the part, in the
  // drawing (it moves with the camera; a drop lifts the part, not its light). Under the part's copy.
  const sceneLight = (id, glow) => {
    for (const svg of page.svgs) {
      svg.querySelector(':scope > .scene-light')?.remove();
      if (!glow) continue;
      let box = null;
      // Its polygons (a text's box is in its own transformed units).
      for (const el of svg.querySelectorAll(':scope > .parts > polygon[data-part="' + quote(id) + '"]')) {
        let b;
        try {
          b = el.getBBox();
        } catch {
          b = null; // not laid out (jsdom): no light
        }
        if (!b || !(b.width > 0)) continue;
        box = box ? { x0: Math.min(box.x0, b.x), y0: Math.min(box.y0, b.y), x1: Math.max(box.x1, b.x + b.width), y1: Math.max(box.y1, b.y + b.height) } : { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height };
      }
      if (!box) continue;
      const NS = 'http://www.w3.org/2000/svg';
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'scene-light');
      const grad = document.createElementNS(NS, 'radialGradient');
      grad.id = 'scene-light-' + page.svgs.indexOf(svg);
      for (const [offset, opacity] of [[0, 0.55], [0.45, 0.28], [1, 0]]) {
        const stop = document.createElementNS(NS, 'stop');
        stop.setAttribute('offset', String(offset));
        stop.setAttribute('style', 'stop-color:' + glow + ';stop-opacity:' + opacity);
        grad.appendChild(stop);
      }
      const w = box.x1 - box.x0;
      const h = box.y1 - box.y0;
      const ellipse = document.createElementNS(NS, 'ellipse');
      ellipse.setAttribute('cx', ((box.x0 + box.x1) / 2).toFixed(2));
      ellipse.setAttribute('cy', (box.y1 - h * 0.2).toFixed(2));
      ellipse.setAttribute('rx', (w * 0.95).toFixed(2));
      ellipse.setAttribute('ry', (w * 0.42).toFixed(2));
      ellipse.setAttribute('fill', 'url(#' + grad.id + ')');
      g.append(grad, ellipse);
      svg.insertBefore(g, svg.querySelector(':scope > .spotlight'));
    }
  };
  const leaveScene = () => {
    delete page.main.dataset.scene;
    sceneLight(null, null);
    slide(0);
    sceneRule.textContent = '';
    sceneFade(1);
    pedestal = null;
  };
  // The parts an assemble will bring (its list, or every part but those already landed).
  const assembling = (s) => (s.parts ?? Object.keys(page.data.parts).filter((id) => !landed.has(id))).map((p) => (typeof p === 'string' ? p : p.part)).filter((id) => page.data.parts[id]);
  // Back to the board from the pedestal: the part comes down, the board and the other parts come
  // in along the move (those a later assemble brings stay away for it). `follow` (a land, M18):
  // the camera goes down as the part does, so the part stays still on screen and the board rises
  // under it. The board comes in opaque, never seen through over the part: it slides up from below
  // the frame under a veil of the stage's colour (LAND.dim), the part over the veil, and lightens
  // in a ramp of LAND.ramp ms once the camera has opened (`lighten`).
  const SLIDING = ['under', 'board', 'parts', 'labels', 'shortlabels', 'lights', 'marks'];
  const slide = (dy) => {
    for (const svg of page.svgs) {
      for (const name of SLIDING) {
        const g = svg.querySelector(':scope > .' + name);
        if (!g) continue;
        if (dy) g.setAttribute('transform', 'translate(0 ' + dy.toFixed(2) + ')');
        else g.removeAttribute('transform');
      }
    }
  };
  // A focus step that ran while the board was landing (its strips and coordinates belong to the board,
  // which is still coming in under the veil): kept at the end, its layers faded in then.
  let held = false;
  // The veil over the board while it lands, `k` of the way from where it will rest to LAND.dim: with
  // the current layer on (which keeps the veil) at its own opacity, else gone. 0: its own styles back.
  const dim = (k) => {
    const rest = page.state.layer === 'flow' || held;
    for (const svg of page.svgs) {
      const g = svg.querySelector(':scope > .veil');
      if (!g) continue;
      for (const r of g.children) {
        const own = Number(r.getAttribute('fill-opacity') ?? 1);
        const to = rest ? own : 0;
        r.style.fillOpacity = k > 0 ? (to + (LAND.dim - to) * k).toFixed(3) : '';
      }
    }
  };
  let lit = null; // the land's part while the board lightens (main[data-scene="lit"])
  // The focus's layers that sit over the veil (the strips under the parts in focus and their
  // coordinates), from unseen to seen in LAND.reveal ms once the board is lit.
  const reveal = () => {
    const layers = (k) => {
      for (const svg of page.svgs) {
        for (const name of ['strips', 'coords']) {
          const g = svg.querySelector(':scope > .' + name);
          if (g) g.style.opacity = k < 1 ? k.toFixed(3) : '';
        }
      }
    };
    if (reduced) return layers(1);
    layers(0);
    director.tween(layers, { ms: LAND.reveal, ease: moveTiming('arrival').ease });
  };
  // The board lit: the veil gone, the part back among the others, the focus cleared unless a step
  // has set one since (`keep`) or during the land (`held`: its layers come in now, never before).
  const litDone = (keep) => {
    if (lit == null) return;
    lit = null;
    const during = held;
    held = false;
    dim(0);
    leaveScene();
    if (during) reveal();
    else if (!keep) focusOn([]);
  };
  function lighten(s, from) {
    const next = steps.find((x) => x !== s && x.at >= s.at && x.do === 'frame');
    const open = next ? next.at + timing(next).ms : 0;
    const wait = Math.max(0, open - from);
    const ramp = reduced ? 0 : LAND.ramp;
    const ease = moveTiming('travel').ease;
    if (!(wait + ramp > 0)) return litDone(false);
    director.tween((e) => {
      if (lit == null) return;
      const t = e * (wait + ramp);
      dim(t <= wait ? 1 : 1 - ease((t - wait) / ramp));
      if (e >= 1) litDone(false);
    }, { ms: wait + ramp, ease: (k) => k });
  }
  function toBoard(s, follow) {
    const id = pedestal ?? s.part;
    if (!id || !page.data.parts[id]) return;
    const { ms, ease } = timing(s);
    const height = page.lifted?.get(id) ?? 0;
    const next = steps.find((x) => x !== s && x.at >= s.at && x.do === 'assemble');
    landed.add(id);
    for (const p of next ? assembling(next) : []) {
      if (p === id) continue;
      building.add(p);
      showPart(page, p, 0);
    }
    page.main.dataset.scene = 'land';
    sceneFade(1);
    dim(1);
    lit = id;
    const below = page.box ? page.box[3] : 0;
    slide(below);
    const dy = height * (page.data.lift ?? 0);
    if (follow && page.box && dy) director.frame([page.box[0], page.box[1] + dy, page.box[2], page.box[3]], { ms, ease });
    const at = s.at;
    director.tween((e) => {
      liftPart(page, id, height * (1 - e));
      slide(below * (1 - e));
      if (e < 1) return;
      // Touched down: the board in place, still under the veil; the part over it without its label.
      page.main.dataset.scene = 'lit';
      sceneRule.textContent = '';
      pedestal = null;
      if (page.told !== undefined) {
        page.told = null;
        applyFocus(page);
      }
      event('land', { part: id });
      lighten(s, at + ms);
    }, { ms, ease });
  }

  // M19, M20: a part's pins lit one by one with their rows (pinout.js); the part's short label stays
  // away while any is lit (the pinout is what is told).
  const pins = setupPinout(page);
  const pinRule = el(document.head, 'style');
  const unpin = () => {
    pins.clear();
    pinRule.textContent = '';
  };
  // M21: the part's pins joined to pads that read the circuit (bench.js).
  const bench = setupBench(page, { reading, look, f, now: () => director.time });
  // M22, M23: the symbol or the inside view beside the part (figure.js).
  const figure = setupFigure(page, { reading, t, f, now: () => director.time });
  const showFigure = (s, what) => {
    if (!s.on) return figure.clear(what);
    if (!page.data.pinouts?.[page.state.view]?.[s.part]?.[what]) return;
    const { ms, ease } = timing(s);
    director.tween(figure.show(s.part, what, ms), { ms, ease });
  };

  // In a recording, the moments a sound may go with (scripts/render-frames.js writes them to
  // timeline.json): a land touching down, each step a count shows, an oscilloscope coming or going,
  // a mark drawn in it. { t (ms of the recording), kind, ... }.
  const events = [];
  function event(kind, extra = {}) {
    if (recording) events.push({ t: director.time, kind, ...extra });
  }
  // The counts on screen: a set moving a number (its control's value) and a value counting up
  // (its number): each new figure shown is an event.
  const counting = new Map();
  let shownNumber = null;
  function counts() {
    if (!recording) return;
    if (counting.size) {
      const now = new Map(director.controls().map((c) => [`${c.id}|${c.field}`, c.value]));
      for (const [key, c] of counting) {
        const v = now.get(key);
        const figure = typeof v === 'number' ? f(v, '') : String(v);
        if (figure !== c.last) {
          if (c.last != null) event('count', { part: c.part, field: c.field, shown: figure });
          c.last = figure;
        }
        if (director.time >= c.until) counting.delete(key);
      }
    }
    const n = shown && !value.hidden ? number.textContent : null;
    if (n && n !== shownNumber) event('count', { part: shown.part, field: shown.field, shown: n });
    shownNumber = n;
  }
  // Each LED turning on or off, as the simulation has it (LED_EVENT's two levels): a sound may go
  // with each blink. Every part with a brightness is an LED here.
  const ledsOn = new Map();
  function leds() {
    if (!recording) return;
    const parts = reading()?.parts ?? {};
    for (const [id, r] of Object.entries(parts)) {
      if (typeof r?.brightness !== 'number') continue;
      const was = ledsOn.get(id) ?? false;
      const on = was ? r.brightness > LED_EVENT.off : r.brightness > LED_EVENT.on;
      if (on !== was || !ledsOn.has(id)) {
        if (on !== was) event('led', { part: id, on });
        ledsOn.set(id, on);
      }
    }
  }
  // A flow step's `sense`: which way the current runs through its part now; on a change, the dots'
  // colour (main[data-sense], --flow-sense; page/style.js) and the nets they run on (page.flowParts).
  function senseTick() {
    const fs = page.flowSense;
    if (!fs) return;
    const i = readingOf(fs.part, 'current');
    if (typeof i !== 'number') return;
    const now = i >= 0 ? 'forward' : 'back';
    if (now === fs.now) return;
    fs.now = now;
    const side = fs[now] ?? {};
    if (side.color) {
      page.main.dataset.sense = now;
      page.main.style.setProperty('--flow-sense', PULSE_COLORS[side.color] ?? side.color);
    } else {
      delete page.main.dataset.sense;
      page.main.style.removeProperty('--flow-sense');
    }
    page.flowParts = side.parts ?? null;
    scopeFlow(page);
  }
  let framed = null; // the last frame step, for a probe to frame again
  const act = {
    // The camera (M1, M2, M14): to a target (board, parts, here, a part or a list of parts), with
    // `zoom` and `pan` (shares of the frame), along the step's move. Automatic otherwise: nothing
    // moves it but these steps (and a probe making room for its box).
    // The part on the pedestal is framed as `scene` frames it (alone, without its label's room), so a
    // video can open close on it and pull back when its pins come in.
    frame: (s) => {
      framed = { ...s, alone: s.alone === true || (pedestal != null && s.target === pedestal) };
      const last = [s.target].flat().at(-1);
      if (page.data.parts[last]) tell(last);
      return director.frame(s.target, { ...timing(s), zoom: s.zoom ?? 1, pan: s.pan ?? null, alone: framed.alone });
    },
    focus: (s) => {
      // A land under way keeps its scene: the strips and coordinates of a focus are the board's, and
      // the board is still sliding in under the veil, so they wait for it to be lit (litDone). Ending
      // the land here showed them over the empty stage, ahead of the board and still with the part.
      if (lit != null) {
        held = true;
        return focusOn(s.parts, s.solid === true);
      }
      litDone(true);
      const { ms, ease } = timing(s);
      const was = document.body.classList.contains('focusing');
      const on = s.parts.some((id) => page.data.parts[id]);
      if (!(ms > 0) || on === was) return focusOn(s.parts, s.solid === true);
      if (on) {
        focusOn(s.parts, s.solid === true);
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
    // A probe's box with marks draws a line where the set starts, with the new value (M11).
    set: (s) => {
      if (page.scopeMark?.(s.part, s.field, s.value, s.cycle)) event('mark', { part: s.part, field: s.field, value: s.value });
      const { ms } = timing(s);
      // The mark's new pace is measured from when the control has arrived (live.js, compare).
      if (page.scopeSettled) director.tween((e) => e >= 1 && page.scopeSettled(s.part, s.field), { ms, ease: (k) => k });
      if (ms > 0) counting.set(`${s.part}|${s.field}`, { part: s.part, field: s.field, until: director.time + ms, last: null });
      return director.set(s.part, s.field, s.value, timing(s));
    },
    // `scope` "focus": only the nets of the parts in focus carry the current, until the next flow
    // step (focus.js, scopeFlow). `style` was read when the page was made (sim/paths.js, flowStyle).
    // `sense`: the dots take the colour of the way the current runs through a part (a capacitor
    // charging, forward; discharging, back) and, when that side names `parts`, run only on their
    // nets (senseTick); on the log scale, so a small current is still seen moving (live.js).
    flow: (s) => {
      page.state.layer = s.on ? 'flow' : 'parts';
      page.flowScope = s.on ? (s.scope ?? 'all') : 'all';
      page.flowSense = s.on && s.sense ? { ...s.sense, now: null } : null;
      page.flowParts = null;
      delete page.main.dataset.sense;
      page.main.style.removeProperty('--flow-sense');
      senseTick();
      scopeFlow(page);
      page.show();
      if (!s.on || !(s.ramp > 0) || reduced) return dots(1);
      dots(0);
      director.tween(dots, { ms: s.ramp, ease: moveTiming('arrival').ease });
    },
    caption: (s) => {
      const old = leaving();
      shown = null;
      if (s.off) {
        box.hidden = true;
        if (old) comeIn([], old, s);
        return;
      }
      box.hidden = false;
      // `em`: in the text, else in the second line.
      const inText = emphasize(text, s.text, s.em);
      emphasize(line, s.line ?? '', inText ? null : s.em);
      lineRow.hidden = !s.line;
      datum.textContent = s.data ?? '';
      dataRow.hidden = !s.data;
      value.hidden = true;
      comeIn([text, ...(s.line ? [line] : []), ...(s.data ? [datum] : [])], old, s);
    },
    // M9: a reading, large; it counts up to its value in `count` ms (0: shown as it is).
    value: (s) => {
      box.hidden = false;
      value.hidden = false;
      comeIn([rise], null, s);
      label.textContent = s.label ?? '';
      shown = { part: s.part, field: s.field, k: 0 };
      director.tween((e) => {
        if (shown) shown.k = e;
      }, { ms: reduced ? 0 : s.count ?? COUNT_MS, ease: (k) => k });
      showValue();
    },
    // In the page, the card with its oscilloscope; in a recording, the oscilloscope in a box of its
    // own (M11), the camera bringing the last thing it framed back into the room it leaves; `window`
    // keeps its time axis fixed and `marks` draws a line at each set; `place` top puts it under the
    // caption and `size` compact draws it small (live.js).
    probe: (s) => {
      if (!recording) {
        if (s.off) return select(page, null);
        return s.node != null ? selectNode(page, s.node) : select(page, s.part);
      }
      const had = document.body.classList.contains('with-scope');
      const on = page.insetScope?.(s.off ? null : s.node != null ? 'node:' + s.node : s.part, s.field === 'current' ? 'i' : 'v', { title: s.title, label: s.label, note: s.note, window: s.window, marks: s.marks || s.compare, compare: s.compare, change: s.change, place: s.place, size: s.size, reading: s.reading ?? true, clock: s.clock ?? true });
      if (on || had) event('probe', { on: Boolean(on), ...(on && { part: s.part ?? null, node: s.node ?? null }) });
      if (framed) director.frame(framed.target, { ...moveTiming('arrival'), zoom: framed.zoom ?? 1, pan: framed.pan ?? null, alone: framed.alone ?? false });
    },
    // M15: in focus, then into its holes (`enter`: drop from `height` mm, the default 12; fade;
    // cut) along its move; landed, a hit. `dark` (default true): no current while it comes in.
    insert: (s) => {
      if (!page.data.parts[s.part]) return;
      page.state.node = null;
      page.state.focus.add(s.part);
      if (page.told !== undefined) page.told = s.part;
      applyFocus(page);
      const { ms, ease } = timing(s);
      if (!(ms > 0) || s.enter === 'cut') return;
      const dark = s.dark !== false;
      if (dark) {
        aloft.add(s.part);
        lights(false);
        dots(0);
      }
      director.tween((e) => {
        if (e < 1) return enterPart(s.part, s.enter ?? 'drop', ease(e), s.height ?? INSERT.mm);
        enterPart(s.part, s.enter ?? 'drop', 1, 0);
        if (dark) release(s.part);
      }, { ms, ease: (k) => k });
    },
    // M4, M5: every part listed (all, in the circuit's order, by default) leaves the board, then
    // each comes in `gap` ms after the one before, in `ms`, along the step's move: a part as
    // `enter` says (drop from `height` mm, fade, cut), a wire as `wire` says (draw from the end
    // `from` names, fade, cut). A part listed as { part, enter, wire, from } has its own. `dark`
    // (default true): no current until the last one is in.
    assemble: (s) => {
      const list = (s.parts ?? Object.keys(page.data.parts).filter((id) => !landed.has(id))).map((p) => (typeof p === 'string' ? { part: p } : p)).filter((p) => page.data.parts[p.part]);
      if (reduced || !list.length) return;
      const gap = s.gap ?? ASSEMBLE.gap;
      const each = s.ms ?? ASSEMBLE.ms;
      const total = (list.length - 1) * gap + each;
      const ease = moveTiming(s.move ?? 'arrival', undefined, s.curve).ease;
      const height = s.height ?? INSERT.mm;
      const state = list.map(() => 'out');
      const dark = s.dark !== false;
      const key = {};
      if (dark) {
        aloft.add(key);
        lights(false);
        dots(0);
      }
      for (const { part } of list) {
        building.add(part);
        showPart(page, part, 0);
      }
      director.tween((e) => {
        const t = e * total;
        list.forEach((p, k) => {
          const local = each > 0 ? (t - k * gap) / each : t >= k * gap ? 1 : -1;
          if (local < 0 || state[k] === 'in') return;
          const done = local >= 1;
          const at = done ? 1 : ease(local);
          if (isWire(page, p.part)) {
            const how = p.wire ?? s.wire ?? 'draw';
            if (how === 'fade') showPart(page, p.part, at);
            else {
              showPart(page, p.part, 1);
              traceWire(page, p.part, how === 'cut' ? 1 : at, p.from ?? s.from ?? 'start');
            }
          } else enterPart(p.part, p.enter ?? s.enter ?? 'drop', at, height);
          if (done) {
            state[k] = 'in';
            building.delete(p.part);
          }
        });
        if (e >= 1 && dark) release(key);
      }, { ms: total, ease: (k) => k });
    },
    pulse: (s) => pulse(s, timing(s).ms),
    // A card: the sentence (and its second line) alone over the whole screen, in the caption's face,
    // large; in along `enter` (a fade by default), whole for `hold` ms, then out. It covers what is
    // under it and leaves it as it was.
    card: (s) => {
      const id = ++cardTween;
      const inMs = reduced || s.enter === 'cut' ? 0 : (s.in ?? CARD.in);
      const outMs = reduced ? 0 : (s.out ?? CARD.out);
      const hold = s.hold ?? CARD.hold;
      const inText = emphasize(cardText, s.text, s.em);
      emphasize(cardLine, s.line ?? '', inText ? null : s.em);
      cardLine.hidden = !s.line;
      card.hidden = false;
      event('card', { on: true });
      const rise = s.enter === 'rise';
      const show = (k) => {
        card.style.opacity = k >= 1 ? '' : k.toFixed(3);
        for (const p of [cardText, cardLine]) p.style.transform = rise && k < 1 ? 'translateY(' + (CAPTION.rise * (1 - k)).toFixed(2) + '%)' : '';
      };
      show(inMs > 0 ? 0 : 1);
      const ease = moveTiming('arrival').ease;
      const total = inMs + hold + outMs;
      director.tween((e) => {
        if (id !== cardTween) return;
        const ms = e * total;
        if (ms < inMs) return show(ease(ms / inMs));
        if (ms < inMs + hold || !(outMs > 0)) {
          show(1);
          if (e < 1) return;
        } else if (e < 1) {
          card.style.opacity = (1 - (ms - inMs - hold) / outMs).toFixed(3);
          return;
        }
        card.hidden = true;
        card.style.opacity = '';
        event('card', { on: false });
      }, { ms: total, ease: (k) => k });
    },
    // A part's short label, the one a recording keeps, in other words ("": none).
    label: (s) => {
      if (page.data.parts[s.part]) relabel(s.part, s.text);
    },
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
    // A nudge: up a few mm in the first part of its time, a rest, and back along the opposite curve,
    // from wherever it was (a raised part comes back up there). The focus and the told label stay
    // as they are; under the veil the part is drawn over it only while it moves (focus.js).
    nudge: (s) => {
      const id = s.part;
      if (!page.data.parts[id] || reduced) return;
      const mm = s.mm ?? NUDGE.mm;
      const up = bezier(s.curve ?? NUDGE.curve);
      const base = page.lifted?.get(id) ?? 0;
      page.nudged ??= new Set();
      page.nudged.add(id);
      applyFocus(page);
      director.tween((e) => {
        const k = e < NUDGE.rise ? up(e / NUDGE.rise) : e > 1 - NUDGE.rise ? up((1 - e) / NUDGE.rise) : 1;
        liftPart(page, id, base + mm * (e >= 1 ? 0 : k));
        if (e < 1) return;
        page.nudged.delete(id);
        applyFocus(page);
      }, { ms: s.ms ?? NUDGE.ms, ease: (k) => k });
    },
    // M17: the part alone on a pedestal (mode part), framed in the middle without its label (`zoom`),
    // raised SCENE.mm; the board and the other parts fade along the move and are then not drawn.
    // Mode board: back to the board as a land does, the camera where it is.
    scene: (s) => {
      litDone(true);
      if (s.mode === 'board') return toBoard(s, false);
      const id = s.part;
      if (!page.data.parts[id]) return;
      const { ms, ease } = timing(s);
      // The frame first, while the part is drawn on its board (a layer not drawn measures nothing).
      // The part alone in the middle of the free area: it is what is told (the caption names it, so its
      // short label stays away on the pedestal) and the pinout fits around it.
      framed = { target: id, zoom: s.zoom ?? 1, alone: true };
      director.frame(id, { ms, ease, zoom: s.zoom ?? 1, alone: true });
      // `push`: the camera keeps closing in until the next step that moves it, so the hook is never still
      // (measured now, while the part is on its board and in its holes, as the frame above).
      if (s.push != null && !reduced) {
        const next = steps.find((x) => x !== s && x.at > s.at && ['frame', 'land', 'scene'].includes(x.do));
        const left = next ? next.at - director.time : MOVES.push.ms;
        const pushMs = Math.min(SCENE_ENTER.pushMax, Math.max(0, left));
        if (pushMs > 0) director.frame(id, { ms: pushMs, ease: moveTiming('push').ease, zoom: s.push, alone: true });
      }
      pedestal = id;
      landed.delete(id);
      // `light`: a soft light of that colour on the pedestal under the part (a hook that reads as a
      // thumbnail: the chip of a blinking circuit in a red glow). It goes with the pedestal.
      page.state.node = null;
      focusOn([id]);
      // After the focus: its copy exists, and the light goes under it.
      sceneLight(id, s.light == null ? null : (PULSE_COLORS[s.light] ?? s.light));
      sceneRule.textContent = 'main[data-scene] > svg > .lights > :not([data-glow="' + quote(id) + '"]), main[data-scene] > svg > :is(.spotlabels, .shortlabels) > [data-part="' + quote(id) + '"] { display: none !important; }';
      const from = page.lifted?.get(id) ?? 0;
      const enter = () => {
        page.main.dataset.scene = 'part';
        sceneFade(1);
      };
      // `enter` drop: the part falls onto the pedestal with a small bounce (after the board has gone).
      const drop = s.enter === 'drop' && !reduced;
      director.tween((e) => {
        if (!drop) liftPart(page, id, from + (SCENE.mm - from) * e);
        if (e < 1) return sceneFade(1 - e);
        enter();
      }, { ms, ease });
      if (drop) {
        liftPart(page, id, SCENE.mm + SCENE_ENTER.drop);
        const fall = bezier(SCENE_ENTER.curve);
        director.tween((e) => liftPart(page, id, SCENE.mm + SCENE_ENTER.drop * (1 - fall(e))), { ms: Math.max(ms, SCENE_ENTER.ms), ease: (k) => k });
      }
    },
    // M18: the board rises under the part (a travel by default).
    land: (s) => toBoard(s, true),
    // M21: the part on the bench (its pins' callouts go: the pads take the room under it), or off.
    bench: (s) => {
      if (!s.on) return bench.clear();
      if (!page.data.pinouts?.[page.state.view]?.[s.part]) return;
      unpin();
      // A tall part leaves its bench no room under it: the camera takes it up by what is missing,
      // along the same move (never past the free area's top: the part stays whole).
      const up = bench.overflow(s.part);
      const r = page.current().getBoundingClientRect();
      const part = up > 0 && partsRect(page, [s.part]);
      const room = part ? part.top - r.top - (page.inset?.()?.top ?? 0) * r.height : 0;
      const shift = Math.min(up, Math.max(0, room));
      if (shift > 0 && page.box) {
        const k = Math.max(page.box[2] / r.width, page.box[3] / r.height);
        director.frame([page.box[0], page.box[1] + shift * k, page.box[2], page.box[3]], timing(s));
      }
      director.tween(bench.show(s.part), timing(s));
    },
    // M22: the part's schematic symbol beside it, its terminals joined to the pins for a moment.
    symbol: (s) => showFigure(s, 'symbol'),
    // M23: what goes on inside the part, drawn from the simulation on every tick.
    inside: (s) => showFigure(s, 'inside'),
    // M19, M20: a pin lit (`pin`, resolved by src/tour.js to its part and index), the package's mark
    // (`mark`: the part), or all of them off (`off`); each comes in along its move (an arrival).
    pin: (s) => {
      if (s.off) return unpin();
      if (bench.part) bench.clear(); // the callouts take the room under the part back
      const id = s.mark ?? s.part;
      if (!id || !page.data.pinouts?.[page.state.view]?.[id] || (s.mark == null && !(s.index >= 0))) return;
      const move = s.mark != null ? pins.mark(id) : pins.light(id, s.index, s.text);
      pinRule.textContent = pins.parts.map((p) => 'main > svg > :is(.spotlabels, .shortlabels) > [data-part="' + quote(p) + '"]').join(', ') + ' { display: none !important; }';
      const { ms, ease } = timing(s);
      director.tween(move, { ms, ease });
    },
    'wait-until': (s) => {
      const test = () => {
        const v = readingOf(s.part, s.field);
        return typeof v === 'number' && (s.above != null ? v > s.above : v < s.below);
      };
      director.hold(test, s.max ?? WAIT_MS);
    },
  };

  // A recording's first frame is its first moment's (never the circuit as the page opens, which
  // gives the result away and may become the thumbnail): when the timeline starts after 0, the
  // steps of its first moment that set what is seen (PRIMED) run at 0, as cuts; at 0, a scene and
  // a caption of that moment are cuts too (the board does not fade out, the caption is whole on
  // the first frame). Their other moves (a scene's enter and push) still play.
  const PRIMED = new Set(['scene', 'frame', 'focus', 'flow', 'flip', 'label', 'caption', 'probe']);
  const firstAt = steps.length ? Math.min(...steps.map((s) => s.at)) : 0;
  const primed = (s) => s.at === firstAt && PRIMED.has(s.do) && (firstAt > 0 || s.do === 'scene' || s.do === 'caption');
  const asCut = (s) => ({ ...s, move: s.move === 'push' && s.do === 'frame' ? s.move : 'cut', ...(s.do === 'flow' && { ramp: 0 }), ...(s.do === 'caption' && { enter: 'cut' }) });
  // The told part's label in a recording, never smaller on screen than LABEL_MIN_PX at 1080 px of the
  // frame's short side: scaled about its anchor (its copy over the veil; the one framed is not).
  function sizeLabel() {
    const svg = page.current();
    const el = svg?.querySelector(':scope > .spotlabels > .short');
    if (!el || !page.box) return;
    const r = svg.getBoundingClientRect();
    const unit = r.width > 0 ? Math.min(r.width / page.box[2], r.height / page.box[3]) : 0;
    const size = Number(el.getAttribute('font-size')) || 0;
    if (!(unit > 0 && size > 0)) return;
    const want = (LABEL_MIN_PX * Math.min(innerWidth, innerHeight)) / 1080;
    const k = Math.max(1, want / (size * unit));
    const x = Number(el.getAttribute('x')) || 0;
    const y = Number(el.getAttribute('y')) || 0;
    if (k > 1.001) el.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${k.toFixed(3)}) translate(${(-x).toFixed(2)} ${(-y).toFixed(2)})`);
    else el.removeAttribute('transform');
  }

  let playing = false;
  let again = null; // a landing's next play, after its pause
  const log = []; // in a recording: each step as it ran, at the director's time (a wait moves the later ones)
  function stop() {
    clearTimeout(again);
    again = null;
    if (!playing) return;
    playing = false;
    director.stop();
    lower();
    lit = null;
    held = false;
    dim(0);
    leaveScene();
    unpin();
    bench.clear();
    figure.clear();
    landed.clear();
    aloft.clear();
    lights(true);
    dots(1);
    fade(1);
    for (const old of page.main.querySelectorAll('.tour-caption.leaving, svg > .pulse')) old.remove();
    box.hidden = true;
    card.hidden = true;
    cardTween++;
    shown = null;
    document.body.classList.remove('touring', 'focus-solid');
    page.flowScope = 'all';
    page.flowSense = null;
    page.flowParts = null;
    delete page.main.dataset.sense;
    page.nudged?.clear();
    scopeFlow(page);
    page.direct(false);
  }
  function play() {
    stop();
    leaveScene();
    unpin();
    bench.clear();
    figure.clear();
    landed.clear();
    lit = null;
    held = false;
    dim(0);
    playing = true;
    page.direct(true);
    document.body.classList.add('touring');
    select(page, null);
    log.length = 0;
    events.length = 0;
    ledsOn.clear();
    counting.clear();
    shownNumber = null;
    director.start(
      steps.map((s) => {
        const first = recording && primed(s);
        return {
          at: first ? 0 : s.at,
          run: () => {
            if (recording) log.push({ t: director.time, step: first ? { ...s, primed: true } : s });
            act[s.do]?.(first ? asCut(s) : s);
          },
        };
      }),
    );
    if (recording) director.after(counts);
    if (recording) director.after(leds);
    director.after(senseTick);
    if (recording) director.after(sizeLabel);
    director.after(pins.draw);
    director.after(bench.draw);
    director.after(figure.draw);
    let back = false; // a landing's camera on its way back to the first frame
    const startLayer = page.state.layer; // a landing leaves the layer as it found it
    const startControls = landing ? director.controls() : []; // and the controls too
    director.after(() => {
      showValue();
      // The last move has ended and nothing waits: the page stays as the tour left it. A landing
      // first takes the camera back to where the tour starts, the caption fading out on the way.
      if (!director.busy && director.time >= end && landing && !reduced && !back) {
        back = true;
        const first = steps.find((s) => s.do === 'frame');
        if (first) director.frame(first.target, { ms: LANDING.back, ease: calm, zoom: first.zoom ?? 1, pan: first.pan ?? null });
        director.tween((e) => {
          box.style.opacity = String(1 - e);
        }, { ms: LANDING.back / 2, ease: calm });
        // The controls the tour moved go back to where they were, along the same glide.
        const now = new Map(director.controls().map((c) => [`${c.id}|${c.field}`, c.value]));
        for (const c of startControls) {
          if (now.get(`${c.id}|${c.field}`) !== c.value) director.set(c.id, c.field, c.value, { ms: LANDING.back, ease: calm });
        }
        // The current's dots fade out and the parts come back solid, as on the first frame.
        if (page.state.layer !== startLayer) {
          director.tween((e) => {
            dots(1 - e);
            if (e < 1) return;
            page.state.layer = startLayer;
            page.show();
            dots(1);
          }, { ms: LANDING.back / 2, ease: calm });
        }
        return;
      }
      if (!director.busy && director.time >= end) {
        box.style.opacity = '';
        playing = false;
        director.stop();
        if (!recording) {
          lower();
          leaveScene();
          box.hidden = true;
          document.body.classList.remove('touring', 'focus-solid');
        }
        page.direct(false);
        // A landing loops (not under reduced motion: there it played because it was asked to).
        if (landing && !reduced) again = setTimeout(play, LANDING_PAUSE);
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
  // A page whose timeline has no steps (only the trial of the part's view, focus-view.js) offers no tour.
  if (steps.length) page.menuAdd?.(item);
  if (!recording && !landing) {
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
    // The moments a sound may go with (event()).
    get events() {
      return events;
    },
    // One step at once, outside a timeline (the trial of the part's view in the page, D7;
    // focus-view.js): the director has the time while `on`, and draws the pinout, bench and figure.
    hold(on) {
      if (on) {
        page.direct(true);
        director.after(pins.draw);
        director.after(bench.draw);
        director.after(figure.draw);
        return;
      }
      unpin();
      bench.clear();
      figure.clear();
      leaveScene();
      director.stop();
      page.direct(false);
    },
    run: (s) => act[s.do]?.({ move: DEFAULT_MOVES[s.do] ?? 'cut', ...s }),
  };
}
