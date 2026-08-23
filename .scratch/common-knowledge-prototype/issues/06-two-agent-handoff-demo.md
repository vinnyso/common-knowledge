# Common Knowledge clean-clone two-agent handoff demonstration

Status: ready-for-agent

## Objective

Prove that one agent can record a project lesson and a later independent agent
can retrieve and apply it without agent-local persistent memory.

## Dependencies

- Java 21 enterprise mock repository.

## Relevant user stories

- User stories 2, 4, 11, 12, 15, 16, and 18 in the prototype PRD.

## Acceptance criteria

- The CLI is built once as a local npm package artifact and the identical
  artifact is installed into both isolated agent environments.
- Agent A starts from the untouched Java fixture, follows its repository knowledge
  protocol, diagnoses and fixes the planted defect, adds a valid Entry, and
  commits the Entry with the code change.
- Agent B starts from a clean clone containing Agent A's committed change but has
  no access to Agent A's conversation or harness-local memory.
- Agent B follows `AGENTS.md`, searches Common Knowledge before related work, receives
  the relevant Entry with an explanation, and completes the related task without
  repeating Agent A's failed investigation.
- Both Java tasks and the Common Knowledge validation suite pass in the final clone.
- The issue resolution records commands, observable results, relevant commit
  identifiers, and whether the demo met the design specification's success
  condition.
- The runbook clearly separates automated fixture checks from the manual use of
  two independent agent sessions.

## Out of scope

- Benchmark scoring, hosted services, registry publication, harness adapters,
  and claims of statistical effectiveness from a single demonstration.

## Comments
