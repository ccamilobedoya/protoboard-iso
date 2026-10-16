// One self-contained HTML page per circuit: the stable thing to embed in documentation
// (an iframe, a wiki "web view", a notes app). No dependencies, no network, no build.
//
// What it shows: two opposite views, close-up or whole board, labels on or off, drag to
// move and wheel or pinch to zoom. Tap a part: everything else dims, the part and the strips
// under its leads show on top (even behind other parts) and a card tells what it is and what
// it connects to. Optional, when the circuit asks (`page`): simulation results for the tapped
// part, and the conductor view: conductors coloured by voltage, dots for conventional current. Later stages grow this same page, so an embed
// made today keeps working and gets the new features without changing its link.
//
//   renderPage(circuit, { lang, views, fit }) → { html, issues }   (html is null if nothing can be drawn)
//
// This file builds the HTML: one interactive SVG per view (renderCircuit with interactive) and
// the JSON the script reads (partData). The browser side is in page/client/ (modules bundled
// into the page's one script by src/node/bundle.js, so this file runs in Node only), its CSS in
// page/style.js. Language: `lang` here is already resolved (see pickLanguage).

import { renderCircuit, t, labelText, valueText, formatValue } from './index.js';
import { decimalSeparator } from './i18n/index.js';
import { escapeXml } from './render/svg.js';
import { STYLE } from './page/style.js';
import { bundleScript } from './node/bundle.js';
import { buildCircuit } from './circuit/build.js';
import { nodeParams } from './circuit/checks.js';
import { simulate, compile } from './sim/index.js';
import { liveFlow } from './sim/paths.js';
import { LANGUAGES } from './i18n/index.js';
import { deviceOfReading } from './sim/devices/index.js';
import { partLines } from './sim/format.js';
import { groundHole } from './sim/probes.js';
import { describePart, describeKeys } from './parts/describe.js';
import { MODULES } from './parts/modules.js';

// The page's script, bundled once per process: without the simulation, or with it (the engine
// runs in the page when the circuit asks for results or the current layer).
const scripts = {};
const pageScript = (live) => (scripts[live ? 'live' : 'static'] ??= bundleScript(live ? 'page/client/live-page.js' : 'page/client/static-page.js', { comments: false }));

const OPPOSITE = { front: 'back', back: 'front', 'front-left': 'back-right', 'back-right': 'front-left' };
const box = ({ x, y, width, height }) => `${x} ${y} ${width} ${height}`;
const titleOf = (circuit, lang) => (typeof circuit.title === 'object' ? circuit.title?.[lang] ?? circuit.title?.en : circuit.title);

// One view as an inline SVG that scales with the page: the size comes from CSS, the frame
// (whole board or close-up) from the viewBox, switched by the script.
function viewSvg(circuit, view, fit, lang, { sim, flow }) {
  const board = renderCircuit(circuit, { view, lang, sim, flow, interactive: true });
  if (!board.svg) return { issues: board.issues };
  const parts = renderCircuit(circuit, { view, lang, fit: 'parts' });
  const frames = { board: box(board.scene.frame), parts: box(parts.scene.frame) };
  // No <title> inside: browsers show it as a tooltip over the whole drawing. The name goes to
  // aria-label instead, for screen readers.
  const name = titleOf(circuit, lang);
  const svg = board.svg
    .trim()
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/^<svg ([^>]*?)width="[^"]*" height="[^"]*" viewBox="[^"]*"/, `<svg $1viewBox="${frames[fit]}"`)
    .replace(/^<svg /, `<svg data-view="${view}" data-board="${frames.board}" data-parts="${frames.parts}" role="img"${name ? ` aria-label="${escapeXml(name)}"` : ''} `);
  return { svg, issues: board.issues };
}



const button = (key, value, text) => `<button type="button" data-key="${key}"${value ? ` data-value="${value}"` : ''}>${escapeXml(text)}</button>`;

const localized = (value, lang) => (value && typeof value === 'object' ? value[lang] ?? value.en ?? Object.values(value)[0] : value);

// What the card of each part says: name, kind, description, where each pin goes and what
// else is there, and (only shown with the results button) the simulated values.
function partData(circuit, lang, sim) {
  const built = buildCircuit(circuit);
  const netLabels = circuit.netLabels ?? {};
  const nodeName = (node) => {
    const np = nodeParams(node);
    const name = t(lang, np.key, np.params);
    return netLabels[node] ? `${name} (${netLabels[node]})` : name;
  };
  const supplyAt = new Map();
  (Array.isArray(circuit.supplies) ? circuit.supplies : []).forEach((s, i) => {
    for (const [ref, sign] of [[s.positive ?? 'T+', '+'], [s.negative ?? 'T-', '−']]) {
      const hole = built.board?.find(String(ref));
      const node = hole ? hole.node : String(ref);
      supplyAt.set(node, [...(supplyAt.get(node) ?? []), t(lang, 'page.info.supply', { supply: s.id ?? `V${i + 1}`, sign })]);
    }
  });
  // Pin names are identifiers ("anode"); show them in the page's language when there is a word.
  const pinName = (name) => (t(lang, `pin.${name}`) === `pin.${name}` ? name : t(lang, `pin.${name}`));
  const parts = {};
  const kinds = {};
  for (const part of built.parts) {
    // A development board lists only the pins in use (it has many), each with its note.
    const notes = MODULES[part.def.electrical?.module]?.notes ?? {};
    let pins = part.holes.map((hole, i) => {
      const others = (built.netlist.nodes[hole.node] ?? []).filter((m) => m.part !== part.id).map((m) => `${m.part} (${pinName(m.pin)})`);
      const all = [...others, ...(supplyAt.get(hole.node) ?? [])];
      const where = t(lang, 'page.info.pin', { pin: pinName(part.pinNames[i]), hole: hole.id, node: nodeName(hole.node) });
      const note = localized(notes[part.pinNames[i]], lang);
      return { used: all.length > 0, text: `${where} — ${all.length ? t(lang, 'page.info.with', { list: all.join(', ') }) : t(lang, 'page.info.alone')}${note ? ` · ${note}` : ''}` };
    });
    if (part.def.usedPinsOnly) {
      const free = pins.filter((p) => !p.used).length;
      pins = pins.filter((p) => p.used);
      if (free) pins.push({ text: t(lang, 'page.info.free', { n: free }) });
    }
    pins = pins.map((p) => p.text);
    parts[part.id] = {
      title: labelText(part, lang) ?? part.id,
      // The kind of part is a value like the others: tap it (or hover it) to read what that kind
      // of part is and how it works, from the kit. What it does in this circuit is the circuit's
      // own `description`, shown as it is; leave it out when the learner should find it.
      type: kindLine(part, lang, kinds),
      value: valueLine(part, lang),
      here: localized(part.raw.description, lang) ? t(lang, 'page.info.here', { text: localized(part.raw.description, lang) }) : null,
      nodes: [...new Set(part.holes.map((h) => h.node))],
      cols: [...new Set(part.holes.map((h) => h.col))],
      rows: [...new Set(part.holes.filter((h) => h.kind === 'main').map((h) => h.row))],
      pins,
      sim: sim?.ok && sim.parts[part.id] ? partLines(sim.parts[part.id], lang) : [],
    };
  }
  // What each result tag measures and where, for the box shown with its probes or arrows.
  const probes = {};
  // The same captions with the value left as \u0001, for the live page to fill in.
  const templates = {};
  const MARK = '\u0001';
  if (sim?.ok) {
    const f = (v, unit) => formatValue(Math.abs(v) < 1e-3 && unit === 'V' ? 0 : v, unit, { decimal: decimalSeparator(lang) });
    const ground = groundHole(built, circuit);
    const groundName = ground ? `${netLabels[ground.node] ?? nodeName(ground.node)}, ${ground.id}` : '';
    for (const node of Object.keys(built.netlist.nodes)) {
      if (sim.nodes[node] == null) continue;
      probes[`node:${node}`] = t(lang, 'probe.voltage', { value: f(sim.nodes[node], 'V'), node: nodeName(node), ground: groundName });
      templates[`node:${node}`] = { node, text: t(lang, 'probe.voltage', { value: MARK, node: nodeName(node), ground: groundName }) };
    }
    for (const part of built.parts) {
      const r = sim.parts[part.id];
      if (!r || r.floating || r.unsupported || part.def.electrical?.kind === 'W') continue;
      // A device may say it its own way (a transistor: Ic or Id); otherwise "I flows from … to …".
      const own = deviceOfReading(r)?.probe?.(r);
      let text;
      if (own) {
        text = t(lang, own.key, own.value != null ? { value: f(own.value, 'A') } : {});
        templates[`part:${part.id}`] = { part: part.id, text: t(lang, own.key, own.value != null ? { value: MARK } : {}) };
      } else {
        const [a, b] = r.current >= 0 ? [0, 1] : [1, 0];
        const label = (name) => (/^\d+$/.test(name) ? t(lang, 'page.info.pinNumber', { pin: name }) : pinName(name));
        const say = (value, x, y) => t(lang, 'probe.current', { value, part: part.id, from: label(part.pinNames[x]), to: label(part.pinNames[y]) });
        text = say(f(Math.abs(r.current), 'A'), a, b);
        templates[`part:${part.id}`] = { part: part.id, forward: say(MARK, 0, 1), backward: say(MARK, 1, 0) };
      }
      probes[`part:${part.id}`] = text;
    }
  }
  return { parts, probes, kinds, templates };
}

// "Bipolar transistor", explained by the kit's description of that kind of part.
function kindLine(part, lang, kinds) {
  const keys = describeKeys(part);
  const text = t(lang, `type.${part.def?.typeKey ?? part.type}`);
  if (!keys.length) return { key: null, text };
  const key = `describe.${keys.join('+')}`;
  kinds[key] = describePart(part, lang);
  return { key, text };
}

// The part's value as a line that can be explained: "Capacitance: 100 µF 25 V".
const VALUE_KEYS = {
  resistor: 'resistor', capacitor: 'capacitor', potentiometer: 'potentiometer', led: 'led', diode: 'part', bjt: 'part', mosfet: 'part', ic: 'part', battery: 'battery',
  zener: 'zener', bridge: 'part', module: 'part', regulator: 'part', inductor: 'inductor', thermistor: 'thermistor', ldr: 'part',
};
function valueLine(part, lang) {
  const value = valueText(part, lang);
  if (part.type === 'button') return { key: 'state', text: t(lang, 'page.value.button', { value }) };
  const kind = VALUE_KEYS[part.type];
  return kind && value ? { key: `value.${kind}`, text: t(lang, `page.value.${kind}`, { value }) } : null;
}

// Every explanation the page may need, once.
function explanations(lang) {
  const keys = ['voltage', 'current', 'power', 'brightness', 'state', 'vbe', 'vce', 'ib', 'ic', 'beta', 'vgs', 'vds', 'id', 'pot.current', 'floating', 'unsupported',
    ...['emf', 'voltage', 'drop', 'current', 'power', 'runtime', 'charge', 'off'].map((k) => `battery.${k}`),
    ...['regulating', 'dropout', 'vin', 'vout', 'headroom', 'iout', 'quiescent'].map((k) => `reg.${k}`),
    ...['vac', 'vdc', 'current'].map((k) => `bridge.${k}`),
    ...['temperature', 'light', 'resistance'].map((k) => `sensor.${k}`),
    ...['off', 'active', 'saturation'].map((r) => `region.bjt.${r}`), ...['off', 'linear', 'saturation'].map((r) => `region.mosfet.${r}`),
    ...Object.values(VALUE_KEYS).map((k) => `value.${k}`)];
  return Object.fromEntries(keys.map((k) => [k, t(lang, `explain.${k}`)]));
}

// What the live page needs besides the program: the conductor view's pieces (with the current
// layer), the texts its card lines, tags, clock, controls and warnings use, the probe captions
// to fill in, the controls panel.
function liveData(circuit, lang, flow, templates) {
  const texts = {};
  const dict = { ...LANGUAGES.en, ...(LANGUAGES[lang] ?? {}) };
  for (const key of Object.keys(dict)) if (/^(sim|state|probe)\.|^page\.(time|live|control|controls|warnings|falstad)\.|^check\.SIM_|^falstad\./.test(key)) texts[key] = t(lang, key);
  const dc = flow ? simulate(circuit, { analysis: 'dc' }) : null;
  return {
    flow: dc?.ok ? liveFlow(buildCircuit(circuit), dc, circuit) : null,
    texts,
    decimal: decimalSeparator(lang),
    probes: templates,
    start: circuit.page?.start === 'zero' ? 'zero' : 'dc',
    // The controls panel (page.controls): which control, its range and label in this language.
    panel: (Array.isArray(circuit.page?.controls) ? circuit.page.controls : []).map((c) => ({ id: c.part ?? c.supply, field: c.field, min: c.min, max: c.max, scale: c.scale, label: localized(c.label, lang) ?? undefined })),
  };
}

// JSON inside <script> must never contain "</script>".
const safeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

export function renderPage(circuit, options = {}) {
  const { lang = 'en', fit = 'parts' } = options;
  const first = circuit?.view ?? 'front';
  const views = options.views ?? [first, OPPOSITE[first]].filter(Boolean);
  // Simulation results and current flow only when the circuit asks for them. Results show
  // only for the part that is tapped (on the board and in its card): never all at once.
  const results = Boolean(circuit?.page?.results);
  const flow = Boolean(circuit?.page?.flow);
  const rendered = views.map((view) => ({ view, ...viewSvg(circuit, view, fit, lang, { sim: results, flow }) }));
  const issues = rendered[0]?.issues ?? [];
  if (!rendered.length || rendered.some((r) => !r.svg)) return { html: null, issues };

  const sim = results ? simulate(circuit, { analysis: 'dc' }) : null;
  const { parts, probes, kinds, templates } = partData(circuit, lang, sim);
  // The simulation runs in the page when the circuit asks for results or the current layer.
  const compiled = results || flow ? compile(circuit) : null;
  const live = compiled?.program ? liveData(circuit, lang, flow, templates) : null;
  const data = {
    parts,
    probes,
    explain: { ...explanations(lang), ...kinds },
    focus: Array.isArray(circuit.page?.focus) ? circuit.page.focus : [],
    ...(live && { live }),
    text: { pins: t(lang, 'page.info.pins'), results: results ? t(lang, 'page.results') : null, ghost: t(lang, 'page.info.ghost'), close: t(lang, 'page.info.close'), explain: t(lang, 'page.info.explain') },
  };
  const title = titleOf(circuit, lang) ?? t(lang, 'page.untitled');
  const svgs = rendered.map((r, i) => (i ? r.svg.replace(/^<svg /, '<svg hidden ') : r.svg));
  const nav = [
    views.length > 1 ? `<span class="group">${views.map((v) => button('view', v, t(lang, `page.view.${v}`))).join('')}</span>` : '',
    `<span class="group">${button('fit', 'parts', t(lang, 'page.fit.parts'))}${button('fit', 'board', t(lang, 'page.fit.board'))}</span>`,
    `<span class="group">${button('labels', null, t(lang, 'page.labels'))}</span>`,
    flow ? `<span class="group">${button('layer', 'parts', t(lang, 'page.layer.parts'))}${button('layer', 'flow', t(lang, 'page.layer.flow'))}</span>` : '',
    flow ? `<span class="group">${button('speed', 'linear', t(lang, 'page.speed.linear'))}${button('speed', 'log', t(lang, 'page.speed.log'))}</span>` : '',
    `<span class="hint hint-default">${escapeXml(t(lang, 'page.hint'))}</span>`,
    results ? `<span class="hint hint-results">${escapeXml(t(lang, 'page.hint.results'))}</span>` : '',
    `<span class="revision">${escapeXml(t(lang, 'page.revision', { revision: circuit.revision ?? 0 }))}</span>`,
  ].join('');
  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="protoboard-iso">
<meta name="revision" content="${circuit.revision ?? 0}">
<title>${escapeXml(title)}</title>
<style>${STYLE}
</style>
<style id="dynamic"></style>
<style id="probe"></style>
</head>
<body data-fit="${fit}"${results ? ' data-results="on"' : ''}>
<nav hidden>${nav}</nav>
<main>
${svgs.join('\n')}
<aside class="info" hidden></aside>
<div class="side"></div>
<div class="tooltip" hidden></div>
</main>
<script type="application/json" id="page-data">${safeJson(data)}</script>
${live ? `<script type="application/json" id="sim-program">${safeJson(compiled.program)}</script>\n` : ''}<script>${pageScript(Boolean(live))}</script>
</body>
</html>
`;
  return { html, issues };
}
