import fs from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

interface StagedChange {
  readonly target: string;
  readonly staged: string;
  readonly backup: string;
  readonly hadTarget: boolean;
  backedUp: boolean;
  installed: boolean;
}

function isInside(parent: string, candidate: string): boolean {
  const path = relative(resolve(parent), resolve(candidate));
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertSafeTarget(workingDirectory: string, target: string): void {
  if (!isInside(workingDirectory, target)) {
    throw new Error(`transaction target ${JSON.stringify(target)} is outside the working directory`);
  }
  const relativeTarget = relative(workingDirectory, target);
  let component = workingDirectory;
  for (const part of relativeTarget.split(sep)) {
    component = join(component, part);
    try {
      if (fs.lstatSync(component).isSymbolicLink()) {
        throw new Error(
          `transaction target ${JSON.stringify(target)} uses symbolic-link component ${JSON.stringify(component)}`,
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
  }
}

function cleanupRecovery(recoveryDirectory: string): string | undefined {
  try {
    fs.rmSync(recoveryDirectory, { recursive: true, force: true });
    return undefined;
  } catch (error) {
    return errorDetail(error);
  }
}

export function writeChanges(
  changes: readonly { path: string; contents: string }[],
  workingDirectory: string,
): void {
  const resolvedWorkingDirectory = resolve(workingDirectory);
  const realWorkingDirectory = fs.realpathSync(resolvedWorkingDirectory);
  if (realWorkingDirectory !== resolvedWorkingDirectory) {
    throw new Error("transaction working directory must not be reached through a symbolic link");
  }
  const targets = changes.map((change) => resolve(change.path));
  for (const target of targets) assertSafeTarget(resolvedWorkingDirectory, target);

  const recoveryParent = dirname(resolvedWorkingDirectory);
  const recoveryDirectory = fs.mkdtempSync(
    join(recoveryParent, ".common-knowledge-transaction-"),
  );
  if (isInside(resolvedWorkingDirectory, recoveryDirectory)) {
    fs.rmSync(recoveryDirectory, { recursive: true, force: true });
    throw new Error("cannot create transaction recovery outside the working directory");
  }

  const staged: StagedChange[] = [];
  let commitStarted = false;
  try {
    for (const [index, change] of changes.entries()) {
      const target = targets[index] as string;
      const stem = `${index}-${basename(target)}`;
      const file: StagedChange = {
        target,
        staged: join(recoveryDirectory, `${stem}.staged`),
        backup: join(recoveryDirectory, `${stem}.backup`),
        hadTarget: fs.existsSync(target),
        backedUp: false,
        installed: false,
      };
      fs.writeFileSync(file.staged, change.contents, { encoding: "utf8", flag: "wx" });
      if (file.hadTarget) {
        fs.copyFileSync(file.target, file.backup);
        file.backedUp = true;
      }
      staged.push(file);
    }

    commitStarted = true;
    for (const file of staged) {
      fs.renameSync(file.staged, file.target);
      file.installed = true;
    }
  } catch (commitError) {
    const installedCount = staged.filter((file) => file.installed).length;
    const rollbackErrors: string[] = [];
    if (commitStarted) {
      for (const file of [...staged].reverse()) {
        if (!file.installed) continue;
        try {
          if (file.hadTarget && file.backedUp) {
            fs.rmSync(file.target, { force: true });
            fs.renameSync(file.backup, file.target);
            file.backedUp = false;
          } else {
            fs.rmSync(file.target, { force: true });
          }
          file.installed = false;
        } catch (rollbackError) {
          rollbackErrors.push(`${file.target}: ${errorDetail(rollbackError)}`);
        }
      }
    }

    if (rollbackErrors.length === 0) {
      const cleanupError = cleanupRecovery(recoveryDirectory);
      const cleanupDetail = cleanupError === undefined
        ? ""
        : `; recovery cleanup incomplete: ${cleanupError}; retained external recovery evidence at ${recoveryDirectory}`;
      if (commitStarted) {
        throw new Error(
          `transaction failed after installing ${installedCount} of ${staged.length} targets: ` +
            `${errorDetail(commitError)}; rollback completed${cleanupDetail}`,
          { cause: commitError },
        );
      }
      if (cleanupError !== undefined) {
        throw new Error(
          `transaction staging failed: ${errorDetail(commitError)}${cleanupDetail}`,
          { cause: commitError },
        );
      }
      throw commitError;
    }
    throw new Error(
      `transaction failed: ${errorDetail(commitError)}; rollback incomplete: ${rollbackErrors.join("; ")}; ` +
        `original recovery copies retained at ${recoveryDirectory}`,
      { cause: commitError },
    );
  }

  const cleanupError = cleanupRecovery(recoveryDirectory);
  if (cleanupError !== undefined) {
    throw new Error(
      `transaction committed, but recovery cleanup failed: ${cleanupError}; ` +
        `Corpus changes remain applied and external recovery evidence is retained at ${recoveryDirectory}`,
    );
  }
}
