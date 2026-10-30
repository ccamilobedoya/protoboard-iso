// A clock for the page tests: installed in a jsdom window before the page's script runs, it
// replaces the window's timers, Date.now and performance.now, so a test moves time by hand
// (clock.tick(380)) instead of waiting for it. Each window gets its own clock; nothing global.
// Events created by a test carry clock.now() as their timeStamp through clock.stamp(event).
// node:test's mock.timers cannot do this: a jsdom window has timers of its own.

// performance.now() and event timeStamps count from the page's origin, as in a browser, where
// they are never 0 by the time a person taps: ORIGIN keeps code that tests `if (!last)` honest.
const ORIGIN = 1000;

export function installClock(window, start = 1_000_000) {
  let now = start;
  let nextId = 1;
  const timers = new Map(); // id → { at, fn, args, every }
  const add = (fn, ms, args, every) => {
    const id = nextId++;
    timers.set(id, { at: now + Math.max(0, Number(ms) || 0), fn, args, every: every ? Math.max(1, Number(ms) || 0) : 0 });
    return id;
  };
  window.setTimeout = (fn, ms, ...args) => add(fn, ms, args, false);
  window.setInterval = (fn, ms, ...args) => add(fn, ms, args, true);
  window.clearTimeout = window.clearInterval = (id) => timers.delete(id);
  window.Date.now = () => now;
  if (window.performance) window.performance.now = () => now - start + ORIGIN;
  const clock = {
    now: () => now,
    // Runs every timer due within ms, in order of time, then leaves the clock ms later.
    tick(ms = 0) {
      const end = now + ms;
      for (;;) {
        const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        const [id, t] = due;
        now = Math.max(now, t.at);
        if (t.every) t.at += t.every;
        else timers.delete(id);
        t.fn(...t.args);
      }
      now = end;
    },
    pending: () => timers.size,
    // An event with the clock's time, as the browser stamps a real one.
    stamp(event) {
      Object.defineProperty(event, 'timeStamp', { value: now - start + ORIGIN, configurable: true });
      return event;
    },
  };
  return clock;
}
