# Common Knowledge agent-first specification and PRD

**Status:** Next-phase contract; capabilities below are planned, not implemented.
**Date:** 2026-09-10
**Design issue:** [#35 (AF-01)](https://github.com/vinnyso/common-knowledge/issues/35)

## Authority and starting point

This document is the canonical design and implementation requirements for the
agent-first phase. The completed [prototype specification](prototype-spec.md)
and [prototype PRD](PRD.md) remain the contract for existing v0.1.0 behavior.
This document supersedes their direct-write agent workflow for the new proposal
path and their deferral of harness integration. Unchanged Entry, retrieval,
validation, transaction, and CLI contracts continue to apply. An assigned issue
must explicitly bring a milestone into implementation scope; this roadmap does
not authorize implementing all milestones. Surface other conflicts rather than
silently changing either contract.

The baseline is `47d44f57882ffb98dd59f7a857322966a5664b9f`. It supplies the
TypeScript/Node engine, deterministic active-entry retrieval, lifecycle commands,
validation, safe filesystem operations, and a recorded
[clean-clone handoff](two-agent-handoff.md). It has no MCP adapter, proposal
operations, Reflection skill, or plugin installer. Existing CLI commands keep
their direct working-tree semantics; no implicit migration or Entry-schema
change is introduced by this phase's design.

## Product outcome and workflow

Agents use repository knowledge throughout ordinary engineering work. Reflection
consolidates lessons worth preserving, users accept local changes in the active
session, and normal PR review publishes them. The engine remains a repository
knowledge tool under [ADR-0003](adr/0003-bound-common-knowledge-to-repository-knowledge.md).

The phase goal is **Prove the CK Learning Loop**: Recall → Work → Reflect →
human review → Preserve → future recall. The agent-first roadmap supplies the
implementation path; a lightweight evaluation suite measures whether retrieved
knowledge changes engineering outcomes. Working integration alone is insufficient
evidence of improved outcomes. Evaluation is development support outside the
engine, not a new engine responsibility or a competing roadmap.

1. Before relevant work, the agent searches CK and reads applicable evidence.
2. During work, it consults CK when errors, new areas, or questions arise and
   checks guidance against current code and evidence.
3. Before handing off meaningful work, the current agent performs Reflection,
   checks overlap, and drafts zero or one focused proposal by default.
4. The user accepts or rejects the concrete proposal in the active session.
   Acceptance authorizes local application; the resulting knowledge diff joins
   the engineering PR. Normal human PR review/merge publishes those changes.
5. Subsequent sessions retrieve available accepted guidance and reassess its
   applicability to their current checkout.

Manual requests to remember or reflect remain supported. Drafting a proposal
requires no separate permission. Installed instructions and skills must cause
consultation and Reflection during a normal task; tool availability alone does
not prove this behavior. The demo must exercise it without an explicit CK request.

## Responsibilities

| Component | Responsibility |
| --- | --- |
| Engine | Corpus, deterministic retrieval, validation, safe proposal and Entry operations. |
| Local MCP adapter | Structured operations bound to one explicitly configured checkout. |
| Agent protocol and skills | Query formation, applicability checks, task-context evidence, Reflection, and proposal authoring. |
| Plugin | Discoverable setup of the adapter, skills, and necessary supported activation instructions. |
| User and repository workflow | Session acceptance and ordinary PR review/publication. |

Reflection uses the current coding agent's task context. CK does not observe
sessions, ingest transcripts, call a separate model, determine task completion,
or own orchestration or repository governance. A recommendation to add a test,
instruction, skill, or CI rule remains guidance; ordinary engineering work owns
that destination change. A reference does not prove semantic enforcement.

## Proposal contract

Store pending proposals under `.repo-memory/proposals/`, separate from canonical
`entries/`. Default search and Entry reads must not treat proposal content as
accepted guidance. Proposal list/read operations expose pending work explicitly.
Malformed proposals must not prevent retrieval of otherwise valid Entries;
proposal validation reports their errors separately from Entry validation.
Preserve the v1 Entry schema and define a small adjacent versioned proposal
format in AF-03, without introducing a generic workflow engine.

A proposal identifies its stable proposal ID, intended operation (add, update,
supersede, or retire), target IDs where applicable, the target revision/content
fingerprints observed at drafting, proposed Entry content or retirement reason,
author attribution, creation and last meaningful revision timestamps,
and concise evidence and rationale. Include the observation, supporting source
references, future action, applicability/exception, and intended destination.
For a new Entry, the precondition includes absence of its ID; supersession checks
both the predecessor and the new ID. Mechanical source checks can detect missing
repository references where possible, but cannot establish that evidence is true.

Before AF-03 implementation, its issue must define the exact versioned schema,
fingerprint inputs and comparison rules, proposal revision identity, timestamp
semantics, and operation transition/test matrix. Acceptance binds to the exact
proposal revision. Attribute the proposal author and applying actor separately
from the Git commit author; supplied actor names are not authenticated identities.
Git history and source references provide the audit trail, not cryptographic
provenance or a tamper-evident store.

Target fingerprints detect changes to affected Entries, not the continued truth
of supporting evidence. Before asking for acceptance, the agent must reassess
relevant code and sources. Two proposals may target the same Entry: applying one
makes the other's old target fingerprint stale. Reject stale application and
refresh the proposal; automatic merging of overlapping edits is out of scope.

### Draft, accept, apply, discard

- Creation and editing persist a draft without changing Entries or their activity
  log. Correcting, superseding, or retiring an Entry leaves accepted content and
  lifecycle unchanged while pending.
- The user reviews a concrete proposal in the active session. Acceptance is
  scoped to that proposal's content and observed targets. The host/session
  workflow conveys the user's instruction to the applying agent; CK does not
  authenticate approval or infer it from an agent-supplied boolean, branch name,
  or commit. No additional approval UI, command ceremony, or GitHub approval
  integration is required. This is a workflow boundary, not protection against
  an agent with arbitrary filesystem access.
- Before application, compare proposal content and affected targets with the
  accepted version. Edits to the proposal require renewed session acceptance;
  changed targets require refreshing the proposal and presenting it again.
  Perform freshness checks and the resulting mutation within one operation lock.
- Apply through the engine's protected lifecycle operations. Session-accepted
  changes become searchable immediately in that checkout. The final Entry and
  activity-log changes appear in the normal PR; merge publishes them. There is
  no separate CK implementation-task approval after normal human PR review.
- Rejecting/discarding removes the pending proposal and leaves accepted guidance
  unchanged. No permanent rejection archive or proposal telemetry is required.
- Successful application consumes the proposal. Entry changes, activity events,
  and proposal consumption must form one recoverable operation. An ordinary
  failure leaves the original state available for retry; if rollback or cleanup
  is incomplete, report whether changes applied and retain recovery evidence.
  Retrying an applied/consumed proposal must not duplicate lifecycle events.
  AF-03 must verify this boundary, including consumption failure, before enabling
  writes; existing file-replacement transactions alone do not provide deletion.
  The transition matrix must distinguish staging failure, mid-apply failure,
  consumption failure, incomplete rollback, post-application cleanup failure,
  and process interruption. Do not promise crash-proof recovery: preserve the
  documented cooperative model and provide an explicit inspection/recovery path
  for ambiguous outcomes before retrying. Verify that an applied-but-unconsumed
  proposal cannot be blindly replayed to duplicate effects.

An agent that authored a retirement proposal already has its contrary evidence
and must use that evidence when assessing the still-active Entry. Another session
in the same checkout can inspect the pending proposal explicitly; it remains a
proposal, not accepted guidance. Separate checkouts do not see unpublished work.
Publishing requires normal merge and making that revision available locally;
merge alone does not refresh another checkout. Cross-branch knowledge sources,
automatic fetching, and push-notification guarantees are deferred.

### Pending publication and cleanup

An unacknowledged proposal may remain pending across sessions and may be committed
and merged into `main`. Merging its file preserves a suggestion; it does not
accept or apply the lesson. Default Entry retrieval excludes pending proposals
even after merge. The PR handoff identifies pending proposals explicitly; their
presence alone is not a merge blocker. Later acceptance applies the proposal in
an ordinary repository change after fresh target and evidence checks. Rejection
of a committed proposal is an ordinary reviewed deletion.

Check pending proposals at relevant session start and handoff checkpoints; do
not repeatedly interrupt or block unrelated work. At 30 days since creation or
last meaningful revision, flag a proposal for cleanup assessment. Reading it,
listing it, or sending a reminder does not reset its age. The agent reassesses
relevance, evidence, and overlap and batches recommendations to apply, revise,
discard, or leave pending for the user. Age alone never authorizes deletion or
acceptance. No background scheduler, automatic expiry, or permanent rejection
archive is required. AF-03 defines testable UTC timestamp and age calculations;
AF-04 supplies the checkpoint presentation and reassessment procedure.

## MCP and operational boundaries

Start with a local stdio adapter bound to one explicit repository/worktree root.
Never choose another repository based on a per-call path. AF-02 defines and tests
path handling from subdirectories and isolation between worktrees; reject
unsupported root arrangements clearly, including ambiguous submodule selection.
Each operation reads current checkout files and schema, including after edits or
branch changes between operations. No persistent corpus cache is required.

Expose small typed search, read, and validate tools first. Distinguish no match,
missing Corpus, invalid Entry, and lock contention in structured outcomes. Keep
stdout for protocol traffic and diagnostics on stderr. Extract shared protected
application operations for CLI and MCP; do not bypass locks by importing Entry
functions directly or build the adapter by parsing CLI text.

Retain [ADR-0002](adr/0002-cooperative-working-tree-lock.md): brief checkout-wide
exclusive locks cover reads and writes, including proposal operations. A lock
lasts only for one engine operation, never an agent's reasoning, engineering task,
or user review. Reads cannot observe a cooperating multi-file write in progress.
Keep the current actionable contention/retry and manual stale-lock recovery
contract; automatic bounded retries are not required by this phase. Target
freshness checks additionally protect against changes between separate calls.
External processes ignoring CK locks remain outside the cooperative model.

Acceptance expresses user intent but does not replace safe operations. MCP tools
must validate typed inputs, expose no arbitrary command execution, and constrain
knowledge targets to the configured checkout. Test traversal and symbolic-link
escapes, malformed inputs, and insufficient-permission failures. The host owns
sandbox enforcement; document and test the minimum filesystem permissions needed
for supported operations rather than requiring unrestricted filesystem access.

The adapter must account for transaction recovery directories outside the checkout
when testing host filesystem permissions. Pin and record tested SDK, Node, and
client versions in the implementation issue. Resource subscriptions are optional
future work: MCP access does not itself synchronize Git or ensure that an agent
receives or acts on an update.

AF-03 exposes proposal authoring and inspection plus a narrow application path.
Raw active-entry mutations must not be advertised as routine agent authoring.
The retained CLI is available for scripts and diagnostics with its documented
semantics; it is not an approval-enforcement mechanism.

## Reflection and setup

Keep always-loaded instructions short: consult CK before relevant changes, query
again when new evidence emerges, and reflect before meaningful handoff. Make the
Reflection skill eligible for agent invocation. Verify real host behavior before
adding a hook; if needed, use the smallest supported hook and prevent recursion
and repeated reflection. A stop event alone does not establish task completion.

Prefer correcting existing knowledge to duplication. Reject generic tips,
unsupported assertions, task summaries, secrets, transcripts, one-off observations,
and knowledge adequately maintained elsewhere. Producing no proposal is success
when nothing useful needs preserving. Distinguish intended behavior from current
mechanics, and proposed controls from controls that actually exist.

Setup must target the correct checkout, safely initialize missing Corpus files,
and preserve existing knowledge and instructions. Use a named instruction file
and a bounded managed block if activation requires file edits; initialization
must not guess or rewrite instruction files. Package prebuilt assets so consumer
repositories need neither CK source nor an application dependency. Document the
actual tested install route, upgrades, and uninstall that preserves knowledge.
Use identifiable, versioned artifacts and record their source and checksum in
installation proof. Keep setup steps auditable; do not require unnecessary
privileges or opaque execution of downloaded scripts. Test install, upgrade,
and uninstall with existing instructions/knowledge and the documented host
permissions, including recovery storage. Signing infrastructure is not required.

Present proposals using native conversation and diff views: intended operation,
concise changes, cited evidence, applicability, and stale-target warnings when
relevant. Offer clear accept/discard/leave-pending choices; custom buttons or a
separate approval interface are not required. Identify the configured checkout
and revision in handoff evidence so users can understand visibility and freshness.

## Ordered milestones

These labels map to the tracking issues below. Their dependency and readiness
requirements govern implementation; work one at a time. Creating an issue does
not authorize starting it while the driving user has paused implementation.

| Milestone | Tracking issue |
| --- | --- |
| AF-01 | [#35](https://github.com/vinnyso/common-knowledge/issues/35) |
| AF-02 | [#38](https://github.com/vinnyso/common-knowledge/issues/38) |
| AF-03 | [#39](https://github.com/vinnyso/common-knowledge/issues/39) |
| AF-03E | [#40](https://github.com/vinnyso/common-knowledge/issues/40) |
| AF-04 | [#41](https://github.com/vinnyso/common-knowledge/issues/41) |
| AF-05 | [#42](https://github.com/vinnyso/common-knowledge/issues/42) |
| AF-06 | [#43](https://github.com/vinnyso/common-knowledge/issues/43) |

| Label | Scope and completion evidence | Dependency |
| --- | --- | --- |
| AF-01 | This contract, acceptance ADR, terminology, and authority links reviewed in a docs PR. | Completed prototype |
| AF-02 | Safe structured MCP search/read/validate in a real client; CLI regression checks; ordinary-task consultation with temporary short instructions tested early. | AF-01 merged |
| AF-03 | Versioned proposal format and safe operations covering every lifecycle change, freshness, rejection, application failure, and retry. | AF-02 merged |
| AF-03E | Two to three controlled scenarios comparing baseline and actual CK-assisted task outcomes, with transparent local results. | AF-03 merged |
| AF-04 | Recall and Reflection skills cause consultation and pre-handoff proposal drafting during normal tasks; zero-proposal cases work. | AF-03E merged |
| AF-05 | Packaged setup and complete fresh-install, session-acceptance, PR-publication, fresh-session reuse demo. | AF-04 merged |
| AF-06 | Five to ten real tasks, feedback from three to five engineers, and concise beta documentation informed by observed reuse and review effort. | AF-05 merged |

AF-02's early client test probes consultation before building the full authoring
loop. AF-03 tests concurrent operations and proposal isolation before enabling
agent writes. Temporary skill installation can support AF-04 before final
packaging. Each milestone retains the repository's CI and independent review
requirements; no runtime capability is delivered by AF-01.

## Minimal outcome evaluation (AF-03E)

Start with two or three scenarios, each recording the task, repository context,
expected relevant knowledge, known pitfall, success criteria, and evaluation
method. Compare fresh baseline sessions without CK retrieval with fresh sessions
using the actual MCP integration and the temporary consultation protocol proved
in AF-02. Keep model/version, task prompt, ordinary repository instructions,
tools, application revision, and execution conditions equivalent where practical;
record the deliberate CK availability/activation difference and any deviations.
Do not remove contribution guidance from the baseline to manufacture a benefit.

Record whether expected knowledge was retrieved, whether it was relevant, whether
a known mistake was avoided or a repository pattern followed, whether guidance
was stale/conflicting/noisy, and the final engineering result. Use application
checks and observable decisions, not retrieval similarity alone. A null or
negative result is valid evidence. Use small local JSON/JSONL results and a
repeatable runbook; add a runner only where it removes demonstrated manual work.
Token usage, latency, retries, and manual corrections are optional when cheap to
capture, not prerequisites for the first evaluation. Do not infer effectiveness
or savings beyond the observed trials.

Project Genome's existing **Legacy Orders** synthetic application is the preferred
testbed; reuse its checkpoint-2 application rather than build another project.
This is reuse of a test fixture, not a dependency on or integration with Genome.
AF-03E owns preparation: pin and verify the application revision/artifact,
define task packets and hidden acceptance checks, and use independent application
clones whose agents cannot access benchmark-author material, evaluator answers,
other trial conversations, or persistent agent memory. Preserve ordinary public
application documentation in both conditions. CK guidance must cite available
project evidence, not hidden tests or reference answers.

Candidate tasks are reference-import contract correction, dispatch-export
constraints, and CSV quoting as a low-context control. These are assessment
candidates, not completed evaluation cases; AF-03E must finalize their feasibility
and rubrics before trials. The previously observed CK issue/PR convention failure
remains a separate candidate for a controlled contribution-workflow scenario.
Legacy Orders does not currently reproduce that repository workflow; do not claim
it covers that failure or infer repeated baseline failure from one observation.

Testbed preparation can wait until AF-03E and must be complete before its trials.
Keep evaluation artifacts separate from runtime/library exports and consumer
installation. No MLflow prerequisite: reconsider it only if local results prove
inadequate. Databricks, dashboards, and a generic evaluation platform remain
deferred. The earlier evaluation intent is retained without reviving a broader
failure-assessment product.

## First milestone proof and practical evaluation

The first complete agent-first milestone (AF-05) must demonstrate:

- Agent A receives an ordinary engineering task in the prepared testbed through installed instructions,
  consults CK before relevant work, and handles an empty Corpus normally.
- After a non-obvious correction, it performs Reflection and drafts an
  evidence-backed proposal without asking permission just to draft.
- Another session's default search excludes that pending proposal; pending
  correction/retirement does not change accepted guidance.
- User acceptance in the active session applies the concrete knowledge changes;
  ordinary PR review/merge publishes the resulting diff.
- Fresh Agent B receives a related task without the lesson in its prompt, reads
  the published revision through its configured checkout/MCP adapter, and uses
  accepted guidance before the relevant implementation decision.
- Negative cases cover no worthwhile lesson, irrelevant guidance, contradictory
  evidence, rejected proposals, edited proposals, and stale targets.
- A pending proposal can cross a commit/merge and fresh-checkout boundary without
  becoming accepted guidance; aged proposals are flagged without deletion, and
  inspection does not reset their age.

Capture observable tool calls, proposal and accepted diffs, exact revisions,
client/runtime versions, task/session isolation manifests, and application test
outcomes. This proves operation and reuse, not time or token savings. Keep existing
CLI safety tests and add focused MCP/filesystem and proposal-transition tests;
verify skill behavior with realistic tasks rather than exact prose matching.
AF-03's automated transition tests must cover malformed proposals independently
of Entry retrieval, stale accepted revisions, simultaneous proposals for one
Entry, overlapping edits rejected by freshness checks, mid-apply and consumption
failures, and retries. MCP boundary tests cover configured-root isolation and
permission failures. Keep scenarios finite and tied to the supported process
model; the demonstration complements these checks rather than replacing them.

In AF-06, record useful reuse, rejected/noisy proposals, missed consultation,
corrections, and review effort in one short development note. Compare a few
matched tasks against a simple skill plus Markdown, including capture cost.
Use observations to choose retrieval or automation improvements. No large
benchmark platform is a prerequisite. Share a concise README, annotated proposal,
runnable demo, short video, limitations, and troubleshooting.

## Out of scope

Other hosts, embeddings, hosted synchronization, confidence scores, autonomous
acceptance, transcript capture, dashboards, organization-wide policy, broad
configuration, a custom orchestrator, and dependencies on Genome or SpecGuard
are deferred. Cryptographic signatures, authenticated actor identities,
tamper-evident audit infrastructure, automatic conflict merging, and custom
approval UI are also deferred. No self-hosted Corpus in the CK engine repository is authorized.
