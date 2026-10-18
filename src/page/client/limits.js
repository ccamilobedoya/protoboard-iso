// Limits made visible in the live page (stage 3, phase 5): every part against its limits
// (engine.stresses, from src/sim/devices/*), in three levels (src/sim/controls.js):
//   fine (< 80 %)       nothing
//   near (80–100 %)     amber outline
//   exceeded (> 100 %)  pulsing red outline, a warning in the panel and in its card, with the
//                       peak value, the limit and the value now. It stays until "Clear marks" or
//                       a reset, even if a slider goes back or the peak was brief.
// Outlines are the hidden boxes of the `marks` layer (src/index.js, markOps), shown and coloured by
// CSS rules (#stress), like the focus: the script never redraws the scene. No CSS filters: a blur
// is redrawn on every frame the dots move.

import { stressLevel } from '../../sim/controls.js';
import { quote } from './focus.js';
import { select } from './card.js';
import { iconSvg } from './icons.js';

function el(parent, tag, text, cls) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

export function setupLimits(page, { engine, t, f }) {
  const style = el(document.head, 'style');
  style.id = 'stress';
  const panel = el(null, 'section', null, 'panel warnings');
  panel.hidden = true;
  page.side.insertBefore(panel, page.side.firstChild);
  el(panel, 'h3', t('page.warnings.title'));
  const list = el(panel, 'ul');
  const clear = el(panel, 'button', t('page.warnings.clear'), 'clear');
  clear.type = 'button';
  clear.addEventListener('click', () => reset());
  // On the bar, beside the menu: how many limits were passed, so they are never missed; it leads to the panel.
  const flag = el(null, 'button', null, 'warn-flag');
  flag.type = 'button';
  flag.hidden = true;
  flag.title = t('page.warnings.flag');
  flag.innerHTML = `${iconSvg('warning')}<span class="count"></span>`;
  flag.addEventListener('click', () => {
    page.showCircuit?.();
    panel.scrollIntoView?.({ block: 'nearest' });
    panel.querySelector('button')?.focus();
  });
  const nav = document.querySelector('nav');
  nav?.insertBefore(flag, nav.querySelector('.more'));

  const latched = new Map(); // part|code → the stress at its peak, with the part id and `now`
  const rows = new Map(); // part|code → its button in the panel
  let near = new Set();
  let outlined = '';
  let lastText = -Infinity;

  // "D1: la corriente llegó a 100 mA (máximo 30 mA) · ahora 4,1 mA": the peak that was latched,
  // and the value now, so a learner sees both that it went past and where it is after a change.
  // (A reverse voltage that is now forward reads 0.)
  function message(s) {
    const peak = { part: s.id, quantity: t(`page.warnings.q.${s.quantity}`), peak: f(s.value, s.unit), max: f(s.max, s.unit) };
    const head = t(s.reportMax ? 'page.warnings.peak' : 'page.warnings.peakNoMax', peak);
    if (!s.now) return head;
    const value = s.quantity === 'reverse' ? Math.max(0, s.now.value) : s.now.value;
    return `${head} · ${t(s.now.ratio > 1 ? 'page.warnings.still' : 'page.warnings.now', { now: f(value, s.unit) })}`;
  }
  page.stressNotes = (id) => [...latched.values()].filter((s) => s.id === id).map(message);

  // Every frame (and after each control change, with force): levels, peaks, the values now.
  function check(reading, force = false) {
    if (!reading) return;
    const stresses = engine.stresses(reading);
    const now = new Set();
    for (const [id, items] of Object.entries(stresses)) {
      for (const s of items) {
        const level = stressLevel(s.ratio);
        if (level === 'near') now.add(id);
        if (level !== 'exceeded') continue;
        const key = `${id}|${s.code}`;
        const was = latched.get(key);
        if (!was || s.ratio > was.ratio) latched.set(key, { ...s, id });
      }
    }
    for (const [key, s] of latched) {
      const item = (stresses[s.id] ?? []).find((x) => `${s.id}|${x.code}` === key);
      s.now = item ? { value: item.value, ratio: item.ratio } : null;
    }
    near = now;
    paint(force);
  }

  function paint(force = true) {
    // Outlines: rewritten only when a part changes level.
    const exceeded = new Set([...latched.values()].map((s) => s.id));
    const signature = JSON.stringify([[...exceeded], [...near]]);
    if (signature !== outlined) {
      outlined = signature;
      // Only while the Simulation button is on (body.show-results): a mark gives a value away.
      const rule = (ids, body) => (ids.length ? `${ids.map((id) => `body.show-results .marks > [data-mark="${quote(id)}"]`).join(', ')} { display: inline; ${body} }` : '');
      style.textContent = rule([...near].filter((id) => !exceeded.has(id)), 'stroke: var(--warn);') + rule([...exceeded], 'animation: stress-pulse 1s steps(4, jump-none) infinite alternate;');
    }
    // The panel: a row per latched limit, built when one appears, its text updated in place
    // (at most four times a second while the simulation runs, at once after a change).
    const keys = [...latched.keys()];
    const rebuilt = keys.length !== rows.size || keys.some((k) => !rows.has(k));
    if (rebuilt) {
      list.textContent = '';
      rows.clear();
      for (const [key, s] of latched) {
        const b = el(el(list, 'li'), 'button', null, 'warning');
        b.type = 'button';
        b.addEventListener('click', () => select(page, s.id));
        rows.set(key, b);
      }
      panel.hidden = rows.size === 0;
      flag.hidden = rows.size === 0;
      flag.lastChild.textContent = String(rows.size);
      flag.setAttribute('aria-label', `${t('page.warnings.flag')}: ${rows.size}`);
    }
    const clock = typeof performance === 'object' ? performance.now() : Date.now();
    if (!rebuilt && !force && clock - lastText < 250) return;
    lastText = clock;
    for (const [key, b] of rows) {
      const text = `⚠ ${message(latched.get(key))}`;
      if (b.textContent !== text) b.textContent = text;
    }
    page.refreshNotes?.();
  }

  function reset() {
    latched.clear();
    paint();
  }

  return { check, reset };
}
