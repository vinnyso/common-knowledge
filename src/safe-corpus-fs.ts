import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { corpusDirectoryName } from "./corpus.js";
import { EntryCommandError } from "./entry-model.js";

export function corpusPath(cwd: string): string {
  const path = join(cwd, corpusDirectoryName);
  if (!existsSync(path)) {
    throw new EntryCommandError(
      `Corpus not found at ${corpusDirectoryName}; run common-knowledge init first`,
    );
  }
  return path;
}

export function entryPath(cwd: string, id: string): string {
  return join(corpusPath(cwd), "entries", `${id}.md`);
}

export function proposalPath(cwd: string, id: string): string {
  return join(corpusPath(cwd), "proposals", `${id}.md`);
}

function assertSafeCorpusFilePath(cwd: string, path: string, label: string): void {
  const workingDirectory = resolve(cwd);
  const corpus = join(workingDirectory, corpusDirectoryName);
  const lexicalRelative = relative(corpus, path);
  if (
    lexicalRelative === "" ||
    lexicalRelative === ".." ||
    lexicalRelative.startsWith(`..${sep}`) ||
    isAbsolute(lexicalRelative)
  ) {
    throw new EntryCommandError(`${label} must remain inside ${corpusDirectoryName}`);
  }
  let component = workingDirectory;
  const parts = relative(component, path).split(sep);
  for (const [index, part] of parts.entries()) {
    component = join(component, part);
    try {
      const stat = lstatSync(component);
      if (stat.isSymbolicLink()) {
        throw new EntryCommandError(
          `${label} uses symbolic-link component ${JSON.stringify(component)} and must not use symbolic links`,
        );
      }
      const final = index === parts.length - 1;
      if ((!final && !stat.isDirectory()) || (final && !stat.isFile())) {
        throw new EntryCommandError(
          `${label} must use ordinary Corpus directories and a regular file`,
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
  }
  const resolvedCorpus = realpathSync(corpus);
  const resolvedFile = realpathSync(path);
  const resolvedRelative = relative(resolvedCorpus, resolvedFile);
  if (
    resolvedRelative === "" ||
    resolvedRelative === ".." ||
    resolvedRelative.startsWith(`..${sep}`) ||
    isAbsolute(resolvedRelative)
  ) {
    throw new EntryCommandError(`${label} resolves outside ${corpusDirectoryName}`);
  }
}

export function readSafeCorpusFile(cwd: string, path: string, label: string): string {
  assertSafeCorpusFilePath(cwd, path, label);
  const initial = lstatSync(path, { bigint: true });
  let descriptor: number;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new EntryCommandError(`cannot safely open ${label}: ${detail}`);
  }
  try {
    assertSafeCorpusFilePath(cwd, path, label);
    const current = lstatSync(path, { bigint: true });
    const opened = fstatSync(descriptor, { bigint: true });
    if (
      initial.dev !== current.dev ||
      initial.ino !== current.ino ||
      initial.dev !== opened.dev ||
      initial.ino !== opened.ino
    ) {
      throw new EntryCommandError(`${label} filesystem identity changed while it was opened`);
    }
    return readFileSync(descriptor, "utf8");
  } finally {
    closeSync(descriptor);
  }
}

function corpusDirectoryIdentity(
  cwd: string,
  name: "entries" | "proposals",
): { path: string; identity: string } {
  const path = join(resolve(cwd), corpusDirectoryName, name);
  const corpus = join(resolve(cwd), corpusDirectoryName);
  for (const [component, label] of [
    [corpus, "Corpus directory"],
    [path, `Corpus ${name} directory`],
  ] as const) {
    const stat = lstatSync(component, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new EntryCommandError(
        `${label} must be an ordinary directory without symbolic links`,
      );
    }
  }
  const resolvedCorpus = realpathSync(corpus);
  const resolvedDirectory = realpathSync(path);
  if (relative(resolvedCorpus, resolvedDirectory) !== name) {
    throw new EntryCommandError(
      `Corpus ${name} directory resolves outside ${corpusDirectoryName}`,
    );
  }
  const stat = lstatSync(path, { bigint: true });
  return { path, identity: `${stat.dev}:${stat.ino}:${stat.mtimeNs}:${stat.size}` };
}

export function entryDirectoryIdentity(cwd: string): { path: string; identity: string } {
  return corpusDirectoryIdentity(cwd, "entries");
}

export function assertEntryDirectoryIdentity(cwd: string, expected: string): void {
  if (entryDirectoryIdentity(cwd).identity !== expected) {
    throw new EntryCommandError("Corpus entries directory changed during validation");
  }
}

export function proposalDirectoryIdentity(cwd: string): { path: string; identity: string } {
  return corpusDirectoryIdentity(cwd, "proposals");
}

export function assertProposalDirectoryIdentity(cwd: string, expected: string): void {
  if (proposalDirectoryIdentity(cwd).identity !== expected) {
    throw new EntryCommandError("Corpus proposals directory changed during operation");
  }
}

export function ensureProposalDirectory(cwd: string): { path: string; identity: string } {
  const path = join(corpusPath(cwd), "proposals");
  try {
    mkdirSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return proposalDirectoryIdentity(cwd);
}
