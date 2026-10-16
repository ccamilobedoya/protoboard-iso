// The inspector (UX pass, U4): one box for what was tapped and for what concerns the whole circuit.
//
//   .inspector            data-tab="part" | "circuit", data-size="peek" | "half" | "full"
//     .grip               the handle of the bottom sheet (narrow screens)
//     .tabs               "Part" (or "Strip") and "Circuit", shown when both have something;
//                         the chevron collapses to peek or opens again
//     .info               the card of the tapped part or strip (card.js), with its own head
//     .side               the circuit's panels: controls, warnings, Falstad notes (live page)
//
// Wide screens (> 760 px): a panel on the right over the drawing; peek leaves only its head.
// Narrow screens: a bottom sheet in three heights, dragged with a finger (it follows 1:1, resists
// past its ends and lands where the release velocity throws it) or stepped by tapping its head.
// Whenever it opens over the selected parts, the frame moves so they stay in the free area.

import { panBy, partsRect } from './view.js';

const NARROW = '(max-width: 760px)';
const SUMMARY_HEIGHT = 24; // the summary line of a peeking sheet (style.js)

// Where a flick lands (Apple's projection, deceleration 0.998), and the soft end past a limit.
const project = (v) => ((v / 1000) * 0.998) / (1 - 0.998);
const rubber = (over, size) => (over * size * 0.55) / (size + 0.55 * Math.abs(over));

export function setupInspector(page) {
  const doc = page.main.ownerDocument;
  const win = doc.defaultView;
  const box = doc.querySelector('.inspector');
  if (!box) return;
  const tabs = box.querySelector('.tabs');
  const tabPart = tabs.querySelector('[data-tab="part"]');
  const tabCircuit = tabs.querySelector('[data-tab="circuit"]');
  const chevron = tabs.querySelector('.collapse');
  const grip = box.querySelector('.grip');
  const narrow = () => Boolean(win.matchMedia?.(NARROW).matches);

  const hasPart = () => !page.info.hidden;
  const hasCircuit = () => [...page.side.children].some((el) => !el.hidden);

  // Heights of the sheet (narrow screens), as how much of it shows above the bottom.
  const visible = (size) => {
    const H = page.main.getBoundingClientRect().height;
    if (size === 'full') return Math.round(H * 0.85);
    if (size === 'half') return Math.round(H * 0.5);
    // Peek: down to the end of the card's head (and, on a phone, the summary line under it, shown
    // only then, so measured by its height), or of the tabs.
    const top = box.getBoundingClientRect().top;
    const head = box.dataset.tab === 'part' ? page.info.querySelector('.head') : null;
    const summary = page.info.querySelector('.summary');
    const extra = head && narrow() && summary && !summary.hidden ? SUMMARY_HEIGHT : 0;
    const r = (head ?? tabs).getBoundingClientRect();
    return Math.max(56, Math.round(r.bottom - top + extra + 6));
  };
  const offsetOf = (size) => Math.max(0, box.getBoundingClientRect().height - visible(size));

  function place() {
    if (box.hidden) return;
    if (narrow()) {
      box.style.maxHeight = '';
      const offset = offsetOf(box.dataset.size);
      box.style.transform = `translateY(${offset}px)`;
      // The part of the sheet below the screen's edge: room at the end of the card and the panels,
      // so they scroll all the way into view.
      for (const el of [page.info, page.side]) el.style.paddingBottom = `${offset + 12}px`;
      const shown = visible(box.dataset.size);
      doc.body.classList.toggle('sheet-up', box.dataset.size !== 'peek');
      if (page.zoom) page.zoom.style.bottom = `${shown + 8}px`;
    } else {
      box.style.transform = '';
      for (const el of [page.info, page.side]) el.style.paddingBottom = '';
      box.style.maxHeight = box.dataset.size === 'peek' ? `${visible('peek')}px` : '';
      doc.body.classList.remove('sheet-up');
      if (page.zoom) page.zoom.style.bottom = '';
    }
    chevron?.setAttribute('aria-expanded', String(box.dataset.size !== 'peek'));
  }

  // Keep the selected parts out from under the inspector.
  function keepFree() {
    if (box.hidden || box.dataset.tab !== 'part' || box.dataset.size === 'peek' || !page.state.focus.size) return;
    const parts = partsRect(page, [...page.state.focus]);
    if (!parts) return;
    const m = page.main.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const cx = (parts.left + parts.right) / 2;
    const cy = (parts.top + parts.bottom) / 2;
    if (narrow()) {
      const free = m.top + (m.height - visible(box.dataset.size)) / 2;
      if (parts.bottom > m.bottom - visible(box.dataset.size) - 8 || parts.top < m.top) panBy(page, 0, free - cy);
    } else if (parts.right > b.left - 8) {
      panBy(page, (m.left + (b.left - m.left) / 2) - cx, 0);
    }
  }

  function layout({ size, tab, free = false } = {}) {
    const part = hasPart();
    const circuit = hasCircuit();
    box.hidden = !part && !circuit;
    if (box.hidden) return place();
    if (tab) box.dataset.tab = tab;
    if (box.dataset.tab === 'part' && !part) box.dataset.tab = 'circuit';
    if (box.dataset.tab === 'circuit' && !circuit) box.dataset.tab = 'part';
    if (size) box.dataset.size = size;
    tabPart.hidden = !part;
    tabCircuit.hidden = !circuit;
    tabs.classList.toggle('single', !(part && circuit));
    tabPart.textContent = page.open?.startsWith('node:') ? page.data.text.tabStrip : page.data.text.tabPart;
    for (const b of [tabPart, tabCircuit]) b.setAttribute('aria-selected', String(b.dataset.tab === box.dataset.tab));
    place();
    if (free) keepFree();
  }

  // A part or a strip was tapped (or the card closed): card.js calls this.
  page.cardChanged = () => {
    if (hasPart()) layout({ tab: 'part', size: box.dataset.size === 'full' ? 'full' : 'half', free: true });
    else layout({ tab: 'circuit', size: narrow() ? 'peek' : box.dataset.size === 'peek' ? 'peek' : 'half' });
  };
  // The circuit's panels come and go (a warning, the Falstad notes): show them, small on a phone.
  page.panelsChanged = () => layout();
  page.showCircuit = () => layout({ tab: 'circuit', size: 'half' });

  for (const b of [tabPart, tabCircuit]) {
    b.addEventListener('click', () => {
      if (b.dataset.tab === box.dataset.tab) layout({ size: box.dataset.size === 'peek' ? 'half' : 'peek' });
      else layout({ tab: b.dataset.tab, size: box.dataset.size === 'peek' ? 'half' : undefined, free: true });
    });
  }
  chevron?.addEventListener('click', () => layout({ size: box.dataset.size === 'peek' ? 'half' : 'peek', free: true }));

  // The sheet follows the finger from the grip, the tabs or the card's head.
  let drag = null;
  const handles = (el) => !el.closest('button, a, input') && (grip.contains(el) || tabs.contains(el) || Boolean(el.closest('.info .head, .info .summary')));
  box.addEventListener('pointerdown', (e) => {
    if (!narrow() || !handles(e.target)) return;
    const start = offsetOf(box.dataset.size);
    drag = { id: e.pointerId, y0: e.clientY, start, at: start, moves: [[e.timeStamp, e.clientY]], moved: false };
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y0;
    if (!drag.moved && Math.abs(dy) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      box.setPointerCapture?.(e.pointerId);
      box.classList.add('dragging');
    }
    const top = offsetOf('full');
    const bottom = offsetOf('peek');
    let y = drag.start + dy;
    if (y < top) y = top - rubber(top - y, top || 1);
    if (y > bottom) y = bottom + rubber(y - bottom, bottom || 1);
    drag.at = y;
    drag.moves.push([e.timeStamp, e.clientY]);
    if (drag.moves.length > 5) drag.moves.shift();
    box.style.transform = `translateY(${y}px)`;
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    box.classList.remove('dragging');
    if (!d.moved) return; // a tap: the tab or the head handles it
    const [[t0, y0], [t1, y1]] = [d.moves[0], d.moves[d.moves.length - 1]];
    const v = t1 > t0 ? ((y1 - y0) / (t1 - t0)) * 1000 : 0; // px/s, down is positive
    const landing = d.at + project(v);
    const sizes = ['full', 'half', 'peek'];
    const nearest = sizes.reduce((a, s) => (Math.abs(offsetOf(s) - landing) < Math.abs(offsetOf(a) - landing) ? s : a), 'half');
    layout({ size: nearest, free: true });
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);

  // Tapping the card's head steps a peeking sheet up.
  page.info.addEventListener('click', (e) => {
    if (box.dataset.size === 'peek' && e.target.closest('.head, .summary') && !e.target.closest('button')) layout({ size: 'half', free: true });
  });

  // The panels of the circuit appear later (live.js); a size change of the window re-places.
  if (win.MutationObserver) new win.MutationObserver(() => layout()).observe(page.side, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  win.addEventListener('resize', () => place());
  box.dataset.size = narrow() ? 'peek' : 'half';
  box.dataset.tab = 'circuit';
  layout();
}
