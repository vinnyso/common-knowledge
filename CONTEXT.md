# Common Knowledge context

## Purpose

Common Knowledge is a Git-native shared project knowledge layer for coding
agents. It lets software agents and developers preserve and reuse recurring,
project-specific engineering lessons through the repository without bloating
global agent instructions. What one coding agent learns, every agent can use.

## Domain vocabulary

| Term | Meaning |
| --- | --- |
| **Corpus** | All Common Knowledge entries in one repository. |
| **Entry** | A concise, durable, project-specific lesson. |
| **Trigger** | A task cue, error, command, path, or term used to locate an entry. |
| **Scope** | The paths, tools, or contexts in which an entry applies. |
| **Provenance** | The source and authoring information that supports an entry. |
| **Lifecycle** | An entry's state: active, superseded, or retired. |

## Product principles

- The Git repository is the source of truth for shared knowledge.
- Instruction files define the knowledge protocol; the corpus holds the knowledge.
- Retrieval is targeted and contextual, never wholesale prompt injection.
- Entries are claims with provenance, not unstructured chat transcripts.
- Human-readable Git diffs and normal review practices remain the audit mechanism.
