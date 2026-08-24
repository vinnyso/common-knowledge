# Independent review policy

Independent review protects the issue contract without silently enlarging it.
The coordinating agent owns the review gate; review agents supply evidence and
findings but do not redefine product scope.

## Review contract

Before implementation, record the following in the issue or implementation
handoff:

- the fixed point and originating issue;
- the canonical specification sections and acceptance criteria;
- relevant repository standards;
- explicit operating assumptions, including any supported concurrency or threat
  model;
- the commands required for implementation handoff and independent review.

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

The coordinating agent must reject or downgrade an untraceable finding instead
of automatically sending it to implementation.

## Review budget and stop-loss

Each issue has an autonomous budget of two complete review rounds:

1. Initial independent Standards and Spec review.
2. One fresh full re-review after required fixes.

Fresh full re-review means inspecting the complete fixed-point-to-candidate diff
for regressions. It does not reopen product scope or require every unchanged,
previously passing expensive check to run again.

If the second review reports required findings, stop with the issue `In
Progress`. Comment with the unresolved findings, completed verification, and
options. A third review or another fix cycle requires explicit approval from the
driving human.

Stop earlier and escalate when a proposed review fix would:

- replace a core architecture or state model;
- alter public behavior or introduce a new runtime guarantee;
- change the canonical specification or a declared non-goal;
- add a material dependency solely for an edge case;
- or substantially exceed the issue's expected implementation size.

## Bounded verification

Implementation runs `npm run preflight` before every handoff. It runs full tests
and package verification when required by the issue or affected surface.

The initial independent review runs the documented baseline plus targeted checks
derived from acceptance criteria and changed risk surfaces. Independent probes
must be finite and named in the review report; open-ended fault discovery is not
a completion criterion.

On re-review:

- inspect the complete diff;
- rerun `npm run preflight` and tests relevant to every required fix;
- rerun the complete test suite when shared behavior changed;
- rerun package, license, or alternate-runtime checks only when their inputs
  changed or the prior result is no longer trustworthy.

## Review report

Report Standards and Spec separately. For each axis, list required findings
first, advisories second, and verification evidence last. Include:

- fixed point and candidate commit;
- review round number (`1 of 2` or `2 of 2`);
- exact required-finding citations;
- commands run and summarized results;
- whether the candidate is agent-approved;
- and any follow-up issues recommended for advisories.

The review task never implements its own fixes, changes lifecycle state, or opens
a pull request.
