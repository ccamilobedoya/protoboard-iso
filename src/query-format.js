// Readable text for query and suggest results (CLI and MCP share it).

import { t, decimalSeparator } from './i18n/index.js';

const n = (lang, x) => String(x).replace('.', decimalSeparator(lang));

export function formatAt(r, lang) {
  if (!r.exists) return t(lang, 'query.noHole', { hole: r.hole });
  const who = r.occupant ? t(lang, 'query.occupied', { part: r.occupant.part, pin: r.occupant.pin }) : t(lang, 'query.empty');
  const group = r.group.holes.map((h) => {
    const u = r.group.used.find((x) => x.hole === h);
    return u ? `[${h} ${u.part}.${u.pin}]` : h;
  });
  return `${r.hole} → ${r.node} · ${who}\n  ${t(lang, 'query.group')}: ${group.join(' ')}`;
}

export function formatNode(r, lang) {
  if (!r.exists) return t(lang, 'query.noNode', { node: r.node });
  const used = r.used.length ? r.used.map((u) => `${u.hole} ${u.part}.${u.pin}`).join(', ') : '—';
  return t(lang, 'query.node', { node: r.node, label: r.label ? ` (${r.label})` : '', holes: r.holes.length, used, free: r.free.length });
}

export function formatFree(r, lang) {
  const lines = [t(lang, 'query.free', { total: r.total, shown: r.holes.length, near: r.near ?? '—' })];
  for (const h of r.holes) lines.push(`  ${h.hole.padEnd(6)} ${h.node.padEnd(9)} ${h.distance === null ? '' : `${n(lang, h.distance)} mm`}${h.emptyNode ? '' : ` · ${t(lang, 'query.shared')}`}`);
  return lines.join('\n');
}

export function formatSuggest(r, lang, { formatIssue, target }) {
  if (r.error) return formatIssue(r.error, lang);
  const lines = [t(lang, 'suggest.header', { id: r.id, type: t(lang, `type.${r.type}`), pkg: r.package, considered: r.considered })];
  if (r.hint) lines.push(`  ${formatIssue(r.hint, lang)}`);
  r.placements.forEach((p, i) => {
    const pins = r.pinNames.map((name, k) => `${name}→${p.pins[k]}`).join(', ');
    lines.push(`  ${i + 1}. ${pins} · ${t(lang, 'suggest.span')} ${n(lang, p.span)} mm · ${t(lang, 'suggest.score')} ${n(lang, p.score)} · ${t(lang, 'suggest.visible')} ${Math.round(p.minVisible * 100)} %`);
    for (const f of p.fixes) lines.push(`       ✔ ${formatIssue(f, lang)}`);
    for (const note of p.notes) lines.push(`       · ${formatIssue(note, lang)}`);
  });
  if (r.placements.length) {
    lines.push('');
    lines.push(t(lang, 'suggest.apply'));
    lines.push(`  protoboard-iso apply ${target ?? '<target>'} --ops '${JSON.stringify(r.placements[0].ops)}' --dry-run`);
  }
  return lines.join('\n');
}
