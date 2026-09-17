import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import {
  resolveCheckoutRoot,
  UnsupportedCheckoutRootError,
} from "../dist/mcp-root.js";

const runFile = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(projectRoot, "dist", "cli.js");
const mcpPath = join(projectRoot, "dist", "mcp.js");
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function temporaryDirectory(prefix = "common-knowledge-mcp-") {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  const canonical = await realpath(directory);
  temporaryDirectories.push(canonical);
  return canonical;
}

async function git(cwd, ...args) {
  await runFile("git", args, { cwd });
}

async function makeRepository() {
  const directory = await temporaryDirectory();
  await git(directory, "init", "-q", "-b", "main");
  await git(directory, "config", "user.name", "CK Test");
  await git(directory, "config", "user.email", "ck-test@example.invalid");
  return directory;
}

function invokeCli(args, cwd) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (exitCode) => resolveResult({ exitCode, stdout, stderr }));
  });
}

function entrySource({ id, title, triggers }) {
  return `---\nschema_version: 1\nid: ${id}\nkind: gotcha\ntitle: ${title}\ntriggers:\n${triggers.map((trigger) => `  - ${trigger}`).join("\n")}\nstatus: active\ncreated_at: 2026-09-11T12:00:00Z\ncreated_by: mcp-test\n---\n## Situation\n\nA recurring project condition.\n\n## Resolution\n\nApply the project-specific resolution.\n`;
}

function proposalArguments(overrides = {}) {
  return {
    id: "pending-rule",
    operation: "add",
    created_by: "mcp-agent",
    evidence: [{
      source: "src/example.ts",
      revision: "abc123",
      observed_fact: "The implementation uses the repository-specific behavior.",
      validator: "npm test",
    }],
    rationale: "Preserve a reusable project-specific constraint.",
    proposed_entry: entrySource({
      id: "pending-rule",
      title: "Use the pending repository rule",
      triggers: ["pending-only-needle"],
    }),
    ...overrides,
  };
}

async function initializeWithEntry(repository, entry) {
  assert.equal((await invokeCli(["init"], repository)).exitCode, 0);
  const input = join(repository, `${entry.id}.md`);
  await writeFile(input, entrySource(entry), "utf8");
  const add = await invokeCli(["add", input], repository);
  assert.equal(add.exitCode, 0, add.stderr);
  await rm(input);
}

async function connect(root) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpPath, "--root", root],
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.setEncoding("utf8");
  transport.stderr?.on("data", (chunk) => { stderr += chunk; });
  const client = new Client({ name: "common-knowledge-tests", version: "1.0.0" });
  await client.connect(transport);
  return { client, stderr: () => stderr };
}

test("discovers typed MCP tools and performs successful read operations", async () => {
  const repository = await makeRepository();
  await initializeWithEntry(repository, {
    id: "project-test-command",
    title: "Use the focused project test command",
    triggers: ["focused tests", "test command"],
  });
  const connection = await connect(repository);
  try {
    const listed = await connection.client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), [
      "proposal_create",
      "proposal_discard",
      "proposal_edit",
      "proposal_list",
      "proposal_read",
      "read",
      "search",
      "validate",
    ]);
    for (const tool of listed.tools) {
      assert.equal(
        tool.annotations.readOnlyHint,
        ["proposal_list", "proposal_read", "read", "search", "validate"].includes(tool.name),
      );
      assert.ok(tool.outputSchema);
    }
    const createTool = listed.tools.find((tool) => tool.name === "proposal_create");
    assert.deepEqual(Object.keys(createTool.inputSchema.properties).sort(), [
      "created_by",
      "evidence",
      "id",
      "operation",
      "proposed_entry",
      "rationale",
      "retirement_reason",
      "target_id",
    ]);
    assert.deepEqual(createTool.inputSchema.required.sort(), [
      "created_by",
      "evidence",
      "id",
      "operation",
      "rationale",
    ]);

    const search = await connection.client.callTool({
      name: "search",
      arguments: { query: "focused tests", path: "src/example.ts" },
    });
    assert.equal(search.structuredContent.status, "ok");
    assert.equal(search.structuredContent.results[0].id, "project-test-command");

    const read = await connection.client.callTool({
      name: "read",
      arguments: { id: "project-test-command" },
    });
    assert.equal(read.structuredContent.status, "ok");
    assert.match(read.structuredContent.entry, /Use the focused project test command/u);

    const validate = await connection.client.callTool({ name: "validate", arguments: {} });
    assert.deepEqual(validate.structuredContent, { status: "ok", entry_count: 1 });
    assert.match(connection.stderr(), /Common Knowledge MCP bound to/u);
  } finally {
    await connection.client.close();
  }
});

test("returns distinct typed outcomes for empty, missing, invalid, absent, and contended reads", async () => {
  const repository = await makeRepository();
  const missingConnection = await connect(repository);
  try {
    const missing = await missingConnection.client.callTool({
      name: "search",
      arguments: { query: "anything" },
    });
    assert.equal(missing.structuredContent.status, "missing_corpus");
  } finally {
    await missingConnection.client.close();
  }

  await initializeWithEntry(repository, {
    id: "known-entry",
    title: "Use the known repository rule",
    triggers: ["known rule"],
  });
  const connection = await connect(repository);
  try {
    const noMatch = await connection.client.callTool({
      name: "search",
      arguments: { query: "unrelated phrase" },
    });
    assert.deepEqual(noMatch.structuredContent, { status: "no_match", results: [] });

    const absent = await connection.client.callTool({
      name: "read",
      arguments: { id: "absent-entry" },
    });
    assert.equal(absent.structuredContent.status, "not_found");

    await writeFile(join(repository, ".repo-memory.lock"), "{}\n", "utf8");
    const contended = await connection.client.callTool({
      name: "validate",
      arguments: {},
    });
    assert.equal(contended.structuredContent.status, "lock_contention");
    await rm(join(repository, ".repo-memory.lock"));

    await writeFile(
      join(repository, ".repo-memory", "entries", "known-entry.md"),
      "---\nid: known-entry\n---\ninvalid\n",
      "utf8",
    );
    const invalid = await connection.client.callTool({
      name: "search",
      arguments: { query: "known rule" },
    });
    assert.equal(invalid.structuredContent.status, "invalid_entry");
  } finally {
    await connection.client.close();
  }
});

test("proposal MCP tools round trip exact revisions without changing accepted knowledge", async () => {
  const repository = await makeRepository();
  await initializeWithEntry(repository, {
    id: "accepted-rule",
    title: "Use the accepted repository rule",
    triggers: ["accepted rule"],
  });
  const logPath = join(repository, ".repo-memory", "log.md");
  const logBefore = await readFile(logPath, "utf8");
  const acceptedPath = join(repository, ".repo-memory", "entries", "accepted-rule.md");
  const acceptedBefore = await readFile(acceptedPath, "utf8");
  const connection = await connect(repository);
  try {
    const created = await connection.client.callTool({
      name: "proposal_create",
      arguments: proposalArguments(),
    });
    assert.equal(created.structuredContent.status, "ok");
    assert.equal(created.structuredContent.proposal.summary.status, "proposed");
    assert.match(created.structuredContent.proposal.summary.revision, /^sha256:[a-f0-9]{64}$/u);
    const firstRevision = created.structuredContent.proposal.summary.revision;

    const listed = await connection.client.callTool({ name: "proposal_list", arguments: {} });
    assert.equal(listed.structuredContent.proposals[0].id, "pending-rule");
    assert.deepEqual(listed.structuredContent.proposals[0].diagnostics, []);

    const read = await connection.client.callTool({
      name: "proposal_read",
      arguments: { id: "pending-rule" },
    });
    assert.equal(read.structuredContent.proposal.summary.revision, firstRevision);
    assert.match(read.structuredContent.proposal.source, /## Proposed Entry/u);
    assert.doesNotMatch(
      read.structuredContent.proposal.source,
      /## Future use|## Applicability|## Assumptions|## Intended destination/u,
    );

    const pendingSearch = await connection.client.callTool({
      name: "search",
      arguments: { query: "pending-only-needle" },
    });
    assert.deepEqual(pendingSearch.structuredContent, { status: "no_match", results: [] });

    const staleEdit = await connection.client.callTool({
      name: "proposal_edit",
      arguments: {
        ...proposalArguments({ rationale: "Revised rationale." }),
        created_by: undefined,
        expected_revision: `sha256:${"0".repeat(64)}`,
        revised_by: "mcp-editor",
      },
    });
    assert.equal(staleEdit.structuredContent.status, "stale_revision");

    const edited = await connection.client.callTool({
      name: "proposal_edit",
      arguments: {
        ...proposalArguments({ rationale: "Revised rationale." }),
        created_by: undefined,
        expected_revision: firstRevision,
        revised_by: "mcp-editor",
      },
    });
    assert.equal(edited.structuredContent.status, "ok");
    const secondRevision = edited.structuredContent.proposal.summary.revision;
    assert.notEqual(secondRevision, firstRevision);

    const staleDiscard = await connection.client.callTool({
      name: "proposal_discard",
      arguments: { id: "pending-rule", expected_revision: firstRevision },
    });
    assert.equal(staleDiscard.structuredContent.status, "stale_revision");
    const discarded = await connection.client.callTool({
      name: "proposal_discard",
      arguments: { id: "pending-rule", expected_revision: secondRevision },
    });
    assert.deepEqual(discarded.structuredContent, {
      status: "ok",
      proposal_id: "pending-rule",
    });

    assert.equal(await readFile(logPath, "utf8"), logBefore);
    assert.equal(await readFile(acceptedPath, "utf8"), acceptedBefore);
  } finally {
    await connection.client.close();
  }
});

test("validates malformed and traversal-shaped tool inputs before engine access", async () => {
  const repository = await makeRepository();
  await initializeWithEntry(repository, {
    id: "safe-entry",
    title: "Keep repository paths contained",
    triggers: ["safe path"],
  });
  const connection = await connect(repository);
  try {
    const traversal = await connection.client.callTool({
      name: "search",
      arguments: { query: "safe path", path: "../other-repository/file.ts" },
    });
    assert.equal(traversal.isError, true);
    const malformedId = await connection.client.callTool({
      name: "read",
      arguments: { id: "../../outside" },
    });
    assert.equal(malformedId.isError, true);
  } finally {
    await connection.client.close();
  }
});

test("binds each server to one checkout and rereads files between operations", async () => {
  const first = await makeRepository();
  const second = await makeRepository();
  await initializeWithEntry(first, {
    id: "first-rule",
    title: "Use the first checkout rule",
    triggers: ["checkout rule"],
  });
  await initializeWithEntry(second, {
    id: "second-rule",
    title: "Use the second checkout rule",
    triggers: ["checkout rule"],
  });
  const firstConnection = await connect(first);
  const secondConnection = await connect(second);
  try {
    const firstSearch = await firstConnection.client.callTool({
      name: "search",
      arguments: { query: "checkout rule" },
    });
    const secondSearch = await secondConnection.client.callTool({
      name: "search",
      arguments: { query: "checkout rule" },
    });
    assert.equal(firstSearch.structuredContent.results[0].id, "first-rule");
    assert.equal(secondSearch.structuredContent.results[0].id, "second-rule");

    const firstPath = join(first, ".repo-memory", "entries", "first-rule.md");
    const current = await readFile(firstPath, "utf8");
    await writeFile(
      firstPath,
      current.replace("checkout rule", "branch edit cue"),
      "utf8",
    );
    const reread = await firstConnection.client.callTool({
      name: "search",
      arguments: { query: "branch edit cue" },
    });
    assert.equal(reread.structuredContent.results[0].id, "first-rule");
  } finally {
    await Promise.all([firstConnection.client.close(), secondConnection.client.close()]);
  }
});

test("resolves configured subdirectories and keeps linked worktrees distinct", async () => {
  const repository = await makeRepository();
  await mkdir(join(repository, "src"));
  await writeFile(join(repository, "README.md"), "root\n", "utf8");
  await git(repository, "add", "README.md");
  await git(repository, "commit", "-q", "-m", "initial");
  const linked = await temporaryDirectory("common-knowledge-worktree-");
  await rm(linked, { recursive: true, force: true });
  temporaryDirectories.push(linked);
  await git(repository, "worktree", "add", "-q", "-b", "linked-test", linked);

  assert.equal(resolveCheckoutRoot(join(repository, "src")), await realpath(repository));
  assert.equal(resolveCheckoutRoot(linked), await realpath(linked));
  assert.notEqual(resolveCheckoutRoot(linked), resolveCheckoutRoot(repository));
  await git(repository, "worktree", "remove", "--force", linked);
});

test("rejects non-Git, symbolic-link, and submodule root arrangements", async () => {
  const nonGit = await temporaryDirectory("common-knowledge-nongit-");
  assert.throws(() => resolveCheckoutRoot(nonGit), UnsupportedCheckoutRootError);

  const repository = await makeRepository();
  const link = join(dirname(repository), `${repository.split("/").at(-1)}-link`);
  temporaryDirectories.push(link);
  await symlink(repository, link);
  assert.throws(() => resolveCheckoutRoot(link), /must not use symbolic links/u);
  assert.throws(
    () => resolveCheckoutRoot(join(link, "src")),
    /must not use symbolic links/u,
  );

  const child = await makeRepository();
  await writeFile(join(child, "README.md"), "child\n", "utf8");
  await git(child, "add", "README.md");
  await git(child, "commit", "-q", "-m", "child");
  await git(
    repository,
    "-c",
    "protocol.file.allow=always",
    "submodule",
    "add",
    "-q",
    child,
    "vendor/child",
  );
  assert.throws(
    () => resolveCheckoutRoot(join(repository, "vendor", "child")),
    /submodule roots are unsupported/u,
  );
});

test("reports insufficient checkout permissions as a typed outcome", async () => {
  const repository = await makeRepository();
  await initializeWithEntry(repository, {
    id: "permissions-rule",
    title: "Grant the checkout lock permission",
    triggers: ["permissions"],
  });
  const connection = await connect(repository);
  try {
    await chmod(repository, 0o555);
    const result = await connection.client.callTool({
      name: "validate",
      arguments: {},
    });
    assert.equal(result.structuredContent.status, "permission_denied");
    const proposal = await connection.client.callTool({
      name: "proposal_create",
      arguments: proposalArguments(),
    });
    assert.equal(proposal.structuredContent.status, "permission_denied");
  } finally {
    await chmod(repository, 0o755);
    await connection.client.close();
  }
});
