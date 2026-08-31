# Common Knowledge context

## Purpose

Common Knowledge is a Git-native shared project knowledge layer for coding
agents. It lets software agents and developers preserve and reuse recurring,
project-specific engineering lessons through the repository without bloating
global agent instructions. What one coding agent learns, every agent can use.

## Domain vocabulary

| Term | Meaning |
| --- | --- |
| **Common Knowledge Engine** | The reusable tooling and contracts that manage repository knowledge without owning the project knowledge itself. |
| **Consumer Repository** | The Git repository whose project knowledge and review practices Common Knowledge serves. |
| **Common Knowledge Installation** | A consumer repository's Common Knowledge setup, including its Corpus and agent activation protocol. |
| **Corpus** | All Common Knowledge entries in one repository. |
| **Entry** | A concise, durable, project-specific lesson. |
| **Trigger** | A task cue, error, command, path, or term used to locate an entry. |
| **Scope** | The paths, tools, or contexts in which an entry applies. |
| **Provenance** | The source and authoring information that supports an entry. |
| **Lifecycle** | An entry's state: active, superseded, or retired. |
| **Promotion** | A reviewable process for representing an entry's lesson in a more prescriptive repository mechanism while preserving its provenance and relationship to the entry. |

## Product principles

- The Git repository is the source of truth for shared knowledge.
- Instruction files define the knowledge protocol; the corpus holds the knowledge.
- Retrieval is targeted and contextual, never wholesale prompt injection.
- Entries are claims with provenance, not unstructured chat transcripts.
- Human-readable Git diffs and normal review practices remain the audit mechanism.
