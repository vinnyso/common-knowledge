# Legacy Orders evaluation freeze (#40)

This author-side preparation belongs to [issue #40](https://github.com/vinnyso/common-knowledge/issues/40). It freezes three scenarios and two conditions for [#50](https://github.com/vinnyso/common-knowledge/issues/50). No scored task-agent session has run. Reference fixtures and calibration checks measure evaluator behavior, not CK effectiveness.

Start with [scenarios.json](scenarios.json), [conditions.json](conditions.json), and [preparation evidence](evidence/preparation.json). The canonical requirements remain [the agent-first specification](../../docs/agent-first-spec.md#minimal-outcome-evaluation). The separate CK issue/PR-convention failure remains a future candidate; Legacy Orders does not reproduce it.

## Boundaries and layout

- `tasks/` contains exact task-agent prompt bytes. Both conditions receive the same corresponding file.
- `guidance/` contains the CK condition's three accepted Entries, citing only ordinary application evidence at the pinned revision. CSV quoting expects no relevant Entry; it is the low-context control.
- `private/`, `scenarios.json`, preparation evidence and this author runbook are evaluator-only. Never copy this directory, the CK development checkout, its Git objects, or reference patches into a task-agent environment. Private means inaccessible to task agents, not an assertion of secrecy from public readers of CK's repository. Task agents have no web/browser/remote connector tools or shell network access with which to retrieve it.
- Evaluation assets are excluded from the npm package by the existing `files: ["dist"]` boundary. This is not a CK installation in its own development repository.
- The original application bundle stays outside this repository. The author-supplied path is a local binding; do not publish or vendor it. Calibration patches are newly authored changes, not a bundled application copy.

## Preparation and artifact verification

Requires Git, Python 3.12+, JDK 21, Node/npm, and the pinned client/runtime in `conditions.json`. The verified host is macOS arm64. Do not silently substitute another host or client configuration.

From the CK repository:

```sh
npm ci
npm run preflight
node --test test/evaluation-assets.test.mjs
python3 evaluation/legacy-orders/verify.py
```

`freeze.json` inventories all authored assets except itself. Bind both its SHA-256 and the merged preparation Git revision in #50: the inventory is an integrity check, not a signature. Never refresh hashes to hide drift after scored work starts.

Supply an explicit absolute bundle path and a new author-only restore destination:

```sh
python3 evaluation/legacy-orders/verify.py \
  --bundle "$CK40_BUNDLE" --restore "$CK40_AUTHOR_APP"
```

The verifier rejects missing/mismatched artifacts, verifies complete history in an empty object database, checks the exact `main` ref, then makes a standalone clone and checks its objects. It never alters the bundle. Repeat with distinct destinations for independent copies; do not use linked worktrees or shared object directories for task agents. Remove the restored application's origin remote before dispatch.

Use Java 21 and explicitly located author-only Maven/npm caches. The first preparation may download the locked dependencies. A clean npm cache populated by the frontend's locked `npm ci` contains only its dependency inputs. Do not expose the user's broad npm cache, Maven settings, credentials, or arbitrary locally built artifacts to task agents. A seeded Maven repository must contain only audited third-party dependency/build artifacts (no local project/SNAPSHOT artifacts); record its file inventory digest. Prepare the pinned Maven Wrapper distribution separately under a per-run `MAVEN_USER_HOME`.

From the restored application:

```sh
./mvnw -B -ntp -Dmaven.repo.local="$CK40_M2" -Pconsole clean verify
npm_config_offline=true ./mvnw -o -B -ntp \
  -Dmaven.repo.local="$CK40_M2" -Pconsole clean verify
```

Launch with an allowlisted environment (PATH, HOME, CODEX_HOME, TMPDIR, TZ, LANG, JAVA_HOME, MAVEN_USER_HOME, npm_config_cache and offline flags), rather than inheriting unrelated host variables. Set `JAVA_HOME` to the JDK 21 installation and `npm_config_cache` to the intended dedicated cache for both commands. Set `MAVEN_USER_HOME` when exercising isolated homes. The full gate includes frontend TypeScript, interaction tests and production build plus Java unit/integration/architecture checks and packaged UI. Backend-only `verify` is insufficient. Preserve fresh reports/logs and cache provenance outside task-agent access. Existing author caches can seed preparation, but historical build results cannot substitute for this gate.

## Reproduce evaluator calibration

Author checks before task agents see a scenario. For each patch listed in `scenarios.json`, restore a new author-only application clone, apply the patch, and save the fixture in a local commit with explicit author attribution. The unmodified baseline is the CSV failing control. These are reference fixtures, never scored trials. Patches use zero context to avoid treating required unified-diff blank context markers as trailing whitespace; apply only to the verified pinned baseline with the explicit flag below.

```sh
git -C "$CK40_FIXTURE" apply --unidiff-zero "$CK40_PATCH"
git -C "$CK40_FIXTURE" add src/main/java
git -C "$CK40_FIXTURE" commit -m "Author-only calibration fixture"
python3 evaluation/legacy-orders/evaluate.py \
  --source "$CK40_FIXTURE" --revision "$CK40_FULL_SHA" \
  --scenario reference-import --work "$CK40_NEW_EVALUATOR_COPY" \
  --cache "$CK40_AUTHOR_CACHE"
```

Choose `reference-import`, `dispatch-export` or `csv-quoting` as appropriate. Use full immutable candidate SHAs. `evaluate.py` first verifies the frozen inventory, then exports the saved candidate into a new evaluator-only copy. It guards all original files outside backend Java source (including existing tests, documentation, frontend, migrations, dependencies and build harness), rejects added Maven configuration, requires non-skipped JUnit report evidence for the expected suites, runs the full public gate, installs the private tests only in this copy, and records functional and architectural results separately. Preserve candidate code, tests, diffs, logs, JUnit reports and result JSON. A future task candidate is evaluated the same way; the evaluator never calls a model or returns its copy to a task agent.

Required calibration:

| Scenario | Correct fixture | Architectural decoy / negative |
| --- | --- | --- |
| Reference import | Public, functional and architectural pass | Public and functional pass; architectural assertion fails for controller-owned transaction/storage |
| Dispatch export | Public, functional and architectural pass | Public and functional pass; architectural assertion fails for direct legacy DAO access |
| CSV quoting | Public and functional pass; architecture N/A | Unmodified baseline public pass, functional assertions fail |

An expected red result must be the named JUnit assertion, not compilation, dependency resolution or startup failure. `CKBoundaryTest` resolves the actual Spring route and follows calls to a public application bean; import additionally requires a real proxy and non-read-only transaction. Functional checks independently exercise real database rollback. Public `ArchitectureIT` alone exempts the legacy controller classes and cannot establish this boundary. Independent review assesses the residual semantic boundary; these finite checks do not prove every possible architecture.

## Freeze and probe isolation

Use one active run at a time under `/private/tmp/ck40-runs/<unique-id>`. Each run owns its app, fresh `HOME`, fresh `CODEX_HOME`, `TMPDIR`, installed tool prefix and dependency caches. No writable trial state is shared. Do not fork this author conversation or use its memory as a task-agent context.

Before building a launch environment, run this from an unsandboxed author shell so the installed client can apply its own native sandbox:

```sh
python3 evaluation/legacy-orders/isolation.py \
  --run /private/tmp/ck40-runs/UNIQUE_ID \
  --private-file "$CK40_EXISTING_PRIVATE_FILE"
```

The script uses a clean allowlisted environment, generates the native permission configuration, verifies positive read/write/directory-resolution cases, denies author material, original user memory, other-run files, symlink escapes and cross-run writes, and proves task-shell network denial against a live local server. It removes its app probe files/directory afterward so the verifier can restore a new `<run>/app`. It makes no model calls. Startup errors cannot count as network denial. The explicit subtree exclusions preserve filesystem ancestor metadata required by builds; enumerate all current temporary subtrees and other runs before each launch. Stop if the directory inventory or author-material locations change. Keep all author material in the excluded CK/source-home or author-temporary locations. Do not create another session or new author-material directory while a run is active.

The client itself needs model-service connectivity; its native shell permission profile disables command networking. Disable web search and expose no browser, apps, other MCP servers, hooks, remote tools, user skills or persistent memory. Only the generated config and deliberate CK additions may load. Pin/audit the system executable locations, since ordinary system/tool reads remain allowed. The fresh client home contains only necessary authentication, supplied separately and never committed.

Restore the run's application independently from the verified bundle, then remove its origin. Copy only audited dependencies into run-owned caches. Execute the full offline application gate through `codex sandbox --permission-profile ck40 -C <run>/app ...` using this run's HOME/CODEX_HOME/TMPDIR, Java, Maven-user home and cache bindings. The preparation evidence records this operational positive check; repeat for changed bindings. Capture process output through pipes or files inside the allowed run root, then copy logs to private author storage after exit. Node initialization can fail when an inherited stdout/stderr file descriptor points to a denied author path. Never put hidden evaluator output in a task run root.

For the CK condition only, install the exact tarball identified by `conditions.json` into `<run>/tool`; run its CLI `init` in `<run>/app`, then `add` each frozen guidance file. Copy guidance into the run before using it; author paths remain denied. Validate the resulting corpus. Configure only its stdio server, bound to `<run>/app`, with `enabled_tools = ["search", "read", "validate"]`, and add exactly `consultation.txt` to its temporary instructions. Baseline receives no CK server/corpus/consultation. Ordinary application instructions remain identical.

Use [the official permission-profile reference](https://developers.openai.com/codex/config-reference/) for the config syntax. The exact command form used by the local probes comes from the installed client's help. Run `mcp-smoke.mjs` against the installed artifact to check real stdio search/read/validate without a task-agent call. The adapter exposes additional proposal tools internally; confirm the client filter advertises only the three retrieval tools for #50. No Reflection or proposal application is measured here.

## #50 dispatch and evidence contract

Scored work starts only after this PR is independently approved and human-merged, #40 is Done, and #50 binds the exact merged preparation revision, freeze hash, application revision, tarball, prompts/guidance, client/runtime/model/settings/tools and local isolation bindings. The model identifier is pinned; the client does not expose an immutable backend serving snapshot. Retain returned model metadata and disclose this limitation. A differing input is a stop, not permission to revise the protocol after seeing outcomes.

Start six fresh sessions, one per scenario/condition, without prior conversations. Use the frozen model/effort and flags from `conditions.json`, with a fresh generated config. Do not pass `--ignore-user-config`, because the intended config is now in the fresh CODEX_HOME. Do not override the named permission profile with a sandbox-mode flag. The common environment includes UTC, the pinned locale and explicit cache/tool locations. Deliver only the corresponding exact task bytes and condition instructions. No model call is needed to prepare or review #40.

Each session gets one implementation/handoff, with the frozen 20-minute wall limit. Alternate baseline/CK order across scenarios and record actual order and timestamps. Retain infrastructure-invalid attempts and their causes; do not replace task-agent failures or select the best candidate. A client preflight that cannot load the selected model/tools is an execution prerequisite gap for #50, never a scored result.

Capture ordered tool names and exact arguments during the first session, relevant result evidence, first relevant search/read versus decision order, code revision/diff, and acceptance checks. Keep raw events private; publish only bounded redacted evidence. After each agent exits, the author saves its final source/tests as an immutable candidate and exports it for independent evaluation. Never reveal private-check failures to the same agent for another attempt.

Write one local JSON record per attempt using [result.schema.json](result.schema.json); JSONL can concatenate those records. Keep pointers to tool events, saved candidate/diff, evaluator result and isolation evidence. Record retrieval, reading before the decision, applicability, followed behavior, stale/conflicting/noisy guidance, public/functional/architectural outcomes, and observed preparation/execution/correction/review effort separately. Missing observations are `unavailable` or null with an explicit gap; do not infer reading or causality from retrieval or self-report. Infrastructure failures have no fabricated candidate. Retain null and negative outcomes and avoid savings/general-effectiveness claims.

No Docker, installers, generic runner, CK runtime API, full Project Genome checkpoint-3 work or old benchmark condition matrix is introduced. #41 follows #50; packaging and the later two-session Reflection/reuse proof remain #42/#51.
