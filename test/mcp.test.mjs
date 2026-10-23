import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

async function connect(root, env) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpPath, "--root", root],
    stderr: "pipe",
    ...(env === undefined ? {} : { env }),
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
      "proposal_apply",
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

async function applyFixture(operation, preloadSource = "") {
  const repository = await makeRepository();
  assert.equal((await invokeCli(["init"], repository)).exitCode, 0);
  const proposed = proposalArguments();
  if (operation !== "add") {
    await writeFile(join(repository, ".repo-memory/entries/pending-rule.md"), proposed.proposed_entry);
  }
  if (operation === "update") {
    proposed.proposed_entry = proposed.proposed_entry.replace("Use the pending repository rule", "Use the updated repository rule");
  } else if (operation === "supersede") {
    proposed.proposed_entry = proposed.proposed_entry.replace("id: pending-rule", "id: replacement-rule\nsupersedes: pending-rule");
  } else if (operation === "retire") {
    delete proposed.proposed_entry;
    proposed.target_id = "pending-rule";
    proposed.retirement_reason = "The behavior was removed.";
  }
  proposed.operation = operation;
  let environment;
  if (preloadSource) {
    const preload = join(repository, "filesystem-fault.mjs");
    await writeFile(preload, `import fs from "node:fs";\nimport { syncBuiltinESMExports } from "node:module";\n${preloadSource}\nsyncBuiltinESMExports();\n`);
    environment = {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(preload).href}`.trim(),
    };
  }
  // Draft creation completes before fault injection is activated.
  const drafting = await connect(repository);
  let created;
  try {
    created = (await drafting.client.callTool({ name: "proposal_create", arguments: proposed })).structuredContent;
    assert.equal(created.status, "ok", created.message);
  } finally {
    await drafting.client.close();
  }
  const connection = await connect(repository, environment);
  const args = { id: "pending-rule", expected_revision: created.proposal.summary.revision, applied_by: "session-applying-actor" };
  return { repository, connection, args, proposed, created };
}

async function corpusState(repository) {
  const corpus = join(repository, ".repo-memory");
  const state = {};
  for (const directory of ["entries", "proposals"]) {
    for (const name of await readdir(join(corpus, directory))) {
      state[`${directory}/${name}`] = await readFile(join(corpus, directory, name), "utf8");
    }
  }
  state.log = await readFile(join(corpus, "log.md"), "utf8");
  return state;
}

async function applyCall(fixture, overrides = {}) {
  return fixture.connection.client.callTool({ name: "proposal_apply", arguments: { ...fixture.args, ...overrides } });
}

test("proposal_apply advertises only exact acceptance inputs and distinguishes stale and invalid outcomes", async () => {
  const fixture = await applyFixture("update");
  const { connection, repository } = fixture;
  try {
    const tools = await connection.client.listTools();
    const apply = tools.tools.find((tool) => tool.name === "proposal_apply");
    assert.deepEqual(Object.keys(apply.inputSchema.properties).sort(), ["applied_by", "expected_revision", "id"]);
    assert.deepEqual(apply.inputSchema.required.sort(), ["applied_by", "expected_revision", "id"]);
    assert.equal(apply.inputSchema.additionalProperties, false);
    const before = await corpusState(repository);
    for (const invalid of [
      { id: "../escape" }, { expected_revision: "not-a-digest" }, { applied_by: " bad " },
      { applied_by: "bad|actor" }, { applied_by: 123 }, { approval: true }, { root: "/tmp" },
    ]) {
      const result = await applyCall(fixture, invalid);
      assert.equal(result.isError, true, JSON.stringify(invalid));
      assert.deepEqual(await corpusState(repository), before);
    }
    const stale = await applyCall(fixture, { expected_revision: `sha256:${"0".repeat(64)}` });
    assert.equal(stale.structuredContent.status, "stale_revision");
    assert.deepEqual(await corpusState(repository), before);
    const target = join(repository, ".repo-memory/entries/pending-rule.md");
    await writeFile(target, before["entries/pending-rule.md"].replace("Use the pending", "Use the changed"));
    const changed = await corpusState(repository);
    assert.equal((await applyCall(fixture)).structuredContent.status, "stale_target");
    assert.deepEqual(await corpusState(repository), changed);
    await writeFile(target, before["entries/pending-rule.md"]);
    const proposal = join(repository, ".repo-memory/proposals/pending-rule.md");
    await writeFile(proposal, "invalid proposal\n");
    const read = await connection.client.callTool({ name: "proposal_read", arguments: { id: "pending-rule" } });
    const invalid = await applyCall(fixture, { expected_revision: read.structuredContent.proposal.summary.revision });
    assert.equal(invalid.structuredContent.status, "invalid_proposal");
  } finally {
    await connection.client.close();
  }
});

test("all four cleanup failures retain applied state and cannot replay a lifecycle event", async () => {
  for (const operation of ["add", "update", "supersede", "retire"]) {
    const fixture = await applyFixture(operation, `
const originalUnlink = fs.unlinkSync.bind(fs);
fs.unlinkSync = (path) => {
  if (String(path).endsWith("/proposals/pending-rule.md")) {
    if (!fs.existsSync(new URL(".repo-memory.lock", "file://" + process.cwd() + "/"))) throw new Error("cleanup escaped operation lock");
    throw Object.assign(new Error("injected proposal removal denial"), { code: "EACCES" });
  }
  return originalUnlink(path);
};`);
    const { connection, repository } = fixture;
    try {
      const before = await corpusState(repository);
      const applied = (await applyCall(fixture)).structuredContent;
      assert.equal(applied.status, "applied_cleanup_required", operation);
      assert.match(applied.message, /Entry\/log changes remain applied.*inspect.*discard/u);
      const after = await corpusState(repository);
      assert.equal(after["proposals/pending-rule.md"], before["proposals/pending-rule.md"]);
      const events = after.log.split("\n").filter((line) => line.startsWith("- "));
      assert.equal(events.length, operation === "supersede" ? 2 : 1);
      assert.ok(events.every((line) => line.includes(" | session-applying-actor | ")));
      assert.equal((await applyCall(fixture)).structuredContent.status, "stale_target", operation);
      assert.deepEqual(await corpusState(repository), after);
      assert.equal((await connection.client.callTool({ name: "validate", arguments: {} })).structuredContent.status, "ok");
      // Explicit inspection/discard from an unfaulted process removes only residue.
      const cleanup = await connect(repository);
      try {
        const read = await cleanup.client.callTool({ name: "proposal_read", arguments: { id: fixture.args.id } });
        assert.ok(read.structuredContent.proposal.summary.diagnostics.length > 0);
        assert.equal((await cleanup.client.callTool({ name: "proposal_discard", arguments: {
          id: fixture.args.id, expected_revision: fixture.args.expected_revision,
        } })).structuredContent.status, "ok");
        const cleaned = await corpusState(repository);
        delete after["proposals/pending-rule.md"];
        assert.deepEqual(cleaned, after);
      } finally { await cleanup.client.close(); }
    } finally { await connection.client.close(); }
  }
});

test("identical-content update in the same clock tick still makes retained proposal stale", async () => {
  const fixture = await applyFixture("add");
  const { connection, repository } = fixture;
  try {
    assert.equal((await applyCall(fixture)).structuredContent.status, "ok");
  } finally { await connection.client.close(); }
  const entryPath = join(repository, ".repo-memory/entries/pending-rule.md");
  const timestamp = new Date().toISOString();
  const source = (await readFile(entryPath, "utf8")).replace("status: active", `updated_at: ${timestamp}\nstatus: active`);
  await writeFile(entryPath, source);
  const draft = await connect(repository);
  let pending;
  try {
    pending = await draft.client.callTool({ name: "proposal_create", arguments: proposalArguments({
      operation: "update", proposed_entry: source,
    }) });
    assert.equal(pending.structuredContent.status, "ok");
  } finally { await draft.client.close(); }
  const preload = join(repository, "fixed-clock.mjs");
  await writeFile(preload, `import fs from "node:fs";\nDate.now = () => ${Date.parse(timestamp)};\nconst unlink = fs.unlinkSync.bind(fs);\nfs.unlinkSync = (path) => { if (String(path).endsWith("/proposals/pending-rule.md")) throw new Error("retain proposal"); return unlink(path); };\nimport { syncBuiltinESMExports } from "node:module";\nsyncBuiltinESMExports();\n`);
  const fixed = await connect(repository, { ...process.env, NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` });
  const accepted = { connection: fixed, args: { ...fixture.args, expected_revision: pending.structuredContent.proposal.summary.revision } };
  try {
    assert.equal((await applyCall(accepted)).structuredContent.status, "applied_cleanup_required");
    const after = await corpusState(repository);
    assert.notEqual(after["entries/pending-rule.md"], source);
    assert.equal((await applyCall(accepted)).structuredContent.status, "stale_target");
    assert.deepEqual(await corpusState(repository), after);
  } finally { await fixed.client.close(); }
});

test("process interruption after lifecycle commit retains a stale proposal without duplicate effects", async () => {
  const fixture = await applyFixture("supersede", `
const unlink = fs.unlinkSync.bind(fs);
fs.unlinkSync = (path) => {
  if (String(path).endsWith("/proposals/pending-rule.md")) process.exit(86);
  return unlink(path);
};`);
  try {
    await assert.rejects(applyCall(fixture), /closed/u);
  } finally { await fixture.connection.client.close(); }
  const after = await corpusState(fixture.repository);
  assert.match(after["entries/pending-rule.md"], /status: superseded/u);
  assert.ok(after["entries/replacement-rule.md"]);
  assert.equal(after.log.split("entry.created").length - 1, 1);
  // The exited process no longer owns the stale lock: perform documented manual recovery.
  await rm(join(fixture.repository, ".repo-memory.lock"));
  const retry = await connect(fixture.repository);
  try {
    assert.equal((await retry.client.callTool({ name: "proposal_apply", arguments: fixture.args })).structuredContent.status, "stale_target");
    assert.deepEqual(await corpusState(fixture.repository), after);
  } finally { await retry.client.close(); }
});

test("Entry/log install failure rolls back exactly and retains the proposal for a safe retry", async () => {
  for (const operation of ["add", "update", "supersede", "retire"]) {
    const fixture = await applyFixture(operation, `
const rename = fs.renameSync.bind(fs);
fs.renameSync = (source, target) => {
  if (String(source).endsWith(".staged") && String(target).endsWith("/log.md")) throw new Error("injected log installation failure");
  return rename(source, target);
};`);
    const before = await corpusState(fixture.repository);
    try {
      const result = (await applyCall(fixture)).structuredContent;
      assert.equal(result.status, "operation_failed", operation);
      assert.match(result.message, /transaction failed after installing .*rollback completed/u);
      assert.deepEqual(await corpusState(fixture.repository), before);
    } finally { await fixture.connection.client.close(); }
    const retry = await connect(fixture.repository);
    try {
      assert.equal((await retry.client.callTool({ name: "proposal_apply", arguments: fixture.args })).structuredContent.status, "ok");
    } finally { await retry.client.close(); }
  }
});

test("ambiguous rollback and transaction recovery cleanup preserve existing recovery diagnostics", async () => {
  for (const mode of ["rollback", "committed-cleanup"]) {
    const fault = mode === "rollback" ? `
const rename = fs.renameSync.bind(fs);
fs.renameSync = (source, target) => {
  if (String(source).endsWith(".staged") && String(target).endsWith("/log.md")) throw new Error("injected log failure");
  if (String(source).endsWith(".backup")) throw new Error("injected restoration failure");
  return rename(source, target);
};` : `
const rm = fs.rmSync.bind(fs);
fs.rmSync = (path, options) => {
  if (String(path).includes(".common-knowledge-transaction-")) throw new Error("injected recovery cleanup failure");
  return rm(path, options);
};`;
    const fixture = await applyFixture("supersede", fault);
    const before = await corpusState(fixture.repository);
    try {
      const result = (await applyCall(fixture)).structuredContent;
      assert.equal(result.status, "operation_failed");
      const match = /(?:original recovery copies retained at |external recovery evidence is retained at )(.+)$/u.exec(result.message);
      assert.ok(match, result.message);
      const recovery = match[1];
      temporaryDirectories.push(recovery);
      assert.equal(dirname(recovery), dirname(fixture.repository));
      const files = await readdir(recovery);
      assert.ok(files.some((name) => name.endsWith("pending-rule.md.backup")));
      const backup = files.find((name) => name.endsWith("pending-rule.md.backup"));
      assert.equal(await readFile(join(recovery, backup), "utf8"), before["entries/pending-rule.md"]);
      const after = await corpusState(fixture.repository);
      assert.equal(after["proposals/pending-rule.md"], before["proposals/pending-rule.md"]);
      if (mode === "rollback") {
        assert.match(result.message, /rollback incomplete/u);
        assert.equal(after.log, before.log);
        assert.deepEqual(Object.keys(after).sort(), ["log", "proposals/pending-rule.md"]);
      } else {
        assert.match(result.message, /transaction committed.*Corpus changes remain applied/u);
        assert.match(after["entries/pending-rule.md"], /status: superseded/u);
        assert.ok(after["entries/replacement-rule.md"]);
        assert.equal(after.log.split("entry.created").length - 1, 1);
        assert.equal((await applyCall(fixture)).structuredContent.status, "stale_target");
        assert.deepEqual(await corpusState(fixture.repository), after);
      }
    } finally { await fixture.connection.client.close(); }
  }
});

test("apply respects proposal, target, parent-staging, and checkout permission boundaries", async () => {
  const fixture = await applyFixture("update");
  const corpus = join(fixture.repository, ".repo-memory");
  const target = join(corpus, "entries/pending-rule.md");
  const proposal = join(corpus, "proposals/pending-rule.md");
  const before = await corpusState(fixture.repository);
  try {
    for (const path of [proposal, target]) {
      await chmod(path, 0o000);
      try { assert.equal((await applyCall(fixture)).structuredContent.status, "permission_denied"); }
      finally { await chmod(path, 0o644); }
      assert.deepEqual(await corpusState(fixture.repository), before);
    }
    await chmod(fixture.repository, 0o555);
    try { assert.equal((await applyCall(fixture)).structuredContent.status, "permission_denied"); }
    finally { await chmod(fixture.repository, 0o755); }
    const external = await temporaryDirectory();
    const externalFile = join(external, "outside.md");
    await writeFile(externalFile, before["entries/pending-rule.md"]);
    await rm(target);
    await symlink(externalFile, target);
    assert.equal((await applyCall(fixture)).structuredContent.status, "invalid_proposal");
    assert.equal(await readFile(externalFile, "utf8"), before["entries/pending-rule.md"]);
    await rm(target);
    await writeFile(target, before["entries/pending-rule.md"]);
    await rm(proposal);
    await symlink(externalFile, proposal);
    assert.equal((await applyCall(fixture)).structuredContent.status, "invalid_proposal");
    assert.equal(await readFile(externalFile, "utf8"), before["entries/pending-rule.md"]);
  } finally { await fixture.connection.client.close(); }

  const parent = await temporaryDirectory();
  const child = join(parent, "checkout");
  await mkdir(child);
  await git(child, "init", "-q", "-b", "main");
  assert.equal((await invokeCli(["init"], child)).exitCode, 0);
  const connection = await connect(child);
  try {
    const created = await connection.client.callTool({ name: "proposal_create", arguments: proposalArguments() });
    const state = await corpusState(child);
    await chmod(parent, 0o555);
    try {
      const result = await connection.client.callTool({ name: "proposal_apply", arguments: {
        id: "pending-rule", expected_revision: created.structuredContent.proposal.summary.revision, applied_by: "actor",
      } });
      assert.equal(result.structuredContent.status, "permission_denied");
      assert.deepEqual(await corpusState(child), state);
    } finally { await chmod(parent, 0o755); }
  } finally { await connection.client.close(); }
});

test("apply staging failure leaves Entries, log, and pending proposal byte-identical", async () => {
  const fixture = await applyFixture("supersede", `
const write = fs.writeFileSync.bind(fs);
fs.writeFileSync = (path, ...args) => {
  if (String(path).endsWith(".staged")) throw new Error("injected staging failure");
  return write(path, ...args);
};`);
  const before = await corpusState(fixture.repository);
  try {
    const result = (await applyCall(fixture)).structuredContent;
    assert.equal(result.status, "operation_failed");
    assert.match(result.message, /^injected staging failure$/u);
    assert.deepEqual(await corpusState(fixture.repository), before);
  } finally { await fixture.connection.client.close(); }
});

test("proposal_apply changes only the configured checkout when another root contains the same proposal ID", async () => {
  const first = await applyFixture("add");
  const second = await applyFixture("add");
  const beforeSecond = await corpusState(second.repository);
  try {
    assert.equal((await applyCall(first)).structuredContent.status, "ok");
    assert.deepEqual(await corpusState(second.repository), beforeSecond);
    assert.equal((await second.connection.client.callTool({ name: "search", arguments: { query: "pending-only-needle" } })).structuredContent.status, "no_match");
    assert.equal((await first.connection.client.callTool({ name: "search", arguments: { query: "pending-only-needle" } })).structuredContent.status, "ok");
    assert.equal((await applyCall(second)).structuredContent.status, "ok");
  } finally {
    await first.connection.client.close();
    await second.connection.client.close();
  }
});
