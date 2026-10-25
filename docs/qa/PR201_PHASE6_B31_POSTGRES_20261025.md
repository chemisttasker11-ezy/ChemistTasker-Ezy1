# PR201 Phase 6 — B31 exclusive ethical listing reservation

Audit provenance: PR200 run [40192236075](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40192236075). Original concurrency audit needed a test-only DRF JSON serializer substitution; that is not acceptable as final proof.

Implementation:
- Lock the single ethical listing row with `select_for_update()` in the same transaction as stock/transfer creation; under that lock recheck `PUBLISHED`, policy, and receipt.
- Preserve legitimate retry of the original request ID after listing becomes RESERVED; reject mismatched payload reuses.
- Convert full `TransferSerializer` output through `JSONRenderer` into JSON-native values before persisting the receipt; no test-only serializer patch.
- Reject negative or unallocated lot quantities before writing.
- Add a PostgreSQL 16 job that tests the actual handler with two database connections, two independently allocated lots, and no serializer substitution; plus JSON receipt, replay and sequential controls.

**State:** implementation committed; must inspect exact-head CI before calling B31 VERIFIED. No migration, real ethical medicine/stock, deployment, or PR200 changes. Release remains NO-GO.
