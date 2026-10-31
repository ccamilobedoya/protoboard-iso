// Controls in the live page (stage 3, phase 5): sliders, the momentary push button and the
// on/off button of a switch that stays put.
//
// - In the card of a tapped part: every control its device has (engine.controls(), from
//   src/sim/devices/* and src/sim/controls.js), under "Adjust".
// - In a panel, the ones the circuit puts in front (`page.controls`: part or supply, field, and
//   optionally its own range, scale and label).
// - A push button conducts while it is held (on the drawing itself or with *Hold to press*), or
//   stays pressed with *Keep pressed* until that is tapped again.
// Every row of the same control is kept in step; a change re-solves (engine.set, sliders
// debounced) and `changed` repaints. A part's short label that states the control's value
// ("R2 · 10 kΩ") states the new one.

import { fromSlider, toSlider, SLIDER } from '../../sim/controls.js';
import { formatValue } from '../../core/units.js';
import { applyFocus } from './focus.js';

const DEBOUNCE = 120; // ms of rest before a slider's value is solved
const MAX_WAIT = 300; // ms: during a long drag, still solved this often

function el(parent, tag, text, cls) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

export function setupControls(page, { engine, t, decimal, changed }) {
  const live = page.data.live;
  const rows = new Set();
  const kept = new Set(); // push buttons left pressed ("Keep pressed"): id|field
  const find = (list, id, field) => list.find((c) => c.id === id && c.field === field);
  const show = (c, v) => {
    if (c.percent) return `${Math.round(v * 100)} %`;
    if (c.unit === '°C') return `${String(Math.round(v * 10) / 10).replace('.', decimal)} °C`;
    return formatValue(v, c.unit, { decimal });
  };
  const nameOf = (c) => t(`page.control.${c.field}`);

  // The label is the kit's own text, so the value in it is written as show() writes it.
  function restate(id, before, after) {
    if (!before || !after || before.scale === 'toggle' || before.percent) return;
    const [was, now] = [show(before, before.value), show(after, after.value)];
    if (was === now) return;
    let found = false;
    for (const svg of page.svgs) {
      for (const label of svg.querySelectorAll(':scope > .shortlabels > [data-part="' + id.replace(/["\\]/g, '\\$&') + '"]')) {
        if (!label.textContent.endsWith(' · ' + was)) continue;
        label.textContent = label.textContent.slice(0, -was.length) + now;
        found = true;
      }
    }
    if (found) applyFocus(page);
  }

  function set(id, field, value, from) {
    const before = find(engine.controls(), id, field);
    if (!engine.set(id, field, value)) return;
    changed();
    const list = engine.controls();
    restate(id, before, find(list, id, field));
    for (const r of rows) {
      if (!r.isConnected) rows.delete(r);
      else if (r !== from) r.update(find(list, r.dataset.id, r.dataset.field));
    }
  }

  // One row: a name, the value and a slider; or a button to hold.
  function row(parent, c, label) {
    const r = el(parent, 'div', null, 'control');
    r.dataset.id = c.id;
    r.dataset.field = c.field;
    el(r, 'span', label, 'name');
    if (c.scale === 'toggle') {
      // A switch that stays put: one button that turns it on or off.
      const b = el(r, 'button', null, 'hold toggle');
      b.type = 'button';
      let on = Boolean(c.value);
      b.addEventListener('click', () => {
        on = !on;
        set(c.id, c.field, on, r);
        r.update({ value: on });
      });
      r.update = (cur) => {
        on = Boolean(cur?.value);
        b.textContent = t(on ? 'page.controls.turnOff' : 'page.controls.turnOn');
        b.setAttribute('aria-pressed', String(on));
      };
    } else if (c.scale === 'momentary') {
      // Two ways: "Hold to press" conducts only while held; "Keep pressed" leaves it pressed (to
      // look at other parts while current flows) until it is tapped again.
      const key = `${c.id}|${c.field}`;
      const buttons = el(r, 'span', null, 'buttons');
      const b = el(buttons, 'button', t('page.controls.hold'), 'hold');
      b.type = 'button';
      const keep = el(buttons, 'button', t('page.controls.latch'), 'hold latch');
      keep.type = 'button';
      let held = false;
      const press = (on) => {
        if (held === on || kept.has(key)) return;
        held = on;
        set(c.id, c.field, on);
      };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (b.setPointerCapture) b.setPointerCapture(e.pointerId);
        press(true);
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(type, () => press(false));
      b.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') press(true);
      });
      b.addEventListener('keyup', () => press(false));
      keep.addEventListener('click', () => {
        const on = !kept.has(key);
        if (on) kept.add(key);
        else kept.delete(key);
        held = on;
        set(c.id, c.field, on);
      });
      r.update = (cur) => {
        held = Boolean(cur?.value);
        b.setAttribute('aria-pressed', String(held));
        keep.setAttribute('aria-pressed', String(kept.has(key)));
      };
    } else {
      const out = el(r, 'output', null, 'value');
      const input = el(r, 'input');
      input.type = 'range';
      input.min = '0';
      input.max = String(SLIDER);
      input.step = '1';
      input.setAttribute('aria-label', label);
      // The value shown follows the finger at once; the circuit is solved again only when the
      // slider rests for DEBOUNCE ms, at least every MAX_WAIT ms during a long drag, and at once
      // on release ('change').
      let timer = null;
      let pending = null;
      let lastSolve = 0;
      const flush = () => {
        clearTimeout(timer);
        timer = null;
        if (pending == null) return;
        const v = pending;
        pending = null;
        lastSolve = Date.now();
        set(c.id, c.field, v, r);
      };
      input.addEventListener('input', () => {
        pending = fromSlider(c, Number(input.value));
        out.textContent = show(c, pending);
        clearTimeout(timer);
        if (Date.now() - lastSolve >= MAX_WAIT) flush();
        else timer = setTimeout(flush, DEBOUNCE);
      });
      input.addEventListener('change', flush);
      r.update = (cur) => {
        if (!cur) return;
        input.value = String(toSlider(c, cur.value));
        out.textContent = show(c, cur.value);
      };
    }
    r.update(c);
    rows.add(r);
    return r;
  }

  // The card: page.buildControls(info, id) adds the part's controls, if it has any.
  page.buildControls = (parent, id) => {
    const list = engine.controls().filter((c) => c.id === id);
    if (!list.length) return;
    const box = el(parent, 'div', null, 'adjust');
    el(box, 'h3', t('page.controls.adjust'));
    for (const c of list) row(box, c, nameOf(c));
  };

  // The panel the circuit asks for.
  const wanted = (live.panel ?? []).map((p) => {
    const c = find(engine.controls(), p.id, p.field);
    return c && { c: { ...c, ...Object.fromEntries(['min', 'max', 'scale'].filter((k) => p[k] != null).map((k) => [k, p[k]])) }, label: p.label ?? `${p.id} · ${nameOf(c)}` };
  }).filter(Boolean);
  if (wanted.length) {
    const panel = el(page.side, 'section', null, 'panel controls');
    const head = el(panel, 'button', t('page.controls.title'), 'head');
    head.type = 'button';
    head.setAttribute('aria-expanded', 'true');
    const body = el(panel, 'div', null, 'body');
    head.addEventListener('click', () => {
      body.hidden = !body.hidden;
      head.setAttribute('aria-expanded', String(!body.hidden));
    });
    for (const w of wanted) row(body, w.c, w.label);
  }

  // Holding a push button on the drawing.
  let holding = null;
  page.main.addEventListener('pointerdown', (e) => {
    const hit = e.target.closest && e.target.closest('[data-part]');
    if (!hit || page.side.contains(e.target) || page.info.contains(e.target)) return;
    const c = engine.controls().find((x) => x.id === hit.getAttribute('data-part') && x.scale === 'momentary');
    if (!c || kept.has(`${c.id}|${c.field}`)) return;
    holding = c;
    set(c.id, c.field, true);
  });
  const letGo = () => {
    if (!holding) return;
    const c = holding;
    holding = null;
    set(c.id, c.field, false);
  };
  window.addEventListener('pointerup', letGo);
  window.addEventListener('pointercancel', letGo);

  return { set };
}
