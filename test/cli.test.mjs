import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";
import { spawn } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(projectRoot, "dist", "cli.js");
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function makeTestWorkingDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "common-knowledge-cli-"));
  temporaryDirectories.push(directory);
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
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode, signal) => {
      resolveResult({ exitCode, signal, stdout, stderr });
    });
  });
}

test("prints useful help without a command", async () => {
  const cwd = await makeTestWorkingDirectory();

  const result = await invokeCli([], cwd);

  assert.equal(result.exitCode, 0);
  assert.equal(result.signal, null);
  assert.match(result.stdout, /^Usage: common-knowledge <command>/);
  assert.equal(result.stderr, "");
  for (const command of [
    "init",
    "search",
    "read",
    "add",
    "update",
    "retire",
    "validate",
  ]) {
    assert.match(result.stdout, new RegExp(`\\b${command}\\b`));
  }
  assert.deepEqual(await readdir(cwd), []);
});

test("initializes the exact Corpus layout in the explicit working directory", async () => {
  const cwd = await makeTestWorkingDirectory();

  const result = await invokeCli(["init"], cwd);

  assert.deepEqual(result, {
    exitCode: 0,
    signal: null,
    stdout: "Initialized Common Knowledge corpus at .repo-memory.\n",
    stderr: "",
  });
  assert.deepEqual((await readdir(cwd)).sort(), [".repo-memory"]);

  const corpusPath = join(cwd, ".repo-memory");
  assert.deepEqual((await readdir(corpusPath)).sort(), [
    "README.md",
    "entries",
    "log.md",
    "schema.json",
  ]);
  assert.deepEqual(await readdir(join(corpusPath, "entries")), []);

  const readme = await readFile(join(corpusPath, "README.md"), "utf8");
  assert.match(readme, /repository-local source of truth/);
  assert.match(readme, /repository-level knowledge protocol/);
  assert.match(readme, /AGENTS\.md/);
  assert.match(readme, /Do not copy Entries into this file/);
  assert.doesNotMatch(readme, /^---$/m);

  assert.equal(
    await readFile(join(corpusPath, "log.md"), "utf8"),
    "# Common Knowledge Activity Log\n\n" +
      "Entry activity is appended below, grouped by UTC date. Git remains the authoritative audit trail.\n",
  );
});

test("generates the normative version 1 Entry front-matter schema", async () => {
  const cwd = await makeTestWorkingDirectory();
  await invokeCli(["init"], cwd);

  const schema = JSON.parse(
    await readFile(join(cwd, ".repo-memory", "schema.json"), "utf8"),
  );

  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, [
    "schema_version",
    "id",
    "kind",
    "title",
    "triggers",
    "status",
    "created_at",
    "created_by",
  ]);
  assert.deepEqual(Object.keys(schema.properties).sort(), [
    "created_at",
    "created_by",
    "id",
    "kind",
    "schema_version",
    "scope",
    "sources",
    "status",
    "supersedes",
    "title",
    "triggers",
    "updated_at",
  ]);
  assert.deepEqual(schema.properties.schema_version, {
    type: "integer",
    const: 1,
    description: "Entry schema version. The prototype uses version 1.",
  });
  assert.equal(schema.properties.id.pattern, "^[a-z0-9]+(?:-[a-z0-9]+)*$");
  assert.deepEqual(schema.properties.kind.enum, [
    "gotcha",
    "pattern",
    "anti-pattern",
    "debugging-note",
  ]);
  assert.equal(schema.properties.title.minLength, 1);
  assert.equal(schema.properties.triggers.minItems, 1);
  assert.deepEqual(schema.properties.status.enum, [
    "active",
    "superseded",
    "retired",
  ]);
  assert.equal(schema.properties.created_at.format, "date-time");
  assert.match(schema.properties.created_at.pattern, /Z\$$/);
  assert.equal(schema.properties.created_by.minLength, 1);
  assert.deepEqual(schema.properties.scope.required, ["paths"]);
  assert.equal(schema.properties.scope.additionalProperties, false);
  assert.equal(schema.properties.scope.properties.paths.type, "array");
  assert.equal(schema.properties.sources.minItems, 1);
  assert.equal(schema.properties.updated_at.format, "date-time");
  assert.equal(schema.properties.supersedes.pattern, schema.properties.id.pattern);
});

test("refuses to overwrite an existing Corpus without altering any contents", async () => {
  const cwd = await makeTestWorkingDirectory();
  const corpusPath = join(cwd, ".repo-memory");
  const firstResult = await invokeCli(["init"], cwd);
  assert.equal(firstResult.exitCode, 0);
  await writeFile(join(corpusPath, "entries", "existing.md"), "existing entry\n");

  const before = {
    root: (await readdir(corpusPath)).sort(),
    readme: await readFile(join(corpusPath, "README.md"), "utf8"),
    schema: await readFile(join(corpusPath, "schema.json"), "utf8"),
    log: await readFile(join(corpusPath, "log.md"), "utf8"),
    entry: await readFile(join(corpusPath, "entries", "existing.md"), "utf8"),
  };
  const result = await invokeCli(["init"], cwd);

  assert.deepEqual(result, {
    exitCode: 1,
    signal: null,
    stdout: "",
    stderr: "Cannot initialize Common Knowledge corpus: .repo-memory already exists.\n",
  });
  assert.deepEqual((await readdir(cwd)).sort(), [".repo-memory"]);
  assert.deepEqual((await readdir(corpusPath)).sort(), before.root);
  assert.equal(await readFile(join(corpusPath, "README.md"), "utf8"), before.readme);
  assert.equal(await readFile(join(corpusPath, "schema.json"), "utf8"), before.schema);
  assert.equal(await readFile(join(corpusPath, "log.md"), "utf8"), before.log);
  assert.equal(
    await readFile(join(corpusPath, "entries", "existing.md"), "utf8"),
    before.entry,
  );
});

test("dispatches the remaining search placeholder from an isolated working directory", async () => {
  const cwd = await makeTestWorkingDirectory();
  const invocations = [
    ["search", "database migration"],
    ["search", "P3006", "--path", "apps/api/index.ts", "--kind", "gotcha"],
  ];

  for (const invocation of invocations) {
    const result = await invokeCli(invocation, cwd);

    assert.deepEqual(result, {
      exitCode: 0,
      signal: null,
      stdout: `${invocation[0]}: not implemented yet\n`,
      stderr: "",
    });
  }
  assert.deepEqual(await readdir(cwd), []);
});

test("reports unsupported commands on standard error", async () => {
  const cwd = await makeTestWorkingDirectory();

  const result = await invokeCli(["frobnicate"], cwd);

  assert.equal(result.exitCode, 1);
  assert.equal(result.signal, null);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^Unknown command: frobnicate/);
  assert.match(result.stderr, /Usage: common-knowledge <command>/);
  assert.deepEqual(await readdir(cwd), []);
});

test("supports explicit help flags", async () => {
  const cwd = await makeTestWorkingDirectory();

  for (const flag of ["--help", "-h"]) {
    const result = await invokeCli([flag], cwd);

    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /^Usage: common-knowledge <command>/);
  }
  assert.deepEqual(await readdir(cwd), []);
});

test("reports missing command operands with command usage", async () => {
  const cwd = await makeTestWorkingDirectory();
  const cases = [
    { args: ["search"], expected: "missing required <query>" },
    { args: ["read"], expected: "missing required <id>" },
    { args: ["add"], expected: "missing required <entry-file>" },
    { args: ["update"], expected: "missing required <entry-file>" },
    { args: ["retire"], expected: "missing required <id>" },
    {
      args: ["retire", "prisma-shadow-db"],
      expected: "missing required --reason <reason>",
    },
  ];

  for (const { args, expected } of cases) {
    const result = await invokeCli(args, cwd);

    assert.equal(result.exitCode, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, new RegExp(expected.replace(/[<>]/g, "\\$&")));
    assert.match(result.stderr, new RegExp(`Usage: common-knowledge ${args[0]}`));
  }
  assert.deepEqual(await readdir(cwd), []);
});

test("rejects extra command arguments", async () => {
  const cwd = await makeTestWorkingDirectory();
  const cases = [
    ["init", "unexpected"],
    ["validate", "unexpected"],
    ["read", "entry-id", "unexpected"],
    ["retire", "entry-id", "--reason", "obsolete", "unexpected"],
  ];

  for (const args of cases) {
    const result = await invokeCli(args, cwd);

    assert.equal(result.exitCode, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /unexpected argument "unexpected"/);
    assert.match(result.stderr, new RegExp(`Usage: common-knowledge ${args[0]}`));
  }
  assert.deepEqual(await readdir(cwd), []);
});

test("rejects unsupported options and missing option values", async () => {
  const cwd = await makeTestWorkingDirectory();
  const cases = [
    {
      args: ["search", "query", "--bogus"],
      expected: "unsupported option \"--bogus\"",
    },
    {
      args: ["search", "query", "--path"],
      expected: "missing value for option \"--path\"",
    },
    {
      args: ["search", "query", "--kind", "gotcha", "--kind", "pattern"],
      expected: "option \"--kind\" may only be specified once",
    },
    {
      args: ["retire", "entry-id", "--bogus", "reason"],
      expected: "unsupported option \"--bogus\"",
    },
    {
      args: ["retire", "entry-id", "--reason"],
      expected: "missing value for option \"--reason\"",
    },
  ];

  for (const { args, expected } of cases) {
    const result = await invokeCli(args, cwd);

    assert.equal(result.exitCode, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, new RegExp(expected.replace(/["-]/g, "\\$&")));
    assert.match(result.stderr, new RegExp(`Usage: common-knowledge ${args[0]}`));
  }
  assert.deepEqual(await readdir(cwd), []);
});

test("shows command-specific usage help", async () => {
  const cwd = await makeTestWorkingDirectory();

  const result = await invokeCli(["retire", "--help"], cwd);

  assert.deepEqual(result, {
    exitCode: 0,
    signal: null,
    stdout: "Usage: common-knowledge retire <id> --reason <reason>\n",
    stderr: "",
  });
  assert.deepEqual(await readdir(cwd), []);
});
