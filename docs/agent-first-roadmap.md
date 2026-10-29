# Common Knowledge agent-first delivery roadmap

**Status:** Further CK expansion is parked by driving-human direction.
**Reviewed:** 2026-10-29 after the initial outcome comparison and direction check.

The [agent-first specification](agent-first-spec.md) remains the product and
design authority. GitHub Issues remain the implementation tracker. This roadmap
records delivered capabilities and the remaining dependency-gated delivery
units. Issue contracts authorize each implementation unit; this reconciliation
does not claim an issue, start scored trials, or authorize a new runtime route.

## Direction

The [six-session comparison](../evaluation-results/legacy-orders-initial/README.md)
passed in both conditions without a scored CK outcome advantage. After reviewing
the results and complexity concern, the driving human chose to park further CK
expansion for now. Finish publication of #50's report; do not claim #41, packaging,
or later expansion without explicit human direction to resume. No new experiment
or process layer is commissioned by this decision. Existing capabilities and
the evidence remain available.

The prior candidate sequence is retained for possible human reconsideration:

```text
safe proposal path -> minimal outcome check -> ordinary recall and Reflection
-> install and two-session reuse proof -> bounded beta -> evidence-led follow-ups
```

Keep CK Git-native, local, deterministic, and reviewable. The current coding
agent owns applicability and Reflection; CK owns protected repository-knowledge
operations. Retain one in-session human acceptance and normal PR merge as
publication. Do not add transcript ingestion, a curator service, hosted state,
automatic commits, a second approval ceremony, or a generic evaluation platform.

## Current state and next claim

| Unit | Current disposition |
| --- | --- |
| [#39](https://github.com/vinnyso/common-knowledge/issues/39) AF-03A | Done in PR #52: separate pending proposals, inspection, revisions, and guarded draft operations. |
| [#53](https://github.com/vinnyso/common-knowledge/issues/53) AF-03L | Done in PR #55 after the canonical lean-contract amendment in PR #54: bounded authored content and engine-derived guards/destinations. |
| [#49](https://github.com/vinnyso/common-knowledge/issues/49) AF-03B | Done in PR #56, merged 2026-10-23 UTC at `078532627fba2becbea2e5ebf34ac0944b8222a5`. All four accepted operations, post-commit cleanup, and replay protection are delivered. |
| [#40](https://github.com/vinnyso/common-knowledge/issues/40) AF-03E-P | Done; the reviewed preparation and client amendments are frozen in #50. |
| [#50](https://github.com/vinnyso/common-knowledge/issues/50) AF-03E-R | Six sessions and independent evaluation complete; report publication remains in delivery. Human direction check completed: park expansion. |
| [#41](https://github.com/vinnyso/common-knowledge/issues/41) AF-04 | Parked; explicit human resume direction and #50 completion are required. |
| [#42](https://github.com/vinnyso/common-knowledge/issues/42) AF-05P | Parked; retain the #41 dependency and prior packaging contract for reconsideration. |
| [#51](https://github.com/vinnyso/common-knowledge/issues/51) AF-05D | Parked; retain the #42 dependency and prior reuse-proof contract for reconsideration. |
| [#43](https://github.com/vinnyso/common-knowledge/issues/43) AF-06 | Parked; retain the #51 dependency and participant/evidence prerequisites for reconsideration. |

PR #56 records passing preflight, full tests, package verification, exact-candidate
CI, and independent review. Reuse that completed apply-and-cleanup evidence;
evaluation does not require another proposal engine or cleanup milestone.
The historical lean-contract/start-pause gates are no longer outstanding AF-03
prerequisites. Preserve normal issue claiming, dependency, review, and merge rules.
Project status must be checked at claim time; labels alone do not establish it.

## Historical preparation plan: #40 (completed)

1. Confirm #40 has no competing claim, record the contract, and move its Project
   status to `In Progress` before implementation. Do not claim #50 or #41 early.
2. Supply the explicit local Legacy Orders checkpoint-2 bundle path. Verify size
   92,824 bytes, SHA-256
   `d1ff2602b4c3ad50ca75b9d1de139bb6985a8e78d6e2375a98f9a62973e4655c`,
   and complete-history `main` at `67ee69584ce0122a26b017b2e559bed3cb5c90e8`.
   Historical verification is not proof of availability in a new environment.
   A missing path or mismatch stops fixture preparation. Do not publish or vendor
   the separate project's artifact without explicit authorization.
3. Restore independent clean application clones, re-establish the dependency
   cache, and record the current full application gate. Do not reuse historical
   application results as fresh checks.
4. Freeze exact task packets for reference-import correction, dispatch-export
   constraints, and CSV quoting as the low-context control. Author private checks
   before any task-agent run. Calibrate each substantive scenario against at
   least one correct and one functional-but-architecturally-wrong fixture;
   functional and architectural outcomes must be separately observable.
5. Freeze application and CK revisions, task/guidance bytes, model/settings,
   tools/runtime, condition and isolation manifests, content hashes, JSON/JSONL
   records, and the runbook. Preserve ordinary public guidance in both conditions;
   vary only recorded CK availability and temporary consultation instructions.
   Keep author material, private checks, reference answers, other runs, and
   persistent agent memory outside task-agent access.
6. Verify provenance, calibration, isolation, hashes, and applicable CK checks;
   obtain exact-candidate CI and independent review before human merge. Stop
   before scored agent trials. #40 is Done only after that reviewed PR merges;
   then reconcile #50 against the exact frozen inputs and claim it separately.

Keep the CK issue/PR convention failure as a separate future scenario candidate.
Legacy Orders does not establish that failure. Do not add Reflection, installers,
Docker support, runtime evaluation APIs, a generic runner, or effectiveness claims
to #40. These are preparation steps within one reviewable issue, not new blockers
or a replacement roadmap.

## Delivered AF-03 design summary

The canonical specification and merged implementations govern these mechanics;
the following summary is retained for context, not as unimplemented work.

### Proposal document

Use one human-readable file at `.repo-memory/proposals/<proposal-id>.md` with LF
line endings. YAML front matter contains:

- `proposal_version: 1`, stable lowercase-hyphenated `id`, and `operation` of
  `add`, `update`, `supersede`, or `retire`;
- `created_at`, `created_by`, and optional `revised_at`, `revised_by`;
- ordered `preconditions`, each naming an Entry ID and either `state: absent` or
  `state: present` with `sha256:<64 lowercase hex>`.

AF-03L revised proposal v1 in place while the package was not registry-published
and this repository had no stored Proposal artifacts. No second format or
migration framework was needed for that delivered correction.

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
bytes, not a mutable self-referential field. Edit, discard, and apply each require
the proposal ID and expected revision digest; edit and apply also identify their
actor. A mismatch changes nothing and requires a fresh read. Applying a revised
proposal additionally requires fresh session acceptance.

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

## Delivery sequence

| Unit | Depends on | Outcome and exit evidence |
| --- | --- | --- |
| **AF-03A — proposal format and pending operations** ([#39](https://github.com/vinnyso/common-knowledge/issues/39), Done) | #38 Done | PR #52 delivered separate pending storage, exact proposal revisions, target guards, safe draft operations, age assessment, and retrieval isolation. |
| **AF-03L — lean proposal authoring and derived targets** ([#53](https://github.com/vinnyso/common-knowledge/issues/53), Done in PR #55) | #39 Done | Delivered: reduce required authored content to Evidence, Rationale, and the exact change; derive guards/destination from operation and Entry content; preserve exact-revision edit/discard guards; keep the merged format readable only if real stored proposals require it. No apply tool. |
| **AF-03B — accepted apply and cleanup** ([#49](https://github.com/vinnyso/common-knowledge/issues/49), Done in PR #56) | #53 Done | Delivered: apply all four operations through the existing Entry/log transaction, delete afterward under the same lock, return typed stale/cleanup outcomes, and prove retry cannot duplicate a lifecycle event. No delete-capable transaction or proposal recovery subsystem. |
| **AF-03E-P — freeze the minimal evaluation** ([#40](https://github.com/vinnyso/common-knowledge/issues/40), next claim) | #49 Done | Require an explicit local bundle path and reject any digest other than the pinned 92,824-byte artifact; revalidate the full application; freeze reference-import correction and dispatch-export constraints plus CSV quoting as the low-context control, hidden checks, condition manifests, leakage audit, and runbook. Do not publish or vendor the separate project's artifact without authorization. No scored trials. |
| **AF-03E-R — run and report the initial comparison** ([#50](https://github.com/vinnyso/common-knowledge/issues/50)) | #40 | Fresh matched baseline/current-CK sessions using actual MCP access; immutable results and application checks; recall, reading, applicability, behavior, and preparation/review effort reported separately; null and negative runs retained. This measures the installed retrieval intervention, not verified curation. |
| **AF-04 — ordinary recall and verified Reflection** ([#41](https://github.com/vinnyso/common-knowledge/issues/41)) | #50 | Managed activation plus invocable skill produces consultation and zero-or-one evidence-backed proposal in ordinary tasks. Before presentation, use read-only repository tools to verify supporting sources, search for conflicting knowledge and plausible counterexamples, record unresolved assumptions, and narrow, reject, or abstain when support is insufficient. No hook unless the default demonstrably misses. |
| **AF-05P — package, install, doctor, and uninstall** ([#42](https://github.com/vinnyso/common-knowledge/issues/42)) | #41 | Identifiable prebuilt artifacts, checksum/source record, explicit managed activation, clean-clone failure tests, upgrades preserving knowledge, doctor verification, and uninstall preserving the Corpus. |
| **AF-05D — prove published two-session reuse** ([#51](https://github.com/vinnyso/common-knowledge/issues/51)) | #42 | Agent A performs verified Reflection, the user accepts once, PR merge publishes, and fresh Agent B retrieves from a checkout containing that revision before the relevant decision. Repeat affected AF-03E cases with current proposal drafting versus verified Reflection while holding retrieval, task, tools, and accepted Corpus constant where practical. Operation/reuse and curation evidence are separated from productivity claims. |
| **AF-06 — bounded beta decision** ([#43](https://github.com/vinnyso/common-knowledge/issues/43)) | #51 | Five to ten authorized tasks and three to five engineers where available; matched simple skill-plus-Markdown comparison; capture, review, and maintenance cost; explicit continue, simplify, or stop decision. |

The human-reading-guide trial began with PR #46 and was bounded by actual
implementation PRs, not the original issue batch. Do not extend or restart it for
#40 from its historical comment. Current review-policy requirements for a short
human reading guide still apply; this maintenance reconciliation does not reset
the trial count or establish that the guide reduced review effort.

## Packaging option to assess in #42: Docker

A container is a feasible candidate distribution route for the existing local
stdio MCP adapter, not a delivered or tested CK capability. The client could
launch `docker run --rm -i` against a pinned image containing CK, Node, and Git;
no TTY, HTTP transport, exposed port, or resident service is needed for this
approach. Compare it with the prebuilt Node package during #42 readiness work;
Docker must not gate #40, #50, or #41 or change frozen evaluation conditions.

The assessment must account for current implementation constraints:

- Bind one explicit consumer checkout, including Git metadata. Linked worktrees
  may refer to Git directories outside the mounted checkout; resolve those paths
  deliberately rather than assuming a single repository mount is sufficient.
- Retain write permission for the cooperative lock even for retrieval. Proposal
  application additionally needs writable Corpus/proposals and transaction
  recovery storage beside the checkout. Persist external recovery evidence on
  the host and keep staging/targets on the same filesystem: mounting only the
  checkout while staging in the container layer can cause cross-device renames.
  Do not solve this by broadening mounts to unrelated repositories by default.
- Test host file ownership, Git ownership checks, root/path validation, lock
  contention across native/container calls, stale/replay outcomes, and crash
  recovery under the chosen mount layout. Container removal must not destroy
  the recovery evidence needed to inspect an ambiguous failure.
- Pin image source/digest and runtime; verify supported host architectures,
  startup, client lifecycle, and ordinary MCP calls. Installation, managed agent
  activation, doctor, upgrade, and uninstall remain #42 responsibilities.

Docker can remove consumer Node/npm setup when Docker is already installed. It
adds a daemon and filesystem mapping concerns for other users and does not cause
agents to consult CK or perform Reflection. Prefer the simpler proven route for
the first evaluation; choose container packaging only from a bounded supported-
client proof. This note records an option, not authorization to implement it.

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

1. The lean AF-03 contract gate was satisfied by merged PR #54; #53 and #49
   subsequently completed in PRs #55 and #56. Do not reopen this historical gate.
2. The historical first-unit implementation pause is not a fresh permission
   requirement for this sequence. Claim each authorized dependency-satisfied
   issue through the normal lifecycle; missing external inputs still gate the
   affected preparation work.
3. Accept each concrete knowledge proposal in the active session before local
   application. Drafting and verification do not require prior permission.
4. Review and merge every implementation PR to publish code or accepted
   knowledge. Agent review and green CI do not replace this gate.
5. Authorize participants, evidence handling, and any public effectiveness claim
   before AF-06 execution or external reporting.
