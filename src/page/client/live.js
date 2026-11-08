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
//   outlines and warnings. The environment's fields (sim/environment.js) are controls too; its
//   programs move with simulated time (the engine), and their indicators follow with each repaint.
//
// Without requestAnimationFrame (jsdom) nothing is scheduled; tests drive it with
// window.protoboardLive.tick(ms).
//
// With ?director=1 (director.js, a recording) the director owns the time: tick goes through it, a
// frame has no budget of wall time (every step owed is taken, at most DIRECTOR_STEPS), everything
// is repainted on every tick, dots move under reduced motion too, and nothing reads the system
// clock. A page with a tour (tour.js) hands the time to the director only while the tour plays
// (page.direct), and keeps reduced motion.

import { createEngine } from '../../sim/engine.js';
import { paceOf } from '../../sim/pace.js';
import { linesFor, nodeLines } from '../../sim/lines.js';
import { deviceOfReading } from '../../sim/devices/index.js';
import { formatValue } from '../../core/units.js';
import { voltageColor, dotSpeed, DOT_PERIOD, centreVoltage, bodyVoltage, glowOpacity, heatOpacity, SHADE, mixLight } from '../../sim/look.js';
import { setupControls } from './controls.js';
import { setupLimits } from './limits.js';
import { setupFalstad } from './falstad.js';
import { createScope, periodOf } from './scope.js';
import { createRecorder, samplesOf } from '../../sim/recorder.js';
import { scopeOf } from '../../sim/scope.js';
import { iconSvg } from './icons.js';
import { createDirector, wantsDirector, wantsLanding } from './director.js';
import { setupFocusView } from './focus-view.js';
import { setupTour, LANDING } from './tour.js';
import { stageInset, landingInset } from './view.js';
import { bezier, LIGHT } from './moves.js';

const BUDGET = 8; // ms of simulation per frame
const DIRECTOR_STEPS = 20000; // steps per frame at most under the director (its frames take what they need)
const LONGEST = 100; // ms: a longer frame is slow motion (a tab that was hidden), or split by the director
const REFRESH = 250; // ms between repaints of colours, tags and card
// What an LED's light is averaged over in the page: 20 ms of simulated time (a PWM's periods), at most
// the frames of the last 34 ms on the wall (two frames).
const GLOW_WINDOW = { sim: 0.02, wall: 34 };
const TAG_SIZE = 8; // px, as in src/sim/overlay.js
const MIN_MOVE = 0.05; // px of dot movement worth a redraw
const SCOPE_SAMPLES = 2048; // per part
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
  // Seconds as a person says them: two decimals (0.08, 0.40), three under a hundredth.
  const secs = (v) => v.toFixed(v < 0.01 ? 3 : 2).replace('.', live.decimal ?? '.');
  // A proportion as the eye reads it: whole from ×3 up ("×5", not "×5.2"), else one decimal ("×1.4").
  const fill = (text, params) => text.replace(/\{(k2?)\}/g, (_, key) => params[key] ?? '');
  const times_ = (k) => (k >= 3 ? String(Math.round(k)) : k.toFixed(1).replace('.', live.decimal ?? '.'));

  // Time: how fast simulated time runs, the step and the oscilloscope's window (sim/pace.js).
  const engine = createEngine(program);
  const timing = (taus, periods) => paceOf(taus, periods, Boolean(engine.hasProgram?.()), engine.stimuli?.() ?? []);
  const pace = timing(engine.timeConstants(), engine.periods());
  const dynamic = pace.h > 0;
  // A recording may set its own speed of time (a timeline's `pace`, s simulated per s of video).
  const perSecond = () => (recording && data.tour?.pace > 0 ? data.tour.pace : pace.perSecond);
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
  // The recorder keeps two windows of samples: a recording's fixed window (a probe's `window`) when
  // there is one, else the scope's own.
  const recWindow = () => inset?.window ?? scopeWindow;
  function record(r, force = false) {
    if (!recorder || !r) return;
    const time = scopeTime();
    if (!force && time - lastRecord < (2 * recWindow()) / (dynamic ? 1500 : 500)) return;
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
  // `only`: 'v' or 'i' for one trace (the inset of a recording), else both. `window` (a recording's
  // probe): the screen always shows that much time, from t = 0 and then scrolling, so a change of
  // pace is seen as more or fewer cycles instead of a new scale; `marks`: the sets it saw.
  function drawOne({ id, scope, only, label, window, marks, change, say }) {
    const s = scopeFor(id);
    if (!s) return;
    const end = Math.max(scopeTime(), window ?? scopeWindow);
    const from = Math.max(0, end - (window ?? 2 * scopeWindow));
    const rec = recorder.get(id);
    const traces = [];
    if (s.v && only !== 'i') traces.push({ label: label ?? s.v.label ?? t('page.scope.voltage'), unit: 'V', ...SCOPE_V, points: samplesOf(rec, 'a', from, end) });
    if (s.i && only !== 'v') traces.push({ label: label ?? s.i.label ?? t('page.scope.current'), unit: 'A', ...SCOPE_I, points: samplesOf(rec, 'b', from, end) });
    scope.draw({ traces, from, to: end, marks: marks?.map((m) => (m.before ? compared(m, id, only, end, change, say) : m)) });
  }
  // A mark of a comparing box: its ghost (the cycles before it, shifted by whole periods so they run
  // on after it, as far as the screen goes) and the change of period, once a whole cycle after it
  // is on the trace (risings through the level of the cycles before).
  // `change`: "ratio" (the default) says it as a proportion ("on ×5 · off the same"), true at any
  // pace; "times" in the oscilloscope's seconds ("on 0.08 → 0.40 s · off the same"), which a
  // recording at its own `pace` does not show at that speed.
  // `say`: the timeline's own words for it, with {k} for how many times longer the LED stays on and
  // {k2} for off (or the period without an LED): the figure is still the simulation's, the sentence
  // the script's, so whoever checks the script's texts reads it too.
  function compared(m, id, only, end, change = 'ratio', say = null) {
    const T = m.cycle?.before ?? m.period;
    let ghost = null;
    if (T > 0 && m.before.length > 1) {
      const span = m.before.at(-1)[0] - m.before[0][0];
      const shift = Math.max(1, Math.floor(span / T)) * T;
      ghost = m.before.filter(([t]) => t >= m.t - shift).map(([t, v]) => [t + shift, v]).filter(([t]) => t <= end);
    }
    // The new period: the simulation's once the control has arrived, else measured on the trace.
    const after = m.settled == null ? null : (m.cycle?.after ?? periodOf(samplesOf(recorder.get(id), only === 'i' ? 'b' : 'a', m.settled, end), m.level));
    const k = T > 0 && after > 0 ? after / T : null;
    const times = k == null ? '' : k >= 10 ? String(Math.round(k)) : k.toFixed(1).replace('.', live.decimal ?? '.');
    const ratio = change !== 'times';
    let delta = T > 0 ? t(after > 0 ? (ratio ? 'page.scope.deltaRatio' : 'page.scope.delta') : 'page.scope.deltaWait', { from: f(T, 's'), to: after > 0 ? f(after, 's') : '', k: times }) : null;
    // With an LED, in words: how long it stays on before and after, and whether off changed.
    const led = m.cycle?.led;
    if (led && m.settled != null) {
      const same = Math.abs(led.after.off - led.before.off) <= 0.15 * led.before.off;
      const key = ratio ? (same ? 'page.scope.litRatio' : 'page.scope.litRatioBoth') : same ? 'page.scope.lit' : 'page.scope.litBoth';
      const params = { from: secs(led.before.on), to: secs(led.after.on), off0: secs(led.before.off), off1: secs(led.after.off), k: times_(led.after.on / led.before.on), k2: times_(led.after.off / led.before.off) };
      delta = say ? fill(say, params) : t(key, params);
    } else if (led) delta = null;
    else if (say && delta && after > 0) delta = fill(say, { k: times, k2: times });
    return { t: m.t, text: m.text, ghost, delta };
  }
  function drawScope() {
    if (inset) drawOne(inset);
    if (!openScope || page.info.hidden || page.open !== openScope.id) return;
    drawOne(openScope);
  }
  // M11: the oscilloscope of a part or a strip in a box of its own over the drawing (a recording's
  // probe), one trace, from t = 0; null takes it away. The camera leaves it room (view.js). The
  // timeline may say its title, the trace's name and the note under it otherwise ("" for none), a
  // fixed `window` of time in s, and `marks`: a line at each set from then on, with the new value.
  let inset = null;
  // `place`: "top" puts the box between the caption and the circuit (body.scope-top; moves.js,
  // SCOPE_BOX); `size`: "compact" draws it without title or note (scope.js).
  page.insetScope = (id, only = 'v', { title, label, note, window, marks = false, compare = false, change = 'ratio', say = null, place, size, reading = true, clock = true } = {}) => {
    inset?.box.remove();
    inset = null;
    document.body.classList.remove('with-scope', 'scope-top');
    if (!id || !recorder || !scopeFor(id)) return false;
    const box = document.createElement('div');
    box.className = `scope-inset${place === 'top' ? ' top' : ''}${size === 'compact' ? ' compact' : ''}`;
    page.main.appendChild(box);
    const own = { 'page.scope.title': title, 'page.scope.model': note };
    inset = { id, box, only, label, window: window > 0 ? window : undefined, marks: marks || compare ? [] : undefined, compare, change, say: say || null, scope: createScope(box, { t: (key, params) => own[key] ?? t(key, params), f, compact: size === 'compact', title: title || null, compare, reading, clock }) };
    document.body.classList.add('with-scope');
    document.body.classList.toggle('scope-top', place === 'top');
    drawOne(inset);
    return true;
  };
  // A set while the inset keeps marks (tour.js): a line at this time with the control's new value.
  // Comparing, the cycles before it are kept (the window before the mark) with their period.
  // `cycle` (src/page.js, withCycles): the period before and after, from the simulation.
  page.scopeMark = (part, field, value, cycle) => {
    if (!inset?.marks) return false;
    const c = engine.controls().find((x) => x.id === part && x.field === field);
    const now = scopeTime();
    const mark = { t: now, control: `${part}|${field}`, cycle, text: typeof value === 'number' ? `${part} → ${f(value, c?.unit ?? '')}` : part };
    if (inset.compare) {
      const span = inset.window ?? 2 * scopeWindow;
      mark.before = samplesOf(recorder.get(inset.id), inset.only === 'i' ? 'b' : 'a', Math.max(0, now - span), now);
      // The level halfway between the extremes of the latest half of it: the first charge from 0
      // would put it under the cycles.
      const late = mark.before.slice(Math.floor(mark.before.length / 2));
      let lo = Infinity;
      let hi = -Infinity;
      for (const [, v] of late) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      mark.level = (lo + hi) / 2;
      mark.period = periodOf(mark.before, mark.level);
    }
    inset.marks.push(mark);
    drawOne(inset);
    return true;
  };
  // The set of the latest mark of that control has arrived: the period after it is measured from now.
  page.scopeSettled = (part, field) => {
    const mark = inset?.marks?.findLast((m) => m.control === `${part}|${field}`);
    if (mark && mark.settled == null) mark.settled = scopeTime();
  };
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
  const recording = wantsDirector(location.search);
  const landing = !recording && Boolean(data.tour) && wantsLanding(location.search);
  const rate = landing ? LANDING.rate : 1; // a landing's tour runs calmer (tour.js, LANDING)
  let director = null; // set below, once the controls it moves exist
  let directing = false; // the director has the time: a recording, or a tour playing
  const reduced = !recording && typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let dotScale = 1; // a tour's flow step brings the dots up from rest (ramp)

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
    // A flow step's `sense` (tour.js) shows which way a small current runs: on the log scale it is
    // seen moving next to a large one (a capacitor charging through a big resistor).
    const scale = page.flowSense ? 'log' : state.speed;
    I.forEach((i, k) => {
      phase[k] = (phase[k] + Math.sign(i) * dotSpeed(i, peak, scale) * dotScale * wall) % DOT_PERIOD;
      const el = visible[k];
      // Each write makes the browser redraw the SVG: skip moves too small to see.
      if (el && Math.abs(phase[k] - written[k]) >= MIN_MOVE) {
        written[k] = phase[k];
        el.style.strokeDashoffset = String(-phase[k]);
      }
    });
  }

  // What a repaint writes, found once: the drawing never changes under the script (the copies of
  // the spotlight are not in these layers), and selectors on every tick add up under the director.
  const each = (selector) => svgs.flatMap((svg) => [...svg.querySelectorAll(selector)]);
  let heats = null;
  let glows = null;
  let tags = null;
  let bridges = null;

  // The halo of each LED (M8): in a video (a recording or a landing) it rises to its brightness along
  // a hit instead of appearing, and goes out at once. In the page a person reads the circuit, so a
  // light follows the simulation at once (a 7-segment's digit changes in one frame, a blink is never
  // late). At rest when the page loads, at once under reduced motion; dark while a part is in the air
  // (M15: the circuit is not closed yet). id → { shown, written, rise: { from, ms } }.
  const lights = new Map();
  let dark = false;
  const lightEase = bezier(LIGHT.curve);
  const rises = recording || landing;
  function aim(id, target) {
    const to = dark ? 0 : target;
    const l = lights.get(id);
    if (!l) return lights.set(id, { shown: to, to, written: null, rise: null });
    l.to = to;
    if (reduced || !rises || to <= l.shown) {
      l.shown = to;
      l.rise = null;
    } else if (!l.rise) l.rise = { from: l.shown, ms: 0 };
  }
  function riseLights(wall) {
    for (const l of lights.values()) {
      if (!l.rise) continue;
      l.rise.ms += wall * 1000;
      const k = Math.min(1, l.rise.ms / LIGHT.ms);
      l.shown = l.rise.from + (l.to - l.rise.from) * lightEase(k);
      if (k >= 1) l.rise = null;
    }
  }
  // The shade of an LED that is off (look.js, SHADE), in the parts and in their copies over the veil:
  // live collections, so the copies a focus makes are found without a selector on every tick.
  const shades = svgs.map((svg) => svg.getElementsByClassName('led-shade'));
  // A display's lit segments (sim/paths.js segmentOps), the same way: fill-opacity data-k × its light.
  const segments = svgs.map((svg) => svg.getElementsByClassName('led-segment'));
  // A piece drawn at each of its places (a slide switch's knob, a motor's notch; render/scene.js
  // `pose`), the same way.
  const poses = svgs.map((svg) => svg.getElementsByClassName('pose'));
  const turns = {}; // a motor's number of notch angles, by part
  function writeLights() {
    for (const el of glows) {
      const text = lights.get(el.dataset.glow)?.shown.toFixed(2) ?? '0.00';
      if (el.style.opacity !== text) el.style.opacity = text;
    }
    for (const list of segments) {
      for (const el of list) {
        const text = (Number(el.dataset.k) * (lights.get(el.dataset.glow)?.shown ?? 0)).toFixed(2);
        if (el.style.fillOpacity !== text) el.style.fillOpacity = text;
      }
    }
    for (const list of shades) {
      for (const el of list) {
        const l = lights.get(el.dataset.shade);
        if (!l) continue;
        // fill-opacity: `opacity` is the moves' (a part hidden while it comes in).
        const text = (SHADE.opacity * Math.max(0, 1 - l.shown / SHADE.full)).toFixed(2);
        if (el.style.fillOpacity !== text) el.style.fillOpacity = text;
      }
    }
  }

  // LEDs lit with their current: on the board (.lights, with the results) and in the current layer,
  // painted on every frame (not with the colours and tags, four times a second: a light that waited
  // for them lagged up to 250 ms and showed a half-lit paint between two states, a digit changing in
  // slow motion). A PWM is faster than any paint and the eye sees its average: the page averages the
  // frames of the last GLOW_WINDOW.sim of simulated time (a PWM's periods), never older than
  // GLOW_WINDOW.wall ms (a circuit in slow motion still switches when it does). A recording averages
  // each of its ticks, as it always has (its frames do not change).
  const glowChunks = []; // { glow, dt, at } of the last frames, newest last
  let glowAt = null;
  function glowNow() {
    const glow = engine.glow?.() ?? null;
    if (recording) return glow ?? {};
    const now = engine.time;
    const wall = performance.now();
    if (glowAt == null || now < glowAt) glowChunks.length = 0;
    const dt = glowAt == null ? 0 : now - glowAt;
    glowAt = now;
    if (glow && dt > 0) glowChunks.push({ glow, dt, at: wall });
    let total = glowChunks.reduce((a, c) => a + c.dt, 0);
    while (glowChunks.length > 1 && (total - glowChunks[0].dt >= GLOW_WINDOW.sim || wall - glowChunks[0].at > GLOW_WINDOW.wall)) total -= glowChunks.shift().dt;
    const sum = {};
    for (const c of glowChunks) for (const [key, v] of Object.entries(c.glow)) sum[key] = (sum[key] ?? 0) + v * c.dt;
    for (const key of Object.keys(sum)) sum[key] /= total;
    return sum;
  }
  function paintLights() {
    if (!reading || !glows) return;
    const glow = glowNow();
    // A chip of a part of several LEDs is "<part>.<pin>" (a display's segment, an RGB LED's R).
    const bright = (key) => {
      if (glow[key] != null) return glow[key];
      const dot = key.lastIndexOf('.');
      return dot < 0 ? reading.parts[key]?.brightness : reading.parts[key.slice(0, dot)]?.channels?.[key.slice(dot + 1)]?.brightness;
    };
    for (const list of segments) for (const el of list) aim(el.dataset.glow, glowOpacity(bright(el.dataset.glow)));
    for (const el of glows) {
      aim(el.dataset.glow, glowOpacity(bright(el.dataset.glow)));
      // An RGB LED's halo: its chips' colours mixed again by what each one gives now.
      if (el.dataset.mix) {
        const fill = mixLight(el.dataset.mix.split(' ').map((c) => [c.slice(c.indexOf(':') + 1), bright(`${el.dataset.glow}.${c.slice(0, c.indexOf(':'))}`)]));
        if (el.getAttribute('fill') !== fill) el.setAttribute('fill', fill);
      }
    }
    writeLights();
  }

  // Colours, glow, heat, tags, captions, card.
  function repaint() {
    heats ??= each('.flow > [data-heat]');
    glows ??= each('.lights > [data-glow], .flow > [data-glow]');
    tags ??= each('.results > text[data-q]');
    bridges ??= each('.flow > [data-bridge]');
    // A push button's bridge in the plan, drawn while it is pressed.
    for (const el of bridges) el.style.display = reading.parts[el.dataset.bridge]?.pressed ? '' : 'none';
    if (!reading) return;
    // A slide switch's knob where its control has it now: the other one hidden. A motor's notch at
    // the shaft's angle now ('a0' … 'a15', the nearest of its angles), so the shaft turns at its speed.
    for (const list of poses) {
      for (const el of list) {
        const r = reading.parts[el.dataset.part];
        const turn = /^a(\d+)$/.exec(el.dataset.pose);
        let shown;
        if (turn && typeof r?.angle === 'number') {
          // Its count from the piece (data-turns): a view may draw no face of some angles at all.
          const n = Number(el.dataset.turns) || (turns[el.dataset.part] ??= new Set([...list].filter((x) => x.dataset.part === el.dataset.part && /^a\d+$/.test(x.dataset.pose)).map((x) => x.dataset.pose)).size);
          const k = ((Math.round((r.angle / (2 * Math.PI)) * n) % n) + n) % n;
          shown = Number(turn[1]) === k;
        } else if (typeof r?.on === 'boolean') shown = (r.on ? 'on' : 'off') === el.dataset.pose;
        else continue;
        const display = shown ? '' : 'none';
        if (el.style.display !== display) el.style.display = display;
      }
    }
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
      for (const el of heats) {
        const power = (stresses[el.dataset.heat] ?? []).find((s) => s.quantity === 'power');
        el.style.opacity = heatOpacity(power?.ratio).toFixed(2);
      }
    }
    paintLights();
    // Result tags: the same place, the new value, the box resized around its centre.
    for (const text of tags) {
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
    envRefresh?.();
  }
  let envRefresh = null; // the environment's indicators and rows (controls.js), once they exist

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
  // The MODEL badge says which simulation this is: over time (C, L, a generator) or DC.
  if (dynamic) {
    page.modelText = t('page.model.time');
    const badge = document.querySelector('.model-badge');
    if (badge) badge.textContent = page.modelText;
  }

  // Limits and controls. A change keeps the speed of time (so a larger R is seen charging more
  // slowly) but never a step too long for the new time constants.
  // Its own clock under the director (the time it has played), else the page's.
  const limits = setupLimits(page, { engine, t, f, now: recording ? () => director?.time ?? 0 : undefined });
  let falstad = null;
  const controls = setupControls(page, {
    engine,
    t,
    decimal: live.decimal,
    reading: () => reading,
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
      if (!quiet) repaint();
    },
  });
  envRefresh = () => controls.refresh();
  // After the controls, so the link sits beside them in the bar.
  falstad = setupFalstad(page, { engine, t, f, reading: () => reading });

  let last = null;
  let lastPaint = -Infinity;
  let quiet = false; // the director is moving controls: its frame repaints once after them
  function frame(now) {
    const wall = last == null ? 0 : Math.min(now - last, LONGEST) / 1000;
    last = now;
    if (running && dynamic && !stalled) {
      // A program that starts a PWM or a tone needs shorter steps (never under 5 µs: below that
      // the page falls back to slow motion by itself).
      const hint = engine.stepHint?.();
      if (hint && hint < h) h = Math.max(5e-6, hint);
      owed += wall * perSecond();
      const t0 = directing ? 0 : performance.now();
      let n = 0;
      while (owed >= h && (directing ? n++ < DIRECTOR_STEPS : performance.now() - t0 < BUDGET)) {
        // advance() splits a step Newton cannot take (a diode switching) and keeps h for the next.
        if (!engine.advance(h)) {
          stalled = true;
          if (clock) clock.textContent = t('page.live.stalled', { t: f(engine.time, 's') });
          break;
        }
        owed -= h;
        if (recorder && engine.time - lastRecord >= (2 * recWindow()) / 1500) record(engine.read());
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
    const rising = [...lights.values()].some((l) => l.rise);
    riseLights(wall);
    if (directing || now - lastPaint >= REFRESH) {
      lastPaint = now;
      repaint();
    } else if (rising) writeLights();
    else paintLights();
  }
  director = recording || data.tour
    ? createDirector(page, {
        controls: () => engine.controls(),
        set: (id, field, value) => controls.set(id, field, value),
        // The director's time is whole: its first tick moves too, a long one goes in pieces.
        advance(ms) {
          last ??= 0;
          for (let left = ms; left > 0; left -= LONGEST) frame(last + Math.min(left, LONGEST));
          if (!(ms > 0)) frame(last);
        },
        batch(fn) {
          quiet = true;
          try {
            fn();
          } finally {
            quiet = false;
          }
        },
      })
    : null;
  // The director takes the time (view.js's frameTo moves on its clock while page.director is set),
  // or gives it back: the page's own frames start again from a frame of no time.
  page.direct = (on) => {
    directing = Boolean(on) || recording;
    page.director = directing ? director : null;
    if (!directing) last = null;
  };
  // A recording is the frame of a video (V4): the timeline's theme (the stage unless it says
  // otherwise; ?theme= in the link wins), the reserved margin for the caption and the platforms'
  // buttons, and one label, the told part's (tour.js sets page.told; focus.js reads it).
  if (recording) {
    page.direct(true);
    document.body.classList.add('director');
    if (!new URLSearchParams(location.search).has('theme')) document.documentElement.dataset.theme = data.tour?.theme ?? 'stage';
    page.inset = () => stageInset(page);
    page.told = null;
  }
  // A landing (director.js, wantsLanding) dresses like a recording and keeps the page's own time.
  if (landing) {
    document.body.classList.add('director', 'landing');
    page.landing = true;
    if (!new URLSearchParams(location.search).has('theme')) document.documentElement.dataset.theme = data.tour.theme ?? 'stage';
    page.inset = () => landingInset(page);
    page.told = null;
  }
  const tour = data.tour && director
    ? setupTour(page, {
        director,
        t,
        f,
        recording,
        landing,
        reading: () => reading,
        dots: (k) => {
          dotScale = k;
        },
        // M7: the pieces the current runs through now, in the view shown, with their voltage.
        carrying: () => {
          if (!flow) return [];
          const I = currents();
          const shown = dots[svgs.indexOf(page.current())] ?? [];
          const tiny = Math.max(0, ...I.map(Math.abs)) * 1e-3;
          const volts = (ref) => (ref.node ? reading.nodes[ref.node] : reading.parts[ref.part]?.pins?.[ref.pin]) ?? null;
          return flow.dots.map((ref, k) => ({ el: shown[k], v: volts(ref), i: I[k], part: ref.part, node: ref.node })).filter((p) => p.el && p.v != null && Math.abs(p.i) > tiny);
        },
        // M21: what a part's bench needs to colour its pads and move its dots as the current layer does.
        look: () => ({ vmax: flow?.vmax ?? 0, peak, speed: state.speed, scale: dotScale, flowing: state.layer === 'flow' }),
        // M15: the lights held dark while a part is in the air, then let rise (M8).
        lights: (on) => {
          dark = !on;
          if (!on) for (const id of lights.keys()) aim(id, 0);
        },
      })
    : null;
  // A part's view up close (F5): a page made with it (page.focusView), not a recording or a landing.
  if (tour && data.focusView && !recording && !landing) setupFocusView(page, { tour, t });
  window.protoboardLive = {
    tick(ms, steps = 1) {
      for (let k = 0; k < steps; k++) {
        if (directing) director.tick(ms);
        else frame((last ?? 0) + ms);
      }
    },
    director: recording ? director : null,
    get tour() {
      return tour;
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
  if (typeof requestAnimationFrame === 'function' && (director || flow || dynamic || recorder)) {
    let before = null;
    const loop = (now) => {
      if (directing) director.tick(before == null ? 0 : Math.min(now - before, LONGEST) * rate);
      else frame(now);
      before = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  // A landing plays by itself, unless the reader asked for less motion.
  if (landing && !reduced) tour.play();
}
