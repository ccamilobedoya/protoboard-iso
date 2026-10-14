// Simulation results as readable text, in any language of src/i18n.

import { t, decimalSeparator } from '../i18n/index.js';
import { formatValue } from '../core/units.js';
import { nodeParams } from '../circuit/checks.js';

const pad = (s, n) => String(s).padEnd(n);

export function formatSimulation(result, lang = 'en', { formatIssue, netLabels = {} } = {}) {
  const decimal = decimalSeparator(lang);
  const f = (value, unit) => (value == null ? t(lang, 'sim.floating') : formatValue(value, unit, { decimal }));
  const lines = [];
  const issues = () => {
    if (!result.issues?.length) return;
    lines.push(t(lang, 'sim.issues'));
    for (const i of result.issues) lines.push(`  ${formatIssue(i, lang)}`);
  };
  if (!result.ok) {
    lines.push(t(lang, 'sim.failed'));
    issues();
    return lines.join('\n');
  }
  const nodeName = (n) => {
    const np = nodeParams(n);
    const name = np ? t(lang, np.key, np.params) : n;
    return netLabels[n] ? `${name} (${netLabels[n]})` : name;
  };

  if (result.analysis === 'transient') return formatTransient(result, lang, { f, lines, issues, nodeName });

  lines.push(t(lang, 'sim.dc', { iterations: result.iterations }));
  lines.push(t(lang, 'sim.supplies'));
  for (const [id, s] of Object.entries(result.supplies)) {
    lines.push(`  ${pad(id, 6)} ${pad(f(s.voltage, 'V'), 10)} ${pad(f(s.current, 'A'), 10)} ${pad(f(s.power, 'W'), 10)} ${t(lang, `sim.mode.${s.mode}`)}`);
  }
  lines.push(t(lang, 'sim.nodes', { ground: nodeName(result.ground) }));
  for (const [node, v] of Object.entries(result.nodes)) lines.push(`  ${pad(nodeName(node), 30)} ${f(v, 'V')}`);
  lines.push(t(lang, 'sim.parts'));
  for (const [id, p] of Object.entries(result.parts)) {
    let text;
    if (p.unsupported) text = t(lang, 'sim.unsupported');
    else if (p.kind === 'M') text = `${t(lang, 'sim.region.mosfet.' + p.region)} · Vgs ${f(p.vgs, 'V')} · Vds ${f(p.vds, 'V')} · Id ${f(p.currents.D, 'A')} · ${f(p.power, 'W')}`;
    else if (p.kind === 'Q') text = `${t(lang, 'sim.region.bjt.' + p.region)} · Vbe ${f(p.vbe, 'V')} · Vce ${f(p.vce, 'V')} · Ib ${f(p.currents.B, 'A')} · Ic ${f(p.currents.C, 'A')} · ${f(p.power, 'W')}`;
    else if (p.kind === 'POT') text = `I(1) ${f(p.currents['1'], 'A')} · I(W) ${f(p.currents.W, 'A')} · I(3) ${f(p.currents['3'], 'A')} · ${f(p.power, 'W')}`;
    else if (p.kind === 'SW') text = `${t(lang, p.pressed ? 'state.pressed' : 'state.released')} · ${f(p.current, 'A')}`;
    else {
      text = `${pad(f(p.voltage, 'V'), 10)} ${pad(f(p.current, 'A'), 10)} ${f(p.power, 'W')}`;
      if (p.kind === 'LED') text += ` · ${t(lang, 'sim.brightness', { percent: Math.round(p.brightness * 100) })}`;
    }
    if (p.floating) text += ` · ${t(lang, 'sim.floating')}`;
    lines.push(`  ${pad(id, 6)} ${text}`);
  }
  issues();
  return lines.join('\n');
}

// A table at about ten evenly spaced times: capacitor voltages and supply currents (the
// JSON answer has every sample, every node and every part).
function formatTransient(result, lang, { f, lines, issues }) {
  lines.push(t(lang, 'sim.transient', { start: t(lang, `sim.start.${result.start}`), stop: f(result.stop, 's'), step: f(result.step, 's'), points: result.times.length }));
  const caps = Object.keys(result.parts).filter((id) => result.parts[id].voltage && /^C/i.test(id));
  const columns = [
    ...caps.map((id) => ({ head: `V(${id})`, values: result.parts[id].voltage, unit: 'V' })),
    ...Object.entries(result.supplies).map(([id, s]) => ({ head: `I(${id})`, values: s.current, unit: 'A' })),
  ];
  lines.push(`  ${pad('t', 10)} ${columns.map((c) => pad(c.head, 11)).join(' ')}`);
  const n = result.times.length;
  const rows = [...new Set(Array.from({ length: 11 }, (_, i) => Math.round((i * (n - 1)) / 10)))];
  for (const k of rows) lines.push(`  ${pad(f(result.times[k], 's'), 10)} ${columns.map((c) => pad(f(c.values[k], c.unit), 11)).join(' ')}`);
  issues();
  return lines.join('\n');
}

// One part's readings for a card: [{ key, text }]. `key` names its explanation
// (i18n "explain.<key>"), so a learner can tap "Ic: 8,82 mA" and read what Ic is.
export function partLines(p, lang = 'en') {
  const decimal = decimalSeparator(lang);
  const f = (value, unit) => (value == null ? t(lang, 'sim.floating') : formatValue(value, unit, { decimal }));
  const q = (key, value) => ({ key, text: `${t(lang, `sim.q.${key}`)}: ${value}` });
  const raw = (key, text) => ({ key, text });
  if (p.unsupported) return [raw('unsupported', t(lang, 'sim.unsupported'))];
  const lines = [];
  if (p.kind === 'M') {
    lines.push(raw(`region.mosfet.${p.region}`, t(lang, `sim.region.mosfet.${p.region}`)), raw('vgs', `Vgs: ${f(p.vgs, 'V')}`), raw('vds', `Vds: ${f(p.vds, 'V')}`), raw('id', `Id: ${f(p.currents.D, 'A')}`), q('power', f(p.power, 'W')));
  } else if (p.kind === 'Q') {
    lines.push(raw(`region.bjt.${p.region}`, t(lang, `sim.region.bjt.${p.region}`)), raw('vbe', `Vbe: ${f(p.vbe, 'V')}`), raw('vce', `Vce: ${f(p.vce, 'V')}`), raw('ib', `Ib: ${f(p.currents.B, 'A')}`), raw('ic', `Ic: ${f(p.currents.C, 'A')}`));
    if (p.region === 'active' && p.beta) lines.push(raw('beta', `β ≈ ${Math.round(p.beta)}`));
    lines.push(q('power', f(p.power, 'W')));
  } else if (p.kind === 'POT') {
    lines.push(raw('pot.current', `I(1): ${f(p.currents['1'], 'A')}`), raw('pot.current', `I(W): ${f(p.currents.W, 'A')}`), raw('pot.current', `I(3): ${f(p.currents['3'], 'A')}`), q('power', f(p.power, 'W')));
  } else if (p.kind === 'SW') {
    lines.push(q('state', t(lang, p.pressed ? 'state.pressed' : 'state.released')), q('current', f(p.current, 'A')));
  } else {
    lines.push(q('voltage', f(p.voltage, 'V')), q('current', f(p.current, 'A')), q('power', f(p.power, 'W')));
    if (p.kind === 'LED') lines.push(q('brightness', t(lang, 'sim.brightness', { percent: Math.round(p.brightness * 100) })));
  }
  if (p.floating) lines.push(raw('floating', t(lang, 'sim.floating')));
  return lines;
}
