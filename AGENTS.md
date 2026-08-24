# Common Knowledge agent guidance

## Agent skills

### Issue tracker

GitHub Issues are the canonical implementation tracker. See
`docs/agents/issue-tracker.md`.

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
- Keep the issue `In Progress` throughout the implementation and agent-review
  loop. Move it to `In Review` only when the latest candidate is agent-approved
  and awaiting the driving human's approval.
- Implementation must use a pull request. Use its human merge as the approval
  gate; do not require a duplicate Codex-task approval.
- Move an issue to `Done` and close it only after its approved pull request is
  merged.

## Project boundaries

- The CLI and initial library use TypeScript on Node.js.
- The mock application uses Java 21 and the Maven Wrapper.
- V1 excludes hosted services, embeddings, automatic commits, approval-gated
  writes, and repository configuration unless an issue explicitly changes scope.
- Do not self-host Common Knowledge in this repository during v1 unless an issue
  explicitly requests it.

## Commands

- Install reproducibly: `npm ci`
- Build the CLI and library: `npm run build`
- Type-check without emitting files: `npm run typecheck`
- Run the focused CLI/filesystem seam tests: `npm run test:focused`
- Run the complete test suite: `npm test`
- Build, pack, install, and execute the local package in isolation:
  `npm run verify:package`
