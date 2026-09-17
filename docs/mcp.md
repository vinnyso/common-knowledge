# Local MCP adapter

Common Knowledge provides a local stdio MCP adapter for deterministic Entry reads
and protected pending-proposal operations. The adapter is bound at startup to
one explicit Git checkout or linked worktree.

| Tool | Input | Successful result |
| --- | --- | --- |
| `search` | Non-empty `query`; optional repository-relative `path` and Entry `kind` | Ordered active Entry summaries and match reasons |
| `read` | Stable Entry `id` | Complete validated Entry Markdown |
| `validate` | None | Count of valid Entries |
| `proposal_list` | None | Pending proposal summaries with exact revisions, targets, age assessment, and diagnostics |
| `proposal_read` | Stable proposal `id` | Pending proposal source and summary |
| `proposal_create` | Proposal ID, operation, actor, evidence, rationale, and proposed Entry; retirement instead takes `target_id` and a reason | Canonical pending proposal with engine-derived targets, timestamp, fingerprints, and revision; the destination is implicit from the Entry ID |
| `proposal_edit` | Complete lean replacement content, exact `expected_revision`, and revision actor | Revised proposal with freshly derived targets while preserving creation attribution |
| `proposal_discard` | Stable proposal `id` and exact `expected_revision` | Deleted pending proposal ID |

`search`, `read`, and `validate` operate only on accepted Entry state.
`proposal_list` and `proposal_read` are read-only. The remaining proposal tools
write only `.repo-memory/proposals/`; they do not mutate Entries or `log.md` and
there is no proposal-apply tool in this milestone.

Proposal Markdown contains only `Evidence`, `Rationale`, and `Proposed Entry` or
`Retirement reason`. Each evidence item requires `source`, `revision`, and
`observed_fact`; `lineage` and `validator` are optional. Add derives an absent
guard from the proposed Entry ID. Update derives a present guard from that ID.
Supersede derives its present predecessor from `supersedes` and an absent guard
from the new ID. Retire alone accepts `target_id`. Callers never provide target
states, fingerprints, or destination paths; each destination is the canonical
Entry path implied by its ID.

Each call acquires the existing checkout-wide cooperative lock for one operation
and releases it before returning. Calls read the current Corpus and schema, so an
edit or branch change between calls is visible without restarting the server.
There is no persistent Corpus cache.

## Supported checkout roots

Start the adapter with exactly one root:

```sh
common-knowledge-mcp --root /absolute/path/to/consumer-repository
```

The path may name a Git repository root, a linked worktree root, or a directory
inside either. Common Knowledge resolves and binds the owning top-level checkout.
Non-Git directories, configured paths with a symbolic link in any path
component, and Git submodules are rejected at startup. Configure a submodule's
owning checkout instead. Nested or otherwise ambiguous arrangements should use
the intended checkout's top-level path explicitly.

Tool inputs cannot select another repository. The optional `search.path` is a
normalized forward-slash repository-relative applicability path; absolute paths,
backslashes, empty segments, `.` segments, and `..` traversal are rejected.

## Codex configuration

Tested integration versions are recorded in the
[client proof](mcp-client-proof.md). Current Codex clients support local stdio
servers through their shared MCP configuration. From a built checkout:

```sh
codex mcp add common-knowledge -- \
  node /absolute/path/to/common-knowledge/dist/mcp.js \
  --root /absolute/path/to/consumer-repository
codex mcp list
```

The equivalent project-scoped configuration for a trusted project is:

```toml
[mcp_servers.common-knowledge]
command = "node"
args = ["/absolute/path/to/common-knowledge/dist/mcp.js", "--root", "/absolute/path/to/consumer-repository"]
```

Restart the Codex client after changing its MCP configuration. Use `/mcp` in a
Codex session to inspect connected servers where that client exposes the command.

## Typed outcomes and diagnostics

Successful calls return structured content with a `status` value. `ok` carries
results, Entry Markdown, or an Entry count. The adapter distinguishes
`no_match`, `missing_corpus`, `invalid_entry`, `lock_contention`, `not_found`,
`permission_denied`, `invalid_input`, `invalid_proposal`, `stale_revision`, and
`operation_failed`. MCP schema errors for malformed arguments are protocol tool
errors. Human-readable JSON mirrors the structured result in each tool's text
content. Malformed proposal files are diagnosed independently and never block
valid Entry retrieval.

Proposal revisions and present-target fingerprints use `sha256:<64 lowercase
hex>` over the exact safely read UTF-8 file bytes. Absent targets have no hash.
Edit and discard compare the caller's exact expected proposal revision while
holding the brief checkout lock; a mismatch changes nothing. Reads and lists do
not change proposal timestamps. A proposal becomes due for reassessment after
30 elapsed 24-hour periods from its last meaningful revision or creation.

Stdout contains MCP protocol traffic only. Startup and fatal adapter diagnostics
go to stderr. Lock-contention results retain the existing retry and manual stale
lock recovery guidance.

## Host permissions and boundaries

For read-only MCP tools, the server process needs:

- execute access through the configured checkout path;
- read access to `.git` metadata and Corpus directories/files; and
- create, write, inspect, and remove access for `.repo-memory.lock` at the
  checkout root.

Proposal creation and editing additionally need write access to
`.repo-memory/proposals/`; discard needs delete access there. Proposal writes,
like Entry lifecycle commands, need create, write, read, and remove access in
the checkout's parent directory. Transactions create
`.common-knowledge-transaction-*` staging and retained recovery directories there
so atomic renames remain on the checkout filesystem. A host sandbox must grant
that parent path explicitly when it permits writes.

MCP is an interface to Common Knowledge, not a sandbox. The host remains
responsible for process and filesystem isolation. The adapter does not fetch,
merge, switch, or synchronize Git state, notify other checkouts, execute arbitrary
commands from tool input, or coordinate filesystem writers that ignore the CK
lock. Resource subscriptions, proposal application, acceptance authentication,
Git operations, and cross-checkout synchronization are outside this adapter.
