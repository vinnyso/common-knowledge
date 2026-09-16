import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode, signal) => {
      resolve({ exitCode, signal, stdout, stderr });
    });
  });
}

const temporaryRoot = await realpath(
  await mkdtemp(join(tmpdir(), "common-knowledge-package-")),
);
const installRoot = join(temporaryRoot, "install");
const npmEnvironment = {
  ...process.env,
  npm_config_cache: join(temporaryRoot, ".npm-cache"),
};

try {
  await mkdir(installRoot);
  const packResult = await run(
    "npm",
    ["pack", "--json", "--pack-destination", temporaryRoot],
    { cwd: process.cwd(), env: npmEnvironment },
  );
  assert.equal(packResult.exitCode, 0, packResult.stderr);
  const [{ filename }] = JSON.parse(packResult.stdout);
  assert.equal(typeof filename, "string");

  const packagePath = join(temporaryRoot, filename);
  const installResult = await run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", packagePath],
    { cwd: installRoot, env: npmEnvironment },
  );
  assert.equal(installResult.exitCode, 0, installResult.stderr);

  const installedManifest = JSON.parse(
    await readFile(join(installRoot, "node_modules", "common-knowledge", "package.json"), "utf8"),
  );
  assert.equal(installedManifest.license, "Apache-2.0");
  assert.equal(installedManifest.engines.node, ">=20");
  assert.equal(installedManifest.bin["common-knowledge"], "dist/cli.js");
  assert.equal(installedManifest.bin["common-knowledge-mcp"], "dist/mcp.js");

  const gitResult = await run("git", ["init", "-q", "-b", "main"], { cwd: installRoot });
  assert.equal(gitResult.exitCode, 0, gitResult.stderr);

  const cliResult = await run(
    join(installRoot, "node_modules", ".bin", "common-knowledge"),
    ["--help"],
    { cwd: installRoot },
  );
  assert.equal(cliResult.exitCode, 0, cliResult.stderr);
  assert.equal(cliResult.stderr, "");
  assert.match(cliResult.stdout, /^Usage: common-knowledge <command>/);

  const initResult = await run(
    join(installRoot, "node_modules", ".bin", "common-knowledge"),
    ["init"],
    { cwd: installRoot },
  );
  assert.deepEqual(initResult, {
    exitCode: 0,
    signal: null,
    stdout: "Initialized Common Knowledge corpus at .repo-memory.\n",
    stderr: "",
  });
  assert.deepEqual((await readdir(join(installRoot, ".repo-memory"))).sort(), [
    "README.md",
    "entries",
    "log.md",
    "proposals",
    "schema.json",
  ]);

  const transport = new StdioClientTransport({
    command: join(installRoot, "node_modules", ".bin", "common-knowledge-mcp"),
    args: ["--root", installRoot],
    stderr: "pipe",
  });
  const client = new Client({ name: "package-verification", version: "1.0.0" });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      "proposal_create",
      "proposal_discard",
      "proposal_edit",
      "proposal_list",
      "proposal_read",
      "read",
      "search",
      "validate",
    ]);
    const validation = await client.callTool({ name: "validate", arguments: {} });
    assert.deepEqual(validation.structuredContent, { status: "ok", entry_count: 0 });

    const proposalInput = {
      id: "package-verification",
      operation: "add",
      created_by: "package-verifier",
      targets: [{ id: "package-verification", state: "absent" }],
      evidence: [{
        source: "scripts/verify-package.mjs",
        revision: "installed-package",
        observed_fact: "The installed MCP server exposes proposal operations.",
        lineage: "executable check",
        validator: "npm run verify:package",
      }],
      rationale: "Verify pending proposal operations in the packed installation.",
      future_use: "Use this check when the packaged MCP surface changes.",
      applicability_and_exceptions: "Applies only to package verification.",
      assumptions_and_unresolved_checks: "No unresolved checks.",
      intended_destination: ".repo-memory/entries/package-verification.md",
      proposed_entry: `---\nschema_version: 1\nid: package-verification\nkind: gotcha\ntitle: Verify the installed package proposal surface\ntriggers:\n  - package proposal verification\nstatus: active\ncreated_at: ${new Date().toISOString()}\ncreated_by: package-verifier\n---\n## Situation\n\nThe package is installed in isolation.\n\n## Resolution\n\nExercise the installed proposal tools.\n`,
    };
    const created = await client.callTool({
      name: "proposal_create",
      arguments: proposalInput,
    });
    assert.equal(created.structuredContent.status, "ok");
    const firstRevision = created.structuredContent.proposal.summary.revision;
    assert.match(firstRevision, /^sha256:[a-f0-9]{64}$/u);
    const proposals = await client.callTool({ name: "proposal_list", arguments: {} });
    assert.equal(proposals.structuredContent.proposals[0].id, "package-verification");
    const proposal = await client.callTool({
      name: "proposal_read",
      arguments: { id: "package-verification" },
    });
    assert.equal(proposal.structuredContent.proposal.summary.revision, firstRevision);
    const { created_by: _createdBy, ...editableProposal } = proposalInput;
    const edited = await client.callTool({
      name: "proposal_edit",
      arguments: {
        ...editableProposal,
        rationale: "Verify revised pending proposal operations in the packed installation.",
        expected_revision: firstRevision,
        revised_by: "package-verifier",
      },
    });
    assert.equal(edited.structuredContent.status, "ok");
    const secondRevision = edited.structuredContent.proposal.summary.revision;
    const discarded = await client.callTool({
      name: "proposal_discard",
      arguments: { id: "package-verification", expected_revision: secondRevision },
    });
    assert.deepEqual(discarded.structuredContent, {
      status: "ok",
      proposal_id: "package-verification",
    });
  } finally {
    await client.close();
  }

  process.stdout.write(
    `Verified ${filename}: packed, installed, and exercised CLI and MCP operations in isolation.\n`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
