// Result tags: hover with a mouse, or tap, to see where the value comes from: probes on the
// two points a voltage is read between, arrows where a current goes in and out, and a line
// that says it. A tap keeps it until the tag is tapped again or something else is. Hovering a
// value of the card shows its explanation in the same small box.

import { quote } from './focus.js';

export const tagOf = (el) => (el && el.closest ? el.closest('.results > [data-probe]') : null);

function place(page, target) {
  const { main, tooltip } = page;
  const r = main.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  tooltip.style.left = Math.max(4, Math.min(b.left - r.left, r.width - 270)) + 'px';
  tooltip.style.top = (b.bottom - r.top + 6) + 'px';
  tooltip.hidden = false;
}

export function showProbe(page, tag) {
  const key = tag && tag.dataset.probe;
  page.probeStyle.textContent = key ? '.probes > [data-probe="' + quote(key) + '"] { display: inline; }' : '';
  const text = key && page.data.probes[key];
  if (!text) return (page.tooltip.hidden = true);
  page.tooltip.textContent = text;
  place(page, tag);
}

// A tap on a result tag: pin its probes (or unpin them). True when the tap was on a tag.
export function tapTag(page, target) {
  const tag = tagOf(target);
  if (!tag) {
    page.pinned = null;
    showProbe(page, null);
    return false;
  }
  page.pinned = page.pinned === tag.dataset.probe ? null : tag.dataset.probe;
  showProbe(page, page.pinned ? tag : null);
  return true;
}

export function setupTooltip(page) {
  const { main } = page;
  page.pinned = null;
  const tagNamed = (key) => page.current().querySelector('.results > text[data-probe="' + quote(key) + '"]');
  main.addEventListener('pointerover', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const tag = tagOf(e.target);
    if (tag) return showProbe(page, tag);
    const term = e.target.closest && e.target.closest('.info [data-explain]');
    if (!term || term.getAttribute('aria-expanded') === 'true') return;
    page.probeStyle.textContent = '';
    page.tooltip.textContent = page.data.explain[term.dataset.explain];
    place(page, term);
  });
  main.addEventListener('pointerout', (e) => {
    const to = e.relatedTarget;
    if (to && to.closest && to.closest('.results > [data-probe], .info [data-explain]')) return;
    showProbe(page, page.pinned ? tagNamed(page.pinned) : null);
  });
}
