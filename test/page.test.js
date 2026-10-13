import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderPage } from '../src/page.js';
import { createTarget, applyToTarget, pageFileOf, resolveTarget } from '../src/node/workspace.js';

const example = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));
const svgTags = (html) => [...html.matchAll(/<svg [^>]*>/g)].map((m) => m[0]);

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
  assert.match(html, />De cerca</);
  assert.match(html, />Desde atrás</);
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
  const created = createTarget(target, { title: 'LED', parts: [{ id: 'R1', type: 'resistor', value: '330', pins: ['a10', 'a14'] }] });
  const page = pageFileOf(resolveTarget(target));
  assert.equal(created.files.pageFile, page);
  assert.match(readFileSync(page, 'utf8'), /<meta name="revision" content="0">/);
  applyToTarget(target, [{ op: 'move', part: 'R1', pins: ['b10', 'b14'] }], { author: 'test' });
  assert.ok(existsSync(page));
  assert.match(readFileSync(page, 'utf8'), /<meta name="revision" content="1">/);
});

// The page script in a DOM that follows the spec (jsdom, dev only): SVG elements have no
// `hidden` property, so a script that sets it would silently do nothing.
async function loadPage(html) {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    return null;
  }
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  const { window } = dom;
  for (const svg of window.document.querySelectorAll('svg')) {
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 500 });
  }
  window.eval(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  const doc = window.document;
  const pointer = (type, id, x, y) => {
    const e = new window.Event(type, { bubbles: true });
    Object.assign(e, { pointerId: id, clientX: x, clientY: y });
    doc.querySelector('main').dispatchEvent(e);
  };
  return { window, doc, pointer, svg: (view) => doc.querySelector(`svg[data-view="${view}"]`) };
}

test('page buttons switch views, frames and labels in a real DOM', async (t) => {
  const page = await loadPage(renderPage(example('controls-and-ics.json'), { lang: 'es' }).html);
  if (!page) return t.skip('jsdom not installed');
  const { doc, svg } = page;
  const click = (text) => [...doc.querySelectorAll('nav button')].find((b) => b.textContent === text).click();
  assert.equal(doc.querySelector('nav').hasAttribute('hidden'), false);
  assert.ok(!svg('front').hasAttribute('hidden') && svg('back').hasAttribute('hidden'));
  click('Desde atrás');
  assert.ok(svg('front').hasAttribute('hidden') && !svg('back').hasAttribute('hidden'), 'back view shown');
  assert.equal(svg('back').getAttribute('viewBox'), svg('back').dataset.parts);
  click('Toda la protoboard');
  assert.equal(svg('back').getAttribute('viewBox'), svg('back').dataset.board);
  click('Etiquetas');
  assert.ok(doc.body.classList.contains('no-labels'));
  click('De frente');
  assert.ok(!svg('front').hasAttribute('hidden') && svg('back').hasAttribute('hidden'));
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
