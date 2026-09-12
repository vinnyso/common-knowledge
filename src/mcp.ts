#!/usr/bin/env node

import process from "node:process";

import { parseMcpRootArgument } from "./mcp-root.js";
import { runMcpServer } from "./mcp-server.js";

try {
  const checkoutRoot = parseMcpRootArgument(process.argv.slice(2));
  await runMcpServer(checkoutRoot);
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Cannot start Common Knowledge MCP: ${detail}\n`);
  process.exitCode = 1;
}
