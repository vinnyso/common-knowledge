import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
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
import { afterEach, test } from "node:test";

import { createKnowledgeProposal } from "../dist/application.js";
import { initializeCorpus } from "../dist/corpus.js";
import { searchEntries } from "../dist/entries.js";
import {
  createProposal,
  discardProposal,
  editProposal,
  listProposals,
  readProposal,
} from "../dist/proposals.js";
import { StaleProposalRevisionError } from "../dist/proposal-model.js";

const temporaryDirectories = [];
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function repository() {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "common-knowledge-proposals-")),
  );
  temporaryDirectories.push(directory);
  initializeCorpus(directory);
  return directory;
}

function entrySource(id, overrides = {}) {
  const metadata = {
    schema_version: 1,
    id,
    kind: "gotcha",
    title: `Use the ${id} rule`,
    triggers: [`${id} cue`],
    status: "active",
    created_at: "2026-09-01T12:00:00Z",
    created_by: "proposal-test",
    ...overrides,
  };
  const yaml = Object.entries(metadata)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n");
  return `---\n${yaml}\n---\n## Situation\n\nA recurring condition.\n\n## Resolution\n\nApply the repository rule.\n`;
}

function evidence() {
  return [{
    source: "src/example.ts",
    revision: "abc123",
    observed_fact: "The repository requires the documented behavior.",
    validator: "npm test",
  }];
}

function draft(overrides = {}) {
  return {
    id: "add-rule",
    operation: "add",
    created_by: "agent-a",
    evidence: evidence(),
    rationale: "Preserve the observed project-specific constraint.",
    proposed_entry: entrySource("add-rule"),
    ...overrides,
  };
}

async function installEntry(cwd, id, overrides = {}) {
  const source = entrySource(id, overrides);
  await writeFile(join(cwd, ".repo-memory", "entries", `${id}.md`), source, "utf8");
  return source;
}

function invokeProposalCreate(cwd, input, environment) {
  const applicationUrl = pathToFileURL(join(projectRoot, "dist", "application.js")).href;
  const source =
    `import { createKnowledgeProposal } from ${JSON.stringify(applicationUrl)};` +
    `createKnowledgeProposal(process.cwd(), JSON.parse(process.env.CK_PROPOSAL_INPUT));`;
  return new Promise((resolveResult, reject) => {
    const child = spawn(
      process.execPath,
      ["--input-type=module", "--eval", source],
      {
        cwd,
        env: { ...environment, CK_PROPOSAL_INPUT: JSON.stringify(input) },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (exitCode, signal) =>
      resolveResult({ exitCode, signal, stdout, stderr }),
    );
  });
}

async function startHeldProposalCreate(cwd, input) {
  const signal = join(cwd, "proposal-lock-acquired.signal");
  const release = join(cwd, "proposal-lock-release.signal");
  const preload = join(cwd, "hold-proposal-lock.mjs");
  await writeFile(
    preload,
    `import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
const originalOpen = fs.openSync.bind(fs);
let held = false;
fs.openSync = (path, flags, mode) => {
  const descriptor = originalOpen(path, flags, mode);
  if (!held && String(path).endsWith(".repo-memory.lock") && flags === "wx") {
    held = true;
    fs.writeFileSync(process.env.CK_LOCK_SIGNAL, "held\\n");
    while (!fs.existsSync(process.env.CK_LOCK_RELEASE)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
  return descriptor;
};
syncBuiltinESMExports();
`,
    "utf8",
  );
  const environment = {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(preload).href}`.trim(),
    CK_LOCK_SIGNAL: signal,
    CK_LOCK_RELEASE: release,
  };
  const completion = invokeProposalCreate(cwd, input, environment);
  for (let attempt = 0; attempt < 500; attempt += 1) {
    try {
      await readFile(signal, "utf8");
      return {
        release: async () => {
          await writeFile(release, "release\n", "utf8");
          return completion;
        },
      };
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
  }
  const early = await completion;
  assert.fail(`first proposal mutation did not acquire the checkout lock: ${early.stderr}`);
}

test("create, inspect, edit, and discard preserve proposal isolation and exact revisions", async () => {
  const cwd = await repository();
  const logPath = join(cwd, ".repo-memory", "log.md");
  const logBefore = await readFile(logPath, "utf8");
  const created = createProposal(cwd, draft(), new Date("2026-09-01T12:00:00Z"));

  assert.match(created.summary.revision, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(created.summary.status, "proposed");
  assert.equal(created.summary.operation, "add");
  assert.equal(created.summary.age_days, 0);
  assert.equal(created.summary.assessment_due, false);
  assert.deepEqual(created.summary.diagnostics, []);
  assert.doesNotMatch(created.source, /\r/u);
  assert.match(created.source, /^---\nproposal_version: 1\n/u);
  assert.match(created.source, /\n## Evidence\n/u);
  assert.match(created.source, /\n## Rationale\n/u);
  assert.match(created.source, /\n## Proposed Entry\n\n---\nschema_version: 1\n/u);
  assert.doesNotMatch(created.source, /## Future use|## Applicability|## Assumptions|## Intended destination/u);
  assert.doesNotMatch(created.source, /lineage:/u);
  assert.deepEqual(await readdir(join(cwd, ".repo-memory", "entries")), []);
  assert.equal(await readFile(logPath, "utf8"), logBefore);
  assert.deepEqual(searchEntries(cwd, "add-rule cue"), []);

  assert.equal(
    listProposals(cwd, new Date("2026-09-30T12:00:00Z"))[0].age_days,
    29,
  );
  assert.equal(
    listProposals(cwd, new Date("2026-09-30T12:00:00Z"))[0].assessment_due,
    false,
  );
  assert.equal(
    listProposals(cwd, new Date("2026-10-01T12:00:00Z"))[0].assessment_due,
    true,
  );

  const edited = editProposal(
    cwd,
    {
      ...draft({
        rationale: "Preserve the corrected project-specific constraint.",
        proposed_entry: entrySource("revised-add-rule"),
      }),
      expected_revision: created.summary.revision,
      revised_by: "agent-b",
    },
    new Date("2026-09-02T12:00:00Z"),
  );
  assert.notEqual(edited.summary.revision, created.summary.revision);
  assert.match(edited.source, /created_at: 2026-09-01T12:00:00\.000Z/u);
  assert.match(edited.source, /created_by: agent-a/u);
  assert.match(edited.source, /revised_at: 2026-09-02T12:00:00\.000Z/u);
  assert.match(edited.source, /revised_by: agent-b/u);
  assert.deepEqual(edited.summary.targets, [{ id: "revised-add-rule", state: "absent" }]);
  assert.throws(
    () => discardProposal(cwd, "add-rule", created.summary.revision),
    StaleProposalRevisionError,
  );
  assert.equal(discardProposal(cwd, "add-rule", edited.summary.revision), "add-rule");
  assert.deepEqual(listProposals(cwd), []);
  assert.equal(await readFile(logPath, "utf8"), logBefore);
});

test("all four proposal operations calculate exact target fingerprints and enforce transition shape", async () => {
  const cwd = await repository();
  const updateSource = await installEntry(cwd, "update-rule");
  const oldSource = await installEntry(cwd, "old-rule");
  await installEntry(cwd, "superseding-update-rule", { supersedes: "old-rule" });
  const retireSource = await installEntry(cwd, "retire-rule");
  const logBefore = await readFile(join(cwd, ".repo-memory", "log.md"), "utf8");

  const add = createProposal(cwd, draft({ id: "new-rule", proposed_entry: entrySource("new-rule") }));
  const update = createProposal(cwd, draft({
    id: "update-proposal",
    operation: "update",
    evidence: [{ ...evidence()[0], lineage: "implementation" }],
    proposed_entry: entrySource("update-rule", { title: "Use the updated repository rule" }),
  }));
  const supersede = createProposal(cwd, draft({
    id: "supersede-proposal",
    operation: "supersede",
    proposed_entry: entrySource("replacement-rule", { supersedes: "old-rule" }),
  }));
  createProposal(cwd, draft({
    id: "update-superseding-proposal",
    operation: "update",
    proposed_entry: entrySource("superseding-update-rule", {
      supersedes: "old-rule",
      title: "Use the updated superseding repository rule",
    }),
  }));
  const retire = createProposal(cwd, {
    ...draft({
      id: "retire-proposal",
      operation: "retire",
      target_id: "retire-rule",
    }),
    proposed_entry: undefined,
    retirement_reason: "The behavior no longer exists.",
  });

  const digest = (source) => `sha256:${createHash("sha256").update(source, "utf8").digest("hex")}`;
  assert.deepEqual(add.summary.targets, [{ id: "new-rule", state: "absent" }]);
  assert.deepEqual(update.summary.targets, [{
    id: "update-rule",
    state: "present",
    fingerprint: digest(updateSource),
  }]);
  assert.deepEqual(supersede.summary.targets, [
    { id: "old-rule", state: "present", fingerprint: digest(oldSource) },
    { id: "replacement-rule", state: "absent" },
  ]);
  assert.deepEqual(retire.summary.targets, [{
    id: "retire-rule",
    state: "present",
    fingerprint: digest(retireSource),
  }]);
  assert.equal(update.summary.targets[0].fingerprint, digest(updateSource));
  assert.match(readProposal(cwd, "update-proposal").source, /lineage: implementation/u);
  assert.equal(supersede.summary.targets[0].fingerprint, digest(oldSource));
  assert.equal(retire.summary.targets[0].fingerprint, digest(retireSource));
  assert.equal(await readFile(join(cwd, ".repo-memory", "log.md"), "utf8"), logBefore);
  assert.deepEqual((await readdir(join(cwd, ".repo-memory", "entries"))).sort(), [
    "old-rule.md",
    "retire-rule.md",
    "superseding-update-rule.md",
    "update-rule.md",
  ]);

  await writeFile(
    join(cwd, ".repo-memory", "entries", "update-rule.md"),
    entrySource("update-rule", { title: "Use the externally changed repository rule" }),
    "utf8",
  );
  assert.deepEqual(readProposal(cwd, "update-proposal").summary.diagnostics, [
    "target update-rule fingerprint is stale",
  ]);

  assert.throws(
    () => createProposal(cwd, draft({
      id: "bad-update",
      operation: "update",
      proposed_entry: entrySource("update-rule", { created_by: "different-author" }),
    })),
    /preserve created_at and created_by/u,
  );
  assert.throws(
    () => createProposal(cwd, draft({
      id: "bad-update-adds-supersedes",
      operation: "update",
      proposed_entry: entrySource("update-rule", { supersedes: "old-rule" }),
    })),
    /preserve the supersedes relationship/u,
  );
  assert.throws(
    () => createProposal(cwd, draft({
      id: "bad-update-removes-supersedes",
      operation: "update",
      proposed_entry: entrySource("superseding-update-rule", { supersedes: undefined }),
    })),
    /preserve the supersedes relationship/u,
  );
  assert.throws(
    () => createProposal(cwd, draft({
      id: "bad-update-changes-supersedes",
      operation: "update",
      proposed_entry: entrySource("superseding-update-rule", { supersedes: "retire-rule" }),
    })),
    /preserve the supersedes relationship/u,
  );
  assert.throws(
    () => createProposal(cwd, draft({
      id: "bad-add",
      proposed_entry: entrySource("update-rule"),
    })),
    /must be absent/u,
  );
  assert.throws(
    () => createProposal(cwd, draft({ target_id: "retire-rule" })),
    /without target_id/u,
  );
  assert.throws(
    () => createProposal(cwd, draft({
      id: "bad-add-supersedes",
      proposed_entry: entrySource("bad-add-entry", { supersedes: "old-rule" }),
    })),
    /cannot use a Proposed Entry with supersedes/u,
  );
  assert.throws(
    () => createProposal(cwd, draft({
      id: "bad-supersede",
      operation: "supersede",
      proposed_entry: entrySource("replacement-without-predecessor"),
    })),
    /metadata\/supersedes/u,
  );
  assert.throws(
    () => createProposal(cwd, {
      ...draft({ id: "bad-retire", operation: "retire", target_id: "retire-rule" }),
      retirement_reason: "No longer applies.",
    }),
    /without Proposed Entry/u,
  );
  assert.throws(
    () => createProposal(cwd, {
      ...draft({ id: "missing-retire-target", operation: "retire" }),
      proposed_entry: undefined,
      retirement_reason: "No longer applies.",
    }),
    /require target_id/u,
  );
});

test("malformed and stale proposals remain separate from accepted retrieval", async () => {
  const cwd = await repository();
  await installEntry(cwd, "accepted-rule");
  const valid = createProposal(cwd, draft());
  await writeFile(
    join(cwd, ".repo-memory", "proposals", "malformed.md"),
    "---\nid: malformed\n---\nnot valid\n",
    "utf8",
  );

  const listed = listProposals(cwd);
  assert.equal(listed.length, 2);
  assert.match(listed.find((item) => item.id === "malformed").diagnostics[0], /proposal_version/u);
  const malformedRead = readProposal(cwd, "malformed");
  assert.equal(malformedRead.summary.status, "proposed");
  assert.match(malformedRead.summary.diagnostics[0], /proposal_version/u);
  assert.match(malformedRead.summary.revision, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(searchEntries(cwd, "accepted-rule cue")[0].id, "accepted-rule");
  assert.equal(
    discardProposal(cwd, "malformed", malformedRead.summary.revision),
    "malformed",
  );

  const proposalPath = join(cwd, ".repo-memory", "proposals", "add-rule.md");
  const manuallyEdited = (await readFile(proposalPath, "utf8")).replace(
    "Preserve the observed project-specific constraint.",
    "Preserve the manually revised project-specific constraint.",
  );
  await writeFile(proposalPath, manuallyEdited, "utf8");
  const reread = readProposal(cwd, "add-rule");
  assert.notEqual(reread.summary.revision, valid.summary.revision);
  assert.throws(
    () => editProposal(cwd, {
      ...draft(),
      expected_revision: valid.summary.revision,
      revised_by: "agent-b",
    }),
    StaleProposalRevisionError,
  );
  await writeFile(
    proposalPath,
    manuallyEdited.replace(/^created_at: .*$/mu, "created_at: 2099-01-01T00:00:00Z"),
    "utf8",
  );
  assert.match(readProposal(cwd, "add-rule").summary.diagnostics[0], /must not be in the future/u);
});

test("existing Corpora gain a safe proposals directory and reject linked or traversing targets", async () => {
  const cwd = await repository();
  await rm(join(cwd, ".repo-memory", "proposals"), { recursive: true });
  assert.deepEqual(listProposals(cwd), []);
  createProposal(cwd, draft());
  assert.deepEqual(await readdir(join(cwd, ".repo-memory", "proposals")), ["add-rule.md"]);

  assert.throws(
    () => createProposal(cwd, draft({ id: "../../outside" })),
    /invalid proposal ID/u,
  );

  const external = await mkdtemp(join(dirname(cwd), "common-knowledge-external-proposals-"));
  temporaryDirectories.push(external);
  await rm(join(cwd, ".repo-memory", "proposals"), { recursive: true });
  await symlink(external, join(cwd, ".repo-memory", "proposals"));
  assert.throws(() => listProposals(cwd), /ordinary directory without symbolic links/u);
});

test("simultaneous proposal mutations are isolated by the cooperative checkout lock", async () => {
  const cwd = await repository();
  const logPath = join(cwd, ".repo-memory", "log.md");
  const logBefore = await readFile(logPath, "utf8");
  const held = await startHeldProposalCreate(
    cwd,
    draft({
      id: "held-rule",
      proposed_entry: entrySource("held-rule"),
    }),
  );
  assert.throws(
    () => createKnowledgeProposal(
      cwd,
      draft({
        id: "competing-rule",
        proposed_entry: entrySource("competing-rule"),
      }),
    ),
    /checkout lock .* is held/u,
  );
  assert.deepEqual(await readdir(join(cwd, ".repo-memory", "proposals")), []);
  assert.deepEqual(await readdir(join(cwd, ".repo-memory", "entries")), []);
  assert.equal(await readFile(logPath, "utf8"), logBefore);

  assert.deepEqual(await held.release(), {
    exitCode: 0,
    signal: null,
    stdout: "",
    stderr: "",
  });
  assert.deepEqual(await readdir(join(cwd, ".repo-memory", "proposals")), ["held-rule.md"]);
  assert.deepEqual(await readdir(join(cwd, ".repo-memory", "entries")), []);
  assert.equal(await readFile(logPath, "utf8"), logBefore);
  await assert.rejects(readFile(join(cwd, ".repo-memory.lock"), "utf8"), { code: "ENOENT" });
});
