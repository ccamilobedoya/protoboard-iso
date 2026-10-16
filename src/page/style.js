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
// The bar is one row grouped by job; on a narrow screen its labels give way to icons (U3).
// body.embedded: the page is inside an iframe (see page/client/view.js for what gestures do then).
// .zoom: zoom in, out, fit and full screen, bottom right; .gesture-hint: "use two fingers…" over the drawing.
//
// Colours (UX pass, U2): every colour of the page is a token on :root, from
// .interface-design/system.md (bench palette). Dark follows the system unless <html data-theme>
// says light or dark (page.theme in the circuit, or ?theme= in the link; see page/client/main.js).
// In the page only, the drawing's background, veil, labels and result tags take the tokens too,
// by CSS over their presentation attributes: the static SVG keeps its own colours.
// Touch: hover only with a fine pointer, feedback on :active, 40 px targets on a coarse pointer.

export const STYLE = `
:root {
  /* Motion (U5, from the review-animations standard): enter and exit ease-out, on-screen movement
     ease-in-out, the sheet the drawer curve; UI under 300 ms; presses 120 ms. */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1); --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1); --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
  --t-press: 120ms;
  --sans: system-ui, -apple-system, "Segoe UI", Lato, Helvetica, Arial, sans-serif;
  --mono: ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace;
  color-scheme: light;
  --bench: #f3f1ea; --well: #e8e5dc; --card: #ffffff; --canvas: #fbfaf7; --press: #dedad0;
  --ink: #1a1a1a; --ink-2: #4a4a47; --ink-3: #6e6c66; --ink-4: #9a9893;
  --hair: rgba(26, 26, 26, 0.14); --hair-strong: rgba(26, 26, 26, 0.25); --hair-soft: rgba(26, 26, 26, 0.07);
  --accent: #1b6ec2; --accent-deep: #145596; --accent-soft: #e9f0f9; --on-accent: #ffffff;
  --danger: #d93829; --danger-ink: #a82a1e; --danger-soft: #fbeeec; --danger-hover: #f6dcd8;
  --warn: #c98a00; --warn-ink: #7a5600; --warn-soft: #fdf6e3; --warn-edge: #e0c060;
  --tooltip: #1a1a1a; --on-tooltip: #f3f1ea; --hint: rgba(0, 0, 0, 0.5); --on-hint: #ffffff;
  --veil: #fbfaf7; --label-edge: #52606d; --leader: #7b8794; --label-ink: #1f2933;
  --tag-v: #1b6ec2; --tag-i: #b5452a;
  --scope: #0d1418; --scope-grid: rgba(255, 255, 255, 0.09); --scope-zero: #557079; --scope-scale: #9fb3bb;
  --trace-v: #f5a623; --trace-v-ink: #8a5a00; --trace-i: #00e5ff; --trace-i-ink: #00687a;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  color-scheme: dark;
  --bench: #1e1d1b; --well: #272623; --card: #2c2b28; --canvas: #181816; --press: #3a3935;
  --ink: #eceae4; --ink-2: #c4c1b8; --ink-3: #9a978e; --ink-4: #75736c;
  --hair: rgba(255, 255, 255, 0.1); --hair-strong: rgba(255, 255, 255, 0.18); --hair-soft: rgba(255, 255, 255, 0.06);
  --accent: #6fa8e8; --accent-deep: #4a86c9; --accent-soft: #263445; --on-accent: #111111;
  --danger: #e8705f; --danger-ink: #f09a8c; --danger-soft: #3a2522; --danger-hover: #4a2c28;
  --warn: #e0b040; --warn-ink: #f0cc70; --warn-soft: #362d17; --warn-edge: #7a6020;
  --tooltip: #eceae4; --on-tooltip: #1e1d1b;
  --veil: #181816; --label-edge: #8a96a3; --leader: #8a96a3; --label-ink: #eceae4;
  --tag-v: #6fa8e8; --tag-i: #ef8a6e;
  --trace-v-ink: #f5b84a; --trace-i-ink: #5fe3f5;
} }
:root[data-theme="dark"] {
  color-scheme: dark;
  --bench: #1e1d1b; --well: #272623; --card: #2c2b28; --canvas: #181816; --press: #3a3935;
  --ink: #eceae4; --ink-2: #c4c1b8; --ink-3: #9a978e; --ink-4: #75736c;
  --hair: rgba(255, 255, 255, 0.1); --hair-strong: rgba(255, 255, 255, 0.18); --hair-soft: rgba(255, 255, 255, 0.06);
  --accent: #6fa8e8; --accent-deep: #4a86c9; --accent-soft: #263445; --on-accent: #111111;
  --danger: #e8705f; --danger-ink: #f09a8c; --danger-soft: #3a2522; --danger-hover: #4a2c28;
  --warn: #e0b040; --warn-ink: #f0cc70; --warn-soft: #362d17; --warn-edge: #7a6020;
  --tooltip: #eceae4; --on-tooltip: #1e1d1b;
  --veil: #181816; --label-edge: #8a96a3; --leader: #8a96a3; --label-ink: #eceae4;
  --tag-v: #6fa8e8; --tag-i: #ef8a6e;
  --trace-v-ink: #f5b84a; --trace-i-ink: #5fe3f5;
}
html { -webkit-tap-highlight-color: transparent; -webkit-text-size-adjust: 100%; }
html, body { margin: 0; height: 100%; background: var(--bench); color: var(--ink); font-family: var(--sans); }
body { display: flex; flex-direction: column; }
button { touch-action: manipulation; -webkit-user-select: none; user-select: none; transition: background-color 100ms ease-out, color 100ms ease-out, transform var(--t-press) var(--ease-out); }
/* Press feedback on the buttons that are pressed often (not on the rows of a menu or a card). */
nav > .group button:active, nav .more-button:active, nav .warn-flag:active, .zoom button:active, .info .icon-button:active, .inspector .collapse:active { transform: scale(0.96); }
/* The bar (UX pass, U3): one row, grouped by job; labels give way to icons on a narrow screen. */
nav { position: relative; z-index: 4; display: flex; flex-wrap: nowrap; align-items: center; gap: 2px; min-height: 36px; box-sizing: border-box; padding: 3px 4px; font-size: 13px; background: var(--well); border-bottom: 1px solid var(--hair); }
nav[hidden] { display: none; }
nav .group { display: flex; align-items: center; gap: 2px; padding: 0 4px; }
nav .group + .group { border-left: 1px solid var(--hair); }
nav .spacer { flex: 1; }
nav button { display: inline-flex; align-items: center; gap: 6px; height: 28px; min-width: 28px; justify-content: center; font: inherit; color: var(--ink); background: none; border: 1px solid transparent; border-radius: 4px; padding: 0 8px; cursor: pointer; white-space: nowrap; }
nav button:active { background: var(--press); }
nav button[aria-pressed="true"] { color: var(--accent); background: var(--accent-soft); }
.icon { flex: none; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
nav .more-button .icon { stroke-width: 2.4; }
nav .warn-flag { color: var(--danger-ink); background: var(--danger-soft); }
nav .warn-flag[hidden] { display: none; }
nav .warn-flag .count { font-family: var(--mono); font-variant-numeric: tabular-nums; }
nav .more { position: relative; }
nav .menu { position: absolute; right: 0; top: calc(100% + 4px); z-index: 5; display: flex; flex-direction: column; min-width: 230px; padding: 4px; background: var(--card); border: 1px solid var(--hair); border-radius: 6px; }
nav .menu[hidden] { display: none; }
nav .menu button, nav .menu a { display: flex; width: 100%; height: auto; min-height: 32px; justify-content: flex-start; text-align: left; color: var(--ink); text-decoration: none; padding: 6px 8px; border-radius: 4px; box-sizing: border-box; }
nav .menu [role="menuitemradio"]::before { content: ""; display: inline-block; width: 1.3em; flex: none; }
nav .menu [role="menuitemradio"][aria-checked="true"]::before { content: "✓"; color: var(--accent); }
nav .menu-group { display: flex; flex-direction: column; padding-bottom: 4px; margin-bottom: 4px; border-bottom: 1px solid var(--hair-soft); }
nav .menu-title { padding: 4px 8px 2px; font-size: 11px; font-weight: 600; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.05em; }
nav .menu .revision { padding: 6px 8px 2px; margin-top: 4px; border-top: 1px solid var(--hair-soft); color: var(--ink-3); font-size: 12px; }
@media (max-width: 760px) {
  nav .label { display: none; }
  nav button { padding: 0 6px; }
  nav .group { padding: 0 2px; }
}
@media (max-width: 400px) { nav .time .clock { display: none; } }
main { flex: 1; min-height: 0; display: flex; overflow: hidden; user-select: none; -webkit-user-select: none; cursor: grab; background: var(--canvas); }
main.dragging { cursor: grabbing; }
/* Gestures belong to the drawing only: on main itself, touch-action would also reach the inspector
   inside it in some browsers (Safari), and its card would not scroll. */
main > svg { display: block; width: 100%; height: 100%; touch-action: none; }
main > svg[hidden] { display: none; }
/* While a flip measures the new view (view.js flipView) both views lie over each other. */
main.flipping > svg { position: absolute; inset: 0; }
/* Embedded (inside an iframe): one finger scrolls the note; two fingers are handled by the script. */
body.embedded main > svg { touch-action: pan-x pan-y; }
/* The drawing, in the page only: its background, veil, labels and result tags follow the theme. */
main > svg > rect:first-child { fill: var(--canvas); }
.veil > * { fill: var(--veil); }
.labels rect, .spotlabels rect { fill: var(--card); stroke: var(--label-edge); }
.labels text, .spotlabels text { fill: var(--label-ink); }
.labels line, .spotlabels line { stroke: var(--leader); }
.labels circle, .spotlabels circle { fill: var(--label-edge); stroke: var(--card); }
.results rect[data-q] { fill: var(--card); }
.results rect[data-q="node"] { stroke: var(--tag-v); }
.results text[data-q="node"] { fill: var(--tag-v); }
.results rect[data-q]:not([data-q="node"]) { stroke: var(--tag-i); }
.results text[data-q]:not([data-q="node"]) { fill: var(--tag-i); }
.results .badge { fill: var(--ink-3); stroke: var(--canvas); }
body.no-labels .labels, body.no-labels .spotlabels { display: none; }
body:not(.show-results) .results, body:not(.show-results) .info .sim { display: none; }
.veil, .strips, .coords, .flow, .results { pointer-events: none; }
.coords > * { display: none; }
.results > [data-q] { pointer-events: auto; cursor: help; }
.probes { pointer-events: none; }
.probes > * { display: none; }
.veil, .flow, .strips > *, .results > * { display: none; }
/* The MODEL stamp of the drawing gives way to the page's own badge (top left, and in the card). */
.results .badge { display: none !important; }
body.focusing .veil, body.layer-flow .veil, body.layer-flow .flow { display: inline; }
[data-part] { cursor: pointer; }
.dots { animation: dots linear infinite; animation-duration: var(--lin); }
body.speed-log .dots { animation-duration: var(--log); }
@keyframes dots { to { stroke-dashoffset: -9; } }
@media (prefers-reduced-motion: reduce) { .dots { animation: none; } }
body.live .dots { animation: none; }
nav .time .clock { margin-left: 4px; color: var(--ink-3); font-family: var(--mono); font-size: 12px; font-variant-numeric: tabular-nums; min-width: 6.5em; }
main { position: relative; }
.info { flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 0 12px 10px; color: var(--ink); font-size: 13px; line-height: 1.4; font-variant-numeric: tabular-nums; cursor: auto; user-select: text; -webkit-user-select: text; touch-action: auto; }
.info[hidden] { display: none; }
.info .head { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 8px; padding: 8px 0 4px; background: var(--card); }
.info h2 { flex: 1; min-width: 0; font-size: 15px; font-weight: 600; margin: 0; }
.info .head .actions { margin: 0; gap: 2px; flex: none; }
.info .icon-button { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; color: var(--ink-2); background: none; border: none; border-radius: 4px; }
.info .icon-button[aria-pressed="true"] { color: var(--accent); background: var(--accent-soft); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.info .summary { display: none; align-items: baseline; gap: 8px; padding: 0 0 6px; white-space: nowrap; overflow: hidden; }
/* Only in a peeking sheet (all it shows); open, the Simulation section below says the same. Each
   value has a slot of its own, so a value that changes length never pushes the others. */
@media (max-width: 760px) { .inspector[data-size="peek"] .info .summary:not([hidden]) { display: flex; } }
.info .summary .slot { display: inline-block; width: 8.5ch; text-align: right; } /* sign, three digits, unit: at most 8 */
.info .summary .model, .model-badge { font-size: 10px; font-weight: 600; letter-spacing: 0.05em; color: var(--ink-3); border: 1px solid var(--hair); border-radius: 4px; padding: 1px 5px; }
.info .summary .values { display: flex; gap: 6px; font-family: var(--mono); font-size: 12px; color: var(--accent); }
.info details.pins { margin-top: 8px; }
.info details.pins > summary { font-size: 11px; font-weight: 600; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; }
.info h3 { font-size: 11px; font-weight: 600; margin: 8px 0 2px; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.05em; }
.info p { margin: 2px 0; }
.info .type { color: var(--ink-2); }
.info .here { margin-top: 6px; }
.info ul { margin: 0; padding-left: 16px; }
.info .actions { display: flex; gap: 6px; margin-top: 8px; }
.info button { font: inherit; color: var(--ink); background: var(--bench); border: 1px solid var(--hair-strong); border-radius: 4px; padding: 3px 9px; cursor: pointer; }
.info button:active { background: var(--press); }
.info button[aria-pressed="true"] { color: var(--on-accent); background: var(--accent); border-color: var(--accent-deep); }
.info ul.terms { list-style: none; padding-left: 0; }
.info .term { display: block; width: 100%; text-align: left; color: inherit; background: none; border: none; border-radius: 4px; padding: 2px 4px; margin: 0; cursor: help; }
.info .term::after { content: " ⓘ"; color: var(--ink-4); }
.info .term[aria-expanded="true"] { background: var(--accent-soft); }
.info .link { display: block; width: 100%; text-align: left; font: inherit; color: inherit; background: none; border: none; border-radius: 4px; padding: 1px 4px; margin: 0 0 0 -4px; cursor: pointer; }
.info .link::after { content: " ›"; color: var(--ink-4); }
.info .term:active, .info .link:active { background: var(--accent-soft); }
.info .explain { margin: 2px 4px 6px; padding: 6px 8px; background: var(--well); border-left: 3px solid var(--accent); border-radius: 4px; color: var(--ink-2); }
.info .explain[hidden] { display: none; }
.info .tip { color: var(--ink-3); font-size: 12px; }
.tooltip { position: absolute; z-index: 6; max-width: 260px; padding: 6px 8px; background: var(--tooltip); color: var(--on-tooltip); border-radius: 4px; font-size: 12px; line-height: 1.35; pointer-events: none; }
.tooltip[hidden] { display: none; }

.side { flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 6px; padding: 4px 10px 10px; cursor: auto; touch-action: auto; user-select: none; -webkit-user-select: none; }
.side .panel { color: var(--ink); font-size: 13px; padding: 2px 0; }
.side .panel[hidden] { display: none; }
.side .head { display: block; width: 100%; text-align: left; font: inherit; font-size: 11px; font-weight: 600; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.05em; background: none; border: none; padding: 2px 0; cursor: pointer; }
.side .head::after { content: " ▾"; }
.side .head[aria-expanded="false"]::after { content: " ▸"; }
.side .body[hidden] { display: none; }
.side .warnings { border: 1px solid var(--danger); background: var(--danger-soft); border-radius: 6px; padding: 6px 10px 8px; }
.side .warnings h3 { font-size: 11px; margin: 2px 0 4px; color: var(--danger-ink); text-transform: uppercase; letter-spacing: 0.05em; }
.side .warnings ul { list-style: none; margin: 0; padding: 0; }
.side .warning { display: block; width: 100%; text-align: left; font: inherit; color: var(--danger-ink); background: none; border: none; border-radius: 4px; padding: 3px 4px; cursor: pointer; }
.side .warning:active { background: var(--danger-hover); }
.side .falstad-notes { border: 1px solid var(--warn); background: var(--warn-soft); border-radius: 6px; padding: 6px 10px 8px; }
.side .falstad-notes h3 { font-size: 11px; margin: 2px 0 4px; color: var(--warn-ink); text-transform: uppercase; letter-spacing: 0.05em; }
.side .falstad-notes ul { margin: 0; padding-left: 16px; color: var(--warn-ink); }
nav .falstad { display: flex; align-items: center; gap: 4px; }
nav .falstad .open { flex: 1; color: var(--accent); }
nav .falstad .open::after { content: " ↗"; }
nav .falstad .flag { width: auto; flex: none; color: var(--warn-ink); background: var(--warn-soft); border-color: var(--warn-edge); }
nav .falstad .flag[hidden] { display: none; }
.info .scope { margin-top: 8px; }
.info .scope h3 { margin: 0 0 2px; }
.info .scope svg { display: block; width: 100%; height: auto; font-family: inherit; }
.scope-screen { fill: var(--scope); }
.scope-grid { stroke: var(--scope-grid); stroke-width: 0.6; }
.scope-zero { stroke: var(--scope-zero); stroke-width: 0.8; }
.scope-trace { fill: none; stroke-width: 1.5; stroke-linejoin: round; }
.scope-trace.v { stroke: var(--trace-v); }
.scope-trace.i { stroke: var(--trace-i); }
.scope-label { font-size: 10px; font-weight: 600; }
.scope-label.v { fill: var(--trace-v-ink); }
.scope-label.i { fill: var(--trace-i-ink); }
.scope-scale { fill: var(--scope-scale); font-family: var(--mono); font-size: 8px; text-anchor: end; }
.scope-time { fill: var(--ink-3); font-size: 9px; }
.scope-end { text-anchor: end; }
.scope-model { text-anchor: middle; font-style: italic; }
.side .clear, .control .hold { font: inherit; color: var(--ink); background: var(--bench); border: 1px solid var(--hair-strong); border-radius: 4px; padding: 3px 9px; cursor: pointer; margin-top: 4px; }
.side .clear:active, .control .hold:active { background: var(--press); }
.control { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 0 8px; margin: 4px 0; }
.control .name { color: var(--ink-2); }
.control .value { font-family: var(--mono); font-size: 12px; font-variant-numeric: tabular-nums; color: var(--accent); text-align: right; }
.control input[type="range"] { grid-column: 1 / -1; width: 100%; margin: 2px 0; accent-color: var(--accent); touch-action: pan-y; }
.control .buttons { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
.control .hold { margin: 0; touch-action: none; }
.control .hold[aria-pressed="true"] { color: var(--on-accent); background: var(--accent); border-color: var(--accent-deep); }
.info .adjust { margin-top: 4px; }
.info .stress { color: var(--danger-ink); font-weight: bold; }
/* Limits: a box around the part (layer marks), opacity in a few steps: cheap to redraw. */
.marks { pointer-events: none; }
.marks > * { display: none; }
@keyframes stress-pulse { from { opacity: 1; } to { opacity: 0.25; } }
@media (prefers-reduced-motion: reduce) { .marks > * { animation: none !important; } }
.zoom { position: absolute; right: 8px; bottom: 8px; z-index: 1; display: flex; flex-direction: column; background: var(--card); border: 1px solid var(--hair); border-radius: 6px; overflow: hidden; cursor: auto; touch-action: manipulation; }
.zoom[hidden], .zoom button[hidden] { display: none; }
.zoom button { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; margin: 0; color: var(--ink); background: none; border: none; border-top: 1px solid var(--hair-soft); cursor: pointer; }
.zoom button:first-child { border-top: none; }
.zoom button:active { background: var(--press); }
.zoom button[aria-pressed="true"] { color: var(--accent); }
.gesture-hint { position: absolute; inset: 0; z-index: 3; display: flex; align-items: center; justify-content: center; padding: 16px; text-align: center; font-size: 16px; color: var(--on-hint); background: var(--hint); opacity: 0; transition: opacity 200ms ease-out; pointer-events: none; }
.gesture-hint.on { opacity: 1; }
/* Hover only where there is a mouse: on touch a hover state sticks after the tap. */
@media (hover: hover) and (pointer: fine) {
  nav button:not([aria-pressed="true"]):hover { background: var(--bench); }
  .info button:not([aria-pressed="true"]):hover, .side .clear:hover, .control .hold:not([aria-pressed="true"]):hover { background: var(--well); }
  .info .term:hover, .info .link:hover { background: var(--accent-soft); }
  .side .warning:hover { background: var(--danger-hover); }
  .zoom button:hover { background: var(--well); }
}
/* Touch: targets of at least 40 px. */
@media (pointer: coarse) {
  nav button { height: 40px; min-width: 40px; }
  nav .menu button, nav .menu a { min-height: 40px; }
  .info .actions button, .side .clear, .control .hold { min-height: 40px; }
  .info .icon-button { width: 40px; height: 40px; }
  .zoom button { width: 40px; height: 40px; }
}
/* The first-time hint (bar.js): what can be tapped and how to move, alone or inside a note. */
.first-hint { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); z-index: 2; box-sizing: border-box; width: max-content; max-width: calc(100% - 24px); display: flex; flex-direction: column; gap: 2px; padding: 8px 12px; text-align: center; color: var(--on-tooltip); background: var(--tooltip); border-radius: 6px; font-size: 13px; line-height: 1.35; pointer-events: none; }
.first-hint[hidden] { display: none; }
.first-hint small { font-size: 12px; opacity: 0.8; }
body.embedded .first-hint .alone, body:not(.embedded) .first-hint .framed { display: none; }
/* The inspector (inspector.js, UX pass U4): the card and the circuit's panels, in tabs. */
.inspector { position: absolute; z-index: 2; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; color: var(--ink); background: var(--card); border: 1px solid var(--hair); cursor: auto; }
.inspector[hidden] { display: none; }
.inspector[data-tab="part"] .side, .inspector[data-tab="circuit"] .info { display: none; }
.inspector .grip { display: none; flex: none; width: 36px; height: 4px; margin: 6px auto 0; border-radius: 2px; background: var(--hair-strong); }
.inspector .tabs { flex: none; display: flex; align-items: center; gap: 2px; padding: 2px 4px 0 6px; border-bottom: 1px solid var(--hair-soft); }
.inspector .tabs .spacer { flex: 1; }
.inspector [role="tab"] { font: inherit; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-3); background: none; border: none; border-bottom: 2px solid transparent; padding: 8px 8px 6px; cursor: pointer; }
.inspector [role="tab"][hidden] { display: none; }
.inspector [role="tab"][aria-selected="true"] { color: var(--ink); border-bottom-color: var(--accent); }
.inspector .tabs.single [role="tab"] { border-bottom-color: transparent; }
.inspector .collapse { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; color: var(--ink-3); background: none; border: none; border-radius: 4px; cursor: pointer; }
.inspector .collapse:active { background: var(--press); }
.inspector .collapse .icon { transition: transform 160ms var(--ease-out); }
.model-badge { position: absolute; left: 8px; top: 8px; z-index: 1; display: none; background: var(--card); pointer-events: none; }
body.show-results.focusing .model-badge { display: block; }
@media (min-width: 761px) {
  .inspector { top: 8px; right: 8px; width: 300px; max-height: calc(100% - 16px); border-radius: 6px; }
  .inspector .collapse[aria-expanded="true"] .icon { transform: rotate(180deg); }
  .zoom { right: auto; left: 8px; }
}
@media (max-width: 760px) {
  .inspector { left: 0; right: 0; bottom: 0; height: 85%; border-bottom: none; border-radius: 12px 12px 0 0; transition: transform 280ms var(--ease-drawer); }
  .inspector.dragging { transition: none; }
  .inspector .grip { display: block; }
  .inspector .tabs, .inspector .grip { touch-action: none; }
  .inspector .collapse[aria-expanded="false"] .icon { transform: rotate(180deg); }
  body.sheet-up .zoom { display: none; }
}
@media (prefers-reduced-motion: reduce) { .inspector { transition: none; } }
@media (hover: hover) and (pointer: fine) { .inspector [role="tab"]:hover, .inspector .collapse:hover { color: var(--ink); } }
/* Entrances (U5): the menu grows from its button, the panel slides in a little; exits are instant. */
nav .menu { transform-origin: top right; transition: opacity 150ms var(--ease-out), transform 150ms var(--ease-out); }
@starting-style { nav .menu { opacity: 0; transform: scale(0.96); } }
@media (min-width: 761px) {
  .inspector { transition: opacity 200ms var(--ease-out), transform 200ms var(--ease-out); }
  @starting-style { .inspector { opacity: 0; transform: translateX(12px); } }
}
@media (prefers-reduced-motion: reduce) {
  nav .menu, .inspector { transition: none; }
  nav > .group button:active, nav .more-button:active, nav .warn-flag:active, .zoom button:active, .info .icon-button:active, .inspector .collapse:active { transform: none; }
}`;
