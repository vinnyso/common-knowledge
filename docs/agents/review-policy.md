# Independent review policy

Independent review protects the issue contract without silently enlarging it.
The delivery agent owns the review gate; independent reviewers supply evidence
and findings but do not redefine product scope. Use `issue-delivery` for delivery
and `review-candidate` for candidate review. This policy is authoritative; skills
do not add gates or override its coverage requirements. If a skill is unavailable,
follow the documented procedure and report any unmet independence requirement.

## Design assessment and candidate review

Design assessment explores requirements, options, and tradeoffs with the user.
It is not an implementation correction loop and does not consume review rounds.
Once the user agrees a contract, candidate review checks the resulting change
against it, including documentation that records an accepted design. Such a
design-document candidate remains Tier 3; do not reclassify its review as design
discussion to evade the gate. Only candidate reviews require a committed,
CI-passing candidate. Ordinary self-checks and design discussion may happen earlier.

## Review contract

Before implementation, record the following in the issue or implementation
handoff:

- the fixed point and originating issue or explicitly authorized maintenance scope;
- the canonical specification sections and acceptance criteria;
- relevant repository standards;
- explicit operating assumptions, including any supported concurrency or threat
  model;
- the commands required for implementation handoff and independent review.

Identify the review cycle and the agreed contract revision. A maintenance PR
without an issue may record this manifest in the PR, following existing practice.

An assumption can clarify an existing contract. Changing public behavior,
architecture, non-goals, or the canonical specification requires the driving
human's approval.

## Finding classification

A **required** finding must include all of the following:

1. A citation to an acceptance criterion, canonical specification statement, or
   repository standard that directly governs the changed code.
2. Reproducible evidence from within the documented operating assumptions.
3. A concise explanation of user or repository impact.
4. A bounded, actionable correction.

Repository workflow instructions govern agent behavior unless the product
specification explicitly turns them into runtime requirements. Do not infer a
new product guarantee from an agent-process rule.

A useful concern that fails any required-finding condition is an **advisory**.
Record it as optional follow-up work; it does not block agent approval. Examples
include behavior outside the documented threat model, speculative future scale,
or a robustness improvement unrelated to the originating issue.

The delivery agent must reject or downgrade an untraceable finding instead
of automatically sending it to implementation. Return one consolidated batch
of required findings with stable IDs. Advisories do not automatically trigger
fixes or re-review. Reviewers must not expand the contract through suggestions.
The implementing agent applies the consolidated required fixes, reruns relevant
verification, commits and pushes the revised candidate, and returns it for
independent review under this policy.

## Review tier selection

Before dispatching a review, the coordinating agent selects and records the
review tier, rationale, candidate commit, required verification, and timebox in
the issue or pull-request handoff. The tier controls review depth, not diff
coverage: every tier inspects the complete fixed-point-to-candidate diff and
reports Standards and Spec conclusions separately.

| Tier | Use when the candidate changes | Default review profile | Default timebox |
| --- | --- | --- | --- |
| 1 — low | Documentation, evidence, runbooks, or metadata with no runtime or CLI behavior change | One independent reviewer using Terra at low effort | 3 minutes |
| 2 — routine | Typed implementation or local observable behavior without a high-risk surface | One independent reviewer using Terra at medium effort | 5 minutes |
| 3 — high | Filesystem or transaction behavior, concurrency, security or privacy, parser or diagnostic compatibility, public API or runtime contracts, or canonical design | Separate Standards and Spec reviewers using Sol at medium effort | 10 minutes |

A Tier 1 or Tier 2 reviewer covers both axes in one independent task and reports
them separately. Tier 3 uses two independent reviewers with `review-candidate`,
one per axis; each inspects the complete diff. The delivery agent dispatches
reviewers directly as separate agent tasks, without an intermediate coordinator.
Reviewers do not implement their own fixes.

Send a compact manifest: assignment, issue/specification and policy references,
baseline and candidate SHAs, verification links/results, cycle/round, tier, and
timebox. Do not inherit the implementation conversation by default. Reviewers
read the actual diff and necessary source context, not just its summary. Keep
reports concise (normally under 400 words per axis unless findings require more)
and link verbose evidence. Record the consolidated report once in the canonical
issue or maintenance PR; link it from other handoffs rather than duplicating it.

Elevate to the higher tier before approval when the diff or verification reveals
a higher-risk surface. Do not downgrade a candidate merely because its diff is
small. If a review reaches its timebox without enough evidence, stop and report
the proof gap; do not retry or poll indefinitely. The driving human may direct
an escalation or a longer review.

## Review budget and stop-loss

Each review cycle against an unchanged, agreed contract has an autonomous budget
of two complete review rounds:

1. Initial independent Standards and Spec review.
2. One fresh full re-review after required fixes.

Fresh full re-review means inspecting the complete fixed-point-to-candidate diff
for regressions at the tier selected for the corrected candidate. It does not
reopen product scope or require every unchanged, previously passing expensive
check to run again.

If the second review reports required findings, stop and keep the PR draft and
the issue `In Progress` when one exists. Record the unresolved findings, completed
verification, and options in the canonical issue or maintenance PR. A third
review or another fix cycle against that same contract requires explicit approval
from the driving human.

An explicit user-directed change to requirements or scope starts a new recorded
cycle. Record the instruction, contract delta, new candidate, and cycle identifier;
carry forward unresolved findings still applicable to the new contract. The user
need not separately approve reviewing the change they directed. New cycles retain
full baseline-to-candidate coverage and exact-candidate CI. A new commit, failed
review, agent-proposed redesign, or wording change alone does not reset the budget.
The limit prevents repeated autonomous correction loops, not successive rounds
of user-directed product design across the lifetime of a PR.

Stop earlier and escalate when a proposed review fix would:

- replace a core architecture or state model;
- alter public behavior or introduce a new runtime guarantee;
- change the canonical specification or a declared non-goal;
- add a material dependency solely for an edge case;
- or substantially exceed the issue's expected implementation size.

## Bounded verification

Implementation runs `npm run preflight` before every handoff. It runs full tests
and package verification when required by the task or affected surface. Test
observable behavior at the CLI/filesystem seam agreed in the specification.

Each candidate commit must pass the `CI / Required checks` GitHub Actions check
before a complete independent review begins. The check must belong to the exact
candidate commit under review; a successful check for an earlier commit does not
carry forward. A CI failure returns the candidate to implementation and does not
consume either autonomous review round. The revised candidate must receive a
fresh successful required check before review or re-review.

The reviewer verifies required baseline results for the exact candidate and reuses
trusted implementation/CI evidence. Rerun checks only to resolve missing evidence,
changed inputs, or a concrete concern. Independent probes must be finite and named
in the review report; open-ended fault discovery is not a completion criterion.

On re-review:

- inspect the complete diff;
- verify implementation reran `npm run preflight` and tests relevant to required
  fixes for the revised candidate;
- verify complete tests when shared behavior changed;
- require package, license, or alternate-runtime checks only when their inputs
  changed or the prior result is no longer trustworthy;
- reuse exact-candidate CI and unchanged verification evidence rather than
  repeating checks whose inputs did not change.

## Mechanical follow-ups

After a complete candidate review has no required findings, a strictly mechanical
follow-up may receive a targeted independent check instead of a new full review.
The check does not consume a review round. Keep the PR draft until it completes.
Required CI and implementation preflight still apply to the revised candidate.

Record the previously approved SHA, revised SHA, complete incremental diff, and
why the change cannot alter behavior, requirements, or meaning. One independent
reviewer checks that entire incremental diff, verifies relevant mechanical checks,
and records whether the prior approval extends to the new candidate. Formatting
is not automatically mechanical: Markdown whitespace can change rendering, and
whitespace in code or fixtures can change behavior. A whitespace cleanup qualifies
only when its effect is verified to preserve the intended meaning and behavior.
Changes to dependencies, commands, links, policy, requirements, or runtime behavior
do not qualify merely because they are small. When uncertain, use full review.

This exception cannot clear substantive unresolved findings, bypass a failed CI
check, reset a spent cycle, or transfer approval after unreviewed semantic changes.

## Review report

Report Standards and Spec separately. For each axis, list required findings
first, advisories second, and verification evidence last. Include:

- fixed point and candidate commit;
- review cycle/contract revision and round number (`1 of 2` or `2 of 2`), or the
  prior approved SHA and targeted mechanical-follow-up verdict;
- review tier, rationale, review profile, and timebox outcome;
- exact required-finding citations;
- commands run and summarized results;
- whether the candidate is agent-approved;
- and any follow-up issues recommended for advisories.

The review task never implements its own fixes, changes lifecycle state, or opens
a pull request.
