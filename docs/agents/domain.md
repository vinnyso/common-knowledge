# Domain documentation

This repository has a single domain context. Load documentation according to the
changed behavior or decision:

- Use the assigned issue or explicitly agreed task scope to identify acceptance
  criteria and relevant sections of [the canonical specification](../prototype-spec.md).
- Use [CONTEXT.md](../../CONTEXT.md) for domain terminology and project boundaries.
- Read decisions in `docs/adr/` that govern the affected design.
- Use [the PRD](../PRD.md) when product intent or user outcomes need clarification.

Read enough surrounding context to understand dependencies and constraints;
expand when uncertainty or the affected surface requires it. A local wording
correction does not require reading every product document.

Use the established domain terminology. The prototype specification is canonical
when project artifacts conflict. Surface an applicable conflict with the task,
specification, or an ADR instead of silently resolving it through an edit.
