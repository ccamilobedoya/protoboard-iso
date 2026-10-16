// The running simulation in the page (stage 3, docs/en/live-simulation.md). The page carries the
// compiled program (#sim-program) and this script runs it with the same engine as Node:
//
// - Each frame, simulated time advances (circuits with capacitors or inductors) in fixed steps,
//   at most 8 ms of work: falling behind turns into slow motion. Default speed: the longest
//   time constant every 2 s (from the engine, at load and on reset).
// - Dots move along the conductor view's pieces (paths drawn hole → part, strips forwards) by
//   an accumulated phase (Falstad's "curcount"), so their speed changes without jumps; speed is
//   proportional to the current (the largest since the start moves at 60 px/s), or logarithmic
//   with the speed button.
// - Four times a second: conductor colours (voltage), LED glow, heat tint, result tags, the
//   probe captions and the open card.
// - "Open in Falstad" (falstad.js): the circuit as it is now, in CircuitJS.
// - The oscilloscope (scope.js): every part and every strip in use recorded from the start
//   (sim/recorder.js), the tapped part's voltage and current, or the tapped strip's voltage to
//   ground, drawn in its card.
// - Controls (controls.js): sliders in the card and the circuit's panel, the momentary push
//   button; a change re-solves at once. Limits (limits.js): checked every frame, shown as
//   outlines and warnings.
//
// Without requestAnimationFrame (jsdom) nothing is scheduled; tests drive it with
// window.protoboardLive.tick(ms).

import { createEngine } from '../../sim/engine.js';
import { linesFor, nodeLines } from '../../sim/lines.js';
import { deviceOfReading } from '../../sim/devices/index.js';
import { formatValue } from '../../core/units.js';
import { voltageColor, dotSpeed, DOT_PERIOD, centreVoltage, bodyVoltage, glowOpacity, heatOpacity } from '../../sim/look.js';
import { setupControls } from './controls.js';
import { setupLimits } from './limits.js';
import { setupFalstad } from './falstad.js';
import { createScope } from './scope.js';
import { createRecorder, samplesOf } from '../../sim/recorder.js';
import { scopeOf } from '../../sim/scope.js';
import { iconSvg } from './icons.js';

const BUDGET = 8; // ms of simulation per frame
const REFRESH = 250; // ms between repaints of colours, tags and card
const TAG_SIZE = 8; // px, as in src/sim/overlay.js
const MIN_MOVE = 0.05; // px of dot movement worth a redraw
const SCOPE_SAMPLES = 2048; // per part
const WALL_WINDOW = 10; // s of the oscilloscope when nothing changes by itself (no C or L)
// Oscilloscope colours: the line on the dark screen, and its name on the white card.
// The scope's colours are tokens in page/style.js (.scope-trace.v / .i), so they follow the theme.
const SCOPE_V = { kind: 'v' };
const SCOPE_I = { kind: 'i' };

export function setupLive(page) {
  const { data, state, svgs } = page;
  const live = data.live;
  const program = JSON.parse(document.getElementById('sim-program').textContent);
  const t = (key, params = {}) => (live.texts[key] ?? key).replace(/\{(\w+)\}/g, (_, n) => (params[n] !== undefined ? String(params[n]) : `{${n}}`));
  const f = (value, unit) => formatValue(value, unit, { decimal: live.decimal });
  const volts = (v) => f(Math.abs(v) < 1e-3 ? 0 : v, 'V');

  // Time: how fast simulated time runs, the step and the oscilloscope's window. With a signal
  // generator, its period sets the pace: one period of the slowest per second, at least 100
  // steps per period, a window of 4 periods. Otherwise the time constants: the longest every
  // 2 s, a window of 5 of them.
  const engine = createEngine(program);
  const stepFor = (list) => Math.max(Math.min(...list) / 50, Math.max(...list) / 5000);
  function timing(taus, periods) {
    if (periods.length) {
      const h = Math.min(taus.length ? stepFor(taus) : Infinity, Math.min(...periods) / 100);
      return { h, perSecond: Math.max(...periods), window: 4 * Math.max(...periods), periodic: true };
    }
    if (taus.length) return { h: stepFor(taus), perSecond: Math.max(...taus) / 2, window: 5 * Math.max(...taus) };
    return { h: 0, perSecond: 0, window: WALL_WINDOW };
  }
  let pace = timing(engine.timeConstants(), engine.periods());
  const dynamic = pace.h > 0;
  let h = pace.h;
  let running = dynamic;
  let stalled = false;
  let owed = 0;
  engine.start(live.start ?? 'dc', h || 1e-3);
  let reading = engine.read();

  // The oscilloscope (phase 7): every part recorded from the start, so a part tapped later shows
  // its whole story; drawn in the open card only. Only where the card shows the results.
  // Time: the simulated one when the circuit has C or L, else the clock on the wall (a button press
  // or a slider shows as a step). The screen shows from t = 0: first a window of 5 time constants
  // (or 10 s), then it stretches with the time up to twice that, and only then scrolls, so the
  // whole charge of a capacitor stays in view while it matters.
  const recorder = data.text.results ? createRecorder(SCOPE_SAMPLES) : null;
  let scopeWindow = pace.window;
  let wallTime = 0;
  let lastRecord = -Infinity;
  let openScope = null;
  const scopeTime = () => (dynamic ? engine.time : wallTime);
  function record(r, force = false) {
    if (!recorder || !r) return;
    const time = scopeTime();
    if (!force && time - lastRecord < (2 * scopeWindow) / (dynamic ? 1500 : 500)) return;
    lastRecord = time;
    for (const id of Object.keys(data.parts)) {
      const s = scopeOf(r.parts[id]);
      if (s) recorder.push(id, time, s.v?.value ?? NaN, s.i?.value ?? NaN);
    }
    for (const node of Object.keys(data.nodes ?? {})) {
      const v = r.nodes[node];
      if (v != null) recorder.push('node:' + node, time, v, NaN);
    }
  }
  // What the card of `key` plots: a part's (sim/scope.js), or a strip's voltage to ground.
  function scopeFor(key) {
    if (!key.startsWith('node:')) return scopeOf(reading?.parts[key]);
    return reading?.nodes[key.slice(5)] != null ? { v: { label: t('page.scope.node'), value: reading.nodes[key.slice(5)] }, i: null } : null;
  }
  function drawScope() {
    if (!openScope || page.info.hidden || page.open !== openScope.id) return;
    const s = scopeFor(openScope.id);
    if (!s) return;
    const end = Math.max(scopeTime(), scopeWindow);
    const from = Math.max(0, end - 2 * scopeWindow);
    const rec = recorder.get(openScope.id);
    const traces = [];
    if (s.v) traces.push({ label: s.v.label ?? t('page.scope.voltage'), unit: 'V', ...SCOPE_V, points: samplesOf(rec, 'a', from, end) });
    if (s.i) traces.push({ label: s.i.label ?? t('page.scope.current'), unit: 'A', ...SCOPE_I, points: samplesOf(rec, 'b', from, end) });
    openScope.scope.draw({ traces, from, to: end });
  }
  // The card asks for it when it opens (card.js); closing the card takes it away. `id`: a part's,
  // or "node:<group>" for a strip.
  page.buildScope = (info, id) => {
    openScope = null;
    if (!recorder || !scopeFor(id)) return;
    openScope = { id, scope: createScope(info, { t, f }) };
    drawScope();
  };
  record(reading, true);

  // The pieces in every view, by index.
  const flow = live.flow;
  const per = (attr) => svgs.map((svg) => {
    const list = [];
    for (const el of svg.querySelectorAll(`.flow > [data-${attr}]`)) list[Number(el.dataset[attr])] = el;
    return list;
  });
  const dots = flow ? per('seg') : [];
  const wires = flow ? per('wire') : [];
  const phase = flow ? new Float64Array(flow.dots.length) : null;
  const written = flow ? new Float64Array(flow.dots.length) : null; // the offsets on screen
  // Another view's dots were not written while hidden: write them all on the next frame.
  if (written) page.onShow.push(() => written.fill(Infinity));
  let peak = 0;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Current along each dot piece: into the part at a pin, or Kirchhoff along a strip.
  function currents() {
    const pin = (part, name) => {
      const r = reading?.parts[part];
      return !r || r.floating ? 0 : r.pinCurrents?.[name] ?? 0;
    };
    const tap = (tp) => (tp.part ? -pin(tp.part, tp.pin) : tp.sign * (reading?.supplies[tp.supply]?.current ?? 0));
    const running = {};
    for (const [node, holes] of Object.entries(flow.strips)) {
      let sum = 0;
      running[node] = holes.map((taps) => (sum += taps.reduce((s, tp) => s + tap(tp), 0)));
    }
    return flow.dots.map((ref) => (ref.part ? pin(ref.part, ref.pin) : running[ref.node]?.[ref.k] ?? 0));
  }

  function moveDots(wall) {
    const I = currents();
    const target = Math.max(0, ...I.map(Math.abs));
    // The scale is the largest current since the start: it never shrinks on its own, so a
    // current that dies away (a capacitor charging) is seen slowing down.
    peak = Math.max(target, peak);
    if (reduced) return;
    const visible = dots[svgs.indexOf(page.current())] ?? [];
    I.forEach((i, k) => {
      phase[k] = (phase[k] + Math.sign(i) * dotSpeed(i, peak, state.speed) * wall) % DOT_PERIOD;
      const el = visible[k];
      // Each write makes the browser redraw the SVG: skip moves too small to see.
      if (el && Math.abs(phase[k] - written[k]) >= MIN_MOVE) {
        written[k] = phase[k];
        el.style.strokeDashoffset = String(-phase[k]);
      }
    });
  }

  // Colours, glow, heat, tags, captions, card.
  function repaint() {
    if (!reading) return;
    if (flow) {
      const centres = {};
      const voltage = (ref) => {
        if (ref.node) return reading.nodes[ref.node] ?? null;
        const r = reading.parts[ref.part];
        const v = r?.pins?.[ref.pin] ?? null;
        if (ref.share == null) return v;
        centres[ref.part] ??= centreVoltage(r?.pins);
        return bodyVoltage(v, centres[ref.part], ref.share);
      };
      const colours = flow.wires.map((ref) => voltageColor(voltage(ref), flow.vmax));
      for (const list of wires) list.forEach((el, k) => el && el.setAttribute('stroke', colours[k]));
      const stresses = engine.stresses(reading);
      for (const svg of svgs) {
        for (const el of svg.querySelectorAll('.flow > [data-glow]')) el.style.opacity = glowOpacity(reading.parts[el.dataset.glow]?.brightness).toFixed(2);
        for (const el of svg.querySelectorAll('.flow > [data-heat]')) {
          const power = (stresses[el.dataset.heat] ?? []).find((s) => s.quantity === 'power');
          el.style.opacity = heatOpacity(power?.ratio).toFixed(2);
        }
      }
    }
    // Result tags: the same place, the new value, the box resized around its centre.
    for (const svg of svgs) {
      for (const text of svg.querySelectorAll('.results > text[data-q]')) {
        let value = null;
        if (text.dataset.node) {
          const v = reading.nodes[text.dataset.node];
          if (v != null) value = volts(v);
        } else {
          const r = reading.parts[text.getAttribute('data-part')];
          const tag = r && !r.floating ? deviceOfReading(r)?.tag(r) : null;
          if (tag) value = `${tag.label ? `${tag.label} ` : ''}${f(tag.value, 'A')}`;
        }
        if (value == null || text.textContent === value) continue;
        text.textContent = value;
        const rect = text.previousElementSibling;
        if (rect && rect.tagName.toLowerCase() === 'rect') {
          const width = value.length * TAG_SIZE * 0.6 + 6;
          rect.setAttribute('x', String(Number(text.getAttribute('x')) - width / 2));
          rect.setAttribute('width', String(width));
        }
      }
    }
    // Probe captions and card lines.
    for (const [key, p] of Object.entries(live.probes ?? {})) {
      let text = null;
      if (p.node) {
        const v = reading.nodes[p.node];
        if (v != null) text = p.text.replace('\u0001', volts(v));
      } else {
        const r = reading.parts[p.part];
        if (!r || r.floating) continue;
        const own = deviceOfReading(r)?.probe?.(r);
        if (own) text = p.text.replace('\u0001', own.value != null ? f(own.value, 'A') : '');
        else text = (r.current >= 0 ? p.forward : p.backward).replace('\u0001', f(Math.abs(r.current), 'A'));
      }
      if (text) data.probes[key] = text;
    }
    if (data.text.results) {
      for (const id of Object.keys(data.parts)) if (reading.parts[id]) data.parts[id].sim = linesFor(reading.parts[id], { t, decimal: live.decimal });
      for (const [node, n] of Object.entries(data.nodes ?? {})) n.sim = nodeLines(reading, node, n.leads, { t, decimal: live.decimal });
      page.refreshCard?.();
    }
    if (clock) clock.textContent = t('page.time.at', { t: f(engine.time, 's') });
    drawScope();
  }

  // Time controls, when the circuit has something that changes with time.
  let clock = null;
  const nav = document.querySelector('nav');
  if (dynamic) {
    const group = document.createElement('span');
    group.className = 'group time';
    // An icon and a label (hidden on a narrow screen, so it is the title too).
    const make = (icon, text, act) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.addEventListener('click', act);
      group.appendChild(b);
      label(b, icon, text);
      return b;
    };
    const label = (b, icon, text) => {
      b.innerHTML = `${iconSvg(icon)}<span class="label"></span>`;
      b.lastChild.textContent = text;
      b.title = text;
    };
    const pause = make('pause', t('page.time.pause'), () => {
      running = !running;
      label(pause, running ? 'pause' : 'play', t(running ? 'page.time.pause' : 'page.time.play'));
    });
    make('restart', t('page.time.reset'), () => {
      engine.start('zero', h);
      limits.reset();
      reading = engine.read();
      recorder?.clear();
      record(reading, true);
      peak = 0;
      running = true;
      stalled = false;
      owed = 0;
      label(pause, 'pause', t('page.time.pause'));
      repaint();
    });
    clock = document.createElement('span');
    clock.className = 'clock';
    group.appendChild(clock);
    nav.insertBefore(group, nav.querySelector('.spacer'));
  }
  document.body.classList.add('live');

  // Limits and controls. A change keeps the speed of time (so a larger R is seen charging more
  // slowly) but never a step too long for the new time constants.
  const limits = setupLimits(page, { engine, t, f });
  let falstad = null;
  const controls = setupControls(page, {
    engine,
    t,
    decimal: live.decimal,
    changed() {
      if (dynamic) {
        // A slider may change a time constant or a generator's frequency. Time keeps its speed
        // (a larger R charges visibly slower, a higher frequency shows more periods a second);
        // the step follows the new period (or never gets too long for a new time constant), and
        // the oscilloscope's window too.
        const now = timing(engine.timeConstants(), engine.periods());
        if (now.h > 0) {
          h = now.periodic ? now.h : Math.min(h, now.h);
          scopeWindow = now.window;
        }
      }
      stalled = false;
      reading = engine.read();
      record(reading, true);
      limits.check(reading, true);
      falstad?.update();
      repaint();
    },
  });
  // After the controls, so the link sits beside them in the bar.
  falstad = setupFalstad(page, { engine, t, f, reading: () => reading });

  let last = null;
  let lastPaint = -Infinity;
  function frame(now) {
    const wall = last == null ? 0 : Math.min(now - last, 100) / 1000;
    last = now;
    if (running && dynamic && !stalled) {
      owed += wall * pace.perSecond;
      const t0 = performance.now();
      while (owed >= h && performance.now() - t0 < BUDGET) {
        let ok = engine.step(h);
        for (let k = 0; !ok && k < 4; k++) ok = engine.step((h /= 2));
        if (!ok) {
          stalled = true;
          if (clock) clock.textContent = t('page.live.stalled', { t: f(engine.time, 's') });
          break;
        }
        owed -= h;
        if (recorder && engine.time - lastRecord >= (2 * scopeWindow) / 1500) record(engine.read());
      }
      if (owed > 4 * h) owed = 0; // too slow to keep up: slow motion instead of a spiral
      reading = engine.read();
      limits.check(reading);
    }
    if (recorder && !dynamic) {
      wallTime += wall;
      record(reading);
    }
    if (flow) moveDots(wall);
    if (now - lastPaint >= REFRESH) {
      lastPaint = now;
      repaint();
    }
  }
  window.protoboardLive = {
    tick(ms, steps = 1) {
      for (let k = 0; k < steps; k++) frame((last ?? 0) + ms);
    },
    get engine() {
      return engine;
    },
    get reading() {
      return reading;
    },
    get time() {
      return engine.time;
    },
    get phases() {
      return phase ? Array.from(phase) : [];
    },
    currents: () => (flow ? currents() : []),
    recording: (id) => recorder?.get(id) ?? null,
    set: (id, field, value) => controls.set(id, field, value),
  };
  limits.check(reading);
  repaint();
  if (typeof requestAnimationFrame === 'function' && (flow || dynamic || recorder)) {
    const loop = (now) => {
      frame(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
