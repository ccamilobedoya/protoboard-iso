// How fast a circuit's simulated time runs in the page, its step and the oscilloscope's window
// (stage 3; page/client/live.js). Shared with scripts/render-frames.js --parts, so whoever writes a
// timeline knows how much simulated time a second of video shows (a probe's `window`).
//
//   paceOf(taus, periods, program) → { h, perSecond, window, periodic }
//
// With a signal generator, its period sets the pace: one period of the slowest per second, at
// least 100 steps per period, a window of 4 periods. Otherwise the time constants: the longest
// every 2 s, a window of 5 of them. Nothing that changes by itself (no C or L): no step, and the
// oscilloscope runs on the wall clock with a window of WALL_WINDOW s. A board's program runs in
// real time, its delay() in seconds as on the bench: steps of 1 ms, or shorter for a fast RC beside
// it (never under 0.1 ms, so the page keeps up).

export const WALL_WINDOW = 10; // s of the oscilloscope when nothing changes by itself
const stepFor = (list) => Math.max(Math.min(...list) / 50, Math.max(...list) / 5000);

export function paceOf(taus, periods, program = false) {
  if (program) {
    const h = Math.max(1e-4, Math.min(1e-3, taus.length ? stepFor(taus) : 1e-3, periods.length ? Math.min(...periods) / 100 : 1e-3));
    return { h, perSecond: 1, window: Math.max(4, ...periods.map((p) => 4 * p)), periodic: periods.length > 0 };
  }
  if (periods.length) {
    const h = Math.min(taus.length ? stepFor(taus) : Infinity, Math.min(...periods) / 100);
    return { h, perSecond: Math.max(...periods), window: 4 * Math.max(...periods), periodic: true };
  }
  if (taus.length) return { h: stepFor(taus), perSecond: Math.max(...taus) / 2, window: 5 * Math.max(...taus) };
  return { h: 0, perSecond: 0, window: WALL_WINDOW };
}
