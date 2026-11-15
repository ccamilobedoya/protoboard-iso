// Draw the exported circuit as a schematic in Falstad (bundleable; see falstad.js).
//
//   layoutFalstad(items, { ground, voltages, merges }) → lines of CircuitJS text
//
// items: what the devices wrote, without coordinates:
//   { kind: 'two', code, nodes: [a, b], fields, flags }    a two-lead element, first post at a
//   { kind: 'bjt', nodes: { c, b, e }, pnp, beta, model }
//   { kind: 'mosfet', nodes: { d, g, s }, flags, vth, k }
//   { kind: 'pot', nodes: { one, wiper, three }, fields }
// merges: pairs of groups joined by an ideal wire (a jumper): one net in the drawing.
//
// The drawing, as a textbook schematic:
// - Every net is a row, a horizontal wire, ordered by its DC voltage (`voltages`, from the kit):
//   the highest on top, the lowest at the bottom. Current flows down the page.
// - Two-lead elements stand vertically between the rows of their two nets. Elements in series (a
//   net with only those two, one above and one below) share a column, end to end.
// - A transistor takes two columns: its base (gate) goes left and down or up to its row, its
//   collector and emitter (drain and source) straight to theirs. A potentiometer stands centred on
//   a half row, its wiper wired to the right.
// - Columns follow the circuit from the supplies outwards, so connected parts sit side by side.
// - Each net carries one label with the kit's name for it ("T+", "9:f-j"): where it is on the
//   breadboard, and what the cross-check reads (getNodeVoltage). A ground symbol on the ground.
// Posts touch only at their ends (Falstad joins nothing else), and nothing sits on a half row but
// transistor bases and potentiometer wipers, so a row's wire never runs along another drawing.

const ROW = 96;
const COL = 96;
const HALF = 48;
const TOP = 64;
const LEFT = 64;
const ESCAPE = 4; // LabeledNodeElm.FLAG_ESCAPE
const RAIL = /^[A-Z][+\-−]$/; // any rail id of the board: T+, B-, U+, U-

export const escapeName = (s) => (s.length ? String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/ /g, '\\s').replace(/\+/g, '\\p').replace(/=/g, '\\q').replace(/#/g, '\\h').replace(/&/g, '\\a').replace(/\r/g, '\\r') : '\\0');

const nodesOf = (item) => (Array.isArray(item.nodes) ? item.nodes : Object.values(item.nodes));

export function layoutFalstad(items, { ground, voltages = {}, merges = [] }) {
  // Nets: groups joined by jumpers are one. Its name: ground, else a rail, else the first.
  const parent = new Map();
  const root = (n) => {
    while (parent.has(n)) n = parent.get(n);
    return n;
  };
  const rank = (n) => (n === ground ? 0 : RAIL.test(n) ? 1 : 2);
  for (const [a, b] of merges) {
    const [ra, rb] = [root(a), root(b)];
    if (ra === rb) continue;
    if (rank(rb) < rank(ra)) parent.set(ra, rb);
    else parent.set(rb, ra);
  }
  const net = (n) => root(n);
  const gnd = net(ground);
  const resolved = items.map((it) => {
    const nodes = Array.isArray(it.nodes) ? it.nodes.map(net) : Object.fromEntries(Object.entries(it.nodes).map(([k, v]) => [k, net(v)]));
    return { ...it, nodes };
  });

  // Every net in use, in order of appearance; its voltage from the kit, or between its neighbours.
  const nets = [];
  const seen = new Set();
  for (const it of resolved) for (const n of nodesOf(it)) if (!seen.has(n)) seen.add(n), nets.push(n);
  if (!seen.has(gnd)) nets.push(gnd);
  const volt = new Map();
  for (const [name, v] of Object.entries(voltages)) if (Number.isFinite(v) && !volt.has(net(name))) volt.set(net(name), v);
  const neighbours = new Map(nets.map((n) => [n, new Set()]));
  for (const it of resolved) for (const a of nodesOf(it)) for (const b of nodesOf(it)) if (a !== b) neighbours.get(a).add(b);
  for (let pass = 0; pass < nets.length; pass++) {
    let changed = false;
    for (const n of nets) {
      if (volt.has(n)) continue;
      const known = [...neighbours.get(n)].filter((m) => volt.has(m)).map((m) => volt.get(m));
      if (known.length) volt.set(n, known.reduce((s, v) => s + v, 0) / known.length), (changed = true);
    }
    if (!changed) break;
  }
  const byVoltage = nets.map((n, i) => ({ n, i, v: volt.get(n) ?? 0 }));
  byVoltage.sort((p, q) => q.v - p.v || (p.n === gnd) - (q.n === gnd) || p.i - q.i);
  const rowY = new Map(byVoltage.map(({ n }, k) => [n, TOP + k * ROW]));
  const y = (n) => rowY.get(n);

  // Series nets: two two-lead elements and nothing else, one from above and one from below.
  const ends = new Map(nets.map((n) => [n, []]));
  for (const it of resolved) for (const n of nodesOf(it)) ends.get(n).push(it);
  const series = new Set();
  for (const n of nets) {
    const list = ends.get(n);
    if (n === gnd || list.length !== 2 || list.some((it) => it.kind !== 'two' || it.nodes[0] === it.nodes[1])) continue;
    const others = list.map((it) => y(it.nodes[0] === n ? it.nodes[1] : it.nodes[0]));
    if (Math.min(...others) < y(n) && Math.max(...others) > y(n)) series.add(n);
  }

  // Units: chains of two-lead elements (one column), transistors (two), potentiometers (one).
  const chainOf = new Map();
  const units = [];
  for (const it of resolved) {
    if (it.kind !== 'two') {
      units.push({ kind: it.kind, items: [it] });
      continue;
    }
    if (chainOf.has(it)) continue;
    const chain = { kind: it.nodes[0] === it.nodes[1] ? 'loop' : 'chain', items: [] };
    const stack = [it];
    while (stack.length) {
      const cur = stack.pop();
      if (chainOf.has(cur)) continue;
      chainOf.set(cur, chain);
      chain.items.push(cur);
      for (const n of cur.nodes) if (series.has(n)) for (const other of ends.get(n)) if (!chainOf.has(other)) stack.push(other);
    }
    chain.items.sort((p, q) => Math.min(...p.nodes.map(y)) - Math.min(...q.nodes.map(y)));
    units.push(chain);
  }
  for (const u of units) u.nets = [...new Set(u.items.flatMap(nodesOf))];

  // Columns: the supplies first, then outwards from the nets already placed.
  const placed = [];
  const done = new Set();
  const queue = [];
  const place = (u) => {
    if (done.has(u)) return;
    done.add(u);
    placed.push(u);
    queue.push(...u.nets);
  };
  for (const u of units) if (u.items.some((it) => it.code === 'v')) place(u);
  if (!placed.length && units.length) place(units[0]);
  const top = (u) => Math.min(...u.nets.map(y));
  const bottom = (u) => Math.max(...u.nets.map(y));
  queue.sort((a, b) => y(a) - y(b)); // the supplies' nets, top first
  for (let k = 0; k < queue.length || placed.length < units.length; k++) {
    if (k >= queue.length) {
      place(units.find((u) => !done.has(u)));
      continue;
    }
    const n = queue[k];
    units.filter((u) => !done.has(u) && u.nets.includes(n)).sort((p, q) => top(p) - top(q) || bottom(p) - bottom(q)).forEach(place);
  }

  // Drawing, for one order of the columns. Score: crossings of a row's wire with something
  // vertical (an element, a lead's wire), then the total length of the rows' wires.
  const draw = (order) => {
    const lines = [];
    const attach = new Map(nets.map((n) => [n, new Set()])); // net → x of the points on its row
    const spots = new Map(); // net → a point for its label, where it has no row wire
    const verticals = []; // [x, y1, y2]: what a row's wire may cross
    const wire = (x1, y1, x2, y2) => {
      if (x1 === x2 && y1 === y2) return;
      lines.push(`w ${x1} ${y1} ${x2} ${y2} 0`);
      if (x1 === x2) verticals.push([x1, Math.min(y1, y2), Math.max(y1, y2)]);
    };
    // The half row between rows top and bottom nearest to the row `want`.
    const halfRow = (a, b, want) => {
      const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
      if (hi - lo < ROW) return lo + HALF;
      const k = Math.round((Math.min(Math.max(want, lo + HALF), hi - HALF) - lo - HALF) / ROW);
      return lo + HALF + k * ROW;
    };
    let x = LEFT;
    for (const u of order) {
      if (u.kind === 'chain' || u.kind === 'loop') {
        for (const it of u.items) {
          const [a, b] = it.nodes;
          const tail = `${it.flags ?? 0} ${(it.fields ?? []).join(' ')}`.trimEnd();
          if (a === b) {
            // Both leads on one net (shorted by a jumper): a small loop beside the row.
            lines.push(`${it.code} ${x} ${y(a)} ${x} ${y(a) + HALF} ${tail}`);
            wire(x, y(a) + HALF, x + HALF, y(a) + HALF);
            wire(x + HALF, y(a) + HALF, x + HALF, y(a));
            attach.get(a).add(x).add(x + HALF);
            continue;
          }
          lines.push(`${it.code} ${x} ${y(a)} ${x} ${y(b)} ${tail}`);
          verticals.push([x, Math.min(y(a), y(b)), Math.max(y(a), y(b))]);
          for (const n of [a, b]) {
            if (series.has(n)) spots.set(n, [x, y(n)]);
            else attach.get(n).add(x);
          }
        }
        x += COL;
      } else if (u.kind === 'bjt' || u.kind === 'mosfet') {
        const it = u.items[0];
        const bjt = u.kind === 'bjt';
        const [up, down, side] = bjt ? [it.nodes.c, it.nodes.e, it.nodes.b] : [it.nodes.d, it.nodes.s, it.nodes.g];
        const x2 = x + COL;
        const ym = halfRow(y(up), y(down), y(side));
        const wantUp = y(up) <= y(down); // collector (drain) post above the emitter (source)
        const yUp = ym + (wantUp ? -16 : 16);
        const yDown = ym + (wantUp ? 16 : -16);
        if (bjt) {
          const flip = (it.pnp === 1) !== wantUp; // natural: npn collector up, pnp down
          lines.push(`t ${x2 - HALF} ${ym} ${x2} ${ym} ${flip ? 1 : 0} ${it.pnp} 0 0 ${it.beta} ${it.model}`);
        } else {
          lines.push(`f ${x2 - HALF} ${ym} ${x2} ${ym} ${it.flags | (wantUp ? 0 : 8)} ${it.vth} ${it.k}`); // natural: drain up
        }
        wire(x2, yUp, x2, y(up));
        wire(x2, yDown, x2, y(down));
        wire(x2 - HALF, ym, x, ym);
        wire(x, ym, x, y(side));
        attach.get(up).add(x2);
        attach.get(down).add(x2);
        attach.get(side).add(x);
        x += 2 * COL;
      } else if (u.kind === 'pot') {
        const it = u.items[0];
        const { one, wiper, three } = it.nodes;
        const [lo, hi] = [Math.min(y(one), y(three)), Math.max(y(one), y(three))];
        const ym = halfRow(lo, hi, y(wiper));
        const L = Math.max(16, Math.min(ym - lo, hi - ym));
        const [y1, y3] = y(one) <= y(three) ? [ym - L, ym + L] : [ym + L, ym - L];
        lines.push(`174 ${x} ${y1} ${x + 16} ${y3} 0 ${it.fields.join(' ')}`);
        verticals.push([x, lo, hi]);
        wire(x, y(one), x, y1);
        wire(x, y3, x, y(three));
        wire(x + 16, ym, x + HALF, ym);
        wire(x + HALF, ym, x + HALF, y(wiper));
        attach.get(one).add(x);
        attach.get(three).add(x);
        attach.get(wiper).add(x + HALF);
        x += COL;
      }
    }

    // Each row's wire, from point to point, with the net's label where nothing crosses it.
    const label = (n, lx, ly, textRight) => lines.push(`207 ${lx} ${ly} ${textRight ? lx - 16 : lx} ${textRight ? ly : ly + 16} ${ESCAPE} ${escapeName(n)}`);
    for (const n of nets) {
      const row = y(n);
      const xs = [...attach.get(n)].sort((a, b) => a - b);
      if (xs.length >= 2) {
        const crossed = (a, b) => verticals.some(([vx, y1, y2]) => vx > a && vx < b && y1 < row && y2 > row);
        let k = xs.findIndex((a, i) => i < xs.length - 1 && !crossed(a, xs[i + 1]));
        if (k < 0) k = 0;
        const mid = Math.round((xs[k] + xs[k + 1]) / 32) * 16;
        const points = [...xs.slice(0, k + 1), mid, ...xs.slice(k + 1)];
        for (let i = 0; i < points.length - 1; i++) wire(points[i], row, points[i + 1], row);
        label(n, mid, row, false);
      } else if (spots.has(n)) {
        label(n, ...spots.get(n), true);
      } else if (xs.length === 1) {
        label(n, xs[0], row, true);
      }
      if (n === gnd && xs.length) lines.push(`g ${xs[0]} ${row} ${xs[0]} ${row + 16} 0 0`);
    }
    let crossings = 0;
    let length = 0;
    for (const n of nets) {
      const xs = [...attach.get(n)];
      if (xs.length < 2) continue;
      const [a, b] = [Math.min(...xs), Math.max(...xs)];
      length += b - a;
      const row = y(n);
      crossings += verticals.filter(([vx, y1, y2]) => vx > a && vx < b && y1 < row && y2 > row).length;
    }
    return { lines, score: crossings * 1e6 + length };
  };

  // Better orders: move one column at a time (the supplies stay first) while it lowers the score.
  const fixed = placed.filter((u) => u.items.some((it) => it.code === 'v')).length;
  let order = placed;
  let best = draw(order);
  for (let pass = 0; pass < 8; pass++) {
    let improved = false;
    for (let i = fixed; i < order.length; i++) {
      for (let j = fixed; j < order.length; j++) {
        if (i === j) continue;
        const candidate = [...order];
        const [u] = candidate.splice(i, 1);
        candidate.splice(j, 0, u);
        const result = draw(candidate);
        if (result.score < best.score) {
          best = result;
          order = candidate;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return best.lines;
}
