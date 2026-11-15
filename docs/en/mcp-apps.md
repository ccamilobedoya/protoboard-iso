# The circuit inside the conversation (MCP Apps)

*[Español](../es/mcp-apps.md)*

A pilot: when a host that supports [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview)
(the MCP extension `io.modelcontextprotocol/ui`, specification 2026-01-26) calls `layout`, the
circuit's live page appears inside the conversation: tap a part, the current layer, the sliders, the
oscilloscope. A host without MCP Apps gets exactly the same tools, descriptions and answers as before.

## What the host gets

| Piece | What it is |
|---|---|
| resource `ui://protoboard-iso/board.html` | the viewer, `text/html;profile=mcp-app`: the page's CSS and its live script, with no circuit (`renderAppViewer` in `src/page.js`); no outside origin, so the host's restrictive default CSP applies |
| `_meta.ui.resourceUri` of `layout`, `apply_ops` and `undo` | the host shows the viewer for each call of those tools |
| `layout`'s `structuredContent` | `{ target, revision, lang }`, a few dozen bytes; its text is the same as without MCP Apps |
| tool `page_parts { target, revision?, lang?, chunk?, id? }` | `visibility: ["app"]`: only the viewer calls it, never the model. The circuit's page in pieces (`renderPageParts`): the attributes, the markup (the two views' SVG, the bar, the inspector), the data and the board's program, and the viewer's texts in the circuit's language |

The pieces never pass through the model: the viewer asks for them itself. A revision older than the
current one is rebuilt from the history (each change carries its inverse: `circuitAt` in
`src/node/workspace.js`), so a view keeps showing the circuit it was made for; it says when a newer
revision exists.

Back to the conversation, one silent thing:

- Tapping a part updates the model's context (`ui/update-model-context`) with one line, at most 300
  characters, 400 ms after the last tap: the part, its value and, with the results on, its voltage
  and current as the card shows them ("Open on the board: R1, Resistance: 330 Ω, Voltage: 7.08 V,
  Current: 21.5 mA.").
- The viewer sends no chat message (`ui/message`). It had a button "Ask about this part" that did;
  in Claude Desktop it fills the user's message box under a banner ("Use caution before running this
  prompt…"), which breeds distrust, so it was tried and removed. The viewer talks to the model only
  through the silent context update above. The standalone page never has the bridge: it is only in
  the viewer's script.
- The specification's own text lists no host capability for `ui/update-model-context`, but the hosts and
  the ext-apps schema do: Claude advertises `updateModelContext {text, image}`. The viewer sends the
  update only where the host advertises it (or gave no list of capabilities at all). The spec says a host
  MAY defer the context until the user's next message, MAY dedupe it, and answers `-32000` if it denies it.
  Claude Desktop accepts it (result `{}`), yet the model did not know the tapped part (see `selection`).

## `selection`: the model reads what was tapped through the server

With a local connector, Claude does not let the model read what a widget knows, nor call the widget's
tools (the host answers «Widget … tools can't run: it comes from a local connector»), and the context
update did not reach it. The viewer can call the server's tools, so it routes the tap through the server:

- `selection_set { target, revision, part | null, line }`, app-only (`visibility: ["app"]`): the viewer
  sends the same line as the context update (at most 300 characters; with the results off the page
  shows no readings, so the line has none), debounced the same way, and `part: null` when the card closes.
- `selection { target? }`, a tool the model sees, offered only to clients that get the viewer (about 450
  bytes with its schema): the last tap with its readings as the page shows them, how long ago, the circuit
  and revision, and whether the circuit has a newer revision; or «Nothing is tapped on the board.» Without
  `target`, the most recent selection of any circuit.

Claude Desktop starts two processes of the stdio server for one session, and the viewer's calls and the
model's land in different ones, so nothing they share may live in a process's memory. The selection is
therefore a small hidden file in the root, `.protoboard/selection.json` (no listing shows the folder), written atomically (a temp file, then rename), read on every `selection` call,
with at most the last 32 circuits, one selection each; an entry older than 24 hours is ignored and
pruned. It holds the tapped part and its line (at most 300 characters), nothing else. A root that cannot
be written falls back to the process's memory, and `selection` says once that it cannot be shared. The
chunks of `page_parts` are served from files too (`.protoboard/pages/`, below). And a stdio server now ends when
its stdin ends or closes (the SDK's transport does not watch for it, and a host reached over ssh does not
always deliver a hangup).

## For a model that sees the board

A client that gets the viewer receives one more final line in `layout`'s text: the user sees the circuit
as a live board in the chat, so the model should not render or draw it, reads what they tap with
`selection` and never calls the widget's own tools (under 240 bytes). Its `render` description drops the advice on `png_width`. Any other client gets the
same text and descriptions as before.

## Diagnostics

Nobody can open a host's devtools from the server, so the viewer can report to it. With
`PROTOBOARD_APPS_DEBUG=1` the server also registers the app-only tool `app_report { event, detail }`
(only for a client that gets the viewer; without the variable the tool does not exist) and tells the
viewer with the pieces. Each report is a JSON line `{t, event, detail}` appended to
`<PROTOBOARD_ROOT>/.protoboard/app-report.jsonl`; the file stops growing at 256 KB and `detail` is cut at 4 KB.
The viewer reports: the result of `ui/initialize` (host info and capabilities; the host context apart),
every `ui/update-model-context` with the text sent and the result or the error (code and message),
`error` and `unhandledrejection` events.
In Claude Desktop's config (`env` of the server): `"PROTOBOARD_APPS_DEBUG": "1"`.

The viewer has the part's close-up too (the eye in the card; on by default in every live page). It adds
about 32 KB to `page_parts` for led-resistor (571 to 603 KB), 42 KB for the 555 astable (976 to 1018 KB).

## Which hosts

The server offers all of this to a client that announces the extension in its capabilities
(`capabilities.extensions["io.modelcontextprotocol/ui"].mimeTypes` with `text/html;profile=mcp-app`),
as the specification asks. Some hosts show MCP Apps without announcing it (the reference
`basic-host` of the ext-apps repository does not); for them, `PROTOBOARD_APPS=on` offers it to every
client, `off` to none, `auto` (default) follows the announcement.

Tested with the reference `basic-host` only. Claude Desktop and claude.ai are untested.

## How it is built

- `src/page.js`: `renderPageParts` returns what is the circuit's own; `renderPage` composes the same
  document from it (every page of the demo site and the examples was byte-identical before and after
  the split); `renderAppViewer` is the fixed viewer.
- `src/page/client/app.js`: the bridge, hand-written (JSON-RPC 2.0 over `postMessage`: `ui/initialize`,
  `ui/notifications/initialized`, the tool's result, `tools/call`, `ui/update-model-context`,
  `ui/notifications/size-changed`), about 180 lines, instead of bundling
  `@modelcontextprotocol/ext-apps`: no new dependency and nothing for the licence check. Entry:
  `app-page.js`, which starts the page explicitly once the pieces are in the document.
- `mcp/app.js` (the resource, `page_parts`, which tools link the viewer); `mcp/core.js` offers them by
  client; `mcp/server.js` is stdio, `mcp/http.js` the same server over Streamable HTTP on
  127.0.0.1, only for testing with a local host.
- `scripts/app-host-check.js <basic-host dir> [--csp host|spec]` drives a built `basic-host` with
  Chromium: the board drawn, a tap, the current layer moving, the context line, the message, a
  board's sketch, revision pinning and the time to first paint.

## Limits found

- **A board's sketch needs `unsafe-eval`.** The program runs as generated code (`new Function` in
  `src/sim/program.js`). The specification's default CSP has no `unsafe-eval` and a resource cannot
  ask for it (its CSP metadata only lists origins). Under that CSP the page draws and simulates, but
  the sketch does not run (an `EvalError` the page swallows: the LED stays as it started).
  `basic-host` allows `unsafe-eval`, so there it runs. Two ways out, neither built: run the sketch
  with an interpreter instead of generated code, or step the program in the server and send the
  pins' states.
- **Size, and the host's limit.** The viewer is about 600 KB (160 KB gzip); a page's pieces are 0.6 MB
  (led-resistor) to 1.5 MB (the largest recipe, `uno-seven-segment`: 1,483,598 bytes; the largest example
  `switches`: 1,508,890). Claude Desktop refuses a tool result over **983,040 bytes**, also for the calls a
  viewer makes (seen on 2026-11-14: «the document exceeds this tool's 983040-byte limit»), so `page_parts`
  hands the page over in chunks: a call without `chunk` returns a manifest (`revision`, `latest`, `id`,
  `chunks`, `bytes`, the viewer's texts), and `chunk: n` with the manifest's `revision` and `id` returns the
  n-th piece of the page's JSON (cut as text, at most 200 KB as JSON escapes it, never inside a character).
  No result of the app-only tools passes `RESULT_MAX`, 256 KB, serialized (a test checks every recipe and
  every example). The viewer fetches four chunks at a time, retries a failed one once, shows «Loading the
  circuit… n/total» meanwhile and an error line in the widget if a chunk still fails (with `app_report`
  on, the retry and the failure are reported). The `id` (a hash of the assembled page) pins the content:
  the server writes the assembled page once, when its manifest is first asked for, to
  `.protoboard/pages/`, and any process cuts any chunk from that file; if the file is gone it rebuilds the
  page at the pinned revision (from the history if it is older) and refuses it if it no longer hashes to
  the `id`. Calls and time from the tool result to first paint, in the
  reference host (median of three; single call → chunks): led-resistor 1 → 4 calls, 129 → 149 ms; 555 astable
  1 → 7, 328 → 380 ms; uno-blink 1 → 4, 170 → 191 ms; uno-seven-segment 1 → 10, 605 → 594 ms. Not done:
  fetching the second view or the close-up data later; chunking alone satisfies the limit.
  Claude's documentation says a tool result over about 150,000 characters may be stored as a file when code
  execution is on; whether that applies to a call from the app is not documented.
- The context line and the button follow the card: when the live page rebuilds a card by itself
  (its lines change), the button goes until the next tap.
- `layout`, `apply_ops` and `undo` show the viewer when they save a revision, so a change appears in the
  chat as a new board (the earlier boards keep their revision and do not refresh themselves; one mounted after a change says a newer revision exists); a dry run, a
  failed change, `try_ops`, `render` and the read-only tools never do. Each such answer ends in the same
  line as `layout`'s. An agent that makes many changes adds a board to the conversation for each one.
