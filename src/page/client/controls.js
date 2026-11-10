// Controls in the live page (stage 3, phase 5): sliders, the momentary push button and the
// on/off button of a switch that stays put.
//
// - In the card of a tapped part: every control its device has (engine.controls(), from
//   src/sim/devices/* and src/sim/controls.js), under "Adjust".
// - In a panel, the ones the circuit puts in front (`page.controls`: part or supply, field, and
//   optionally its own range, scale and label).
// - A push button conducts while it is held (on the drawing itself or with *Hold to press*), or
//   stays pressed with *Keep pressed* until that is tapped again. A switch in the board (a slide
//   switch, a tilt switch) moves with a tap on the drawing too, and stays.
// Every row of the same control is kept in step; a change re-solves (engine.set, sliders
// debounced) and `changed` repaints. A part's short label that states the control's value
// ("R2 · 10 kΩ") states the new one.
// - The environment (sim/environment.js; docs/en/environment.md): its fields asked for in
//   `page.controls` ({ environment: 'light' }), or all of them with `page.environment`, in a section
//   of their own, each with its indicator (gauge.js) and, for a field a program moves, Pause and
//   Resume. A sensor's card shows the indicator of each field it senses, and offers to follow the
//   environment again once its own control has moved. refresh() follows the programs (live.js
//   calls it with each repaint); a recording's box of one indicator is insetGauge(field).

import { fromSlider, toSlider, SLIDER } from '../../sim/controls.js';
import { formatValue } from '../../core/units.js';
import { applyFocus } from './focus.js';
import { FIELDS, envText, rangeProblem, altitudeOfPressure } from '../../sim/environment.js';
import { createGauge } from './gauge.js';

const DEBOUNCE = 120; // ms of rest before a slider's value is solved
const MAX_WAIT = 300; // ms: during a long drag, still solved this often

function el(parent, tag, text, cls) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

export function setupControls(page, { engine, t, decimal, changed, reading = () => null }) {
  const live = page.data.live;
  const rows = new Set();
  const kept = new Set(); // push buttons left pressed ("Keep pressed"): id|field
  const find = (list, id, field) => list.find((c) => c.id === id && c.field === field);
  const show = (c, v) => {
    // Pressure: also the altitude it means in the standard atmosphere (docs/en/environment.md).
    if (c.id === 'environment' && c.field === 'pressure') return `${envText(c.field, v, decimal)} · ${t('sim.env.altitude', { altitude: String(Math.round(altitudeOfPressure(v))) })}`;
    if (c.id === 'environment') return envText(c.field, v, decimal) ?? t(v ? 'sim.env.on' : 'sim.env.off');
    if (c.percent) return `${Math.round(v * 100)} %`;
    if (c.unit === '°C') return `${String(Math.round(v * 10) / 10).replace('.', decimal)} °C`;
    return formatValue(v, c.unit, { decimal });
  };
  const fieldName = (field) => {
    const name = t(`sim.env.field.${field}`);
    return name.charAt(0).toUpperCase() + name.slice(1);
  };
  const nameOf = (c) => (c.id === 'environment' ? fieldName(c.field) : t(`page.control.${c.field}`));
  // A field an emitter writes (`emitted` in its control): the ambient the slider holds, and the share
  // that reaches the sensors with the parts it comes from, or that they are blocked.
  const envShow = (c) => {
    const ambient = show(c, c.value);
    if (c.emitted === undefined) return ambient;
    const e = engine.emissions?.()[c.field];
    const from = Object.entries(e?.parts ?? {}).filter(([, v]) => v > 0).map(([id]) => id);
    if (!from.length) return ambient;
    if (e.blocked) return t('page.env.blocked', { ambient, parts: from.join(', '), field: t(`sim.env.field.${FIELDS[c.field].blockedBy}`) });
    // What arrives: the field's limit may leave less than the emitters add, or nothing.
    if (!(c.emitted > 0)) return ambient;
    return t('page.env.emitted', { ambient, share: show(c, c.emitted), parts: from.join(', ') });
  };
  // Every indicator on the page, by field: kept in step with the environment's values.
  const gauges = new Set();
  // `range` {min, max, scale?}: the dial's span and scale, as a panel row or a timeline's gauge step asks
  // for them. One that cannot be a range (it does not go up, leaves the field's limit, a log scale from
  // 0) is not drawn: the dial falls back to the circuit's range for the field, then to the slider's.
  const usable = (field, r) => r != null && Number.isFinite(r.min) && Number.isFinite(r.max) && !rangeProblem(field, [r.min, r.max]) && !(r.scale === 'log' && !(r.min > 0));
  const gauge = (field, range) => {
    const own = find(engine.controls(), 'environment', field);
    const f = FIELDS[field];
    const asked = { min: range?.min ?? own?.min ?? f.min, max: range?.max ?? own?.max ?? f.max, scale: ['log', 'linear'].includes(range?.scale) ? range.scale : (own?.scale ?? f.scale) };
    const circuit = { min: own?.min ?? f.min, max: own?.max ?? f.max, scale: own?.scale ?? f.scale };
    const registry = { min: f.min, max: f.max, scale: f.scale };
    const span = f.kind === 'switch' ? registry : [asked, circuit, registry].find((r) => usable(field, r));
    const g = createGauge(field, { ...FIELDS[field], ...span }, { text: (v) => envText(field, v, decimal) ?? t(v ? 'sim.env.on' : 'sim.env.off'), label: fieldName(field) });
    g.field = field;
    g.update(engine.environment?.()[field] ?? FIELDS[field].default);
    gauges.add(g);
    return g;
  };

  // The label is the kit's own text, so the value in it is written as show() writes it.
  function restate(id, before, after) {
    if (!before || !after || before.scale === 'toggle' || before.percent) return;
    const [was, now] = [show(before, before.value), show(after, after.value)];
    if (was === now) return;
    // A bench's pad names the part its pin is joined to with its value ("→ R1 330 Ω"): the new one.
    const to = `→ ${id} ${was}`;
    for (const parts of Object.values(page.data.pinouts ?? {})) {
      for (const p of Object.values(parts)) for (const pin of p.pins ?? []) if (pin.to === to) pin.to = `→ ${id} ${now}`;
    }
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
    refresh(list);
  }

  // The environment's values now in every indicator, and in the rows a running program moves (a row
  // the learner is dragging is not: dragging pauses the program).
  function refresh(list = engine.controls()) {
    const values = engine.environment?.() ?? {};
    for (const g of gauges) {
      if (!g.el.isConnected && g.placed) gauges.delete(g);
      else if (values[g.field] !== undefined && values[g.field] !== g.value) g.update(values[g.field]);
    }
    for (const r of rows) {
      if (r.dataset.id !== 'environment' || !r.isConnected) continue;
      const c = find(list, 'environment', r.dataset.field);
      // A program moves it, or an emitter adds to it (its share in the row's words).
      if ((c?.programmed || c?.emitted !== undefined) && !r.dragging) r.update(c);
      r.pause?.(c);
    }
    for (const s of senseBoxes) {
      if (!s.box.isConnected) senseBoxes.delete(s);
      else fillSenses(s);
    }
  }

  // One row: a name, the value and a slider; or a button to hold.
  function row(parent, c, label) {
    const r = el(parent, 'div', null, 'control');
    r.dataset.id = c.id;
    r.dataset.field = c.field;
    el(r, 'span', label, 'name');
    // The slider spans min…max (its own 0…SLIDER maps onto them); stated for readers and tests.
    if (c.scale !== 'toggle' && c.scale !== 'momentary') {
      r.dataset.min = String(c.min);
      r.dataset.max = String(c.max);
    }
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
      // A switch in the board says where the button sends it (`moves`: "Slide to 2", "Tilt it").
      r.update = (cur) => {
        on = Boolean(cur?.value);
        b.textContent = t(c.moves ? c.moves[on ? 1 : 0] : on ? 'page.controls.turnOff' : 'page.controls.turnOn');
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
        r.dragging = true;
        pending = fromSlider(c, Number(input.value));
        out.textContent = show(c, pending);
        clearTimeout(timer);
        if (Date.now() - lastSolve >= MAX_WAIT) flush();
        else timer = setTimeout(flush, DEBOUNCE);
      });
      input.addEventListener('change', () => {
        r.dragging = false;
        flush();
      });
      r.update = (cur) => {
        if (!cur) return;
        input.value = String(toSlider(c, cur.value));
        const text = c.id === 'environment' ? envShow(cur) : show(c, cur.value);
        if (out.textContent !== text) out.textContent = text;
      };
    }
    r.update(c);
    rows.add(r);
    return r;
  }

  // A field of the environment: its indicator beside its row, and Pause / Resume when a program
  // moves it.
  function envRow(parent, c, label) {
    const box = el(parent, 'div', null, 'env-row');
    const g = gauge(c.field, c);
    box.appendChild(g.el);
    g.placed = true;
    const r = row(box, c, label);
    if (!c.programmed) return r;
    const b = el(r, 'button', null, 'hold env-pause');
    b.type = 'button';
    r.pause = (cur) => {
      const paused = Boolean(cur?.paused);
      b.textContent = t(paused ? 'page.env.resume' : 'page.env.pause');
      b.setAttribute('aria-pressed', String(paused));
    };
    b.addEventListener('click', () => {
      const cur = find(engine.controls(), 'environment', c.field);
      if (cur?.paused) {
        if (engine.resume?.('environment', c.field)) changed();
        refresh();
      } else set('environment', c.field, cur?.value ?? c.value);
    });
    r.pause(c);
    return r;
  }

  // The card: page.buildControls(info, id) adds the part's controls, if it has any, and for a
  // sensor the indicator of each field it senses (with Follow the environment once it left it).
  const senseBoxes = new Set(); // { box, id, said }: written again when what the part follows changes
  function fillSenses(s) {
    const senses = reading()?.parts?.[s.id]?.env ?? [];
    const said = senses.map((e) => `${e.field}:${e.follows}`).join(' ');
    if (said === s.said) return;
    s.said = said;
    s.box.textContent = '';
    for (const e of senses) {
      const line = el(s.box, 'div', null, 'env-sense');
      const g = gauge(e.field);
      line.appendChild(g.el);
      g.placed = true;
      el(line, 'span', fieldName(e.field), 'name');
      if (e.follows) continue;
      const b = el(line, 'button', t('page.env.follow'), 'hold');
      b.type = 'button';
      b.addEventListener('click', () => {
        if (!engine.attach?.(s.id, e.field)) return;
        changed();
        refresh();
      });
    }
  }
  page.buildControls = (parent, id) => {
    const list = engine.controls().filter((c) => c.id === id);
    const senses = reading()?.parts?.[id]?.env ?? [];
    if (!list.length && !senses.length) return;
    const box = el(parent, 'div', null, 'adjust');
    el(box, 'h3', t('page.controls.adjust'));
    for (const c of list) row(box, c, nameOf(c));
    if (!senses.length) return;
    const s = { box: el(box, 'div', null, 'env-senses'), id, said: null };
    senseBoxes.add(s);
    fillSenses(s);
  };

  // The panels the circuit asks for: the environment's fields (page.controls entries that name one,
  // then the rest of them with page.environment), and the controls.
  const wanted = (live.panel ?? []).map((p) => {
    const c = find(engine.controls(), p.id, p.field);
    return c && { c: { ...c, ...Object.fromEntries(['min', 'max', 'scale'].filter((k) => p[k] != null).map((k) => [k, p[k]])) }, label: p.label ?? (c.id === 'environment' ? nameOf(c) : `${p.id} · ${nameOf(c)}`) };
  }).filter(Boolean);
  const world = wanted.filter((w) => w.c.id === 'environment');
  if (live.environment) for (const c of engine.controls()) if (c.id === 'environment' && !world.some((w) => w.c.field === c.field)) world.push({ c, label: nameOf(c) });
  const section = (title, cls, list, make) => {
    if (!list.length) return;
    const panel = el(page.side, 'section', null, `panel ${cls}`);
    const head = el(panel, 'button', title, 'head');
    head.type = 'button';
    head.setAttribute('aria-expanded', 'true');
    const body = el(panel, 'div', null, 'body');
    head.addEventListener('click', () => {
      body.hidden = !body.hidden;
      head.setAttribute('aria-expanded', String(!body.hidden));
    });
    for (const w of list) make(body, w.c, w.label);
  };
  section(t('page.env.title'), 'environment', world, envRow);
  section(t('page.controls.title'), 'controls', wanted.filter((w) => w.c.id !== 'environment'), row);

  // The box of one indicator (a timeline's gauge, docs/en/timeline.md; tour.js also puts one up for
  // a set of the environment while it moves): in a corner of the frame, the field's name over it;
  // null takes it away. page.gaugeShown() names the field up, or null.
  let inset = null;
  page.insetGauge = (field, { corner = 'tr', min, max } = {}) => {
    inset?.box.remove();
    inset = null;
    if (!field || !FIELDS[field] || !engine.controls().some((c) => c.id === 'environment' && c.field === field)) return false;
    const box = el(page.main, 'div', null, 'gauge-inset');
    box.dataset.corner = ['tl', 'tr', 'bl', 'br'].includes(corner) ? corner : 'tr';
    el(box, 'span', fieldName(field), 'name');
    const g = gauge(field, { min, max });
    box.appendChild(g.el);
    g.placed = true;
    inset = { box, field };
    return true;
  };
  page.gaugeShown = () => inset?.field ?? null;

  // Holding a push button on the drawing.
  let holding = null;
  page.main.addEventListener('pointerdown', (e) => {
    const hit = e.target.closest && e.target.closest('[data-part]');
    if (!hit || page.side.contains(e.target) || page.info.contains(e.target)) return;
    const own = engine.controls().filter((x) => x.id === hit.getAttribute('data-part'));
    // A switch in the board (a slide switch, a tilt switch) moves with a tap, and stays.
    const flip = own.find((x) => x.scale === 'toggle' && x.tap);
    if (flip) return set(flip.id, flip.field, !flip.value);
    const c = own.find((x) => x.scale === 'momentary');
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

  return { set, refresh };
}
