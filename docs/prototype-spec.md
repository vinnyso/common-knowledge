# Common Knowledge prototype specification

**Status:** Approved 1.0  
**Last updated:** 2026-08-22

## 1. Product thesis

Common Knowledge is a Git-native shared knowledge layer for recurring engineering
lessons. It lets software agents and developers preserve and reuse project-specific
gotchas, patterns, anti-patterns, and debugging notes without placing the entire
corpus in every agent's instructions or leaving knowledge stranded in one
developer's local harness memory. What one agent learns, every agent can use.

Static instruction files define *how agents use the knowledge system*. The
repository corpus holds the accumulating project knowledge itself.

## 2. Problem

As a project grows, developers and their agents repeatedly encounter the same
sharp edges. A successful fix may be remembered only in a local agent store, or a
team may add it to a global instruction file. Local memory does not travel to
other developers or harnesses; a large global instruction file creates context
bloat and makes relevant guidance difficult to find.

The result is repeated investigation, inconsistent fixes, and an instruction file
that becomes an uncurated knowledge dump.

## 3. Goals

The first prototype must:

1. Keep shared knowledge in the repository, so Git carries, versions, reviews, and
   merges it alongside code.
2. Let independently configured agents read and write the same corpus using a
   small, harness-neutral command interface.
3. Retrieve only entries relevant to the work at hand instead of injecting the
   full corpus into every prompt.
4. Preserve enough structure and provenance for an agent or human to judge
   applicability and correct stale knowledge.
5. Demonstrate an end-to-end handoff: one agent records a new lesson and a later,
   independent agent uses it to avoid or resolve the same issue.

## 4. Non-goals for the prototype

- Defining an industry-wide agent-knowledge standard.
- A hosted, cross-repository, or organization-wide memory service.
- Automatic synchronization outside Git.
- Mandatory vector search, embeddings, or an LLM at retrieval time.
- Replacing source documentation, code comments, issue trackers, or runbooks.
- Solving identity, authorization, or secret handling beyond the repository's
  existing Git access controls.
- Fully autonomous publication without normal repository review safeguards.

## 5. Core concepts

| Term | Meaning |
| --- | --- |
| **Corpus** | The collection of Common Knowledge entries stored in one repository. |
| **Entry** | A concise, durable statement about a project-specific lesson. |
| **Trigger** | A word, error code, command, file path, or task cue that suggests an entry may apply. |
| **Scope** | The code paths, tools, or contexts in which an entry applies. |
| **Provenance** | Information indicating where a lesson came from and who/what recorded it. |
| **Lifecycle** | An entry's progression from active to superseded or retired. |

## 6. Proposed repository format

The corpus lives in a visible top-level directory:

```text
.repo-memory/
  README.md                 # Agent operating instructions for this corpus
  schema.json               # Versioned, machine-readable entry contract
  log.md                    # Append-only entry activity log
  entries/
    prisma-shadow-db.md
    flaky-timezone-test.md
```

Each entry is a Markdown document with YAML front matter. Markdown makes entries
readable in GitHub and editors; front matter enables deterministic validation and
retrieval without needing a database. `schema.json` is the versioned, normative
contract for that front matter. The Markdown body remains human-readable and may
be authored by an agent or a person. It must contain the `Situation` and
`Resolution` sections.

```md
---
id: prisma-shadow-db
schema_version: 1
kind: gotcha
title: Local Prisma migrations require a reachable shadow database
triggers:
  - P3006
  - prisma migrate dev
  - shadow database
scope:
  paths:
    - apps/api/**
    - prisma/**
status: active
created_at: 2026-08-19T00:00:00Z
created_by: agent
sources:
  - docs/database.md
---

## Situation

`prisma migrate dev` fails locally when the shadow database is unavailable.

## Resolution

Start the database profile before running the migration:

`docker compose --profile database up -d`

## Notes

Do not add a blanket retry; the failure means the local database service is not
reachable.
```

### Entry schema

- `schema_version`: required positive integer; the prototype starts at `1`.
- `id`: required unique, stable lowercase slug matching
  `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
- `kind`: required enum: `gotcha`, `pattern`, `anti-pattern`, or
  `debugging-note`.
- `title`: required non-empty one-sentence lesson.
- `triggers`: required non-empty array of concrete retrieval cues.
- `status`: required enum: `active`, `superseded`, or `retired`.
- `created_at`: required RFC 3339 UTC timestamp.
- `created_by`: required non-empty agent or human identifier.
- `scope`: optional object; initially supports a `paths` array of repository
  glob patterns.
- `sources`: optional non-empty array of repository paths, issue references, or
  other supporting evidence.
- `updated_at`: optional RFC 3339 UTC timestamp.
- `supersedes`: optional entry identifier; required when an entry replaces a
  previous entry.

`schema.json` expresses these rules as JSON Schema, allowing the CLI and future
integrations to validate the same contract. It rejects unknown required-state
values and malformed metadata, but does not attempt to judge whether an Entry's
lesson is true or useful; that remains a retrieval, review, and maintenance
responsibility.

### Activity log

`log.md` is an append-only Markdown activity log. The CLI appends one terse event
whenever it creates an Entry, updates its content or metadata, or changes its
Lifecycle status. It groups events by UTC date, so agents and developers can
inspect recent knowledge maintenance without deriving every event from Git history;
Git remains the authoritative audit trail.

```md
## 2026-08-19

- 2026-08-19T00:00:00Z | entry.created | prisma-shadow-db | agent | Recorded local migration prerequisite.
```

Each event is one bullet containing exactly five fields separated by ` | `:
RFC 3339 UTC timestamp, event, Entry ID, actor, and summary. The timestamp's UTC
date must match its `## YYYY-MM-DD` heading. The initial event values are
`entry.created`, `entry.updated`, `entry.superseded`, and `entry.retired`.

The summary is required, limited to 160 characters, and must be one terse
sentence containing only information pertinent to the Entry change. Fields may
not contain newlines or the `|` delimiter. Logs must not contain secrets, full
prompts, verbose task transcripts, implementation narration, or chain-of-thought.
`validate` checks the line structure, field values, dates, and referenced Entry
IDs. Git review, rather than `validate`, enforces append-only history.

## 7. Agent workflow

### Read

At the start of relevant work, an agent queries the corpus with the task, error,
command, technology, and/or affected paths. It reads the small returned set of
active entries, verifies they fit the current codebase, and treats them as
project-specific guidance rather than unchallengeable truth.

### Write

After resolving a recurring-worthy lesson, an agent creates an entry when the
lesson is specific, likely to recur, and actionable. It updates or supersedes an
existing entry when the new lesson overlaps an existing one. It must not record
secrets, personal information, verbose task transcripts, or one-off observations.

### Maintain

Agents can mark entries superseded or retired when code, tooling, or evidence
makes them obsolete. Normal Git diffs and review remain the audit and quality
mechanism.

## 8. Prototype interface

The prototype exposes a small local CLI, tentatively named `common-knowledge`:

```text
common-knowledge init
common-knowledge search <query> [--path <path>] [--kind <kind>]
common-knowledge read <id>
common-knowledge add <entry-file>
common-knowledge update <entry-file>
common-knowledge retire <id> --reason <reason>
common-knowledge validate
```

`add` reads the Entry ID from the supplied file and writes the validated Entry to
`entries/<id>.md`; an existing ID is an error. `update` replaces the existing
Entry with the same ID, preserves its creation provenance, sets `updated_at`, and
logs the change. `retire` changes the Entry's status to `retired`, sets
`updated_at`, and records the required reason in the activity log. Adding an
Entry with `supersedes` atomically marks the referenced Entry `superseded` and
logs both Lifecycle events.

`search` is case-insensitive and uses deterministic filtering and ranking:

1. Include active Entries only.
2. When `--kind` is supplied, filter to that exact kind.
3. When `--path` is supplied, include unscoped Entries and Entries with a matching
   repository-relative Scope glob; exclude Entries scoped only to other paths.
4. Rank the remaining Entries lexicographically by this descending relevance
   tuple: exact Trigger phrases contained in the query, matching Scope,
   overlapping Trigger tokens, then overlapping title tokens.
5. Exclude Entries with no matching evidence, return at most five, and break
   ties by Entry ID in ascending lexical order.

Search normalizes text to lowercase, collapses whitespace, and treats contiguous
letters or numbers as tokens. An exact Trigger phrase is a normalized Trigger
appearing contiguously in the normalized query. Scope paths and globs use
repository-relative forward-slash notation. Results expose the Entry ID, title,
kind, and match reasons so an agent can understand the ordering before using
`read`. Semantic retrieval may be added only if the demo shows this deterministic
approach is insufficient.

The CLI reads and writes the working tree. It does not commit, push, or bypass a
repository's review practices.

## 9. Demonstration scenario

1. The demo builds the CLI as a local npm package artifact and installs that same
   artifact into two isolated agent environments; registry publication is not
   required.
2. The mock repository declares Java 21, includes the Maven Wrapper, and provides
   one documented command for running its tests.
3. The mock repository includes a minimal `AGENTS.md` knowledge protocol. It tells
   an agent to search the Corpus at the start of relevant work using the task,
   affected paths, technologies, and observed errors.
4. Agent A encounters a planted project sharp edge, diagnoses it, fixes it, and
   adds a validated entry to `.repo-memory/`.
5. The entry is committed with the code change.
6. Agent B runs independently in a fresh harness or clone, follows the same
   repository protocol, and begins related work.
7. Agent B queries Common Knowledge, receives the relevant entry, and avoids the same
   failed investigation or applies the documented resolution.

Success is measured by relevance, clarity, and portability—not by benchmark
scores or autonomous code changes.

## 10. Resolved prototype decisions

1. The Corpus directory is `.repo-memory/`.
2. The CLI and initial developer library use TypeScript on Node.js. The mock
   application is a small, enterprise-shaped Java 21 project built with the
   Maven Wrapper. This deliberately proves that the memory format and CLI are
   independent of the consumer repository's language and ecosystem.
3. Writes are direct working-tree changes. An agent proposes an Entry by adding
   it to the current unit of work, where it appears in the normal Git diff. The
   CLI does not stage, commit, or push the change.
4. An Entry must be project-specific, actionable, and likely to recur. Agents do
   not record one-off observations, task transcripts, secrets, or material better
   maintained in canonical documentation. An overlapping Entry is updated or
   superseded instead of duplicated.
5. The prototype has no repository configuration file. Its conventions,
   `schema.json`, and operating instructions are sufficient until a concrete
   repository-specific setting needs to vary.

## 11. Initial acceptance criteria

- A new repository can initialize a corpus with one command.
- Valid entries can be added, read, and found using error, keyword, and path
  cues.
- Invalid or duplicate entry identifiers fail validation with useful feedback.
- Entry updates, supersession, and retirement update the correct files and append
  valid, terse activity events.
- Equivalent searches return the same ordered results and match explanations.
- A fresh agent can follow a short harness instruction to retrieve relevant
  memory before acting.
- The mock repository's `AGENTS.md` supplies that protocol; the demonstration
  does not rely on agent-local persistent memory or a harness-specific hook.
- The demo scenario in section 9 works from a clean clone without relying on
  agent-local persistent memory.

## 12. Future goals (not part of the prototype)

### Automated maintenance

Common Knowledge may later provide a GitHub Action, linter, or equivalent CI
integration that maintains Corpus quality. Candidate checks include schema
validation, duplicate or overlapping Triggers, broken source references, stale
Entries, and Lifecycle inconsistencies. The first automation should report
findings or propose a reviewable change; it must not silently rewrite or retire
Entries.

Maintenance may add two distinct optional time fields. `review_after` asks for a
human or agent to re-evaluate an Entry after a date, while `expires_at` is only
for knowledge known to stop applying at a defined time, such as a temporary
migration or feature flag. Passing either date must surface a warning or review
task, not automatically delete, retire, or hide the Entry. The automation should
create or update one `needs-triage` maintenance issue per affected Entry rather
than create duplicates on every run. That issue records the Entry ID, triggering
date, reason, and recommended resolution; an explicit reviewed, superseded, or
retired change remains necessary.

### Entry promotion

Common Knowledge may later promote an Entry into a more prescriptive instruction when
its severity, breadth of applicability, recurrence, confidence, and supporting
evidence justify giving it default agent attention. Promotion is a
materialization, not a move: the Entry remains the canonical detailed record in
the Corpus, while the instruction contains a short rule or pointer.

Promotion must be governed by an explicit repository policy, be reviewable,
support scopes such as a path or tool, and permit demotion when the condition no
longer applies. This prevents the promotion mechanism from recreating the
unbounded instruction-file bloat that Common Knowledge is intended to avoid.

### Write approval policy

Some repositories may require the driving user to approve an Entry before it is
written into the Corpus. A future policy may support preview, patch, or
approval-gated write modes. The prototype uses direct working-tree writes because
they already remain visible and reviewable in the current unit of work.

### Repository configuration

A future configuration file may control repository-specific policy such as write
approval, search limits or ranking weights, custom Entry kinds, ignored paths,
maintenance timing, promotion thresholds, and harness behavior. Configuration is
introduced only when the first real repository needs to vary a default; it is
not required by the prototype.
