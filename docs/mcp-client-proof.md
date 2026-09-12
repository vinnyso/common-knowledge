# Codex MCP client proof

This document records the bounded manual behavior proof required by AF-02.
Automated adapter and filesystem coverage remains in `test/mcp.test.mjs`.

## Versions and candidate

- Candidate revision used by the server: `c13fbab37c42aded3dd7f96f924f51c2700e9af4`
- Isolated consumer revision: `f61889f827905a597c7a85d1ee69dd0a07da22cd`
- Node.js: `v26.4.0` (the package minimum remains Node.js 20)
- npm: `11.17.0`
- MCP TypeScript SDK: `@modelcontextprotocol/sdk` `1.30.0`
- Codex client: `codex-cli 0.151.0`
- Model and effort: `gpt-5.6-sol`, medium

## Discovery and direct operations

On 2026-09-12, `codex exec` started the adapter as a required stdio server bound
to `/private/tmp/ck-mcp-client-proof`. Codex initialized the server, discovered
its namespaced tools, and successfully called `common_knowledge/search` followed
by `common_knowledge/read`. Search returned `status: ok` with
`project-slug-contract`; read returned `status: ok` with the complete Entry.

The first startup attempt used the generated `dist/mcp.js` path as the executable
and failed with `Permission denied` before a Codex session was created. The
documented configuration was corrected to launch the build artifact through
`node`; the bounded client run then initialized and completed successfully.

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
