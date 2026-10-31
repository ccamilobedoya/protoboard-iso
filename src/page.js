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
import { iconSvg } from './page/client/icons.js';
import { bundleScript } from './node/bundle.js';
import { buildCircuit } from './circuit/build.js';
import { nodeParams } from './circuit/checks.js';
import { simulate, compile, pageSimulation } from './sim/index.js';
import { liveFlow, flowStyle } from './sim/paths.js';
import { LANGUAGES } from './i18n/index.js';
import { deviceOfReading } from './sim/devices/index.js';
import { partLines } from './sim/format.js';
import { groundHole } from './sim/probes.js';
import { nodeLines } from './sim/lines.js';
import { stripHoles } from './render/focus.js';
import { holeLattice, holeGridSvg } from './render/hole-grid.js';
import { describePart, describeKeys } from './parts/describe.js';
import { MODULES } from './parts/modules.js';
import { loadTour } from './tour.js';
import { THEMES } from './page/client/themes.js';

// The page's script, bundled once per process: without the simulation, or with it (the engine
// runs in the page when the circuit asks for results or the current layer).
const scripts = {};
const pageScript = (live) => (scripts[live ? 'live' : 'static'] ??= bundleScript(live ? 'page/client/live-page.js' : 'page/client/static-page.js', { comments: false }));

const OPPOSITE = { front: 'back', back: 'front', 'front-left': 'back-right', 'back-right': 'front-left' };
const box = ({ x, y, width, height }) => `${x} ${y} ${width} ${height}`;
const titleOf = (circuit, lang) => (typeof circuit.title === 'object' ? circuit.title?.[lang] ?? circuit.title?.en : circuit.title);

// A frame grown to hold some text boxes, with a small margin around what it adds.
function withBoxes(frame, ops) {
  const boxes = ops.map((op) => op.box).filter(Boolean);
  if (!boxes.length) return frame;
  const x0 = Math.min(frame.x, ...boxes.map((b) => b.x - 4));
  const y0 = Math.min(frame.y, ...boxes.map((b) => b.y - 4));
  const x1 = Math.max(frame.x + frame.width, ...boxes.map((b) => b.x + b.width + 4));
  const y1 = Math.max(frame.y + frame.height, ...boxes.map((b) => b.y + b.height + 4));
  return { x: Math.floor(x0), y: Math.floor(y0), width: Math.ceil(x1 - x0), height: Math.ceil(y1 - y0) };
}

// One view as an inline SVG that scales with the page: the size comes from CSS, the frame
// (whole board or close-up) from the viewBox, switched by the script.
function viewSvg(circuit, view, fit, lang, { sim, flow }) {
  const board = renderCircuit(circuit, { view, lang, sim, flow, interactive: true });
  if (!board.svg) return { issues: board.issues };
  // The close-up frames what the page shows at rest (V3): the parts and their short labels, not
  // the ladder of boxes above them (Labels shows it; the learner can fit or zoom out then).
  const parts = renderCircuit(circuit, { view, lang, fit: 'parts', labels: false });
  const frames = { board: box(board.scene.frame), parts: box(withBoxes(parts.scene.frame, board.scene.layers.shortlabels ?? [])) };
  // No <title> inside: browsers show it as a tooltip over the whole drawing. The name goes to
  // aria-label instead, for screen readers.
  const name = titleOf(circuit, lang);
  const svg = board.svg
    .trim()
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/^<svg ([^>]*?)width="[^"]*" height="[^"]*" viewBox="[^"]*"/, `<svg $1viewBox="${frames[fit]}"`)
    .replace(/^<svg /, `<svg data-view="${view}" data-board="${frames.board}" data-parts="${frames.parts}" role="img"${name ? ` aria-label="${escapeXml(name)}"` : ''} `);
  return { svg, scene: board.scene, issues: board.issues };
}

// Where each strip in use is on screen, for a tap to find it (page/client/main.js): every hole
// of the strip, projected, with the strip's index; a tap within `r` of a hole is on that strip.
// r: a little more than half the distance between neighbouring holes, so the whole width of a
// strip answers but the gap between two strips, the channel and the board's edge do not.
function stripHits(scene, built, nodes) {
  const holes = [];
  let pitch = Infinity;
  nodes.forEach((node, k) => {
    const points = stripHoles(built.board, node).map((h) => scene.camera.project(h.pos));
    points.forEach((p, i) => {
      holes.push(Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, k);
      if (i) pitch = Math.min(pitch, Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y));
    });
  });
  return { r: Number.isFinite(pitch) ? Math.round(pitch * 0.7 * 100) / 100 : 0, holes };
}



const iconButton = (what, label) => `<button type="button" data-zoom="${what}" title="${escapeXml(label)}" aria-label="${escapeXml(label)}">${iconSvg(what)}</button>`;

// A bar button: an icon and a short label (the label hides on a narrow screen, so it is also the
// button's title). `toggle` = [on, off]: one button for two states (aria-pressed when on).
function barButton(key, icon, label, { toggle, value, title } = {}) {
  const attrs = [`data-key="${key}"`, toggle ? `data-on="${toggle[0]}" data-off="${toggle[1]}"` : '', value ? `data-value="${value}"` : ''].filter(Boolean).join(' ');
  return `<button type="button" ${attrs} title="${escapeXml(title ?? label)}" aria-pressed="false">${iconSvg(icon)}<span class="label">${escapeXml(label)}</span></button>`;
}


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
  const supplyLeads = new Map(); // node → the supply terminals clipped to it, for its card
  (Array.isArray(circuit.supplies) ? circuit.supplies : []).forEach((s, i) => {
    for (const [ref, sign] of [[s.positive ?? 'T+', '+'], [s.negative ?? 'T-', '−']]) {
      const hole = built.board?.find(String(ref));
      const node = hole ? hole.node : String(ref);
      const name = t(lang, 'page.info.supply', { supply: s.id ?? `V${i + 1}`, sign });
      supplyAt.set(node, [...(supplyAt.get(node) ?? []), name]);
      supplyLeads.set(node, [...(supplyLeads.get(node) ?? []), { name, supply: s.id ?? `V${i + 1}`, sign: sign === '+' ? 1 : -1, hole: hole?.id ?? null }]);
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
      return { used: all.length > 0, node: hole.node, text: `${where} — ${all.length ? t(lang, 'page.info.with', { list: all.join(', ') }) : t(lang, 'page.info.alone')}${note ? ` · ${note}` : ''}` };
    });
    if (part.def.usedPinsOnly) {
      const free = pins.filter((p) => !p.used).length;
      pins = pins.filter((p) => p.used);
      if (free) pins.push({ text: t(lang, 'page.info.free', { n: free }) });
    }
    // The strip of each line, so the card can open it (a part often hides its strip on screen).
    const pinNodes = pins.map((p) => p.node ?? null);
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
      pinNodes,
      sim: sim?.ok && sim.parts[part.id] ? partLines(sim.parts[part.id], lang) : [],
    };
  }
  // The card of each strip in use (stage 3, phase 9): what is clipped to it and, with the
  // results, its voltage to ground and the current of each lead.
  const nodes = {};
  for (const node of stripNodes(built, supplyLeads)) {
    const members = built.netlist.nodes[node] ?? [];
    const holes = stripHoles(built.board, node);
    const leads = [
      ...members.map((m) => ({ name: t(lang, 'page.node.lead', { part: m.part, pin: /^\d+$/.test(m.pin) ? t(lang, 'page.node.pinNumber', { pin: m.pin }) : pinName(m.pin) }), part: m.part, pin: m.pin, hole: m.hole })),
      ...(supplyLeads.get(node) ?? []),
    ];
    const used = new Set(leads.map((l) => l.hole).filter(Boolean));
    const ends = `${holes[0].id}–${holes.at(-1).id}`;
    nodes[node] = {
      title: nodeName(node),
      about: t(lang, /^\d+:/.test(node) ? 'page.node.strip' : 'page.node.rail', { holes: ends, n: holes.length }),
      leads: leads.map(({ name, part, pin, supply, sign, hole }) => ({ name, ...(part ? { part, pin } : { supply, sign }), text: hole ? t(lang, 'page.node.at', { who: name, hole }) : name })),
      parts: [...new Set(members.map((m) => m.part))],
      cols: [...new Set(holes.filter((h) => used.has(h.id)).map((h) => h.col))],
      rows: [...new Set(holes.filter((h) => used.has(h.id) && h.kind === 'main').map((h) => h.row))],
      sim: sim?.ok ? nodeLines(sim, node, leads, { t: (key, params) => t(lang, key, params), decimal: decimalSeparator(lang) }) : [],
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
  return { built, parts, nodes, probes, kinds, templates };
}

// The strips a tap can open: every group with a lead in it, and the rails a supply is clipped to.
function stripNodes(built, supplyLeads) {
  const exists = new Set([...built.board.holes.values()].map((h) => h.node));
  return [...new Set([...Object.keys(built.netlist.nodes), ...supplyLeads.keys()])].filter((n) => exists.has(n));
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
  const keys = ['voltage', 'current', 'power', 'node.voltage', 'node.current', 'brightness', 'state', 'vbe', 'vce', 'ib', 'ic', 'beta', 'vgs', 'vds', 'id', 'pot.current', 'floating', 'unsupported',
    ...['emf', 'voltage', 'drop', 'current', 'power', 'runtime', 'charge', 'off'].map((k) => `battery.${k}`),
    ...['regulating', 'dropout', 'vin', 'vout', 'headroom', 'iout', 'quiescent', 'led'].map((k) => `reg.${k}`),
    'switch.state', 'switch.contact',
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
  for (const key of Object.keys(dict)) if (/^(sim|state|probe)\.|^page\.(time|live|control|controls|warnings|falstad|scope|node|model|tour)\.|^check\.SIM_|^falstad\./.test(key)) texts[key] = t(lang, key);
  const dc = flow ? simulate(circuit, { analysis: 'dc' }) : null;
  return {
    flow: dc?.ok ? liveFlow(buildCircuit(circuit), dc, circuit, flowStyle(circuit)) : null,
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
  // Simulation results and the current layer whenever the circuit can be simulated, unless it
  // turns them off (pageSimulation). Results show only for the part that is tapped (on the board
  // and in its card): never all at once. The current layer is a button in the bar, not pressed.
  const { results, flow } = pageSimulation(circuit);
  const rendered = views.map((view) => ({ view, ...viewSvg(circuit, view, fit, lang, { sim: results, flow }) }));
  const issues = rendered[0]?.issues ?? [];
  if (!rendered.length || rendered.some((r) => !r.svg)) return { html: null, issues };

  const sim = results ? simulate(circuit, { analysis: 'dc' }) : null;
  const { built, parts, nodes, probes, kinds, templates } = partData(circuit, lang, sim);
  const order = Object.keys(nodes);

  // The simulation runs in the page with the results or the current layer.
  const compiled = results || flow ? compile(circuit) : null;
  const live = compiled?.program ? liveData(circuit, lang, flow, templates) : null;
  // The tour plays in a live page only: its steps move controls and read the simulation.
  const tour = live ? loadTour(circuit, lang).tour : null;
  const data = {
    parts,
    nodes,
    // Per view: the holes of the strips in use on screen (index into `strips`), for a tap.
    strips: order,
    hits: Object.fromEntries(rendered.map((r) => [r.view, stripHits(r.scene, built, order)])),
    probes,
    explain: { ...explanations(lang), ...kinds },
    focus: Array.isArray(circuit.page?.focus) ? circuit.page.focus : [],
    flowStyle: flow ? flowStyle(circuit) : null,
    ...(live && { live }),
    ...(tour && { tour }),
    text: { pins: t(lang, 'page.info.pins'), leads: t(lang, 'page.node.leads'), strip: t(lang, 'page.node.open'), results: results ? t(lang, 'page.results') : null, ghost: t(lang, 'page.info.ghost'), close: t(lang, 'page.info.close'), explain: t(lang, 'page.info.explain'), gestureTouch: t(lang, 'page.gesture.touch'), gestureWheel: t(lang, 'page.gesture.wheel'), fullscreen: t(lang, 'page.fullscreen'), fullscreenExit: t(lang, 'page.fullscreen.exit'), tabPart: t(lang, 'page.tab.part'), tabStrip: t(lang, 'page.tab.strip'), model: t(lang, 'sim.badge'), modelShort: t(lang, 'page.model') },
  };
  const title = titleOf(circuit, lang) ?? t(lang, 'page.untitled');
  // The grid of holes continued under the drawing, in it, so it moves with the board (V4).
  const withGrid = (r) => r.svg.replace(/^(<svg[^>]*>\s*<rect[^>]*\/>)/, (head) => head + holeGridSvg(holeLattice(r.scene, built.board), r.scene.frame, `grid-${r.view}`));
  const svgs = rendered.map((r, i) => (i ? withGrid(r).replace(/^<svg /, '<svg hidden ') : withGrid(r)));
  // The bar, grouped by job (UX pass, U3): view, layers, (time, added by live.js), then the ⋯ menu
  // with what is used less (dot speed, Falstad, the hint again, the revision).
  const menuItem = (key, value, text) => `<button type="button" role="menuitemradio" data-key="${key}" data-value="${value}" aria-checked="false">${escapeXml(text)}</button>`;
  const nav = [
    '<span class="group view">',
    views.length > 1 ? barButton('view', 'flip', t(lang, 'page.flip'), { toggle: [views[1], views[0]], title: t(lang, 'page.flip.title') }) : '',
    barButton('fit', 'board', t(lang, 'page.fit.board'), { toggle: ['board', 'parts'], title: t(lang, 'page.fit.title') }),
    '</span><span class="group layers">',
    barButton('labels', 'labels', t(lang, 'page.labels')),
    flow ? barButton('layer', 'current', t(lang, 'page.layer.flow'), { toggle: ['flow', 'parts'], title: t(lang, 'page.layer.title') }) : '',
    '</span><span class="spacer"></span>',
    results ? `<span class="model-badge">${escapeXml(t(lang, 'sim.badge'))}</span>` : '',
    `<span class="more"><button type="button" class="more-button" aria-haspopup="menu" aria-expanded="false" title="${escapeXml(t(lang, 'page.more'))}" aria-label="${escapeXml(t(lang, 'page.more'))}">${iconSvg('more')}</button>`,
    `<span class="menu" role="menu" hidden>`,
    flow ? `<span class="menu-group" role="group" aria-label="${escapeXml(t(lang, 'page.speed.title'))}"><span class="menu-title">${escapeXml(t(lang, 'page.speed.title'))}</span>${menuItem('speed', 'linear', t(lang, 'page.speed.linear'))}${menuItem('speed', 'log', t(lang, 'page.speed.log'))}</span>` : '',
    // The theme, the reader's to choose (kept for the next pages of the same site; main.js).
    `<span class="menu-group" role="group" aria-label="${escapeXml(t(lang, 'page.theme.title'))}"><span class="menu-title">${escapeXml(t(lang, 'page.theme.title'))}</span>${['auto', ...THEMES].map((v) => menuItem('theme', v, t(lang, `page.theme.${v}`))).join('')}</span>`,
    `<button type="button" role="menuitem" class="again">${escapeXml(t(lang, 'page.hint.again'))}</button>`,
    `<span class="revision">${escapeXml(t(lang, 'page.revision', { revision: circuit.revision ?? 0 }))}</span>`,
    '</span></span>',
  ].join('');
  // The first-time hint over the drawing: what can be tapped, and how to move (alone or in a note).
  const hint = `<div class="first-hint" hidden><span>${escapeXml(t(lang, results ? 'page.hint.results' : 'page.hint'))}</span><small class="alone">${escapeXml(t(lang, 'page.hint.move'))}</small><small class="framed">${escapeXml(t(lang, 'page.hint.moveEmbedded'))}</small></div>`;  // The inspector (UX pass, U4): the card of what was tapped and the circuit's panels, in tabs;
  // a panel on the right on a wide screen, a bottom sheet on a phone (page/client/inspector.js).
  const fold = escapeXml(t(lang, 'page.inspector.fold'));
  const inspector = `<aside class="inspector" hidden data-tab="circuit" data-size="half">
<div class="grip" aria-hidden="true"></div>
<div class="tabs" role="tablist"><button type="button" role="tab" data-tab="part" hidden>${escapeXml(t(lang, 'page.tab.part'))}</button><button type="button" role="tab" data-tab="circuit" hidden>${escapeXml(t(lang, 'page.tab.circuit'))}</button><span class="spacer"></span><button type="button" class="collapse" aria-expanded="true" title="${fold}" aria-label="${fold}">${iconSvg('chevron')}</button></div>
<div class="info" role="tabpanel" hidden></div>
<div class="side" role="tabpanel"></div>
</aside>`;
  // Theme: the system's unless the circuit fixes it (page.theme); the reader's choice in the menu
  // and ?theme= in the link win (main.js).
  const theme = THEMES.includes(circuit.page?.theme) ? circuit.page.theme : null;
  const html = `<!doctype html>
<html lang="${lang}"${theme ? ` data-theme="${theme}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#e8e5dc">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#272623">
<meta name="generator" content="protoboard-iso">
<meta name="revision" content="${circuit.revision ?? 0}">
<title>${escapeXml(title)}</title>
<style>${STYLE}
</style>
<style id="dynamic"></style>
<style id="probe"></style>
</head>
<body data-fit="${fit}"${results ? ' data-results="on"' : ''}${flow ? ` data-flow="${flowStyle(circuit)}"` : ''}>
<nav hidden>${nav}</nav>
<main>
${svgs.join('\n')}
${inspector}
<div class="zoom" hidden>${['in', 'out', 'fit'].map((w) => iconButton(w, t(lang, `page.zoom.${w}`))).join('')}${iconButton('full', t(lang, 'page.fullscreen'))}</div>
<div class="gesture-hint" aria-live="polite"></div>
${hint}
<div class="tooltip" hidden></div>
</main>
<script type="application/json" id="page-data">${safeJson(data)}</script>
${live ? `<script type="application/json" id="sim-program">${safeJson(compiled.program)}</script>\n` : ''}<script>${pageScript(Boolean(live))}</script>
</body>
</html>
`;
  return { html, issues };
}
