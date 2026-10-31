// The director (stage and video, V1; docs/en/stage-and-video.md): one clock that owns the time of
// a page that tells a circuit. Only with ?director=1 in the link and only in a live page; every
// other page keeps its own loop (live.js) and does not change.
//
// tick(ms) advances, in this order: the cues due (start(cues): { at, run(director) }, how the
// timeline's player, tour.js, plays), the camera, the controls and tweens being moved, and the
// simulation with its dots, glow, colours and tags, all written once per tick; then the `after`
// hooks (a value shown from the new reading). Cues follow their own clock, which stands still
// while a hold waits for a condition (a timeline's wait-until), so later steps move with it. Nothing in a tick reads the system clock:
// a sequence played with tick(1000/30) gives the same frames every time. In the page a
// requestAnimationFrame loop calls tick with the time that passed (live.js); a recorder calls it
// with 1000/fps.
//
// The director moves things on purpose, so it ignores prefers-reduced-motion: what a learner's
// page does under reduced motion is the timeline player's choice (tour.js), not the clock's.

import { clampBox, frameAt, easeOut, numbers, partBox, partsBounds, insetFrame, setBox, fitFrame } from './view.js';

export const wantsDirector = (search) => new URLSearchParams(search).get('director') === '1';

// `sim`: what live.js lends the director — controls() (engine.controls()), set(id, field, value)
// (controls.js, so the rows in the card and the panel follow), advance(ms) (the page's frame for
// that much time: simulation, dots, and a repaint) and batch(fn) (inside fn a control's change
// does not repaint: advance does, once, at the end).
export function createDirector(page, sim) {
  let time = 0;
  let cueTime = 0; // the cues' clock: stands still while a hold waits
  let cues = [];
  let hold = null; // { test, left }: cues wait until test() is true, at most `left` ms
  let camera = null; // { from, to, t0, ms, ease }
  const moving = new Map(); // id|field → { id, field, from, to, log, t0, ms, ease }
  const tweens = new Set(); // { apply(e), t0, ms, ease }
  const after = new Set();

  // A target is a box [x, y, w, h] (a frame as it is), 'board' or 'parts' (the page's two frames;
  // 'parts' as a button fits it, filling a portrait screen) or a part's id. `zoom` closes in on
  // its centre. With a reserved margin (page.inset: a recording, V4) a named target is shown in
  // the area the margin leaves free.
  function boxOf(target, zoom = 1) {
    if (Array.isArray(target)) return target;
    const svg = page.current();
    const inset = page.inset?.();
    let box;
    if (target === 'board') box = numbers(svg.dataset.board);
    else if (target === 'parts') box = inset ? partsBounds(page) ?? numbers(svg.dataset.parts) : fitFrame(page, numbers(svg.dataset.parts));
    else box = partBox(page, target);
    if (!box) return null;
    if (zoom !== 1) {
      const [x, y, w, h] = box;
      box = [x + (w - w / zoom) / 2, y + (h - h / zoom) / 2, w / zoom, h / zoom];
    }
    return inset ? insetFrame(page, box, inset) : box;
  }
  const progress = (m) => (m.ms > 0 ? Math.min(1, (time - m.t0) / m.ms) : 1);

  const director = {
    get time() {
      return time;
    },
    // From t = 0 with these cues (run in order of `at`, those with the same `at` in the order given).
    start(list = []) {
      director.stop();
      time = 0;
      cueTime = 0;
      cues = list.map((c, k) => ({ ...c, k })).sort((a, b) => a.at - b.at || a.k - b.k);
    },
    // Everything that was moving stays where it is; nothing more happens.
    stop() {
      cues = [];
      hold = null;
      camera = null;
      moving.clear();
      tweens.clear();
      after.clear();
    },
    // Something still to come or still moving.
    get busy() {
      return cues.length > 0 || hold != null || camera != null || moving.size > 0 || tweens.size > 0;
    },
    // Cues wait until test() is true (checked on each tick, on the last reading), at most `max` ms.
    hold(test, max) {
      hold = { test, left: max };
    },
    // apply(e) on every tick for `ms`, e going 0 → 1 along `ease`.
    tween(apply, { ms = 0, ease = easeOut } = {}) {
      if (!(ms > 0)) return apply(1);
      tweens.add({ apply, t0: time, ms, ease });
    },
    // fn() after every tick's simulation, until stop().
    after(fn) {
      after.add(fn);
    },
    // Move the frame there in `ms` along `ease` (k → share of the way), from where it is now.
    frame(target, { ms = 0, ease = easeOut, zoom = 1 } = {}) {
      const box = boxOf(target, zoom);
      if (!box) return false;
      camera = null;
      if (!(ms > 0) || !page.box) setBox(page, box);
      else camera = { from: page.box.slice(), to: clampBox(page, box), t0: time, ms, ease };
      return true;
    },
    // A gesture took the frame (view.js setBox): the camera lets go.
    stopFrame() {
      camera = null;
    },
    // Move a control to `value` in `ms`: a number along `ease` (on a log scale by ratios, as its
    // slider moves), anything else (a button) at once.
    set(id, field, value, { ms = 0, ease = easeOut } = {}) {
      const key = `${id}|${field}`;
      moving.delete(key);
      const c = sim.controls().find((x) => x.id === id && x.field === field);
      if (!c) return false;
      if (!(ms > 0) || typeof value !== 'number' || typeof c.value !== 'number') return sim.set(id, field, value) !== false;
      const log = c.scale === 'log' && c.value > 0 && value > 0;
      moving.set(key, { id, field, from: c.value, to: value, log, t0: time, ms, ease });
      return true;
    },
    tick(ms) {
      const dt = Math.max(0, Number(ms) || 0);
      const end = time + dt;
      // A cue starts its moves at its own time, not at the end of the tick that reached it.
      let left = dt;
      for (;;) {
        if (hold) {
          if (hold.test()) hold = null;
          else {
            const wait = Math.min(left, hold.left);
            hold.left -= wait;
            left -= wait;
            time += wait;
            if (hold.left > 0) break;
            hold = null;
          }
        }
        const next = cues[0];
        if (!next || next.at > cueTime + left) {
          cueTime += left;
          break;
        }
        const gap = Math.max(0, next.at - cueTime);
        cueTime += gap;
        left -= gap;
        time += gap;
        cues.shift();
        next.run(director);
      }
      time = end;
      if (camera) {
        const k = progress(camera);
        frameAt(page, camera.from, camera.to, camera.ease(k));
        if (k >= 1) camera = null;
      }
      sim.batch(() => {
        for (const [key, m] of moving) {
          const k = progress(m);
          const e = m.ease(k);
          sim.set(m.id, m.field, k >= 1 ? m.to : m.log ? m.from * (m.to / m.from) ** e : m.from + (m.to - m.from) * e);
          if (k >= 1) moving.delete(key);
        }
        for (const tw of tweens) {
          const k = progress(tw);
          tw.apply(tw.ease(k));
          if (k >= 1) tweens.delete(tw);
        }
        sim.advance(dt);
      });
      for (const fn of after) fn();
    },
  };
  return director;
}
