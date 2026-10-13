// A verdict on a circuit, from measurements only: placement issues (check) and drawing
// problems (inspect) in both views, sorted by a policy into what must be fixed (blocking)
// and what is worth knowing (advisory). Agents and people get the same answer every time.
//
// Profiles
//   lesson  for teaching layouts: nothing hidden, no label trouble, parts not cramped
//   draft   only errors and warnings block
//
// review(circuit, { profile, views }) → { verdict: 'approved' | 'changes', blocking, advisory, summary }

import { evaluate } from './diff.js';

export const PROFILES = {
  lesson: {
    // codes that block in any view
    block: ['LABEL_COVERS_PART', 'LABEL_OVERLAP', 'TOO_CLOSE'],
    // a part hidden in every view blocks (in one view only: advise the other view)
    hiddenEverywhere: true,
    advise: ['FLOATING_PIN', 'LEADER_CROSSING', 'LEADER_OVER_PART', 'LABEL_HIDES_TEXT', 'TEXT_TOO_SMALL', 'PART_HIDDEN'],
  },
  draft: { block: [], hiddenEverywhere: false, advise: null },
};

export function review(circuit, { profile = 'lesson', views = ['front', 'back'], lang = 'en' } = {}) {
  const policy = PROFILES[profile] ?? PROFILES.lesson;
  const { problems } = evaluate(circuit, { views, lang });
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
      const everywhere = all.length >= views.length;
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

  return {
    profile,
    views,
    verdict: blocking.length ? 'changes' : 'approved',
    blocking,
    advisory,
    summary: { parts: circuit.parts?.length ?? 0, blocking: blocking.length, advisory: advisory.length },
  };
}

export function formatReview(r, lang, { t, formatIssue }) {
  const lines = [t(lang, r.verdict === 'approved' ? 'review.approved' : 'review.changes', { profile: r.profile, views: r.views.join(', '), ...r.summary })];
  if (r.blocking.length) {
    lines.push(t(lang, 'review.blocking'));
    for (const p of r.blocking) lines.push(`  ✖ ${formatIssue(p, lang)}`);
  }
  if (r.advisory.length) {
    lines.push(t(lang, 'review.advisory'));
    for (const p of r.advisory) lines.push(`  · ${formatIssue(p, lang)}${p.view ? ` [${p.view}]` : ''}`);
  }
  return lines.join('\n');
}
