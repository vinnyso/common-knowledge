import { readEntry, searchEntries, validateCorpus } from "./entries.js";
import { withCheckoutLock } from "./lock.js";
import type { ProposalDraftInput, ProposalEditInput } from "./proposal-model.js";
import {
  createProposal,
  discardProposal,
  editProposal,
  listProposals,
  readProposal,
} from "./proposals.js";

export interface SearchKnowledgeInput {
  readonly query: string;
  readonly path?: string;
  readonly kind?: string;
}

export function searchKnowledge(
  checkoutRoot: string,
  input: SearchKnowledgeInput,
): ReturnType<typeof searchEntries> {
  return withCheckoutLock(checkoutRoot, "search", () =>
    searchEntries(checkoutRoot, input.query, {
      ...(input.path === undefined ? {} : { path: input.path }),
      ...(input.kind === undefined ? {} : { kind: input.kind }),
    }),
  );
}

export function readKnowledge(checkoutRoot: string, id: string): string {
  return withCheckoutLock(checkoutRoot, "read", () =>
    readEntry(checkoutRoot, id),
  );
}

export function validateKnowledge(checkoutRoot: string): number {
  return withCheckoutLock(checkoutRoot, "validate", () =>
    validateCorpus(checkoutRoot),
  );
}

export function createKnowledgeProposal(
  checkoutRoot: string,
  input: ProposalDraftInput,
): ReturnType<typeof createProposal> {
  return withCheckoutLock(checkoutRoot, "proposal_create", () =>
    createProposal(checkoutRoot, input),
  );
}

export function listKnowledgeProposals(
  checkoutRoot: string,
): ReturnType<typeof listProposals> {
  return withCheckoutLock(checkoutRoot, "proposal_list", () =>
    listProposals(checkoutRoot),
  );
}

export function readKnowledgeProposal(
  checkoutRoot: string,
  id: string,
): ReturnType<typeof readProposal> {
  return withCheckoutLock(checkoutRoot, "proposal_read", () =>
    readProposal(checkoutRoot, id),
  );
}

export function editKnowledgeProposal(
  checkoutRoot: string,
  input: ProposalEditInput,
): ReturnType<typeof editProposal> {
  return withCheckoutLock(checkoutRoot, "proposal_edit", () =>
    editProposal(checkoutRoot, input),
  );
}

export function discardKnowledgeProposal(
  checkoutRoot: string,
  id: string,
  expectedRevision: string,
): string {
  return withCheckoutLock(checkoutRoot, "proposal_discard", () =>
    discardProposal(checkoutRoot, id, expectedRevision),
  );
}
