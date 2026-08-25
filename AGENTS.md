# Common Knowledge agent guidance

## Agent skills

### Issue tracker

GitHub Issues are the canonical implementation tracker. See
`docs/agents/issue-tracker.md`.

### Triage labels

This project uses the default five-role triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context project: use the root `CONTEXT.md` and `docs/adr/` for durable design decisions. See `docs/agents/domain.md`.

### Review policy

Required findings, review budgets, and escalation rules are defined in
`docs/agents/review-policy.md`.

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
- Run `npm run preflight` before every implementation handoff. Run the broader
  package verification only when the issue or changed package surface requires
  it.
- Push each candidate commit to its implementation pull request and wait for the
  `CI / Required checks` check to pass for that exact commit before beginning a
  complete independent review or re-review. Keep the pull request in draft until
  the candidate is agent-approved.
- A required CI failure returns the candidate to implementation and does not use
  an autonomous agent-review round. After fixing the failure, push the revised
  candidate and wait for its fresh required check to pass.
- Preserve unrelated working-tree changes.
- Run `code-review` in a separate Codex task from implementation, using the
  pre-implementation fixed point and candidate commit. This separation keeps the
  reviewer independent of the implementation conversation.
- The coordinating agent classifies review findings under
  `docs/agents/review-policy.md`; a reviewer does not expand the issue contract.
- Send in-scope required findings back to the implementation task. The
  implementing agent makes fixes, reruns verification, commits the revised
  candidate, and returns it to the separate review task.
- Autonomously run at most an initial review and one fix/re-review round. If the
  second review still has required findings, stop and ask the driving human for
  direction. A third review requires explicit human approval.
- Stop before a review-driven change would replace an architecture, alter public
  behavior, add a runtime guarantee, or modify the canonical specification.
  Present the finding and options to the driving human instead.
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
- Run dependency-free repository lint and type-checking: `npm run lint`
- Run the required pre-review gate: `npm run preflight`
- Run the focused CLI/filesystem seam tests: `npm run test:focused`
- Run the complete test suite: `npm test`
- Build, pack, install, and execute the local package in isolation:
  `npm run verify:package`
