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

// The whole time of a move (anticipation adds its recoil) and its curve over that time. `curve`, a
// step's own cubic-bezier, replaces the move's (a cut stays a cut).
export function moveTiming(name, ms, curve) {
  const m = MOVES[name] ?? MOVES.cut;
  const own = ms ?? m.ms;
  if (!m.curve) return { ms: name === 'breath' ? own : 0, ease: (k) => (k >= 1 ? 1 : 0) };
  const ease = bezier(curve ?? m.curve);
  if (!m.back) return { ms: own, ease };
  const total = m.back + own;
  const split = m.back / total;
  return { ms: total, ease: (k) => (k < split ? -m.recoil * Math.sin((Math.PI * k) / split) : ease((k - split) / (1 - split))) };
}

// The moves built from those (stage and video, V6; the plan's table of moves): sizes and times.
// M8: a halo rises to its brightness in a hit instead of appearing (and goes out at once: an LED is
// fast, what the eye follows is the light coming).
export const LIGHT = { ms: 180, curve: MOVES.hit.curve };
// M12: each line of a caption rises from its baseline behind a mask (from `rise` % of its height under
// it), fading in as it comes, so no frame shows half a line cut by the mask; 90 ms after the one
// above; the caption before leaves first, in 200 ms.
export const CAPTION = { in: 400, stagger: 90, out: 200, curve: MOVES.arrival.curve, rise: 60 };
// A caption's emphasis (`em`): those words of its text or line in the accent, this much larger.
export const EMPHASIS = { scale: 1.15 };
// A card (a timeline's `card`): a sentence alone over the whole screen, `in` ms to come in, `hold` ms
// whole (min…max), `out` ms to leave.
export const CARD = { in: 250, hold: 1500, out: 250, min: 300, max: 5000 };
// A recording's `led` events: an LED turns on above this share of its rated current and off under
// `off` (two levels, so a reading at the edge never flickers into many events).
export const LED_EVENT = { on: 0.1, off: 0.03 };
// M15: a part starts 12 mm above the board and comes down to its holes (an arrival of 700 ms);
// when it lands the current starts (M6, a ramp of 600 ms) and the lights come on (M8).
export const INSERT = { mm: 12, ms: 700, ramp: 600 };
// M16: a part raised to set it apart in a video (a timeline's `raise`): 3 mm by default, along its
// move (an arrival); it stays up until a `raise` to 0 mm. Raised, it is still in the circuit.
// The oscilloscope's box of a portrait recording (M11, body.with-scope; page/style.js), as shares of
// the height. Under the circuit by default, from 56 % to 75 %: the frame then also leaves that band
// free, and the circuit lies between 40 and 56 %. On top (a probe's place "top", body.scope-top),
// from 28 % (2 % under a caption of two lines, which ends at about 26 %) to 40 %, in the empty band
// between the caption and the circuit: the circuit keeps the whole band from 40 to 75 %. In
// landscape the box lies under the caption, in the left half, either way.
export const SCOPE_BOX = { bottom: { top: 0.56, bottom: 0.75 }, top: { top: 0.28, bottom: 0.4 } };
export const RAISE = { mm: 3, max: 12 };
// A nudge: a part the voice names as a cause, while the subject is another, rises a little and comes
// back, to be noticed without taking the focus or the label (a timeline's `nudge`; the video's
// version of a pulse on load). `mm` 1…4 (3), `ms` 600…1200 (900): up in the first `rise` of it along
// a quint out, a rest, and down in the last `rise` along the opposite curve.
export const NUDGE = { mm: 3, min: 1, max: 4, ms: 900, msMin: 600, msMax: 1200, rise: 0.3, curve: [0.22, 1, 0.36, 1] };
// M4, M5: the circuit builds itself (a timeline's assemble): one part after the other, `gap` ms
// apart, each coming down like an insert or, a wire, drawn from one end to the other, in `ms`; the
// current starts when the last one is in.
// M17: a part alone on its pedestal (a timeline's `scene` in mode part, a video about one part): the
// board and the other parts unseen, the part raised 3 mm over the hole grid. M18: back to the board
// (`land`, a travel): the part comes down while the camera follows it, so it stays still on screen
// and the board rises under it.
export const SCENE = { mm: 3 };
// A scene's `enter` "drop": the part falls onto its pedestal from `drop` mm in `ms`, along a curve that
// overshoots a little (a small bounce); a scene's `push` closes in until the next camera step, at most
// `pushMax` ms (a push's longest), along the push's curve.
export const SCENE_ENTER = { drop: 8, ms: 700, curve: [0.34, 1.4, 0.64, 1], pushMax: 8000 };
// A land (M18) brings the board in opaque: it slides up from below the frame under a veil of the
// stage's colour (`dim`, the veil's opacity), and lightens in `ramp` ms (a ramp, never a jump) once the
// camera has opened: at the end of the first frame step after the land, else at the land's end. A focus
// set during the land shows its strips and coordinates only then, fading in over `reveal` ms.
export const LAND = { dim: 0.9, ramp: 700, reveal: 300 };
// A recording names the told part with at least this many px of letter at 1080 px (the frame's short
// side), however far the camera is: the label scales about its anchor (48: its capitals about as tall
// as a 44 px text's).
export const LABEL_MIN_PX = 48;
export const ASSEMBLE = { gap: 1100, ms: 700, min: 300, max: 3000 };
// M7: a flash runs the current's path from + to − (a timeline's pulse), each piece lit for this share
// of the run.
export const PULSE = { width: 0.25, size: 4.5 };
// M7's colours by name (the theme's tokens); a step may also give one as #rrggbb.
export const PULSE_COLORS = { pulse: 'var(--pulse)', accent: 'var(--accent)', value: 'var(--cap-value)', voltage: 'var(--trace-v)', current: 'var(--trace-i)' };
