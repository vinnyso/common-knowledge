import { createHash } from "node:crypto";

import { parse, stringify } from "yaml";

import { parseEntry, validUtcTimestamp } from "./entry-format.js";
import type {
  ParsedProposal,
  ProposalContent,
  ProposalEvidence,
  ProposalMetadata,
  ProposalOperation,
  ProposalPrecondition,
} from "./proposal-model.js";
import { ProposalCommandError } from "./proposal-model.js";

export const proposalIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
export const proposalRevisionPattern = /^sha256:[a-f0-9]{64}$/u;
const actorPattern = /^(?=\S)(?=.*\S$)[^|\r\n]+$/u;
const operations = new Set<ProposalOperation>(["add", "update", "supersede", "retire"]);
const metadataKeys = new Set([
  "proposal_version",
  "id",
  "operation",
  "created_at",
  "created_by",
  "revised_at",
  "revised_by",
  "preconditions",
]);
function fail(label: string, detail: string): never {
  throw new ProposalCommandError(`${label}: ${detail}`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fail(label, "must be a mapping");
  }
  return value as Record<string, unknown>;
}

function nonBlank(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "" || /[\r\n]/u.test(value)) {
    return fail(label, "must be a non-empty single-line string");
  }
  return value;
}

function actor(value: unknown, label: string): string {
  const result = nonBlank(value, label);
  if (!actorPattern.test(result)) return fail(label, "must be unpadded and must not contain |");
  return result;
}

function proposalId(value: unknown, label: string): string {
  const result = nonBlank(value, label);
  if (!proposalIdPattern.test(result)) return fail(label, "must be a lowercase hyphenated slug");
  return result;
}

function timestamp(value: unknown, label: string, now: Date): string {
  const result = nonBlank(value, label);
  if (!validUtcTimestamp(result)) return fail(label, "must be a valid RFC 3339 UTC timestamp");
  if (Date.parse(result) > now.getTime()) return fail(label, "must not be in the future");
  return result;
}

function parsePreconditions(value: unknown, label: string): readonly ProposalPrecondition[] {
  if (!Array.isArray(value) || value.length === 0) return fail(label, "must be a non-empty list");
  return value.map((item, index) => {
    const target = record(item, `${label}/${index}`);
    const keys = Object.keys(target);
    if (keys.some((key) => key !== "id" && key !== "state" && key !== "fingerprint")) {
      return fail(`${label}/${index}`, "contains an unsupported field");
    }
    const id = proposalId(target.id, `${label}/${index}/id`);
    if (target.state !== "absent" && target.state !== "present") {
      return fail(`${label}/${index}/state`, "must be absent or present");
    }
    if (target.state === "absent") {
      if (target.fingerprint !== undefined) {
        return fail(`${label}/${index}/fingerprint`, "must be omitted for an absent target");
      }
      return { id, state: "absent" };
    }
    if (typeof target.fingerprint !== "string" || !proposalRevisionPattern.test(target.fingerprint)) {
      return fail(`${label}/${index}/fingerprint`, "must be sha256 followed by 64 lowercase hex characters");
    }
    return { id, state: "present", fingerprint: target.fingerprint };
  });
}

function parseMetadata(value: unknown, label: string, now: Date): ProposalMetadata {
  const metadata = record(value, `${label} metadata`);
  const unsupported = Object.keys(metadata).find((key) => !metadataKeys.has(key));
  if (unsupported !== undefined) return fail(label, `metadata contains unsupported field ${JSON.stringify(unsupported)}`);
  if (metadata.proposal_version !== 1) return fail(label, "metadata/proposal_version must be 1");
  const id = proposalId(metadata.id, `${label} metadata/id`);
  if (typeof metadata.operation !== "string" || !operations.has(metadata.operation as ProposalOperation)) {
    return fail(label, "metadata/operation must be add, update, supersede, or retire");
  }
  const created_at = timestamp(metadata.created_at, `${label} metadata/created_at`, now);
  const created_by = actor(metadata.created_by, `${label} metadata/created_by`);
  const hasRevisedAt = metadata.revised_at !== undefined;
  const hasRevisedBy = metadata.revised_by !== undefined;
  if (hasRevisedAt !== hasRevisedBy) {
    return fail(label, "metadata/revised_at and metadata/revised_by must appear together");
  }
  let revised_at: string | undefined;
  let revised_by: string | undefined;
  if (hasRevisedAt) {
    revised_at = timestamp(metadata.revised_at, `${label} metadata/revised_at`, now);
    revised_by = actor(metadata.revised_by, `${label} metadata/revised_by`);
    if (Date.parse(revised_at) < Date.parse(created_at)) {
      return fail(label, "metadata/revised_at must not precede created_at");
    }
  }
  const preconditions = parsePreconditions(metadata.preconditions, `${label} metadata/preconditions`);
  return {
    proposal_version: 1,
    id,
    operation: metadata.operation as ProposalOperation,
    created_at,
    created_by,
    ...(revised_at === undefined ? {} : { revised_at, revised_by: revised_by as string }),
    preconditions,
  };
}

function section(body: string, name: string, next: string): { value: string; rest: string } {
  const prefix = `## ${name}\n\n`;
  if (!body.startsWith(prefix)) return fail("Proposal body", `missing required Markdown section ${JSON.stringify(`## ${name}`)}`);
  const delimiter = `\n## ${next}\n\n`;
  const end = body.indexOf(delimiter, prefix.length);
  if (end === -1) return fail("Proposal body", `missing required Markdown section ${JSON.stringify(`## ${next}`)}`);
  const value = body.slice(prefix.length, end).trim();
  if (value === "") return fail("Proposal body", `${JSON.stringify(`## ${name}`)} must not be empty`);
  return { value, rest: body.slice(end + 1) };
}

function parseEvidence(value: string): readonly ProposalEvidence[] {
  let parsed: unknown;
  try {
    parsed = parse(value);
  } catch (error) {
    const detail = error instanceof Error ? error.message.split("\n")[0] : String(error);
    return fail("Proposal body Evidence", `must be a YAML list: ${detail}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return fail("Proposal body Evidence", "must contain at least one item");
  return parsed.map((value, index) => {
    const item = record(value, `Proposal body Evidence/${index}`);
    const allowed = new Set(["source", "revision", "observed_fact", "lineage", "validator"]);
    const unsupported = Object.keys(item).find((key) => !allowed.has(key));
    if (unsupported !== undefined) return fail(`Proposal body Evidence/${index}`, `contains unsupported field ${JSON.stringify(unsupported)}`);
    return {
      source: nonBlank(item.source, `Proposal body Evidence/${index}/source`),
      revision: nonBlank(item.revision, `Proposal body Evidence/${index}/revision`),
      observed_fact: nonBlank(item.observed_fact, `Proposal body Evidence/${index}/observed_fact`),
      ...(item.lineage === undefined
        ? {}
        : { lineage: nonBlank(item.lineage, `Proposal body Evidence/${index}/lineage`) }),
      ...(item.validator === undefined ? {} : { validator: nonBlank(item.validator, `Proposal body Evidence/${index}/validator`) }),
    };
  });
}

export function parseProposal(source: string, label: string, now = new Date()): ParsedProposal {
  if (source.includes("\r")) return fail(label, "must use LF line endings");
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/u.exec(source);
  if (match === null) return fail(label, "expected YAML front matter delimited by opening and closing --- lines");
  let rawMetadata: unknown;
  try {
    rawMetadata = parse(match[1] ?? "");
  } catch (error) {
    const detail = error instanceof Error ? error.message.split("\n")[0] : String(error);
    return fail(label, `malformed YAML front matter: ${detail}`);
  }
  const metadata = parseMetadata(rawMetadata, label, now);
  const terminal = metadata.operation === "retire" ? "Retirement reason" : "Proposed Entry";
  const evidence = section(match[2] ?? "", "Evidence", "Rationale");
  const rationale = section(evidence.rest, "Rationale", terminal);
  const rest = rationale.rest;
  const terminalPrefix = `## ${terminal}\n\n`;
  if (!rest.startsWith(terminalPrefix)) return fail("Proposal body", `missing required Markdown section ${JSON.stringify(`## ${terminal}`)}`);
  const terminalValue = rest.slice(terminalPrefix.length).trim();
  if (terminalValue === "") return fail("Proposal body", `${JSON.stringify(`## ${terminal}`)} must not be empty`);
  const content: ProposalContent = {
    evidence: parseEvidence(evidence.value),
    rationale: rationale.value,
    ...(metadata.operation === "retire"
      ? { retirement_reason: terminalValue }
      : { proposed_entry: terminalValue.endsWith("\n") ? terminalValue : `${terminalValue}\n` }),
  };
  if (content.proposed_entry !== undefined) parseEntry(content.proposed_entry, `${label} Proposed Entry`);
  return { metadata, content };
}

function normalizedBlock(value: string): string {
  return value.replace(/\r\n?/gu, "\n").trim();
}

export function serializeProposal(proposal: ParsedProposal): string {
  const metadata = stringify(proposal.metadata, { lineWidth: 0 }).trimEnd();
  const evidence = stringify(proposal.content.evidence, { lineWidth: 0 }).trimEnd();
  const terminal = proposal.metadata.operation === "retire" ? "Retirement reason" : "Proposed Entry";
  const terminalValue = proposal.metadata.operation === "retire"
    ? proposal.content.retirement_reason
    : proposal.content.proposed_entry;
  if (terminalValue === undefined) throw new ProposalCommandError(`Proposal ${JSON.stringify(proposal.metadata.id)} is missing ${terminal}`);
  return `---\n${metadata}\n---\n` +
    `## Evidence\n\n${evidence}\n\n` +
    `## Rationale\n\n${normalizedBlock(proposal.content.rationale)}\n\n` +
    `## ${terminal}\n\n${normalizedBlock(terminalValue)}\n`;
}

export function sha256Revision(source: string): string {
  return `sha256:${createHash("sha256").update(source, "utf8").digest("hex")}`;
}
