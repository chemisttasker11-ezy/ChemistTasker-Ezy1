# Phase 6 exact-head finance & revocation acceptance matrix

The PR201 CI workflow `.github/workflows/pr201_finance_revocation_acceptance.yml`
executes focused real Django chat/notification socket and finance tests on
SQLite, and separately runs B10/B57/B69 against **actual PostgreSQL 16** on
two independent connections. It records immutable commit SHA and archives
test traces. No product schema migration was edited; CI creates disposable
test databases as part of executing these isolated tests.

Positive/negative contracts:
- B10: same owner, two distinct pending shifts, funds for only one:
  exactly one successful payment; second must receive insufficient balance,
  no negative ledger, no double settlement.
- B69: two different signed synthetic provider event IDs with the exact
  same payment intent: one financial ledger row and both processed receipts.
- B57: partial and full charge refunds arriving concurrently preserve
  cumulative maximum, never downgrade fully refunded state.
- Chat: revocation during open socket denies message/typing even if
  Membership was bulk-updated with no signal; inactive user receives no
  notifications.

Stripe's signature is mocked at the official provider boundary only; the
actual Django webhook, models and financial transactions remain real.
Test results are unverified until CI for the matching SHA passes. This
does not replace a real provider Stripe test-mode acceptance exercise.
Production remains NO-GO.
