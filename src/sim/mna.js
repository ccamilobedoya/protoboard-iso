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
  const n = b.length;
  const M = A.map((row) => Float64Array.from(row));
  const x = Float64Array.from(b);
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

// Shockley junction from a (anode) to k (cathode).
export function junction(a, k, { is, n }) {
  const vt = n * VT;
  const vcrit = vcritOf(is, vt);
  const evaluate = (v) => {
    const e = Math.exp(Math.min(v / vt, 300));
    return { i: is * (e - 1), g: (is * e) / vt };
  };
  return {
    nodes: [a, k],
    links: [[a, k]],
    vd: 0,
    stamp(st, x) {
      const vnew = volt(x, a) - volt(x, k);
      const v = pnjlim(vnew, this.vd, vt, vcrit);
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
  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    const st = new Stamper(size);
    for (let i = 0; i < nodeCount; i++) st.add(i, i, GMIN);
    let limited = false;
    for (const el of elements) if (el.stamp(st, x, ctx)) limited = true;
    const next = solveLinear(st.A, st.b);
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
