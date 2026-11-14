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
| `layout`'s `_meta.ui.resourceUri` | the host shows the viewer for each `layout` call |
| `layout`'s `structuredContent` | `{ target, revision, lang }`, a few dozen bytes; its text is the same as without MCP Apps |
| tool `page_parts { target, revision?, lang? }` | `visibility: ["app"]`: only the viewer calls it, never the model. The circuit's page in pieces (`renderPageParts`): the attributes, the markup (the two views' SVG, the bar, the inspector), the data and the board's program, and the viewer's texts in the circuit's language |

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
- The specification (2026-01-26) defines no host capability for `ui/update-model-context`
  (`HostCapabilities` lists `openLinks`, `serverTools`, `serverResources`, `logging`, `sandbox`), so
  there is nothing to check before sending. It says a host MAY defer the context until the user's next
  message, MAY dedupe it, and answers an error `-32000` if it denies it. Whether the model sees the
  line is what the debug report below shows.

## For a model that sees the board

A client that gets the viewer receives one more final line in `layout`'s text, saying the user already
sees the circuit as a live board in the chat, so the model should not render or draw an image (about
100 bytes: "The user already sees this circuit as a live board in the chat: do not render or draw an
image of it."). Its `render` description drops the advice on `png_width`. Any other client gets the
same text and descriptions as before.

## Diagnostics

Nobody can open a host's devtools from the server, so the viewer can report to it. With
`PROTOBOARD_APPS_DEBUG=1` the server also registers the app-only tool `app_report { event, detail }`
(only for a client that gets the viewer; without the variable the tool does not exist) and tells the
viewer with the pieces. Each report is a JSON line `{t, event, detail}` appended to
`<PROTOBOARD_ROOT>/.app-report.jsonl`; the file stops growing at 256 KB and `detail` is cut at 4 KB.
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
- **Size.** The viewer is about 600 KB (160 KB gzip); `page_parts` answers 430 KB (led-resistor) to
  980 KB (555 astable), mostly the two views' SVG. Claude's documentation says a tool result over
  about 150,000 characters may be stored as a file instead of reaching the app when code execution
  is on; whether that applies to a call from the app is not documented.
- The context line and the button follow the card: when the live page rebuilds a card by itself
  (its lines change), the button goes until the next tap.
- Only `layout` shows the viewer. `apply_ops`, `undo` and `render` could too, but an agent calls them
  many times per circuit and each call would add a view to the conversation.
