# ADR-0004: Separate proposal drafting, session acceptance, and PR publication

**Status:** Accepted design; implementation pending
**Date:** 2026-09-09

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
