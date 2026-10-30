// The rhythm of a timeline (stage and video, V2; docs/en/stage-and-video.md, "Rhythm"): seven named
// moves, each a duration (its default and the range a step may ask for with `ms`) and a curve.
// One table for the page's player (tour.js), the checks (src/tour.js) and the CSS tokens
// (--move-<name>-ms, --move-<name>-ease in page/style.js), so a curve is never written twice.
// A curve is a cubic-bezier's four numbers; null means none (the move happens at once, or is still).

export const MOVES = {
  cut: { ms: 0, min: 0, max: 0, curve: null },
  arrival: { ms: 750, min: 600, max: 900, curve: [0.22, 1, 0.36, 1] },
  travel: { ms: 1500, min: 1200, max: 1800, curve: [0.76, 0, 0.24, 1] },
  push: { ms: 5000, min: 3000, max: 8000, curve: [0.33, 1, 0.68, 1] },
  hit: { ms: 150, min: 120, max: 180, curve: [0.22, 1, 0.36, 1] },
  breath: { ms: 800, min: 400, max: 1200, curve: null },
  // 250 ms back by 8 % of the way (half a sine), then an arrival: `ms` is the arrival's.
  anticipation: { ms: 750, min: 600, max: 900, curve: [0.22, 1, 0.36, 1], back: 250, recoil: 0.08 },
};

// The cubic-bezier(x1, y1, x2, y2) of CSS as a function of time k in 0…1: x(s) solved for s by
// Newton's method (bisection when the slope is flat), then y(s).
export function bezier([x1, y1, x2, y2]) {
  const at = (a, b, s) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  const slope = (a, b, s) => 3 * a * (1 - s) ** 2 + 6 * (b - a) * s * (1 - s) + 3 * (1 - b) * s * s;
  return (k) => {
    if (k <= 0) return 0;
    if (k >= 1) return 1;
    let s = k;
    for (let i = 0; i < 8; i++) {
      const d = slope(x1, x2, s);
      if (Math.abs(d) < 1e-6) break;
      s -= (at(x1, x2, s) - k) / d;
    }
    if (!(s >= 0 && s <= 1) || Math.abs(at(x1, x2, s) - k) > 1e-6) {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 40; i++) {
        s = (lo + hi) / 2;
        if (at(x1, x2, s) < k) lo = s;
        else hi = s;
      }
    }
    return at(y1, y2, s);
  };
}

// The whole time of a move (anticipation adds its recoil) and its curve over that time.
export function moveTiming(name, ms) {
  const m = MOVES[name] ?? MOVES.cut;
  const own = ms ?? m.ms;
  if (!m.curve) return { ms: name === 'breath' ? own : 0, ease: (k) => (k >= 1 ? 1 : 0) };
  const ease = bezier(m.curve);
  if (!m.back) return { ms: own, ease };
  const total = m.back + own;
  const split = m.back / total;
  return { ms: total, ease: (k) => (k < split ? -m.recoil * Math.sin((Math.PI * k) / split) : ease((k - split) / (1 - split))) };
}
