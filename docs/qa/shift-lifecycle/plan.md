# Implementation plan — conditional phases

## Phase 0 (started): Evidence and questions
- Parent PR #181 exact head, base, code owners and existing QA harness documented.
- `JOURNEYS.md` tracks 48 initial scenarios, including existing source paths and unverified edge cases.
- `GRILL.md` holds the unresolved policy questions and pre-existing accepted decisions.
- No production changes pending business decisions.

## Phase 1: Reproduce correctness risks, without changing policy
- Build targeted tests for offer-payment selection and webhook types. First prove whether cancellation-payment webhook can incorrectly finalize waiting offers (SL-23).
- PostgreSQL concurrency tests for worker acceptance and finalization (SL-16, SL-24, SL-45), using distinct sessions and real DB constraints.
- API/role tests for generic DELETE in unfilled, unpaid, confirmed, paid, published-roster and protected financial states. **Do not invoke destructive operations against real records.**
- Capture actual observed defects and compare with confirmed business policy.

## Phase 2: Decision-driven fixes
- After D01–D03: implement only confirmed payment timeouts, lock release/reservation, late-webhook reconciliation in `shifts` and `billing`.
- After D04–D11: implement cancellation and replacement with existing Shift/Slot, audit, idempotent financial effects and cross-role notification. Avoid giant broad refactors.
- After D12–D15: reconcile reminders, attendance, timesheet/invoice/payroll, history and ratings.

## Phase 3: Cross-platform acceptance
- Django functional tests plus PostgreSQL lock/replay/concurrency and safe migration rehearsal.
- Real Next → Vite → Django browser journey with owner + worker + delegated admin, not merely mocked fixtures; screenshot, requests and state logs.
- Keep TesterArmy `agent.*` exploratory testing separate from deterministic Playwright. Translate confirmed discoveries into regression tests.
- Expo Android and iOS emulator/simulator, then separately label any required physical-device proof. Preserve kiosk acceptance.
- Use exact-head Senior Package Testing and `TESTING.md`; no production payments, deployments, merges, or staging migrations without approval.

## Architecture guardrails
No second business-rule engine. Reuse existing domain ownership: `shifts`, `billing`, `workforce/roster`, `attendance`, `invoicing/worker_finance`, `shared-core` client contract; never introduce a `team_calendar` booking ledger. Run targeted CI after each small domain-owned implementation.
