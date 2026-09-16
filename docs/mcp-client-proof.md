# Codex MCP client proof

This document records the bounded manual behavior proof required by AF-02.
Automated adapter and filesystem coverage remains in `test/mcp.test.mjs`.

## Versions and candidate

- Candidate revision used by the server: `31c3642bb1d28f735ce7a5002ec5717f6df70612`
- Isolated consumer revision: `f61889f827905a597c7a85d1ee69dd0a07da22cd`
- Node.js: `v26.4.0` (the package minimum remains Node.js 20)
- npm: `11.17.0`
- MCP TypeScript SDK: `@modelcontextprotocol/sdk` `1.30.0`
- Codex client: `codex-cli 0.151.0`
- Model and effort: `gpt-5.6-sol`, medium

## Discovery and direct operations

On 2026-09-12, `codex exec` started the adapter as a required stdio server bound
to `/private/tmp/ck-mcp-client-proof-r2`. Codex initialized the server, discovered
its namespaced tools, and made these calls in order:

| Order | Tool | Exact arguments | Structured result |
| --- | --- | --- | --- |
| 1 | `common_knowledge/search` | `{"query":"slugify empty after normalization TypeError regression tests","path":"src/slug.js"}` | `status: ok`; one result, `project-slug-contract` |
| 2 | `common_knowledge/read` | `{"id":"project-slug-contract"}` | `status: ok`; complete Entry Markdown |

The first startup attempt used the generated `dist/mcp.js` path as the executable
and failed with `Permission denied` before a Codex session was created. The
documented configuration was corrected to launch the build artifact through
`node`; the bounded client run then initialized and completed successfully. A
reviewer-required rerun used JSON events to retain the exact arguments above;
it reproduced the same search-then-read order and task outcome.

## Ordinary-task consultation

The temporary repository contained this activation instruction:

> Before changing code, search Common Knowledge with the task terms and affected
> path. Read any relevant Entry and verify it against the current repository.
> Re-query when a new error or unfamiliar behavior appears. An empty result is
> normal; continue with repository evidence.

The ordinary task prompt was:

> In src/slug.js, make slugify reject values that become empty after normalization
> by throwing TypeError. Add regression coverage and run the project focused test
> command. Do not change package dependencies.

The task did not mention CK or state the required error text or test command.
Codex called `search` before its first repository inspection, then called `read`
before deciding the error contract and verification command. It used the Entry's
exact `TypeError("slug input must contain letters or numbers")` contract, added
whitespace-only and punctuation-only regression cases, and ran
`npm run test:slug`; both tests passed. `package.json` remained unchanged.

The run used `--ignore-user-config` and `--ephemeral`, with a fresh Git repository
and no prior task conversation. Existing account authentication and globally
available user skills remained accessible to the client; those skills did not
contain the slug lesson. This is a supported-client behavior proof, not a claim
of evaluator-grade session isolation. No full transcript is committed.

This is a manual client behavior proof, not an automated adapter test or an
effectiveness claim.

## AF-03 proposal-operation proof

On 2026-09-16, `codex exec` `0.151.0` used Node.js `v26.4.0`, npm
`11.17.0`, and `@modelcontextprotocol/sdk` `1.30.0` against implementation
commit `ffe65b21a28c125b944a007f1af2b3ddeaa61106`. The client ran with
`--ignore-user-config --ephemeral --approve-for-me` and an MCP server bound to a
fresh temporary Git root. The temporary root had no committed consumer revision;
that evidence field is unavailable. The JSON event stream did not identify the
client's default model or reasoning setting, so they are also recorded as
unavailable rather than inferred.

The successful replacement run used this create payload, called below `P`:

```json
{
  "id": "client-proof-rule",
  "operation": "add",
  "targets": [{"id": "client-proof-rule", "state": "absent"}],
  "evidence": [{
    "source": "docs/mcp.md",
    "revision": "ffe65b21a28c125b944a007f1af2b3ddeaa61106",
    "observed_fact": "The supported client discovered and invoked the typed proposal tools.",
    "lineage": "executable check",
    "validator": "npm run verify:package"
  }],
  "rationale": "Verify the supported client proposal workflow.",
  "future_use": "Repeat when the proposal MCP contract changes.",
  "applicability_and_exceptions": "Applies only to supported-client integration proof.",
  "assumptions_and_unresolved_checks": "No unresolved checks.",
  "intended_destination": ".repo-memory/entries/client-proof-rule.md",
  "proposed_entry": "---\nschema_version: 1\nid: client-proof-rule\nkind: pattern\ntitle: Use the supported proposal workflow\ntriggers:\n  - proposal client proof\nstatus: active\ncreated_at: 2026-09-16T12:00:00Z\ncreated_by: codex-client-proof\n---\n\n## Situation\n\nA supported client needs to prove that it can discover and invoke the typed proposal tools.\n\n## Resolution\n\nUse the supported proposal workflow and preserve exact proposal revisions across edits and discard operations.\n",
  "created_by": "codex-client-proof"
}
```

The client made these calls in order:

| Order | Tool | Exact arguments | Structured result |
| --- | --- | --- | --- |
| 1 | `common-knowledge/proposal_create` | `P` above | `status: ok`; revision `sha256:c055c6a42d389cfd1439ab99aba0feda2685785ff89f2e4d723210a046936af6`; `status: proposed`; no diagnostics |
| 2 | `common-knowledge/proposal_list` | `{}` | `status: ok`; one matching proposed item with the create revision |
| 3 | `common-knowledge/proposal_read` | `{"id":"client-proof-rule"}` | `status: ok`; complete canonical proposal source and the create revision |
| 4 | `common-knowledge/proposal_edit` | `P` without `created_by`, with `rationale` set to `Verify the revised supported client proposal workflow.`, `expected_revision` set to the create revision, and `revised_by` set to `codex-client-proof` | `status: ok`; revision `sha256:7f323a5c9e5a222d56a6e878513e36b5ac039ae4ff7ad88f0ef8935efa0e01b6`; preserved creation attribution; recorded revision attribution |
| 5 | `common-knowledge/proposal_discard` | `{"id":"client-proof-rule","expected_revision":"sha256:7f323a5c9e5a222d56a6e878513e36b5ac039ae4ff7ad88f0ef8935efa0e01b6"}` | `status: ok`; proposal ID returned |

After the run, `proposals/` and `entries/` were empty and `log.md` retained its
initial checksum, so the pending workflow did not create accepted guidance. The
first attempt used `--sandbox workspace-write`, whose non-interactive approval
policy allowed create/list/read but rejected destructive-hint edit/discard calls.
It is retained as an invalid client-configuration attempt and was replaced once
with the approval-aware command above; it is not counted as a successful proof.
