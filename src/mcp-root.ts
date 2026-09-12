import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

export class UnsupportedCheckoutRootError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedCheckoutRootError";
  }
}

function assertNoSymbolicLink(path: string): void {
  if (lstatSync(path).isSymbolicLink()) {
    throw new UnsupportedCheckoutRootError(
      `configured root must not be a symbolic link: ${path}`,
    );
  }
}

function gitPath(configuredPath: string, argument: string): string {
  const result = spawnSync("git", ["-C", configuredPath, "rev-parse", argument], {
    encoding: "utf8",
  });
  if (result.error !== undefined) {
    throw new UnsupportedCheckoutRootError(
      `cannot inspect configured Git checkout: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    const detail = result.stderr.trim() || "Git did not recognize the configured path";
    throw new UnsupportedCheckoutRootError(`unsupported configured root: ${detail}`);
  }
  return result.stdout.trim();
}

export function resolveCheckoutRoot(configuredPath: string): string {
  if (configuredPath.trim() === "") {
    throw new UnsupportedCheckoutRootError("configured root must not be empty");
  }
  const absolute = isAbsolute(configuredPath)
    ? resolve(configuredPath)
    : resolve(process.cwd(), configuredPath);
  assertNoSymbolicLink(absolute);
  const stat = lstatSync(absolute);
  if (!stat.isDirectory()) {
    throw new UnsupportedCheckoutRootError("configured root must be a directory");
  }

  const checkoutRoot = realpathSync(resolve(gitPath(absolute, "--show-toplevel")));
  const superproject = gitPath(absolute, "--show-superproject-working-tree");
  if (superproject !== "") {
    throw new UnsupportedCheckoutRootError(
      `submodule roots are unsupported; configure the owning checkout instead of ${checkoutRoot}`,
    );
  }
  const selected = relative(checkoutRoot, realpathSync(absolute));
  if (selected === ".." || selected.startsWith(`..${sep}`) || isAbsolute(selected)) {
    throw new UnsupportedCheckoutRootError(
      "configured path did not resolve inside its selected checkout",
    );
  }
  return checkoutRoot;
}

export function parseMcpRootArgument(args: readonly string[]): string {
  const [option, value, extra] = args;
  if (option !== "--root" || value === undefined || extra !== undefined) {
    throw new UnsupportedCheckoutRootError(
      "usage: common-knowledge-mcp --root <repository-or-worktree-path>",
    );
  }
  return resolveCheckoutRoot(value);
}
