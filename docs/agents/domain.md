# Domain documentation

This repository has a single domain context. Load documentation according to the
changed behavior or decision:

- Use the assigned issue or explicitly agreed task scope to identify acceptance
  criteria and relevant specification sections. For agent-first work, use
  [the combined specification and PRD](../agent-first-spec.md). For unchanged
  v0.1.0 behavior, use [the prototype specification](../prototype-spec.md).
- Use [CONTEXT.md](../../CONTEXT.md) for domain terminology and project boundaries.
- Read decisions in `docs/adr/` that govern the affected design.
- Use [the PRD](../PRD.md) when product intent or user outcomes need clarification.

Read enough surrounding context to understand dependencies and constraints;
expand when uncertainty or the affected surface requires it. A local wording
correction does not require reading every product document.

Use the established domain terminology and the authority boundary in
`docs/agent-first-spec.md`: it governs the next phase, while the prototype
specification remains canonical for unchanged v0.1.0 behavior. Surface other
applicable conflicts with the task, specification, or an ADR instead of silently
resolving them through an edit.
