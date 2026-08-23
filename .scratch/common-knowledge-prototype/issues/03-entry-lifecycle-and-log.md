# Common Knowledge Entry lifecycle and activity log

Status: ready-for-agent

## Objective

Implement Entry parsing, validation, reading, direct working-tree writes, and the
complete v1 Lifecycle with terse activity logging.

## Dependencies

- Corpus initialization and Entry schema.

## Relevant user stories

- User stories 4 through 10, 17 through 20 in the prototype PRD.

## Acceptance criteria

- `add` validates an input Entry, rejects duplicate IDs, and writes it to the
  flat path derived from its ID.
- `read` returns the complete Entry identified by ID and fails clearly when it is
  missing.
- `update` validates the replacement, requires an existing matching ID,
  preserves `created_at` and `created_by`, and sets `updated_at`.
- `retire` requires a concise reason, changes the target status to `retired`, and
  sets `updated_at`.
- Adding an Entry with `supersedes` requires an existing active predecessor,
  atomically marks that predecessor `superseded`, and leaves no partial changes
  if validation fails.
- Every successful mutation appends the correct `entry.created`,
  `entry.updated`, `entry.superseded`, or `entry.retired` event to `log.md`.
- Log lines follow the approved five-field format; summaries are pertinent,
  single-line, delimiter-free, and no longer than 160 characters.
- `validate` checks every Entry, global ID uniqueness, semantic supersession
  references, required Markdown sections, log structure, log dates, event types,
  and referenced Entry IDs.
- Commands modify only Corpus files and never stage, commit, or push Git changes.
- Subprocess tests cover successful behavior, malformed input, missing Entries,
  duplicates, invalid transitions, atomic failure, and concise diagnostics.
- Type checking and the complete test suite pass.

## Out of scope

- Search and ranking.
- Automatic approval, commits, maintenance, expiry, or promotion.

## Comments
