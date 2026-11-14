// Entry of the MCP App viewer (src/page.js, renderAppViewer): the live page's script, started by
// app.js once the host has sent the tool's result and the circuit's pieces are in the document.

import { startPage } from './main.js';
import { setupLive } from './live.js';
import { startApp } from './app.js';

startApp(window, startPage, [setupLive]);
