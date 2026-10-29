# Initial Legacy Orders outcome comparison

Six frozen sessions completed on 2026-10-29 UTC. **Both baseline and current CK passed every scored scenario.** CK delivered relevant Entries before the observable implementation decisions in reference import and dispatch export; the baselines also found the necessary public evidence and passed. This sample shows successful retrieval, with no observed scored outcome advantage. It does not establish causality, net savings, general effectiveness, or that CK is unnecessary.

| Scenario | Baseline: public / functional / architecture | CK: public / functional / architecture | Task wall seconds: baseline / CK |
| --- | --- | --- | --- |
| Reference import | pass / pass / pass | pass / pass / pass | 108.835 / 149.815 |
| Dispatch export | pass / pass / pass | pass / pass / pass | 147.044 / 167.490 |
| CSV quoting | pass / pass / N/A | pass / pass / N/A | 76.886 / 130.776 |

One fresh session ran per condition/scenario, serially, in the frozen order: reference baseline, reference CK, dispatch CK, dispatch baseline, CSV baseline, CSV CK. All exited successfully within 20 minutes. No scored task attempt was replaced and no private-check feedback was returned to an agent. Each final source/test candidate was saved in an immutable local commit and bundle, then evaluated in a separate author-only copy. The evaluator found required non-skipped JUnit evidence for every gate. CSV has no architectural score.

## What CK delivered

- **Reference import:** `application-boundary` and `reference-contract` reads completed at events 12 and 11, before the explicit implementation plan at event 17 and first edit at 22. The final candidate followed the application-service/ports boundary and normalized reference contract. Search also returned the unrelated dispatch Entry; it was not read.
- **Dispatch export:** an initial search at path `src` returned no match. A file-specific search found the relevant dispatch and application-boundary Entries; reads completed at events 14 and 16, before the plan at 21 and edit at 26. The final candidate followed the eligibility, local-time and service/port guidance. An unrelated reference Entry was also retrieved and read.
- **CSV control:** two searches returned no match, no Entry was read, and the final implementation passed. There was no relevant corpus guidance for this task.

Event numbers are zero-based JSONL line numbers. “Read before decision” means Entry content was delivered before the first explicit implementation plan/edit visible in the trace; internal cognition is unavailable. No stale or conflicting Entry was observed against this fixed checkout. Relevant retrieval and followed behavior do not establish that retrieval caused the outcome.

## Frozen inputs and evidence

The governing contract is [issue #50](https://github.com/vinnyso/common-knowledge/issues/50) and the unchanged [frozen runbook](../../evaluation/legacy-orders/README.md). Preparation revision: `875922a6545be14d8e7f84ebe59e36a42adee2a8`; freeze SHA-256: `473496ae9623df551614c1632fd88ece17408207dfac76839786a20c9e970fc0`. Application: `67ee69584ce0122a26b017b2e559bed3cb5c90e8`; CK artifact source: `9bd1f0ad50e71f995787e291a965384a3a75eb2a`. Original bundle and CK tarball identities, exact task/guidance bytes, evaluator and runtime remain those in the frozen inventory.

Every actual launch passed native filesystem/network probes, the full offline application gate, exact-prompt checks, authenticated account/backend reads and MCP/skill inventory. Baseline advertised no MCP server; CK advertised only `read`, `search`, `validate`. Bundled system-skill names/hashes matched across all six. Independent checkouts, homes and writable caches excluded author material, other sessions and original user memory. Temporary authentication was removed after each session. These are the tested isolation boundaries, not a claim of exhaustive security proof.

- [Six schema-shaped outcome records](results.jsonl): candidate SHAs, outcomes, knowledge classifications, local evidence paths/digests and observable effort/gaps. Validate each line with the unchanged [result schema](../../evaluation/legacy-orders/result.schema.json).
- [Bounded evidence index](evidence.json): actual order/timestamps, CK arguments/results, decision ordering, JUnit summaries and raw-artifact hashes.
- [First-session tool capture](first-session-tools.json): ordered operations and exact executed commands. Internal tool-envelope options and original patch payloads are unavailable; final diffs are retained.
- [Preparation stops](preparation-stops.json): authentication, Maven binding and package-cache failures retained separately from scored sessions. An author-only resume-helper failure is also disclosed.

Raw events, candidate source/test bundles, diffs and evaluator reports remain local under `/private/tmp/ck-issue40/issue50-campaign-20261028`; full transcripts, credentials and original application content are not published here. The first session's command capture and CK MCP arguments are retained without reconstructing missing internal payloads. The requested model was `gpt-6.1-sol` / medium on CLI 0.165.0; an immutable backend serving snapshot and returned serving-model identifier are unavailable.

## Effort and direction checkpoint

Task execution totaled 780.846 seconds. The table is descriptive: single sessions, different implementations and uncontrolled backend variation cannot establish a CK latency effect. Partial scripted preparation timings are retained; complete preparation effort for the first two resumed environments, earlier freeze/amendment work, human waiting, capture/curation/maintenance effort and separately timed correction/review effort are unavailable. Do not treat these execution times as total adoption cost or savings.

This tests installed retrieval and temporary consultation, not Reflection, proposal application, curation improvement or the separate CK contribution-workflow failure. Reference and dispatch remain identifiable context-dependent cases for the later curation comparison; they were not changed or rerun here, and no failed baseline in this sample establishes a correction target.

Plain repository documentation was sufficient in these three baselines. Relevant retrieval worked, and two CK cases also exposed irrelevant hits. The evaluation required substantial isolation/authentication/cache preparation; CK's capture, review and maintenance costs were not measured. Separate that evaluation overhead from product complexity when deciding what earns its cost.

**Human direction decision, 2026-10-29: park further CK expansion for now.** After receiving the six-session results and the complexity assessment above, the driving human selected this option in the required direction check. Finish publication of this comparison; do not claim #41, packaging or further expansion without explicit human direction to resume. The evidence remains available for a future decision about simplification or a recurring context problem. No additional benchmark or process layer is commissioned.
