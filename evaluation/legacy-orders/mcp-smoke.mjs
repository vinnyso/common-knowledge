import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [server, root] = process.argv.slice(2);
assert.ok(server && root, "usage: node mcp-smoke.mjs /installed/dist/mcp.js /consumer/root");
const client = new Client({ name: "ck40-preparation", version: "1" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [server, "--root", root] }));
try {
  for (const [name, args] of [
    ["validate", {}],
    ["search", { query: "reference import customerReference", path: "src/main/java/com/northstar/orders/legacy/web/ReferenceImportController.java" }],
    ["read", { id: "reference-contract" }],
    ["search", { query: "dispatch export businessDate warehouse cutoff", path: "src/main/java/com/northstar/orders/legacy/web/AccountingController.java" }],
    ["read", { id: "dispatch-contract" }],
    ["search", { query: "CsvWriter invoice CSV quoting", path: "src/main/java/com/northstar/orders/accounting/CsvWriter.java" }],
  ]) {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.status, name === "search" && args.query.startsWith("CsvWriter") ? "no_match" : "ok");
    if (name === "search" && args.query.startsWith("CsvWriter")) assert.equal(result.structuredContent.entries?.length ?? result.structuredContent.results?.length, 0);
    process.stdout.write(`${JSON.stringify({ name, arguments: args, result: result.structuredContent })}\n`);
  }
} finally {
  await client.close();
}
