import { join } from "node:path";

import {
  Ajv2020,
  type AnySchema,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import { parse, stringify } from "yaml";

import { type EntryMetadata, EntryCommandError, type ParsedEntry } from "./entry-model.js";
import { corpusPath, readSafeCorpusFile } from "./safe-corpus-fs.js";

export const entryIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const utcTimestampPattern =
  /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?Z$/;

export function requireEntryId(id: string): void {
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

export function loadSchemaValidator(cwd: string): ValidateFunction {
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

export function validUtcTimestamp(value: string): boolean {
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

export function parseEntry(source: string, label: string): ParsedEntry {
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
  if (comment !== null) return /--!?>/.test(line.slice(comment[0].length)) ? null : /--!?>/;
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

export function validateParsedEntry(
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
      throw new EntryCommandError(
        `${label}: metadata/${field} must be a valid RFC 3339 UTC timestamp`,
      );
    }
  }
  if (hasMultipleSentenceBoundary(entry.metadata.title.replace(/[.!?]$/, ""))) {
    throw new EntryCommandError(`${label}: metadata/title must contain exactly one sentence`);
  }
}

export function hasMultipleSentenceBoundary(value: string): boolean {
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

export function serializeEntry(entry: ParsedEntry): string {
  const yaml = stringify(entry.metadata, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n${entry.body.replace(/^\r?\n*/, "")}`;
}
