// The card of a tapped part: what it is, its value, how it is used here, where each pin goes,
// and (with the results on) its simulated values. Every value can be tapped to read what it means.

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

function openInfo(page, id, open) {
  const { data, state, info } = page;
  const p = data.parts[id];
  info.textContent = '';
  item(info, 'h2', p.title);
  terms(page, info, [p.type, p.value].filter(Boolean), open);
  if (p.here) item(info, 'p', p.here, 'here');
  item(info, 'h3', data.text.pins);
  const pins = item(info, 'ul');
  for (const line of p.pins) item(pins, 'li', line);
  if (p.sim.length) {
    const sim = item(info, 'div', null, 'sim');
    item(sim, 'h3', data.text.results);
    terms(page, sim, p.sim, open);
  }
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

// Tap a part (or nothing: id null) to focus it and open its card.
export function select(page, id, open) {
  page.state.focus = new Set(id ? [id] : []);
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
  const lines = page.data.parts[id]?.sim ?? [];
  const items = [...page.info.querySelectorAll('.sim .terms > li')];
  const same = items.length === lines.length && items.every((li, k) => (li.querySelector('.term')?.dataset.explain ?? null) === (page.data.explain[lines[k].key] ? lines[k].key : null));
  if (!same) {
    const expanded = page.info.querySelector('.term[aria-expanded="true"]')?.dataset.explain;
    return openInfo(page, id, expanded);
  }
  items.forEach((li, k) => {
    const label = li.querySelector('.term') ?? li.querySelector('span');
    if (label && label.textContent !== lines[k].text) label.textContent = lines[k].text;
  });
}
