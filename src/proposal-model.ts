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
  readonly lineage: string;
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
  readonly future_use: string;
  readonly applicability_and_exceptions: string;
  readonly assumptions_and_unresolved_checks: string;
  readonly intended_destination: string;
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

export interface ProposalDraftInput extends ProposalContent {
  readonly id: string;
  readonly operation: ProposalOperation;
  readonly created_by: string;
  readonly targets: readonly {
    readonly id: string;
    readonly state: "absent" | "present";
  }[];
}

export interface ProposalEditInput extends Omit<ProposalDraftInput, "created_by"> {
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
