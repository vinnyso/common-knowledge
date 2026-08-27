# Billing service fixture

This small Java 21 Maven project is the cross-language fixture for the Common
Knowledge prototype. It models customer billing periods and includes later agent
exercises based on realistic maintenance reports.

Run the fixture tests from this directory:

```sh
./mvnw test
```

The untouched fixture is a healthy baseline: this command passes before either
later exercise begins.

## Domain

`CustomerAccount` owns invoices. `BillingCycle` calculates the close date for a
customer statement, and `Invoice` records an amount due within that cycle. The
fixture has no application framework, persistence, network calls, or service
dependencies.

## Later exercises

- [Agent A task](tasks/agent-a.md)
- [Agent B task](tasks/agent-b.md)
- [Clean-clone two-agent handoff runbook](../../docs/two-agent-handoff.md)

Follow this repository's `AGENTS.md` before starting either task.
