---
schema_version: 1
id: reference-contract
kind: gotcha
title: Customer-reference decisions supersede integration-era limits
triggers:
  - customer reference
  - reference import
  - customerReference
scope:
  paths:
    - src/main/java/com/northstar/orders/legacy/web/**
    - src/main/java/com/northstar/orders/web/**
    - src/main/java/com/northstar/orders/application/**
    - src/main/java/com/northstar/orders/persistence/**
    - src/main/java/com/northstar/orders/domain/**
status: active
created_at: 2026-10-27T00:00:00Z
created_by: ck-evaluation-author
sources:
  - docs/adr/0002-customer-reference-contract.md
  - src/main/java/com/northstar/orders/domain/CustomerReference.java
---

## Situation

The import adapter and integration notes still carry a 20-character limit. The accepted reference decision at application revision 67ee69584ce0122a26b017b2e559bed3cb5c90e8 supersedes that limit.

## Resolution

Verify ADR 0002 and CustomerReference against the checkout. Normalize surrounding whitespace before applying the current 1..40 character contract; preserve case, leading zeros and internal spaces. Do not truncate or convert identifiers to numbers. The current amendment route and its transaction test provide public examples of reference mutation and audit.
