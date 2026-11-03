# PR200 Phase 5 S2 — billing and chat model/test/migration follow-up

**Baseline:** `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. **Reviewer independence:** original `claudeB-1` C004 source pass vs current second reader; 8 distinct full-file reads, no inference from a first-pass row. Evidence in `S2_INDEPENDENT_CERTIFICATIONS_20261025.json`. Frozen source blob SHAs match ledger. No product, migration, finance model or deploy change in this commit.

**Scope findings:**

- Billing models: owner/org XOR constraint and webhook event-id dedup persist, but `ShiftPayment.owner` CASCADE creates payment-record retention risk (C004-N5). Current `ShiftPayment.status` cannot express refund; B57 remains conditional on other finance adapters.
- Billing tests: 326-line HTTP/SQL test suite checks webhook rollback/replay and payer authority. It does **not** prove correct subscriber pricing, subscription event ordering or provider refund bookkeeping (B01/B53/B57).
- Chat migration 0001: `SeparateDatabaseAndState` avoids recreating chat tables, while `RunPython(move_content_types)` changes `django_content_type` rows. Thus 'no SQL' is inaccurate; populated DB contenttype collision and existing FK preservation need PostgreSQL acceptance.
- Chat migrations 0002/0003: index/table renames and custom `RenameDatabaseNames` DDL, not row migration. Verified guard behavior from `core/migration_operations.py`; need fresh and populated PG rehearsals.
- Chat REST tests: validate DM and community access, edit/delete and reactions, but omit custom-group cross-pharmacy user enumeration (C004-N1).
- Chat WS tests: validate AHPRA suspension and basic participant connect/send but not revocation mid-connection (B05/B51). B05-specific targeted Actions are separate and must not be called passing before result inspection.

**Quantitative accounting:** 42/2149 independently source-reviewed full-file certificates (1.9544%); 2,128 required for 99%, 2086 still required. The other files remain first-pass reported or acquired only. S2 certification means inspected, not safe or fixed. Runtime findings count remains 54 distinct / 62 red assertions, no new S3 events counted here.
