// The browser script of the embeddable page (see ../../page.js), bundled into the page as one
// classic script by src/node/bundle.js. No dependencies: it must run inside an iframe or a wiki
// "web view" as it is.
//
// What it reads: the inline SVGs (one per view; data-board / data-parts hold the two frames),
// and #page-data, a JSON with per part { title, type, value, here, nodes, cols, rows, pins, sim },
// per strip in use (nodes) { title, about, leads, parts, cols, rows, sim } and where its holes are
// on screen in each view (strips, hits), the explanations (explain), the probe captions (probes),
// the initial focus and UI texts.
//
// State: view, fit, labels, results (on when the circuit asks), layer (parts | flow),
// speed (linear | log: how dot speed follows the current), focus (set of part ids), node (the
// tapped strip, or null), ghost (see-through ids). Everything visual is CSS classes or rules; the script never redraws the scene.
//
// Modules: view.js (frame, pan, zoom), focus.js (spotlight, CSS rules), card.js (the card),
// tooltip.js (probes and explanations); live.js (the running simulation, with controls.js and
// limits.js) only when the circuit asks for results or the current layer. They share one `page` object. Entries: static-page.js
// and live-page.js call startPage with the extensions they carry.

import { numbers, setBox, setupView, stripAt, frameTo, flipView, flipFrame, partsRect } from './view.js';
import { applyFocus } from './focus.js';
import { select, selectNode, refreshCard, refreshNotes } from './card.js';
import { tapTag, setupTooltip } from './tooltip.js';
import { setupBar } from './bar.js';
import { setupInspector } from './inspector.js';

// ?theme=light|dark|auto in the link wins over the circuit's page.theme (<html data-theme>).
function applyTheme(doc, search) {
  const asked = new URLSearchParams(search).get('theme');
  if (!['light', 'dark', 'auto'].includes(asked)) return;
  if (asked === 'auto') delete doc.documentElement.dataset.theme;
  else doc.documentElement.dataset.theme = asked;
}

export function startPage(extensions = []) {
  applyTheme(document, location.search);
  const main = document.querySelector('main');
  const svgs = [...main.querySelectorAll(':scope > svg')]; // the views (icons are svg too)
  const data = JSON.parse(document.getElementById('page-data').textContent);
  const state = { view: svgs[0].dataset.view, fit: document.body.dataset.fit, labels: true, results: document.body.dataset.results === 'on', layer: 'parts', speed: 'linear', focus: new Set(data.focus), node: null, ghost: new Set() };
  const page = {
    main,
    svgs,
    data,
    state,
    buttons: [...document.querySelectorAll('nav button[data-key]')],
    dynamic: document.getElementById('dynamic'),
    probeStyle: document.getElementById('probe'),
    info: document.querySelector('.info'),
    side: document.querySelector('.side'), // panels on the right (live page: warnings, controls)
    zoom: document.querySelector('.zoom'), // zoom buttons, bottom right
    gestureHint: document.querySelector('.gesture-hint'), // "use two fingers…" when embedded
    inspector: document.querySelector('.inspector'), // holds the card (.info) and the circuit's panels (.side)
    inChrome: (el) => [page.inspector ?? page.info, page.inspector ?? page.side, page.zoom].some((c) => c && c.contains(el)),
    tooltip: document.querySelector('.tooltip'),
    current: () => svgs.find((s) => s.dataset.view === state.view),
    box: null,
    onShow: [], // extensions that react to a change of view, layer or speed
    show: () => show(),
    refreshCard: () => refreshCard(page),
    refreshNotes: () => refreshNotes(page),
  };
  const toggles = ['labels'];

  // What is on screen now: the frame changes only when the view or the framing does (U5: toggling
  // the labels or a layer keeps where the learner was looking).
  let shown = { view: null, fit: null };
  const same = (a, b) => a.every((n, i) => Math.abs(n - b[i]) < 0.5);
  function show() {
    for (const hook of page.onShow) hook();
    const fitBox = () => numbers(page.current().dataset[state.fit]);
    if (shown.view && shown.view !== state.view) {
      const from = svgs.find((s) => s.dataset.view === shown.view);
      const old = page.box.slice();
      const untouched = shown.fit === state.fit && same(old, numbers(from.dataset[shown.fit]));
      const r = state.focus.size ? partsRect(page, [...state.focus], from) : null;
      const anchor = r && [(r.left + r.right) / 2, (r.top + r.bottom) / 2];
      flipView(page, from, page.current(), () => (untouched && !anchor ? setBox(page, fitBox()) : flipFrame(page, from, old, anchor)));
    } else {
      for (const s of svgs) s.toggleAttribute('hidden', s.dataset.view !== state.view);
      if (!shown.view) setBox(page, fitBox());
      else if (shown.fit !== state.fit) frameTo(page, fitBox());
    }
    shown = { view: state.view, fit: state.fit };
    document.body.classList.toggle('no-labels', !state.labels);
    document.body.classList.toggle('show-results', state.results);
    document.body.classList.toggle('layer-flow', state.layer === 'flow');
    document.body.classList.toggle('speed-log', state.speed === 'log');
    // A button for two states (data-on / data-off), a plain toggle, a choice in the menu, a value.
    for (const b of page.buttons) {
      const key = b.dataset.key;
      if (b.dataset.on) b.setAttribute('aria-pressed', String(state[key] === b.dataset.on));
      else if (toggles.includes(key)) b.setAttribute('aria-pressed', String(state[key]));
      else if (b.getAttribute('role') === 'menuitemradio') b.setAttribute('aria-checked', String(state[key] === b.dataset.value));
      else b.setAttribute('aria-pressed', String(state[key] === b.dataset.value));
    }
  }
  for (const b of page.buttons) b.addEventListener('click', () => {
    const key = b.dataset.key;
    if (b.dataset.on) state[key] = state[key] === b.dataset.on ? b.dataset.off : b.dataset.on;
    else if (toggles.includes(key)) state[key] = !state[key];
    else state[key] = b.dataset.value;
    show();
  });

  setupView(page);
  setupTooltip(page);
  setupBar(page);
  setupInspector(page);
  // A tap: a result tag pins its probes (focus untouched), a part selects it, a strip in use
  // opens its card (found by where the tap is: the strips are under the parts), the board clears.
  main.addEventListener('click', (e) => {
    // A button in the card that rebuilt it (a pin opening its strip) is no longer in the page.
    if (page.dragged || !e.target.isConnected || page.inChrome(e.target)) return;
    if (tapTag(page, e.target)) return;
    const hit = e.target.closest && e.target.closest('[data-part]');
    if (hit) return select(page, hit.getAttribute('data-part'));
    const node = stripAt(page, e.clientX, e.clientY);
    if (node != null) return selectNode(page, node);
    select(page, null);
  });

  for (const extend of extensions) extend(page);
  document.querySelector('nav').hidden = false;
  show();
  if (state.focus.size === 1) select(page, [...state.focus][0]);
  else applyFocus(page);
}
