import {
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export const checkoutLockName = ".repo-memory.lock";

function detail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function heldLockDiagnostic(path: string): string {
  let owner = "owner details unavailable";
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      pid?: unknown;
      command?: unknown;
      created_at?: unknown;
    };
    const fields = [
      typeof parsed.command === "string" ? `command ${JSON.stringify(parsed.command)}` : undefined,
      typeof parsed.pid === "number" ? `pid ${parsed.pid}` : undefined,
      typeof parsed.created_at === "string" ? `created ${parsed.created_at}` : undefined,
    ].filter((value): value is string => value !== undefined);
    if (fields.length > 0) owner = fields.join(", ");
  } catch {
    // The path itself is enough for manual recovery when metadata is damaged.
  }
  return (
    `Common Knowledge checkout lock ${JSON.stringify(path)} is held (${owner}); retry after the other command finishes. ` +
    `If no Common Knowledge process owns it, remove the stale ${checkoutLockName} file and retry`
  );
}

export function withCheckoutLock<T>(
  workingDirectory: string,
  command: string,
  action: () => T,
): T {
  const path = join(workingDirectory, checkoutLockName);
  let descriptor: number;
  try {
    descriptor = openSync(path, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(heldLockDiagnostic(path));
    }
    throw new Error(`cannot acquire Common Knowledge checkout lock: ${detail(error)}`, {
      cause: error,
    });
  }

  let actionError: unknown;
  try {
    writeFileSync(
      descriptor,
      `${JSON.stringify({ pid: process.pid, command, created_at: new Date().toISOString() })}\n`,
      "utf8",
    );
    return action();
  } catch (error) {
    actionError = error;
    throw error;
  } finally {
    let cleanupError: unknown;
    try {
      const opened = fstatSync(descriptor, { bigint: true });
      const current = lstatSync(path, { bigint: true });
      if (opened.dev !== current.dev || opened.ino !== current.ino) {
        throw new Error(`checkout lock identity changed; retained ${path} for inspection`);
      }
      closeSync(descriptor);
      unlinkSync(path);
    } catch (error) {
      cleanupError = error;
      try {
        closeSync(descriptor);
      } catch {
        // Already closed.
      }
    }
    if (cleanupError !== undefined) {
      const message = `failed to release Common Knowledge checkout lock: ${detail(cleanupError)}`;
      if (actionError !== undefined) {
        throw new Error(`${detail(actionError)}; ${message}`, { cause: actionError });
      }
      throw new Error(message, { cause: cleanupError });
    }
  }
}
