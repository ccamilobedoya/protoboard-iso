// Focus: the veil dims everything; the focused parts are cloned (in painting order) into a
// .spotlight group above it, and CSS rules written on the fly show the strips under their
// leads (or, for a tapped strip, that strip and the parts clipped to it). See-through lowers a part's opacity, in the drawing and in its copy.
// Careful: SVG elements have no `hidden` property (only HTML elements do); use the attribute.
// A part lifted off the board (M15 insertion, M16 a raised part; liftPart) is its copy moved up the screen.

export const quote = (s) => String(s).replace(/["\\]/g, '\\$&');
const SVG = 'http://www.w3.org/2000/svg';

// The copies of the parts go under the current layer (its conductors run through them); the
// copies of their labels go above it, so the dots never cover a label.
function groupOf(svg, cls, before) {
  let g = svg.querySelector(':scope > .' + cls);
  if (!g) {
    g = document.createElementNS(SVG, 'g');
    g.setAttribute('class', cls);
    svg.insertBefore(g, before.map((b) => svg.querySelector(':scope > .' + b)).find(Boolean) || null);
  }
  return g;
}

// A recording (V4) keeps one label in the frame, the told part's (page.told, set by tour.js), and
// it is its short label, beside the part: a box's leader would reach up into the caption. A page
// has no page.told and brings every focused part's box forward.
function labelsOf(page, svg, ids, of) {
  if (page.told === undefined) return [...svg.querySelectorAll(of('labels'))];
  if (!ids.includes(page.told)) return [];
  return [...svg.querySelectorAll(':scope > .shortlabels > [data-part="' + quote(page.told) + '"]')];
}

export function applyFocus(page) {
  const { data, state, svgs } = page;
  const ids = [...state.focus].filter((id) => data.parts[id]);
  const nodes = new Set(ids.flatMap((id) => data.parts[id].nodes));
  const of = (layer) => ids.map((id) => ':scope > .' + layer + ' > [data-part="' + quote(id) + '"]').join(', ');
  for (const svg of svgs) {
    // In the plan the copies go over the current layer, seen through (page/style.js), so its
    // lines read under their bodies; otherwise under it.
    const parts = groupOf(svg, 'spotlight', data.flowStyle === 'plan' ? ['marks', 'spotlabels', 'results', 'probes'] : ['flow', 'results', 'probes']);
    const labels = groupOf(svg, 'spotlabels', ['results', 'probes']);
    parts.textContent = '';
    labels.textContent = '';
    if (!ids.length) continue;
    for (const el of [...svg.querySelectorAll(of('under')), ...svg.querySelectorAll(of('parts'))]) parts.appendChild(el.cloneNode(true));
    for (const el of labelsOf(page, svg, ids, of)) {
      const copy = el.cloneNode(true);
      if (page.told !== undefined) copy.classList.add('short');
      labels.appendChild(copy);
    }
  }
  // Strips under the focused parts; with the results on, their currents and the voltages
  // of their groups (and nothing else: all tags at once is too much to read).
  // And the column numbers and row letters of their leads, where the board prints them.
  // A tapped strip (state.node) instead: that strip only, its voltage with the two probes that
  // read it (red on the strip, black on ground), and the coordinates of the holes in use there.
  const strip = state.node != null ? data.nodes[state.node] : null;
  const cols = new Set(strip ? strip.cols : ids.flatMap((id) => data.parts[id].cols || []));
  const rows = new Set(strip ? strip.rows : ids.flatMap((id) => data.parts[id].rows || []));
  const node = strip ? quote(state.node) : null;
  const shown = [
    ...(strip ? ['.strips > [data-node="' + node + '"]', '.results > [data-node="' + node + '"]', '.probes > [data-probe="node:' + node + '"]']
      : [...ids.map((id) => '.results > [data-part="' + quote(id) + '"]'), ...[...nodes].flatMap((n) => ['.strips > [data-node="' + quote(n) + '"]', '.results > [data-node="' + quote(n) + '"]'])]),
    ...[...cols].map((c) => '.coords > [data-col="' + c + '"]'), ...[...rows].map((r) => '.coords > [data-row="' + quote(r) + '"]')];
  const ghosts = [...state.ghost].map((id) => '.under > [data-part="' + quote(id) + '"], .parts > [data-part="' + quote(id) + '"], .spotlight > [data-part="' + quote(id) + '"] { opacity: 0.2; }');
  for (const [id, mm] of page.lifted ?? []) placeLift(page, id, mm);
  page.dynamic.textContent = (shown.length ? shown.join(', ') + ' { display: inline; }' : '') + ghosts.join('');
  document.body.classList.toggle('focusing', ids.length > 0 || strip != null);
}

// A part `mm` above its holes: its copies over the veil (and its label's) moved up the screen, the
// drawing's z being the screen's vertical (page.data.lift units a mm), and the part itself unseen
// below while it is in the air. 0 puts it back. Each copy is wrapped once in a group that takes the
// transform (a copy may carry its own, a text's matrix), so the painting order stays as it was.
export function liftPart(page, id, mm) {
  page.lifted ??= new Map();
  if (mm > 0) page.lifted.set(id, mm);
  else page.lifted.delete(id);
  placeLift(page, id, mm);
}
function placeLift(page, id, mm) {
  const part = '[data-part="' + quote(id) + '"]';
  const dy = -(mm * (page.data.lift ?? 0));
  for (const svg of page.svgs) {
    for (const el of svg.querySelectorAll(':scope > .spotlight > ' + part + ', :scope > .spotlabels > ' + part)) {
      let g = el;
      if (!el.classList.contains('lift')) {
        g = document.createElementNS(SVG, 'g');
        g.setAttribute('class', 'lift');
        g.setAttribute('data-part', id);
        el.replaceWith(g);
        g.appendChild(el);
      }
      if (mm > 0) g.setAttribute('transform', 'translate(0 ' + dy.toFixed(2) + ')');
      else g.removeAttribute('transform');
    }
    for (const el of svg.querySelectorAll(':scope > .under > ' + part + ', :scope > .parts > ' + part)) el.style.opacity = mm > 0 ? '0' : '';
  }
}

