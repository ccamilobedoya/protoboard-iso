// The card of a tapped part: what it is, its value, how it is used here, where each pin goes,
// (with the results on) its simulated values, and in a live page the limits it went past, its
// oscilloscope and its controls (limits.js, scope.js, controls.js). Every value can be tapped to
// read what it means.
//
// The card of a tapped strip (a node, stage 3 phase 9): what a strip is, what is clipped to it and
// where, and with the results its voltage to ground, the current of each lead and its
// oscilloscope. page.open is the part's id, or "node:<group>" for a strip.

import { applyFocus } from './focus.js';

function item(parent, tag, text, cls) {
  const el = document.createElement(tag);
  if (text != null) el.textContent = text;
  if (cls) el.className = cls;
  parent.appendChild(el);
  return el;
}

// A value the learner can tap (or hover with a mouse) to read what it means.
function terms(page, parent, lines, open) {
  const list = item(parent, 'ul', null, 'terms');
  for (const line of lines) {
    const li = item(list, 'li');
    const text = page.data.explain[line.key];
    if (!text) {
      item(li, 'span', line.text);
      continue;
    }
    const button = item(li, 'button', line.text, 'term');
    button.type = 'button';
    button.dataset.explain = line.key;
    const explain = item(li, 'p', text, 'explain');
    explain.hidden = line.key !== open;
    button.setAttribute('aria-expanded', String(!explain.hidden));
    button.addEventListener('click', () => {
      explain.hidden = !explain.hidden;
      button.setAttribute('aria-expanded', String(!explain.hidden));
    });
  }
}

function actions(info, buttons) {
  const row = item(info, 'div', null, 'actions');
  for (const [label, act, pressed] of buttons) {
    const b = item(row, 'button', label);
    b.type = 'button';
    if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed));
    b.addEventListener('click', () => act(b));
  }
}

function fillSim(page, box, lines, open) {
  box.textContent = '';
  item(box, 'h3', page.data.text.results);
  terms(page, box, lines, open);
}

// The limits the part went past (live page): "⚠ D1 carries 38 mA, more than its maximum 30 mA."
function fillNotes(page, box) {
  box.textContent = '';
  for (const text of page.stressNotes?.(page.open) ?? []) item(box, 'p', `⚠ ${text}`, 'stress');
}
export function refreshNotes(page) {
  const box = page.info.hidden ? null : page.info.querySelector('.notes');
  if (box) fillNotes(page, box);
}

function openInfo(page, id, open) {
  const { data, state, info } = page;
  const p = data.parts[id];
  info.textContent = '';
  item(info, 'h2', p.title);
  fillNotes(page, item(info, 'div', null, 'notes'));
  terms(page, info, [p.type, p.value].filter(Boolean), open);
  if (p.here) item(info, 'p', p.here, 'here');
  item(info, 'h3', data.text.pins);
  // Each pin's line opens the card of its strip, which the part often covers on screen.
  const pins = item(info, 'ul');
  p.pins.forEach((line, k) => {
    const node = p.pinNodes?.[k];
    if (node == null || !data.nodes?.[node]) return item(pins, 'li', line);
    const b = item(item(pins, 'li'), 'button', line, 'link');
    b.type = 'button';
    b.title = data.text.strip;
    b.addEventListener('click', () => selectNode(page, node));
  });
  if (p.sim.length) fillSim(page, item(info, 'div', null, 'sim'), p.sim, open);
  page.buildScope?.(info, id);
  page.buildControls?.(info, id);
  item(info, 'p', data.text.explain, 'tip');
  actions(info, [
    [data.text.ghost, (b) => {
      if (state.ghost.has(id)) state.ghost.delete(id);
      else state.ghost.add(id);
      b.setAttribute('aria-pressed', String(state.ghost.has(id)));
      applyFocus(page);
    }, state.ghost.has(id)],
    [data.text.close, () => select(page, null)],
  ]);
  info.hidden = false;
}

function openNodeInfo(page, node, open) {
  const { data, info } = page;
  const n = data.nodes[node];
  info.textContent = '';
  item(info, 'h2', n.title);
  item(info, 'p', n.about, 'here');
  item(info, 'h3', data.text.leads);
  const leads = item(info, 'ul');
  // Each part's line opens its card: from a strip to what is clipped to it, and back.
  for (const lead of n.leads) {
    if (!lead.part || !data.parts[lead.part]) {
      item(leads, 'li', lead.text);
      continue;
    }
    const b = item(item(leads, 'li'), 'button', lead.text, 'link');
    b.type = 'button';
    b.addEventListener('click', () => select(page, lead.part));
  }
  if (n.sim.length) fillSim(page, item(info, 'div', null, 'sim'), n.sim, open);
  page.buildScope?.(info, 'node:' + node);
  if (n.sim.length) item(info, 'p', data.text.explain, 'tip');
  actions(info, [[data.text.close, () => select(page, null)]]);
  info.hidden = false;
}

// Tap a strip in use: the parts clipped to it come forward with that strip (and, with the
// results, the probes that read its voltage), and its card opens.
export function selectNode(page, node, open) {
  const n = page.data.nodes[node];
  if (!n) return select(page, null);
  page.state.focus = new Set(n.parts);
  page.state.node = node;
  page.open = 'node:' + node;
  openNodeInfo(page, node, open);
  applyFocus(page);
}

// Tap a part (or nothing: id null) to focus it and open its card.
export function select(page, id, open) {
  page.state.focus = new Set(id ? [id] : []);
  page.state.node = null;
  page.open = id;
  if (id) openInfo(page, id, open);
  else page.info.hidden = true;
  applyFocus(page);
}

// The simulated values of the open card changed (live page): rewrite their texts in place, so
// an explanation the learner opened stays open. If the lines themselves changed, rebuild it.
export function refreshCard(page) {
  const id = page.open;
  if (!id || page.info.hidden) return;
  const node = id.startsWith('node:') ? id.slice(5) : null;
  const lines = (node != null ? page.data.nodes[node] : page.data.parts[id])?.sim ?? [];
  const reopen = (expanded) => (node != null ? openNodeInfo(page, node, expanded) : openInfo(page, id, expanded));
  const items = [...page.info.querySelectorAll('.sim .terms > li')];
  const same = items.length === lines.length && items.every((li, k) => (li.querySelector('.term')?.dataset.explain ?? null) === (page.data.explain[lines[k].key] ? lines[k].key : null));
  if (!same) {
    // Only the values are rebuilt: a slider being dragged lower in the card stays in place.
    const box = page.info.querySelector('.sim');
    const expanded = box?.querySelector('.term[aria-expanded="true"]')?.dataset.explain;
    if (box && lines.length) return fillSim(page, box, lines, expanded);
    return reopen(page.info.querySelector('.term[aria-expanded="true"]')?.dataset.explain);
  }
  items.forEach((li, k) => {
    const label = li.querySelector('.term') ?? li.querySelector('span');
    if (label && label.textContent !== lines[k].text) label.textContent = lines[k].text;
  });
}
