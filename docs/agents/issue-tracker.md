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

Before a complete independent review or re-review begins, the exact candidate
commit must pass the `CI / Required checks` GitHub Actions check. A CI failure
returns the candidate to implementation and does not consume an autonomous
agent-review round. Every revised candidate must receive a fresh successful
required check; a passing result from an earlier commit is not sufficient.

Implementation and review run in separate Codex tasks. Select and record the
review tier, rationale, candidate commit, required verification, and timebox as
defined in `docs/agents/review-policy.md`. The review task uses the
pre-implementation fixed point and latest candidate commit and comments its
outcome on the issue. Send required findings to the implementation task; that
agent applies fixes, reruns verification, commits a revised candidate, and sends
it back for another independent review. The review task does not implement its
own fixes.

The autonomous review budget is two complete rounds: the initial review and one
fix/re-review. If round two still reports required findings, keep the issue `In
Progress`, publish the unresolved evidence and options, and stop for the driving
human. Do not begin a third review or another architectural redesign without
explicit approval.

Only findings traceable to the issue, canonical specification, or a directly
applicable repository standard block approval. Out-of-scope robustness ideas are
advisories or follow-up issues. The coordinating agent, not the review task,
enforces this boundary.

When review reports no required findings, comment with the agent-review approval,
mark the pull request ready for human review, and move the issue to `In Review`.
A commit or unresolved review never advances the issue to `In Review`.

Implementation must use a pull request. Its human merge is the approval gate; no
separate Codex-task approval is required. Link the pull request to its issue;
after approval and merge, move the issue to `Done` and close it.
