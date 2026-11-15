// Which half of the board each part goes in, decided from the nets before anything is placed
// (step 2a of src/layout.js; docs/en/layout.md "Sides"). Pure and deterministic.
//
//   assignSides({ elements, nets, sides, across, slack, crossWeight, leanWeight }) → Map(element id → side)
//
// The breadboard's centre channel splits it in two halves, T (rows f–j, next to the T rails) and B
// (rows a–e). A net with pins on both halves needs a jumper (or a part) across the channel, so this
// is a partition that minimises the nets cut, as in placement tools (Fiduccia–Mattheyses), with a
// soft balance so that a long circuit fills both halves side by side. A double board has four
// sides (`sides`, front first: B, T, K, U); on one board there are two:
//
//   cost = crossWeight × (sides each net spans, minus one) + leanWeight × (elements off their lean)
//          + max(0, columns on the fullest side − columns on the emptiest − slack)
//
// - An element is a part, or one lead of a part beside the board (each lead goes where it likes).
//   Its pins sit on the element's side (`rel` 0), across the channel from it (`rel` 1, `across`: a
//   chip straddling the channel, pin 1's row on the element's side) or on a side of their own
//   (`at`: a board placed by pin 1, which may straddle the joint of a double board); `fixed`
//   elements do not move (a button, a board placed by pin 1). `weight` is about how many columns it
//   takes on its side. `lean`: the side an element is better seen on (a lead from a board lying
//   behind the board, a potentiometer whose knob faces the front): any other costs leanWeight.
// - A net's rails pull its pins to their side (`anchor`); a net with rails on several sides pulls
//   nowhere, since each side reaches its own rail.
// - Start: each free element in the order given on the side that costs less given those before it
//   (ties: the lighter side, then the first). Then FM passes: move the free element whose move (to
//   any other side) gains most (ties by order), lock it, until all moved; keep the best prefix; stop
//   when a pass gains nothing.

export function assignSides({ elements, nets, sides = ['B', 'T'], across = { T: 'B', B: 'T' }, slack = 10, crossWeight = 8, leanWeight = crossWeight * 1.5 }) {
  const side = new Map();
  for (const e of elements) if (e.fixed) side.set(e.id, e.fixed);
  const pinsOf = new Map(); // pin key → [element, pin]
  for (const e of elements) for (const p of e.pins) pinsOf.set(p.key, [e, p]);
  // The side a pin is on: its own (`at`, a fixed element across the joint of a double board), or
  // its element's, or across the channel from it (`rel` 1).
  const sideOf = (e, p) => p.at ?? (p.rel ? across[side.get(e.id)] : side.get(e.id));

  const cost = () => {
    let crossings = 0;
    for (const n of nets) {
      const halves = new Set(n.anchor ? [n.anchor] : []);
      for (const key of n.pins) {
        const [e, p] = pinsOf.get(key) ?? [];
        const s = e && side.get(e.id) && sideOf(e, p);
        if (s) halves.add(s);
      }
      if (halves.size > 1) crossings += halves.size - 1;
    }
    const w = Object.fromEntries(sides.map((s) => [s, 0]));
    let off = 0;
    for (const e of elements) {
      const s = side.get(e.id);
      if (s && !e.straddles) w[s] += e.weight;
      if (s && e.lean && s !== e.lean) off++;
    }
    const ws = Object.values(w);
    return crossWeight * crossings + leanWeight * off + Math.max(0, Math.max(...ws) - Math.min(...ws) - slack);
  };
  const weightOn = (s, except) => elements.reduce((sum, e) => sum + (e !== except && side.get(e.id) === s && !e.straddles ? e.weight : 0), 0);

  const free = elements.filter((e) => !e.fixed);
  for (const e of free) {
    const tries = sides.map((s) => {
      side.set(e.id, s);
      return { s, c: cost() };
    });
    const least = Math.min(...tries.map((x) => x.c));
    // Ties: the lighter side (without this element), then the first in order. A chip across the
    // channel counts as lighter off the first side by its own weight, as it always has.
    const load = (s) => weightOn(s, e) - (e.straddles && s !== sides[0] ? e.weight : 0);
    const tied = tries.filter((x) => x.c === least).map((x) => x.s);
    side.set(e.id, tied.reduce((best, s) => (load(s) < load(best) ? s : best)));
  }

  for (let pass = 0; pass < 4 && free.length; pass++) {
    const start = cost();
    const locked = new Set();
    const moves = [];
    let current = start;
    let best = { at: 0, c: start };
    while (locked.size < free.length) {
      let pick = null;
      for (const e of free) {
        if (locked.has(e.id)) continue;
        const was = side.get(e.id);
        for (const to of sides) {
          if (to === was) continue;
          side.set(e.id, to);
          const c = cost();
          if (!pick || c < pick.c) pick = { e, to, from: was, c };
        }
        side.set(e.id, was);
      }
      side.set(pick.e.id, pick.to);
      locked.add(pick.e.id);
      moves.push(pick);
      current = pick.c;
      if (current < best.c) best = { at: moves.length, c: current };
    }
    // Undo the moves after the best prefix.
    for (const m of moves.slice(best.at).reverse()) side.set(m.e.id, m.from);
    if (best.c >= start) break;
  }
  return side;
}
