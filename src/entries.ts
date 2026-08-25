import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

import type { ValidateFunction } from "ajv/dist/2020.js";

import {
  appendEvents,
  type ActivityEvent,
  generatedSummary,
  validateActivityLog,
  validateActivitySummary,
  validateLogField,
} from "./activity-log.js";
import {
  loadSchemaValidator,
  parseEntry,
  requireEntryId,
  serializeEntry,
  validateParsedEntry,
} from "./entry-format.js";
import {
  EntryCommandError,
  type LoadedEntry,
  type ParsedEntry,
} from "./entry-model.js";
import {
  assertEntryDirectoryIdentity,
  corpusPath,
  entryDirectoryIdentity,
  entryPath,
  readSafeCorpusFile,
} from "./safe-corpus-fs.js";
import { writeChanges } from "./transaction.js";

import {
  compileScopePattern,
  scopeMatches,
  tokens,
  globCharacterClass,
  normalizeText,
} from "./search-cache.mjs";

export { EntryCommandError };

export const __testing = { compileScopePattern, scopeMatches, tokens, globCharacterClass, normalizeText };

function loadEntry(cwd: string, id: string, validator: ValidateFunction): LoadedEntry {
  requireEntryId(id);
  const path = entryPath(cwd, id);
  if (!existsSync(path)) {
    throw new EntryCommandError(`Entry ${JSON.stringify(id)} does not exist`);
  }
  const source = readSafeCorpusFile(
    cwd,
    path,
    `Entry path ${JSON.stringify(relative(resolve(cwd), path))}`,
  );
  const parsed = parseEntry(source, `Entry ${JSON.stringify(id)}`);
  validateParsedEntry(parsed, validator, `Entry ${JSON.stringify(id)}`);
  if (parsed.metadata.id !== id) {
    throw new EntryCommandError(
      `Entry file ${JSON.stringify(basename(path))} declares mismatched ID ${JSON.stringify(parsed.metadata.id)}`,
    );
  }
  return { ...parsed, path, source };
}

function readInputEntry(
  cwd: string,
  inputFile: string,
  validator: ValidateFunction,
): ParsedEntry {
  const path = resolve(cwd, inputFile);
  let source: string;
  try {
    source = readFileSync(path, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new EntryCommandError(
      `cannot read Entry file ${JSON.stringify(inputFile)}: ${detail}`,
    );
  }
  const entry = parseEntry(source, `Entry file ${JSON.stringify(inputFile)}`);
  validateParsedEntry(entry, validator, `Entry file ${JSON.stringify(inputFile)}`);
  return entry;
}

function readLog(cwd: string): { path: string; contents: string } {
  const path = join(corpusPath(cwd), "log.md");
  try {
    return { path, contents: readSafeCorpusFile(cwd, path, "activity log") };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new EntryCommandError(`cannot read activity log: ${detail}`);
  }
}

function nowUtc(): string {
  return new Date().toISOString();
}

export function addEntry(cwd: string, inputFile: string): string {
  validateCorpus(cwd);
  const validator = loadSchemaValidator(cwd);
  const entry = readInputEntry(cwd, inputFile, validator);
  requireEntryId(entry.metadata.id);
  if (entry.metadata.status !== "active") {
    throw new EntryCommandError("a new Entry must have status active");
  }
  const target = entryPath(cwd, entry.metadata.id);
  if (existsSync(target)) {
    throw new EntryCommandError(`Entry ${JSON.stringify(entry.metadata.id)} already exists`);
  }

  const timestamp = nowUtc();
  const log = readLog(cwd);
  const changes: { path: string; contents: string }[] = [];
  const events: ActivityEvent[] = [];

  if (entry.metadata.supersedes !== undefined) {
    if (entry.metadata.supersedes === entry.metadata.id) {
      throw new EntryCommandError("an Entry cannot supersede itself");
    }
    const predecessor = loadEntry(cwd, entry.metadata.supersedes, validator);
    if (predecessor.metadata.status !== "active") {
      throw new EntryCommandError(
        `Entry ${JSON.stringify(entry.metadata.supersedes)} cannot be superseded because it is ${predecessor.metadata.status}`,
      );
    }
    const updatedPredecessor: ParsedEntry = {
      metadata: { ...predecessor.metadata, status: "superseded", updated_at: timestamp },
      body: predecessor.body,
    };
    validateParsedEntry(
      updatedPredecessor,
      validator,
      `Entry ${JSON.stringify(predecessor.metadata.id)}`,
    );
    changes.push({
      path: predecessor.path,
      contents: serializeEntry(updatedPredecessor),
    });
    events.push({
      timestamp,
      event: "entry.superseded",
      id: predecessor.metadata.id,
      actor: entry.metadata.created_by,
      summary: `Superseded by ${entry.metadata.id}.`,
    });
  }

  changes.push({ path: target, contents: serializeEntry(entry) });
  events.push({
    timestamp,
    event: "entry.created",
    id: entry.metadata.id,
    actor: entry.metadata.created_by,
    summary: generatedSummary("Created: ", entry.metadata.title),
  });
  const nextLog = appendEvents(log.contents, events);
  validateCandidateActivityLog(cwd, nextLog, [entry.metadata.id]);
  changes.push({ path: log.path, contents: nextLog });
  writeChanges(changes, cwd);
  return entry.metadata.id;
}

export function readEntry(cwd: string, id: string): string {
  const validator = loadSchemaValidator(cwd);
  return loadEntry(cwd, id, validator).source;
}

export function updateEntry(cwd: string, inputFile: string): string {
  validateCorpus(cwd);
  const validator = loadSchemaValidator(cwd);
  const replacement = readInputEntry(cwd, inputFile, validator);
  requireEntryId(replacement.metadata.id);
  const existing = loadEntry(cwd, replacement.metadata.id, validator);
  if (replacement.metadata.status !== existing.metadata.status) {
    throw new EntryCommandError(
      `update cannot change status from ${existing.metadata.status} to ${replacement.metadata.status}; use a lifecycle command`,
    );
  }
  if (replacement.metadata.supersedes !== existing.metadata.supersedes) {
    throw new EntryCommandError("update cannot change an Entry's supersedes relationship");
  }

  const timestamp = nowUtc();
  const updated: ParsedEntry = {
    metadata: {
      ...replacement.metadata,
      created_at: existing.metadata.created_at,
      created_by: existing.metadata.created_by,
      updated_at: timestamp,
    },
    body: replacement.body,
  };
  validateParsedEntry(
    updated,
    validator,
    `Entry ${JSON.stringify(existing.metadata.id)}`,
  );
  const log = readLog(cwd);
  const nextLog = appendEvents(log.contents, [
    {
      timestamp,
      event: "entry.updated",
      id: existing.metadata.id,
      actor: existing.metadata.created_by,
      summary: generatedSummary("Updated: ", updated.metadata.title),
    },
  ]);
  validateCandidateActivityLog(cwd, nextLog);
  writeChanges([
    { path: existing.path, contents: serializeEntry(updated) },
    { path: log.path, contents: nextLog },
  ], cwd);
  return existing.metadata.id;
}

export function retireEntry(cwd: string, id: string, reason: string): void {
  requireEntryId(id);
  validateLogField(reason, "retirement reason", 160);
  const retirementSummary = /[.!?]$/.test(reason) ? reason : `${reason}.`;
  validateActivitySummary(retirementSummary, "retirement reason");
  validateCorpus(cwd);
  const validator = loadSchemaValidator(cwd);
  const existing = loadEntry(cwd, id, validator);
  if (existing.metadata.status !== "active") {
    throw new EntryCommandError(
      `Entry ${JSON.stringify(id)} cannot be retired because it is ${existing.metadata.status}`,
    );
  }
  const timestamp = nowUtc();
  const retired: ParsedEntry = {
    metadata: { ...existing.metadata, status: "retired", updated_at: timestamp },
    body: existing.body,
  };
  validateParsedEntry(retired, validator, `Entry ${JSON.stringify(id)}`);
  const log = readLog(cwd);
  const nextLog = appendEvents(log.contents, [
    {
      timestamp,
      event: "entry.retired",
      id,
      actor: existing.metadata.created_by,
      summary: retirementSummary,
    },
  ]);
  validateCandidateActivityLog(cwd, nextLog);
  writeChanges([
    { path: existing.path, contents: serializeEntry(retired) },
    { path: log.path, contents: nextLog },
  ], cwd);
}

function validateCandidateActivityLog(
  cwd: string,
  contents: string,
  additionalEntryIds: readonly string[] = [],
): void {
  const directory = entryDirectoryIdentity(cwd);
  const entryIds = new Set(
    readdirSync(directory.path)
      .filter((name) => name.endsWith(".md"))
      .map((name) => name.slice(0, -3)),
  );
  assertEntryDirectoryIdentity(cwd, directory.identity);
  for (const id of additionalEntryIds) {
    entryIds.add(id);
  }
  const errors = validateActivityLog(contents, entryIds);
  if (errors.length > 0) {
    throw new EntryCommandError(
      `candidate activity log is invalid:\n${errors.map((error) => `- ${error}`).join("\n")}`,
    );
  }
}

export function validateCorpus(cwd: string): number {
  const root = corpusPath(cwd);
  const validator = loadSchemaValidator(cwd);
  const entriesDirectory = join(root, "entries");
  const errors: string[] = [];
  const entries = new Map<string, LoadedEntry>();
  const supersededTargets = new Set<string>();

  let files: string[];
  let directoryIdentity: string;
  try {
    const directory = entryDirectoryIdentity(cwd);
    directoryIdentity = directory.identity;
    const contents = readdirSync(directory.path, { withFileTypes: true });
    files = [];
    for (const item of contents) {
      if (!item.isFile()) {
        errors.push(
          `entries/${item.name}: nested directories and non-file content are not allowed; use flat entries/<id>.md storage`,
        );
      } else if (!item.name.endsWith(".md")) {
        errors.push(`entries/${item.name}: Entry files must use the flat entries/<id>.md layout`);
      } else {
        files.push(item.name);
      }
    }
    files.sort();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new EntryCommandError(`cannot read Corpus entries directory: ${detail}`);
  }

  for (const file of files) {
    const path = join(entriesDirectory, file);
    try {
      const source = readSafeCorpusFile(
        cwd,
        path,
        `Entry path ${JSON.stringify(`entries/${file}`)}`,
      );
      const parsed = parseEntry(source, file);
      validateParsedEntry(parsed, validator, file);
      const expectedFile = `${parsed.metadata.id}.md`;
      if (file !== expectedFile) {
        errors.push(`${file}: Entry ID requires flat path entries/${expectedFile}`);
      }
      if (entries.has(parsed.metadata.id)) {
        errors.push(`${file}: duplicate Entry ID ${JSON.stringify(parsed.metadata.id)}`);
      } else {
        entries.set(parsed.metadata.id, { ...parsed, source, path });
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  try {
    assertEntryDirectoryIdentity(cwd, directoryIdentity);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  for (const entry of entries.values()) {
    const predecessorId = entry.metadata.supersedes;
    if (predecessorId === undefined) {
      continue;
    }
    if (predecessorId === entry.metadata.id) {
      errors.push(`${entry.metadata.id}: an Entry cannot supersede itself`);
      continue;
    }
    const predecessor = entries.get(predecessorId);
    if (predecessor === undefined) {
      errors.push(
        `${entry.metadata.id}: supersedes missing Entry ${JSON.stringify(predecessorId)}`,
      );
    } else if (predecessor.metadata.status !== "superseded") {
      errors.push(
        `${entry.metadata.id}: predecessor ${JSON.stringify(predecessorId)} must have status superseded`,
      );
    }
    if (supersededTargets.has(predecessorId)) {
      errors.push(
        `${entry.metadata.id}: predecessor ${JSON.stringify(predecessorId)} is superseded by multiple Entries`,
      );
    }
    supersededTargets.add(predecessorId);
  }

  const visitState = new Map<string, "visiting" | "visited">();
  const visit = (id: string, path: readonly string[]): void => {
    const state = visitState.get(id);
    if (state === "visited") return;
    if (state === "visiting") {
      const cycleStart = path.indexOf(id);
      const cycle = [...path.slice(cycleStart), id];
      errors.push(`supersession cycle detected: ${cycle.join(" -> ")}`);
      return;
    }
    visitState.set(id, "visiting");
    const predecessor = entries.get(id)?.metadata.supersedes;
    if (predecessor !== undefined && entries.has(predecessor)) {
      visit(predecessor, [...path, id]);
    }
    visitState.set(id, "visited");
  };
  for (const id of entries.keys()) {
    visit(id, []);
  }

  for (const entry of entries.values()) {
    if (entry.metadata.status === "superseded" && !supersededTargets.has(entry.metadata.id)) {
      errors.push(`${entry.metadata.id}: superseded Entry is not referenced by a successor`);
    }
  }

  try {
    const log = readSafeCorpusFile(cwd, join(root, "log.md"), "activity log");
    errors.push(...validateActivityLog(log, new Set(entries.keys())));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    errors.push(`cannot read activity log: ${detail}`);
  }

  if (errors.length > 0) {
    throw new EntryCommandError(
      `Corpus validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}`,
    );
  }
  return entries.size;
}
