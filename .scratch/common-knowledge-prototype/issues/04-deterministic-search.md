# Common Knowledge deterministic Trigger and Scope search

Status: ready-for-agent

## Objective

Implement explainable, deterministic retrieval over active Entries using the
approved filtering and ranking contract.

## Dependencies

- Entry lifecycle and activity log.

## Relevant user stories

- User stories 2, 3, 7, 9, and 14 in the prototype PRD.

## Acceptance criteria

- Search normalizes case and whitespace and tokenizes contiguous letters or
  numbers consistently.
- Search excludes non-active Entries before ranking.
- `--kind` applies an exact kind filter.
- `--path` uses repository-relative, forward-slash glob matching: unscoped
  Entries remain eligible, matching scoped Entries remain eligible, and scoped
  Entries applicable only to other paths are excluded.
- Remaining Entries are ordered by the approved descending tuple: exact Trigger
  phrase count, Scope match, Trigger-token overlap, and title-token overlap.
- Entries with no matching evidence are omitted; at most five are returned; ties
  are resolved by ascending Entry ID.
- Every result includes ID, title, kind, and the reasons it matched.
- Equivalent Corpus and query inputs always produce byte-for-byte equivalent
  ordered output.
- Subprocess tests cover exact error-code and phrase Triggers, ordinary tokens,
  Scope matches and mismatches, global Entries, kind filters, Lifecycle filters,
  zero-match queries, result limits, tie-breaking, and explanations.
- Type checking and the complete test suite pass.

## Out of scope

- Body-content search, fuzzy matching, synonyms not listed as Triggers,
  embeddings, vector search, and LLM calls.

## Comments
