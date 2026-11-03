# Release decision register — integration candidate (2 November 2026)

This is the owner decision list for the stack #211–#240, as integrated in the frozen candidate PR. None of these items
is a merge gate. Each one is settled in the full workflow grill sessions that follow, or else the affected feature
stays restricted until it is settled. **Before enabling** names the feature that must not reach production first.

| # | Decision | Current behaviour | Before enabling |
|---|---|---|---|
| 1 | D1: must companion/super invoices be approved before payment? | No approval guard. R1 is intentional: an owner may record payment made through other channels. | Companion invoice payment |
| 2 | Should confirmations on kiosk PIN setup and worker QR be tied to the session the worker saw? | Implemented, pending owner workflow grill: worker QR and PIN setup echo `expected_action` and `observed_session_id`; the transitions recheck the session under their existing locks. Missing or stale confirmation context is refused with 409. | Worker QR and PIN-setup clocking |
| 3 | Should a stale cover-terms dialog reload after 409 `TERMS_CHANGED`? | Implemented, pending owner workflow grill: the server refuses with no write; web/mobile discard the stale preview, reload current terms and require both agreements again. A failed reload offers retry without stale acceptance. | — (UX only) |
| 4 | Should a paid orphan session after operator recovery book its work, or be refund-only? | It books only the work its attempt reclaimed. Work a replacement holds is ledgered for refund. Both outcomes are tested in `billing/test_checkout_reservations.py`. | Real card payments |
| 5 | Should paid work be released only by an explicit cancellation record? | It is released when assignment rows are gone (slotless offers: while their offer is still accepted). This needs a trace of every cancellation/delete path. | Real card payments |
| 6 | Should the node-forge 1.4.1 RSA patch be dropped? | It is kept as defence in depth. Clean 1.4.1 passes the repo regression without it. | — |
| 7 | Overnight deferred payroll activation | At the deferred activation endpoint, selected start and finishing work dates are checked against existing periods. A LOCKED finishing date refuses activation and rolls back offer/assignment writes in the same transaction. See [freeze scope and other assignment writers](PAYROLL_PERIOD_FREEZE_20261030.md) for concurrent period creation, later finalization and cover paths outside this fix. | Cross-writer/concurrent-period acceptance remains required for a general payroll-freeze guarantee |
| 8 | Cancellation charging (`billing/shift_payments.py` `charge_penalty`) | Inherited behaviour: ambient timezone, every assignment on the shift, the submitted slot selection ignored, and no persisted obligation or idempotency key. `billing.test_cancellation_policy_evidence` characterises it. | Real cancellation payments |
| 9 | When should the minimatch 3.1.5 exception for GHSA-g3hv-75wg-m249 be removed? | The gate accepts only the fingerprinted root copy, which lacks the vulnerable `firstPhasePreProcess`. | Remove it when Expo/React Native leave glob 7 or the advisory range is corrected |

New live shift fulfillment and penalty collection are now closed by default through separate server-side capabilities; see [the live collection guard matrix](LIVE_SHIFT_COLLECTION_GUARDS.md). Resolve the payment-policy decisions and provider acceptance before enabling either capability. Existing signed payment accounting remains active.

## Operational steps before real payments
- Drain and reconcile every pre-rollout collectible Stripe session, and verify the account prices.
- A stalled provider request cannot be proven stopped. Use the 48-hour floor plus a recorded operator reconciliation.
- Staging:
  - Back up the database first, then apply migrations: attendance 0007, billing 0005.
  - Record the deployed SHA and rollback artefact.
  - Run test-mode provider acceptance for checkout recovery, replay and refunds.

## Session-bound attendance rollout

Ship the mobile build that echoes `expected_action` and `observed_session_id` first, and complete and record mobile adoption acceptance before promoting this backend artifact to production. There is no automatic minimum-version gate in this release. Deployment itself enforces session-bound confirmation; there is no separate enable switch. Deploy the web and kiosk bundles with that backend release; refresh any already-open kiosk page. A legacy mobile build sends only `confirm_opposite` and safely receives 409 until it updates (or the 60-second double-clock window expires). Do not weaken the server check to support old confirmation intent. Staging acceptance must exercise both the updated clients and this legacy refusal path.

A confirmed request whose success response is lost may receive `STALE_CONFIRMATION` on retry. That refusal writes nothing; web/mobile reload current attendance and require a fresh user action. The server intentionally keeps the session check before duplicate replay: this release does not weaken confirmation authority to manufacture a repeated 200 response.
