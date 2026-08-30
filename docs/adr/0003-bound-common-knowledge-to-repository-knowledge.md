# ADR-0003: Bound Common Knowledge to repository knowledge

**Status:** Accepted
**Date:** 2026-08-30

## Context

We explored expanding Common Knowledge into failure detection, agent evaluation,
improvement recommendations, and relationships with Controls over application or
agent behavior. Those capabilities require visibility into agent sessions, task
outcomes, semantic relevance, and repository governance that a harness-neutral
knowledge CLI does not own. Treating client assertions as authoritative would
add complexity without making those judgments reliable.

## Decision

Common Knowledge remains responsible for its Git-native Corpus, deterministic
retrieval, validation, provenance, and explicit Entry Lifecycle operations. It
does not own agent orchestration, session observation, outcome evaluation,
autonomous improvement, or repository governance. A broader agent system may use
Common Knowledge as one contextual tool and may propose Corpus changes through
the normal Git review workflow.

## Consequences

- Enhancements must address problems intrinsic to storing, retrieving,
  validating, or maintaining repository knowledge.
- Evaluation harnesses, agent graphs, telemetry, application and agent-behavior
  Controls, MLflow, and Databricks integrations belong to separate systems or
  explicitly bounded integrations.
- Common Knowledge may expose deterministic evidence to clients, but it does not
  infer facts that only a client, harness, or human can observe.
