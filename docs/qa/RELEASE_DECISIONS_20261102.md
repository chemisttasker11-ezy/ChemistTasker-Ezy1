# Release decision register — integration candidate (2 November 2026)

This is the owner decision list for the stack #211–#240, as integrated in the frozen candidate PR. None of these items
is a merge gate. Each one is settled in the full workflow grill sessions that follow, or else the affected feature
stays restricted until it is settled. **Before enabling** names the feature that must not reach production first.

| # | Decision | Current behaviour | Before enabling |
|---|---|---|---|
| 1 | D1: must companion/super invoices be approved before payment? | No approval guard. R1 is intentional: an owner may record payment made through other channels. | Companion invoice payment |
| 2 | Should confirmations on kiosk PIN setup and worker QR be tied to the session the worker saw? | They send only `confirm_opposite`. The kiosk PIN-clock path already binds `observed_session_id`. Fix shape: echo it and recheck in `clock_in`/`clock_out`. | Worker QR and PIN-setup clocking |
| 3 | Should a stale cover-terms dialog reload after 409 `TERMS_CHANGED`? | The server refuses with no write. The client shows an error and keeps the old preview. | — (UX only) |
| 4 | Should a paid orphan session after operator recovery book its work, or be refund-only? | It books only the work its attempt reclaimed. Work a replacement holds is ledgered for refund. Both outcomes are tested in `billing/test_checkout_reservations.py`. | Real card payments |
| 5 | Should paid work be released only by an explicit cancellation record? | It is released when assignment rows are gone (slotless offers: while their offer is still accepted). This needs a trace of every cancellation/delete path. | Real card payments |
| 6 | Should the node-forge 1.4.1 RSA patch be dropped? | It is kept as defence in depth. Clean 1.4.1 passes the repo regression without it. | — |
| 7 | Overnight deferred payroll activation | `activation_work_dates` checks the start date only. A 22:00–06:00 assignment whose finishing date falls in a LOCKED period still activates. Ordinary assignment writes include the next date. | Payroll activation for overnight work |
| 8 | Cancellation charging (`billing/shift_payments.py` `charge_penalty`) | Inherited behaviour: ambient timezone, every assignment on the shift, the submitted slot selection ignored, and no persisted obligation or idempotency key. `billing.test_cancellation_policy_evidence` characterises it. | Real cancellation payments |
| 9 | When should the minimatch 3.1.5 exception for GHSA-g3hv-75wg-m249 be removed? | The gate accepts only the fingerprinted root copy, which lacks the vulnerable `firstPhasePreProcess`. | Remove it when Expo/React Native leave glob 7 or the advisory range is corrected |

## Operational steps before real payments
- Drain and reconcile every pre-rollout collectible Stripe session, and verify the account prices.
- A stalled provider request cannot be proven stopped. Use the 48-hour floor plus a recorded operator reconciliation.
- Staging:
  - Back up the database first, then apply migrations: attendance 0007, billing 0005.
  - Record the deployed SHA and rollback artefact.
  - Run test-mode provider acceptance for checkout recovery, replay and refunds.
