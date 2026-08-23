# Common Knowledge TypeScript CLI foundation

Status: ready-for-agent

## Objective

Create the executable TypeScript/Node.js foundation for `common-knowledge` and the
external CLI/filesystem testing seam used by every later issue.

## Dependencies

None.

## Relevant user stories

- User stories 1, 13, 16, and 18 in the prototype PRD.

## Acceptance criteria

- The repository contains a reproducible Node.js package with a lockfile,
  TypeScript type checking, and a `common-knowledge` executable.
- The package declares support for Node.js 20 or newer.
- The executable recognizes `init`, `search`, `read`, `add`, `update`, `retire`,
  and `validate`, with useful help and errors for unsupported invocation.
- Commands run relative to an explicit test working directory and do not mutate
  the Common Knowledge development repository during tests.
- The package can be built into a local npm artifact suitable for installation
  in isolated demo environments.
- Focused tests invoke the built CLI as a subprocess and assert exit status,
  standard output, and standard error.
- `AGENTS.md` documents the verified build, type-check, focused-test, full-test,
  and local-package commands created by this issue.
- Type checking and the complete test suite pass.

## Out of scope

- Command behavior beyond argument parsing and placeholder dispatch.
- Corpus creation, Entry parsing, retrieval, or Java fixture work.

## Comments
