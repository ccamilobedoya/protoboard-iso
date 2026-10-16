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

import { numbers, setBox, setupView, stripAt } from './view.js';
import { applyFocus } from './focus.js';
import { select, selectNode, refreshCard, refreshNotes } from './card.js';
import { tapTag, setupTooltip } from './tooltip.js';

export function startPage(extensions = []) {
  const main = document.querySelector('main');
  const svgs = [...main.querySelectorAll('svg')];
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
    tooltip: document.querySelector('.tooltip'),
    current: () => svgs.find((s) => s.dataset.view === state.view),
    box: null,
    onShow: [], // extensions that react to a change of view, layer or speed
    show: () => show(),
    refreshCard: () => refreshCard(page),
    refreshNotes: () => refreshNotes(page),
  };
  const toggles = ['labels'];

  function show() {
    for (const hook of page.onShow) hook();
    for (const s of svgs) s.toggleAttribute('hidden', s.dataset.view !== state.view);
    setBox(page, numbers(page.current().dataset[state.fit]));
    document.body.classList.toggle('no-labels', !state.labels);
    document.body.classList.toggle('show-results', state.results);
    document.body.classList.toggle('layer-flow', state.layer === 'flow');
    document.body.classList.toggle('speed-log', state.speed === 'log');
    for (const b of page.buttons) b.setAttribute('aria-pressed', String(toggles.includes(b.dataset.key) ? state[b.dataset.key] : state[b.dataset.key] === b.dataset.value));
  }
  for (const b of page.buttons) b.addEventListener('click', () => {
    if (toggles.includes(b.dataset.key)) state[b.dataset.key] = !state[b.dataset.key];
    else state[b.dataset.key] = b.dataset.value;
    show();
  });

  setupView(page);
  setupTooltip(page);
  // A tap: a result tag pins its probes (focus untouched), a part selects it, a strip in use
  // opens its card (found by where the tap is: the strips are under the parts), the board clears.
  main.addEventListener('click', (e) => {
    // A button in the card that rebuilt it (a pin opening its strip) is no longer in the page.
    if (page.dragged || !e.target.isConnected || page.info.contains(e.target) || page.side.contains(e.target)) return;
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
