// Focus: the veil dims everything; the focused parts are cloned (in painting order) into a
// .spotlight group above it, and CSS rules written on the fly show the strips under their
// leads. See-through lowers a part's opacity, in the drawing and in its copy.
// Careful: SVG elements have no `hidden` property (only HTML elements do); use the attribute.

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

export function applyFocus(page) {
  const { data, state, svgs } = page;
  const ids = [...state.focus].filter((id) => data.parts[id]);
  const nodes = new Set(ids.flatMap((id) => data.parts[id].nodes));
  const of = (layer) => ids.map((id) => ':scope > .' + layer + ' > [data-part="' + quote(id) + '"]').join(', ');
  for (const svg of svgs) {
    const parts = groupOf(svg, 'spotlight', ['flow', 'results', 'probes']);
    const labels = groupOf(svg, 'spotlabels', ['results', 'probes']);
    parts.textContent = '';
    labels.textContent = '';
    if (!ids.length) continue;
    for (const el of [...svg.querySelectorAll(of('under')), ...svg.querySelectorAll(of('parts'))]) parts.appendChild(el.cloneNode(true));
    for (const el of svg.querySelectorAll(of('labels'))) labels.appendChild(el.cloneNode(true));
  }
  // Strips under the focused parts; with the results on, their currents and the voltages
  // of their groups (and nothing else: all tags at once is too much to read).
  // And the column numbers and row letters of their leads, where the board prints them.
  const cols = new Set(ids.flatMap((id) => data.parts[id].cols || []));
  const rows = new Set(ids.flatMap((id) => data.parts[id].rows || []));
  const shown = [...ids.map((id) => '.results > [data-part="' + quote(id) + '"]'), ...[...nodes].flatMap((n) => ['.strips > [data-node="' + quote(n) + '"]', '.results > [data-node="' + quote(n) + '"]']),
    ...[...cols].map((c) => '.coords > [data-col="' + c + '"]'), ...[...rows].map((r) => '.coords > [data-row="' + quote(r) + '"]')];
  const ghosts = [...state.ghost].map((id) => '.under > [data-part="' + quote(id) + '"], .parts > [data-part="' + quote(id) + '"], .spotlight > [data-part="' + quote(id) + '"] { opacity: 0.2; }');
  page.dynamic.textContent = (shown.length ? shown.join(', ') + ' { display: inline; }' : '') + ghosts.join('');
  document.body.classList.toggle('focusing', ids.length > 0);
}
