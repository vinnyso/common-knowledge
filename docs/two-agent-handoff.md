# Clean-clone two-agent handoff

This runbook proves the prototype handoff in
[`prototype-spec.md`](prototype-spec.md#9-demonstration-scenario). The automated
checks establish a healthy fixture and CLI. The manual procedure is separate
because only two independent agent sessions can establish the context boundary.

## Automated fixture checks

From the Common Knowledge repository, install dependencies and verify the CLI:

```sh
npm ci
npm run preflight
git diff --check
```

From `fixtures/java-billing-service`, verify the untouched Java baseline:

```sh
./mvnw test
```

These commands are repeatable regression checks. They do not prove that a later
agent received only repository-carried knowledge.

## Manual independent-session procedure

1. Record the Common Knowledge fixed point. Export
   `fixtures/java-billing-service` from that commit into a standalone repository,
   commit the untouched tree, and run `./mvnw test`.
2. Build the CLI once, create one local package with `npm pack`, and record the
   tarball's SHA-256. Install that exact path into separate Agent A and Agent B
   tool prefixes. Do not rebuild or repack between installations.
3. Start Agent A in the untouched standalone fixture with an empty agent context.
   Give it only the location of its installed CLI and direct it to read
   `AGENTS.md` and `tasks/agent-a.md`. Do not supply the planted diagnosis.
4. Have Agent A use the installed CLI, complete the task, validate the Corpus,
   run `./mvnw test`, commit the code, test, and Entry together, and push.
5. Create Agent B's repository with a new `git clone` of Agent A's pushed commit.
   Confirm its `HEAD` equals `origin/main` and its working tree is clean.
6. Start Agent B as a different empty-context agent session. Give it only the
   new clone, its installed CLI location, and instructions to read `AGENTS.md`
   and `tasks/agent-b.md`. Its prompt must not contain Agent A's conversation,
   local memory, Entry contents, implementation notes, diagnosis, or command
   results.
7. Preserve Agent B's first search command and complete match explanation. Have
   it read the returned Entry, complete its task, run the Java and Corpus checks,
   commit, and push.
8. Make one more fresh clone of Agent B's commit. Run `./mvnw test`,
   `common-knowledge validate`, `git diff --check`, and confirm the clone is
   clean at the pushed commit.

Keep agent task prompts and their reports as session evidence. Do not replace
either agent with a script or call internal Common Knowledge APIs.

## Recorded run: 2026-08-26

The source fixed point was
`54e6e5f5a775426121cb8fb66c198b1a8a9267c6`, which includes merged Issue #24.
The fixture export was committed as the untouched standalone baseline
`78d1ab2257d2efdb0d0237607a7f66cd8ac07fa3`; its initial `./mvnw test` passed
with 1 test and no failures.

The CLI was built and packed once:

```sh
npm run build
npm_config_cache=/private/tmp/common-knowledge-issue-6.EQprMw/npm-cache \
  npm pack --pack-destination /private/tmp/common-knowledge-issue-6.EQprMw
shasum -a 256 \
  /private/tmp/common-knowledge-issue-6.EQprMw/common-knowledge-0.1.0.tgz
```

The package identities were:

```text
npm filename: common-knowledge-0.1.0.tgz
npm shasum: 7d647d3c269e5ab8204cc0129e7239f7c22c97c6
SHA-256: c3b263f449e75f2559e2fac0f318e3241cc69e6e795aed18795e92f10f83cdeb
```

That same tarball path was installed into
`agent-a/tool` and `agent-b/tool`. Both installations reported
`common-knowledge@0.1.0`, and `diff -qr` over their installed
`node_modules/common-knowledge` trees returned no differences.

```sh
npm_config_cache=/private/tmp/common-knowledge-issue-6.EQprMw/npm-cache-a \
  npm install --prefix /private/tmp/common-knowledge-issue-6.EQprMw/agent-a/tool \
  /private/tmp/common-knowledge-issue-6.EQprMw/common-knowledge-0.1.0.tgz \
  --ignore-scripts --no-audit --no-fund
npm_config_cache=/private/tmp/common-knowledge-issue-6.EQprMw/npm-cache-b \
  npm install --prefix /private/tmp/common-knowledge-issue-6.EQprMw/agent-b/tool \
  /private/tmp/common-knowledge-issue-6.EQprMw/common-knowledge-0.1.0.tgz \
  --ignore-scripts --no-audit --no-fund
diff -qr \
  /private/tmp/common-knowledge-issue-6.EQprMw/agent-a/tool/node_modules/common-knowledge \
  /private/tmp/common-knowledge-issue-6.EQprMw/agent-b/tool/node_modules/common-knowledge
```

Agent A ran in the separately dispatched, empty-context session
`issue6_agent_a`. Its first CLI submission was:

```sh
/private/tmp/common-knowledge-issue-6.EQprMw/agent-a/tool/node_modules/.bin/common-knowledge \
  search "reconciliation close date timezone billing cycle" && \
/private/tmp/common-knowledge-issue-6.EQprMw/agent-a/tool/node_modules/.bin/common-knowledge \
  search "src Java LocalDate Instant ZoneId" && \
/private/tmp/common-knowledge-issue-6.EQprMw/agent-a/tool/node_modules/.bin/common-knowledge \
  search "mvn test invoice"
```

The first search exited 1 with the output below, so the two later searches in
the `&&` chain did not run:

```text
Corpus not found at .repo-memory; run common-knowledge init first.
```

Agent A then ran `common-knowledge init`, reproduced the Java defect with
`./mvnw -Dtest=BillingCycleTest#usesTheBillingClockZoneForCloseDateAtYearBoundary test`
(expected `2025-01-01`, actual `2024-12-31`), fixed it, and added the Entry with:

```sh
/private/tmp/common-knowledge-issue-6.EQprMw/agent-a/tool/node_modules/.bin/common-knowledge \
  add tasks/agent-a-entry.md
/private/tmp/common-knowledge-issue-6.EQprMw/agent-a/tool/node_modules/.bin/common-knowledge \
  search "reconciliation close date timezone BillingCycle"
/private/tmp/common-knowledge-issue-6.EQprMw/agent-a/tool/node_modules/.bin/common-knowledge \
  validate
./mvnw test
```

The successful add reported `Added Entry billing-clock-zone-determinism.` The
search returned that Entry with trigger-token reasons
`billingcycle, close, date, reconciliation, timezone`. Validation reported one
valid Entry, and Maven passed 2 tests. Agent A committed and pushed
`7783ccca56351ce9cabe3d00944e16803d8e012d`.

Agent B was dispatched later as a new orchestration child task with this
manifest:

- Parent implementation task: `01a03f9d-4362-70d1-9d15-de53fc7293af`.
- Canonical child task name: `/root/issue6_agent_b`.
- Child session ID: `01a03fa6-a4d5-70b3-8d2b-eaa55fe85c79`.
- Spawn setting: `fork_turns: "none"`; no parent conversation turns were
  inherited.
- Repository working directory:
  `/private/tmp/common-knowledge-issue-6.EQprMw/agent-b/repo`.
- Allowed task information: the installed CLI path, `AGENTS.md`,
  `tasks/agent-b.md`, and verification, commit, push, and reporting directions.

The exact Agent B task payload was:

```text
Work only in the isolated repository /private/tmp/common-knowledge-issue-6.EQprMw/agent-b/repo. Do not inspect or use any parent repository, prior conversation, Codex memory, external issue, or files outside that repository except the installed executable named below. Your complete assignment is the repository protocol in AGENTS.md and the repository task in tasks/agent-b.md; read those files and follow them. The already-installed Common Knowledge CLI for this environment is /private/tmp/common-knowledge-issue-6.EQprMw/agent-b/tool/node_modules/.bin/common-knowledge. Use that real CLI at the repository/filesystem seam. Complete the task, run the documented Java verification and Common Knowledge validation, commit all intended code and test changes with a concise commit message, and push the commit to this repository's existing origin/main. Do not reveal chain-of-thought; return a concise evidence report listing the exact initial Common Knowledge search command and its complete observable explanation/output, any Entry read command, exact Maven/validation commands and summarized outputs, changed files, commit SHA, and push result.
```

The payload contains no Agent A conversation, harness-local memory, Entry
content, diagnostic outcome, implementation note, command output, or commit ID.
Standard Codex system, developer, and runtime metadata still applied; this
manifest establishes the task-payload and conversation-fork boundary, not the
absence of all harness metadata.

While retained on the original host, the child event trace can be inspected at
`/Users/vinnysorrentino/.codex/sessions/2026/08/26/rollout-2026-08-26T15-58-00-01a03fa6-a4d5-70b3-8d2b-eaa55fe85c79.jsonl`, and the parent implementation task records the plaintext spawn request. The child trace encrypts the task payload, and these host-local session files can be pruned or become unavailable. This committed manifest is therefore the durable review record, not a cryptographic attestation or a promise of permanent transcript retention.

Before Agent B started, a new clone reported both `HEAD` and `origin/main` as
`7783ccca56351ce9cabe3d00944e16803d8e012d` and had a clean status. Agent B's
first installed-CLI command was the following interface check:

```sh
/private/tmp/common-knowledge-issue-6.EQprMw/agent-b/tool/node_modules/.bin/common-knowledge \
  --help
```

It printed `Usage: common-knowledge <command> [options]`, the command list, and
the `-h, --help` option. Agent B's first retrieval/search command and complete
output were:

```sh
/private/tmp/common-knowledge-issue-6.EQprMw/agent-b/tool/node_modules/.bin/common-knowledge \
  search "unpaid invoice follow-up close-date boundary billing time Maven"
```

```text
billing-clock-zone-determinism | gotcha | Derive billing dates from the injected Clock without replacing its zone.
  - trigger tokens: boundary, close, date
  - title tokens: billing
```

The retained command order is: read `AGENTS.md` and `tasks/agent-b.md`, run
`--help`, search, read `billing-clock-zone-determinism`, inspect source code, and
then implement. The search and Entry read therefore preceded source-code
inspection and implementation.

Agent B then ran:

```sh
/private/tmp/common-knowledge-issue-6.EQprMw/agent-b/tool/node_modules/.bin/common-knowledge \
  read billing-clock-zone-determinism
./mvnw test
/private/tmp/common-knowledge-issue-6.EQprMw/agent-b/tool/node_modules/.bin/common-knowledge \
  validate
git diff --cached --check
```

It applied the Entry's injected-clock guidance without reproducing Agent A's
failing investigation. Maven passed 5 tests, Corpus validation reported two
valid Entries after Agent B recorded its related pattern, and the diff check
passed. Agent B committed and pushed
`a6e3d439c22a749b7937c8aac5640d4d11bf6118`.

A final clone and verification used:

```sh
git clone --no-local /private/tmp/common-knowledge-issue-6.EQprMw/origin.git \
  /private/tmp/common-knowledge-issue-6.EQprMw/final/repo
./mvnw test
/private/tmp/common-knowledge-issue-6.EQprMw/agent-b/tool/node_modules/.bin/common-knowledge \
  validate
git rev-parse HEAD
git rev-parse origin/main
git status --short
git fsck --no-dangling
git diff --check
```

The clone reported clean, matching `HEAD` and `origin/main` values of
`a6e3d439c22a749b7937c8aac5640d4d11bf6118`. Maven passed all 5 tests,
Common Knowledge reported `Corpus is valid (2 Entries).`, and the Git checks
returned no errors.

This run meets the specification's success condition: relevant, readable
knowledge crossed a clean-clone and empty-session boundary through Git and the
identical installed CLI artifact, and Agent B applied it before implementing the
related task. It is one qualitative demonstration, not a benchmark or claim of
statistical effectiveness.
