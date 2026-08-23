# Common Knowledge agent guidance

## Agent skills

### Issue tracker

Issues and specifications use the repository-local Markdown tracker under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

This project uses the default five-role triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context project: use the root `CONTEXT.md` and `docs/adr/` for durable design decisions. See `docs/agents/domain.md`.

## Before implementation

- Read `CONTEXT.md`, relevant ADRs, `docs/prototype-spec.md`, the prototype PRD,
  and the assigned implementation issue before changing code.
- Work on one `ready-for-agent` issue at a time and verify that its dependencies
  are complete.
- Treat `docs/prototype-spec.md` as canonical when project artifacts conflict.
  Stop and surface a conflict instead of choosing silently.
- Do not implement a future goal unless an issue explicitly brings it into
  scope.

## Implementation workflow

- Follow the issue lifecycle and handoff protocol in
  `docs/agents/issue-tracker.md`.
- Use the build, test, and commit portions of the `implement` workflow in the
  implementation task. Test observable behavior at the CLI/filesystem seam
  agreed in the specification.
- Preserve unrelated working-tree changes.
- Run `code-review` in a separate Codex task from implementation, using the
  pre-implementation fixed point and candidate commit. This separation keeps the
  reviewer independent of the implementation conversation.
- Send required findings back to the implementation task. The implementing agent
  makes fixes, reruns verification, commits the revised candidate, and returns it
  to the separate review task. Repeat until review has no required findings.
- Keep the issue `in-progress` throughout the implementation and agent-review
  loop. Move it to `in-review` only when the latest candidate is agent-approved
  and awaiting the driving human's approval.
- When work has a pull request, use its human approval and merge as the approval
  gate; do not require a duplicate Codex-task approval. Without a pull request,
  record explicit human approval in the local issue.
- Mark an issue `complete` only after its approved pull request is merged, or
  after explicit local approval when no pull request exists.

## Project boundaries

- The CLI and initial library use TypeScript on Node.js.
- The mock application uses Java 21 and the Maven Wrapper.
- V1 excludes hosted services, embeddings, automatic commits, approval-gated
  writes, and repository configuration unless an issue explicitly changes scope.
- Do not self-host Common Knowledge in this repository during v1 unless an issue
  explicitly requests it.

## Commands

Issue 01 establishes the executable build, type-check, test, and package commands.
Update this section with those verified commands as part of that issue; do not
invent commands before they exist.
