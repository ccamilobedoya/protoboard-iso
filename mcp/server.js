#!/usr/bin/env node
// MCP server for protoboard-iso, over stdio (the server itself is core.js).
//
// Environment: PROTOBOARD_ROOT, PROTOBOARD_LANG (see tools.js).
//
// It ends when its host goes away: stdin ending or closing, stdout failing (the pipe broke) or the
// transport closing. The SDK's stdio transport only listens for data, and a host reached through ssh
// does not always deliver a hangup, so a server left behind would run until the machine restarts.
// process.exit takes the worker thread with it.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './core.js';

const server = createServer();
const leave = () => process.exit(0);
process.stdin.on('end', leave);
process.stdin.on('close', leave);
process.stdout.on('error', leave);
server.server.onclose = leave;
await server.connect(new StdioServerTransport());
