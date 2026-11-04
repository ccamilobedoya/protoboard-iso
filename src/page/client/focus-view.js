// A part's view in the page (F5, a video about one part; docs/en/component-focus.md): the part alone on
// its pedestal, driven by a finger, with the same steps a video runs (tour.js `run`, `hold`). Only in a
// page made with it (page.focusView in the circuit, or renderPage's `focusView`); a recording or a
// landing never has it.
//
// The card of a part offers *See the part up close* as its first row. On the pedestal a bar at the
// bottom names the part and holds two segmented controls, one per room around the part: under it the
// pins or the bench, beside it the symbol or the inside view (one of each at a time, as in a video);
// a pressed segment pressed again turns its room off. With the inside view on, a legend above the bar
// says what its colours, arrows and blocks mean (a video says it in its captions; the page has none).
// Taps on the drawing do nothing while the part is up, but it can be dragged and zoomed as on the board,
// its texts going with it (each row by its leader, shrunk with the others and cut with "…" at the
// screen's edge only when it still does not fit, as in a video).
// Back, or Escape, lands the part, the camera keeping it where it is on screen while the board comes
// up around it.

import { select } from './card.js';
import { iconSvg } from './icons.js';
import { DOT_COLOR, HEAT_COLOR, VOLTAGE_COLORS } from '../../sim/look.js';

// The legend of each inside view: [swatch, text key] (the swatch: a class of the figure's own colours).
const LEGENDS = {
  bjt: [['n', 'n'], ['p', 'p'], ['arrow', 'arrow'], ['', 'region']],
  mosfet: [['n', 'n'], ['p', 'p'], ['oxide', 'oxide'], ['channel', 'channel'], ['arrow', 'arrow']],
  led: [['chip', 'chip'], ['', 'lens']],
  timer: [['comparator', 'comparators'], ['latch', 'latch']],
  resistor: [['film', 'film'], ['heat', 'heat'], ['arrow', 'arrow'], ['', 'figures']],
  capacitor: [['plate', 'plates'], ['pos', 'pos'], ['neg', 'neg'], ['arrow', 'arrow'], ['', 'state']],
  inductor: [['coil', 'coil'], ['field', 'field'], ['arrow', 'arrow'], ['', 'state']],
  diode: [['p', 'p'], ['n', 'n'], ['depletion', 'depletion'], ['arrow', 'arrow'], ['heat', 'heat'], ['', 'state']],
  zener: [['p', 'p'], ['n', 'n'], ['depletion', 'depletion'], ['arrow', 'arrow'], ['heat', 'heat'], ['', 'state']],
  bridge: [['conducting', 'conducting'], ['arrow', 'arrow'], ['heat', 'heat'], ['', 'state']],
  potentiometer: [['track', 'track'], ['wiper', 'wiper'], ['arrow', 'arrow'], ['', 'figures']],
  thermistor: [['bead', 'bead'], ['heat', 'heat'], ['arrow', 'arrow'], ['', 'figures']],
  ldr: [['cds', 'track'], ['light', 'light'], ['arrow', 'arrow'], ['', 'figures']],
  button: [['metal', 'pieces'], ['dome', 'dome'], ['arrow', 'arrow'], ['', 'figures']],
  switch: [['blade', 'blade'], ['metal', 'contacts'], ['arrow', 'arrow'], ['', 'figures']],
  regulator: [['pass', 'pass'], ['heat', 'heat'], ['comparator', 'amp'], ['headroom', 'headroom'], ['arrow', 'arrow'], ['', 'state']],
  battery: [['cell', 'cells'], ['soc', 'charge'], ['film', 'resistance'], ['arrow', 'arrow'], ['', 'figures']],
  buzzer: [['coil', 'coil'], ['disc', 'disc'], ['sound', 'sound'], ['arrow', 'arrow'], ['', 'state']],
  rgb: [['chip', 'chips'], ['', 'mix'], ['', 'figures']],
  segments: [['chip', 'lit'], ['', 'letters'], ['', 'state']],
};
// Swatches in the figure's own colours that live in the script (sim/look.js), not in the style.
const INLINE = { arrow: DOT_COLOR, heat: HEAT_COLOR, pos: VOLTAGE_COLORS.positive, neg: VOLTAGE_COLORS.negative };
const MARGIN = 12; // px between the bar (and legend) and the free area

export function setupFocusView(page, { tour, t }) {
  let on = null; // the part on the pedestal
  const shown = { pins: false, bench: false, symbol: false, inside: false };
  const make = (tag, cls, parent) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    parent?.appendChild(e);
    return e;
  };

  // The legend (with the inside view) and the bar, at the bottom of the drawing.
  const dock = make('div', 'focus-dock', page.main);
  dock.hidden = true;
  const legend = make('section', 'focus-legend', dock);
  legend.hidden = true;
  const bar = make('div', 'focus-bar', dock);
  bar.setAttribute('role', 'toolbar');
  // The dock's taps are its own: the drawing under it would take one as a tap on nothing.
  for (const type of ['pointerdown', 'pointerup', 'click', 'dblclick']) dock.addEventListener(type, (e) => e.stopPropagation());
  const head = make('div', 'focus-head', bar);
  const back = make('button', 'focus-back', head);
  back.type = 'button';
  back.innerHTML = iconSvg('back');
  make('span', null, back).textContent = t('page.tour.view.back');
  back.setAttribute('aria-label', t('page.tour.view.backFull'));
  back.addEventListener('click', () => leave());
  const title = make('span', 'focus-title', head);
  const groups = make('div', 'focus-groups', bar);
  const buttons = {};
  const group = (label, keys) => {
    const g = make('div', 'segmented', groups);
    g.setAttribute('role', 'group');
    g.setAttribute('aria-label', label);
    for (const key of keys) {
      const b = make('button', null, g);
      b.type = 'button';
      b.textContent = t(`page.tour.view.${key}`);
      b.addEventListener('click', () => toggle(key));
      buttons[key] = b;
    }
  };
  group(t('page.tour.view.under'), ['pins', 'bench']);
  group(t('page.tour.view.beside'), ['symbol', 'inside']);
  const ROOM = { pins: 'bench', bench: 'pins', symbol: 'inside', inside: 'symbol' };

  const data = () => page.data.pinouts?.[page.state.view]?.[on];
  const sync = () => {
    for (const key of Object.keys(shown)) buttons[key].setAttribute('aria-pressed', String(shown[key]));
    const had = !legend.hidden;
    fillLegend();
    // The legend came or went: the free area changed, the part is framed again in what is left.
    if (had !== !legend.hidden) {
      tour.run({ do: 'frame', target: on, zoom: 0.7, alone: true, move: 'arrival' });
      settle();
    }
  };

  // The steps of a video, one room at a time: turning one on turns its neighbour in the room off.
  const off = { pins: { do: 'pin', off: true }, bench: { do: 'bench', on: false }, symbol: { do: 'symbol', on: false }, inside: { do: 'inside', on: false } };
  function toggle(key) {
    if (!on) return;
    if (shown[key]) {
      tour.run(off[key]);
      shown[key] = false;
      return sync();
    }
    if (shown[ROOM[key]]) {
      tour.run(off[ROOM[key]]);
      shown[ROOM[key]] = false;
    }
    if (key === 'pins') {
      data().pins.forEach((pin, index) => tour.run({ do: 'pin', part: on, index }));
      if (data().mark) tour.run({ do: 'pin', mark: on });
    } else tour.run({ do: key, part: on, on: true });
    // A bench may take a tall part up: the texts settle on the drawing once it has.
    if (key === 'bench') settle();
    shown[key] = true;
    sync();
  }

  function fillLegend() {
    const kind = shown.inside ? data()?.inside?.kind : null;
    legend.hidden = !LEGENDS[kind];
    if (legend.hidden) return;
    legend.textContent = '';
    make('h3', null, legend).textContent = t('page.tour.legend.title');
    const list = make('ul', null, legend);
    for (const [swatch, key] of LEGENDS[kind]) {
      const li = make('li', null, list);
      const s = make('span', `swatch ${swatch}`, li);
      if (INLINE[swatch]) s.style.background = INLINE[swatch];
      // An LED's chip in its colour; a part of several LEDs, its chips' colours side by side.
      if (swatch === 'chip') {
        const inside = data().inside;
        const colors = inside.chips ? [...new Set(inside.chips.map((c) => c.color))] : [inside.color];
        s.style.background = colors.length > 1 ? `linear-gradient(90deg, ${colors.join(', ')})` : colors[0];
      }
      if (!swatch) s.hidden = true;
      make('span', null, li).textContent = t(`page.tour.legend.${kind}.${key}`);
    }
  }

  // The free area: the screen above the dock (its height measured), a little margin around.
  const inset = () => {
    const m = page.main.getBoundingClientRect();
    const d = dock.getBoundingClientRect();
    const bottom = m.height > 0 && d.height > 0 ? Math.min(0.5, (m.bottom - d.top + MARGIN) / m.height) : 0.2;
    return { top: 0.06, right: 0.04, bottom, left: 0.04 };
  };

  // The texts follow the camera while the view moves it, then stay on the drawing (page.layoutBox,
  // pinout.js) so the learner's own drags and zooms carry them.
  let settling = null;
  function settle(ms = 800) {
    page.layoutBox = null;
    clearTimeout(settling);
    settling = setTimeout(() => {
      if (on) page.layoutBox = page.box?.slice() ?? null;
    }, ms);
  }

  // Up close the page keeps the phone's scale: a page zoomed by the browser before (or by a pinch that
  // began on the dock) would push the dock past the screen. Setting a maximum scale brings Safari back to
  // 1; leaving puts the page's own viewport back.
  const viewport = document.querySelector('meta[name="viewport"]');
  const own = viewport?.getAttribute('content');
  const scale = (fixed) => viewport?.setAttribute('content', fixed ? 'width=device-width, initial-scale=1, maximum-scale=1' : own);

  function enter(id) {
    select(page, null);
    on = id;
    for (const k of Object.keys(shown)) shown[k] = false;
    title.textContent = page.data.parts[id]?.title ?? id;
    buttons.symbol.hidden = !data()?.symbol;
    buttons.inside.hidden = !data()?.inside;
    dock.hidden = false;
    document.body.classList.add('focus-view');
    scale(true);
    page.inset = inset;
    page.focusing = true;
    tour.hold(true);
    // A little farther than a video's pedestal: the pins and the bench need their room on a phone.
    tour.run({ do: 'scene', mode: 'part', part: id, zoom: 0.7 });
    settle();
    sync();
    buttons.pins.focus({ preventScroll: true });
    // What the part is comes first: its pins, once it is up.
    setTimeout(() => on === id && !shown.pins && !shown.bench && toggle('pins'), 450);
  }
  function leave() {
    if (!on) return;
    const id = on;
    on = null;
    for (const key of Object.keys(shown)) if (shown[key]) tour.run(off[key]);
    dock.hidden = true;
    // Down to its holes with the camera following it: the part stays where it is on screen and the
    // board comes up around it; no frame after that, so nothing jumps.
    tour.run({ do: 'land', part: id });
    clearTimeout(settling);
    page.layoutBox = null;
    setTimeout(() => {
      tour.hold(false);
      delete page.inset;
      page.focusing = false;
      document.body.classList.remove('focus-view');
      scale(false);
    }, 1600);
  }

  // *See the part up close*, first in the card of a part the view can show.
  page.buildFocusView = (info, id) => {
    if (!page.data.pinouts?.[page.state.view]?.[id]) return;
    const b = make('button', 'focus-open');
    b.type = 'button';
    b.innerHTML = iconSvg('pedestal');
    make('span', null, b).textContent = t('page.tour.view.open');
    b.addEventListener('click', () => enter(id));
    info.querySelector('.head')?.after(b);
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && on) leave();
  });
}
