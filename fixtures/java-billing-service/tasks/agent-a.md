# Agent A task: investigate a reconciliation rejection

Support reports that reconciliation rejected an invoice because its close date
was `2024-12-31`; the expected close date was `2025-01-01`. An invoice created
at the same recorded moment in another deployment was accepted with the expected
date. The existing test suite passes.

Reproduce the incident with a deterministic regression test that controls the
relevant environmental inputs and passes reliably on any developer machine.
Then diagnose the discrepancy and make the smallest production change that
ensures both deployments produce the expected close date.

Start by following `AGENTS.md`. Once the behavior is understood and resolved,
add or update a concise Common Knowledge Entry if the resolved lesson is likely
to recur. Include concrete retrieval cues and the affected source path, and
commit the Entry with the code change for a later agent.
