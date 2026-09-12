# Review policy

Independent review protects the agreed task contract. Deterministic checks own
mechanical standards; reviewers assess requirements, missing cases, and residual
risk. The delivery agent coordinates review directly with `review-candidate`.
This policy is authoritative over reusable skills. Human merge remains the
publication gate; keep the PR draft until its required assessment is complete.

## Contract and evidence

Before implementation, record the originating issue or authorized maintenance
scope, acceptance criteria, applicable specification/standards, operating
assumptions, and fixed point. Before review, add the immutable candidate SHA,
required check results/links, risk tier, reviewer assignment, and bounded review
questions. Record this once in the issue or maintenance PR and link it elsewhere.

Design assessment can explore options before a candidate exists. Candidate
review checks the agreed contract; it cannot enlarge scope or turn workflow
instructions into product guarantees. Changes to architecture, public behavior,
non-goals, or canonical requirements need driving-human direction.

Before a manual client trial, specify its evidence fields: code revision,
client/runtime/model versions and settings, activation and task inputs, ordered
tool names and exact arguments, outcomes, acceptance checks, and isolation limits.
Capture those fields during the first run. Check completeness before ending the
session; do not rerun a successful trial merely to reconstruct omitted metadata
when trustworthy retained evidence supplies it. Record unavailable evidence as a
gap. Never fabricate payloads or commit secrets or full session transcripts.

## Deterministic verification

- `npm run lint` checks TypeScript types and repository text, links, JSON,
  focused-test markers, and package/license metadata.
- `npm run lint:types` applies the small type-aware correctness rule set in
  `eslint.config.mjs`. Formatting preferences are outside this check.
- Behavior tests own known invariants and regressions at the CLI/filesystem seam.
  Convert a discovered defect into an appropriate regression test when feasible.
- Package verification owns packed-install behavior. CodeQL supplies automated
  security analysis; a clean result does not prove every security property.

Implementation runs `npm run preflight` before code/configuration handoff and
checks required by the issue or affected surface. Documentation-only corrections
run repository lint and relevant document checks locally; unchanged application
tests need not be repeated locally. Required CI still applies to every candidate.

Before initial independent review or verification of a revised committed
candidate, `CI / Required checks` must pass on that exact SHA. Earlier green
commits do not qualify. A CI failure returns to implementation; it does not
consume an independent review attempt. Resolve required automated findings before
asking an LLM to inspect the candidate. Do not silently waive required checks.

Reviewers reuse trustworthy exact-candidate CI and unchanged evidence. They do
not repeat lint, full tests, package verification, or security scans without a
specific missing result, changed input, or concrete concern. Any additional probe
must answer a named question, be finite, and be recorded in the report.

## Initial independent review

Use one independent reviewer by default, reporting Standards and Spec separately.
Do not assign a second full-diff reviewer merely because a change is high risk.

| Tier | Changed surface | Default reviewer | Initial timebox |
| --- | --- | --- | --- |
| 1 | Documentation, evidence, runbooks, metadata without runtime behavior | Terra, low effort | 3 minutes |
| 2 | Routine typed implementation or local behavior without a high-risk boundary | Terra, medium effort | 5 minutes |
| 3 | Filesystem/transactions, concurrency, security/privacy, public protocol or diagnostic compatibility, or canonical design | Sol, medium effort | 10 minutes |

The tier selects attention and effort, not an automatic reviewer team. A second
specialist is appropriate only for a recorded risk/question that the primary
assessment cannot adequately cover. Give that specialist the affected paths,
contract, and question; do not duplicate the entire primary assignment. Record
its bounded timebox and resolve its required findings before approval.

The primary initial review covers the complete authored diff and necessary
surrounding context. For generated artifacts such as lockfiles, inspect the
manifest changes, dependency changes, integrity/source information, and available
deterministic consistency evidence; do not spend model context reproducing every
generated line. Record this coverage explicitly, including any unassessed area.

Pass a compact manifest, not the implementation conversation. The reviewer reads
source evidence, not just the author's summary. Standards reports remaining
applicable violations beyond automated coverage; Spec assesses acceptance,
operating assumptions, omissions, and unauthorized behavior. Automated results
support, but do not replace, semantic judgment.

## Findings, Copilot, and corrections

A required finding needs a governing requirement or standard, exact location,
reproducible evidence within supported assumptions, impact, and a bounded fix.
Other useful concerns are advisories. The delivery agent classifies and
deduplicates findings from independent review, human comments, and available
Copilot review into one batch with stable IDs. Verify suggestions against actual
code; neither silence nor a Copilot suggestion establishes correctness. Copilot
is supplemental and does not create a separate approval or correction loop.
Do not request additional Copilot runs merely to satisfy this policy.

The implementing agent makes in-scope corrections, adds relevant regression
coverage, and updates affected docs and the PR guide together. The reviewer does
not implement its own fixes. Keep unrelated improvements as follow-up work.

After fixes, the same reviewer normally checks the complete incremental diff,
carried findings, affected behavior, and regression evidence. Record the prior
reviewed SHA, new SHA, coverage retained, and coverage re-examined. No substantive
new change may inherit approval without this assessment. Repeat full review only
when changed scope, architecture, cross-cutting behavior, invalidated evidence,
or a concrete unassessed risk justifies it; record why. A new commit alone is not
such a reason.

Allow one initial assessment and one substantive correction pass autonomously.
If substantive required findings remain after that pass, stop with evidence and
options for the driving human. Do not start open-ended correction loops or reset
the budget by renaming findings or creating commits. Explicit user scope changes
start a recorded contract revision with applicable findings carried forward.

Once no substantive code/design finding remains, allow one bounded independent
documentation/evidence follow-up without another full code review or extra human
permission. It may close wording alignment or missing evidence for already
reviewed behavior; it cannot alter requirements, hide missing behavioral proof,
or authorize runtime changes. Check the entire incremental document diff and
relevant PR text, reuse valid code verdicts, and record the resulting candidate
approval. If this check still leaves required findings, seek human direction.

Usage or tool interruptions are incomplete work, not new findings or new rounds.
Resume the remaining assessment with retained evidence; do not replay completed
inspection. Timeboxes bound active review, excluding external waits. On reaching
the timebox, report assessed coverage and the remaining question; do not claim
approval or silently extend it. A delivery agent may supply a timestamped live
PR-body snapshot and SHA to resolve a fetch outage; the independent reviewer must
still assess the snapshot, and its freshness must be verified before readiness.

## Human reading guide and handoff

Put a visible `Human review guide` near the top of the PR description, using the
PR template. Keep it short: where to start, the main decision/tradeoff, and what
deserves scrutiny. After human review begins, link changes since the last
human-reviewed SHA. Link evidence instead of duplicating logs.

The guide is informational. Check its accuracy during the existing review; do
not add a reviewer or full review cycle for it. A misleading behavior or safety
claim needs correction. A missing heading, optional detail, or unavailable live
fetch does not by itself invalidate completed code assessment. Record guide gaps
separately and complete the applicable narrow check before claiming it verified.
Human review always retains access to the complete diff and evidence.

Report candidate/fixed point, coverage, separate Standards/Spec verdicts, required
findings, advisories, automated evidence, unresolved gaps, and next action in one
concise canonical report. An incomplete required assessment is not approval.
When required findings and assessments are resolved and exact-candidate CI passes,
mark the PR ready and issue In Review when present. Close the issue only after
human merge, following [the delivery lifecycle](issue-tracker.md).

Observe this policy during ordinary deliveries, without extra benchmark runs.
Record available model/effort, avoidable interventions, repeated work, and useful
findings. Use numeric usage only when actually available; do not infer savings
from elapsed time. Ask whether the guide helped at human-review completion.
Keep the existing three-implementation-PR guide trial count; maintenance PRs do
not reset it. PR #46's first trial was not noticed by the human, who reviewed the
diff directly; it demonstrated no reduction in human review burden.
