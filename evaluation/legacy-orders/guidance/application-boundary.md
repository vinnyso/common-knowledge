---
schema_version: 1
id: application-boundary
kind: pattern
title: Corrected workflows use application services and ports
triggers:
  - application service
  - reference import
  - dispatch export
  - transaction audit
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
  - docs/adr/0001-application-services.md
  - docs/architecture.md
  - src/test/java/com/northstar/orders/ReferenceTransactionIT.java
---

## Situation

Legacy controllers contain storage access and transaction ownership that can look like the local convention. ADR 0001 at application revision 67ee69584ce0122a26b017b2e559bed3cb5c90e8 identifies these as migration exceptions.

## Resolution

Verify the accepted ADR. New workflow handlers use web DTOs and application services, with application-owned ports and persistence adapters. Services own mutation transactions so the mutation and audit commit together. A successful happy path does not establish rollback: inspect the public ReferenceTransactionIT and test failure after the actual order write. Preserve storage state codes in adapters and leave unrelated legacy operations intact.
