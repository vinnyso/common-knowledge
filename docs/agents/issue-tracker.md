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
- Express dependencies with GitHub issue references and do not start an issue
  until its dependencies are complete.
- Leave dependency-blocked issues without a lifecycle status or
  `ready-for-agent` label. Add both only when all dependencies are complete.

When a workflow says to publish to the issue tracker, create or update the
corresponding GitHub Issue and add it to the Common Knowledge Prototype Project.

## Implementation lifecycle

Implementation issues move through these Project states:

```text
Ready -> In Progress -> In Review -> Done
```

- `Ready`: specified and dependency-ready for an implementation agent.
- `In Progress`: claimed by an agent and moving through implementation,
  independent agent review, and any required fix/re-review cycles.
- `In Review`: the latest candidate has passed independent agent review and is
  awaiting human approval.
- `Done`: independent review has passed and the approved pull request is merged.

Before coding, move the issue to `In Progress`. At each implementation handoff,
comment with the candidate commit, commands run, and results. Keep the issue in
`In Progress` while agent review is pending.

Implementation and `code-review` run in separate Codex tasks. The review task uses
the pre-implementation fixed point and latest candidate commit and comments its
outcome on the issue. Send required findings to the implementation task; that
agent applies fixes, reruns verification, commits a revised candidate, and sends
it back for another independent review. The review task does not implement its
own fixes.

Repeat the implementation-review loop until the review reports no required
findings. Then comment with the agent-review approval and move the issue to `In
Review`. A commit or unresolved review never advances the issue to `In Review`.

Implementation must use a pull request. Its human merge is the approval gate; no
separate Codex-task approval is required. Link the pull request to its issue;
after approval and merge, move the issue to `Done` and close it.
