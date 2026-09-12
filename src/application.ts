import { readEntry, searchEntries, validateCorpus } from "./entries.js";
import { withCheckoutLock } from "./lock.js";

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
