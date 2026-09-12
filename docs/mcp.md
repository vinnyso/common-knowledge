# Local MCP adapter

Common Knowledge provides a local stdio MCP adapter for deterministic read
operations. The adapter is bound at startup to one explicit Git checkout or
linked worktree and exposes three read-only tools:

| Tool | Input | Successful result |
| --- | --- | --- |
| `search` | Non-empty `query`; optional repository-relative `path` and Entry `kind` | Ordered active Entry summaries and match reasons |
| `read` | Stable Entry `id` | Complete validated Entry Markdown |
| `validate` | None | Count of valid Entries |

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
Non-Git directories, explicitly symlinked root paths, and Git submodules are
rejected at startup. Configure a submodule's owning checkout instead. Nested or
otherwise ambiguous arrangements should use the intended checkout's top-level
path explicitly.

Tool inputs cannot select another repository. The optional `search.path` is a
normalized forward-slash repository-relative applicability path; absolute paths,
backslashes, empty segments, `.` segments, and `..` traversal are rejected.

## Codex configuration

Tested integration versions are recorded in the
[client proof](mcp-client-proof.md). Current Codex clients support local stdio
servers through their shared MCP configuration. From a built checkout:

```sh
codex mcp add common-knowledge -- \
  /absolute/path/to/common-knowledge/dist/mcp.js \
  --root /absolute/path/to/consumer-repository
codex mcp list
```

The equivalent project-scoped configuration for a trusted project is:

```toml
[mcp_servers.common-knowledge]
command = "/absolute/path/to/common-knowledge/dist/mcp.js"
args = ["--root", "/absolute/path/to/consumer-repository"]
```

Restart the Codex client after changing its MCP configuration. Use `/mcp` in a
Codex session to inspect connected servers where that client exposes the command.

## Typed outcomes and diagnostics

Successful calls return structured content with a `status` value. `ok` carries
results, Entry Markdown, or an Entry count. The adapter distinguishes
`no_match`, `missing_corpus`, `invalid_entry`, `lock_contention`, `not_found`,
`permission_denied`, `invalid_input`, and `operation_failed`. MCP schema errors
for malformed arguments are protocol tool errors. Human-readable JSON mirrors
the structured result in each tool's text content.

Stdout contains MCP protocol traffic only. Startup and fatal adapter diagnostics
go to stderr. Lock-contention results retain the existing retry and manual stale
lock recovery guidance.

## Host permissions and boundaries

For these read-only MCP tools, the server process needs:

- execute access through the configured checkout path;
- read access to `.git` metadata and Corpus directories/files; and
- create, write, inspect, and remove access for `.repo-memory.lock` at the
  checkout root.

The same installed engine may also run lifecycle commands. Those commands need
write access to Corpus files and to the operating system temporary directory used
for transaction staging and retained recovery evidence when rollback or cleanup
cannot complete. A host sandbox must grant those paths explicitly when it permits
writes.

MCP is an interface to Common Knowledge, not a sandbox. The host remains
responsible for process and filesystem isolation. The adapter does not fetch,
merge, switch, or synchronize Git state, notify other checkouts, execute arbitrary
commands from tool input, or coordinate filesystem writers that ignore the CK
lock. Resource subscriptions and proposal writes are outside this adapter.
