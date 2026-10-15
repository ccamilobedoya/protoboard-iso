// "Open in Falstad" in the live page (stage 3, phase 6): the circuit as it is now (sliders, the
// pressed button, a battery's charge) exported to CircuitJS (src/sim/falstad.js) and opened in a
// new tab. Only in the live page, so only where the circuit already shows its results: Falstad
// shows every value.
//
// When a part goes as an equivalent (a battery as a source and a resistor, a sensor as a fixed
// resistor) or is left out, a "⚠ n" button beside the link opens the list in a side panel. The
// export happens anyway.

import { toFalstad } from '../../sim/falstad.js';

function el(parent, tag, text, cls) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

export function setupFalstad(page, { engine, t, f, reading }) {
  const nav = document.querySelector('nav');
  const group = el(null, 'span', null, 'group falstad');
  const link = el(group, 'a', t('page.falstad.open'), 'open');
  link.target = '_blank';
  link.rel = 'noopener';
  link.title = t('page.falstad.title');
  const flag = el(group, 'button', null, 'flag');
  flag.type = 'button';
  flag.hidden = true;
  nav.insertBefore(group, nav.querySelector('.hint'));

  const panel = el(null, 'section', null, 'panel falstad-notes');
  panel.hidden = true;
  page.side.appendChild(panel);
  el(panel, 'h3', t('page.falstad.notes'));
  const list = el(panel, 'ul');

  // A note's text: its quantities ({ value, unit }) in this page's language.
  const text = (n) => t(n.code, Object.fromEntries(Object.entries(n.params).map(([k, v]) => [k, v && typeof v === 'object' ? f(v.value, v.unit) : v])));

  function update() {
    const out = toFalstad(engine.program(), { reading: reading(), timeConstants: engine.timeConstants() });
    link.href = out.url;
    flag.hidden = !out.notes.length;
    flag.textContent = `⚠ ${out.notes.length}`;
    flag.title = t('page.falstad.notes');
    list.textContent = '';
    for (const n of out.notes) el(list, 'li', text(n));
    if (!out.notes.length) panel.hidden = true;
    return out;
  }
  // Exported again right before leaving, so the link carries what is on screen now.
  link.addEventListener('pointerdown', update);
  link.addEventListener('click', update);
  link.addEventListener('focus', update);
  flag.addEventListener('click', () => {
    update();
    panel.hidden = !panel.hidden;
    flag.setAttribute('aria-expanded', String(!panel.hidden));
  });
  update();
  return { update };
}
