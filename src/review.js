// A verdict on a circuit, from measurements only: placement issues (check) and drawing
// problems (inspect) in both views, sorted by a policy into what must be fixed (blocking)
// and what is worth knowing (advisory). Agents and people get the same answer every time.
//
// Profiles
//   lesson  for teaching layouts: nothing hidden, no label trouble, parts not cramped
//   draft   only errors and warnings block
//
// review(circuit, { profile, views, explain, fix }) → { verdict: 'approved' | 'approved-with-warnings' | 'changes', blocking, hazards, hazardStates?, fix?, noFix?, checked, advisory, summary }
// `hazards`: parts the simulator's DC point (the one `simulate` prints) takes past a maximum, as
// wired, at rest, with one control operated or with one output of a board's program high (`when`: a
// button pressed, a switch moved, a potentiometer at an end, "with D10 high"; sim/index.js
// checkHazards); `hazardStates`: { checked, total, controls, outputs } of those
// states, when the circuit has any (checked below total: the rest were not). They never block (a learner may burn a part on purpose); they change the verdict from
// approved to approved-with-warnings, so nobody reads a plain APPROVED over a part that would burn.
// `fix` (src/fix.js): with hazards, the simplest change the simulator finds that clears them all (a
// resistor's new value, or one resistor added in series), or `fix: null` with `noFix: true`; `fix:
// false` in the options leaves it out (layout's own tries: it computes it once, on the circuit it
// keeps). `checked` (sim/index.js coverageOf): what the hazard check covered and what it could not.
// Each blocking item names the parts it is about (`parts`) and the views it shows in (`views`), so
// the fix is clear without another inspect; `explain` adds the profile's rules (`rules`).

import { evaluate } from './diff.js';
import { checkNets } from './nets.js';
import { checkHazards } from './sim/index.js';
import { hazardFix } from './fix.js';
import { formatValue } from './core/units.js';
import { decimalSeparator } from './i18n/index.js';

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

export function review(circuit, { profile = 'lesson', views = ['front', 'back'], lang = 'en', explain = false, fix = true } = {}) {
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

  // Electrical hazards: the simulator's own "exceeded its maximum" findings, on any profile.
  const simulated = checkHazards(circuit);
  const hazards = simulated.hazards.map((h) => ({ ...h, parts: partsOf(h, ids) }));

  for (const p of blocking) {
    p.parts = partsOf(p, ids);
    const seenIn = [...(viewsOf.get(`${p.code} ${JSON.stringify(p.params)}`) ?? [])].filter((v) => v !== 'any');
    if (seenIn.length) p.views = seenIn;
  }
  return {
    profile,
    views,
    ...(explain && { rules: { blocks: ['error', 'warning', ...policy.block], hiddenEverywhere: policy.hiddenEverywhere, hiddenBelow: policy.hiddenBelow, advise: policy.advise ?? 'everything else' } }),
    verdict: blocking.length ? 'changes' : hazards.length ? 'approved-with-warnings' : 'approved',
    blocking,
    hazards,
    ...(simulated.states.total && { hazardStates: simulated.states }),
    ...(fix && hazards.length && hazardFix(circuit, simulated.hazards)),
    checked: simulated.checked,
    advisory,
    summary: { parts: circuit.parts?.length ?? 0, blocking: blocking.length, hazards: hazards.length, advisory: advisory.length },
  };
}

export function formatReview(r, lang, { t, formatIssue }) {
  const headline = { approved: 'review.approved', 'approved-with-warnings': 'review.warnings', changes: 'review.changes' }[r.verdict];
  const lines = [t(lang, headline, { profile: r.profile, views: r.views.join(', '), ...r.summary })];
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
  lines.push(...formatHazards(r, lang, formatIssue, t));
  if (r.advisory.length) {
    lines.push(t(lang, 'review.advisory'));
    for (const p of r.advisory) lines.push(`  · ${formatIssue(p, lang)}${p.view ? ` [${p.view}]` : ''}`);
  }
  return lines.join('\n');
}

// The hazards as lines (also layout's): what would be damaged, the kit's fix (or that it has none),
// what to do about it; when the circuit had more states than were solved, how many were; and,
// unless `checked` is false (a layout that left something to fix), the Checked line.
export function formatHazards(r, lang, formatIssue, t, { checked = true } = {}) {
  const lines = [];
  if (r.hazards?.length) {
    lines.push(t(lang, 'review.hazards'), ...r.hazards.map((h) => `  ⚠ ${formatIssue(h, lang)}`));
    if (r.fix) lines.push(fixLine(r.fix, lang, t));
    else if (r.noFix) lines.push(t(lang, 'review.noFix'));
    lines.push(t(lang, 'review.hazardsAdvice'));
  }
  const states = r.hazardStates;
  if (states && states.checked < states.total) lines.push(t(lang, 'review.hazardsUnchecked', states));
  if (checked && r.checked) lines.push(checkedLine(r.checked, lang, t));
  return lines;
}

// "To fix it: a 200 Ω resistor in series with BZ1 brings U1's D10 to 19.5 mA (maximum 40 mA)."
function fixLine(fix, lang, t) {
  const decimal = decimalSeparator(lang);
  const f = (v, unit) => formatValue(v, unit, { decimal });
  const brings = fix.brings
    .filter((b) => b.value != null)
    .map((b) => {
      const [part, ...pin] = String(b.part).split('.');
      const subject = pin.length ? t(lang, 'review.fix.pin', { part, pin: pin.join('.') }) : t(lang, 'review.fix.part', { part });
      return t(lang, 'review.fix.brings', { subject, value: f(b.value, b.unit), max: f(b.max, b.unit) });
    })
    .join(t(lang, 'review.fix.and'));
  const value = f(fix.value, 'Ω');
  return fix.kind === 'set' ? t(lang, 'review.fix.set', { part: fix.part, value, brings }) : t(lang, 'review.fix.add', { with: fix.with, value, brings });
}

// "Checked: at rest, 2 controls, 3 program outputs. Not checked: peaks while switching, combinations of controls."
function checkedLine(c, lang, t) {
  const done = [];
  if (c.rest) done.push(t(lang, 'review.checked.rest'));
  if (c.controls) done.push(t(lang, `review.checked.controls.${c.controls === 1 ? 'one' : 'many'}`, { count: c.controls }));
  if (c.outputs) done.push(t(lang, `review.checked.outputs.${c.outputs === 1 ? 'one' : 'many'}`, { count: c.outputs }));
  const which = c.controls && c.outputs ? 'both' : c.outputs ? 'outputs' : 'controls';
  const open = c.notChecked.map((code) => t(lang, `review.notChecked.${code === 'combinations' ? `combinations.${which}` : code}`, { count: c.skipped ?? 0, parts: (c.unsimulated ?? []).join(', ') }));
  return t(lang, 'review.checked', { done: done.join(', ') || t(lang, 'review.checked.nothing'), open: open.join(', ') || t(lang, 'review.notChecked.none') });
}
