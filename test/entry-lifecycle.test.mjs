import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, test } from "node:test";
import { parse } from "yaml";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(projectRoot, "dist", "cli.js");
const temporaryDirectories = [];
const activityLogPreamble =
  "# Common Knowledge Activity Log\n\n" +
  "Entry activity is appended below, grouped by UTC date. Git remains the authoritative audit trail.\n";

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function makeRepository() {
  const cwd = await mkdtemp(join(tmpdir(), "common-knowledge-lifecycle-"));
  temporaryDirectories.push(cwd);
  const initialized = await invoke(["init"], cwd);
  assert.equal(initialized.exitCode, 0);
  return cwd;
}

function invoke(args, cwd, options = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (exitCode, signal) =>
      resolveResult({ exitCode, signal, stdout, stderr }),
    );
  });
}

function entrySource(overrides = {}, body) {
  const metadata = {
    schema_version: 1,
    id: "database-startup",
    kind: "gotcha",
    title: "Start the database before migrations",
    triggers: ["P3006", "migrate dev"],
    scope: { paths: ["apps/api/**"] },
    status: "active",
    created_at: "2026-08-24T12:00:00Z",
    created_by: "agent-a",
    sources: ["docs/database.md"],
    ...overrides,
  };
  const yaml = Object.entries(metadata)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n");
  return `---\n${yaml}\n---\n${
    body ??
    "## Situation\n\nMigrations fail if the database is unavailable.\n\n## Resolution\n\nStart the database first.\n"
  }`;
}

function metadataFrom(source) {
  const match = /^---\n([\s\S]*?)\n---/.exec(source);
  assert.ok(match);
  return parse(match[1]);
}

async function writeInput(cwd, source, name = "input.md") {
  const path = join(cwd, name);
  await writeFile(path, source, "utf8");
  return name;
}

async function add(cwd, overrides = {}, name = "input.md") {
  await writeInput(cwd, entrySource(overrides), name);
  return invoke(["add", name], cwd);
}

async function writeFsPreload(cwd, source, name) {
  const preload = join(cwd, name);
  await writeFile(preload, source, "utf8");
  return {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(preload).href}`.trim(),
  };
}

async function startHeldAdd(cwd) {
  await writeInput(cwd, entrySource(), "held-input.md");
  const signal = join(cwd, "lock-acquired.signal");
  const release = join(cwd, "release.signal");
  const environment = await writeFsPreload(
    cwd,
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
    "hold-lock.mjs",
  );
  environment.CK_LOCK_SIGNAL = signal;
  environment.CK_LOCK_RELEASE = release;
  const completion = invoke(["add", "held-input.md"], cwd, { env: environment });
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
  assert.fail(`first CLI mutation did not acquire the checkout lock: ${early.stderr}`);
}

test("add, read, validate, and activity logging round trip at the CLI seam", async () => {
  const cwd = await makeRepository();
  const source = entrySource();
  await writeInput(cwd, source);

  assert.deepEqual(await invoke(["add", "input.md"], cwd), {
    exitCode: 0,
    signal: null,
    stdout: "Added Entry database-startup.\n",
    stderr: "",
  });
  const storedPath = join(cwd, ".repo-memory", "entries", "database-startup.md");
  const stored = await readFile(storedPath, "utf8");
  const read = await invoke(["read", "database-startup"], cwd);
  assert.equal(read.exitCode, 0);
  assert.equal(read.stdout, stored);
  assert.match(read.stdout, /## Situation[\s\S]*## Resolution/);
  assert.deepEqual(await readdir(join(cwd, ".repo-memory", "entries")), [
    "database-startup.md",
  ]);

  const validated = await invoke(["validate"], cwd);
  assert.equal(validated.exitCode, 0);
  assert.equal(validated.stdout, "Corpus is valid (1 Entries).\n");
  const log = await readFile(join(cwd, ".repo-memory", "log.md"), "utf8");
  const event = log.split("\n").find((line) => line.startsWith("- "));
  assert.ok(event);
  assert.equal(event.split(" | ").length, 5);
  assert.match(event, /entry\.created \| database-startup \| agent-a \| Created:/);
  assert.ok(event.split(" | ")[4].length <= 160);
});

test("add rejects schema errors, malformed YAML, missing sections, and duplicate IDs concisely", async () => {
  const cwd = await makeRepository();
  const cases = [
    {
      name: "schema.md",
      source: entrySource({ kind: "unsupported" }),
      diagnostic: /metadata\/kind must be equal to one of the allowed values/,
    },
    {
      name: "yaml.md",
      source: "---\nid: [broken\n---\n## Situation\n\nX\n\n## Resolution\n\nY\n",
      diagnostic: /malformed YAML front matter/,
    },
    {
      name: "section.md",
      source: entrySource({}, "## Situation\n\nOnly one section.\n"),
      diagnostic: /missing required Markdown section "## Resolution"/,
    },
  ];
  for (const item of cases) {
    await writeInput(cwd, item.source, item.name);
    const result = await invoke(["add", item.name], cwd);
    assert.equal(result.exitCode, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, item.diagnostic);
    assert.ok(result.stderr.length < 400);
  }

  assert.equal((await add(cwd)).exitCode, 0);
  const duplicate = await add(cwd, {}, "duplicate.md");
  assert.equal(duplicate.exitCode, 1);
  assert.match(duplicate.stderr, /already exists/);
  assert.deepEqual(await readdir(join(cwd, ".repo-memory", "entries")), [
    "database-startup.md",
  ]);
});

test("required Markdown headings inside fenced code blocks do not count as sections", async () => {
  const cwd = await makeRepository();
  await writeInput(
    cwd,
    entrySource(
      {},
      "```markdown\n## Situation\n\nExample only.\n\n## Resolution\n\nExample only.\n```\n",
    ),
  );

  const result = await invoke(["add", "input.md"], cwd);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /missing required Markdown section "## Situation"/);
  assert.deepEqual(await readdir(join(cwd, ".repo-memory", "entries")), []);
});

test("CommonMark ATX closing sequences are accepted on required section headings", async () => {
  const cwd = await makeRepository();
  await writeInput(
    cwd,
    entrySource(
      {},
      "## Situation ##\n\nMigrations fail if the database is unavailable.\n\n## Resolution ###\n\nStart it first.\n",
    ),
  );

  const result = await invoke(["add", "input.md"], cwd);

  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal((await invoke(["validate"], cwd)).exitCode, 0);
});

test("required Markdown headings inside HTML comments and raw blocks do not count", async () => {
  for (const body of [
    "<!--\n## Situation\n\n## Resolution\n-->\n",
    "<pre>\n## Situation\n\n## Resolution\n</pre>\n",
    "<div>\n## Situation\n## Resolution\n</div>\n",
    '<div class="note"> trailing content\n## Situation\n## Resolution\n\n',
  ]) {
    const cwd = await makeRepository();
    await writeInput(cwd, entrySource({}, body));

    const result = await invoke(["add", "input.md"], cwd);

    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /missing required Markdown section "## Situation"/);
    assert.deepEqual(await readdir(join(cwd, ".repo-memory", "entries")), []);
  }
});

test("add enforces the initialized repository schema as the normative metadata contract", async () => {
  const cwd = await makeRepository();
  const schemaPath = join(cwd, ".repo-memory", "schema.json");
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  schema.properties.title.maxLength = 10;
  await writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
  await writeInput(cwd, entrySource());

  const result = await invoke(["add", "input.md"], cwd);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /metadata\/title must NOT have more than 10 characters/);
  assert.deepEqual(await readdir(join(cwd, ".repo-memory", "entries")), []);
});

test("technical periods remain valid and unchanged in generated activity summaries", async () => {
  const cwd = await makeRepository();
  const title = "Node.js v20.20.2 reads package.json and README.md";
  assert.equal((await add(cwd, { title })).exitCode, 0);
  let log = await readFile(join(cwd, ".repo-memory", "log.md"), "utf8");
  assert.match(log, /Created: Node\.js v20\.20\.2 reads package\.json and README\.md\./);
  assert.doesNotMatch(log, /Node;js|package;json|README;md|v20;20/);

  const reason = "Node.js support for package.json v1.2.3 is no longer needed.";
  const retired = await invoke(
    ["retire", "database-startup", "--reason", reason],
    cwd,
  );
  assert.equal(retired.exitCode, 0);
  log = await readFile(join(cwd, ".repo-memory", "log.md"), "utf8");
  assert.match(log, /Node\.js support for package\.json v1\.2\.3 is no longer needed\./);
  const another = await makeRepository();
  assert.equal((await add(another)).exitCode, 0);
  const abbreviation = await invoke(
    ["retire", "database-startup", "--reason", "Use e.g. PostgreSQL for this workflow."],
    another,
  );
  assert.equal(abbreviation.exitCode, 0);
  const aspRepository = await makeRepository();
  assert.equal((await add(aspRepository)).exitCode, 0);
  const asp = await invoke(
    ["retire", "database-startup", "--reason", "Use ASP.NET for this workflow."],
    aspRepository,
  );
  assert.equal(asp.exitCode, 0, asp.stderr);
  for (const technicalTitle of [
    "Use .NET for this workflow",
    "Validate schema.yaml before release",
    "Call api.example.com for status",
    "Compile file.ts before execution",
  ]) {
    const technicalRepository = await makeRepository();
    const added = await add(technicalRepository, { title: technicalTitle });
    assert.equal(added.exitCode, 0, `${technicalTitle}: ${added.stderr}`);
    assert.equal((await invoke(["validate"], technicalRepository)).exitCode, 0);
  }
  assert.equal((await invoke(["validate"], cwd)).exitCode, 0);
});

test("read and update reject missing Entries with actionable diagnostics", async () => {
  const cwd = await makeRepository();
  const read = await invoke(["read", "missing-entry"], cwd);
  assert.equal(read.exitCode, 1);
  assert.match(read.stderr, /Entry "missing-entry" does not exist/);

  await writeInput(cwd, entrySource({ id: "missing-entry" }), "update.md");
  const update = await invoke(["update", "update.md"], cwd);
  assert.equal(update.exitCode, 1);
  assert.match(update.stderr, /Entry "missing-entry" does not exist/);
});

test("read rejects an individual Entry symlink that resolves outside the Corpus", async () => {
  const cwd = await makeRepository();
  assert.equal((await add(cwd)).exitCode, 0);
  const stored = join(cwd, ".repo-memory", "entries", "database-startup.md");
  const externalDirectory = await mkdtemp(join(dirname(cwd), "common-knowledge-read-external-"));
  temporaryDirectories.push(externalDirectory);
  const external = join(externalDirectory, "outside.md");
  await rename(stored, external);
  await symlink(external, stored);
  const original = await readFile(external, "utf8");

  const result = await invoke(["read", "database-startup"], cwd);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /Entry path .* must not use symbolic links/);
  assert.equal(result.stdout, "");
  assert.equal(await readFile(external, "utf8"), original);
});

test("validate rejects a linked entries directory without following it", async () => {
  const cwd = await makeRepository();
  const entries = join(cwd, ".repo-memory", "entries");
  const external = await mkdtemp(join(dirname(cwd), "common-knowledge-validate-entries-"));
  temporaryDirectories.push(external);
  await rm(entries, { recursive: true });
  await symlink(external, entries);

  const result = await invoke(["validate"], cwd);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /Corpus entries directory must be an ordinary directory without symbolic links/);
  assert.deepEqual(await readdir(external), []);
});

test("validate rejects an Entry swapped to an external symlink after enumeration", async () => {
  const cwd = await makeRepository();
  assert.equal((await add(cwd)).exitCode, 0);
  const stored = join(cwd, ".repo-memory", "entries", "database-startup.md");
  const externalDirectory = await mkdtemp(join(dirname(cwd), "common-knowledge-validate-swap-"));
  temporaryDirectories.push(externalDirectory);
  const external = join(externalDirectory, "outside.md");
  const original = await readFile(stored, "utf8");
  const environment = await writeFsPreload(
    cwd,
    `import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
const originalReaddir = fs.readdirSync.bind(fs);
let swapped = false;
fs.readdirSync = (path, options) => {
  const result = originalReaddir(path, options);
  if (!swapped && String(path).endsWith("/.repo-memory/entries") && options?.withFileTypes) {
    swapped = true;
    fs.renameSync(process.env.CK_ENTRY_PATH, process.env.CK_EXTERNAL_ENTRY);
    fs.symlinkSync(process.env.CK_EXTERNAL_ENTRY, process.env.CK_ENTRY_PATH);
  }
  return result;
};
syncBuiltinESMExports();
`,
    "validation-entry-swap.mjs",
  );
  environment.CK_ENTRY_PATH = stored;
  environment.CK_EXTERNAL_ENTRY = external;

  const result = await invoke(["validate"], cwd, { env: environment });

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /Entry path .* must not use symbolic links/);
  assert.equal(await readFile(external, "utf8"), original);
});

test("update preserves creation provenance, sets a UTC updated_at, and rejects lifecycle transitions", async () => {
  const cwd = await makeRepository();
  assert.equal((await add(cwd)).exitCode, 0);
  await writeInput(
    cwd,
    entrySource({
      title: "Start the database profile before migrations",
      created_at: "2030-01-01T00:00:00Z",
      created_by: "replacement-author",
    }),
    "update.md",
  );
  const before = Date.now();
  const result = await invoke(["update", "update.md"], cwd);
  const after = Date.now();
  assert.equal(result.exitCode, 0);
  const stored = await readFile(
    join(cwd, ".repo-memory", "entries", "database-startup.md"),
    "utf8",
  );
  const metadata = metadataFrom(stored);
  assert.equal(metadata.created_at, "2026-08-24T12:00:00Z");
  assert.equal(metadata.created_by, "agent-a");
  assert.ok(Date.parse(metadata.updated_at) >= before);
  assert.ok(Date.parse(metadata.updated_at) <= after);
  assert.match(stored, /Start the database profile before migrations/);
  const log = await readFile(join(cwd, ".repo-memory", "log.md"), "utf8");
  assert.match(log, /entry\.updated \| database-startup \| agent-a/);

  await writeInput(cwd, entrySource({ status: "retired" }), "transition.md");
  const transition = await invoke(["update", "transition.md"], cwd);
  assert.equal(transition.exitCode, 1);
  assert.match(transition.stderr, /update cannot change status/);
});

test("retire changes only active Entries, timestamps the change, and validates its reason", async () => {
  const cwd = await makeRepository();
  assert.equal((await add(cwd)).exitCode, 0);
  const result = await invoke(
    ["retire", "database-startup", "--reason", "Migration tooling no longer needs a database."],
    cwd,
  );
  assert.equal(result.exitCode, 0);
  const stored = await readFile(
    join(cwd, ".repo-memory", "entries", "database-startup.md"),
    "utf8",
  );
  const metadata = metadataFrom(stored);
  assert.equal(metadata.status, "retired");
  assert.match(metadata.updated_at, /Z$/);
  const log = await readFile(join(cwd, ".repo-memory", "log.md"), "utf8");
  assert.match(log, /entry\.retired \| database-startup \| agent-a \| Migration tooling/);

  const repeat = await invoke(
    ["retire", "database-startup", "--reason", "Still obsolete."],
    cwd,
  );
  assert.equal(repeat.exitCode, 1);
  assert.match(repeat.stderr, /cannot be retired because it is retired/);
  const badReason = await invoke(
    ["retire", "database-startup", "--reason", "contains | delimiter"],
    cwd,
  );
  assert.equal(badReason.exitCode, 1);
  assert.match(badReason.stderr, /delimiter-free/);
  const multipleSentences = await invoke(
    ["retire", "database-startup", "--reason", "First reason. Second reason."],
    cwd,
  );
  assert.equal(multipleSentences.exitCode, 1);
  assert.match(multipleSentences.stderr, /exactly one sentence/);
  for (const reason of [".", "First.Second.", "First.second.", "First reason. second reason."]) {
    const invalidSentence = await invoke(
      ["retire", "database-startup", "--reason", reason],
      cwd,
    );
    assert.equal(invalidSentence.exitCode, 1);
    assert.match(invalidSentence.stderr, /exactly one sentence/);
  }
});

test("created_by values incompatible with the activity-log grammar are rejected unchanged", async () => {
  for (const created_by of ["agent|b", " agent "]) {
    const cwd = await makeRepository();
    const originalLog = await readFile(join(cwd, ".repo-memory", "log.md"), "utf8");
    await writeInput(cwd, entrySource({ created_by }));

    const result = await invoke(["add", "input.md"], cwd);

    assert.equal(result.exitCode, 1, created_by);
    assert.match(result.stderr, /metadata\/created_by must have no surrounding whitespace or "\|" activity-log delimiter/);
    assert.deepEqual(await readdir(join(cwd, ".repo-memory", "entries")), []);
    assert.equal(await readFile(join(cwd, ".repo-memory", "log.md"), "utf8"), originalLog);
  }
});

test("supersession validates first, updates both Entries, and emits both required events", async () => {
  const cwd = await makeRepository();
  assert.equal((await add(cwd)).exitCode, 0);
  const before = await readFile(
    join(cwd, ".repo-memory", "entries", "database-startup.md"),
    "utf8",
  );
  const logBefore = await readFile(join(cwd, ".repo-memory", "log.md"), "utf8");

  const missing = await add(
    cwd,
    { id: "new-guidance", supersedes: "does-not-exist", created_by: "agent-b" },
    "missing-predecessor.md",
  );
  assert.equal(missing.exitCode, 1);
  assert.match(missing.stderr, /does-not-exist.*does not exist/);
  assert.equal(
    await readFile(join(cwd, ".repo-memory", "entries", "database-startup.md"), "utf8"),
    before,
  );
  assert.equal(await readFile(join(cwd, ".repo-memory", "log.md"), "utf8"), logBefore);
  assert.deepEqual(await readdir(join(cwd, ".repo-memory", "entries")), [
    "database-startup.md",
  ]);

  const successor = await add(
    cwd,
    {
      id: "new-guidance",
      title: "Use the migration service profile",
      supersedes: "database-startup",
      created_by: "agent-b",
    },
    "successor.md",
  );
  assert.equal(successor.exitCode, 0);
  const predecessor = metadataFrom(
    await readFile(
      join(cwd, ".repo-memory", "entries", "database-startup.md"),
      "utf8",
    ),
  );
  assert.equal(predecessor.status, "superseded");
  assert.match(predecessor.updated_at, /Z$/);
  const log = await readFile(join(cwd, ".repo-memory", "log.md"), "utf8");
  assert.match(log, /entry\.superseded \| database-startup \| agent-b \| Superseded by new-guidance\./);
  assert.match(log, /entry\.created \| new-guidance \| agent-b/);
  assert.equal((await invoke(["validate"], cwd)).exitCode, 0);

  const invalidTransition = await add(
    cwd,
    { id: "third-guidance", supersedes: "database-startup" },
    "third.md",
  );
  assert.equal(invalidTransition.exitCode, 1);
  assert.match(invalidTransition.stderr, /cannot be superseded because it is superseded/);
});

test("validate reports flat-path, cross-Entry, timestamp, and activity-log violations", async () => {
  const cases = [
    {
      name: "mismatched flat path",
      mutate: async (cwd) => {
        await writeFile(
          join(cwd, ".repo-memory", "entries", "wrong-name.md"),
          entrySource(),
          "utf8",
        );
      },
      diagnostic: /requires flat path entries\/database-startup\.md/,
    },
    {
      name: "nested Entry directory",
      mutate: async (cwd) => {
        const nested = join(cwd, ".repo-memory", "entries", "nested");
        await mkdir(nested);
        await writeFile(join(nested, "hidden.md"), entrySource(), "utf8");
      },
      diagnostic: /nested directories and non-file content are not allowed/,
    },
    {
      name: "duplicate global ID",
      mutate: async (cwd) => {
        await writeFile(
          join(cwd, ".repo-memory", "entries", "first.md"),
          entrySource(),
          "utf8",
        );
        await writeFile(
          join(cwd, ".repo-memory", "entries", "second.md"),
          entrySource(),
          "utf8",
        );
      },
      diagnostic: /duplicate Entry ID "database-startup"/,
    },
    {
      name: "missing supersession reference",
      mutate: async (cwd) => {
        await writeFile(
          join(cwd, ".repo-memory", "entries", "new-guidance.md"),
          entrySource({ id: "new-guidance", supersedes: "missing-entry" }),
          "utf8",
        );
      },
      diagnostic: /supersedes missing Entry "missing-entry"/,
    },
    {
      name: "supersession cycle",
      mutate: async (cwd) => {
        await writeFile(
          join(cwd, ".repo-memory", "entries", "alpha.md"),
          entrySource({ id: "alpha", status: "superseded", supersedes: "beta" }),
          "utf8",
        );
        await writeFile(
          join(cwd, ".repo-memory", "entries", "beta.md"),
          entrySource({ id: "beta", status: "superseded", supersedes: "alpha" }),
          "utf8",
        );
      },
      diagnostic: /supersession cycle detected: alpha -> beta -> alpha/,
    },
    {
      name: "invalid calendar timestamp",
      mutate: async (cwd) => {
        await writeFile(
          join(cwd, ".repo-memory", "entries", "database-startup.md"),
          entrySource({ created_at: "2026-02-31T12:00:00Z" }),
          "utf8",
        );
      },
      diagnostic: /created_at must be a valid RFC 3339 UTC timestamp/,
    },
    {
      name: "multiple title sentences",
      mutate: async (cwd) => {
        await writeFile(
          join(cwd, ".repo-memory", "entries", "database-startup.md"),
          entrySource({ title: "First lesson. Second lesson." }),
          "utf8",
        );
      },
      diagnostic: /metadata\/title must contain exactly one sentence/,
    },
    {
      name: "wrong log date and event type",
      mutate: async (cwd) => {
        await writeFile(
          join(cwd, ".repo-memory", "entries", "database-startup.md"),
          entrySource(),
          "utf8",
        );
        await writeFile(
          join(cwd, ".repo-memory", "log.md"),
          `${activityLogPreamble}\n## 2026-08-23\n\n- 2026-08-24T00:00:00Z | entry.deleted | database-startup | agent | Removed.\n`,
          "utf8",
        );
      },
      diagnostic: /timestamp date must match heading[\s\S]*unsupported event type/,
    },
    {
      name: "bad field count and missing reference",
      mutate: async (cwd) => {
        await writeFile(
          join(cwd, ".repo-memory", "entries", "database-startup.md"),
          entrySource(),
          "utf8",
        );
        await writeFile(
          join(cwd, ".repo-memory", "log.md"),
          `${activityLogPreamble}\n## 2026-08-24\n\n- too | few | fields\n- 2026-08-24T00:00:00Z | entry.updated | absent-entry | agent | Updated.\n`,
          "utf8",
        );
      },
      diagnostic: /exactly five fields[\s\S]*referenced Entry "absent-entry" does not exist/,
    },
    {
      name: "overlong summary",
      mutate: async (cwd) => {
        await writeFile(
          join(cwd, ".repo-memory", "entries", "database-startup.md"),
          entrySource(),
          "utf8",
        );
        await writeFile(
          join(cwd, ".repo-memory", "log.md"),
          `${activityLogPreamble}\n## 2026-08-24\n\n- 2026-08-24T00:00:00Z | entry.updated | database-startup | agent | ${"x".repeat(161)}\n`,
          "utf8",
        );
      },
      diagnostic: /activity summary must be 160 characters or fewer/,
    },
    {
      name: "multiple summary sentences",
      mutate: async (cwd) => {
        await writeFile(
          join(cwd, ".repo-memory", "entries", "database-startup.md"),
          entrySource(),
          "utf8",
        );
        await writeFile(
          join(cwd, ".repo-memory", "log.md"),
          `${activityLogPreamble}\n## 2026-08-24\n\n- 2026-08-24T00:00:00Z | entry.updated | database-startup | agent | First sentence. Second sentence.\n`,
          "utf8",
        );
      },
      diagnostic: /activity summary must be exactly one sentence/,
    },
    {
      name: "invalid activity H2 heading",
      mutate: async (cwd) => {
        await writeFile(
          join(cwd, ".repo-memory", "log.md"),
          `${activityLogPreamble}\n## not-a-date\n`,
          "utf8",
        );
      },
      diagnostic: /invalid UTC date heading "## not-a-date"/,
    },
    {
      name: "indented activity H2 heading",
      mutate: async (cwd) => {
        await writeFile(
          join(cwd, ".repo-memory", "log.md"),
          `${activityLogPreamble}\n  ## 2026-08-24\n`,
          "utf8",
        );
      },
      diagnostic: /invalid UTC date heading "  ## 2026-08-24"/,
    },
    {
      name: "arbitrary content before first date heading",
      mutate: async (cwd) => {
        await writeFile(
          join(cwd, ".repo-memory", "log.md"),
          `${activityLogPreamble}\nImplementation narration.\n`,
          "utf8",
        );
      },
      diagnostic: /unexpected content; expected a UTC date heading/,
    },
    {
      name: "punctuation-only summary",
      mutate: async (cwd) => {
        await writeFile(
          join(cwd, ".repo-memory", "entries", "database-startup.md"),
          entrySource(),
          "utf8",
        );
        await writeFile(
          join(cwd, ".repo-memory", "log.md"),
          `${activityLogPreamble}\n## 2026-08-24\n\n- 2026-08-24T00:00:00Z | entry.updated | database-startup | agent | .\n`,
          "utf8",
        );
      },
      diagnostic: /activity summary must be exactly one sentence/,
    },
    {
      name: "no-space multiple summary sentences",
      mutate: async (cwd) => {
        await writeFile(
          join(cwd, ".repo-memory", "entries", "database-startup.md"),
          entrySource(),
          "utf8",
        );
        await writeFile(
          join(cwd, ".repo-memory", "log.md"),
          `${activityLogPreamble}\n## 2026-08-24\n\n- 2026-08-24T00:00:00Z | entry.updated | database-startup | agent | First.Second.\n`,
          "utf8",
        );
      },
      diagnostic: /activity summary must be exactly one sentence/,
    },
    {
      name: "padded activity actor",
      mutate: async (cwd) => {
        await writeFile(
          join(cwd, ".repo-memory", "entries", "database-startup.md"),
          entrySource(),
          "utf8",
        );
        await writeFile(
          join(cwd, ".repo-memory", "log.md"),
          `${activityLogPreamble}\n## 2026-08-24\n\n- 2026-08-24T00:00:00Z | entry.updated | database-startup |  agent  | Updated.\n`,
          "utf8",
        );
      },
      diagnostic: /actor must not have surrounding whitespace/,
    },
  ];

  for (const item of cases) {
    const cwd = await makeRepository();
    await item.mutate(cwd);
    const result = await invoke(["validate"], cwd);
    assert.equal(result.exitCode, 1, item.name);
    assert.match(result.stderr, item.diagnostic, item.name);
  }
});

test("commands fail without a Corpus and never create or mutate non-Corpus files", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "common-knowledge-no-corpus-"));
  temporaryDirectories.push(cwd);
  await writeFile(join(cwd, "sentinel.txt"), "unchanged", "utf8");
  await writeInput(cwd, entrySource());
  for (const args of [
    ["add", "input.md"],
    ["read", "database-startup"],
    ["validate"],
  ]) {
    const result = await invoke(args, cwd);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /Corpus not found.*run common-knowledge init first/);
  }
  assert.equal(await readFile(join(cwd, "sentinel.txt"), "utf8"), "unchanged");
});

test("a malformed existing activity log blocks mutation without partial changes", async () => {
  const cwd = await makeRepository();
  const logPath = join(cwd, ".repo-memory", "log.md");
  const malformedLog = `${activityLogPreamble}\n## 2026-08-24\n\n- too | few | fields\n`;
  await writeFile(logPath, malformedLog, "utf8");
  await writeInput(cwd, entrySource());

  const result = await invoke(["add", "input.md"], cwd);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /activity event must contain exactly five fields/);
  assert.equal(await readFile(logPath, "utf8"), malformedLog);
  assert.deepEqual(await readdir(join(cwd, ".repo-memory", "entries")), []);
});

test("future-dated log headings block add, update, and retire before mutation", async () => {
  for (const command of ["add", "update", "retire"]) {
    const cwd = await makeRepository();
    const logPath = join(cwd, ".repo-memory", "log.md");
    if (command !== "add") {
      assert.equal((await add(cwd)).exitCode, 0);
    }
    const existingLog = await readFile(logPath, "utf8");
    const futureLog = `${existingLog}\n## 2099-01-01\n`;
    await writeFile(logPath, futureLog, "utf8");

    let args;
    if (command === "add") {
      await writeInput(cwd, entrySource());
      args = ["add", "input.md"];
    } else if (command === "update") {
      await writeInput(cwd, entrySource({ title: "Updated guidance" }), "update.md");
      args = ["update", "update.md"];
    } else {
      args = ["retire", "database-startup", "--reason", "No longer applicable."];
    }
    const entryPath = join(cwd, ".repo-memory", "entries", "database-startup.md");
    const beforeEntry = command === "add" ? undefined : await readFile(entryPath, "utf8");

    const result = await invoke(args, cwd);

    assert.equal(result.exitCode, 1, command);
    assert.match(result.stderr, /candidate activity log is invalid/);
    assert.match(result.stderr, /UTC date headings must be chronological/);
    assert.equal(await readFile(logPath, "utf8"), futureLog);
    if (beforeEntry === undefined) {
      assert.deepEqual(await readdir(join(cwd, ".repo-memory", "entries")), []);
    } else {
      assert.equal(await readFile(entryPath, "utf8"), beforeEntry);
    }
  }
});

test("a cooperating mutation excludes a second mutation without Corpus changes", async () => {
  const cwd = await makeRepository();
  const logPath = join(cwd, ".repo-memory", "log.md");
  const originalLog = await readFile(logPath, "utf8");
  await writeInput(cwd, entrySource({ id: "second-entry" }), "second-input.md");
  const held = await startHeldAdd(cwd);

  const result = await invoke(["add", "second-input.md"], cwd);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /checkout lock .* is held.*retry after the other command finishes/i);
  assert.deepEqual(await readdir(join(cwd, ".repo-memory", "entries")), []);
  assert.equal(await readFile(logPath, "utf8"), originalLog);

  const completed = await held.release();
  assert.equal(completed.exitCode, 0, completed.stderr);
  assert.deepEqual(await readdir(join(cwd, ".repo-memory", "entries")), ["database-startup.md"]);
  assert.doesNotMatch((await readdir(cwd)).join("\n"), /^\.repo-memory\.lock$/m);
});

test("read fails with a retry diagnostic while a cooperating mutation holds the lock", async () => {
  const cwd = await makeRepository();
  const held = await startHeldAdd(cwd);

  const result = await invoke(["read", "database-startup"], cwd);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /checkout lock .* is held.*retry after the other command finishes/i);
  assert.equal((await held.release()).exitCode, 0);
});

test("validate fails with a retry diagnostic while a cooperating mutation holds the lock", async () => {
  const cwd = await makeRepository();
  const held = await startHeldAdd(cwd);

  const result = await invoke(["validate"], cwd);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /checkout lock .* is held.*retry after the other command finishes/i);
  assert.equal((await held.release()).exitCode, 0);
});

test("stale checkout lock recovery is explicit", async () => {
  const cwd = await makeRepository();
  const lock = join(cwd, ".repo-memory.lock");
  await writeFile(
    lock,
    `${JSON.stringify({ pid: 999999, command: "add", created_at: "2026-08-24T12:00:00Z" })}\n`,
    "utf8",
  );

  const blocked = await invoke(["validate"], cwd);
  assert.equal(blocked.exitCode, 1);
  assert.match(blocked.stderr, /pid 999999.*remove the stale \.repo-memory\.lock file and retry/i);
  await rm(lock);
  assert.equal((await invoke(["validate"], cwd)).exitCode, 0);
});

test("command failures release the checkout lock", async () => {
  const cwd = await makeRepository();

  await writeInput(cwd, "not an Entry\n", "malformed.md");
  const failed = await invoke(["add", "malformed.md"], cwd);
  assert.equal(failed.exitCode, 1);
  assert.doesNotMatch((await readdir(cwd)).join("\n"), /^\.repo-memory\.lock$/m);
});

test("normal mutation success leaves no lock or external recovery artifact", async () => {
  const cwd = await makeRepository();
  const parent = dirname(cwd);
  const before = new Set(
    (await readdir(parent)).filter((name) => name.startsWith(".common-knowledge-transaction-")),
  );

  const result = await add(cwd);

  assert.equal(result.exitCode, 0, result.stderr);
  assert.doesNotMatch((await readdir(cwd)).join("\n"), /^\.repo-memory\.lock$/m);
  const retained = (await readdir(parent)).filter(
    (name) => name.startsWith(".common-knowledge-transaction-") && !before.has(name),
  );
  assert.deepEqual(retained, []);
});

test("post-commit cleanup failure reports retained recovery outside a valid Corpus", async () => {
  const cwd = await makeRepository();
  assert.equal((await add(cwd)).exitCode, 0);
  const corpus = join(cwd, ".repo-memory");
  const originalLog = await readFile(join(corpus, "log.md"), "utf8");
  await writeInput(cwd, entrySource({ title: "Updated database startup guidance" }), "update.md");
  const environment = await writeFsPreload(
    cwd,
    `import fs from "node:fs";
const original = fs.rmSync.bind(fs);
fs.rmSync = (path, options) => {
  if (String(path).includes(".common-knowledge-transaction-")) throw new Error("injected recovery cleanup failure");
  return original(path, options);
};
`,
    "cleanup-failure.mjs",
  );
  const before = new Set(
    (await readdir(dirname(cwd))).filter((name) => name.startsWith(".common-knowledge-transaction-")),
  );

  const result = await invoke(["update", "update.md"], cwd, { env: environment });

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /transaction committed, but recovery cleanup failed.*Corpus changes remain applied.*external recovery evidence is retained at/);
  const retained = (await readdir(dirname(cwd))).filter(
    (name) => name.startsWith(".common-knowledge-transaction-") && !before.has(name),
  );
  assert.equal(retained.length, 1);
  const retainedDirectory = join(dirname(cwd), retained[0]);
  temporaryDirectories.push(retainedDirectory);
  assert.match(relative(cwd, retainedDirectory), /^\.\./);
  const retainedFiles = await readdir(retainedDirectory);
  assert.ok(retainedFiles.some((name) => name.endsWith("log.md.backup")));
  const retainedLog = retainedFiles.find((name) => name.endsWith("log.md.backup"));
  assert.equal(await readFile(join(retainedDirectory, retainedLog), "utf8"), originalLog);
  assert.deepEqual((await readdir(join(corpus, "entries"))).sort(), [
    "database-startup.md",
  ]);
  assert.deepEqual((await readdir(corpus)).sort(), [
    "README.md",
    "entries",
    "log.md",
    "schema.json",
  ]);
  assert.equal((await invoke(["validate"], cwd)).exitCode, 0);
});

test("symlinked Corpus components cannot redirect CLI writes outside the repository", async () => {
  for (const component of ["corpus", "entries"]) {
    const cwd = await makeRepository();
    const externalParent = await mkdtemp(join(dirname(cwd), "common-knowledge-external-"));
    temporaryDirectories.push(externalParent);
    const corpus = join(cwd, ".repo-memory");
    const source = component === "corpus" ? corpus : join(corpus, "entries");
    const external = join(externalParent, component);
    await rename(source, external);
    await symlink(external, source);
    await writeInput(cwd, entrySource());
    const beforeExternal = await readdir(external);
    const logPath = component === "corpus" ? join(external, "log.md") : join(corpus, "log.md");
    const beforeLog = await readFile(logPath, "utf8");
    const beforeTransactions = new Set(
      (await readdir(dirname(cwd))).filter((name) => name.startsWith(".common-knowledge-transaction-")),
    );

    const result = await invoke(["add", "input.md"], cwd);

    assert.equal(result.exitCode, 1, component);
    assert.match(result.stderr, /uses symbolic-link component|ordinary directory without symbolic links/, component);
    assert.deepEqual(await readdir(external), beforeExternal, component);
    assert.equal(await readFile(logPath, "utf8"), beforeLog, component);
    const afterTransactions = (await readdir(dirname(cwd))).filter(
      (name) => name.startsWith(".common-knowledge-transaction-"),
    );
    assert.deepEqual(afterTransactions.filter((name) => !beforeTransactions.has(name)), []);
  }
});

test("hostile temporary-directory variables cannot place recovery inside the Corpus", async () => {
  const cwd = await makeRepository();
  const entriesDirectory = join(cwd, ".repo-memory", "entries");
  await writeInput(cwd, entrySource());

  const result = await invoke(["add", "input.md"], cwd, {
    env: {
      ...process.env,
      TMPDIR: entriesDirectory,
      TMP: entriesDirectory,
      TEMP: entriesDirectory,
    },
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(await readdir(entriesDirectory), ["database-startup.md"]);
  assert.equal((await invoke(["validate"], cwd)).exitCode, 0);
});

test("CLI commit-phase failure rolls back replaced Entries and a new target", async () => {
  const cwd = await makeRepository();
  assert.equal((await add(cwd)).exitCode, 0);
  const entriesDirectory = join(cwd, ".repo-memory", "entries");
  const predecessorPath = join(entriesDirectory, "database-startup.md");
  const logPath = join(cwd, ".repo-memory", "log.md");
  const originalPredecessor = await readFile(predecessorPath, "utf8");
  const originalLog = await readFile(logPath, "utf8");
  await writeInput(
    cwd,
    entrySource({
      id: "new-guidance",
      supersedes: "database-startup",
      created_by: "agent-b",
    }),
    "successor.md",
  );

  const corpus = join(cwd, ".repo-memory");
  const transactionParent = dirname(cwd);
  const beforeTransactions = new Set(
    (await readdir(transactionParent)).filter((name) =>
      name.startsWith(".common-knowledge-transaction-"),
    ),
  );
  await chmod(corpus, 0o555);
  let result;
  try {
    result = await invoke(["add", "successor.md"], cwd);
  } finally {
    await chmod(corpus, 0o755);
  }

  assert.equal(result.exitCode, 1);
  assert.match(
    result.stderr,
    /transaction failed after installing 2 of 3 targets:[\s\S]*rollback completed/,
  );
  assert.equal(await readFile(predecessorPath, "utf8"), originalPredecessor);
  assert.equal(await readFile(logPath, "utf8"), originalLog);
  assert.deepEqual(await readdir(entriesDirectory), ["database-startup.md"]);
  assert.equal((await invoke(["validate"], cwd)).exitCode, 0);
  const afterTransactions = (await readdir(transactionParent)).filter((name) =>
    name.startsWith(".common-knowledge-transaction-"),
  );
  assert.deepEqual(
    afterTransactions.filter((name) => !beforeTransactions.has(name)),
    [],
  );
});

test("incomplete restoration reports both failures and retains external evidence", async () => {
  const cwd = await makeRepository();
  assert.equal((await add(cwd)).exitCode, 0);
  const entry = join(cwd, ".repo-memory", "entries", "database-startup.md");
  const log = join(cwd, ".repo-memory", "log.md");
  const originalEntry = await readFile(entry, "utf8");
  const originalLog = await readFile(log, "utf8");
  await writeInput(
    cwd,
    entrySource({ id: "new-guidance", supersedes: "database-startup", created_by: "agent-b" }),
    "successor.md",
  );
  const environment = await writeFsPreload(
    cwd,
    `import fs from "node:fs";
const original = fs.renameSync.bind(fs);
let installCount = 0;
fs.renameSync = (source, destination) => {
  const sourcePath = String(source);
  const destinationPath = String(destination);
  if (sourcePath.endsWith(".staged")) {
    installCount += 1;
    if (installCount === 3) throw new Error("injected later install failure");
  }
  if (sourcePath.endsWith(".backup") && destinationPath.endsWith("database-startup.md")) {
    throw new Error("injected restoration failure");
  }
  return original(source, destination);
};
`,
    "restoration-failure.mjs",
  );

  const result = await invoke(["add", "successor.md"], cwd, { env: environment });

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /transaction failed: injected later install failure/);
  assert.match(result.stderr, /rollback incomplete:.*injected restoration failure/);
  const recoveryMatch = /original recovery copies retained at (.+)\n/.exec(result.stderr);
  assert.ok(recoveryMatch);
  const recoveryDirectory = recoveryMatch[1].trim();
  temporaryDirectories.push(recoveryDirectory);
  assert.match(relative(cwd, recoveryDirectory), /^\.\./);
  const recoveryFiles = await readdir(recoveryDirectory);
  const entryBackup = recoveryFiles.find((name) => name.endsWith("database-startup.md.backup"));
  assert.ok(entryBackup);
  assert.equal(await readFile(join(recoveryDirectory, entryBackup), "utf8"), originalEntry);
  assert.equal(await readFile(log, "utf8"), originalLog);
  assert.deepEqual(await readdir(join(cwd, ".repo-memory", "entries")), []);
  assert.deepEqual((await readdir(join(cwd, ".repo-memory"))).sort(), [
    "README.md",
    "entries",
    "log.md",
    "schema.json",
  ]);
});
