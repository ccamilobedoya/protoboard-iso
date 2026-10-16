import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderPage } from '../src/page.js';
import { createTarget, applyToTarget, pageFileOf, resolveTarget } from '../src/node/workspace.js';

const example = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));
// The views' SVGs (the zoom buttons carry small svg icons too).
const svgTags = (html) => [...html.matchAll(/<svg [^>]*data-view[^>]*>/g)].map((m) => m[0]);

test('the page holds both views, scales with its frame and starts close-up', () => {
  const { html } = renderPage(example('controls-and-ics.json'), { lang: 'es' });
  const tags = svgTags(html);
  assert.equal(tags.length, 2);
  assert.match(tags[0], /data-view="front"/);
  assert.match(tags[1], /^<svg hidden data-view="back"/);
  for (const tag of tags) {
    assert.doesNotMatch(tag, / width="/, 'the size comes from CSS');
    const [, parts] = tag.match(/data-parts="([^"]+)"/);
    assert.match(tag, new RegExp(`viewBox="${parts}"`));
    assert.match(tag, /data-board="[-\d. ]+"/);
  }
  assert.match(html, /<html lang="es">/);
  assert.match(html, />Girar</);
  assert.match(html, />Toda la protoboard</);
  assert.match(html, /<nav hidden>/, 'controls appear only when the script runs');
  assert.doesNotMatch(html, /<script src|<link |https?:\/\/(?!www\.w3\.org)/, 'no network');
});

test('the page follows the circuit view and the fit option', () => {
  const circuit = { ...example('controls-and-ics.json'), view: 'front-left' };
  const { html } = renderPage(circuit, { fit: 'board' });
  const tags = svgTags(html);
  assert.deepEqual(tags.map((t) => t.match(/data-view="([^"]+)"/)[1]), ['front-left', 'back-right']);
  const [, board] = tags[0].match(/data-board="([^"]+)"/);
  assert.match(tags[0], new RegExp(`viewBox="${board}"`));
  assert.equal(renderPage({ board: 'nope', parts: [] }).html, null);
});

test('every saved change rewrites the page under the same name', () => {
  const target = join(mkdtempSync(join(tmpdir(), 'pbi-page-')), 'led');
  const created = createTarget(target, { title: 'LED', parts: [{ id: 'R1', type: 'resistor', value: '330', pins: ['j10', 'j14'] }] });
  const page = pageFileOf(resolveTarget(target));
  assert.equal(created.files.pageFile, page);
  assert.match(readFileSync(page, 'utf8'), /<meta name="revision" content="0">/);
  applyToTarget(target, [{ op: 'move', part: 'R1', pins: ['i10', 'i14'] }], { author: 'test' });
  assert.ok(existsSync(page));
  assert.match(readFileSync(page, 'utf8'), /<meta name="revision" content="1">/);
});

// The page script in a DOM that follows the spec (jsdom, dev only): SVG elements have no
// `hidden` property, so a script that sets it would silently do nothing.
// With `embedded`, the page is loaded inside an iframe of another page, as in a lesson note.
async function loadPage(html, { embedded = false, url } = {}) {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    return null;
  }
  let window;
  if (embedded) {
    const host = new JSDOM('<iframe></iframe>', { runScripts: 'outside-only' });
    window = host.window.document.querySelector('iframe').contentWindow;
    window.document.open();
    window.document.write(html.replace(/<script>[\s\S]*<\/script>/, ''));
    window.document.close();
  } else window = new JSDOM(html, { runScripts: 'outside-only', ...(url && { url }) }).window;
  for (const svg of window.document.querySelectorAll('svg')) {
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 500 });
  }
  window.eval(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  const doc = window.document;
  const fire = (type, props, target = doc.querySelector('main')) => {
    const e = new window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, props);
    target.dispatchEvent(e);
    return e;
  };
  const pointer = (type, id, x, y, pointerType = 'mouse') => fire(type, { pointerId: id, clientX: x, clientY: y, pointerType });
  const touch = (type, points) => fire(type, { touches: points.map(([clientX, clientY]) => ({ clientX, clientY })) });
  return { window, doc, fire, pointer, touch, svg: (view) => doc.querySelector(`svg[data-view="${view}"]`) };
}

test('page buttons switch views, frames and labels in a real DOM', async (t) => {
  const page = await loadPage(renderPage(example('controls-and-ics.json'), { lang: 'es' }).html);
  if (!page) return t.skip('jsdom not installed');
  const { doc, svg } = page;
  const button = (key) => doc.querySelector(`nav button[data-key="${key}"]`);
  assert.equal(doc.querySelector('nav').hasAttribute('hidden'), false);
  assert.ok(!svg('front').hasAttribute('hidden') && svg('back').hasAttribute('hidden'));
  button('view').click();
  assert.ok(svg('front').hasAttribute('hidden') && !svg('back').hasAttribute('hidden'), 'Flip: back view shown');
  assert.equal(button('view').getAttribute('aria-pressed'), 'true');
  assert.equal(svg('back').getAttribute('viewBox'), svg('back').dataset.parts);
  button('fit').click();
  assert.equal(svg('back').getAttribute('viewBox'), svg('back').dataset.board, 'whole board');
  button('fit').click();
  assert.equal(svg('back').getAttribute('viewBox'), svg('back').dataset.parts, 'pressed again: close-up');
  button('labels').click();
  assert.ok(doc.body.classList.contains('no-labels'));
  assert.equal(button('labels').getAttribute('aria-pressed'), 'false');
  button('view').click();
  assert.ok(!svg('front').hasAttribute('hidden') && svg('back').hasAttribute('hidden'), 'Flip again: front');
});

test('dragging pans, pinching zooms, and the frame stays on the board', async (t) => {
  const page = await loadPage(renderPage(example('controls-and-ics.json')).html);
  if (!page) return t.skip('jsdom not installed');
  const { pointer, svg } = page;
  const box = () => svg('front').getAttribute('viewBox').split(' ').map(Number);
  const start = box();
  pointer('pointerdown', 1, 400, 250);
  pointer('pointermove', 1, 300, 250);
  pointer('pointerup', 1, 300, 250);
  const moved = box();
  assert.ok(moved[0] > start[0], 'dragging left shows what is on the right');
  assert.equal(moved[2], start[2], 'a drag does not zoom');

  pointer('pointerdown', 1, 300, 250);
  pointer('pointerdown', 2, 500, 250);
  pointer('pointermove', 2, 700, 250);
  pointer('pointerup', 1, 300, 250);
  pointer('pointerup', 2, 700, 250);
  assert.ok(box()[2] < moved[2] * 0.6, 'spreading two fingers zooms in');

  pointer('pointerdown', 1, 0, 0);
  pointer('pointermove', 1, 100000, 100000);
  const [x, y, w, h] = box();
  const [bx, by, bw, bh] = svg('front').dataset.board.split(' ').map(Number);
  assert.ok(x + w / 2 >= bx && y + h / 2 >= by && x + w / 2 <= bx + bw && y + h / 2 <= by + bh, 'centre stays on the board');
});

test('language: the one asked for, else the circuit\'s own "lang", else the default', () => {
  const target = join(mkdtempSync(join(tmpdir(), 'pbi-lang-')), 'led');
  const parts = [{ id: 'R1', type: 'resistor', value: '330', pins: ['j10', 'j14'] }];
  createTarget(target, { lang: 'es', parts }, { lang: 'en' });
  const page = () => readFileSync(pageFileOf(resolveTarget(target)), 'utf8');
  assert.match(page(), /<html lang="es">/, 'the circuit says es: the page is in Spanish even for an English caller');
  applyToTarget(target, [{ op: 'move', part: 'R1', pins: ['i10', 'i14'] }], { lang: 'en' });
  assert.match(page(), /<html lang="es">/);
  applyToTarget(target, [{ op: 'move', part: 'R1', pins: ['h10', 'h14'] }], { lang: 'en', outputLang: 'en' });
  assert.match(page(), /<html lang="en">/, 'asked for explicitly: English');
  applyToTarget(target, [{ op: 'circuit', lang: 'en' }], { lang: 'es' });
  assert.match(page(), /<html lang="en">/, 'changing "lang" changes the page');
});

test('a plain-string description is shown as it is, in any language', () => {
  const circuit = { parts: [{ id: 'R1', type: 'resistor', value: '330', pins: ['j10', 'j14'], description: 'Limita la corriente del LED.' }] };
  for (const lang of ['en', 'es']) assert.match(renderPage(circuit, { lang }).html, /Limita la corriente del LED\./);
  const both = { parts: [{ ...circuit.parts[0], description: { en: 'Limits the LED current.', es: 'Limita la corriente del LED.' } }] };
  assert.match(renderPage(both, { lang: 'en' }).html, /Limits the LED current\./);
  assert.doesNotMatch(renderPage(both, { lang: 'en' }).html, /Limita/);
});

test('the bar is one row grouped by job; on a narrow screen its labels give way to icons', () => {
  const { html } = renderPage(example('half-wave-rectifier.json'), { lang: 'es' });
  const nav = html.match(/<nav hidden>([\s\S]*?)<\/nav>/)[1];
  assert.deepEqual([...nav.matchAll(/class="group ([a-z]+)"/g)].map((m) => m[1]), ['view', 'layers']);
  assert.match(nav, /class="menu" role="menu" hidden/);
  assert.match(nav, /role="menuitemradio" data-key="speed" data-value="log"/, 'the dot speed is in the menu');
  assert.doesNotMatch(nav, /class="hint/, 'the hint is not in the bar any more');
  const narrow = html.match(/@media \(max-width: 760px\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(narrow, /nav \.label \{ display: none; \}/);
  assert.doesNotMatch(html.match(/<style>([\s\S]*?)<\/style>/)[1], /nav \{[^}]*overflow-x: auto/, 'no sideways scrolling');
});

test('the ⋯ menu opens, closes on Escape, outside or a choice; the first-time hint goes at the first touch', async (t) => {
  const html = renderPage(example('half-wave-rectifier.json'), { lang: 'es' }).html;
  const page = await loadPage(html, { url: 'https://example.org/rect.html' });
  if (!page) return t.skip('jsdom not installed');
  const { doc, window, fire } = page;
  const more = doc.querySelector('nav .more-button');
  const menu = doc.querySelector('nav .menu');
  const hint = doc.querySelector('.first-hint');
  assert.equal(hint.hidden, false, 'first time: the hint shows');
  assert.match(hint.textContent, /Toca un componente/);
  fire('pointerdown', { pointerId: 1, clientX: 10, clientY: 10, pointerType: 'mouse' });
  assert.equal(hint.hidden, true, 'gone at the first touch');

  more.click();
  assert.equal(menu.hidden, false);
  assert.equal(more.getAttribute('aria-expanded'), 'true');
  fire('keydown', { key: 'Escape' }, menu);
  assert.equal(menu.hidden, true, 'Escape closes');
  more.click();
  fire('pointerdown', { pointerId: 2, clientX: 10, clientY: 10, pointerType: 'mouse' }, doc.querySelector('main'));
  assert.equal(menu.hidden, true, 'a tap outside closes');
  more.click();
  menu.querySelector('[data-value="log"]').click();
  await new Promise((r) => window.setTimeout(r, 5));
  assert.ok(doc.body.classList.contains('speed-log'));
  assert.equal(menu.hidden, true, 'a choice closes');
  more.click();
  menu.querySelector('.again').click();
  assert.equal(hint.hidden, false, '"What can I tap?" shows the hint again');

});

test('embedded in a note: one finger and the plain wheel go to the note, two fingers and Ctrl + wheel move the drawing', async (t) => {
  const page = await loadPage(renderPage(example('controls-and-ics.json'), { lang: 'es' }).html, { embedded: true });
  if (!page) return t.skip('jsdom not installed');
  const { doc, fire, touch, svg } = page;
  const box = () => svg('front').getAttribute('viewBox');
  assert.ok(doc.body.classList.contains('embedded'));
  const start = box();

  const plain = fire('wheel', { deltaY: -100, clientX: 400, clientY: 250 });
  assert.equal(plain.defaultPrevented, false, 'the note scrolls');
  assert.equal(box(), start);
  assert.ok(doc.querySelector('.gesture-hint').classList.contains('on'));
  assert.match(doc.querySelector('.gesture-hint').textContent, /Ctrl/);

  const ctrl = fire('wheel', { deltaY: -100, ctrlKey: true, clientX: 400, clientY: 250 });
  assert.equal(ctrl.defaultPrevented, true);
  assert.notEqual(box(), start, 'Ctrl + wheel (or a trackpad pinch) zooms');

  const zoomed = box();
  touch('touchstart', [[400, 250]]);
  const one = touch('touchmove', [[400, 100]]);
  assert.equal(one.defaultPrevented, false, 'one finger scrolls the note');
  assert.equal(box(), zoomed);
  assert.match(doc.querySelector('.gesture-hint').textContent, /dos dedos/);
  touch('touchend', []);

  touch('touchstart', [[300, 250], [500, 250]]);
  const two = touch('touchmove', [[200, 250], [600, 250]]);
  assert.equal(two.defaultPrevented, true);
  const [, , w] = box().split(' ').map(Number);
  assert.ok(w < Number(zoomed.split(' ')[2]), 'spreading two fingers zooms in');
  touch('touchend', []);

  assert.equal(doc.querySelector('[data-zoom="full"]').hidden, false, 'full screen is offered when embedded');
});

test('alone, the wheel zooms; the zoom buttons zoom in, out and back to the frame', async (t) => {
  const page = await loadPage(renderPage(example('controls-and-ics.json')).html);
  if (!page) return t.skip('jsdom not installed');
  const { doc, fire, svg } = page;
  const width = () => Number(svg('front').getAttribute('viewBox').split(' ')[2]);
  assert.ok(!doc.body.classList.contains('embedded'));
  assert.equal(doc.querySelector('[data-zoom="full"]').hidden, true);
  const start = width();
  assert.equal(fire('wheel', { deltaY: -100, clientX: 400, clientY: 250 }).defaultPrevented, true);
  assert.ok(width() < start);
  doc.querySelector('[data-zoom="fit"]').click();
  assert.equal(svg('front').getAttribute('viewBox'), svg('front').dataset.parts);
  doc.querySelector('[data-zoom="in"]').click();
  assert.ok(width() < start);
  doc.querySelector('[data-zoom="out"]').click();
  doc.querySelector('[data-zoom="out"]').click();
  assert.ok(width() > start);
  assert.equal(doc.querySelector('.info').hidden, true, 'the buttons are not taps on the board');
});

test('double-click on a part frames that part', async (t) => {
  const page = await loadPage(renderPage(example('led-resistor.json')).html);
  if (!page) return t.skip('jsdom not installed');
  const { fire, svg } = page;
  const view = () => svg('front').getAttribute('viewBox').split(' ').map(Number);
  const els = svg('front').querySelectorAll('.parts [data-part="R1"]');
  for (const el of els) el.getBoundingClientRect = () => ({ left: 380, top: 240, right: 420, bottom: 260, width: 40, height: 20 });
  const [, , before] = view();
  fire('dblclick', { clientX: 400, clientY: 250 }, els[0]);
  const [x, y, w, h] = view();
  assert.ok(w < before / 3, 'zoomed in to about two and a half times the part');
  const [bx, by, bw, bh] = svg('front').dataset.parts.split(' ').map(Number);
  assert.ok(Math.abs(x + w / 2 - (bx + bw / 2)) < 1 && Math.abs(y + h / 2 - (by + bh / 2)) < 1, 'centred on the part (here, the middle of the frame)');
});

test('colours are tokens, light and dark; the circuit can fix the theme and the link wins', async (t) => {
  const { STYLE } = await import('../src/page/style.js');
  const outside = STYLE.replace(/:root[^{]*\{[^}]*\}/g, '').replace(/@media \(prefers-color-scheme: dark\) \{\s*\}/g, '');
  assert.deepEqual(outside.match(/#[0-9a-f]{3,8}\b/gi) ?? [], [], 'no colour outside the token blocks');
  assert.match(STYLE, /@media \(prefers-color-scheme: dark\) \{ :root:not\(\[data-theme="light"\]\) \{/);
  assert.match(STYLE, /:root\[data-theme="dark"\] \{/);

  const circuit = example('led-resistor.json');
  assert.match(renderPage(circuit).html, /<html lang="en">/, 'auto by default: no data-theme');
  const dark = renderPage({ ...circuit, page: { ...circuit.page, theme: 'dark' } }).html;
  assert.match(dark, /<html lang="en" data-theme="dark">/);

  const page = await loadPage(dark, { url: 'https://example.org/led.html?theme=light' });
  if (!page) return t.skip('jsdom not installed');
  assert.equal(page.doc.documentElement.dataset.theme, 'light', '?theme= wins over page.theme');
  const auto = await loadPage(dark, { url: 'https://example.org/led.html?theme=auto' });
  assert.equal(auto.doc.documentElement.dataset.theme, undefined, '?theme=auto follows the system');
});

test('the inspector holds the card and the circuit\'s panels: tabs, a fixed head, folded pins', async (t) => {
  // A static page: nothing for the whole circuit, so the inspector shows only with a tapped part.
  const plain = await loadPage(renderPage(example('led-resistor.json'), { lang: 'es' }).html);
  if (!plain) return t.skip('jsdom not installed');
  const box = plain.doc.querySelector('.inspector');
  assert.ok(box.contains(plain.doc.querySelector('.info')) && box.contains(plain.doc.querySelector('.side')));
  const part = plain.svg('front').querySelector('.parts [data-part="R1"]');
  part.dispatchEvent(new plain.window.MouseEvent('click', { bubbles: true }));
  assert.equal(box.hidden, false);
  assert.equal(box.dataset.tab, 'part');
  const head = plain.doc.querySelector('.info .head');
  assert.match(head.querySelector('h2').textContent, /^R1/);
  assert.deepEqual([...head.querySelectorAll('.actions button')].map((b) => b.title), ['Ver a través', 'Cerrar'], 'see-through and close, as icons, in the head');
  assert.ok(plain.doc.querySelector('.info details.pins ul > li'), 'pins folded');
  assert.match(plain.doc.querySelector('.info .summary').textContent, /^MODELO/, 'the summary starts with the MODEL chip');
  assert.equal(plain.doc.querySelectorAll('.info .summary .values > .slot').length, 3, 'one slot per value, so a change never pushes the others');
  head.querySelector('.actions button:last-child').click();
  assert.equal(plain.doc.querySelector('.info').hidden, true);
  assert.equal(box.hidden, true, 'nothing left to show');

  // A live page with a controls panel: the Circuit tab, and back to it when the card closes.
  const live = await loadPage(renderPage(example('half-wave-rectifier.json'), { lang: 'es' }).html);
  const lbox = live.doc.querySelector('.inspector');
  await new Promise((r) => live.window.setTimeout(r, 0)); // the panels arrive after the page starts
  assert.equal(lbox.hidden, false);
  assert.equal(lbox.dataset.tab, 'circuit');
  assert.ok(live.doc.querySelector('.side .controls .control'));
  live.svg('front').querySelector('.parts [data-part="D1"]').dispatchEvent(new live.window.MouseEvent('click', { bubbles: true }));
  assert.equal(lbox.dataset.tab, 'part');
  const tabs = [...lbox.querySelectorAll('[role="tab"]')];
  assert.deepEqual(tabs.map((b) => [b.textContent, b.hidden, b.getAttribute('aria-selected')]), [['Componente', false, 'true'], ['Circuito', false, 'false']]);
  tabs[1].click();
  assert.equal(lbox.dataset.tab, 'circuit');
  tabs[0].click();
  live.doc.querySelector('.info .head .actions button:last-child').click();
  assert.equal(lbox.dataset.tab, 'circuit', 'closing the card goes back to the circuit');
  assert.ok(live.doc.querySelector('.model-badge'), 'the MODEL badge in the frame');
  assert.match(renderPage(example('half-wave-rectifier.json')).html, /\.results \.badge \{ display: none !important; \}/, "the drawing's stamp gives way to it");
});

test('the frame stays where the learner was: labels and layers keep it, a flip keeps the zoom', async (t) => {
  const page = await loadPage(renderPage(example('controls-and-ics.json'), { lang: 'es' }).html);
  if (!page) return t.skip('jsdom not installed');
  const { doc, fire, svg } = page;
  const view = (v) => svg(v).getAttribute('viewBox').split(' ').map(Number);
  fire('wheel', { deltaY: -300, clientX: 300, clientY: 200 });
  const zoomed = view('front');
  doc.querySelector('nav button[data-key="labels"]').click();
  assert.deepEqual(view('front'), zoomed, 'toggling the labels does not reset the frame');
  doc.querySelector('nav button[data-key="view"]').click();
  assert.ok(!svg('back').hasAttribute('hidden') && svg('front').hasAttribute('hidden'));
  const share = (v, box) => box[2] / Number(svg(v).dataset.board.split(' ')[2]);
  assert.ok(Math.abs(share('back', view('back')) - share('front', zoomed)) < 1e-3, 'the same share of the board after the flip');
  assert.ok(!doc.querySelector('main').classList.contains('flipping'), 'without motion the flip ends at once');
  doc.querySelector('nav button[data-key="view"]').click();
  assert.ok(Math.abs(view('front')[2] - zoomed[2]) < 0.5, 'and back again');
});
