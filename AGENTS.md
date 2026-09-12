# Common Knowledge agent guidance

## Task scope and context

- GitHub Issues are the canonical implementation tracker. Work on one
  `ready-for-agent` issue at a time and verify that its dependencies are complete.
  Explicitly authorized maintenance may use a PR without an issue, as defined in
  [the delivery workflow](docs/agents/issue-tracker.md).
- Before editing, establish the task's acceptance criteria and read applicable
  guidance. Use [the documentation routes](docs/agents/domain.md) to select the
  relevant specification sections, domain context, ADRs, and product intent.
- `docs/prototype-spec.md` is canonical when project artifacts conflict. Surface
  applicable conflicts instead of choosing silently. Do not implement a future
  goal unless an issue explicitly brings it into scope.
- Preserve unrelated working-tree changes.

## Delivery and review

- Use `issue-delivery` for implementation and lifecycle coordination. Follow
  [the delivery workflow](docs/agents/issue-tracker.md) for authorization boundaries,
  completion, PR readiness, and issue transitions. Use
  [the triage vocabulary](docs/agents/triage-labels.md) when managing issue labels.
- Follow [the review policy](docs/agents/review-policy.md) for required verification,
  exact-candidate CI, independent `review-candidate` dispatch, finding
  classification, review tiers, and correction budgets. Read it before delivery
  or candidate review; skills do not add gates or override repository policy.
- Continue authorized delivery through its defined completion point, including
  in-scope fixes and required verification/review. Pause only at an applicable
  boundary in the delivery workflow or review policy.

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
