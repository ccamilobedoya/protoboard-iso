// The trial of a part's view in the page (D7, a video about one part; docs/en/component-focus.md): a
// minimal prototype, on only with ?focusView=1 in the link and a page made with it (page.js's
// `focusView`), to try on a phone and a tablet whether the pedestal belongs in the page too. Not
// polished, not part of the kit yet: the decision after the trial says whether it becomes F5.
//
// A part's card gets *See the part*; it puts the part alone on its pedestal (the timeline's `scene`)
// with a bar of buttons under it: Pins, Bench, Symbol, Inside, each a toggle that runs the same steps a
// video does (tour.js `run`), and Back, which lands the part on the board. The circuit keeps running
// and the card's controls stay as they were.

import { select } from './card.js';

export const wantsFocusView = (search) => new URLSearchParams(search).get('focusView') === '1';

// The area the view leaves free for the part and its texts: the bar takes the bottom.
const INSET = { top: 0.08, right: 0.05, bottom: 0.17, left: 0.05 };

export function setupFocusView(page, { tour, t }) {
  let on = null; // the part on the pedestal
  const shown = { pins: false, bench: false, symbol: false, inside: false };
  const bar = document.createElement('div');
  bar.className = 'focus-bar';
  bar.hidden = true;
  bar.setAttribute('role', 'toolbar');
  page.main.appendChild(bar);
  // The bar's taps are its own: the drawing under it would take one as a tap on nothing and close the focus.
  for (const type of ['pointerdown', 'pointerup', 'click']) bar.addEventListener(type, (e) => e.stopPropagation());
  const buttons = {};
  const button = (key, label, act) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', act);
    bar.appendChild(b);
    buttons[key] = b;
  };
  const sync = () => {
    for (const key of Object.keys(shown)) buttons[key]?.setAttribute('aria-pressed', String(shown[key]));
  };
  const has = (what) => Boolean(page.data.pinouts?.[page.state.view]?.[on]?.[what]);

  // Each toggle runs the video's steps; the pinout and the bench share the room under the part, and the
  // symbol and the inside view the room beside it (tour.js turns the other one off).
  const pins = () => {
    if (shown.pins) tour.run({ do: 'pin', off: true });
    else {
      const pinout = page.data.pinouts[page.state.view][on];
      pinout.pins.forEach((pin, index) => tour.run({ do: 'pin', part: on, index }));
      if (pinout.mark) tour.run({ do: 'pin', mark: on });
      shown.bench = false;
    }
    shown.pins = !shown.pins;
    sync();
  };
  const bench = () => {
    tour.run({ do: 'bench', part: on, on: !shown.bench });
    shown.bench = !shown.bench;
    if (shown.bench) shown.pins = false;
    sync();
  };
  const figure = (what, other) => () => {
    if (!has(what)) return;
    tour.run({ do: what, part: on, on: !shown[what] });
    shown[what] = !shown[what];
    if (shown[what]) shown[other] = false;
    sync();
  };
  button('pins', t('page.tour.view.pins'), pins);
  button('bench', t('page.tour.view.bench'), bench);
  button('symbol', t('page.tour.view.symbol'), figure('symbol', 'inside'));
  button('inside', t('page.tour.view.inside'), figure('inside', 'symbol'));
  button('back', t('page.tour.view.back'), () => leave());

  function enter(id) {
    select(page, null);
    on = id;
    Object.keys(shown).forEach((k) => (shown[k] = false));
    page.inset = () => INSET;
    document.body.classList.add('focus-view');
    tour.hold(true);
    // A little farther than a video's pedestal: the pins and the bench need their room on a phone.
    tour.run({ do: 'scene', mode: 'part', part: id, zoom: 0.7 });
    buttons.symbol.hidden = !has('symbol');
    buttons.inside.hidden = !has('inside');
    bar.hidden = false;
    sync();
    // The pins at once: what the part is comes first.
    setTimeout(() => on === id && !shown.pins && pins(), 450);
  }
  function leave() {
    if (!on) return;
    const id = on;
    on = null;
    bar.hidden = true;
    for (const [what, step] of [['pins', { do: 'pin', off: true }], ['bench', { do: 'bench', on: false }], ['symbol', { do: 'symbol', on: false }], ['inside', { do: 'inside', on: false }]]) if (shown[what]) tour.run(step);
    tour.run({ do: 'land', part: id });
    // Landed, the camera goes back out to the whole circuit, then the page has its own time again.
    setTimeout(() => {
      delete page.inset;
      document.body.classList.remove('focus-view');
      tour.run({ do: 'frame', target: 'parts', move: 'arrival' });
    }, 1600);
    setTimeout(() => tour.hold(false), 2500);
  }

  // *See the part* in the card of a part the view can show.
  page.buildFocusView = (info, id) => {
    if (!page.data.pinouts?.[page.state.view]?.[id]) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'focus-open';
    b.textContent = t('page.tour.view.open');
    b.addEventListener('click', () => enter(id));
    info.appendChild(b);
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') leave();
  });
}
