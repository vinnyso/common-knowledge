# Common Knowledge Corpus initialization and Entry schema

Status: ready-for-agent

## Objective

Implement Corpus initialization and the versioned JSON Schema contract for flat,
repository-local Entries.

## Dependencies

- TypeScript CLI foundation.

## Relevant user stories

- User stories 1, 5, 6, 8, 9, 13, and 19 in the prototype PRD.

## Acceptance criteria

- `common-knowledge init` creates `.repo-memory/README.md`, `schema.json`, `log.md`,
  and an `entries/` directory in the target working directory.
- Entry storage is flat and deterministic: `.repo-memory/entries/<id>.md`.
- `schema.json` implements every required and optional front-matter rule in the
  approved design specification.
- Initialization never overwrites an existing Corpus. Re-running it reports a
  clear, non-zero error without changing existing files.
- Generated operating instructions explain the Corpus structure and point agents
  to the repository-level knowledge protocol without embedding the Corpus.
- Tests invoke the CLI against isolated temporary repositories and verify exact
  observable files, valid schema content, idempotent failure, and diagnostics.
- Type checking and the complete test suite pass.

## Out of scope

- Adding, updating, reading, retiring, or searching Entries.
- Repository-specific configuration.

## Comments
