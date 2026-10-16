// CSS of the embeddable page (see ../page.js). Plain text inlined into the HTML.
//
// Visibility is driven by classes on <body> and by two <style> elements the script rewrites:
//   body.no-labels       labels hidden                 body.focusing    veil shown (a part is tapped)
//   body.show-results    simulation on (page.results)  body.layer-flow  current layer
//   body.speed-log       dot speed on a log scale (each dot path carries --lin and --log)
//   #dynamic             strips, coordinates and result tags of the focused part (or the tapped
//                        strip, with its probes); see-through rules
//   #probe               the probes/arrows of the result tag hovered or tapped
//   #stress              (live page) the boxes (layer marks) of the parts near or past their limits
// .side holds the live page's panels (warnings, controls), top right; .info the card, bottom left.
// Layers in each SVG: (under), board, parts, labels, (annotations), veil, strips, coords, spotlight (made
// by the script: copies of the tapped parts), flow, spotlabels (made by the script: copies of their
// labels, above the current), results, probes; in a live page, marks (boxes around each part,
// for its limits) between flow and spotlabels. Hidden by default: veil, flow, strips, coords,
// results and probes.
// On a narrow screen the button bar is one row that scrolls sideways, to leave room for the drawing.

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
@media (max-width: 760px) {
  nav { flex-wrap: nowrap; overflow-x: auto; overscroll-behavior-x: contain; touch-action: pan-x; scrollbar-width: none; -webkit-overflow-scrolling: touch; padding: 4px 6px; }
  nav::-webkit-scrollbar { display: none; }
  nav > * { flex: none; white-space: nowrap; }
  nav button { padding: 4px 8px; }
}
main { flex: 1; min-height: 0; display: flex; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none; cursor: grab; }
main.dragging { cursor: grabbing; }
main svg { display: block; width: 100%; height: 100%; }
main svg[hidden] { display: none; }
body.no-labels .labels, body.no-labels .spotlabels { display: none; }
body:not(.show-results) .results, body:not(.show-results) .info .sim { display: none; }
.veil, .strips, .coords, .flow, .results { pointer-events: none; }
.coords > * { display: none; }
.results > [data-q] { pointer-events: auto; cursor: help; }
.probes { pointer-events: none; }
.probes > * { display: none; }
.veil, .flow, .strips > *, .results > * { display: none; }
body.focusing .results > .badge { display: inline; }
body.focusing .veil, body.layer-flow .veil, body.layer-flow .flow { display: inline; }
[data-part] { cursor: pointer; }
.dots { animation: dots linear infinite; animation-duration: var(--lin); }
body.speed-log .dots { animation-duration: var(--log); }
@keyframes dots { to { stroke-dashoffset: -9; } }
@media (prefers-reduced-motion: reduce) { .dots { animation: none; } }
body.live .dots { animation: none; }
nav .time .clock { color: #6b6a66; font-size: 12px; font-variant-numeric: tabular-nums; min-width: 7em; }
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
.info .link { display: block; width: 100%; text-align: left; font: inherit; color: inherit; background: none; border: none; border-radius: 4px; padding: 1px 4px; margin: 0 0 0 -4px; cursor: pointer; }
.info .link::after { content: " ›"; color: #9a9893; }
.info .link:hover { background: #eef3fb; }
.info .explain { margin: 2px 4px 6px; padding: 6px 8px; background: #f4f7fc; border-left: 3px solid #1f5fbf; border-radius: 4px; color: #2b3a4a; }
.info .explain[hidden] { display: none; }
.info .tip { color: #8a8884; font-size: 12px; }
.tooltip { position: absolute; z-index: 2; max-width: 260px; padding: 6px 8px; background: #2b3a4a; color: #ffffff; border-radius: 6px; font-size: 12px; line-height: 1.35; pointer-events: none; }
.tooltip[hidden] { display: none; }

.side { position: absolute; top: 8px; right: 8px; z-index: 1; display: flex; flex-direction: column; gap: 6px; width: min(280px, calc(100% - 16px)); max-height: calc(100% - 16px); overflow: auto; pointer-events: none; cursor: auto; touch-action: auto; user-select: none; -webkit-user-select: none; }
.side .panel { pointer-events: auto; background: #ffffff; border: 1px solid #c9c7c2; border-radius: 8px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12); padding: 6px 10px 8px; font-size: 13px; }
.side .panel[hidden] { display: none; }
.side .head { display: block; width: 100%; text-align: left; font: inherit; font-size: 12px; color: #6b6a66; text-transform: uppercase; letter-spacing: 0.04em; background: none; border: none; padding: 2px 0; cursor: pointer; }
.side .head::after { content: " ▾"; }
.side .head[aria-expanded="false"]::after { content: " ▸"; }
.side .body[hidden] { display: none; }
.side .warnings { border-color: #c0392b; background: #fdf2f1; }
.side .warnings h3 { font-size: 12px; margin: 2px 0 4px; color: #a03024; text-transform: uppercase; letter-spacing: 0.04em; }
.side .warnings ul { list-style: none; margin: 0; padding: 0; }
.side .warning { display: block; width: 100%; text-align: left; font: inherit; color: #7a1f16; background: none; border: none; border-radius: 4px; padding: 3px 4px; cursor: pointer; }
.side .warning:hover { background: #f8dcd8; }
.side .falstad-notes { border-color: #d39e00; background: #fffaeb; }
.side .falstad-notes h3 { font-size: 12px; margin: 2px 0 4px; color: #8a6400; text-transform: uppercase; letter-spacing: 0.04em; }
.side .falstad-notes ul { margin: 0; padding-left: 16px; color: #5c4400; }
nav .falstad .open { color: #1f5fbf; text-decoration: none; border: 1px solid #c9c7c2; border-radius: 6px; padding: 4px 10px; background: #f6f5f2; }
nav .falstad .open::after { content: " ↗"; }
nav .falstad .flag { color: #8a6400; background: #fff3cd; border-color: #e0c060; }
nav .falstad .flag[hidden] { display: none; }
.info .scope { margin-top: 8px; }
.info .scope h3 { margin: 0 0 2px; }
.info .scope svg { display: block; width: 100%; height: auto; font-family: inherit; }
.scope-screen { fill: #0d1418; }
.scope-grid { stroke: #22333a; stroke-width: 0.6; }
.scope-zero { stroke: #557079; stroke-width: 0.8; }
.scope-trace { fill: none; stroke-width: 1.5; stroke-linejoin: round; }
.scope-label { font-size: 10px; font-weight: 600; }
.scope-scale { fill: #9fb3bb; font-size: 8px; text-anchor: end; }
.scope-time { fill: #6b6a66; font-size: 9px; }
.scope-end { text-anchor: end; }
.scope-model { text-anchor: middle; font-style: italic; }
.side .clear, .control .hold { font: inherit; color: #333333; background: #f6f5f2; border: 1px solid #c9c7c2; border-radius: 6px; padding: 3px 9px; cursor: pointer; margin-top: 4px; }
.control { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 0 8px; margin: 4px 0; }
.control .name { color: #444444; }
.control .value { font-variant-numeric: tabular-nums; color: #1f5fbf; text-align: right; }
.control input[type="range"] { grid-column: 1 / -1; width: 100%; margin: 2px 0; accent-color: #1f5fbf; touch-action: pan-y; }
.control .buttons { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
.control .hold { margin: 0; touch-action: none; }
.control .hold[aria-pressed="true"] { color: #ffffff; background: #444444; border-color: #444444; }
.info .adjust { margin-top: 4px; }
.info .stress { color: #a03024; font-weight: bold; }
/* Limits: a box around the part (layer marks), opacity in a few steps: cheap to redraw. */
.marks { pointer-events: none; }
.marks > * { display: none; }
@keyframes stress-pulse { from { opacity: 1; } to { opacity: 0.25; } }
@media (prefers-reduced-motion: reduce) { .marks > * { animation: none !important; } }`;
