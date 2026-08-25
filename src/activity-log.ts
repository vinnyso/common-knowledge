import { corpusLog } from "./corpus.js";
import {
  entryIdPattern,
  hasMultipleSentenceBoundary,
  validUtcTimestamp,
} from "./entry-format.js";
import { EntryCommandError } from "./entry-model.js";

const activityEventNames = [
  "entry.created",
  "entry.updated",
  "entry.superseded",
  "entry.retired",
] as const;
type ActivityEventName = (typeof activityEventNames)[number];
const logEvents = new Set<string>(activityEventNames);

export interface ActivityEvent {
  readonly timestamp: string;
  readonly event: ActivityEventName;
  readonly id: string;
  readonly actor: string;
  readonly summary: string;
}

export function generatedSummary(prefix: string, detail: string): string {
  const normalized = `${prefix}${detail.replaceAll("|", "/")}`
    .replace(/[.!?]+$/, "")
    .trim();
  if (normalized.length <= 159) {
    return `${normalized}.`;
  }
  return `${normalized.slice(0, 158).trimEnd()}….`;
}

export function validateLogField(value: string, name: string, maxLength?: number): void {
  if (value.trim() === "" || /[|\r\n]/.test(value)) {
    throw new EntryCommandError(`${name} must be non-empty, single-line, and delimiter-free`);
  }
  if (maxLength !== undefined && value.length > maxLength) {
    throw new EntryCommandError(`${name} must be ${maxLength} characters or fewer`);
  }
}

export function validateActivitySummary(value: string, name = "activity summary"): void {
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

export function appendEvents(
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

export function validateActivityLog(
  contents: string,
  entryIds: ReadonlySet<string>,
): string[] {
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
    if (/^[ \t]*##(?:[ \t]|$)/.test(line)) {
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
      errors.push(
        `log.md:${lineNumber}: activity event must contain exactly five fields separated by " | "`,
      );
      continue;
    }
    if (fields.some((field) => /[|\r\n]/.test(field))) {
      errors.push(
        `log.md:${lineNumber}: activity fields may not contain newlines or the "|" delimiter`,
      );
      continue;
    }
    const [timestamp, event, id, actor, eventSummary] = fields as [
      string,
      string,
      string,
      string,
      string,
    ];
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
