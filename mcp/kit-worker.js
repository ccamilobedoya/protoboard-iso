// Runs the tools' handlers for core.js, in a worker thread with its own module cache: when the
// kit's code changes, core.js ends this worker and starts a fresh one, which imports the new code.

import { parentPort } from 'node:worker_threads';
import { TOOLS } from './tools.js';
import { APP_TOOLS, VIEWER } from './app.js';

// The tools, the app-only ones and the viewer resource (read as `resource:<uri>`).
const handlers = new Map([...TOOLS, ...APP_TOOLS].map((tool) => [tool.name, tool.handler]));
handlers.set(`resource:${VIEWER.uri}`, VIEWER.read);

parentPort.on('message', async ({ id, name, args }) => {
  const handler = handlers.get(name);
  try {
    const result = handler ? await handler(args) : { isError: true, content: [{ type: 'text', text: `The kit has no tool "${name}" any more: reconnect the MCP server (/mcp).` }] };
    parentPort.postMessage({ id, result });
  } catch (e) {
    parentPort.postMessage({ id, result: { isError: true, content: [{ type: 'text', text: e?.message ?? String(e) }] } });
  }
});
parentPort.postMessage({ ready: true, tools: [...TOOLS, ...APP_TOOLS].map((tool) => tool.name) });
