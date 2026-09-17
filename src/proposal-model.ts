export type ProposalOperation = "add" | "update" | "supersede" | "retire";

export interface ProposalPrecondition {
  readonly id: string;
  readonly state: "absent" | "present";
  readonly fingerprint?: string;
}

export interface ProposalEvidence {
  readonly source: string;
  readonly revision: string;
  readonly observed_fact: string;
  readonly lineage?: string | undefined;
  readonly validator?: string | undefined;
}

export interface ProposalMetadata {
  readonly proposal_version: 1;
  readonly id: string;
  readonly operation: ProposalOperation;
  readonly created_at: string;
  readonly created_by: string;
  readonly revised_at?: string;
  readonly revised_by?: string;
  readonly preconditions: readonly ProposalPrecondition[];
}

export interface ProposalContent {
  readonly evidence: readonly ProposalEvidence[];
  readonly rationale: string;
  readonly proposed_entry?: string | undefined;
  readonly retirement_reason?: string | undefined;
}

export interface ParsedProposal {
  readonly metadata: ProposalMetadata;
  readonly content: ProposalContent;
}

export interface LoadedProposal extends ParsedProposal {
  readonly path: string;
  readonly source: string;
  readonly revision: string;
}

interface ProposalAuthoringInput extends ProposalContent {
  readonly id: string;
  readonly operation: ProposalOperation;
  readonly target_id?: string | undefined;
}

export interface ProposalDraftInput extends ProposalAuthoringInput {
  readonly created_by: string;
}

export interface ProposalEditInput extends ProposalAuthoringInput {
  readonly expected_revision: string;
  readonly revised_by: string;
}

export interface ProposalSummary {
  readonly id: string;
  readonly status: "proposed";
  readonly operation?: ProposalOperation;
  readonly targets: readonly ProposalPrecondition[];
  readonly revision?: string;
  readonly age_days?: number;
  readonly assessment_due?: boolean;
  readonly diagnostics: readonly string[];
}

export interface ProposalInspection {
  readonly summary: ProposalSummary;
  readonly source?: string;
}

export class ProposalCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProposalCommandError";
  }
}

export class StaleProposalRevisionError extends ProposalCommandError {
  constructor(id: string) {
    super(`Proposal ${JSON.stringify(id)} changed; read the latest revision and try again`);
    this.name = "StaleProposalRevisionError";
  }
}
