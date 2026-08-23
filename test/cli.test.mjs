import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
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

test("dispatches every supported command from an isolated working directory", async () => {
  const cwd = await makeTestWorkingDirectory();
  const commands = [
    "init",
    "search",
    "read",
    "add",
    "update",
    "retire",
    "validate",
  ];

  for (const command of commands) {
    const result = await invokeCli([command], cwd);

    assert.deepEqual(result, {
      exitCode: 0,
      signal: null,
      stdout: `${command}: not implemented yet\n`,
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
