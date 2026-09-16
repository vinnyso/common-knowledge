# Common Knowledge agent-first delivery roadmap

**Status:** Active planning handoff; not implementation authority.
**Reviewed:** 2026-09-16 after AF-03A merged in PR #52.

The [agent-first specification](agent-first-spec.md) remains the product and
design authority. GitHub Issues remain the implementation tracker. This roadmap
turns the approved direction into small delivery units and proposes the design
decisions needed to make AF-03 ready. Converting this roadmap into issues does
not itself authorize implementation.

## Direction

Finish one evidence-producing learning loop before expanding the product:

```text
safe proposal path -> minimal outcome check -> ordinary recall and Reflection
-> install and two-session reuse proof -> bounded beta -> evidence-led follow-ups
```

Keep CK Git-native, local, deterministic, and reviewable. The current coding
agent owns applicability and Reflection; CK owns protected repository-knowledge
operations. Retain one in-session human acceptance and normal PR merge as
publication. Do not add transcript ingestion, a curator service, hosted state,
automatic commits, a second approval ceremony, or a generic evaluation platform.

## Current blocker disposition

| Current issue | Disposition for issue conversion |
| --- | --- |
| [#39](https://github.com/vinnyso/common-knowledge/issues/39) AF-03A | Done in PR #52. Its safety model is sound, but the authored contract and caller-supplied targets are broader than the learning loop needs. Add one bounded simplification before application. |
| [#49](https://github.com/vinnyso/common-knowledge/issues/49) AF-03B | Remove from agent readiness until the lean authoring/API revision is merged. Reconcile application around the existing Entry/log transaction and stale-target replay protection rather than a delete-capable recovery subsystem. |
| [#40](https://github.com/vinnyso/common-knowledge/issues/40) AF-03E | The checkpoint-2 bundle exists and verifies as complete history at `67ee69584ce0122a26b017b2e559bed3cb5c90e8`; its SHA-256 is `d1ff2602b4c3ad50ca75b9d1de139bb6985a8e78d6e2375a98f9a62973e4655c`. Split fixture/rubric preparation from trial execution. Full-stack revalidation and private checks remain required preparation, not presumed evidence. |
| [#41](https://github.com/vinnyso/common-knowledge/issues/41) AF-04 | Default to short checked-in activation instructions plus an invocable Reflection skill. Add a host hook only after a supported-client trial shows a repeatable missed invocation. |
| [#42](https://github.com/vinnyso/common-knowledge/issues/42) AF-05 | Split installer/doctor lifecycle from the human-accepted A-to-B demonstration. Installation uses an explicit named instruction file or bounded managed block and must never guess or rewrite client instructions. |
| [#43](https://github.com/vinnyso/common-knowledge/issues/43) AF-06 | Participant availability and consent are start gates that cannot be manufactured early. Keep the issue dependency-gated until the full-loop proof exists; lack of a cohort is a reported gap, not product evidence. |

During conversion, replace the stale pre-AF-01 branch links with `main`, remove
obsolete “pending #35/#36” wording, and record the current authorization state in
one issue comment rather than copying a historical pause into every issue. Set a
Project status only when the resulting issue satisfies the repository's normal
readiness rules.

## AF-03 contract proposed for conversion

### Proposal document

Use one human-readable file at `.repo-memory/proposals/<proposal-id>.md` with LF
line endings. YAML front matter contains:

- `proposal_version: 1`, stable lowercase-hyphenated `id`, and `operation` of
  `add`, `update`, `supersede`, or `retire`;
- `created_at`, `created_by`, and optional `revised_at`, `revised_by`;
- ordered `preconditions`, each naming an Entry ID and either `state: absent` or
  `state: present` with `sha256:<64 lowercase hex>`.

The package is not registry-published and this repository contains no stored
Proposal artifacts, so AF-03L revises proposal v1 in place. Do not add a second
format or migration framework. If a supported external trial artifact is found
before implementation, preserve read compatibility without retaining the verbose
authoring API.

The Markdown body requires only `Evidence`, `Rationale`, and the exact change.
Each evidence item identifies its source path or artifact, repository revision,
and observed fact. Lineage and an existing validator may be included when useful
without claiming that a check proves more than it executes. Add, update, and
supersede proposals end with `Proposed Entry`, followed by the complete Entry
source. Retire proposals instead end with `Retirement reason`. Applicability,
exceptions, assumptions, future use, and destination belong in the rationale or
Entry only when material; they are not form fields. Preserve Entry schema v1;
do not add confidence or evidence status to accepted Entry Lifecycle.

Evidence must distinguish current mechanics, explicit project intent, and
inference. One reproducible observation may justify a narrowly scoped pending
proposal. A broader rule needs either an explicit project decision or recurrence
across distinct tasks or locations followed by a counterexample check. Do not
hard-code an occurrence count, and do not treat confidence as a probability or
an automatic acceptance rule.

Keep proposal persistence and presentation separate. A proposal remains a
distinct artifact with its own pending-to-applied-or-discarded workflow; it is
not an Entry Lifecycle state. Inspection tools and native conversation may
present it inline with `status: proposed`, its intended operation, targets, and
revision. Normal search still returns only accepted active Entries. This gives
the user one coherent knowledge view without allowing pending content to affect
guidance or creating duplicate Entry identities for proposed updates,
supersessions, or retirements.

The engine derives exact operation preconditions; callers never supply a target
state, fingerprint, or destination:

- add: proposed ID is absent;
- update: target is active and its exact source fingerprint matches; proposed
  Entry keeps the ID, `created_at`, and `created_by`;
- supersede: predecessor is active and matches, and the proposed new ID is
  absent;
- retire: target is active and matches.

Add, update, and supersede derive their IDs from the proposed Entry. Retire takes
one target Entry ID because it has no proposed Entry from which to derive it.

Fingerprint the exact UTF-8 bytes safely read from the Entry file; do not include
path, mtime, or inode. Represent absence explicitly instead of hashing a
sentinel. Compare every precondition while holding the normal brief checkout
lock immediately before mutation.

### Revision, time, and actors

The proposal revision is a reported `sha256` digest of the exact proposal file
bytes, not a mutable self-referential field. `apply` accepts the proposal ID,
expected revision digest, and applying actor. A mismatch changes nothing and
requires the revised proposal to be presented for fresh session acceptance.

Creation time never changes. An engine-mediated content change sets
`revised_at` and `revised_by`; reads, lists, reminders, and acceptance do not.
Timestamps are valid RFC 3339 UTC instants. Age is measured from
`revised_at ?? created_at` and becomes assessable at 30 elapsed 24-hour periods;
future timestamps are invalid. `created_by` identifies the proposal author. The
applying actor is recorded in lifecycle events but is not treated as an
authenticated identity.

### Apply and cleanup outcomes

Reuse the existing staged-file transaction for Entry and log changes. Keep the
normal cooperative lock through exact revision/target validation, lifecycle
application, and proposal cleanup; do not add delete planning or a separate
proposal recovery system.

| Outcome | Required observable result |
| --- | --- |
| Revision, validation, or precondition failure | No Entry, log, or proposal change; return a specific refresh/correction diagnostic. |
| Entry/log transaction failure with complete rollback | Original Entries, log, and proposal remain; retry is safe after the reported cause is fixed. |
| Ambiguous Entry/log transaction failure | Preserve and report the existing lifecycle recovery evidence; do not add proposal-specific recovery state. |
| Entry/log commit followed by proposal-removal failure | Entry and log changes remain, proposal remains, and the operation returns `applied_cleanup_required`; inspect and discard the stale residue. |

Successful application installs the exact planned Entry and log changes and then
deletes the proposal. Every successful lifecycle change makes at least one target
guard stale, so a retained proposal or a retry after an interrupted cleanup fails
before another lifecycle event can be written. Malformed proposals are reported
separately and never block valid Entry retrieval.

## Issue conversion queue

| Proposed unit | Depends on | Outcome and exit evidence |
| --- | --- | --- |
| **AF-03A — proposal format and pending operations** ([#39](https://github.com/vinnyso/common-knowledge/issues/39), Done) | #38 Done | PR #52 delivered separate pending storage, exact proposal revisions, target guards, safe draft operations, age assessment, and retrieval isolation. |
| **AF-03L — lean proposal authoring and derived targets** ([#53](https://github.com/vinnyso/common-knowledge/issues/53)) | AF-03A | Reduce required authored content to Evidence, Rationale, and the exact change; derive guards/destination from operation and Entry content; keep the merged format readable only if real stored proposals require it. No apply tool. |
| **AF-03B — accepted apply and cleanup** (revise [#49](https://github.com/vinnyso/common-knowledge/issues/49)) | AF-03L | Apply all four operations through the existing Entry/log transaction, delete afterward under the same lock, return typed stale/cleanup outcomes, and prove retry cannot duplicate a lifecycle event. No delete-capable transaction or proposal recovery subsystem. |
| **AF-03E-P — freeze the minimal evaluation** (revise #40) | AF-03B | Require an explicit local bundle path and reject any digest other than the pinned 92,824-byte artifact; revalidate the full application; freeze reference-import correction and dispatch-export constraints plus CSV quoting as the low-context control, hidden checks, condition manifests, leakage audit, and runbook. Do not publish or vendor the separate project's artifact without authorization. No scored trials. |
| **AF-03E-R — run and report the initial comparison** (new) | AF-03E-P | Fresh matched baseline/current-CK sessions using actual MCP access; immutable results and application checks; recall, reading, applicability, behavior, and preparation/review effort reported separately; null and negative runs retained. This measures the installed retrieval intervention, not verified curation. |
| **AF-04 — ordinary recall and verified Reflection** (revise #41) | AF-03E-R | Managed activation plus invocable skill produces consultation and zero-or-one evidence-backed proposal in ordinary tasks. Before presentation, use read-only repository tools to verify supporting sources, search for conflicting knowledge and plausible counterexamples, record unresolved assumptions, and narrow, reject, or abstain when support is insufficient. No hook unless the default demonstrably misses. |
| **AF-05P — package, install, doctor, and uninstall** (revise #42) | AF-04 | Identifiable prebuilt artifacts, checksum/source record, explicit managed activation, clean-clone failure tests, upgrades preserving knowledge, doctor verification, and uninstall preserving the Corpus. |
| **AF-05D — prove published two-session reuse** (new) | AF-05P | Agent A performs verified Reflection, the user accepts once, PR merge publishes, and fresh Agent B retrieves from a checkout containing that revision before the relevant decision. Repeat affected AF-03E cases with current proposal drafting versus verified Reflection while holding retrieval, task, tools, and accepted Corpus constant where practical. Operation/reuse and curation evidence are separated from productivity claims. |
| **AF-06 — bounded beta decision** (revise #43) | AF-05D | Five to ten authorized tasks and three to five engineers where available; matched simple skill-plus-Markdown comparison; capture, review, and maintenance cost; explicit continue, simplify, or stop decision. |

The existing human-reading-guide trial began with PR #46. AF-03A was trial two;
use the lean contract PR as the next review sample and reassess the guide after
AF-03B rather than extending the trial to AF-03E automatically.

## Evidence-gated future direction

Create these follow-up issues only when the named trigger is observed:

| Candidate | Trigger | Bounded direction |
| --- | --- | --- |
| **CK-F1 retrieval quality** | Repeated missed or noisy retrieval in AF-03E/AF-06 that current match reasons cannot diagnose | First add the minimum diagnostics needed to distinguish considered, selected, and omitted Entries and their recorded source freshness. Improve deterministic query formation, ranking, or explanations against preserved cases. Capture token/use/helpfulness data only when the host can observe it reliably; compare with the current engine before considering embeddings. |
| **CK-F2 evidence currency** | Accepted guidance causes a stale or conflicting recommendation despite target freshness | Add explicit evidence-reassessment diagnostics and review cues. Do not equate a source change with invalidity or add automatic retirement. |
| **CK-F3 client portability** | A second supported client has a concrete activation or protocol gap | Add the smallest client adapter/instructions and repeat install plus ordinary-task proof. Do not build general orchestration. |
| **CK-F4 promotion bindings** | A recurring accepted lesson is actually moved into a test, instruction, skill, or CI rule | Record a reviewable relationship and provenance without claiming CK enforces the destination. |

Stop or simplify if the plain skill-plus-Markdown baseline performs as well at
lower cost, maintenance exceeds useful reuse, unsupported guidance causes harm,
or the workflow adds review effort without improving outcomes. Expand only from
reproducible failure classes; do not infer causality, adoption, or savings from
tool calls, self-report, or a successful demo alone.

## Human approval gates

Human direction is required at these points; no other approval ceremony is
introduced:

1. Review and merge the lean AF-03 contract amendment before either implementation
   issue becomes agent-ready.
2. Explicitly lift the historical implementation pause before giving the first
   dependency-satisfied unit `ready-for-agent` and Project `Ready` status.
3. Accept each concrete knowledge proposal in the active session before local
   application. Drafting and verification do not require prior permission.
4. Review and merge every implementation PR to publish code or accepted
   knowledge. Agent review and green CI do not replace this gate.
5. Authorize participants, evidence handling, and any public effectiveness claim
   before AF-06 execution or external reporting.
