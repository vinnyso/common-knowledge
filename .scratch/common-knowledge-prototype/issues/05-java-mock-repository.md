# Common Knowledge Java 21 enterprise mock repository

Status: ready-for-agent

## Objective

Create the small, enterprise-shaped Java fixture that makes Common Knowledge's
cross-language and repeated-sharp-edge value observable.

## Dependencies

- Deterministic Trigger and Scope search.

## Relevant user stories

- User stories 11, 12, 13, and 15 through 17 in the prototype PRD.

## Acceptance criteria

- The fixture is a Java 21 Maven project with a committed Maven Wrapper and one
  documented test command.
- The domain resembles a small enterprise billing service while remaining easy
  to understand and fast to test.
- The planted sharp edge concerns project-wide UTC time handling: production
  behavior must use an injected `Clock` and UTC-based types rather than the
  machine default timezone.
- The initial Agent A task exposes a deterministic timezone-sensitive defect
  that can be diagnosed and fixed without hidden infrastructure.
- A separate related Agent B task can be completed correctly by applying the
  memory lesson produced during Agent A's work.
- The fixture begins without the discovered Entry; it does not leak the answer
  through comments, test names, or instructions.
- A minimal `AGENTS.md` tells agents when and how to search, read, and write Repo
  Memory without embedding the lesson itself.
- Tests can demonstrate the sharp edge independent of the developer machine's
  local timezone.
- The fixture contains no database, service dependency, container requirement,
  or unnecessary application framework.

## Out of scope

- Production-scale enterprise architecture, Spring Boot, persistence, networking,
  deployment, or performance testing.

## Comments
