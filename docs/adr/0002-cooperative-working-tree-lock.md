# ADR-0002: Coordinate Corpus commands with a checkout lock

**Status:** Accepted
**Date:** 2026-08-24

## Context

Lifecycle commands can replace more than one Corpus file. Readers must not see
the intermediate files, and two Common Knowledge writers in one checkout must
not interleave their transactions. Trying to provide linearizability against
arbitrary processes that ignore the CLI and mutate filesystem paths during a
command would add platform-specific machinery beyond the prototype's needs.

## Decision

Common Knowledge commands coordinate through a transient exclusive
`.repo-memory.lock` file at the working-tree root. A command acquires the lock
before reading or mutating the Corpus and releases it after success or failure.
Consequently, only one cooperating Common Knowledge command observes or changes
a checkout at a time. A second command fails with a retry diagnostic instead of
waiting or changing files.

The lock records the owning process, command, and UTC creation time. If a process
terminates without cleanup, the diagnostic tells a developer to verify that no
Common Knowledge process owns the lock, remove the stale file manually, and
retry. The CLI does not guess that a lock is stale or remove another process's
lock automatically.

Lifecycle mutations prevalidate their complete candidate change, stage ordinary
files outside the Corpus, and roll back normal installation failures to the
byte-identical originals. External recovery evidence is retained only when
rollback or cleanup cannot complete. If cleanup fails after the Corpus commit,
the command reports failure and explicitly says that the Corpus changes remain
applied, so the retained recovery path is not mistaken for a normal success.

## Consequences

- Concurrent CLI mutations cannot interleave in one working tree.
- `read` and `validate` fail clearly while another Common Knowledge command owns
  the lock, so they do not observe its partial transaction.
- Normal success and ordinary failure leave no lock or transaction backup.
- A crash can require explicit stale-lock recovery.
- Concurrent filesystem writes by non-cooperating processes during a command are
  outside the v1 process model; normal Git working-tree review remains the
  reconciliation mechanism.
