# PR #200 audit-only executable negative contracts

Tests are in `backend/qa_release/test_pr200_blockers.py`; CI is `.github/workflows/pr200_release_blocker_audit.yml`.
This is deliberately **test-only** with disposable SQLite, no production source, migrations, live Stripe, data or deployment changes.

Cases: B07 calendar event/work-note destination authorization; B33 legacy invoice tenant isolation with owner positive control; B36 roster-shift create authorization with owner positive control; F04-N2 shift cross-tenant/payment field; B06 organization calendar feed privacy; B15 synthetic signed provider cancellation-versus-fulfillment; F10-N5 ethical application POST.

Workflows fail if any negative contract is violated. A failing assertion is useful S3 Django behavior evidence but must be separated from fixture errors. Synthetic provider events do NOT prove Stripe sandbox settlement. Passing tests cannot establish project-wide 99% S2 or S3. Keep audit PR draft and do not auto-merge.
