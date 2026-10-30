// The director (stage and video, V1; docs/en/stage-and-video.md): one clock that owns the time of
// a page that tells a circuit. Only with ?director=1 in the link and only in a live page; every
// other page keeps its own loop (live.js) and does not change.
//
// tick(ms) advances, in this order: the cues due (start(cues): { at, run(director) }, the hook the
// timeline of V2 plays through), the camera, the controls being moved, and the simulation with its
// dots, glow, colours and tags, all written once per tick. Nothing in a tick reads the system clock:
// a sequence played with tick(1000/30) gives the same frames every time. In the page a
// requestAnimationFrame loop calls tick with the time that passed (live.js); a recorder calls it
// with 1000/fps.
//
// The director moves things on purpose, so it ignores prefers-reduced-motion: what a learner's
// page does under reduced motion is the timeline player's choice (V2), not the clock's.

import { clampBox, frameAt, easeOut, numbers, partBox, setBox } from './view.js';

export const wantsDirector = (search) => new URLSearchParams(search).get('director') === '1';

// `sim`: what live.js lends the director — controls() (engine.controls()), set(id, field, value)
// (controls.js, so the rows in the card and the panel follow), advance(ms) (the page's frame for
// that much time: simulation, dots, and a repaint) and batch(fn) (inside fn a control's change
// does not repaint: advance does, once, at the end).
export function createDirector(page, sim) {
  let time = 0;
  let cues = [];
  let camera = null; // { from, to, t0, ms, ease }
  const moving = new Map(); // id|field → { id, field, from, to, log, t0, ms, ease }

  // A target is a box [x, y, w, h], 'board' or 'parts' (the page's two frames) or a part's id.
  function boxOf(target) {
    if (Array.isArray(target)) return target;
    const svg = page.current();
    if (target === 'board' || target === 'parts') return numbers(svg.dataset[target]);
    return partBox(page, target);
  }
  const progress = (m) => (m.ms > 0 ? Math.min(1, (time - m.t0) / m.ms) : 1);

  const director = {
    get time() {
      return time;
    },
    // From t = 0 with these cues (run in order of `at`, those with the same `at` in the order given).
    start(list = []) {
      time = 0;
      cues = list.map((c, k) => ({ ...c, k })).sort((a, b) => a.at - b.at || a.k - b.k);
      camera = null;
      moving.clear();
    },
    // Move the frame there in `ms` along `ease` (k → share of the way), from where it is now.
    frame(target, { ms = 0, ease = easeOut } = {}) {
      const box = boxOf(target);
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
      while (cues.length && cues[0].at <= end) {
        const cue = cues.shift();
        time = Math.max(time, cue.at);
        cue.run(director);
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
        sim.advance(dt);
      });
    },
  };
  return director;
}
