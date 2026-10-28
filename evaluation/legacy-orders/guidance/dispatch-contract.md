---
schema_version: 1
id: dispatch-contract
kind: gotcha
title: Dispatch eligibility combines local business time and account controls
triggers:
  - dispatch export
  - businessDate
  - warehouse cutoff
scope:
  paths:
    - src/main/java/com/northstar/orders/legacy/web/**
    - src/main/java/com/northstar/orders/web/**
    - src/main/java/com/northstar/orders/application/**
    - src/main/java/com/northstar/orders/persistence/**
status: active
created_at: 2026-10-27T00:00:00Z
created_by: ck-evaluation-author
sources:
  - docs/warehouse.md
  - docs/account-controls.md
  - CONTEXT.md
---

## Situation

The initial exporter uses a UTC spreadsheet cutoff and a state-only query. Current warehouse and account-control documents at application revision 67ee69584ce0122a26b017b2e559bed3cb5c90e8 carry additional constraints.

## Resolution

Verify the public contracts: allocated warehouse orders are eligible only without an order hold and without a customer credit block. A hold differs from a warehouse state; credit blocks belong to customers. Use the requested New York business day's inclusive 17:00 cutoff with daylight saving, not machine timezone or a fixed UTC offset. Invoice visibility has a different purpose and should retain its own rules.
