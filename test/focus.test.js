// Focus (dim the rest, show a part and its strips on top), current flow, and the interactive
// page that uses both: tap a part, read its card, switch to the current layer.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderCircuit } from '../src/index.js';
import { renderPage } from '../src/page.js';
import { buildCircuit } from '../src/circuit/build.js';
import { simulate } from '../src/sim/index.js';
import { conductorPieces, partPaths, dotSpeed, voltageColor, bodyShare, VOLTAGE_COLORS } from '../src/sim/paths.js';
import { glowOpacity } from '../src/sim/look.js';

const example = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));
const layer = (svg, name) => svg.match(new RegExp(`<g class="${name}">([\\s\\S]*?)</g>`))?.[1] ?? null;

// Push button → base resistor → NPN transistor switching an LED (pressed).
const switchCircuit = () => ({
  netLabels: { 'T+': '+5 V', 'T-': 'GND' },
  supplies: [{ id: 'V1', voltage: 5 }],
  parts: [
    { id: 'S1', type: 'button', pressed: true, pins: ['f10', 'e10', 'f12', 'e12'] },
    { id: 'W1', type: 'wire', color: 'red', pins: ['T+10', 'j10'] },
    { id: 'R1', type: 'resistor', value: '10k', pins: ['a12', 'a17'] },
    { id: 'Q1', type: 'bjt', part: '2N2222A', pins: { E: 'c16', B: 'c17', C: 'c18' }, description: { en: 'NPN transistor', es: 'Transistor NPN' } },
    { id: 'W2', type: 'wire', color: 'black', pins: ['a16', 'B-16'] },
    { id: 'R2', type: 'resistor', value: '330', pins: ['T+24', 'h24'] },
    { id: 'D1', type: 'led', color: 'green', pins: { anode: 'g24', cathode: 'g25' } },
    { id: 'W3', type: 'wire', color: 'yellow', pins: ['j25', 'e18'] },
    { id: 'W4', type: 'wire', color: 'black', pins: ['T-3', 'j3'] },
    { id: 'W5', type: 'wire', color: 'black', pins: ['i3', 'B-3'] },
  ],
});

test('static focus: a veil, the chosen parts on top, and only their strips', () => {
  const { svg } = renderCircuit(switchCircuit(), { focus: ['Q1'] });
  assert.ok(layer(svg, 'veil'), 'veil');
  const strips = [...new Set([...layer(svg, 'strips').matchAll(/data-node="([^"]+)"/g)].map((m) => m[1]))].sort();
  assert.deepEqual(strips, ['16:a-e', '17:a-e', '18:a-e'], 'the three strips under the transistor');
  const spot = layer(svg, 'spotlight');
  assert.ok(spot.length > 1000, 'the transistor is drawn again on top');
  assert.ok(svg.indexOf('class="spotlight"') > svg.indexOf('class="veil"'));
  // Its column numbers and row letter, where the board prints them (two of each), under the copy.
  const coords = layer(svg, 'coords');
  const cols = [...coords.matchAll(/<text[^>]*data-col="(\d+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(cols, ['16', '16', '17', '17', '18', '18']);
  assert.equal([...coords.matchAll(/<text[^>]*data-row="c"/g)].length, 2);
  assert.ok(svg.indexOf('class="coords"') < svg.indexOf('class="spotlight"'));
  assert.doesNotMatch(renderCircuit(switchCircuit(), {}).svg, /class="(veil|strips|spotlight|coords)"/, 'nothing without focus');
  // With the current layer too, the label copy sits above it.
  const both = renderCircuit(switchCircuit(), { focus: ['Q1'], flow: true }).svg;
  assert.ok(both.indexOf('class="spotlabels"') > both.indexOf('class="flow"'));
  assert.match(layer(both, 'spotlabels'), /data-part="Q1"|Q1/);
});

test('current flow obeys Kirchhoff along every strip and runs + to − (conventional)', () => {
  const circuit = switchCircuit();
  const built = buildCircuit(circuit);
  const sim = simulate(circuit);
  const { dots } = conductorPieces(built, sim, circuit);
  // Every part: the currents at its pins add up to zero.
  for (const [id, r] of Object.entries(sim.parts)) {
    const sum = Object.values(r.pinCurrents).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum) < 1e-9, `${id}: pin currents add to zero`);
  }
  // The + rail carries the whole supply current from the clip (first hole) to the first lead.
  const rail = dots.filter((s) => s.ref.node === 'T+');
  assert.ok(Math.abs(rail[0].current - sim.supplies.V1.current) < 1e-9);
  // In the LED strip the current goes from R2 (row h) to the LED anode (row g).
  const anode = dots.filter((s) => s.ref.node === '24:f-j');
  assert.equal(anode.length, 1);
  const [seg] = anode;
  const forward = seg.current > 0 ? seg.points[0] : seg.points.at(-1); // where the conventional current starts
  assert.ok(Math.abs(Math.abs(seg.current) - sim.parts.D1.current) < 1e-9);
  assert.deepEqual([forward.x, forward.y], [built.board.find('h24').pos.x, built.board.find('h24').pos.y], 'from R2 towards the anode');
  // Through the LED: in at the anode (positive into the part), out at the cathode.
  const led = dots.filter((d) => d.ref.part === 'D1');
  assert.equal(led.length, 2);
  assert.ok(led[0].current > 0 && led[1].current < 0);
  // Drawn: coloured conductors, then dots whose path starts where the current comes from.
  const { svg } = renderCircuit(circuit, { flow: true });
  const flow = layer(svg, 'flow');
  assert.match(flow, /<path d="M[^"]+" fill="none" stroke="#[0-9a-f]{6}"[^>]*class="conductor"/);
  assert.match(flow, /class="dots"[^>]*style="--lin:[\d.]+s;--log:[\d.]+s"/);
  assert.doesNotMatch(flow, /electrons|NaN/);
  // The LED is drawn lit: a halo of rings fading together (data-glow).
  assert.equal((flow.match(/<circle [^>]*class="glow"[^>]*data-glow="D1"/g) ?? []).length, 3);
  // Proportional speed: half the current, half the speed; the log scale still exists.
  assert.equal(dotSpeed(0.005, 0.01), dotSpeed(0.01, 0.01) / 2);
  assert.ok(dotSpeed(0.01, 0.01, 'log') > dotSpeed(0.0001, 0.01, 'log') && dotSpeed(1e-7, 0.01) === 0, 'still below 1 µA');
});

test('paths follow the real leads: from each hole at board level to a point inside the part', () => {
  const built = buildCircuit(switchCircuit());
  for (const part of built.parts) {
    const paths = partPaths(part);
    assert.equal(paths.length, part.holes.length, part.id);
    const end = paths[0].points.at(-1);
    paths.forEach((p, k) => {
      assert.deepEqual([p.points[0].x, p.points[0].y, p.points[0].z], [part.holes[k].pos.x, part.holes[k].pos.y, 0], `${part.id} ${p.pin} starts in its hole`);
      assert.deepEqual(p.points.at(-1), end, `${part.id}: all pins meet at one point`);
      assert.ok(p.body >= 1 && p.body < p.points.length, `${part.id}: body index`);
      for (const q of p.points) assert.ok([q.x, q.y, q.z].every(Number.isFinite));
    });
  }
  // Leads and wires rise above the board; the LED path ends inside its dome.
  const [r1] = partPaths(built.parts.find((p) => p.id === 'R1'));
  assert.ok(r1.points[1].z > 0);
  const w = partPaths(built.parts.find((p) => p.id === 'W3'));
  assert.ok(w[0].points.at(-1).z > 3, 'the middle of the jumper arc');
  // A battery part: from the hole, along its cable, into the battery.
  const battery = buildCircuit(example('battery-regulator.json')).parts.find((p) => p.type === 'battery');
  const bp = partPaths(battery);
  assert.ok(bp[0].points.length > 5 && bp[0].points.at(-1).x < bp[0].points[0].x - 10, 'inside the battery, beside the board (left)');
});

test('voltage colours: grey at 0 V, red towards +, blue towards −; floating is pale; steep inside bodies', () => {
  assert.equal(voltageColor(0, 5), VOLTAGE_COLORS.zero);
  assert.equal(voltageColor(5, 5), VOLTAGE_COLORS.positive);
  assert.equal(voltageColor(-9, 5), VOLTAGE_COLORS.negative);
  assert.notEqual(voltageColor(null, 5), voltageColor(0, 5));
  // Inside a body the change is gathered in the middle: little near the lead, all of it at the middle.
  // A lit LED shows from a tenth of its rated current; none shows nothing.
  assert.equal(glowOpacity(0), 0);
  assert.ok(glowOpacity(0.1) > 0.4 && glowOpacity(1) === 1 && glowOpacity(3) === 1);
  assert.ok(Math.abs(bodyShare(0)) < 1e-12 && Math.abs(bodyShare(1) - 1) < 1e-12);
  assert.ok(bodyShare(0.25) < 0.05 && bodyShare(0.75) > 0.25, 'steeper than a straight line towards the middle');
});

test('no flow without a simulation, and nothing moves in a released switch branch', () => {
  const { supplies, ...bare } = switchCircuit();
  assert.deepEqual(conductorPieces(buildCircuit(bare), simulate(bare), bare).dots, []);
  const released = switchCircuit();
  released.parts[0].pressed = false;
  const { dots, wires } = conductorPieces(buildCircuit(released), simulate(released), released);
  assert.ok(!dots.some((s) => s.ref.part === 'D1' || s.ref.part === 'R1'), 'LED and base resistor carry no current');
  assert.ok(wires.some((s) => s.ref.part === 'D1'), 'but their conductors are still drawn');
});

async function loadPage(html) {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    return null;
  }
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  for (const svg of dom.window.document.querySelectorAll('svg')) svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 500 });
  dom.window.eval(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  return dom.window;
}

test('page: tapping a part focuses it and opens its card; tapping the board clears it', async (t) => {
  const circuit = { ...switchCircuit(), page: { results: true } };
  const window = await loadPage(renderPage(circuit, { lang: 'es' }).html);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const front = doc.querySelector('svg[data-view="front"]');
  const card = doc.querySelector('.info');
  assert.ok(card.hidden);
  front.querySelector('.parts > [data-part="Q1"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.ok(doc.body.classList.contains('focusing'));
  assert.ok(!card.hidden);
  assert.equal(card.querySelector('h2').textContent, 'Q1 · 2N2222A');
  assert.match(card.textContent, /Transistor NPN/);
  assert.match(card.textContent, /B → c17, columna 17 \(filas a–e\) — con R1 \(2\)/);
  assert.match(card.textContent, /saturado/, 'simulated values are in the card…');
  assert.ok(doc.body.classList.contains('show-results'), '…and shown: the simulation is always on');
  // What this kind of part is: behind its name, opened by the learner.
  const kind = card.querySelector('.term');
  assert.equal(kind.textContent, 'Transistor bipolar');
  assert.ok(kind.nextElementSibling.hidden, 'the generic description waits to be asked for');
  kind.click();
  assert.match(kind.nextElementSibling.textContent, /^Transistor bipolar NPN: una corriente pequeña/);
  assert.ok(!kind.nextElementSibling.hidden);
  // What it does here: written in the circuit, shown directly.
  assert.match(card.querySelector('.here').textContent, /^En este circuito: Transistor NPN/);
  const copies = front.querySelectorAll('.spotlight > [data-part="Q1"]');
  assert.ok(copies.length > 5, 'the transistor is cloned above the veil');
  assert.ok(!front.querySelector('.spotlight > [data-part="R1"]'));
  assert.match(doc.getElementById('dynamic').textContent, /\.strips > \[data-node="17:a-e"\]/);
  assert.match(doc.getElementById('dynamic').textContent, /\.coords > \[data-col="17"\]/, 'its column numbers are highlighted');
  assert.match(doc.getElementById('dynamic').textContent, /\.coords > \[data-row="c"\]/, 'and its row letter');
  assert.doesNotMatch(doc.getElementById('dynamic').textContent, /data-col="24"/, 'not those of other parts');

  // Results: the tags exist, but only the focused part's currents and its groups' voltages
  // get a rule that shows them.
  assert.ok(front.querySelector('.results > [data-part="R2"]'), 'every part has its current tag in the file');
  const rules = doc.getElementById('dynamic').textContent;
  assert.match(rules, /\.results > \[data-part="Q1"\]/);
  assert.match(rules, /\.results > \[data-node="18:a-e"\]/);
  assert.doesNotMatch(rules, /data-part="R2"/);
  const ghost = [...card.querySelectorAll('button')].find((b) => b.textContent === 'Ver a través');
  ghost.click();
  assert.match(doc.getElementById('dynamic').textContent, /\.parts > \[data-part="Q1"\], \.spotlight > \[data-part="Q1"\] \{ opacity: 0\.2; \}/);

  front.querySelector('.board').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.ok(card.hidden);
  assert.ok(!doc.body.classList.contains('focusing'));
  assert.equal(front.querySelector('.spotlight').children.length, 0);
});

test('page: the current layer and its speed scale, only when the circuit asks', async (t) => {
  const plain = renderPage(switchCircuit(), { lang: 'es' }).html;
  assert.doesNotMatch(plain, /data-on="flow"|class="flow"/);
  const html = renderPage({ ...switchCircuit(), page: { flow: true, focus: ['D1'] } }, { lang: 'es' }).html;
  assert.match(html, /class="flow"/);
  const window = await loadPage(html);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  // The bar's buttons: Current is one button for two states, the speeds are choices in the menu.
  const button = (key, value) => [...doc.querySelectorAll('nav button')].find((b) => b.dataset.key === key && [b.dataset.value, b.dataset.on, b.dataset.off].includes(value));
  const click = (key, value) => button(key, value).click();
  assert.ok(doc.body.classList.contains('focusing'), 'focus given by the circuit');
  assert.equal(doc.querySelector('.info h2').textContent, 'D1 · verde');
  click('layer', 'flow');
  assert.ok(doc.body.classList.contains('layer-flow'));
  assert.equal(button('layer', 'flow').getAttribute('aria-pressed'), 'true');
  // The tapped part's label is copied above the current layer, never under its dots.
  const front = doc.querySelector('svg[data-view="front"]');
  const order = [...front.children].map((g) => g.getAttribute('class'));
  assert.ok(order.indexOf('spotlabels') > order.indexOf('flow'), order.join(' '));
  assert.ok(order.indexOf('spotlight') < order.indexOf('flow'));
  assert.ok(front.querySelector('.spotlabels > [data-part="D1"]'), 'D1 label copied');
  assert.equal(front.querySelector('.spotlight [data-part="D1"] text'), null);
  assert.equal([...doc.querySelectorAll('nav button')].filter((b) => b.dataset.key === 'direction').length, 0, 'conventional current only');
  click('speed', 'log');
  assert.ok(doc.body.classList.contains('speed-log'));
  assert.equal(button('speed', 'log').getAttribute('aria-checked'), 'true');
  click('speed', 'linear');
  assert.ok(!doc.body.classList.contains('speed-log'));
  click('layer', 'parts');
  assert.ok(!doc.body.classList.contains('layer-flow'), 'pressed again: back to the parts');
  assert.equal(button('layer', 'flow').getAttribute('aria-pressed'), 'false');
});

test('static focus with results keeps only the focused part\'s tags', () => {
  const all = layer(renderCircuit(switchCircuit(), { sim: true }).svg, 'results');
  const focused = layer(renderCircuit(switchCircuit(), { sim: true, focus: ['D1'] }).svg, 'results');
  const count = (svg) => (svg.match(/<text /g) ?? []).length;
  assert.ok(count(focused) < count(all));
  assert.match(focused, /class="badge"/);
  assert.match(focused, /data-node="24:f-j"/);
  assert.doesNotMatch(focused, /data-node="17:a-e"/);
});

test('page: no native tooltip; values explain themselves when tapped or hovered', async (t) => {
  const circuit = { ...switchCircuit(), title: { es: 'Transistor como interruptor' }, page: { results: true } };
  const html = renderPage(circuit, { lang: 'es' }).html;
  assert.match(renderCircuit(circuit, { lang: 'es' }).svg, /<title>Transistor como interruptor<\/title>/, 'static SVG files keep their title');
  assert.doesNotMatch(html.slice(html.indexOf('<main>')), /<title>/, 'no <title> in the drawing');
  assert.match(html, /<svg [^>]*aria-label="Transistor como interruptor"/);
  const window = await loadPage(html);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const front = doc.querySelector('svg[data-view="front"]');
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const card = doc.querySelector('.info');

  // The value line of a part: tap it to read what capacitance, resistance… means.
  click(front.querySelector('.parts > [data-part="R2"]'));
  const value = [...card.querySelectorAll('.term')].find((b) => b.textContent.startsWith('Resistencia:'));
  assert.equal(value.textContent, 'Resistencia: 330 Ω');
  const explain = value.nextElementSibling;
  assert.ok(explain.hidden);
  value.click();
  assert.ok(!explain.hidden);
  assert.match(explain.textContent, /ohmios/);

  // A result tag on the board behaves like hovering it: the card and the focus stay.
  click(front.querySelector('.results > text[data-part="Q1"]'));
  assert.equal(card.querySelector('h2').textContent, 'R2 · 330 Ω', 'the card does not change');
  assert.ok(doc.body.classList.contains('focusing'), 'still dimmed');
  click(front.querySelector('.results > text[data-node="24:f-j"]'));
  assert.ok(doc.body.classList.contains('focusing'), 'a voltage tag does not clear the focus either');

  // Hover with a mouse: our own box, not the browser's tooltip.
  const tip = doc.querySelector('.tooltip');
  const ib = [...card.querySelectorAll('.term')][0];
  ib.dispatchEvent(new window.MouseEvent('pointerover', { bubbles: true }));
  assert.ok(!tip.hidden || ib.getAttribute('aria-expanded') === 'true');
});

test('page: a result tag shows where its value comes from (probes, arrows and a line)', async (t) => {
  const circuit = { ...switchCircuit(), page: { results: true } };
  const html = renderPage(circuit, { lang: 'es' }).html;
  const front = html.slice(html.indexOf('<svg data-view="front"'), html.indexOf('<svg hidden'));
  const probes = layer(front, 'probes');
  assert.match(probes, /data-probe="node:17:a-e"/, 'probes for the base voltage');
  assert.equal((probes.match(/<polygon [^>]*data-probe="part:Q1"/g) ?? []).length, 2, 'two arrow heads for Ic: in at C, out at E');
  const window = await loadPage(html);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const svg = doc.querySelector('svg[data-view="front"]');
  const tip = doc.querySelector('.tooltip');
  const rule = () => doc.getElementById('probe').textContent;
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  // Hover with a mouse: probes for that tag only, and the line that says what is measured.
  svg.querySelector('.results > text[data-node="17:a-e"]').dispatchEvent(new window.MouseEvent('pointerover', { bubbles: true }));
  assert.match(rule(), /\.probes > \[data-probe="node:17:a-e"\]/);
  assert.ok(!tip.hidden);
  assert.match(tip.textContent, /punta roja \(\+\) en esa tira, punta negra \(−\) en GND, T-3/);

  // A tap pins it (touch screens have no hover); focus, dimming and card stay as they were.
  click(svg.querySelector('.parts > [data-part="Q1"]'));
  click(svg.querySelector('.results > text[data-part="Q1"]'));
  assert.match(rule(), /data-probe="part:Q1"/);
  assert.match(tip.textContent, /Ic = 8,82 mA: entra por el colector \(C\) y sale por el emisor \(E\)/);
  assert.equal(doc.querySelector('.info h2').textContent, 'Q1 · 2N2222A');
  assert.ok(doc.body.classList.contains('focusing'));
  click(svg.querySelector('.results > text[data-node="17:a-e"]'));
  assert.match(rule(), /data-probe="node:17:a-e"/);
  assert.ok(doc.body.classList.contains('focusing'), 'still dimmed');
  click(svg.querySelector('.results > text[data-node="17:a-e"]'));
  assert.equal(rule(), '', 'the same tag again hides it');
  click(svg.querySelector('.results > text[data-part="R2"]'));
  assert.match(tip.textContent, /8,82 mA atraviesan R2, de la pata 1 a la pata 2/);
  assert.equal(doc.querySelector('.info h2').textContent, 'Q1 · 2N2222A');

  // A tap on the board clears it.
  click(svg.querySelector('.board'));
  assert.equal(rule(), '');
  assert.ok(tip.hidden);
});

test('page: no circuit description, nothing about its use (the learner finds it out)', async (t) => {
  const circuit = switchCircuit();
  delete circuit.parts[3].description;
  const window = await loadPage(renderPage(circuit, { lang: 'es' }).html);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  doc.querySelector('.parts > [data-part="Q1"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const card = doc.querySelector('.info');
  assert.equal(card.querySelector('.here'), null);
  assert.doesNotMatch(card.textContent, /En este circuito/);
  assert.ok(card.querySelector('.term').nextElementSibling.hidden, 'and the generic text still waits behind the name');
});

test('page: a battery beside the board can be tapped, focused and explained like any part', async (t) => {
  const circuit = {
    page: { results: true },
    parts: [
      { id: 'BT1', type: 'battery', format: 'AA', cells: 4, side: 'left', pins: { '+': 'T+3', '-': 'T-3' } },
      { id: 'R1', type: 'resistor', value: '220', pins: ['T+9', 'j12'] },
      { id: 'D1', type: 'led', color: 'red', pins: ['h12', 'h13'] },
      { id: 'W1', type: 'wire', color: 'black', pins: ['j13', 'T-15'] },
    ],
  };
  const window = await loadPage(renderPage(circuit, { lang: 'es' }).html);
  if (!window) return t.skip('jsdom not installed');
  const doc = window.document;
  const front = doc.querySelector('svg[data-view="front"]');
  // From the front, the battery on the left is behind the board: it lives in the `under` layer.
  const piece = front.querySelector('.under > [data-part="BT1"]');
  assert.ok(piece, 'drawn before the board');
  piece.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.ok(front.querySelectorAll('.spotlight > [data-part="BT1"]').length > 20, 'brought to the front when focused');
  const card = doc.querySelector('.info').textContent;
  assert.match(card, /Batería/);
  assert.match(card, /6 V \(4×AA\)/);
  assert.match(card, /Fuerza electromotriz/, 'its simulated values');
  assert.match(card, /Autonomía estimada/);
});
