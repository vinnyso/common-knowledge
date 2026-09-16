import { isAbsolute, posix } from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import {
  createKnowledgeProposal,
  discardKnowledgeProposal,
  editKnowledgeProposal,
  listKnowledgeProposals,
  readKnowledge,
  readKnowledgeProposal,
  searchKnowledge,
  validateKnowledge,
} from "./application.js";
import { EntryCommandError } from "./entries.js";
import { ProposalCommandError, StaleProposalRevisionError } from "./proposal-model.js";

const outcomeStatus = z.enum([
  "ok",
  "no_match",
  "missing_corpus",
  "invalid_entry",
  "invalid_proposal",
  "stale_revision",
  "lock_contention",
  "not_found",
  "permission_denied",
  "invalid_input",
  "operation_failed",
]);

const searchResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.string(),
  reasons: z.array(z.string()),
});

const proposalTargetSchema = z.object({
  id: z.string(),
  state: z.enum(["absent", "present"]),
  fingerprint: z.string().optional(),
});

const proposalSummarySchema = z.object({
  id: z.string(),
  status: z.literal("proposed"),
  operation: z.enum(["add", "update", "supersede", "retire"]).optional(),
  targets: z.array(proposalTargetSchema),
  revision: z.string().optional(),
  age_days: z.number().int().nonnegative().optional(),
  assessment_due: z.boolean().optional(),
  diagnostics: z.array(z.string()),
});

const proposalInspectionSchema = z.object({
  summary: proposalSummarySchema,
  source: z.string().optional(),
});

const toolOutcomeSchema = {
  status: outcomeStatus,
  message: z.string().optional(),
  results: z.array(searchResultSchema).optional(),
  entry: z.string().optional(),
  entry_count: z.number().int().nonnegative().optional(),
  proposals: z.array(proposalSummarySchema).optional(),
  proposal: proposalInspectionSchema.optional(),
  proposal_id: z.string().optional(),
};

type ToolOutcome = z.infer<z.ZodObject<typeof toolOutcomeSchema>>;

function outputSummary(summary: import("./proposal-model.js").ProposalSummary) {
  return {
    ...summary,
    targets: summary.targets.map((target) => ({ ...target })),
    diagnostics: [...summary.diagnostics],
  };
}

function outputInspection(inspection: import("./proposal-model.js").ProposalInspection) {
  return {
    summary: outputSummary(inspection.summary),
    ...(inspection.source === undefined ? {} : { source: inspection.source }),
  };
}

function textResult(outcome: ToolOutcome) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(outcome, null, 2) }],
    structuredContent: outcome,
  };
}

function errorCodes(error: unknown): readonly string[] {
  const codes: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    const code = (current as NodeJS.ErrnoException).code;
    if (typeof code === "string") codes.push(code);
    current = current.cause;
  }
  return codes;
}

function failedOutcome(error: unknown): ToolOutcome {
  const message = error instanceof Error ? error.message : String(error);
  if (/checkout lock .* is held/u.test(message)) {
    return { status: "lock_contention", message };
  }
  if (/Corpus not found/u.test(message)) {
    return { status: "missing_corpus", message };
  }
  if (/Entry .* does not exist/u.test(message)) {
    return { status: "not_found", message };
  }
  if (/Proposal .* does not exist/u.test(message)) {
    return { status: "not_found", message };
  }
  if (
    errorCodes(error).some((code) => code === "EACCES" || code === "EPERM") ||
    /EACCES|EPERM|permission denied/u.test(message)
  ) {
    return { status: "permission_denied", message };
  }
  if (error instanceof EntryCommandError && /Proposal|proposals/u.test(message)) {
    return { status: "invalid_proposal", message };
  }
  if (error instanceof EntryCommandError) {
    return { status: "invalid_entry", message };
  }
  if (error instanceof StaleProposalRevisionError) {
    return { status: "stale_revision", message };
  }
  if (error instanceof ProposalCommandError) {
    return { status: "invalid_proposal", message };
  }
  return { status: "operation_failed", message };
}

function validRepositoryPath(value: string): boolean {
  if (
    value === "" ||
    value.includes("\\") ||
    value.includes("\0") ||
    isAbsolute(value) ||
    /^[A-Za-z]:/u.test(value)
  ) {
    return false;
  }
  const segments = value.split("/");
  return !segments.some((segment) => segment === "" || segment === "." || segment === "..") &&
    posix.normalize(value) === value;
}

export function createMcpServer(checkoutRoot: string): McpServer {
  const server = new McpServer(
    { name: "common-knowledge", version: "0.1.0" },
    {
      instructions:
        "Common Knowledge tools are bound to one configured Git checkout. Search and read expose accepted active Entries. Proposal tools author and inspect separate pending artifacts shown as proposed; they do not apply proposals or change accepted Entries. Verify retrieved guidance and proposal evidence against current code.",
    },
  );
  const annotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  } as const;

  server.registerTool(
    "search",
    {
      title: "Search Common Knowledge",
      description:
        "Search active Common Knowledge Entries in the configured checkout using deterministic Trigger and Scope ranking.",
      inputSchema: {
        query: z.string().trim().min(1).max(1000),
        path: z.string().max(4096).refine(validRepositoryPath, {
          message: "path must be a normalized repository-relative path without traversal",
        }).optional(),
        kind: z.enum(["gotcha", "pattern", "anti-pattern", "debugging-note"]).optional(),
      },
      outputSchema: toolOutcomeSchema,
      annotations,
    },
    async (input) => {
      try {
        const results = searchKnowledge(checkoutRoot, {
          query: input.query,
          ...(input.path === undefined ? {} : { path: input.path }),
          ...(input.kind === undefined ? {} : { kind: input.kind }),
        });
        return textResult(
          results.length === 0
            ? { status: "no_match", results: [] }
            : {
                status: "ok",
                results: results.map((result) => ({
                  ...result,
                  reasons: [...result.reasons],
                })),
              },
        );
      } catch (error) {
        return textResult(failedOutcome(error));
      }
    },
  );

  server.registerTool(
    "read",
    {
      title: "Read Common Knowledge Entry",
      description: "Read one Common Knowledge Entry by stable identifier from the configured checkout.",
      inputSchema: {
        id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
      },
      outputSchema: toolOutcomeSchema,
      annotations,
    },
    async ({ id }) => {
      try {
        return textResult({ status: "ok", entry: readKnowledge(checkoutRoot, id) });
      } catch (error) {
        return textResult(failedOutcome(error));
      }
    },
  );

  server.registerTool(
    "validate",
    {
      title: "Validate Common Knowledge Corpus",
      description: "Validate the current Common Knowledge Corpus in the configured checkout.",
      outputSchema: toolOutcomeSchema,
      annotations,
    },
    async () => {
      try {
        return textResult({ status: "ok", entry_count: validateKnowledge(checkoutRoot) });
      } catch (error) {
        return textResult(failedOutcome(error));
      }
    },
  );

  const proposalId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
  const actor = z.string().min(1).max(256).refine((value) => value === value.trim() && !/[|\r\n]/u.test(value), {
    message: "actor must be unpadded, single-line, and must not contain |",
  });
  const proposalTargetInput = z.object({
    id: proposalId,
    state: z.enum(["absent", "present"]),
  });
  const proposalEvidenceInput = z.object({
    source: z.string().trim().min(1).max(4096),
    revision: z.string().trim().min(1).max(512),
    observed_fact: z.string().trim().min(1).max(8000),
    lineage: z.string().trim().min(1).max(512),
    validator: z.string().trim().min(1).max(4096).optional(),
  });
  const proposalContentInput = {
    id: proposalId,
    operation: z.enum(["add", "update", "supersede", "retire"]),
    targets: z.array(proposalTargetInput).min(1).max(2),
    evidence: z.array(proposalEvidenceInput).min(1).max(100),
    rationale: z.string().trim().min(1).max(32000),
    future_use: z.string().trim().min(1).max(32000),
    applicability_and_exceptions: z.string().trim().min(1).max(32000),
    assumptions_and_unresolved_checks: z.string().trim().min(1).max(32000),
    intended_destination: z.string().trim().min(1).max(4096),
    proposed_entry: z.string().min(1).max(256000).optional(),
    retirement_reason: z.string().trim().min(1).max(32000).optional(),
  } as const;

  server.registerTool(
    "proposal_create",
    {
      title: "Create Common Knowledge Proposal",
      description:
        "Create one validated pending proposal. Present-target fingerprints and timestamps are calculated from the configured checkout.",
      inputSchema: {
        ...proposalContentInput,
        created_by: actor,
      },
      outputSchema: toolOutcomeSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        return textResult({
          status: "ok",
          proposal: outputInspection(createKnowledgeProposal(checkoutRoot, input)),
        });
      } catch (error) {
        return textResult(failedOutcome(error));
      }
    },
  );

  server.registerTool(
    "proposal_list",
    {
      title: "List Common Knowledge Proposals",
      description:
        "List pending proposals separately from accepted Entries, including revisions, age assessment, and diagnostics.",
      outputSchema: toolOutcomeSchema,
      annotations,
    },
    async () => {
      try {
        return textResult({
          status: "ok",
          proposals: listKnowledgeProposals(checkoutRoot).map(outputSummary),
        });
      } catch (error) {
        return textResult(failedOutcome(error));
      }
    },
  );

  server.registerTool(
    "proposal_read",
    {
      title: "Read Common Knowledge Proposal",
      description:
        "Read one pending proposal by stable identifier, including its exact revision and current diagnostics.",
      inputSchema: { id: proposalId },
      outputSchema: toolOutcomeSchema,
      annotations,
    },
    async ({ id }) => {
      try {
        return textResult({
          status: "ok",
          proposal: outputInspection(readKnowledgeProposal(checkoutRoot, id)),
        });
      } catch (error) {
        return textResult(failedOutcome(error));
      }
    },
  );

  server.registerTool(
    "proposal_edit",
    {
      title: "Edit Common Knowledge Proposal",
      description:
        "Replace one pending proposal only when its exact expected revision still matches; creation identity is preserved and revision attribution is recorded.",
      inputSchema: {
        ...proposalContentInput,
        expected_revision: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
        revised_by: actor,
      },
      outputSchema: toolOutcomeSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        return textResult({
          status: "ok",
          proposal: outputInspection(editKnowledgeProposal(checkoutRoot, input)),
        });
      } catch (error) {
        return textResult(failedOutcome(error));
      }
    },
  );

  server.registerTool(
    "proposal_discard",
    {
      title: "Discard Common Knowledge Proposal",
      description:
        "Delete only the pending proposal whose exact expected revision still matches. Accepted Entries and the activity log are unchanged.",
      inputSchema: {
        id: proposalId,
        expected_revision: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
      },
      outputSchema: toolOutcomeSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ id, expected_revision }) => {
      try {
        return textResult({
          status: "ok",
          proposal_id: discardKnowledgeProposal(checkoutRoot, id, expected_revision),
        });
      } catch (error) {
        return textResult(failedOutcome(error));
      }
    },
  );

  return server;
}

export async function runMcpServer(checkoutRoot: string): Promise<void> {
  const server = createMcpServer(checkoutRoot);
  await server.connect(new StdioServerTransport());
  process.stderr.write(`Common Knowledge MCP bound to ${checkoutRoot}\n`);
}
