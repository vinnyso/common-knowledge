import { createHash } from "node:crypto";
import { lstatSync, readdirSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";

import {
  loadSchemaValidator,
  parseEntry,
  serializeEntry,
  validateParsedEntry,
} from "./entry-format.js";
import type { ParsedEntry } from "./entry-model.js";
import {
  parseProposal,
  proposalIdPattern,
  proposalRevisionPattern,
  serializeProposal,
  sha256Revision,
} from "./proposal-format.js";
import {
  type LoadedProposal,
  type ParsedProposal,
  type ProposalDraftInput,
  type ProposalEditInput,
  type ProposalInspection,
  type ProposalPrecondition,
  type ProposalSummary,
  ProposalCommandError,
  StaleProposalRevisionError,
} from "./proposal-model.js";
import {
  assertEntryDirectoryIdentity,
  assertProposalDirectoryIdentity,
  corpusPath,
  ensureProposalDirectory,
  entryDirectoryIdentity,
  entryPath,
  proposalDirectoryIdentity,
  proposalPath,
  readSafeCorpusFile,
} from "./safe-corpus-fs.js";
import { writeChanges } from "./transaction.js";

const dayMilliseconds = 24 * 60 * 60 * 1000;

function detail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireProposalId(id: string): void {
  if (!proposalIdPattern.test(id)) {
    throw new ProposalCommandError(
      `invalid proposal ID ${JSON.stringify(id)}; use a lowercase hyphenated slug`,
    );
  }
}

function pathExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function entryFingerprint(source: string): string {
  return `sha256:${createHash("sha256").update(source, "utf8").digest("hex")}`;
}

function readTargetEntry(
  cwd: string,
  id: string,
): { readonly entry: ParsedEntry; readonly source: string } {
  const path = entryPath(cwd, id);
  if (!pathExists(path)) {
    throw new ProposalCommandError(`Entry target ${JSON.stringify(id)} must be present`);
  }
  const source = readSafeCorpusFile(cwd, path, `Entry target ${JSON.stringify(id)}`);
  const entry = parseEntry(source, `Entry target ${JSON.stringify(id)}`);
  validateParsedEntry(entry, loadSchemaValidator(cwd), `Entry target ${JSON.stringify(id)}`);
  if (entry.metadata.id !== id) {
    throw new ProposalCommandError(
      `Entry target file ${JSON.stringify(basename(path))} declares mismatched ID ${JSON.stringify(entry.metadata.id)}`,
    );
  }
  return { entry, source };
}

function targetPreconditions(
  cwd: string,
  targets: ProposalDraftInput["targets"],
): readonly ProposalPrecondition[] {
  if (targets.length === 0) throw new ProposalCommandError("proposal targets must not be empty");
  const seen = new Set<string>();
  const directory = entryDirectoryIdentity(cwd);
  const result = targets.map((target) => {
    requireProposalId(target.id);
    if (seen.has(target.id)) {
      throw new ProposalCommandError(`proposal target ${JSON.stringify(target.id)} is duplicated`);
    }
    seen.add(target.id);
    const path = entryPath(cwd, target.id);
    if (target.state === "absent") {
      if (pathExists(path)) {
        throw new ProposalCommandError(`Entry target ${JSON.stringify(target.id)} must be absent`);
      }
      return { id: target.id, state: "absent" } as const;
    }
    const { source } = readTargetEntry(cwd, target.id);
    return { id: target.id, state: "present", fingerprint: entryFingerprint(source) } as const;
  });
  assertEntryDirectoryIdentity(cwd, directory.identity);
  return result;
}

function canonicalEntry(cwd: string, source: string, label: string): ParsedEntry {
  const entry = parseEntry(source.replace(/\r\n?/gu, "\n"), label);
  validateParsedEntry(entry, loadSchemaValidator(cwd), label);
  return entry;
}

function requireActive(entry: ParsedEntry, id: string): void {
  if (entry.metadata.status !== "active") {
    throw new ProposalCommandError(
      `Entry target ${JSON.stringify(id)} must be active, not ${entry.metadata.status}`,
    );
  }
}

function validateOperation(
  cwd: string,
  proposal: ParsedProposal,
  compareCurrentTargets: boolean,
): readonly string[] {
  const { metadata, content } = proposal;
  const targets = metadata.preconditions;
  const proposed = content.proposed_entry === undefined
    ? undefined
    : canonicalEntry(cwd, content.proposed_entry, `Proposal ${JSON.stringify(metadata.id)} Proposed Entry`);
  if (metadata.operation === "retire") {
    if (content.retirement_reason === undefined || content.proposed_entry !== undefined) {
      throw new ProposalCommandError("retire proposals require only Retirement reason");
    }
    if (targets.length !== 1 || targets[0]?.state !== "present") {
      throw new ProposalCommandError("retire proposals require one present target");
    }
  } else if (proposed === undefined || content.retirement_reason !== undefined) {
    throw new ProposalCommandError(`${metadata.operation} proposals require only Proposed Entry`);
  }

  if (metadata.operation === "add") {
    if (targets.length !== 1 || targets[0]?.state !== "absent" || proposed?.metadata.id !== targets[0].id) {
      throw new ProposalCommandError("add proposals require the proposed Entry ID as one absent target");
    }
    if (proposed.metadata.status !== "active") {
      throw new ProposalCommandError("an added proposed Entry must have status active");
    }
  }

  if (metadata.operation === "update") {
    const target = targets[0];
    if (targets.length !== 1 || target?.state !== "present" || proposed?.metadata.id !== target.id) {
      throw new ProposalCommandError("update proposals require the proposed Entry ID as one present target");
    }
    if (proposed.metadata.status !== "active") {
      throw new ProposalCommandError("an updated proposed Entry must have status active");
    }
  }

  if (metadata.operation === "supersede") {
    const predecessor = targets[0];
    const replacement = targets[1];
    if (
      targets.length !== 2 ||
      predecessor?.state !== "present" ||
      replacement?.state !== "absent" ||
      proposed?.metadata.supersedes !== predecessor.id ||
      proposed.metadata.id !== replacement.id
    ) {
      throw new ProposalCommandError(
        "supersede proposals require an ordered present predecessor and absent proposed Entry target",
      );
    }
    if (proposed.metadata.status !== "active") {
      throw new ProposalCommandError("a superseding proposed Entry must have status active");
    }
  }

  if (!compareCurrentTargets) return [];
  const diagnostics: string[] = [];
  for (const target of targets) {
    const path = entryPath(cwd, target.id);
    if (target.state === "absent") {
      if (pathExists(path)) diagnostics.push(`target ${target.id} is now present`);
      continue;
    }
    if (!pathExists(path)) {
      diagnostics.push(`target ${target.id} is now absent`);
      continue;
    }
    try {
      const current = readTargetEntry(cwd, target.id);
      const source = current.source;
      if (entryFingerprint(source) !== target.fingerprint) {
        diagnostics.push(`target ${target.id} fingerprint is stale`);
      }
      if (current.entry.metadata.status !== "active") {
        diagnostics.push(`target ${target.id} is ${current.entry.metadata.status}, not active`);
      }
      if (
        metadata.operation === "update" && proposed !== undefined &&
        (proposed.metadata.created_at !== current.entry.metadata.created_at ||
          proposed.metadata.created_by !== current.entry.metadata.created_by)
      ) {
        diagnostics.push(`target ${target.id} creation fields no longer match the proposed Entry`);
      }
    } catch (error) {
      diagnostics.push(`target ${target.id} cannot be checked: ${detail(error)}`);
    }
  }
  return diagnostics;
}

function validateDraftAgainstCurrent(cwd: string, proposal: ParsedProposal): void {
  const { operation, preconditions } = proposal.metadata;
  if (operation === "update") {
    const target = preconditions[0] as ProposalPrecondition;
    const current = readTargetEntry(cwd, target.id).entry;
    const proposed = canonicalEntry(
      cwd,
      proposal.content.proposed_entry as string,
      `Proposal ${JSON.stringify(proposal.metadata.id)} Proposed Entry`,
    );
    requireActive(current, target.id);
    if (
      proposed.metadata.created_at !== current.metadata.created_at ||
      proposed.metadata.created_by !== current.metadata.created_by
    ) {
      throw new ProposalCommandError("updated proposed Entries must preserve created_at and created_by");
    }
  }
  if (operation === "supersede" || operation === "retire") {
    const target = preconditions[0] as ProposalPrecondition;
    requireActive(readTargetEntry(cwd, target.id).entry, target.id);
  }
}

function buildProposal(
  cwd: string,
  input: ProposalDraftInput,
  timestamps: { readonly created_at: string; readonly revised_at?: string; readonly revised_by?: string },
): ParsedProposal {
  requireProposalId(input.id);
  const preconditions = targetPreconditions(cwd, input.targets);
  const canonicalProposedEntry = input.proposed_entry === undefined
    ? undefined
    : serializeEntry(canonicalEntry(
      cwd,
      input.proposed_entry,
      `Proposal ${JSON.stringify(input.id)} Proposed Entry`,
    ));
  const proposal: ParsedProposal = {
    metadata: {
      proposal_version: 1,
      id: input.id,
      operation: input.operation,
      created_at: timestamps.created_at,
      created_by: input.created_by,
      ...(timestamps.revised_at === undefined
        ? {}
        : { revised_at: timestamps.revised_at, revised_by: timestamps.revised_by as string }),
      preconditions,
    },
    content: {
      evidence: input.evidence,
      rationale: input.rationale,
      future_use: input.future_use,
      applicability_and_exceptions: input.applicability_and_exceptions,
      assumptions_and_unresolved_checks: input.assumptions_and_unresolved_checks,
      intended_destination: input.intended_destination,
      ...(canonicalProposedEntry === undefined ? {} : { proposed_entry: canonicalProposedEntry }),
      ...(input.retirement_reason === undefined ? {} : { retirement_reason: input.retirement_reason }),
    },
  };
  const canonical = parseProposal(serializeProposal(proposal), `Proposal ${JSON.stringify(input.id)}`);
  validateOperation(cwd, canonical, false);
  validateDraftAgainstCurrent(cwd, canonical);
  return canonical;
}

function loadProposal(cwd: string, id: string, now = new Date()): LoadedProposal {
  requireProposalId(id);
  if (!pathExists(join(corpusPath(cwd), "proposals"))) {
    throw new ProposalCommandError(`Proposal ${JSON.stringify(id)} does not exist`);
  }
  const directory = proposalDirectoryIdentity(cwd);
  const path = proposalPath(cwd, id);
  if (!pathExists(path)) throw new ProposalCommandError(`Proposal ${JSON.stringify(id)} does not exist`);
  const source = readSafeCorpusFile(cwd, path, `Proposal ${JSON.stringify(id)}`);
  assertProposalDirectoryIdentity(cwd, directory.identity);
  const parsed = parseProposal(source, `Proposal ${JSON.stringify(id)}`, now);
  if (parsed.metadata.id !== id) {
    throw new ProposalCommandError(
      `Proposal file ${JSON.stringify(basename(path))} declares mismatched ID ${JSON.stringify(parsed.metadata.id)}`,
    );
  }
  validateOperation(cwd, parsed, false);
  return { ...parsed, path, source, revision: sha256Revision(source) };
}

function summaryWithCurrentDiagnostics(cwd: string, proposal: LoadedProposal, now: Date): ProposalSummary {
  const basis = proposal.metadata.revised_at ?? proposal.metadata.created_at;
  const ageDays = Math.floor((now.getTime() - Date.parse(basis)) / dayMilliseconds);
  return {
    id: proposal.metadata.id,
    status: "proposed",
    operation: proposal.metadata.operation,
    targets: proposal.metadata.preconditions,
    revision: proposal.revision,
    age_days: ageDays,
    assessment_due: ageDays >= 30,
    diagnostics: validateOperation(cwd, proposal, true),
  };
}

export function createProposal(cwd: string, input: ProposalDraftInput, now = new Date()): ProposalInspection {
  corpusPath(cwd);
  const createdAt = now.toISOString();
  const proposal = buildProposal(cwd, input, { created_at: createdAt });
  const source = serializeProposal(proposal);
  const directory = ensureProposalDirectory(cwd);
  const path = proposalPath(cwd, input.id);
  if (pathExists(path)) throw new ProposalCommandError(`Proposal ${JSON.stringify(input.id)} already exists`);
  assertProposalDirectoryIdentity(cwd, directory.identity);
  writeChanges([{ path, contents: source }], cwd);
  const loaded = { ...proposal, path, source, revision: sha256Revision(source) };
  return { summary: summaryWithCurrentDiagnostics(cwd, loaded, now), source };
}

export function editProposal(cwd: string, input: ProposalEditInput, now = new Date()): ProposalInspection {
  if (!proposalRevisionPattern.test(input.expected_revision)) {
    throw new ProposalCommandError("expected_revision must be sha256 followed by 64 lowercase hex characters");
  }
  const current = loadProposal(cwd, input.id, now);
  if (current.revision !== input.expected_revision) throw new StaleProposalRevisionError(input.id);
  const proposal = buildProposal(
    cwd,
    { ...input, created_by: current.metadata.created_by },
    {
      created_at: current.metadata.created_at,
      revised_at: now.toISOString(),
      revised_by: input.revised_by,
    },
  );
  const source = serializeProposal(proposal);
  if (sha256Revision(readSafeCorpusFile(cwd, current.path, `Proposal ${JSON.stringify(input.id)}`)) !== input.expected_revision) {
    throw new StaleProposalRevisionError(input.id);
  }
  writeChanges([{ path: current.path, contents: source }], cwd);
  const loaded = { ...proposal, path: current.path, source, revision: sha256Revision(source) };
  return { summary: summaryWithCurrentDiagnostics(cwd, loaded, now), source };
}

export function discardProposal(cwd: string, id: string, expectedRevision: string): string {
  requireProposalId(id);
  if (!proposalRevisionPattern.test(expectedRevision)) {
    throw new ProposalCommandError("expected_revision must be sha256 followed by 64 lowercase hex characters");
  }
  if (!pathExists(join(corpusPath(cwd), "proposals"))) {
    throw new ProposalCommandError(`Proposal ${JSON.stringify(id)} does not exist`);
  }
  const directory = proposalDirectoryIdentity(cwd);
  const path = proposalPath(cwd, id);
  if (!pathExists(path)) throw new ProposalCommandError(`Proposal ${JSON.stringify(id)} does not exist`);
  const before = lstatSync(path, { bigint: true });
  const source = readSafeCorpusFile(cwd, path, `Proposal ${JSON.stringify(id)}`);
  if (sha256Revision(source) !== expectedRevision) throw new StaleProposalRevisionError(id);
  assertProposalDirectoryIdentity(cwd, directory.identity);
  const current = lstatSync(path, { bigint: true });
  if (
    before.dev !== current.dev || before.ino !== current.ino ||
    before.mtimeNs !== current.mtimeNs || before.size !== current.size ||
    sha256Revision(source) !== expectedRevision
  ) {
    throw new StaleProposalRevisionError(id);
  }
  unlinkSync(path);
  return id;
}

export function readProposal(cwd: string, id: string, now = new Date()): ProposalInspection {
  requireProposalId(id);
  if (!pathExists(join(corpusPath(cwd), "proposals"))) {
    throw new ProposalCommandError(`Proposal ${JSON.stringify(id)} does not exist`);
  }
  const directory = proposalDirectoryIdentity(cwd);
  const path = proposalPath(cwd, id);
  if (!pathExists(path)) throw new ProposalCommandError(`Proposal ${JSON.stringify(id)} does not exist`);
  const source = readSafeCorpusFile(cwd, path, `Proposal ${JSON.stringify(id)}`);
  assertProposalDirectoryIdentity(cwd, directory.identity);
  const revision = sha256Revision(source);
  try {
    const parsed = parseProposal(source, `Proposal ${JSON.stringify(id)}`, now);
    if (parsed.metadata.id !== id) {
      throw new ProposalCommandError(
        `Proposal file ${JSON.stringify(basename(path))} declares mismatched ID ${JSON.stringify(parsed.metadata.id)}`,
      );
    }
    validateOperation(cwd, parsed, false);
    const proposal = { ...parsed, path, source, revision };
    return { summary: summaryWithCurrentDiagnostics(cwd, proposal, now), source };
  } catch (error) {
    return {
      summary: {
        id,
        status: "proposed",
        targets: [],
        revision,
        diagnostics: [detail(error)],
      },
      source,
    };
  }
}

export function listProposals(cwd: string, now = new Date()): readonly ProposalSummary[] {
  const directoryPath = join(corpusPath(cwd), "proposals");
  if (!pathExists(directoryPath)) return [];
  const directory = proposalDirectoryIdentity(cwd);
  const files = readdirSync(directory.path, { withFileTypes: true })
    .filter((item) => item.name.endsWith(".md"))
    .sort((left, right) => left.name.localeCompare(right.name));
  const results = files.map((file): ProposalSummary => {
    const id = file.name.slice(0, -3);
    if (!file.isFile()) {
      return { id, status: "proposed", targets: [], diagnostics: ["proposal path is not a regular file"] };
    }
    try {
      const proposal = loadProposal(cwd, id, now);
      return summaryWithCurrentDiagnostics(cwd, proposal, now);
    } catch (error) {
      let revision: string | undefined;
      try {
        revision = sha256Revision(readSafeCorpusFile(cwd, proposalPath(cwd, id), `Proposal ${JSON.stringify(id)}`));
      } catch {
        // A safe revision is unavailable; retain the diagnostic without following the path.
      }
      return {
        id,
        status: "proposed",
        targets: [],
        ...(revision === undefined ? {} : { revision }),
        diagnostics: [detail(error)],
      };
    }
  });
  assertProposalDirectoryIdentity(cwd, directory.identity);
  return results;
}
