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
  type EntryMetadata,
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
  scopeMatches as importedScopeMatches,
  tokens as importedTokens,
  globCharacterClass,
  normalizeText as importedNormalizeText,
  overlappingTokens as importedOverlappingTokens,
  invalidateScopeRegexMany,
} from "./search-cache.mjs";

export { EntryCommandError };

export interface SearchResult {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly reasons: readonly string[];
}

interface SearchScore {
  readonly exactTriggers: readonly string[];
  readonly scopePatterns: readonly string[];
  readonly triggerTokens: readonly string[];
  readonly titleTokens: readonly string[];
}

// Per-entry and per-pattern caches to avoid repeated work on repeated searches.
const compiledScopeCache = new Map<string, { pattern: string; regex: RegExp }[] | undefined>();
const entryTokenCache = new Map<string, {
  triggerTokensFlat: readonly string[];
  titleTokens: readonly string[];
  normalizedTriggers: readonly string[];
}>();

// Re-export testing hooks from the search cache module.
export const __testing = {
  compileScopePattern,
  scopeMatches: importedScopeMatches,
  tokens: importedTokens,
  globCharacterClass,
  normalizeText: importedNormalizeText,
};

function tokens(value: string): readonly string[] {
  return importedTokens(value);
}

function normalizeText(value: string): string {
  return importedNormalizeText(value);
}

function overlappingTokens(left: readonly string[], right: readonly string[]): readonly string[] {
  return importedOverlappingTokens(left, right);
}

function globCharacterClassWrapper(
  segment: string,
  start: number,
): { readonly expression: string; readonly end: number } | undefined {
  return globCharacterClass(segment, start) as { readonly expression: string; readonly end: number } | undefined;
}

function scopeMatches(pattern: string, path: string): boolean {
  // Use the imported cached compiler
  return importedScopeMatches(pattern, path);
}

function scopePaths(metadata: EntryMetadata): readonly string[] | undefined {
  const scope = metadata.scope;
  if (scope === null || typeof scope !== "object" || Array.isArray(scope)) return undefined;
  const paths = (scope as { paths?: unknown }).paths;
  return Array.isArray(paths) && paths.every((path) => typeof path === "string")
    ? paths
    : undefined;
}

function scoreEntry(entry: LoadedEntry, query: string, path: string | undefined): SearchScore {
  const id = entry.metadata.id;
  const queryTokens = tokens(query);

  // Tokenization cache per-entry
  let tokenCache = entryTokenCache.get(id);
  if (!tokenCache) {
    const triggers = (entry.metadata.triggers as readonly string[]) ?? [];
    const normalizedTriggers = triggers.map((t) => normalizeText(t));
    const triggerTokensFlat = triggers.flatMap(tokens);
    const titleTokens = tokens(entry.metadata.title);
    tokenCache = { triggerTokensFlat, titleTokens, normalizedTriggers };
    entryTokenCache.set(id, tokenCache);
  }

  const exactTriggers = tokenCache.normalizedTriggers.filter((trigger) => {
    return trigger.length > 0 && query.includes(trigger);
  });

  const paths = scopePaths(entry.metadata);

  // Per-entry compiled scope cache (pattern -> RegExp)
  let compiled = compiledScopeCache.get(id);
  if (compiled === undefined) {
    compiled = paths?.map((p) => ({ pattern: p, regex: compileScopePattern(p) })) ?? undefined;
    compiledScopeCache.set(id, compiled);
  }

  const scopePatterns =
    path === undefined || compiled === undefined
      ? []
      : compiled.filter((c) => c.regex.test(path)).map((c) => c.pattern);

  return {
    exactTriggers,
    scopePatterns,
    triggerTokens: overlappingTokens(tokenCache.triggerTokensFlat, queryTokens),
    titleTokens: overlappingTokens(tokenCache.titleTokens, queryTokens),
  };
}

function compareScores(left: SearchScore, right: SearchScore): number {
  for (const [leftValue, rightValue] of [
    [left.exactTriggers.length, right.exactTriggers.length],
    [Number(left.scopePatterns.length > 0), Number(right.scopePatterns.length > 0)],
    [left.triggerTokens.length, right.triggerTokens.length],
    [left.titleTokens.length, right.titleTokens.length],
  ] as const) {
    if (leftValue !== rightValue) return rightValue - leftValue;
  }
  return 0;
}

function reasons(score: SearchScore): readonly string[] {
  const result: string[] = [];
  if (score.exactTriggers.length > 0) result.push(`exact triggers: ${score.exactTriggers.join(", ")}`);
  if (score.scopePatterns.length > 0) result.push(`matching scope: ${score.scopePatterns.join(", ")}`);
  if (score.triggerTokens.length > 0) result.push(`trigger tokens: ${score.triggerTokens.join(", ")}`);
  if (score.titleTokens.length > 0) result.push(`title tokens: ${score.titleTokens.join(", ")}`);
  return result;
}

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
+    // Invalidate caches for the predecessor we modified
+    entryTokenCache.delete(predecessor.metadata.id);
+    compiledScopeCache.delete(predecessor.metadata.id);
+    invalidateScopeRegexMany(scopePaths(predecessor.metadata));
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
+  // Invalidate caches for the new entry so subsequent searches see it
+  entryTokenCache.delete(entry.metadata.id);
+  compiledScopeCache.delete(entry.metadata.id);
+  invalidateScopeRegexMany(scopePaths(entry.metadata));
  return entry.metadata.id;
}

export function readEntry(cwd: string, id: string): string {
  const validator = loadSchemaValidator(cwd);
  return loadEntry(cwd, id, validator).source;
}

export function searchEntries(
  cwd: string,
  query: string,
  options: { readonly path?: string; readonly kind?: string } = {},
): readonly SearchResult[] {
  const normalizedQuery = normalizeText(query);
  const validator = loadSchemaValidator(cwd);
  const directory = entryDirectoryIdentity(cwd);
  let files: string[];
  try {
    files = readdirSync(directory.path, { withFileTypes: true })
      .filter((item) => item.isFile() && item.name.endsWith(".md"))
      .map((item) => item.name)
      .sort();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new EntryCommandError(`cannot read Corpus entries directory: ${detail}`);
  }

  const matched: { entry: LoadedEntry; score: SearchScore }[] = [];
  for (const file of files) {
    const id = file.slice(0, -3);
    const entry = loadEntry(cwd, id, validator);
    if (entry.metadata.status !== "active") continue;
    if (options.kind !== undefined && entry.metadata.kind !== options.kind) continue;
    const paths = scopePaths(entry.metadata);
    if (
      options.path !== undefined &&
      paths !== undefined &&
      !paths.some((pattern) => scopeMatches(pattern, options.path ?? ""))
    ) {
      continue;
    }
    const score = scoreEntry(entry, normalizedQuery, options.path);
    if (
      score.exactTriggers.length === 0 &&
      score.scopePatterns.length === 0 &&
      score.triggerTokens.length === 0 &&
      score.titleTokens.length === 0
    ) {
      continue;
    }
    matched.push({ entry, score });
  }
  assertEntryDirectoryIdentity(cwd, directory.identity);

  return matched
    .sort((left, right) =>
      compareScores(left.score, right.score) ||
      (left.entry.metadata.id < right.entry.metadata.id
        ? -1
        : left.entry.metadata.id > right.entry.metadata.id
          ? 1
          : 0),
    )
    .slice(0, 5)
    .map(({ entry, score }) => ({
      id: entry.metadata.id,
      title: entry.metadata.title,
      kind: entry.metadata.kind as string,
      reasons: reasons(score),
    }));
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
+  // Invalidate caches so searches see the updated content
+  entryTokenCache.delete(existing.metadata.id);
+  compiledScopeCache.delete(existing.metadata.id);
+  invalidateScopeRegexMany(scopePaths(existing.metadata));
+  invalidateScopeRegexMany(scopePaths(updated.metadata));
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
+  // Invalidate caches for the retired entry
+  entryTokenCache.delete(id);
+  compiledScopeCache.delete(id);
+  invalidateScopeRegexMany(scopePaths(existing.metadata));
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
      `candidate activity log is invalid:
