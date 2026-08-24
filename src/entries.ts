import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  Ajv2020,
  type AnySchema,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import { parse, stringify } from "yaml";

import { corpusDirectoryName, corpusLog } from "./corpus.js";
import { writeChanges } from "./transaction.js";

const entryIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const utcTimestampPattern =
  /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?Z$/;
const activityEventNames = [
  "entry.created",
  "entry.updated",
  "entry.superseded",
  "entry.retired",
] as const;
type ActivityEventName = (typeof activityEventNames)[number];
const logEvents = new Set<string>(activityEventNames);

type EntryStatus = "active" | "superseded" | "retired";

type EntryMetadata = Record<string, unknown> & {
  id: string;
  status: EntryStatus;
  title: string;
  created_at: string;
  created_by: string;
  updated_at?: string;
  supersedes?: string;
};

interface ParsedEntry {
  readonly metadata: EntryMetadata;
  readonly body: string;
}

interface LoadedEntry extends ParsedEntry {
  readonly path: string;
  readonly source: string;
}

interface ActivityEvent {
  readonly timestamp: string;
  readonly event: ActivityEventName;
  readonly id: string;
  readonly actor: string;
  readonly summary: string;
}

export class EntryCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntryCommandError";
  }
}

function corpusPath(cwd: string): string {
  const path = join(cwd, corpusDirectoryName);
  if (!existsSync(path)) {
    throw new EntryCommandError(
      `Corpus not found at ${corpusDirectoryName}; run common-knowledge init first`,
    );
  }
  return path;
}

function entryPath(cwd: string, id: string): string {
  return join(corpusPath(cwd), "entries", `${id}.md`);
}

function requireEntryId(id: string): void {
  if (!entryIdPattern.test(id)) {
    throw new EntryCommandError(
      `invalid Entry ID ${JSON.stringify(id)}; use a lowercase hyphenated slug`,
    );
  }
}

function formatAjvError(error: ErrorObject): string {
  const location = error.instancePath === "" ? "metadata" : `metadata${error.instancePath}`;
  if (error.keyword === "required") {
    const property = (error.params as { missingProperty: string }).missingProperty;
    return `metadata is missing required field ${JSON.stringify(property)}`;
  }
  if (error.keyword === "additionalProperties") {
    const property = (error.params as { additionalProperty: string }).additionalProperty;
    return `metadata contains unsupported field ${JSON.stringify(property)}`;
  }
  return `${location} ${error.message ?? "is invalid"}`;
}

function loadSchemaValidator(cwd: string): ValidateFunction {
  const schemaPath = join(corpusPath(cwd), "schema.json");
  let schema: unknown;
  try {
    schema = JSON.parse(readSafeCorpusFile(cwd, schemaPath, "normative schema.json"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new EntryCommandError(`cannot read normative schema.json: ${detail}`);
  }

  try {
    return new Ajv2020({ allErrors: true, strict: false, validateFormats: false }).compile(
      schema as AnySchema,
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new EntryCommandError(`normative schema.json is invalid: ${detail}`);
  }
}

function validUtcTimestamp(value: string): boolean {
  if (!utcTimestampPattern.test(value)) {
    return false;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return false;
  }
  const date = value.slice(0, 10);
  return new Date(parsed).toISOString().slice(0, 10) === date;
}

function parseEntry(source: string, label: string): ParsedEntry {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(source);
  if (match === null) {
    throw new EntryCommandError(
      `${label}: expected YAML front matter delimited by opening and closing --- lines`,
    );
  }

  let metadata: unknown;
  try {
    metadata = parse(match[1] ?? "");
  } catch (error) {
    const detail = error instanceof Error ? error.message.split("\n")[0] : String(error);
    throw new EntryCommandError(`${label}: malformed YAML front matter: ${detail}`);
  }
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new EntryCommandError(`${label}: YAML front matter must be a mapping`);
  }

  const body = match[2] ?? "";
  for (const section of ["Situation", "Resolution"]) {
    if (!hasMarkdownSection(body, section)) {
      throw new EntryCommandError(`${label}: missing required Markdown section "## ${section}"`);
    }
  }

  return { metadata: metadata as EntryMetadata, body };
}

function hasMarkdownSection(body: string, section: string): boolean {
  let fenceCharacter: "`" | "~" | undefined;
  let fenceLength = 0;
  let htmlBlockEnd: RegExp | undefined;
  for (const line of body.split(/\r?\n/)) {
    if (htmlBlockEnd !== undefined) {
      if (htmlBlockEnd.test(line)) {
        htmlBlockEnd = undefined;
      }
      continue;
    }
    if (fenceCharacter !== undefined) {
      const closingFence = new RegExp(
        `^ {0,3}\\${fenceCharacter}{${fenceLength},}[ \\t]*$`,
      );
      if (closingFence.test(line)) {
        fenceCharacter = undefined;
        fenceLength = 0;
      }
      continue;
    }

    const openingFence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (openingFence !== null) {
      const marker = openingFence[1];
      const remainder = openingFence[2] ?? "";
      if (marker !== undefined && !(marker.startsWith("`") && remainder.includes("`"))) {
        fenceCharacter = marker[0] as "`" | "~";
        fenceLength = marker.length;
        continue;
      }
    }

    const htmlBlock = htmlRawBlockEnd(line);
    if (htmlBlock !== undefined) {
      if (htmlBlock !== null) {
        htmlBlockEnd = htmlBlock;
      }
      continue;
    }

    if (new RegExp(`^ {0,3}##[ \\t]+${section}(?:[ \\t]+#+)?[ \\t]*$`).test(line)) {
      return true;
    }
  }
  return false;
}

function htmlRawBlockEnd(line: string): RegExp | null | undefined {
  const comment = /^ {0,3}<!--/.exec(line);
  if (comment !== null) return /-->/.test(line.slice(comment[0].length)) ? null : /-->/;
  const rawTagMatch = /^ {0,3}<(script|pre|style|textarea)(?:[ \\t>]|$)/i.exec(line);
  const rawTag = rawTagMatch?.[1];
  if (rawTag !== undefined && rawTagMatch !== null) {
    const end = new RegExp(`</${rawTag}[ \\t]*>`, "i");
    return end.test(line.slice(rawTagMatch[0].length)) ? null : end;
  }
  const processing = /^ {0,3}<\?/.exec(line);
  if (processing !== null) return /\?>/.test(line.slice(processing[0].length)) ? null : /\?>/;
  const cdata = /^ {0,3}<!\[CDATA\[/.exec(line);
  if (cdata !== null) return /\]\]>/.test(line.slice(cdata[0].length)) ? null : /\]\]>/;
  const declaration = /^ {0,3}<![A-Z]/.exec(line);
  if (declaration !== null) return />/.test(line.slice(declaration[0].length)) ? null : />/;
  if (/^ {0,3}<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:[ \\t>/]|$)/i.test(line)) {
    return /^[ \\t]*$/;
  }
  if (/^ {0,3}<\/?[A-Za-z][A-Za-z0-9-]*(?:[ \\t][^>]*)?>[ \\t]*$/.test(line)) {
    return /^[ \\t]*$/;
  }
  return undefined;
}

function validateParsedEntry(
  entry: ParsedEntry,
  validator: ValidateFunction,
  label: string,
): void {
  if (
    typeof entry.metadata.created_by === "string" &&
    (entry.metadata.created_by.includes("|") ||
      entry.metadata.created_by !== entry.metadata.created_by.trim())
  ) {
    throw new EntryCommandError(
      `${label}: metadata/created_by must have no surrounding whitespace or "|" activity-log delimiter`,
    );
  }
  if (!validator(entry.metadata)) {
    const diagnostics = (validator.errors ?? []).map(formatAjvError).join("; ");
    throw new EntryCommandError(`${label}: ${diagnostics}`);
  }
  for (const field of ["created_at", "updated_at"] as const) {
    const value = entry.metadata[field];
    if (value !== undefined && !validUtcTimestamp(value)) {
      throw new EntryCommandError(`${label}: metadata/${field} must be a valid RFC 3339 UTC timestamp`);
    }
  }
  if (hasMultipleSentenceBoundary(entry.metadata.title.replace(/[.!?]$/, ""))) {
    throw new EntryCommandError(`${label}: metadata/title must contain exactly one sentence`);
  }
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
        throw new EntryCommandError(`${label} uses symbolic-link component ${JSON.stringify(component)} and must not use symbolic links`);
      }
      const final = index === parts.length - 1;
      if ((!final && !stat.isDirectory()) || (final && !stat.isFile())) {
        throw new EntryCommandError(`${label} must use ordinary Corpus directories and a regular file`);
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

function readSafeCorpusFile(cwd: string, path: string, label: string): string {
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

function serializeEntry(entry: ParsedEntry): string {
  const yaml = stringify(entry.metadata, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n${entry.body.replace(/^\r?\n*/, "")}`;
}

function loadEntry(cwd: string, id: string, validator: ValidateFunction): LoadedEntry {
  requireEntryId(id);
  const path = entryPath(cwd, id);
  if (!existsSync(path)) {
    throw new EntryCommandError(`Entry ${JSON.stringify(id)} does not exist`);
  }
  const source = readSafeCorpusFile(cwd, path, `Entry path ${JSON.stringify(relative(resolve(cwd), path))}`);
  const parsed = parseEntry(source, `Entry ${JSON.stringify(id)}`);
  validateParsedEntry(parsed, validator, `Entry ${JSON.stringify(id)}`);
  if (parsed.metadata.id !== id) {
    throw new EntryCommandError(
      `Entry file ${JSON.stringify(basename(path))} declares mismatched ID ${JSON.stringify(parsed.metadata.id)}`,
    );
  }
  return { ...parsed, path, source };
}

function readInputEntry(cwd: string, inputFile: string, validator: ValidateFunction): ParsedEntry {
  const path = resolve(cwd, inputFile);
  let source: string;
  try {
    source = readFileSync(path, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new EntryCommandError(`cannot read Entry file ${JSON.stringify(inputFile)}: ${detail}`);
  }
  const entry = parseEntry(source, `Entry file ${JSON.stringify(inputFile)}`);
  validateParsedEntry(entry, validator, `Entry file ${JSON.stringify(inputFile)}`);
  return entry;
}

function nowUtc(): string {
  return new Date().toISOString();
}

function generatedSummary(prefix: string, detail: string): string {
  const normalized = `${prefix}${detail.replaceAll("|", "/")}`
    .replace(/[.!?]+$/, "")
    .trim();
  if (normalized.length <= 159) {
    return `${normalized}.`;
  }
  return `${normalized.slice(0, 158).trimEnd()}….`;
}

function validateLogField(value: string, name: string, maxLength?: number): void {
  if (value.trim() === "" || /[|\r\n]/.test(value)) {
    throw new EntryCommandError(`${name} must be non-empty, single-line, and delimiter-free`);
  }
  if (maxLength !== undefined && value.length > maxLength) {
    throw new EntryCommandError(`${name} must be ${maxLength} characters or fewer`);
  }
}

function validateActivitySummary(value: string, name = "activity summary"): void {
  validateLogField(value, name, 160);
  const withoutTerminator = value.slice(0, -1);
  if (
    !/[\p{L}\p{N}]/u.test(value) ||
    !/[.!?]$/.test(value) ||
    /[!?]/.test(withoutTerminator) ||
    hasMultipleSentenceBoundary(withoutTerminator)
  ) {
    throw new EntryCommandError(
      `${name} must be exactly one sentence ending in punctuation`,
    );
  }
}

function hasMultipleSentenceBoundary(value: string): boolean {
  const technicalSuffixes = new Set([
    "com", "dev", "io", "js", "json", "md", "net", "org", "ts", "tsx", "yaml", "yml",
  ]);
  const abbreviationPeriods = new Set<number>();
  for (const abbreviation of value.matchAll(/\b(?:e\.g|i\.e)\./giu)) {
    const start = abbreviation.index ?? 0;
    abbreviationPeriods.add(start + 1);
    abbreviationPeriods.add(start + 3);
  }
  for (const match of value.matchAll(/\./gu)) {
    const index = match.index ?? 0;
    const after = value.slice(index + 1);
    if (abbreviationPeriods.has(index)) continue;
    if (/^\p{Lu}{2,}(?:\b|$)/u.test(after)) continue;
    if (/^\s/.test(after)) return true;
    const left = /([\p{L}\p{N}]+)$/u.exec(value.slice(0, index))?.[1] ?? "";
    const right = /^([\p{L}\p{N}]+)/u.exec(after)?.[1] ?? "";
    const versionPeriod = /^v?\d+$/i.test(left) && /^\d+$/.test(right);
    const acronymPeriod = /^[A-Z]{2,}$/.test(left) && /^[A-Z]{2,}$/.test(right);
    const tokenStart = value.slice(0, index).search(/[\p{L}\p{N}]+(?:\.[\p{L}\p{N}]+)*$/u);
    const tokenPrefix = tokenStart >= 0 ? value.slice(tokenStart, index) : left;
    const tokenSuffix = /^([\p{L}\p{N}]+(?:\.[\p{L}\p{N}]+)*)/u.exec(after)?.[1] ?? right;
    const finalSegment = `${tokenPrefix}.${tokenSuffix}`.split(".").at(-1) ?? "";
    const suffixPeriod = technicalSuffixes.has(finalSegment.toLowerCase());
    if (!versionPeriod && !acronymPeriod && !suffixPeriod) return true;
  }
  return /[!?](?=\s*\S)/u.test(value);
}

function appendEvents(
  existingLog: string,
  events: readonly ActivityEvent[],
): string {
  let result = existingLog.endsWith("\n") ? existingLog : `${existingLog}\n`;
  for (const event of events) {
    validateLogField(event.actor, "activity actor");
    validateActivitySummary(event.summary);
    const heading = `## ${event.timestamp.slice(0, 10)}`;
    const lastHeading = [...result.matchAll(/^## (\d{4}-\d{2}-\d{2})$/gm)].at(-1)?.[0];
    if (lastHeading !== heading) {
      result += `${result.endsWith("\n\n") ? "" : "\n"}${heading}\n\n`;
    }
    result += `- ${event.timestamp} | ${event.event} | ${event.id} | ${event.actor} | ${event.summary}\n`;
  }
  return result;
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

function entryDirectoryIdentity(cwd: string): { path: string; identity: string } {
  const path = join(resolve(cwd), corpusDirectoryName, "entries");
  const corpus = join(resolve(cwd), corpusDirectoryName);
  for (const [component, label] of [
    [corpus, "Corpus directory"],
    [path, "Corpus entries directory"],
  ] as const) {
    const stat = lstatSync(component, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new EntryCommandError(`${label} must be an ordinary directory without symbolic links`);
    }
  }
  const resolvedCorpus = realpathSync(corpus);
  const resolvedEntries = realpathSync(path);
  if (relative(resolvedCorpus, resolvedEntries) !== "entries") {
    throw new EntryCommandError(`Corpus entries directory resolves outside ${corpusDirectoryName}`);
  }
  const stat = lstatSync(path, { bigint: true });
  return { path, identity: `${stat.dev}:${stat.ino}:${stat.mtimeNs}:${stat.size}` };
}

function assertEntryDirectoryIdentity(cwd: string, expected: string): void {
  if (entryDirectoryIdentity(cwd).identity !== expected) {
    throw new EntryCommandError("Corpus entries directory changed during validation");
  }
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
    validateParsedEntry(updatedPredecessor, validator, `Entry ${JSON.stringify(predecessor.metadata.id)}`);
    changes.push({ path: predecessor.path, contents: serializeEntry(updatedPredecessor) });
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
  validateParsedEntry(updated, validator, `Entry ${JSON.stringify(existing.metadata.id)}`);
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

function validateActivityLog(contents: string, entryIds: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  let heading: string | undefined;
  let previousHeading: string | undefined;
  const headings = new Set<string>();
  const lines = contents.split(/\r?\n/);
  const preamble = corpusLog.trimEnd().split("\n");
  if (!preamble.every((line, index) => lines[index] === line)) {
    errors.push("log.md:1: activity log must begin with the canonical Corpus preamble");
  }
  for (let index = preamble.length; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const lineNumber = index + 1;
    const headingMatch = /^## (\d{4}-\d{2}-\d{2})$/.exec(line);
    if (headingMatch !== null) {
      const nextHeading = headingMatch[1];
      if (nextHeading === undefined) {
        continue;
      }
      heading = nextHeading;
      if (!validUtcTimestamp(`${heading}T00:00:00Z`)) {
        errors.push(`log.md:${lineNumber}: invalid UTC date heading`);
      }
      if (headings.has(heading)) {
        errors.push(`log.md:${lineNumber}: duplicate UTC date heading ${heading}`);
      }
      if (previousHeading !== undefined && heading < previousHeading) {
        errors.push(`log.md:${lineNumber}: UTC date headings must be chronological`);
      }
      headings.add(heading);
      previousHeading = heading;
      continue;
    }
    if (/^[ \\t]*##(?:[ \\t]|$)/.test(line)) {
      errors.push(`log.md:${lineNumber}: invalid UTC date heading ${JSON.stringify(line)}`);
      heading = undefined;
      continue;
    }
    if (!line.startsWith("- ")) {
      if (line.trim() !== "") {
        errors.push(
          `log.md:${lineNumber}: unexpected content; expected a UTC date heading or five-field activity event`,
        );
      }
      continue;
    }
    if (heading === undefined) {
      errors.push(`log.md:${lineNumber}: activity event must follow a UTC date heading`);
      continue;
    }
    const fields = line.slice(2).split(" | ");
    if (fields.length !== 5) {
      errors.push(`log.md:${lineNumber}: activity event must contain exactly five fields separated by " | "`);
      continue;
    }
    if (fields.some((field) => /[|\r\n]/.test(field))) {
      errors.push(`log.md:${lineNumber}: activity fields may not contain newlines or the "|" delimiter`);
      continue;
    }
    const [timestamp, event, id, actor, eventSummary] = fields as [string, string, string, string, string];
    if (!validUtcTimestamp(timestamp)) {
      errors.push(`log.md:${lineNumber}: invalid RFC 3339 UTC timestamp`);
    } else if (timestamp.slice(0, 10) !== heading) {
      errors.push(`log.md:${lineNumber}: timestamp date must match heading ${heading}`);
    }
    if (!logEvents.has(event)) {
      errors.push(`log.md:${lineNumber}: unsupported event type ${JSON.stringify(event)}`);
    }
    if (!entryIdPattern.test(id) || !entryIds.has(id)) {
      errors.push(`log.md:${lineNumber}: referenced Entry ${JSON.stringify(id)} does not exist`);
    }
    if (actor.trim() === "") {
      errors.push(`log.md:${lineNumber}: actor must not be blank`);
    } else if (actor !== actor.trim()) {
      errors.push(`log.md:${lineNumber}: actor must not have surrounding whitespace`);
    }
    try {
      validateActivitySummary(eventSummary);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      errors.push(`log.md:${lineNumber}: ${detail}`);
    }
  }
  return errors;
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
      const source = readSafeCorpusFile(cwd, path, `Entry path ${JSON.stringify(`entries/${file}`)}`);
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
      errors.push(`${entry.metadata.id}: supersedes missing Entry ${JSON.stringify(predecessorId)}`);
    } else if (predecessor.metadata.status !== "superseded") {
      errors.push(`${entry.metadata.id}: predecessor ${JSON.stringify(predecessorId)} must have status superseded`);
    }
    if (supersededTargets.has(predecessorId)) {
      errors.push(`${entry.metadata.id}: predecessor ${JSON.stringify(predecessorId)} is superseded by multiple Entries`);
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
    throw new EntryCommandError(`Corpus validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }
  return entries.size;
}
