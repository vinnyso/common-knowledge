# Issue tracker: GitHub Issues and Projects

GitHub Issues are the canonical implementation tracker. Durable product
requirements live in `docs/PRD.md`, and the canonical design lives in
`docs/prototype-spec.md`. The **Common Knowledge Prototype** GitHub Project is the
planning view for issue lifecycle state.

## Conventions

- Use one independently reviewable implementation unit per GitHub Issue.
- Link each implementation issue to `docs/PRD.md` and the relevant canonical
  design sections.
- Use triage labels only for triage state; use the Project `Status` field for
  implementation lifecycle state.
- Record candidate commits, verification, review findings, and handoffs as issue
  comments so the history remains visible to every contributor.
- Follow `docs/agents/review-policy.md` for finding traceability, review budgets,
  and escalation.
- Express dependencies with GitHub issue references and do not start an issue
  until its dependencies are complete.
- `Ready` and `ready-for-agent` mean an issue is fully specified for agent work;
  they do not override its dependency list. Never claim a downstream issue until
  every dependency is `Done`.

When a workflow says to publish to the issue tracker, create or update the
corresponding GitHub Issue and add it to the Common Knowledge Prototype Project.

## Implementation lifecycle

Implementation issues move through these Project states:

```text
Ready -> In Progress -> In Review -> Done
```

- `Ready`: fully specified and queued for an implementation agent; its
  dependencies still govern when work may start.
- `In Progress`: claimed by an agent and moving through implementation,
  independent agent review, and any required fix/re-review cycles.
- `In Review`: the latest candidate has passed independent agent review and is
  awaiting human approval.
- `Done`: independent review has passed and the approved pull request is merged.

Before coding, move the issue to `In Progress`. At each implementation handoff,
comment with the candidate commit, commands run, and results. Push the candidate
to its implementation pull request and keep that pull request in draft while
agent review is pending. Keep the issue in `In Progress` during this work.

Follow [the review policy](review-policy.md) for exact-candidate CI, independent
review, finding classification, verification, and correction budgets. Keep the PR
in draft and the issue `In Progress` throughout that process. The delivery agent
records the consolidated review report once in the issue and links it elsewhere.

When review reports no required findings, comment with the agent-review approval,
mark the pull request ready for human review, and move the issue to `In Review`.
A commit or unresolved review never advances the issue to `In Review`.

Implementation must use a pull request. Its human merge is the approval gate; no
separate Codex-task approval is required. Link the pull request to its issue;
after approval and merge, move the issue to `Done` and close it.

## Maintenance without an issue

When the driving human explicitly authorizes a maintenance PR without an issue,
use the PR as the canonical record for the task contract, candidate commits,
verification, and review reports. Issue creation, triage, and Project transitions
do not apply. The same verification, independent review, and human merge gate
still apply. Keep the PR draft until agent-approved, then mark it ready for human
review.

## Completion and execution boundaries

For authorized delivery, establish the observable outcome, scope, required
evidence, and stopping point from the task and repository policies. Continue
through implementation, verification, CI, and independent review within the
review policy's budget. Routine implementation choices and in-scope corrections
do not require a new approval at each step. Investigate test and CI failures;
expand verification when changed inputs, failures, or unresolved concerns justify
it.

Autonomous delivery is complete when the latest candidate is agent-approved and
the PR is ready for human review, with the issue `In Review` when one exists.
Human merge completes publication. Do not stop at a first implementation while
authorized verification or review remains unfinished.

Pause when proceeding requires missing authorization, resolution of conflicting
requirements, a consequential scope or design change, an unavailable external
prerequisite, or a review-policy escalation. Report the concrete blocker,
evidence, and next decision; continue any unaffected authorized work.
