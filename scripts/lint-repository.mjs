import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";

const root = process.cwd();
const textExtensions = new Set([
  ".cjs",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".yaml",
  ".yml",
]);
const exactTextFiles = new Set([".gitignore", "AGENTS.md", "CONTEXT.md", "LICENSE"]);
const failures = [];

function fail(file, line, message) {
  failures.push(`${file}${line === undefined ? "" : `:${line}`}: ${message}`);
}

function repositoryFiles() {
  return execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    {
      cwd: root,
      encoding: "utf8",
    },
  )
    .split("\0")
    .filter(Boolean)
    .sort();
}

function isTextFile(file) {
  return exactTextFiles.has(file) || textExtensions.has(extname(file));
}

function lintText(file, content) {
  if (content.length > 0 && !content.endsWith("\n")) {
    fail(file, undefined, "missing final newline");
  }

  const lines = content.split("\n");
  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    if (/^(?:<<<<<<<|=======|>>>>>>>)(?: |$)/.test(line)) {
      fail(file, lineNumber, "unresolved merge-conflict marker");
    }
    if (/\t/.test(line)) {
      fail(file, lineNumber, "tab character; use spaces");
    }

    const trailingWhitespace = line.match(/ +$/)?.[0] ?? "";
    const markdownHardBreak = extname(file) === ".md" && trailingWhitespace === "  ";
    if (trailingWhitespace && !markdownHardBreak) {
      fail(file, lineNumber, "trailing whitespace");
    }
  }

  if ([".js", ".mjs", ".cjs", ".ts"].includes(extname(file))) {
    const focusedTest = /\b(?:describe|it|test)\.only\s*\(/g;
    for (const match of content.matchAll(focusedTest)) {
      const lineNumber = content.slice(0, match.index).split("\n").length;
      fail(file, lineNumber, "focused test committed with .only");
    }
  }
}

function lintJson(file, content) {
  try {
    JSON.parse(content);
  } catch (error) {
    fail(file, undefined, `invalid JSON: ${error.message}`);
  }
}

function lintLocalMarkdownLinks(file, content) {
  const links = content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g);
  for (const match of links) {
    const target = match[1].trim().replace(/^<|>$/g, "").split("#", 1)[0];
    if (!target || /^(?:[a-z]+:|\/)/i.test(target)) {
      continue;
    }
    if (!existsSync(resolve(root, dirname(file), target))) {
      const lineNumber = content.slice(0, match.index).split("\n").length;
      fail(file, lineNumber, `broken local Markdown link: ${target}`);
    }
  }
}

function lintPackageMetadata() {
  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const lockfile = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
  const lockedRoot = lockfile.packages?.[""];
  if (!lockedRoot) {
    fail("package-lock.json", undefined, "missing packages[\"\"] metadata");
    return;
  }

  for (const field of ["name", "version", "license"]) {
    if (manifest[field] !== lockedRoot[field]) {
      fail("package-lock.json", undefined, `${field} differs from package.json`);
    }
  }

  for (const field of ["bin", "dependencies", "devDependencies", "engines"]) {
    const manifestValue = manifest[field] ?? {};
    const lockedValue = lockedRoot[field] ?? {};
    if (JSON.stringify(manifestValue) !== JSON.stringify(lockedValue)) {
      fail("package-lock.json", undefined, `${field} differs from package.json`);
    }
  }

  const license = readFileSync(resolve(root, "LICENSE"), "utf8");
  if (manifest.license !== "Apache-2.0" || !/Apache License\s+Version 2\.0/.test(license)) {
    fail("LICENSE", undefined, "Apache-2.0 package metadata and license text are not aligned");
  }
}

for (const file of repositoryFiles()) {
  if (!isTextFile(file)) {
    continue;
  }
  const content = readFileSync(resolve(root, file), "utf8");
  lintText(file, content);
  if (extname(file) === ".json") {
    lintJson(file, content);
  }
  if (extname(file) === ".md") {
    lintLocalMarkdownLinks(file, content);
  }
}

lintPackageMetadata();

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Repository lint passed.\n");
}
