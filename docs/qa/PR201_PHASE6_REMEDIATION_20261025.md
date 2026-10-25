# PR201 Phase 6 remediation evidence — 25 October 2026

PR201 head before this batch: `021d801d71b38279be08ca7f11b0137c9c7c786c`, main `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. PR200 remains audit-only and Phase 5 S2 is not certified.

## B35 roster owner write boundary
Source finding: authenticated owner of a different pharmacy could POST an assignment via `/api/v1/roster-owner/`, bypassing the read queryset. Audit evidence: [40191740013](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40191740013).

Repair: use the roster capability authority, reject cross-shift slot references, mismatched worker roles/memberships and invalid occurrence dates; prevent moving existing assignments to other shifts/slots. Existing published-roster lock and read permissions remain.

Added six Django positive/negative regression cases in `backend/qa_release/test_pr201_phase6_roster.py`, wired into `release_blocker_regressions.yml`. Status: **IMPLEMENTED, awaiting exact-head CI verification**. No migration or deployment.

Next: B24 exchange state guard, B25 audience atomicity, B31 ethical receipt serialization + real PG locking; retain NO-GO.
