# Common Knowledge prototype

Status: ready-for-agent

Updated: 2026-08-22

**Canonical design:** [Common Knowledge prototype specification](../../docs/prototype-spec.md).  
**This document:** implementation contract for the first prototype.

## Problem Statement

Teams need project-specific engineering lessons to travel with code without
turning global instructions into an uncurated prompt. The canonical design
specification describes the product rationale, knowledge model, and long-term
boundaries; this PRD defines the first implementation that proves them.

## Solution

Implement the first deterministic, Git-native CLI and prove it against a mock
repository with a planted sharp edge. The CLI manages a Corpus of structured
Markdown Entries and never takes ownership of commits, pushes, or review.

## User Stories

1. As an agent entering an unfamiliar repository, I want to initialize a Corpus with one command, so that shared knowledge has a predictable home.
2. As an agent, I want to search active Entries using an error message, command, technology, or task description, so that I receive only potentially relevant project knowledge.
3. As an agent changing a file, I want to search with the affected path, so that Entries scoped to that part of the repository are easier to find.
4. As an agent that has solved a reusable problem, I want to record an Entry with concise guidance and Provenance, so that a later agent can apply the lesson.
5. As an agent, I want invalid Entry metadata to be rejected with a clear explanation, so that I do not add unusable memory.
6. As an agent, I want duplicate Entry identifiers to be detected, so that the Corpus remains addressable and maintainable.
7. As an agent, I want to read a single Entry by identifier, so that a search result can be examined without loading unrelated memory.
8. As a developer reviewing a change, I want Entries to be ordinary readable repository files, so that I can understand, amend, or reject agent-authored knowledge in a normal diff.
9. As a developer, I want an Entry's Trigger, Scope, and Lifecycle to be visible, so that I can judge when it applies and whether it is current.
10. As a developer, I want obsolete Entries to be marked superseded or retired, so that the Corpus does not preserve misleading instructions as permanent truth.
11. As a developer, I want repository instructions to describe the knowledge protocol rather than embed every lesson, so that default agent context stays small.
12. As a team member using a different agent harness, I want the same repository clone to contain the same Corpus, so that useful knowledge is not locked into one local memory system.
13. As a maintainer, I want the prototype to work without a hosted database, embeddings, or network service, so that adoption and inspection are simple.
14. As a maintainer, I want deterministic search behavior in the first version, so that relevance can be debugged and evaluated before semantic retrieval is introduced.
15. As a project evaluator, I want a mock repository demonstration with a planted sharp edge, so that portability between independent agents is observable rather than theoretical.
16. As an agent author, I want a small harness-neutral command interface, so that adapters can be added later without rebuilding the knowledge model.
17. As a security-conscious developer, I want the agent guidance to prohibit secrets, personal information, and verbose task transcripts in Entries, so that shared knowledge remains appropriate for version control.
18. As a contributor, I want the CLI to leave commits and pushes to the existing Git workflow, so that Common Knowledge does not take ownership of repository governance.
19. As a maintainer, I want a versioned JSON Entry schema, so that agents and tools can validate a Corpus consistently.
20. As a reviewer, I want an append-only Markdown activity log for Entry changes, so that I can inspect knowledge maintenance without reconstructing every action from Git history.

## Implementation Decisions

- The source of truth is a repository-local Corpus, not a local harness database or hosted service.
- The Corpus directory is named `.repo-memory/` for the prototype.
- The CLI and initial developer library use TypeScript on Node.js.
- The mock application is a small, enterprise-shaped Java 21 project built with the Maven Wrapper. It remains intentionally small while proving that the CLI and memory format are language-independent.
- Entries are human-readable Markdown documents with YAML front matter. The front matter provides machine-readable metadata while the body records the actionable lesson.
- Every Entry has a unique stable identifier, a kind, a short title, one or more Triggers, a Lifecycle status, creation date, and authoring provenance.
- A versioned JSON Schema defines the Entry front-matter contract. The CLI enforces its required metadata and allowed values but does not attempt to evaluate the truth of a lesson.
- The initial kinds are `gotcha`, `pattern`, `anti-pattern`, and `debugging-note`.
- The initial Lifecycle values are `active`, `superseded`, and `retired`. Search returns active Entries by default.
- Scope and sources are optional metadata, but supported when the author can identify affected paths or supporting evidence.
- Entries use the flat path `entries/<id>.md`; v1 has no category hierarchy.
- The public interface consists of initialization, search, read, add, update, retire, and validation commands. Adding an Entry with `supersedes` atomically supersedes its predecessor.
- Search filters active Entries by optional kind and Scope applicability, then deterministically ranks exact Trigger phrases, matching Scope, Trigger-token overlap, and title-token overlap. It returns at most five results, uses Entry ID as the stable tie-breaker, and reports match reasons. Embeddings and LLM-based retrieval are explicitly deferred.
- The CLI writes Entries directly into the working tree as part of the current unit of work. The resulting Git diff is the proposal; the CLI does not stage, commit, push, or alter review policy.
- The prototype has no repository configuration file. Conventions, the Entry schema, and operating instructions define its behavior.
- The agent operating instructions explain when to search, write, and maintain the Corpus; they do not become a duplicate store for Entries.
- The prototype supplies a mock repository that contains a realistic but deliberately planted sharp edge, a minimal repository-level knowledge protocol, and a repeatable two-agent handoff scenario.
- The demo builds one local npm package artifact for the CLI and installs that same artifact into both isolated agent environments; publishing to a registry is unnecessary.
- The Corpus includes one append-only Markdown activity log, grouped by UTC date. Each terse event uses the specified five-field, single-line contract and a summary no longer than 160 characters. The CLI records Entry creation, update, supersession, and retirement events; Git remains the authoritative audit trail.
- Future harness adapters are consumers of the CLI contract. No particular agent harness is a dependency of the prototype.

## Testing Decisions

- Tests exercise the CLI/filesystem boundary, the highest practical seam in an otherwise empty project. They should assert observable command output, exit status, and resulting Corpus files rather than parser or ranking internals.
- Tests create isolated temporary mock repositories so the working project and a developer's local environment are never mutated.
- Initialization tests verify that a new mock repository receives a valid, discoverable Corpus layout.
- Add, read, and validation tests verify valid Entry round-tripping; malformed metadata, unsupported kinds, missing required fields, and duplicate identifiers must fail with actionable diagnostics.
- Update, supersede, and retire tests verify file changes, immutable creation provenance, timestamps, atomic predecessor updates, and corresponding activity events.
- Validation tests verify conformance to the versioned Entry schema and reject malformed, incomplete, overly verbose, or invalid activity-log events.
- Search tests use a mock Corpus with multiple Entries and assert exact Trigger, token, kind-filter, and affected-path Scope behavior; stable ordering and match explanations; the five-result limit; and exclusion of superseded, retired, or path-inapplicable Entries.
- The end-to-end demonstration test uses a mock repository with a planted sharp edge and a minimal `AGENTS.md` knowledge protocol. It must show that a fresh Agent B can follow that protocol, retrieve Agent A's committed lesson through the CLI, and act on the documented resolution without agent-local memory.
- The Java fixture declares Java 21, includes the Maven Wrapper, and documents one command for running its tests.
- No unit test should require a live agent harness, network access, embeddings, or a database.

## Out of Scope

- A cross-repository or organization-wide memory service.
- An interoperability standard for other tools.
- Hosted synchronization, identity, authorization, or access control beyond Git.
- Automatic agent commits, pushes, pull requests, or bypass of review.
- Semantic/vector retrieval, embedding generation, or LLM calls during search.
- Importing full chat transcripts or replacing source documentation, issue trackers, code comments, or runbooks.
- Harness-specific integrations before the CLI and mock-repository demonstration prove the core model.
- Approval-gated write modes and repository-specific configuration.

## Further Notes

The current working name for the Corpus directory is `.repo-memory/`; this is a
prototype convention, not a claimed standard. Consult the canonical design
specification for the complete repository format, domain rationale, and deferred
future goals, including automated maintenance, entry promotion, approval-gated
writes, and repository configuration.

## Comments

Initial specification synthesized from the project discussion on 2026-08-19.
