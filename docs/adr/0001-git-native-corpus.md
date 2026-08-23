# ADR-0001: Store the Corpus in the Git repository

**Status:** Accepted  
**Date:** 2026-08-19

## Context

Recurring engineering lessons must be available to agents and developers who use
different machines and harnesses. Agent-local memory does not provide that
portability. A central service would add operational dependencies before the core
workflow has been proved.

## Decision

Common Knowledge stores its Corpus as human-readable files inside the repository.
Git is the source of truth for sharing, history, review, and synchronization.
The first prototype has no hosted memory service or external database.

## Consequences

- A clone carries the same shared knowledge as the associated code.
- Entries are visible in normal diffs and follow established review practices.
- Retrieval can operate offline against the working tree.
- Conflicts and lifecycle maintenance use normal repository collaboration
  practices.
- Cross-repository sharing and centralized policy are deferred to a future
  design, if the local workflow proves valuable.
