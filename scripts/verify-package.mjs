import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

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

const temporaryRoot = await mkdtemp(join(tmpdir(), "common-knowledge-package-"));
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
  assert.equal(installedManifest.engines.node, ">=20");
  assert.equal(installedManifest.bin["common-knowledge"], "dist/cli.js");

  const cliResult = await run(
    join(installRoot, "node_modules", ".bin", "common-knowledge"),
    ["--help"],
    { cwd: installRoot },
  );
  assert.equal(cliResult.exitCode, 0, cliResult.stderr);
  assert.equal(cliResult.stderr, "");
  assert.match(cliResult.stdout, /^Usage: common-knowledge <command>/);

  process.stdout.write(`Verified ${filename}: packed, installed, and executed in isolation.\n`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
