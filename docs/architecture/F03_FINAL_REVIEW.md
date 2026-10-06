# F03 final review checkpoint - 2026-10-06

This checkpoint resumes the authorized production-finalization programme. It does not declare F04-F07 complete or approve a merge before the checks below finish.

## Integrated source

- Current main: 6add2bdd81689a619ba9e6f29ed5d5c208a5ff18 (F01 roster correction and independent attendance locking correction merged).
- Reconciled F03 implementation head before this documentation-only commit: ec529306f39ba3d1a5c5e643a5d623c78322d929.
- F03 is now based on current main, not waiting for the old F01 branch to merge.
- No new model, table, migration, route, billing-policy or workflow change is introduced by the serializer extraction.

## Evidence already recorded for the reconciled implementation

- Shared Core Consolidation: 37395735922, success.
- Backend Finalization Contracts: 37395735054, success.
- Serializer Decomposition Contracts: 37395735183, SQLite and PostgreSQL success.
- Public Repository Security: 37395735239, success.
- The six earlier PostgreSQL fingerprint mismatches were checked against the ORIGINAL unsplit definitions under PostgreSQL. They are database-derived integer bounds, not changes introduced by the extraction. Per-vendor field contracts retain this distinction.
- The independent nullable-join attendance locking defect was corrected and tested in PR #143, not hidden in the structural extraction.

## Remaining merge checks

1. Re-read the public facades, all moved definitions and their AST mapping against main.
2. Confirm migration and HTTP files are unchanged, 999 threshold retained, and original large-module exceptions removed.
3. Run the exact new head through the normal integration/finalization/serializer workflows and CodeQL. No CodeQL run was returned for the previous reconciled head; it must not be inferred from another branch.
4. Review unresolved PR comments and compare current main immediately before a guarded merge.
5. Re-test the eventual combined F02 runtime plus F03 tree; this extraction does not authorize an unexplained serializer contract change caused by a dependency update.

## Boundaries

This branch does not incorporate PR #139's different billing-payer policy. Preserve the owner's confirmed Owner + Org Admin platform-billing rule and capability-based workforce management. Preserve Daphne, Celery task names, request isolation and native kiosk credentials. Local source/runtime recovery uses only tracked source and public installed test packages; temporary recovery workflow files are not part of the release tree.
