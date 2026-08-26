# Billing service fixture

This small Java 21 Maven project is the cross-language fixture for the Common
Knowledge prototype. It models customer billing periods and intentionally starts
with an unresolved behavior for a later agent exercise.

Run the fixture tests from this directory:

```sh
./mvnw test
```

The untouched fixture has one failing behavior test. That failure is deliberate:
it is the starting point for the Agent A task, not a CI requirement for this
repository. The test forces its own environments, so its result does not depend
on the developer machine's timezone.

## Domain

`CustomerAccount` owns invoices. `BillingCycle` calculates the close date for a
customer statement, and `Invoice` records an amount due within that cycle. The
fixture has no application framework, persistence, network calls, or service
dependencies.

## Later exercises

- [Agent A task](tasks/agent-a.md)
- [Agent B task](tasks/agent-b.md)

Follow this repository's `AGENTS.md` before starting either task.
