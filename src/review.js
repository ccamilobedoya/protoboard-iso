// A verdict on a circuit, from measurements only: placement issues (check) and drawing
// problems (inspect) in both views, sorted by a policy into what must be fixed (blocking)
// and what is worth knowing (advisory). Agents and people get the same answer every time.
//
// Profiles
//   lesson  for teaching layouts: nothing hidden, no label trouble, parts not cramped
//   draft   only errors and warnings block
//
// review(circuit, { profile, views, explain }) → { verdict: 'approved' | 'changes', blocking, advisory, summary }
// Each blocking item names the parts it is about (`parts`) and the views it shows in (`views`), so
// the fix is clear without another inspect; `explain` adds the profile's rules (`rules`).

import { evaluate } from './diff.js';
import { checkNets } from './nets.js';

export const PROFILES = {
  lesson: {
    // codes that block in any view
    block: ['LABEL_COVERS_PART', 'LABEL_OVERLAP', 'TOO_CLOSE'],
    // a part hidden in every view blocks (in one view only: advise the other view): one whose best
    // view shows less than this share of it (percent). Measured 2026-10-20: at the inspector's 85 %
    // a 555 seen 73 % from the front and 69 % from the back blocked, and the two-rail supply needed
    // all 8 layout tries; 70 % in one view is readable.
    hiddenEverywhere: true,
    hiddenBelow: 70,
    advise: ['FLOATING_PIN', 'LEADER_CROSSING', 'LEADER_OVER_PART', 'LABEL_HIDES_TEXT', 'TEXT_TOO_SMALL', 'PART_HIDDEN'],
  },
  draft: { block: [], hiddenEverywhere: false, advise: null },
};

// Parameters that name parts, in the issues and drawing problems.
const PART_PARAMS = ['part', 'first', 'second', 'other', 'by', 'parts', 'over', 'covered'];

function partsOf(p, ids) {
  const out = [];
  for (const [k, v] of Object.entries(p.params ?? {})) {
    for (const token of String(v).split(/,\s*/)) {
      const id = ids.has(token) ? token : token.split('.')[0]; // "R2.2" is a pin of R2
      if ((PART_PARAMS.includes(k) || token.includes('.') || ids.has(token)) && ids.has(id) && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

export function review(circuit, { profile = 'lesson', views = ['front', 'back'], lang = 'en', explain = false } = {}) {
  const policy = PROFILES[profile] ?? PROFILES.lesson;
  const { problems } = evaluate(circuit, { views, lang });
  const ids = new Set((circuit.parts ?? []).map((p) => p.id));
  // Which views each problem shows in (the same code and params, any view).
  const viewsOf = new Map();
  for (const p of problems) {
    const key = `${p.code} ${JSON.stringify(p.params)}`;
    if (!viewsOf.has(key)) viewsOf.set(key, new Set());
    viewsOf.get(key).add(p.view ?? 'any');
  }
  const blocking = [];
  const advisory = [];
  const seen = new Set();
  const once = (list, p) => {
    const key = `${p.code} ${JSON.stringify(p.params)}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push(p);
  };

  // Hidden parts: which views hide each part.
  const hiddenIn = new Map();
  for (const p of problems.filter((x) => x.code === 'PART_HIDDEN')) {
    if (!hiddenIn.has(p.params.part)) hiddenIn.set(p.params.part, []);
    hiddenIn.get(p.params.part).push(p);
  }

  for (const p of problems) {
    const { view, ...plain } = p;
    if (p.code === 'PART_HIDDEN') {
      const all = hiddenIn.get(p.params.part);
      // Its best view: the least it is covered there (two parts covering it in one view are one view).
      const shown = (v) => Math.min(100, ...all.filter((x) => x.view === v).map((x) => x.params.visible));
      const best = Math.max(...views.map(shown));
      const everywhere = best < (policy.hiddenBelow ?? 100);
      if (policy.hiddenEverywhere && everywhere) {
        // One entry per part: the view where it is least visible.
        const worst = all.reduce((a, b) => (b.params.visible < a.params.visible ? b : a));
        if (p === worst) once(blocking, { ...plain, severity: 'warning' });
      } else if (p.severity === 'warning' && !policy.advise) once(blocking, plain);
      else once(advisory, { ...plain, view });
      continue;
    }
    if (p.severity === 'error' || p.severity === 'warning' || policy.block.includes(p.code)) once(blocking, plain);
    else if (!policy.advise || policy.advise.includes(p.code)) once(advisory, view ? { ...plain, view } : plain);
  }

  // The connections asked for: a circuit laid out by layout keeps its nets (spec), so every
  // review checks them, also after later changes by hand or by operations.
  if (circuit.spec?.nets?.length) {
    const asked = circuit.spec.nets.map((n) => (Array.isArray(n) ? { pins: n } : n));
    const nets = checkNets(circuit, asked);
    for (const m of nets.missing) once(blocking, { severity: 'error', code: 'SPEC_NET_MISSING', params: { net: m.net, pins: m.pins.join(', ') } });
    for (const s of nets.shorted) once(blocking, { severity: 'error', code: 'SPEC_NETS_SHORTED', params: { nets: s.nets.join(' + ') } });
  }

  for (const p of blocking) {
    p.parts = partsOf(p, ids);
    const seenIn = [...(viewsOf.get(`${p.code} ${JSON.stringify(p.params)}`) ?? [])].filter((v) => v !== 'any');
    if (seenIn.length) p.views = seenIn;
  }
  return {
    profile,
    views,
    ...(explain && { rules: { blocks: ['error', 'warning', ...policy.block], hiddenEverywhere: policy.hiddenEverywhere, hiddenBelow: policy.hiddenBelow, advise: policy.advise ?? 'everything else' } }),
    verdict: blocking.length ? 'changes' : 'approved',
    blocking,
    advisory,
    summary: { parts: circuit.parts?.length ?? 0, blocking: blocking.length, advisory: advisory.length },
  };
}

export function formatReview(r, lang, { t, formatIssue }) {
  const lines = [t(lang, r.verdict === 'approved' ? 'review.approved' : 'review.changes', { profile: r.profile, views: r.views.join(', '), ...r.summary })];
  if (r.rules) {
    const codes = r.rules.blocks.filter((c) => c !== 'error' && c !== 'warning');
    lines.push(t(lang, 'review.rules', { codes: codes.join(', ') || '—' }));
    if (r.rules.hiddenEverywhere) lines.push(t(lang, 'review.rulesHidden', { below: r.rules.hiddenBelow ?? 100 }));
  }
  if (r.blocking.length) {
    lines.push(t(lang, 'review.blocking'));
    for (const p of r.blocking) {
      const where = [p.views?.length ? p.views.join(', ') : null, p.parts?.length ? t(lang, 'review.parts', { parts: p.parts.join(', ') }) : null].filter(Boolean).join(' · ');
      lines.push(`  ✖ ${formatIssue(p, lang)}${where ? ` [${where}]` : ''}`);
    }
  }
  if (r.advisory.length) {
    lines.push(t(lang, 'review.advisory'));
    for (const p of r.advisory) lines.push(`  · ${formatIssue(p, lang)}${p.view ? ` [${p.view}]` : ''}`);
  }
  return lines.join('\n');
}
