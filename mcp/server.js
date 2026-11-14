#!/usr/bin/env node
// MCP server for protoboard-iso, over stdio (the server itself is core.js).
//
// Environment: PROTOBOARD_ROOT, PROTOBOARD_LANG (see tools.js).

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './core.js';

await createServer().connect(new StdioServerTransport());
