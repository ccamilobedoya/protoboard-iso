// The card of a tapped part (UX pass, U4: it lives in the inspector, see inspector.js): a head
// that stays at the top (title, see-through, close) and a summary line (the MODEL badge and the
// values), then what it is, its value, how it is used here, (with the results on) its simulated
// values, and in a live page the limits it went past, its
// oscilloscope and its controls (limits.js, scope.js, controls.js). Every value can be tapped to
// read what it means.
//
// The card of a tapped strip (a node, stage 3 phase 9): what a strip is, what is clipped to it and
// where, and with the results its voltage to ground, the current of each lead and its
// oscilloscope. page.open is the part's id, or "node:<group>" for a strip.

import { applyFocus } from './focus.js';
import { iconSvg } from './icons.js';

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

// [label, act, pressed, icon]: with an icon, the label is the button's title (and its text for
// screen readers), so the head stays one line.
function actions(parent, buttons) {
  const row = item(parent, 'div', null, 'actions');
  for (const [label, act, pressed, icon] of buttons) {
    const b = item(row, 'button', icon ? null : label);
    if (icon) {
      b.innerHTML = `${iconSvg(icon)}<span class="sr"></span>`;
      b.lastChild.textContent = label;
      b.title = label;
      b.className = 'icon-button';
    }
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

// The head: the title and its buttons, kept at the top while the card scrolls.
function head(page, title, buttons) {
  const box = item(page.info, 'div', null, 'head');
  item(box, 'h2', title);
  actions(box, buttons);
}
// The summary under the head: shown only in a peeking sheet (all it shows), a MODEL chip and up to
// three values, each in its own slot (style.js). The badge in the frame's corner says which simulation.
// Rewritten in place (the live page refreshes it every frame).
function fillSummary(page, box, lines) {
  box.hidden = !lines.length;
  if (!lines.length) return;
  if (!box.querySelector('.model')) item(box, 'span', page.data.text.modelShort, 'model');
  const values = box.querySelector('.values') ?? item(box, 'span', null, 'values');
  const shown = lines.slice(0, 3).map((l) => l.text.split(': ').pop());
  while (values.children.length > shown.length) values.lastChild.remove();
  while (values.children.length < shown.length) item(values, 'span', null, 'slot');
  shown.forEach((text, k) => {
    if (values.children[k].textContent !== text) values.children[k].textContent = text;
  });
}

function openInfo(page, id, open) {
  const { data, state, info } = page;
  const p = data.parts[id];
  info.textContent = '';
  head(page, p.title, [
    [data.text.ghost, (b) => {
      if (state.ghost.has(id)) state.ghost.delete(id);
      else state.ghost.add(id);
      b.setAttribute('aria-pressed', String(state.ghost.has(id)));
      applyFocus(page);
    }, state.ghost.has(id), 'eye'],
    [data.text.close, () => select(page, null), undefined, 'close'],
  ]);
  fillSummary(page, item(info, 'div', null, 'summary'), p.sim);
  fillNotes(page, item(info, 'div', null, 'notes'));
  terms(page, info, [p.type, p.value].filter(Boolean), open);
  if (p.here) item(info, 'p', p.here, 'here');
  if (p.sim.length) fillSim(page, item(info, 'div', null, 'sim'), p.sim, open);
  page.buildScope?.(info, id);
  page.buildControls?.(info, id);
  // Each pin's line opens the card of its strip, which the part often covers on screen. Folded:
  // where the pins go is reference, read less often than what the part does.
  const fold = item(info, 'details', null, 'pins');
  item(fold, 'summary', data.text.pins);
  const pins = item(fold, 'ul');
  p.pins.forEach((line, k) => {
    const node = p.pinNodes?.[k];
    if (node == null || !data.nodes?.[node]) return item(pins, 'li', line);
    const b = item(item(pins, 'li'), 'button', line, 'link');
    b.type = 'button';
    b.title = data.text.strip;
    b.addEventListener('click', () => selectNode(page, node));
  });
  item(info, 'p', data.text.explain, 'tip');
  info.hidden = false;
}

function openNodeInfo(page, node, open) {
  const { data, info } = page;
  const n = data.nodes[node];
  info.textContent = '';
  head(page, n.title, [[data.text.close, () => select(page, null), undefined, 'close']]);
  fillSummary(page, item(info, 'div', null, 'summary'), n.sim);
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
  page.cardChanged?.();
}

// Tap a part (or nothing: id null) to focus it and open its card.
export function select(page, id, open) {
  page.state.focus = new Set(id ? [id] : []);
  page.state.node = null;
  page.open = id;
  if (id) openInfo(page, id, open);
  else page.info.hidden = true;
  applyFocus(page);
  page.cardChanged?.();
}

// The simulated values of the open card changed (live page): rewrite their texts in place, so
// an explanation the learner opened stays open. If the lines themselves changed, rebuild it.
export function refreshCard(page) {
  const id = page.open;
  if (!id || page.info.hidden) return;
  const node = id.startsWith('node:') ? id.slice(5) : null;
  const lines = (node != null ? page.data.nodes[node] : page.data.parts[id])?.sim ?? [];
  const reopen = (expanded) => (node != null ? openNodeInfo(page, node, expanded) : openInfo(page, id, expanded));
  const summary = page.info.querySelector('.summary');
  if (summary) fillSummary(page, summary, lines);
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
