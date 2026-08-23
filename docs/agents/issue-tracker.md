# Issue tracker: Local Markdown

Issues and specifications for this repository live as Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`.
- The feature specification is `.scratch/<feature-slug>/PRD.md`.
- Implementation issues are `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`.
- Triage state is recorded as a `Status:` line near the top of an issue file.
- Comments and conversation history append under a `## Comments` heading.

When a workflow says to publish to the issue tracker, create the corresponding
Markdown file beneath `.scratch/`.

## Implementation lifecycle

Implementation issues move through these local workflow states:

```text
ready-for-agent -> in-progress -> in-review -> complete
```

- `ready-for-agent`: specified and dependency-ready for an implementation agent.
- `in-progress`: claimed by an agent and moving through implementation,
  independent agent review, and any required fix/re-review cycles.
- `in-review`: the latest candidate has passed independent agent review and is
  awaiting human approval.
- `complete`: independent review has passed and the approved pull request is
  merged, or explicit local human approval is recorded when no pull request
  exists.

Before coding, replace the issue's `Status:` value with `in-progress`. At each
implementation handoff, append the candidate commit, commands run, and results to
`## Comments`. Keep the issue `in-progress` while agent review is pending.

Implementation and `code-review` run in separate Codex tasks. The review task uses
the pre-implementation fixed point and latest candidate commit and appends its
outcome to the issue. Send required findings to the implementation task; that
agent applies fixes, reruns verification, commits a revised candidate, and sends
it back for another independent review. The review task does not implement its
own fixes.

Repeat the implementation-review loop until the review reports no required
findings. Then append the agent-review approval and set `Status: in-review`. A
commit or unresolved review never advances the issue to `in-review`.

When a pull request exists, its human approval and merge are the approval gate;
no separate Codex-task approval is required. Append the pull request reference
and merge result, then set `Status: complete`. When no pull request exists,
append an explicit local human-approval note before setting `Status: complete`.
