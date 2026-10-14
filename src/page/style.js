// CSS of the embeddable page (see ../page.js). Plain text inlined into the HTML.
//
// Visibility is driven by classes on <body> and by two <style> elements the script rewrites:
//   body.no-labels       labels hidden                 body.focusing    veil shown (a part is tapped)
//   body.show-results    simulation on (page.results)  body.layer-flow  current layer
//   body.conventional    dots reversed (conventional current)
//   #dynamic             strips and result tags of the focused part; see-through rules
//   #probe               the probes/arrows of the result tag hovered or tapped
// Layers in each SVG: (under), board, parts, labels, (annotations), veil, strips, spotlight (made by the
// script), flow, results, probes. Hidden by default: veil, flow, strips, results and probes.

export const STYLE = `
html, body { margin: 0; height: 100%; background: #ffffff; color: #333333; font-family: Helvetica, Arial, Lato, sans-serif; }
body { display: flex; flex-direction: column; }
nav { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 8px; font-size: 13px; }
nav[hidden] { display: none; }
nav .group { display: flex; gap: 4px; margin-right: 8px; }
nav button { font: inherit; color: #333333; background: #f6f5f2; border: 1px solid #c9c7c2; border-radius: 6px; padding: 4px 10px; cursor: pointer; }
nav button[aria-pressed="true"] { color: #ffffff; background: #444444; border-color: #444444; }
nav .hint { color: #8a8884; font-size: 12px; }
nav .hint-results, body.show-results nav .hint-default { display: none; }
body.show-results nav .hint-results { display: inline; color: #1f5fbf; }
nav .revision { margin-left: auto; color: #8a8884; font-size: 12px; }
main { flex: 1; min-height: 0; display: flex; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none; cursor: grab; }
main.dragging { cursor: grabbing; }
main svg { display: block; width: 100%; height: 100%; }
main svg[hidden] { display: none; }
body.no-labels .labels { display: none; }
body:not(.show-results) .results, body:not(.show-results) .info .sim { display: none; }
.veil, .strips, .flow, .results { pointer-events: none; }
.results > [data-q] { pointer-events: auto; cursor: help; }
.probes { pointer-events: none; }
.probes > * { display: none; }
.veil, .flow, .strips > *, .results > * { display: none; }
body.focusing .results > .badge { display: inline; }
body.focusing .veil, body.layer-flow .veil, body.layer-flow .flow, body.layer-flow .strips > * { display: inline; }
[data-part] { cursor: pointer; }
.electrons { animation: electrons linear infinite; }
body.conventional .electrons { animation-direction: reverse; }
@keyframes electrons { to { stroke-dashoffset: -9; } }
@media (prefers-reduced-motion: reduce) { .electrons { animation: none; } }
main { position: relative; }
.info { position: absolute; left: 8px; bottom: 8px; max-width: min(340px, calc(100% - 16px)); max-height: 55%; overflow: auto; background: #ffffff; border: 1px solid #c9c7c2; border-radius: 8px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12); padding: 10px 12px; font-size: 13px; line-height: 1.4; cursor: auto; user-select: text; -webkit-user-select: text; touch-action: auto; }
.info[hidden] { display: none; }
.info h2 { font-size: 15px; margin: 0 0 2px; }
.info h3 { font-size: 12px; margin: 8px 0 2px; color: #6b6a66; text-transform: uppercase; letter-spacing: 0.04em; }
.info p { margin: 2px 0; }
.info .type { color: #6b6a66; }
.info .here { margin-top: 6px; }
.info ul { margin: 0; padding-left: 16px; }
.info .actions { display: flex; gap: 6px; margin-top: 8px; }
.info button { font: inherit; color: #333333; background: #f6f5f2; border: 1px solid #c9c7c2; border-radius: 6px; padding: 3px 9px; cursor: pointer; }
.info button[aria-pressed="true"] { color: #ffffff; background: #444444; border-color: #444444; }
.info ul.terms { list-style: none; padding-left: 0; }
.info .term { display: block; width: 100%; text-align: left; background: none; border: none; border-radius: 4px; padding: 2px 4px; margin: 0; cursor: help; }
.info .term::after { content: " ⓘ"; color: #9a9893; }
.info .term:hover, .info .term[aria-expanded="true"] { background: #eef3fb; }
.info .explain { margin: 2px 4px 6px; padding: 6px 8px; background: #f4f7fc; border-left: 3px solid #1f5fbf; border-radius: 4px; color: #2b3a4a; }
.info .explain[hidden] { display: none; }
.info .tip { color: #8a8884; font-size: 12px; }
.tooltip { position: absolute; z-index: 2; max-width: 260px; padding: 6px 8px; background: #2b3a4a; color: #ffffff; border-radius: 6px; font-size: 12px; line-height: 1.35; pointer-events: none; }
.tooltip[hidden] { display: none; }`;
