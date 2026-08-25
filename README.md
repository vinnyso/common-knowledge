# Common Knowledge

Shared project knowledge for coding agents.

What one coding agent learns, every agent can use.

## Status

The prototype design and implementation plan are approved and ready for
implementation.

- Canonical design: [`docs/prototype-spec.md`](docs/prototype-spec.md)
- Implementation PRD: [`docs/PRD.md`](docs/PRD.md)
- Domain vocabulary: [`CONTEXT.md`](CONTEXT.md)

## Search benchmark

Run `npm run benchmark:search` to generate a fixed temporary Corpus and compare
the naive repeated Scope-pattern compilation baseline with the per-search
strategy. The benchmark warms both strategies, reports medians from multiple
samples, and verifies the deterministic reduction in Scope-pattern compilations.
It is explanatory evidence only: elapsed time is machine-dependent and does not
claim a universal production speedup.
