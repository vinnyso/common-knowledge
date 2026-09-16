# ADR-0004: Separate proposal drafting, session acceptance, and PR publication

**Status:** Accepted
**Date:** 2026-09-09
**Amended:** 2026-09-16

The prototype makes an Entry searchable as soon as an agent writes it, before
human review. For the agent-first phase, agents instead draft proposals outside
accepted guidance; the user accepts or rejects the concrete proposal in the
active session. Acceptance authorizes application to the local Corpus, and the
resulting Entry diff joins the engineering PR for normal review and publication
by merge. This keeps drafting easy without making pending corrections or
retirements change guidance consumed by another session.

Acceptance belongs to the session workflow; CK does not authenticate reviewers
or infer authorization from a boolean, branch, or commit. There is no separate
approval application or extra implementation-task approval gate. Proposal edits
require renewed acceptance, and changed targets require refreshing and presenting
the proposal again. Apply only the accepted content against matching targets.
See the [agent-first contract](../agent-first-spec.md#proposal-contract) for
operation and failure semantics.

A Proposal is an exact candidate change, not a workflow record or a complete
decision dossier. Its required authored content is evidence, rationale, and the
proposed Entry or retirement reason. Applicability, exceptions, assumptions,
future use, and destination are included only when they help explain the change;
they are not separate required fields. The engine derives the affected target
guards and Entry destination from the operation and proposed content. Retirement
is the only operation whose target cannot be derived from a proposed Entry, so
its caller supplies that Entry ID.

Applied changes are immediately visible in that checkout, including to other
sessions using it. Separate checkouts obtain published knowledge through normal
Git distribution; MCP alone supplies neither synchronization nor publication.
Session acceptance does not mean the PR has been approved or merged.

We retain the v1 Entry schema and direct CLI semantics rather than reinterpret
Entry Lifecycle as approval status. We also retain brief read/write operation
locks under [ADR-0002](0002-cooperative-working-tree-lock.md). Skills use the
current agent's task evidence while the engine remains within
[ADR-0003](0003-bound-common-knowledge-to-repository-knowledge.md); application
is not a new governance or orchestration service.

Application validates the exact accepted Proposal revision and its engine-derived
target guards under the operation lock, then uses the existing Entry-and-log
transaction. It removes the Proposal only after that transaction commits. If
removal fails, CK reports that the change applied but cleanup is required. The
remaining Proposal cannot be replayed because its target guard is now stale; a
caller can inspect the accepted Entry and discard the residue. Existing lifecycle
transaction recovery remains authoritative for ambiguous Entry-and-log failures.
CK does not add a delete-capable transaction, Proposal recovery manifest, or
generic recovery workflow solely to make Proposal cleanup atomic.

This trades automatic cleanup in a rare failure for a smaller failure surface.
The safety invariant is at-most-once Entry lifecycle effects, not atomic deletion
of a pending file with an already-protected Entry change.

Pending proposals may themselves be committed and merged without accepting their
content as guidance. Later application or deletion is a separate repository
change. Retain unacknowledged proposals; after 30 days without meaningful revision,
surface a cleanup assessment at a relevant checkpoint. Age triggers reassessment,
not automatic deletion, acceptance, or repeated reminders. This preserves work
across sessions while keeping the user interaction in normal conversation and PRs.
