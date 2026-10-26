// Modified nodal analysis (MNA): the numerical core of the simulator.
//
// Unknowns are the node voltages (ground excluded) and one current per voltage source.
// Each element "stamps" its share of the equations A·x = b. Non-linear elements (diodes,
// transistors) stamp a straight-line approximation around the present guess; Newton's
// method repeats until nothing moves. Capacitors become a conductance plus a current source
// per time step (backward Euler). No dependencies: dense matrices, partial pivoting.
//
// Sign conventions: an element current "from a to b" leaves node a through the element.
// Device terminal currents are positive *into* the device.

import { VT, GMIN } from './models.js';

// ── Linear algebra ──────────────────────────────────────────────────────────────────

// Gaussian elimination with partial pivoting. Returns null if the matrix is singular.
export function solveLinear(A, b) {
  return solveInPlace(A.map((row) => Float64Array.from(row)), Float64Array.from(b));
}

// The same, overwriting M (rows of Float64Array) and x (the right-hand side, then the answer).
// Newton uses it on the stamper's own buffers, which it clears for the next iteration anyway.
export function solveInPlace(M, x) {
  const n = x.length;
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    if (Math.abs(M[p][k]) < 1e-300) return null;
    if (p !== k) {
      [M[p], M[k]] = [M[k], M[p]];
      [x[p], x[k]] = [x[k], x[p]];
    }
    for (let i = k + 1; i < n; i++) {
      const f = M[i][k] / M[k][k];
      if (f === 0) continue;
      for (let j = k; j < n; j++) M[i][j] -= f * M[k][j];
      x[i] -= f * x[k];
    }
  }
  for (let k = n - 1; k >= 0; k--) {
    let s = x[k];
    for (let j = k + 1; j < n; j++) s -= M[k][j] * x[j];
    x[k] = s / M[k][k];
  }
  return Array.from(x);
}

// ── Stamping ────────────────────────────────────────────────────────────────────────

// Node index −1 is ground: rows and columns for it are simply skipped.
export class Stamper {
  constructor(size) {
    this.A = Array.from({ length: size }, () => new Float64Array(size));
    this.b = new Float64Array(size);
  }
  reset() {
    for (const row of this.A) row.fill(0);
    this.b.fill(0);
  }
  add(r, c, v) {
    if (r >= 0 && c >= 0) this.A[r][c] += v;
  }
  rhs(r, v) {
    if (r >= 0) this.b[r] += v;
  }
  conductance(a, b, g) {
    this.add(a, a, g);
    this.add(b, b, g);
    this.add(a, b, -g);
    this.add(b, a, -g);
  }
  // A constant current i flowing from a to b through the element.
  current(a, b, i) {
    this.rhs(a, -i);
    this.rhs(b, i);
  }
  // A device with terminal currents I[t] (into the device) and Jacobian J[t][j] = ∂I[t]/∂v[j],
  // linearised at terminal voltages v.
  device(nodes, I, J, v) {
    nodes.forEach((row, t) => {
      let constant = I[t];
      nodes.forEach((col, j) => {
        this.add(row, col, J[t][j]);
        constant -= J[t][j] * v[j];
      });
      this.rhs(row, -constant);
    });
  }
}

const volt = (x, i) => (i >= 0 ? x[i] : 0);

// SPICE's junction limiting: a diode voltage may not jump far up the exponential in one step.
export function pnjlim(vnew, vold, vt, vcrit) {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / vt;
      return arg > 0 ? vold + vt * Math.log(arg) : vcrit;
    }
    return vt * Math.log(vnew / vt);
  }
  return vnew;
}
const vcritOf = (is, vt) => vt * Math.log(vt / (Math.SQRT2 * is));
const limitStep = (vnew, vold, max) => (Math.abs(vnew - vold) > max ? vold + Math.sign(vnew - vold) * max : vnew);

// ── Elements ────────────────────────────────────────────────────────────────────────
// Each element: nodes, links (pairs that conduct in DC, for floating-node detection),
// stamp(st, x, ctx) → true if it limited its voltages (not converged yet),
// currents(x, ctx) → terminal currents into the element, in `nodes` order.

export function resistor(a, b, r) {
  const g = 1 / r;
  return {
    nodes: [a, b],
    links: [[a, b]],
    stamp(st) {
      st.conductance(a, b, g);
      return false;
    },
    currents(x) {
      const i = (volt(x, a) - volt(x, b)) * g;
      return [i, -i];
    },
  };
}

// Backward Euler: i = C·(v − v_prev)/h, a conductance C/h and a current source.
export function capacitor(a, b, c) {
  return {
    nodes: [a, b],
    links: [],
    memory: { kind: 'C', value: c },
    vprev: 0,
    stamp(st, x, ctx) {
      if (!ctx.h) return false;
      const g = c / ctx.h;
      st.conductance(a, b, g);
      st.current(a, b, -g * this.vprev);
      return false;
    },
    currents(x, ctx) {
      const i = ctx.h ? (c / ctx.h) * (volt(x, a) - volt(x, b) - this.vprev) : 0;
      return [i, -i];
    },
    accept(x) {
      this.vprev = volt(x, a) - volt(x, b);
    },
  };
}

// Backward Euler for an inductor: i = i_prev + (h/L)·v, a conductance h/L and a current
// source. In DC it is a plain short (its winding resistance is a separate resistor).
const SHORT = 1e-6;
export function inductor(a, b, l) {
  return {
    nodes: [a, b],
    links: [[a, b]],
    memory: { kind: 'L', value: l },
    iprev: 0,
    stamp(st, x, ctx) {
      if (!ctx.h) {
        st.conductance(a, b, 1 / SHORT);
        return false;
      }
      const g = ctx.h / l;
      st.conductance(a, b, g);
      st.current(a, b, this.iprev);
      return false;
    },
    currents(x, ctx = {}) {
      const v = volt(x, a) - volt(x, b);
      const i = ctx.h ? this.iprev + (ctx.h / l) * v : v / SHORT;
      return [i, -i];
    },
    accept(x, ctx = {}) {
      this.iprev = this.currents(x, ctx)[0];
    },
  };
}

// Ideal voltage source from n (−) to p (+); its current unknown sits at row k.
// x[k] is the current entering the + terminal from the circuit.
export function voltageSource(p, n, k, voltage) {
  return {
    nodes: [p, n],
    links: [[p, n]],
    branch: k,
    voltage,
    stamp(st, x, ctx) {
      st.add(p, k, 1);
      st.add(n, k, -1);
      st.add(k, p, 1);
      st.add(k, n, -1);
      st.rhs(k, this.voltage * (ctx.scale ?? 1));
      return false;
    },
    currents(x) {
      return [x[k], -x[k]];
    },
  };
}

// Current source: `current` amperes leave through + (p) into the circuit and return at n.
export function currentSource(p, n, current) {
  return {
    nodes: [p, n],
    links: [[p, n]],
    current,
    stamp(st, x, ctx) {
      const i = this.current * (ctx.scale ?? 1);
      st.rhs(p, i);
      st.rhs(n, -i);
      return false;
    },
    currents() {
      return [-this.current, this.current];
    },
  };
}

// Shockley junction from a (anode) to k (cathode). With `bv` it also breaks down in reverse
// (a Zener diode): beyond −bv a second exponential, ibv · exp(−(v + bv) / (nbv·Vt)), takes
// the current, and the same junction limiting is applied on that side.
export function junction(a, k, { is, n, bv, ibv = 1e-3, nbv = 1 }) {
  const vt = n * VT;
  const vcrit = vcritOf(is, vt);
  const vtb = nbv * VT;
  const vcritB = bv != null ? vcritOf(ibv, vtb) : 0;
  const evaluate = (v) => {
    const e = Math.exp(Math.min(v / vt, 300));
    let i = is * (e - 1);
    let g = (is * e) / vt;
    if (bv != null) {
      const r = Math.exp(Math.min(-(v + bv) / vtb, 300));
      i -= ibv * r;
      g += (ibv * r) / vtb;
    }
    return { i, g };
  };
  const limit = (vnew, vold) => {
    if (bv != null && vnew < Math.min(0, -bv + 10 * vtb)) {
      return -(pnjlim(-(vnew + bv), -(vold + bv), vtb, vcritB) + bv);
    }
    return pnjlim(vnew, vold, vt, vcrit);
  };
  return {
    nodes: [a, k],
    links: [[a, k]],
    vd: 0,
    stamp(st, x) {
      const vnew = volt(x, a) - volt(x, k);
      const v = limit(vnew, this.vd);
      this.vd = v;
      const { i, g } = evaluate(v);
      st.conductance(a, k, g + GMIN);
      st.current(a, k, i - g * v);
      return Math.abs(v - vnew) > 1e-9;
    },
    currents(x) {
      const v = volt(x, a) - volt(x, k);
      const i = evaluate(v).i + GMIN * v;
      return [i, -i];
    },
  };
}

// Linear regulator from `inp` to `out`, referred to `ref` (GND of a 78xx, ADJ of an LM317):
//   V(out) − V(ref) = softmin(vref, softplus(V(inp) − V(ref) − dropout))
// regulates at vref, and with too little input sits `dropout` below it. The output current
// comes from the input (its unknown sits at row `branch`, given once every node is known);
// the chip's own current, quiescent · tanh(u / 0.5 V), flows from inp to ref.
export function regulatorElement(inp, ref, out, { vref, dropout, quiescent }) {
  const s = 0.05;
  const shape = (u) => {
    const z = (u - dropout) / s;
    const sp = z > 40 ? u - dropout : s * Math.log1p(Math.exp(z));
    const dsp = 1 / (1 + Math.exp(-z));
    const d = sp - vref;
    const f = Math.min(sp, vref) - s * Math.log1p(Math.exp(-Math.abs(d) / s));
    const dfsp = 1 / (1 + Math.exp(Math.min(d / s, 300)));
    return { f, df: dfsp * dsp, regulating: d > 3 * s };
  };
  const iq = (u) => quiescent * Math.tanh(u / 0.5);
  const giq = (u) => (quiescent / 0.5) * (1 - Math.tanh(u / 0.5) ** 2);
  return {
    nodes: [inp, ref, out],
    links: [
      [out, ref],
      [inp, ref],
    ],
    branch: null,
    needsRow: true,
    shape,
    stamp(st, x) {
      const k = this.branch;
      const u = volt(x, inp) - volt(x, ref);
      const { f, df } = shape(u);
      st.add(inp, k, 1);
      st.add(out, k, -1);
      st.add(k, out, 1);
      st.add(k, ref, -1 + df);
      st.add(k, inp, -df);
      st.rhs(k, f - df * u);
      const g = giq(u);
      st.conductance(inp, ref, g);
      st.current(inp, ref, iq(u) - g * u);
      return false;
    },
    currents(x) {
      const io = x[this.branch];
      const q = iq(volt(x, inp) - volt(x, ref));
      return [io + q, -q, -io];
    },
  };
}

// The NE555's latch, output stage and discharge transistor (models.js, TIMERS), between the
// pins as node indices. The latch is a memory: it changes only when a step is accepted, from the
// voltages of that step, so every step solves a linear stage (high: VCC − highDrop through
// highResistance; low: lowLevel through lowResistance; discharge on only while low).
export function timerCore({ gnd, trig, out, reset, ctrl, thr, dis, vcc }, m) {
  const gh = 1 / m.highResistance;
  const gl = 1 / m.lowResistance;
  const gd = 1 / m.dischargeResistance;
  const stage = (q, x) => (q ? gh * (volt(x, out) - volt(x, vcc) + m.highDrop) : gl * (volt(x, out) - volt(x, gnd) - m.lowLevel));
  return {
    nodes: [gnd, trig, out, reset, ctrl, thr, dis, vcc],
    links: [
      [out, vcc],
      [out, gnd],
      [dis, gnd],
    ],
    q: 1, // switched on with the timing capacitor empty: TRIG low, output high
    stamp(st) {
      if (this.q) {
        st.conductance(out, vcc, gh);
        st.current(out, vcc, gh * m.highDrop);
      } else {
        st.conductance(out, gnd, gl);
        st.current(out, gnd, -gl * m.lowLevel);
      }
      st.conductance(dis, gnd, this.q ? GMIN : gd);
      return false;
    },
    // Into the element at each node, in `nodes` order.
    currents(x) {
      const io = stage(this.q, x);
      const id = (volt(x, dis) - volt(x, gnd)) * (this.q ? GMIN : gd);
      return [(this.q ? 0 : -io) - id, 0, io, 0, 0, 0, id, this.q ? -io : 0];
    },
    accept(x) {
      const v = (n) => volt(x, n) - volt(x, gnd);
      const c = v(ctrl);
      if (v(reset) < m.resetThreshold) this.q = 0;
      else if (v(trig) < c / 2) this.q = 1;
      else if (v(thr) > c) this.q = 0;
    },
  };
}

// One op-amp's output (models.js, OPAMPS) between its inputs p (+) and n (−), the supply pins
// vcc and vee, and an inner node o behind the output resistance. Its row: V(o) − V(vee) = f(u),
// u = gain·vd + S/2 with vd = V(p) − V(n) and S = V(vcc) − V(vee), f a clamp of u between swingLow
// and S − swingHigh with soft corners (softplus, SOFT volts), so Newton sees a smooth slope 1 → 0.
// Deep in saturation the slope is nearly zero, and with feedback Newton would jump from one rail
// to the other: like a junction's voltage, vd is limited between iterations. The first time u
// would leave the linear range it stops just inside it (LIMIT volts from the edge, where the slope
// is near 1 and the next step is nearly exact); if the next iteration still wants out on that
// side, the output really saturates and it goes.
// The output current x[branch] comes from vcc while it sources and goes to vee while it sinks,
// split smoothly at a few microamperes so the supply pins carry what they would.
const SOFT = 0.02;
const LIMIT = 2 * SOFT;
const softplus = (z) => (z > 40 ? z : z < -40 ? 0 : Math.log1p(Math.exp(z)));
const logistic = (z) => 1 / (1 + Math.exp(-Math.max(-300, Math.min(300, z))));
const SPLIT = 1e-6;
export function opampStage({ p, n, vcc, vee, o }, m) {
  const range = (S) => {
    const lo = m.swingLow;
    // Below swingLow + swingHigh of supply (switched off, or the first guess at 0 V) the
    // output has no room: it sits at swingLow.
    const top = S - m.swingHigh;
    return { lo, hi: Math.max(top, lo), follows: top > lo ? 1 : 0 };
  };
  const evaluate = (vd, S) => {
    const { lo, hi, follows } = range(S);
    const u = m.gain * vd + S / 2;
    const f = lo + SOFT * softplus((u - lo) / SOFT) - SOFT * softplus((u - hi) / SOFT);
    const sLo = logistic((u - lo) / SOFT);
    const sHi = logistic((u - hi) / SOFT);
    return { f, du: sLo - sHi, dS: (sLo - sHi) / 2 + sHi * follows, u, lo, hi };
  };
  const shape = (x) => evaluate(volt(x, p) - volt(x, n), volt(x, vcc) - volt(x, vee));
  const source = (i) => (i + Math.hypot(i, SPLIT)) / 2; // the part of i drawn from vcc
  return {
    nodes: [p, n, vcc, vee, o],
    links: [
      [o, vee],
      [o, vcc],
    ],
    branch: null,
    needsRow: true,
    vd: 0,
    edge: null,
    shape,
    stamp(st, x) {
      const k = this.branch;
      const S = volt(x, vcc) - volt(x, vee);
      const { lo, hi } = range(S);
      const want = volt(x, p) - volt(x, n);
      const uOf = (vd) => m.gain * vd + S / 2;
      let vd = want;
      let edge = null;
      if (uOf(want) > hi + LIMIT && uOf(this.vd) < hi + LIMIT && this.edge !== 'hi') edge = 'hi';
      else if (uOf(want) < lo - LIMIT && uOf(this.vd) > lo - LIMIT && this.edge !== 'lo') edge = 'lo';
      if (edge) vd = ((edge === 'hi' ? hi - LIMIT : lo + LIMIT) - S / 2) / m.gain;
      this.edge = edge;
      const limited = edge !== null;
      this.vd = vd;
      const { f, du, dS } = evaluate(vd, S);
      // Row k, linear around (vd, S): V(o) − V(vee) − [f + du·gain·(vd' − vd) + dS·(S' − S)] = 0.
      // A list, not a map: two of these may be the same node (both inputs on one strip).
      const J = [
        [o, 1],
        [vee, -1 + dS],
        [vcc, -dS],
        [p, -m.gain * du],
        [n, m.gain * du],
      ];
      for (const [node, j] of J) st.add(k, node, j);
      st.rhs(k, f - du * m.gain * vd - dS * S);
      // The current: into o, out of vcc (sourcing part) and vee (the rest).
      const i0 = x[k] ?? 0;
      const s0 = source(i0);
      const ds = (1 + i0 / Math.hypot(i0, SPLIT)) / 2;
      st.add(o, k, -1);
      st.add(vcc, k, ds);
      st.rhs(vcc, -(s0 - ds * i0));
      st.add(vee, k, 1 - ds);
      st.rhs(vee, s0 - ds * i0);
      return limited;
    },
    // Into the element at each node, in `nodes` order (o: the output current leaves it).
    currents(x) {
      const i = x[this.branch];
      return [0, 0, source(i), i - source(i), -i];
    },
  };
}

// A comparator's open-collector output (LM393): a transistor from out to vee that conducts while
// V(n) > V(p), its conductance switching over WIDTH volts of input; off, it leaks nothing.
const WIDTH = 1e-4;
export function comparatorStage({ p, n, out, vee }, m) {
  const gon = 1 / m.onResistance;
  return {
    nodes: [out, vee, p, n],
    links: [[out, vee]],
    stamp(st, x) {
      const v = [volt(x, out), volt(x, vee), volt(x, p), volt(x, n)];
      const s = logistic((v[3] - v[2]) / WIDTH);
      const g = gon * s + GMIN;
      const dg = (gon * s * (1 - s)) / WIDTH; // ∂g/∂V(n); ∂g/∂V(p) = −dg
      const vo = v[0] - v[1];
      const i = g * vo;
      st.device(this.nodes, [i, -i, 0, 0], [[g, -g, -dg * vo, dg * vo], [-g, g, dg * vo, -dg * vo], [0, 0, 0, 0], [0, 0, 0, 0]], v);
      return false;
    },
    currents(x) {
      const s = logistic((volt(x, n) - volt(x, p)) / WIDTH);
      const i = (gon * s + GMIN) * (volt(x, out) - volt(x, vee));
      return [i, -i, 0, 0];
    },
    on: (x) => volt(x, n) > volt(x, p),
  };
}

// MOSFET drain current (from d to s) of an n-channel device, with smooth turn-on.
function nChannel(vgs, vds, { vth, k, lambda }) {
  if (vds < 0) {
    // Source and drain swap roles.
    const r = nChannel(vgs - vds, -vds, { vth, k, lambda });
    return { id: -r.id, gm: -r.gm, gds: r.gm + r.gds };
  }
  const s = 0.05;
  const z = (vgs - vth) / s;
  const vov = z > 40 ? vgs - vth : s * Math.log1p(Math.exp(z));
  const dvov = z > 40 ? 1 : 1 / (1 + Math.exp(-z));
  const cl = 1 + lambda * vds;
  if (vds < vov) {
    const f = k * (vov * vds - (vds * vds) / 2);
    return { id: f * cl, gm: k * vds * dvov * cl, gds: k * (vov - vds) * cl + f * lambda };
  }
  const f = (k / 2) * vov * vov;
  return { id: f * cl, gm: k * vov * dvov * cl, gds: f * lambda };
}

export function mosfetCurrent(vgs, vds, model) {
  if (model.channel === 'p') {
    const r = nChannel(-vgs, -vds, { ...model, vth: Math.abs(model.vth) });
    return { id: -r.id, gm: r.gm, gds: r.gds };
  }
  return nChannel(vgs, vds, model);
}

export function mosfet(d, g, s, model) {
  return {
    nodes: [d, g, s],
    links: [[d, s]],
    vgs: 0,
    vds: 0,
    stamp(st, x) {
      const vs = volt(x, s);
      const ngs = volt(x, g) - vs;
      const nds = volt(x, d) - vs;
      this.vgs = limitStep(ngs, this.vgs, 1);
      this.vds = limitStep(nds, this.vds, 2);
      const { id, gm, gds } = mosfetCurrent(this.vgs, this.vds, model);
      const J = [
        [gds, gm, -gm - gds],
        [0, 0, 0],
        [-gds, -gm, gm + gds],
      ];
      st.device([d, g, s], [id, 0, -id], J, [vs + this.vds, vs + this.vgs, vs]);
      st.conductance(d, s, GMIN);
      st.conductance(g, s, GMIN);
      return Math.abs(this.vgs - ngs) > 1e-9 || Math.abs(this.vds - nds) > 1e-9;
    },
    currents(x) {
      const vs = volt(x, s);
      const { id } = mosfetCurrent(volt(x, g) - vs, volt(x, d) - vs, model);
      return [id, 0, -id];
    },
  };
}

// Ebers–Moll transport model of an NPN transistor; PNP is the mirror image.
export function bjtCurrents(vbe, vbc, { is, bf, br }) {
  const ebe = Math.exp(Math.min(vbe / VT, 300));
  const ebc = Math.exp(Math.min(vbc / VT, 300));
  const ic = is * (ebe - ebc) - (is / br) * (ebc - 1);
  const ib = (is / bf) * (ebe - 1) + (is / br) * (ebc - 1);
  return {
    ic,
    ib,
    dic: { be: (is / VT) * ebe, bc: -(is / VT) * ebc - (is / (br * VT)) * ebc },
    dib: { be: (is / (bf * VT)) * ebe, bc: (is / (br * VT)) * ebc },
  };
}

export function bjt(c, b, e, model) {
  const sign = model.polarity === 'pnp' ? -1 : 1;
  const vcrit = vcritOf(model.is, VT);
  const rows = (d) => [-d.bc, d.be + d.bc, -d.be]; // ∂/∂[vc, vb, ve]
  return {
    nodes: [c, b, e],
    links: [
      [b, e],
      [b, c],
    ],
    vbe: 0,
    vbc: 0,
    stamp(st, x) {
      const vb = volt(x, b);
      const nbe = sign * (vb - volt(x, e));
      const nbc = sign * (vb - volt(x, c));
      this.vbe = pnjlim(nbe, this.vbe, VT, vcrit);
      this.vbc = pnjlim(nbc, this.vbc, VT, vcrit);
      const r = bjtCurrents(this.vbe, this.vbc, model);
      const jc = rows(r.dic);
      const jb = rows(r.dib);
      const je = jc.map((v, i) => -(v + jb[i]));
      const I = [sign * r.ic, sign * r.ib, -sign * (r.ic + r.ib)];
      st.device([c, b, e], I, [jc, jb, je], [vb - sign * this.vbc, vb, vb - sign * this.vbe]);
      st.conductance(b, e, GMIN);
      st.conductance(b, c, GMIN);
      return Math.abs(this.vbe - nbe) > 1e-9 || Math.abs(this.vbc - nbc) > 1e-9;
    },
    currents(x) {
      const vb = volt(x, b);
      const r = bjtCurrents(sign * (vb - volt(x, e)), sign * (vb - volt(x, c)), model);
      return [sign * r.ic, sign * r.ib, -sign * (r.ic + r.ib)];
    },
  };
}

// ── Newton's method ─────────────────────────────────────────────────────────────────

const MAX_ITERATIONS = 200;

// system: { size, nodeCount, elements }. ctx: { scale (source stepping), h (time step) }.
export function newton(system, x0, ctx = {}) {
  const { size, nodeCount, elements } = system;
  let x = x0.slice();
  // One stamper per system, cleared each iteration: no new matrices while stepping in time.
  const st = (system.stamper ??= new Stamper(size));
  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    st.reset();
    for (let i = 0; i < nodeCount; i++) st.add(i, i, GMIN);
    let limited = false;
    for (const el of elements) if (el.stamp(st, x, ctx)) limited = true;
    const next = solveInPlace(st.A, st.b);
    if (!next) return { ok: false, reason: 'singular', x, iterations: iteration };
    let done = !limited;
    for (let i = 0; i < size && done; i++) {
      const tol = (i < nodeCount ? 1e-6 : 1e-9) + 1e-6 * Math.max(Math.abs(next[i]), Math.abs(x[i]));
      if (!(Math.abs(next[i] - x[i]) <= tol)) done = false;
    }
    x = next;
    if (done) return { ok: true, x, iterations: iteration };
  }
  return { ok: false, reason: 'iterations', x, iterations: MAX_ITERATIONS };
}

// Operating point: plain Newton first; if it fails, ramp the sources up from 10 % (source
// stepping), reusing each answer as the next starting guess.
export function operatingPoint(system, x0 = new Array(system.size).fill(0), ctx = {}) {
  const first = newton(system, x0, { ...ctx, scale: 1 });
  if (first.ok) return first;
  for (const el of system.elements) for (const key of ['vd', 'vgs', 'vds', 'vbe', 'vbc']) if (key in el) el[key] = 0;
  let x = new Array(system.size).fill(0);
  let iterations = first.iterations;
  for (let step = 1; step <= 20; step++) {
    const r = newton(system, x, { ...ctx, scale: step / 20 });
    iterations += r.iterations;
    if (!r.ok) return { ...r, iterations };
    x = r.x;
  }
  return { ok: true, x, iterations };
}
